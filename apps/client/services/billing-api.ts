import { authenticatedFetch } from './authenticated-fetch';
import { API_BASE_URL } from './platforms';
import type { ServerBillingSummary } from './billing-types';

export async function getServerBillingSummary(): Promise<ServerBillingSummary> {
  const response = await authenticatedFetch(`${API_BASE_URL}/billing`);
  const payload = (await response.json()) as { data?: ServerBillingSummary; error?: string };
  if (!response.ok || !payload.data)
    throw new Error(payload.error || 'Could not load billing status.');
  return payload.data;
}

export async function refreshServerBillingSummary(): Promise<ServerBillingSummary> {
  const response = await authenticatedFetch(`${API_BASE_URL}/billing/refresh`, { method: 'POST' });
  const payload = (await response.json()) as { data?: ServerBillingSummary; error?: string };
  if (!response.ok || !payload.data)
    throw new Error(payload.error || 'Could not refresh billing status.');
  return payload.data;
}
