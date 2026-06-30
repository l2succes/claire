// Set required environment variables before any module is loaded.
// This prevents config/index.ts from calling process.exit(1) in test environments.
process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.DATABASE_URL = 'postgresql://postgres:test@localhost:5432/test';
process.env.JWT_SECRET = 'test-jwt-secret-key-minimum-32-chars-long';
process.env.ENCRYPTION_KEY = 'test-encryption-key-32-chars-long!!';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
