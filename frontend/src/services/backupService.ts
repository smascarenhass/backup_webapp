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
  removedByRetention?: number;
  archives?: string[];
  triggerType?: "manual" | "automatic";
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

export type DirectorySuggestion = {
  name: string;
  path: string;
};

type SearchDirectoriesResponse = {
  basePath: string;
  directories: DirectorySuggestion[];
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

export type BackupSettings = {
  mainMountPath: string;
  backupMountPath: string;
  retention: {
    maxAgeDays: number;
    maxBackups: number;
  };
  autoBackup: {
    enabled: boolean;
    intervalMinutes: number;
  };
};

type BackupSettingsResponse = {
  settings: BackupSettings;
};

export async function fetchBackupSettings(): Promise<BackupSettings> {
  const res = await fetch(`${API_BASE}/api/backup/settings`);
  if (!res.ok) {
    throw new Error(`Settings load failed: HTTP ${res.status}`);
  }
  const data = await parseJson<BackupSettingsResponse>(res);
  return data.settings;
}

export async function updateBackupSettings(
  settings: BackupSettings,
): Promise<BackupSettings> {
  const res = await fetch(`${API_BASE}/api/backup/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!res.ok) {
    throw new Error(`Settings update failed: HTTP ${res.status}`);
  }
  const data = await parseJson<BackupSettingsResponse>(res);
  return data.settings;
}

export type BackupStorageMetrics = {
  freeBytes: number;
  totalBackupsSizeBytes: number;
  historyEntries: number;
  avgBackupSizeBytes: number | null;
  backupFrequencyPerDay: number | null;
  estimatedBackupsFit: number | null;
  estimatedDaysFit: number | null;
};

export type BackupProgress = {
  running: boolean;
  triggerType: "manual" | "automatic" | null;
  startedAt: string | null;
  finishedAt: string | null;
  totalFolders: number;
  processedFolders: number;
  currentFolderPath: string | null;
  progressPct: number;
  lastMessage: string;
  lastError: string | null;
};

type BackupProgressResponse = {
  progress: BackupProgress;
};

export type BackupHistoryItem = {
  id: string;
  folderId: string;
  folderPath: string;
  archivePath: string;
  sizeBytes: number;
  durationMs: number | null;
  createdAt: string;
  triggerType: "manual" | "automatic";
  version: number;
};

type BackupHistoryResponse = {
  history: BackupHistoryItem[];
};

type BackupStorageMetricsResponse = {
  metrics: BackupStorageMetrics;
};

export async function fetchBackupStorageMetrics(): Promise<BackupStorageMetrics> {
  const res = await fetch(`${API_BASE}/api/backup/storage-metrics`);
  if (!res.ok) {
    throw new Error(`Storage metrics failed: HTTP ${res.status}`);
  }
  const data = await parseJson<BackupStorageMetricsResponse>(res);
  return data.metrics;
}

export async function fetchBackupProgress(): Promise<BackupProgress> {
  const res = await fetch(`${API_BASE}/api/backup/progress`);
  if (!res.ok) {
    throw new Error(`Progress fetch failed: HTTP ${res.status}`);
  }
  const data = await parseJson<BackupProgressResponse>(res);
  return data.progress;
}

export async function fetchBackupHistory(): Promise<BackupHistoryItem[]> {
  const res = await fetch(`${API_BASE}/api/backup/history`);
  if (!res.ok) {
    throw new Error(`History fetch failed: HTTP ${res.status}`);
  }
  const data = await parseJson<BackupHistoryResponse>(res);
  return data.history;
}

export async function searchDirectories(
  query: string,
  limit = 20,
): Promise<DirectorySuggestion[]> {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
  });
  const res = await fetch(`${API_BASE}/api/fs/directories?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Directory search failed: HTTP ${res.status}`);
  }
  const data = await parseJson<SearchDirectoriesResponse>(res);
  return data.directories;
}
