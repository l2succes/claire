import Bull, { Queue, Job } from 'bull';
import { redisConfig } from '../config';
import { logger } from '../utils/logger';
import { IncomingMessage } from './message-ingestion';
import { aiProcessor } from './ai-processor';
import { promiseDetector } from './promise-detector';
import { contactInference } from './contact-inference';

interface MessageJob {
  type: 'process_message' | 'generate_response' | 'detect_promise' | 'infer_contact';
  data: any;
  sessionId: string;
  userId: string;
}

class MessageQueueService {
  private queues: Map<string, Queue> = new Map();
  
  constructor() {
    this.initializeQueues();
  }

  /**
   * Initialize all queues
   */
  private initializeQueues() {
    // Main message processing queue
    this.createQueue('messages', this.processMessageJob.bind(this));
    
    // AI response generation queue
    this.createQueue('ai-responses', this.processAIResponseJob.bind(this));
    
    // Promise detection queue
    this.createQueue('promise-detection', this.processPromiseDetectionJob.bind(this));
    
    // Contact inference queue
    this.createQueue('contact-inference', this.processContactInferenceJob.bind(this));
    
    // Media processing queue
    this.createQueue('media-processing', this.processMediaJob.bind(this));
  }

  /**
   * Create and configure a queue
   */
  private createQueue(name: string, processor: (job: Job) => Promise<any>) {
    const queue = new Bull(name, {
      redis: {
        host: redisConfig.host,
        port: redisConfig.port,
        password: redisConfig.password,
      },
      defaultJobOptions: {
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 50, // Keep last 50 failed jobs
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });

    // Add processor
    queue.process(processor);

    // Event listeners
    queue.on('completed', (job) => {
      logger.info(`Job ${job.id} in queue ${name} completed`);
    });

    queue.on('failed', (job, err) => {
      logger.error(`Job ${job.id} in queue ${name} failed:`, err);
    });

    queue.on('stalled', (job) => {
      logger.warn(`Job ${job.id} in queue ${name} stalled`);
    });

    this.queues.set(name, queue);
    logger.info(`Queue ${name} initialized`);
  }

  /**
   * Add message to processing queue
   */
  async addMessage(message: IncomingMessage) {
    const queue = this.queues.get('messages');
    if (!queue) throw new Error('Messages queue not initialized');

    const job = await queue.add({
      type: 'process_message',
      data: {
        messageId: message.message.id._serialized,
        sessionId: message.sessionId,
        userId: message.userId,
        content: message.message.body,
        fromMe: message.message.fromMe,
        timestamp: message.timestamp,
        chatType: message.chat.isGroup ? 'group' : 'individual',
        contactId: message.contact?.id._serialized,
      },
      sessionId: message.sessionId,
      userId: message.userId,
    } as MessageJob, {
      priority: message.message.fromMe ? 2 : 1, // Lower priority for sent messages
    });

    logger.info(`Message ${message.message.id._serialized} added to queue`);
    return job;
  }

  /**
   * Process message job
   */
  private async processMessageJob(job: Job<MessageJob>) {
    const { data, sessionId, userId } = job.data;
    
    try {
      logger.info(`Processing message ${data.messageId}`);
      
      // Don't process messages from self
      if (data.fromMe) {
        logger.debug(`Skipping self message ${data.messageId}`);
        return { processed: false, reason: 'self_message' };
      }

      // Create sub-jobs for different processing tasks
      const promises = [];

      // 1. Generate AI response suggestion
      if (!data.fromMe) {
        promises.push(
          this.addAIResponseJob({
            messageId: data.messageId,
            content: data.content,
            sessionId,
            userId,
            chatType: data.chatType,
          })
        );
      }

      // 2. Detect promises/commitments
      promises.push(
        this.addPromiseDetectionJob({
          messageId: data.messageId,
          content: data.content,
          sessionId,
          userId,
          fromMe: data.fromMe,
        })
      );

      // 3. Infer contact identity
      if (data.contactId && !data.fromMe) {
        promises.push(
          this.addContactInferenceJob({
            contactId: data.contactId,
            messageContent: data.content,
            sessionId,
            userId,
          })
        );
      }

      await Promise.all(promises);
      
      return { 
        processed: true, 
        messageId: data.messageId,
        subJobs: promises.length,
      };
    } catch (error) {
      logger.error(`Error processing message ${data.messageId}:`, error);
      throw error;
    }
  }

  /**
   * Add AI response generation job
   */
  private async addAIResponseJob(data: any) {
    const queue = this.queues.get('ai-responses');
    if (!queue) throw new Error('AI responses queue not initialized');

    return await queue.add({
      type: 'generate_response',
      data,
      sessionId: data.sessionId,
      userId: data.userId,
    } as MessageJob, {
      delay: 1000, // Delay 1 second to allow for more context
    });
  }

  /**
   * Process AI response job
   */
  private async processAIResponseJob(job: Job<MessageJob>) {
    const { data } = job.data;
    
    try {
      logger.info(`Generating AI response for message ${data.messageId}`);
      
      // This will be implemented in ai-processor.ts
      const response = await aiProcessor.generateResponse(
        data.messageId,
        data.content,
        data.userId,
        data.chatType
      );
      
      return response;
    } catch (error) {
      logger.error(`Error generating AI response:`, error);
      throw error;
    }
  }

  /**
   * Add promise detection job
   */
  private async addPromiseDetectionJob(data: any) {
    const queue = this.queues.get('promise-detection');
    if (!queue) throw new Error('Promise detection queue not initialized');

    return await queue.add({
      type: 'detect_promise',
      data,
      sessionId: data.sessionId,
      userId: data.userId,
    } as MessageJob);
  }

  /**
   * Process promise detection job
   */
  private async processPromiseDetectionJob(job: Job<MessageJob>) {
    const { data } = job.data;
    
    try {
      logger.info(`Detecting promises in message ${data.messageId}`);
      
      // This will be implemented in promise-detector.ts
      const promises = await promiseDetector.detectPromises(
        data.messageId,
        data.content,
        data.userId,
        data.fromMe
      );
      
      return { detected: promises.length, promises };
    } catch (error) {
      logger.error(`Error detecting promises:`, error);
      throw error;
    }
  }

  /**
   * Add contact inference job
   */
  private async addContactInferenceJob(data: any) {
    const queue = this.queues.get('contact-inference');
    if (!queue) throw new Error('Contact inference queue not initialized');

    return await queue.add({
      type: 'infer_contact',
      data,
      sessionId: data.sessionId,
      userId: data.userId,
    } as MessageJob, {
      delay: 5000, // Delay to batch multiple messages
    });
  }

  /**
   * Process contact inference job
   */
  private async processContactInferenceJob(job: Job<MessageJob>) {
    const { data } = job.data;
    
    try {
      logger.info(`Inferring contact identity for ${data.contactId}`);
      
      // This will be implemented in contact-inference.ts
      const inference = await contactInference.inferIdentity(
        data.contactId,
        data.messageContent,
        data.userId
      );
      
      return inference;
    } catch (error) {
      logger.error(`Error inferring contact:`, error);
      throw error;
    }
  }

  /**
   * Process media job
   */
  private async processMediaJob(job: Job) {
    const { messageId, mediaUrl, mediaType } = job.data;
    
    try {
      logger.info(`Processing media for message ${messageId}`);
      
      // Media processing logic (compression, thumbnails, etc.)
      // This is a placeholder for future implementation
      
      return { processed: true, messageId };
    } catch (error) {
      logger.error(`Error processing media:`, error);
      throw error;
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(queueName: string) {
    const queue = this.queues.get(queueName);
    if (!queue) throw new Error(`Queue ${queueName} not found`);

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return {
      name: queueName,
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + delayed,
    };
  }

  /**
   * Get all queue statistics
   */
  async getAllQueueStats() {
    const stats = [];
    
    for (const [name] of this.queues) {
      stats.push(await this.getQueueStats(name));
    }
    
    return stats;
  }

  /**
   * Clear a queue
   */
  async clearQueue(queueName: string) {
    const queue = this.queues.get(queueName);
    if (!queue) throw new Error(`Queue ${queueName} not found`);

    await queue.empty();
    logger.info(`Queue ${queueName} cleared`);
  }

  /**
   * Pause a queue
   */
  async pauseQueue(queueName: string) {
    const queue = this.queues.get(queueName);
    if (!queue) throw new Error(`Queue ${queueName} not found`);

    await queue.pause();
    logger.info(`Queue ${queueName} paused`);
  }

  /**
   * Resume a queue
   */
  async resumeQueue(queueName: string) {
    const queue = this.queues.get(queueName);
    if (!queue) throw new Error(`Queue ${queueName} not found`);

    await queue.resume();
    logger.info(`Queue ${queueName} resumed`);
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    logger.info('Shutting down message queues...');
    
    for (const [name, queue] of this.queues) {
      await queue.close();
      logger.info(`Queue ${name} closed`);
    }
  }
}

// Export singleton instance
export const messageQueue = new MessageQueueService();