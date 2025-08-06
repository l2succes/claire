import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv.config();

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
  
  // Redis
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
});

// Parse and validate environment variables
const parseEnv = () => {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Invalid environment variables:');
      error.errors.forEach((err) => {
        console.error(`  ${err.path.join('.')}: ${err.message}`);
      });
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

export const redisConfig = {
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  password: config.REDIS_PASSWORD,
};

export const whatsappConfig = {
  sessionPath: config.WHATSAPP_SESSION_PATH,
  puppeteerHeadless: config.PUPPETEER_HEADLESS,
};

export const openaiConfig = {
  apiKey: config.OPENAI_API_KEY,
  model: config.OPENAI_MODEL,
};