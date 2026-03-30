import dotenv from 'dotenv';
import { z } from 'zod';
import path from 'path';

// Load .env from the server directory regardless of CWD
dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config(); // fallback to CWD .env

// Environment schema validation
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().default('3000').transform(Number),
  
  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string(),
  SUPABASE_SERVICE_KEY: z.string(),
  DATABASE_URL: z.string().url(),
  DIRECT_DATABASE_URL: z.string().url().optional(),
  
  // OpenAI
  OPENAI_API_KEY: z.string(),
  OPENAI_MODEL: z.string().default('gpt-4-turbo-preview'),
  
  // Redis — Railway provides REDIS_URL; local dev uses REDIS_HOST/PORT
  REDIS_URL: z.string().optional(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().default('6379').transform(Number),
  REDIS_PASSWORD: z.string().optional(),
  
  // WhatsApp
  WHATSAPP_SESSION_PATH: z.string().default('./session'),
  PUPPETEER_HEADLESS: z.string().default('false').transform((val) => val === 'true'),
  
  // Security
  JWT_SECRET: z.string(),
  ENCRYPTION_KEY: z.string(),
  
  // Monitoring
  SENTRY_DSN: z.string().url().optional(),

  // Platform Configuration
  TELEGRAM_ENABLED: z.string().default('true').transform((val) => val === 'true'),
  IMESSAGE_ENABLED: z.string().default('true').transform((val) => val === 'true'),
  INSTAGRAM_ENABLED: z.string().default('true').transform((val) => val === 'true'),

  // Platform Mode: 'direct' uses native adapters, 'matrix' uses bridges
  PLATFORM_MODE: z.enum(['direct', 'matrix']).default('direct'),

  // Matrix Configuration (required when PLATFORM_MODE=matrix)
  MATRIX_HOMESERVER_URL: z.string().url().optional(),
  MATRIX_SERVER_NAME: z.string().optional(),
  MATRIX_ADMIN_TOKEN: z.string().optional(),
  MATRIX_BOT_USER_ID: z.string().optional(),

  // Telegram API (required for mautrix-telegram bridge)
  TELEGRAM_API_ID: z.string().optional(),
  TELEGRAM_API_HASH: z.string().optional(),
});

// Parse and validate environment variables
const parseEnv = () => {
  try {
    const env = envSchema.parse(process.env);

    // Validate matrix config when in matrix mode
    if (env.PLATFORM_MODE === 'matrix') {
      if (!env.MATRIX_HOMESERVER_URL) {
        throw new Error('MATRIX_HOMESERVER_URL is required when PLATFORM_MODE=matrix');
      }
      if (!env.MATRIX_SERVER_NAME) {
        throw new Error('MATRIX_SERVER_NAME is required when PLATFORM_MODE=matrix');
      }
    }

    return env;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Invalid environment variables:');
      error.errors.forEach((err) => {
        console.error(`  ${err.path.join('.')}: ${err.message}`);
      });
      process.exit(1);
    }
    if (error instanceof Error) {
      console.error(`❌ Configuration error: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
};

export const config = parseEnv();

// Export typed config sections for convenience
export const supabaseConfig = {
  url: config.SUPABASE_URL,
  anonKey: config.SUPABASE_ANON_KEY,
  serviceKey: config.SUPABASE_SERVICE_KEY,
};

export const redisConfig = config.REDIS_URL
  ? { url: config.REDIS_URL }
  : { host: config.REDIS_HOST, port: config.REDIS_PORT, password: config.REDIS_PASSWORD };

export const whatsappConfig = {
  sessionPath: config.WHATSAPP_SESSION_PATH,
  puppeteerHeadless: config.PUPPETEER_HEADLESS,
};

export const openaiConfig = {
  apiKey: config.OPENAI_API_KEY,
  model: config.OPENAI_MODEL,
};

export const platformConfig = {
  whatsapp: {
    enabled: true,
    sessionPath: config.WHATSAPP_SESSION_PATH,
    puppeteerHeadless: config.PUPPETEER_HEADLESS,
  },
  telegram: {
    enabled: config.TELEGRAM_ENABLED,
  },
  imessage: {
    enabled: config.IMESSAGE_ENABLED && process.platform === 'darwin',
  },
  instagram: {
    enabled: config.INSTAGRAM_ENABLED,
  },
};

export const matrixConfig = {
  enabled: config.PLATFORM_MODE === 'matrix',
  mode: config.PLATFORM_MODE,
  homeserverUrl: config.MATRIX_HOMESERVER_URL,
  serverName: config.MATRIX_SERVER_NAME,
  adminToken: config.MATRIX_ADMIN_TOKEN,
  botUserId: config.MATRIX_BOT_USER_ID,
  telegram: {
    apiId: config.TELEGRAM_API_ID,
    apiHash: config.TELEGRAM_API_HASH,
  },
};