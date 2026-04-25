import { act, renderHook, waitFor } from "@testing-library/react";
import type {
  BackupProcesses,
  BackupProgress,
  BackupSettings,
} from "../../../services/backupService";
import { beforeEach, describe, expect, it, vi } from "vitest";

const defaultProgress: BackupProgress = {
  running: false,
  triggerType: null,
  startedAt: null,
  finishedAt: null,
  totalFolders: 0,
  processedFolders: 0,
  currentFolderPath: null,
  progressPct: 0,
  lastMessage: "",
  lastError: null,
};

const defaultSettings: BackupSettings = {
  mainMountPath: "/hdds/main",
  backupMountPath: "/hdds/backup",
  retention: { maxAgeDays: 30, maxBackups: 30 },
  autoBackup: {
    enabled: false,
    runAtHour: 2,
    runAtMinute: 0,
    timezone: "America/Sao_Paulo",
    folderIds: null,
  },
  performance: {
    profile: "balanced",
    compressionFormat: "gz",
    compressionLevel: 3,
    maxConcurrency: 2,
    excludePatterns: [],
  },
};

const defaultProcesses: BackupProcesses = {
  generatedAt: "2026-01-01T00:00:00.000Z",
  serverTickMs: 30000,
  internal: { progress: defaultProgress },
  schedule: {
    autoBackupEnabled: false,
    runAtLocal: "02:00",
    timezone: "America/Sao_Paulo",
    folderIds: [],
    scheduledFolders: [],
    legacyAllFolders: true,
    lastScheduledRunDate: null,
    estimatedNextInternalRunAt: null,
    estimatedNextInternalRunNote: null,
  },
  performance: {
    profile: "balanced" as const,
    compressionFormat: "gz" as const,
    compressionLevel: 3,
    maxConcurrency: 2,
    excludePatterns: [],
  },
  externalBackupSync: {
    status: "unavailable",
    containerName: "backup_sync",
  },
};

const mocks = vi.hoisted(() => ({
  fetchHealth: vi.fn(),
  listBackupFolders: vi.fn(),
  fetchBackupSettings: vi.fn(),
  fetchBackupStorageMetrics: vi.fn(),
  fetchBackupProgress: vi.fn(),
  fetchBackupProcesses: vi.fn(),
  fetchBackupHistory: vi.fn(),
  searchDirectories: vi.fn(),
  createBackupFolder: vi.fn(),
  updateBackupFolder: vi.fn(),
  deleteBackupFolder: vi.fn(),
  triggerBackup: vi.fn(),
  updateBackupSettings: vi.fn(),
}));

vi.mock("../../../services/backupService", () => mocks);

import { useBackupFoldersController } from "../controller";

describe("useBackupFoldersController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchHealth.mockResolvedValue({ status: "ok", service: "backup-api" });
    mocks.listBackupFolders.mockResolvedValue([]);
    mocks.fetchBackupSettings.mockResolvedValue(defaultSettings);
    mocks.fetchBackupStorageMetrics.mockResolvedValue({
      freeBytes: 1,
      totalBackupsSizeBytes: 0,
      historyEntries: 0,
      avgBackupSizeBytes: null,
      backupFrequencyPerDay: null,
      estimatedBackupsFit: null,
      estimatedDaysFit: null,
    });
    mocks.fetchBackupProgress.mockResolvedValue(defaultProgress);
    mocks.fetchBackupProcesses.mockResolvedValue(defaultProcesses);
    mocks.fetchBackupHistory.mockResolvedValue([]);
    mocks.searchDirectories.mockResolvedValue([]);
    mocks.createBackupFolder.mockResolvedValue({
      id: "new-id",
      path: "/tmp/x",
      createdAt: "2026-01-01T00:00:00.000Z",
      lastBackupAt: null,
    });
    mocks.updateBackupFolder.mockImplementation(async (_id, path) => ({
      id: "1",
      path,
      createdAt: "2026-01-01T00:00:00.000Z",
      lastBackupAt: null,
    }));
    mocks.deleteBackupFolder.mockResolvedValue(undefined);
    mocks.triggerBackup.mockResolvedValue({
      ok: true,
      message: "ok",
      processedFolders: 0,
      removedByRetention: 0,
    });
    mocks.updateBackupSettings.mockImplementation(async (s) => s);
  });

  it("addFolder sem caminho define erro", async () => {
    const { result } = renderHook(() => useBackupFoldersController());

    await waitFor(() => expect(result.current.loadingHealth).toBe(false));

    await act(async () => {
      await result.current.addFolder();
    });

    expect(result.current.error).toBe("Folder path is required.");
  });

  it("triggerBackup com mensagem de backup em curso define message", async () => {
    mocks.triggerBackup.mockRejectedValue(
      new Error("Já existe um backup em curso. Aguarde."),
    );

    const { result } = renderHook(() => useBackupFoldersController());

    await waitFor(() => expect(result.current.loadingHealth).toBe(false));

    await act(async () => {
      await result.current.triggerBackup();
    });

    expect(result.current.message).toContain("Já existe um backup em curso");
    expect(mocks.fetchBackupProgress).toHaveBeenCalled();
  });

  it("saveSettings bloqueia auto backup sem pastas selecionadas", async () => {
    const { result } = renderHook(() => useBackupFoldersController());

    await waitFor(() => expect(result.current.loadingFolders).toBe(false));

    act(() => {
      result.current.setAutoBackupEnabled(true);
      result.current.clearAutoBackupFolders();
    });

    await act(async () => {
      await result.current.saveSettings();
    });

    expect(result.current.error).toContain(
      "Marque ao menos uma pasta para o backup automático",
    );
    expect(mocks.updateBackupSettings).not.toHaveBeenCalled();
  });

  it("saveSettings valida nível de compressão", async () => {
    const { result } = renderHook(() => useBackupFoldersController());
    await waitFor(() => expect(result.current.loadingFolders).toBe(false));

    act(() => {
      result.current.updateSettingsField("compressionLevel", "99");
    });

    await act(async () => {
      await result.current.saveSettings();
    });

    expect(result.current.error).toContain("Nível de compressão inválido");
    expect(mocks.updateBackupSettings).not.toHaveBeenCalled();
  });
});
