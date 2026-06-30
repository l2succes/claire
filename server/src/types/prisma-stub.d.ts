// Stub for legacy prisma references — these files have not yet been migrated to Supabase.
// TODO: remove this file once messages.ts and message-ingestion.ts are fully migrated.
type PrismaModel = {
  findFirst: (args: unknown) => Promise<Record<string, unknown>>;
  findMany: (args: unknown) => Promise<Record<string, unknown>[]>;
  count: (args?: unknown) => Promise<number>;
  create: (args: unknown) => Promise<Record<string, unknown>>;
  update: (args: unknown) => Promise<Record<string, unknown>>;
  upsert: (args: unknown) => Promise<Record<string, unknown>>;
  delete: (args: unknown) => Promise<Record<string, unknown>>;
};
declare const prisma: {
  message: PrismaModel;
  contact: PrismaModel;
  group: PrismaModel;
  $queryRaw: (...args: unknown[]) => Promise<Record<string, unknown>[]>;
};
