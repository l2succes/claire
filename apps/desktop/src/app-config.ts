import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Endpoints the main process calls, written at build time by
 * scripts/write-app-config.ts. Requests from the renderer never choose where
 * the main process sends credentials or local data.
 */
export interface AppConfig {
  apiUrl: string;
  /** Supabase Auth host, the only host whose sign-in popup stays in-app. */
  supabaseHost: string | null;
}

function httpUrl(value: unknown): URL | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

function loadAppConfig(): AppConfig {
  let file: Record<string, unknown> = {};
  try {
    file = JSON.parse(fs.readFileSync(path.join(__dirname, 'app-config.json'), 'utf8'));
  } catch {
    // Missing in an unbuilt checkout; fall through to the client's default.
  }
  // An unpackaged run may point at another server without rebuilding.
  const override = app.isPackaged ? undefined : process.env.CLAIRE_API_URL;
  const api = httpUrl(override) ?? httpUrl(file.apiUrl) ?? new URL('http://localhost:3001');
  return {
    apiUrl: api.toString().replace(/\/$/, ''),
    supabaseHost: httpUrl(file.supabaseUrl)?.hostname ?? null,
  };
}

export const appConfig: AppConfig = loadAppConfig();

/** Replace whatever API URL a renderer request carries with the configured one. */
export function withConfiguredApiUrl(request: unknown): unknown {
  if (!request || typeof request !== 'object') return request;
  return { ...request, apiUrl: appConfig.apiUrl };
}
