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
  processedFolders: number;
};

export async function triggerBackup(
  folderIds?: string[],
): Promise<TriggerBackupResponse> {
  const res = await fetch(`${API_BASE}/api/backup/trigger`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folderIds: folderIds ?? [] }),
  });
  if (!res.ok) {
    throw new Error(`Trigger failed: HTTP ${res.status}`);
  }
  return parseJson<TriggerBackupResponse>(res);
}

export type BackupFolder = {
  id: string;
  path: string;
  createdAt: string;
  lastBackupAt: string | null;
};

type ListBackupFoldersResponse = {
  folders: BackupFolder[];
};

type CreateBackupFolderResponse = {
  folder: BackupFolder;
};

export async function listBackupFolders(): Promise<BackupFolder[]> {
  const res = await fetch(`${API_BASE}/api/backup/folders`);
  if (!res.ok) {
    throw new Error(`Folders listing failed: HTTP ${res.status}`);
  }
  const data = await parseJson<ListBackupFoldersResponse>(res);
  return data.folders;
}

export async function createBackupFolder(path: string): Promise<BackupFolder> {
  const res = await fetch(`${API_BASE}/api/backup/folders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) {
    throw new Error(`Folder creation failed: HTTP ${res.status}`);
  }
  const data = await parseJson<CreateBackupFolderResponse>(res);
  return data.folder;
}

export async function deleteBackupFolder(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/backup/folders/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(`Folder deletion failed: HTTP ${res.status}`);
  }
}
