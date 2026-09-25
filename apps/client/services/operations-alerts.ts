import { API_BASE_URL } from './platforms';
import { authenticatedFetch } from './authenticated-fetch';

export interface OperationsAlertReport {
  id: string;
  event_type: 'signup' | 'platform_connected' | 'platform_failed' | 'server_error';
  title: string;
  summary: string;
  user_id: string | null;
  user_email: string | null;
  screen: string | null;
  request_method: string | null;
  request_path: string | null;
  http_status: number | null;
  platform: string | null;
  session_id: string | null;
  created_at: string;
}

export async function fetchOperationsAlert(id: string): Promise<OperationsAlertReport> {
  const response = await authenticatedFetch(`${API_BASE_URL}/operations/alerts/${encodeURIComponent(id)}`);
  const body = await response.json().catch(() => ({})) as { alert?: OperationsAlertReport; error?: string };
  if (!response.ok || !body.alert) throw new Error(body.error || 'Could not load Operations alert');
  return body.alert;
}
