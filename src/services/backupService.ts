/**
 * API base: empty means same host (nginx proxies /api in Docker).
 * In development, Vite proxies /api to the local backend.
 */
const API_BASE = import.meta.env.VITE_API_URL ?? "";

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) {
    throw new Error(`Empty response (${res.status})`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid JSON (${res.status}): ${text.slice(0, 120)}`);
  }
}

export type HealthResponse = {
  status: string;
  service: string;
};

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/api/health`);
  if (!res.ok) {
    throw new Error(`Health check failed: HTTP ${res.status}`);
  }
  return parseJson<HealthResponse>(res);
}

export type TriggerBackupResponse = {
  ok: boolean;
  message: string;
};

export async function triggerBackup(): Promise<TriggerBackupResponse> {
  const res = await fetch(`${API_BASE}/api/backup/trigger`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Trigger failed: HTTP ${res.status}`);
  }
  return parseJson<TriggerBackupResponse>(res);
}
