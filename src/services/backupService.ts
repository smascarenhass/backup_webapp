/**
 * Base da API: vazio = mesmo host (nginx faz proxy de /api no Docker).
 * Em dev, o Vite repassa /api para o backend local.
 */
const API_BASE = import.meta.env.VITE_API_URL ?? "";

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) {
    throw new Error(`Resposta vazia (${res.status})`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`JSON inválido (${res.status}): ${text.slice(0, 120)}`);
  }
}

export type HealthResponse = {
  status: string;
  service: string;
};

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/api/health`);
  if (!res.ok) {
    throw new Error(`Health falhou: HTTP ${res.status}`);
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
    throw new Error(`Disparo falhou: HTTP ${res.status}`);
  }
  return parseJson<TriggerBackupResponse>(res);
}
