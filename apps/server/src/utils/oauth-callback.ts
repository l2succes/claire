export type OAuthClient = 'mobile' | 'desktop';

function requestedClient(value: unknown): OAuthClient | null {
  if (value === 'mobile' || value === 'desktop') return value;
  return null;
}

export function resolveOAuthClient(client: unknown, userAgent = ''): OAuthClient {
  const explicitClient = requestedClient(client);
  if (explicitClient) return explicitClient;

  return /iPhone|iPad|iPod|Android/i.test(userAgent) ? 'mobile' : 'desktop';
}

export function buildOAuthCallbackUrl(options: {
  client?: unknown;
  userAgent?: string;
  code?: string | null;
  error?: string | null;
  errorDescription?: string | null;
}): string {
  const client = resolveOAuthClient(options.client, options.userAgent);
  const callback = new URL(
    client === 'mobile'
      ? 'claire://confirm'
      : 'clairedesktop://auth/callback',
  );

  if (options.code) callback.searchParams.set('code', options.code);
  if (options.error) callback.searchParams.set('error', options.error);
  if (options.errorDescription) {
    callback.searchParams.set('error_description', options.errorDescription);
  }

  return callback.toString();
}
