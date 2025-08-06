import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

// Create a singleton instance of PrismaClient
class PrismaService {
  private static instance: PrismaClient | null = null;

  static getInstance(): PrismaClient {
    if (!this.instance) {
      this.instance = new PrismaClient({
        log: [
          { level: 'query', emit: 'event' },
          { level: 'error', emit: 'event' },
          { level: 'warn', emit: 'event' },
        ],
      });

      // Log queries in development
      if (process.env.NODE_ENV === 'development') {
        this.instance.$on('query' as any, (e: any) => {
          logger.debug(`Query: ${e.query}`);
          logger.debug(`Params: ${e.params}`);
          logger.debug(`Duration: ${e.duration}ms`);
        });
      }

      // Log errors
      this.instance.$on('error' as any, (e: any) => {
        logger.error('Prisma error:', e);
      });

      // Log warnings
      this.instance.$on('warn' as any, (e: any) => {
        logger.warn('Prisma warning:', e);
      });
    }

    return this.instance;
  }

  static async disconnect(): Promise<void> {
    if (this.instance) {
      await this.instance.$disconnect();
      this.instance = null;
      logger.info('Prisma disconnected');
    }
  }
}

// Export the singleton instance
export const prisma = PrismaService.getInstance();

// Helper functions for common operations
export const prismaHelpers = {
  /**
   * Execute a transaction with retry logic
   */
  async withRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        logger.warn(`Transaction attempt ${i + 1} failed:`, error.message);
        
        if (i < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
        }
      }
    }
    
    throw lastError;
  },

  /**
   * Soft delete with timestamp
   */
  softDelete(tableName: string) {
    return {
      deletedAt: new Date(),
    };
  },

  /**
   * Check if record exists
   */
  async exists(model: any, where: any): Promise<boolean> {
    const count = await model.count({ where });
    return count > 0;
  },

  /**
   * Batch insert with chunking
   */
  async batchInsert<T>(
    model: any,
    data: T[],
    chunkSize: number = 100
  ): Promise<number> {
    let inserted = 0;
    
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);
      const result = await model.createMany({
        data: chunk,
        skipDuplicates: true,
      });
      inserted += result.count;
    }
    
    return inserted;
  },

  /**
   * Paginated query helper
   */
  async paginate(
    model: any,
    {
      page = 1,
      limit = 20,
      where = {},
      orderBy = {},
      include = {},
    }: {
      page?: number;
      limit?: number;
      where?: any;
      orderBy?: any;
      include?: any;
    }
  ) {
    const skip = (page - 1) * limit;
    
    const [total, items] = await Promise.all([
      model.count({ where }),
      model.findMany({
        where,
        orderBy,
        include,
        skip,
        take: limit,
      }),
    ]);
    
    return {
      items,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  },
};

// Graceful shutdown
process.on('beforeExit', async () => {
  await PrismaService.disconnect();
});