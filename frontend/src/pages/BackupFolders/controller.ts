import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as backupService from "../../services/backupService";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function normalizeMountPath(value: string | null | undefined, fallback: string) {
  const trimmed = String(value ?? "").trim();
  const base = trimmed || fallback;
  const forward = base.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  return forward.replace(/\/+$/, "") || "/";
}

function withTrailingSlash(dirPath: string) {
  if (!dirPath.endsWith("/")) {
    return `${dirPath}/`;
  }
  return dirPath;
}

export function useBackupFoldersController() {
  const hostBackendBasePath =
    import.meta.env.VITE_HOST_BACKEND_BASE_PATH ??
    "/hdds/main/documents/projects/backup_webapp/backend";
  const [health, setHealth] = useState<backupService.HealthResponse | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(true);
  const [folders, setFolders] = useState<backupService.BackupFolder[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(true);
  const [settings, setSettings] = useState<backupService.BackupSettings | null>(null);
  const [settingsForm, setSettingsForm] = useState({
    mainMountPath: "",
    backupMountPath: "",
    maxAgeDays: "30",
    maxBackups: "30",
    autoBackupEnabled: false,
    autoBackupRunAt: "02:00",
    autoBackupTimezone: "America/Sao_Paulo",
    autoBackupFolderIds: [] as string[],
    performanceProfile: "balanced" as "conservative" | "balanced" | "aggressive" | "custom",
    compressionFormat: "gz" as "gz" | "xz",
    compressionLevel: "3",
    maxConcurrency: "2",
    excludePatternsText: "",
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [metrics, setMetrics] = useState<backupService.BackupStorageMetrics | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [pathInput, setPathInput] = useState("");
  const [directorySuggestions, setDirectorySuggestions] = useState<
    backupService.DirectorySuggestion[]
  >([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState(-1);
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([]);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editFolderPathDraft, setEditFolderPathDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<backupService.BackupProgress | null>(null);
  const [processes, setProcesses] = useState<backupService.BackupProcesses | null>(null);
  const [loadingProcesses, setLoadingProcesses] = useState(true);
  const [history, setHistory] = useState<backupService.BackupHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const suggestionRequestIdRef = useRef(0);
  const processesHydratedRef = useRef(false);

  const cancelEditingFolder = useCallback(() => {
    setEditingFolderId(null);
    setEditFolderPathDraft("");
  }, []);

  const allowedBasePath = useMemo(
    () => normalizeMountPath(settings?.mainMountPath, "/hdds/main"),
    [settings?.mainMountPath],
  );

  const loadDirectorySuggestions = useCallback(async (query: string) => {
    const requestId = suggestionRequestIdRef.current + 1;
    suggestionRequestIdRef.current = requestId;
    setLoadingSuggestions(true);
    try {
      const suggestions = await backupService.searchDirectories(query);
      if (suggestionRequestIdRef.current !== requestId) {
        return;
      }
      setDirectorySuggestions(suggestions);
      setHighlightedSuggestionIndex(-1);
    } catch {
      if (suggestionRequestIdRef.current !== requestId) {
        return;
      }
      setDirectorySuggestions([]);
      setHighlightedSuggestionIndex(-1);
    } finally {
      if (suggestionRequestIdRef.current === requestId) {
        setLoadingSuggestions(false);
      }
    }
  }, []);

  const loadHealth = useCallback(async () => {
    setLoadingHealth(true);
    try {
      const response = await backupService.fetchHealth();
      setHealth(response);
    } catch (err) {
      setHealth(null);
      setError(getErrorMessage(err, "Failed to load API health."));
    } finally {
      setLoadingHealth(false);
    }
  }, []);

  const loadFolders = useCallback(async () => {
    setLoadingFolders(true);
    try {
      const list = await backupService.listBackupFolders();
      setFolders(list);
      setSelectedFolderIds((current) =>
        current.filter((id) => list.some((folder) => folder.id === id)),
      );
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load backup folders."));
    } finally {
      setLoadingFolders(false);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const [nextSettings, folderList] = await Promise.all([
        backupService.fetchBackupSettings(),
        backupService.listBackupFolders(),
      ]);
      setSettings(nextSettings);
      const pad = (n: number) => String(n).padStart(2, "0");
      const folderIdsForForm =
        nextSettings.autoBackup.folderIds === null
          ? folderList.map((f) => f.id)
          : [...nextSettings.autoBackup.folderIds];
      setSettingsForm({
        mainMountPath: nextSettings.mainMountPath,
        backupMountPath: nextSettings.backupMountPath,
        maxAgeDays: String(nextSettings.retention.maxAgeDays),
        maxBackups: String(nextSettings.retention.maxBackups),
        autoBackupEnabled: Boolean(nextSettings.autoBackup?.enabled),
        autoBackupRunAt: `${pad(nextSettings.autoBackup.runAtHour)}:${pad(
          nextSettings.autoBackup.runAtMinute,
        )}`,
        autoBackupTimezone:
          nextSettings.autoBackup.timezone ?? "America/Sao_Paulo",
        autoBackupFolderIds: folderIdsForForm,
        performanceProfile: nextSettings.performance?.profile ?? "balanced",
        compressionFormat: nextSettings.performance?.compressionFormat ?? "gz",
        compressionLevel: String(nextSettings.performance?.compressionLevel ?? 3),
        maxConcurrency: String(nextSettings.performance?.maxConcurrency ?? 2),
        excludePatternsText: (nextSettings.performance?.excludePatterns ?? []).join("\n"),
      });
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load backup settings."));
    }
  }, []);

  const loadMetrics = useCallback(async () => {
    setLoadingMetrics(true);
    try {
      const nextMetrics = await backupService.fetchBackupStorageMetrics();
      setMetrics(nextMetrics);
    } catch {
      setMetrics(null);
    } finally {
      setLoadingMetrics(false);
    }
  }, []);

  const loadProgress = useCallback(async () => {
    try {
      const nextProgress = await backupService.fetchBackupProgress();
      setProgress(nextProgress);
    } catch {
      setProgress(null);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const items = await backupService.fetchBackupHistory();
      setHistory(items);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load backup history."));
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const loadProcesses = useCallback(async () => {
    const showSpinner = !processesHydratedRef.current;
    if (showSpinner) {
      setLoadingProcesses(true);
    }
    try {
      const snapshot = await backupService.fetchBackupProcesses();
      setProcesses(snapshot);
      processesHydratedRef.current = true;
    } catch {
      setProcesses(null);
    } finally {
      if (showSpinner) {
        setLoadingProcesses(false);
      }
    }
  }, []);

  useEffect(() => {
    void Promise.all([
      loadHealth(),
      loadFolders(),
      loadSettings(),
      loadMetrics(),
      loadProgress(),
      loadProcesses(),
      loadHistory(),
    ]);
  }, [
    loadHealth,
    loadFolders,
    loadHistory,
    loadMetrics,
    loadProcesses,
    loadProgress,
    loadSettings,
  ]);

  useEffect(() => {
    const interval = setInterval(() => {
      void Promise.all([loadProgress(), loadProcesses(), loadHistory()]);
    }, 2000);
    return () => clearInterval(interval);
  }, [loadHistory, loadProcesses, loadProgress]);

  useEffect(() => {
    const trimmed = pathInput.trim();
    if (!trimmed || !isSuggestionsOpen) {
      return;
    }

    if (
      trimmed.startsWith("/") &&
      !trimmed.startsWith(`${allowedBasePath}/`) &&
      trimmed !== allowedBasePath
    ) {
      setDirectorySuggestions([]);
      setLoadingSuggestions(false);
      setHighlightedSuggestionIndex(-1);
      suggestionRequestIdRef.current += 1;
      return;
    }

    const timeoutId = setTimeout(async () => {
      await loadDirectorySuggestions(trimmed);
    }, 250);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [allowedBasePath, isSuggestionsOpen, loadDirectorySuggestions, pathInput]);

  const setPathInputValue = useCallback((value: string) => {
    setPathInput(value);
  }, []);

  const selectDirectorySuggestion = useCallback((path: string) => {
    const browsePath = path.endsWith("/") ? path : `${path}/`;
    setPathInput(browsePath);
    setIsSuggestionsOpen(true);
    void loadDirectorySuggestions(browsePath);
  }, [loadDirectorySuggestions]);

  const clearDirectorySuggestions = useCallback(() => {
    setDirectorySuggestions([]);
    setHighlightedSuggestionIndex(-1);
    setLoadingSuggestions(false);
    setIsSuggestionsOpen(false);
  }, []);

  const openDirectorySuggestions = useCallback(() => {
    setIsSuggestionsOpen(true);
    const current = pathInput.trim();
    const query = current || withTrailingSlash(allowedBasePath);
    if (
      query.startsWith("/") &&
      !query.startsWith(`${allowedBasePath}/`) &&
      query !== allowedBasePath
    ) {
      const reset = withTrailingSlash(allowedBasePath);
      setPathInput(reset);
      void loadDirectorySuggestions(reset);
      return;
    }
    void loadDirectorySuggestions(query);
  }, [allowedBasePath, loadDirectorySuggestions, pathInput]);

  const handlePathInputKeyDown = useCallback(
    (key: string) => {
      if (!directorySuggestions.length) {
        if (key === "Escape") {
          clearDirectorySuggestions();
          return true;
        }
        return false;
      }

      if (key === "ArrowDown") {
        setHighlightedSuggestionIndex((current) =>
          Math.min(current + 1, directorySuggestions.length - 1),
        );
        return true;
      }
      if (key === "ArrowUp") {
        setHighlightedSuggestionIndex((current) => Math.max(current - 1, 0));
        return true;
      }
      if (key === "Enter") {
        if (
          highlightedSuggestionIndex >= 0 &&
          highlightedSuggestionIndex < directorySuggestions.length
        ) {
          selectDirectorySuggestion(
            directorySuggestions[highlightedSuggestionIndex].path,
          );
          return true;
        }
        return false;
      }
      if (key === "Escape") {
        clearDirectorySuggestions();
        return true;
      }
      const baseWithSlash = withTrailingSlash(allowedBasePath);
      if (key === "Backspace" && pathInput.endsWith("/") && pathInput !== baseWithSlash) {
        const parentPath = pathInput.replace(/\/+$/, "");
        const parent = parentPath.slice(0, parentPath.lastIndexOf("/") + 1);
        if (parent.startsWith(`${allowedBasePath}/`) || parent === baseWithSlash) {
          setPathInput(parent);
          void loadDirectorySuggestions(parent);
          return true;
        }
      }
      return false;
    },
    [
      allowedBasePath,
      clearDirectorySuggestions,
      directorySuggestions,
      highlightedSuggestionIndex,
      loadDirectorySuggestions,
      pathInput,
      selectDirectorySuggestion,
    ],
  );

  const addFolder = useCallback(async () => {
    const trimmed = pathInput.trim();
    if (!trimmed) {
      setError("Folder path is required.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const created = await backupService.createBackupFolder(trimmed);
      setFolders((current) => [...current, created]);
      setPathInput("");
      clearDirectorySuggestions();
      setMessage("Folder added to backup configuration.");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to add folder."));
    } finally {
      setBusy(false);
    }
  }, [clearDirectorySuggestions, pathInput]);

  const removeFolder = useCallback(
    async (id: string) => {
      setBusy(true);
      setError(null);
      setMessage(null);
      try {
        await backupService.deleteBackupFolder(id);
        setFolders((current) => current.filter((folder) => folder.id !== id));
        setSelectedFolderIds((current) =>
          current.filter((folderId) => folderId !== id),
        );
        setEditingFolderId((cur) => {
          if (cur === id) {
            setEditFolderPathDraft("");
            return null;
          }
          return cur;
        });
        setMessage("Folder removed from backup configuration.");
      } catch (err) {
        setError(getErrorMessage(err, "Failed to remove folder."));
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const triggerBackup = useCallback(async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await backupService.triggerBackup(selectedFolderIds);
      await Promise.all([loadFolders(), loadMetrics(), loadProgress(), loadHistory()]);
      setMessage(
        `${response.message} Processed folders: ${response.processedFolders}. Removed by retention: ${
          response.removedByRetention ?? 0
        }.`,
      );
    } catch (err) {
      const msg = getErrorMessage(err, "Failed to trigger backup.");
      if (msg.includes("Já existe um backup em curso")) {
        setMessage(msg);
        void loadProgress();
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }, [loadFolders, loadHistory, loadMetrics, loadProgress, selectedFolderIds]);

  const updateSettingsField = useCallback(
    (
      field:
        | "mainMountPath"
        | "backupMountPath"
        | "maxAgeDays"
        | "maxBackups"
        | "autoBackupRunAt"
        | "autoBackupTimezone"
        | "compressionLevel"
        | "maxConcurrency"
        | "excludePatternsText",
      value: string,
    ) => {
      setSettingsForm((current) => ({ ...current, [field]: value }));
    },
    [],
  );

  const setPerformanceProfile = useCallback(
    (profile: "conservative" | "balanced" | "aggressive" | "custom") => {
      setSettingsForm((current) => ({ ...current, performanceProfile: profile }));
    },
    [],
  );

  const setCompressionFormat = useCallback((format: "gz" | "xz") => {
    setSettingsForm((current) => ({ ...current, compressionFormat: format }));
  }, []);

  const setAutoBackupEnabled = useCallback((enabled: boolean) => {
    setSettingsForm((current) => ({ ...current, autoBackupEnabled: enabled }));
  }, []);

  const toggleAutoBackupFolderId = useCallback((id: string) => {
    setSettingsForm((current) => {
      const next = new Set(current.autoBackupFolderIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { ...current, autoBackupFolderIds: [...next] };
    });
  }, []);

  const selectAllAutoBackupFolders = useCallback(() => {
    setSettingsForm((current) => ({
      ...current,
      autoBackupFolderIds: folders.map((f) => f.id),
    }));
  }, [folders]);

  const clearAutoBackupFolders = useCallback(() => {
    setSettingsForm((current) => ({ ...current, autoBackupFolderIds: [] }));
  }, []);

  const saveSettings = useCallback(async () => {
    setSavingSettings(true);
    setError(null);
    setMessage(null);
    try {
      const [hh, mm] = settingsForm.autoBackupRunAt.split(":");
      const runAtHour = Number.parseInt(String(hh ?? "0"), 10);
      const runAtMinute = Number.parseInt(String(mm ?? "0"), 10);
      const compressionLevel = Number.parseInt(settingsForm.compressionLevel, 10);
      const maxConcurrency = Number.parseInt(settingsForm.maxConcurrency, 10);
      const minLevel = settingsForm.compressionFormat === "xz" ? 0 : 1;
      const maxLevel = 9;
      const excludes = settingsForm.excludePatternsText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      if (
        settingsForm.autoBackupEnabled &&
        settingsForm.autoBackupFolderIds.length === 0
      ) {
        setError(
          "Marque ao menos uma pasta para o backup automático ou desative o agendamento.",
        );
        return;
      }
      if (
        !Number.isFinite(runAtHour) ||
        !Number.isFinite(runAtMinute) ||
        runAtHour < 0 ||
        runAtHour > 23 ||
        runAtMinute < 0 ||
        runAtMinute > 59
      ) {
        setError("Horário do backup automático inválido.");
        return;
      }
      if (
        !Number.isFinite(compressionLevel) ||
        compressionLevel < minLevel ||
        compressionLevel > maxLevel
      ) {
        setError(`Nível de compressão inválido para ${settingsForm.compressionFormat}.`);
        return;
      }
      if (!Number.isFinite(maxConcurrency) || maxConcurrency < 1 || maxConcurrency > 8) {
        setError("Concorrência inválida. Use um valor entre 1 e 8.");
        return;
      }
      const normalized: backupService.BackupSettings = {
        mainMountPath: settingsForm.mainMountPath.trim(),
        backupMountPath: settingsForm.backupMountPath.trim(),
        retention: {
          maxAgeDays: Number.parseInt(settingsForm.maxAgeDays, 10),
          maxBackups: Number.parseInt(settingsForm.maxBackups, 10),
        },
        autoBackup: {
          enabled: settingsForm.autoBackupEnabled,
          runAtHour,
          runAtMinute,
          timezone:
            settingsForm.autoBackupTimezone.trim() || "America/Sao_Paulo",
          folderIds: settingsForm.autoBackupFolderIds,
        },
        performance: {
          profile: settingsForm.performanceProfile,
          compressionFormat: settingsForm.compressionFormat,
          compressionLevel,
          maxConcurrency,
          excludePatterns: excludes,
        },
      };
      const saved = await backupService.updateBackupSettings(normalized);
      setSettings(saved);
      const folderList = await backupService.listBackupFolders();
      const pad = (n: number) => String(n).padStart(2, "0");
      const folderIdsForForm =
        saved.autoBackup.folderIds === null
          ? folderList.map((f) => f.id)
          : [...saved.autoBackup.folderIds];
      setSettingsForm({
        mainMountPath: saved.mainMountPath,
        backupMountPath: saved.backupMountPath,
        maxAgeDays: String(saved.retention.maxAgeDays),
        maxBackups: String(saved.retention.maxBackups),
        autoBackupEnabled: Boolean(saved.autoBackup?.enabled),
        autoBackupRunAt: `${pad(saved.autoBackup.runAtHour)}:${pad(
          saved.autoBackup.runAtMinute,
        )}`,
        autoBackupTimezone: saved.autoBackup.timezone ?? "America/Sao_Paulo",
        autoBackupFolderIds: folderIdsForForm,
        performanceProfile: saved.performance?.profile ?? "balanced",
        compressionFormat: saved.performance?.compressionFormat ?? "gz",
        compressionLevel: String(saved.performance?.compressionLevel ?? 3),
        maxConcurrency: String(saved.performance?.maxConcurrency ?? 2),
        excludePatternsText: (saved.performance?.excludePatterns ?? []).join("\n"),
      });
      await Promise.all([loadMetrics(), loadFolders(), loadProgress(), loadHistory()]);
      setMessage("Configurações de armazenamento salvas.");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to save backup settings."));
    } finally {
      setSavingSettings(false);
    }
  }, [loadFolders, loadHistory, loadMetrics, loadProgress, settingsForm, folders]);

  const toggleFolderSelection = useCallback((id: string) => {
    setSelectedFolderIds((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id],
    );
  }, []);

  const selectAll = useCallback(() => {
    setSelectedFolderIds(folders.map((folder) => folder.id));
  }, [folders]);

  const clearSelection = useCallback(() => {
    setSelectedFolderIds([]);
  }, []);

  const selectedCount = selectedFolderIds.length;
  const hasFolders = folders.length > 0;
  const allSelected = hasFolders && selectedCount === folders.length;
  const showSuggestions = isSuggestionsOpen;
  const triggerLabel = useMemo(() => {
    if (!hasFolders) return "Request backup";
    if (selectedCount === 0) return "Request backup (all folders)";
    return `Request backup (${selectedCount} selected)`;
  }, [hasFolders, selectedCount]);

  const toHostPath = useCallback(
    (runtimePath: string | null | undefined) => {
      if (!runtimePath) {
        return "";
      }
      if (runtimePath === "/app") {
        return hostBackendBasePath;
      }
      if (runtimePath.startsWith("/app/")) {
        return `${hostBackendBasePath}${runtimePath.slice("/app".length)}`;
      }
      return runtimePath;
    },
    [hostBackendBasePath],
  );

  const toRuntimePath = useCallback(
    (hostPath: string | null | undefined) => {
      const value = String(hostPath ?? "").trim();
      if (!value) {
        return "";
      }
      if (value === hostBackendBasePath) {
        return "/app";
      }
      if (value.startsWith(`${hostBackendBasePath}/`)) {
        return `/app${value.slice(hostBackendBasePath.length)}`;
      }
      return value;
    },
    [hostBackendBasePath],
  );

  const startEditingFolder = useCallback(
    (folder: backupService.BackupFolder) => {
      setEditingFolderId(folder.id);
      setEditFolderPathDraft(toHostPath(folder.path));
    },
    [toHostPath],
  );

  const setEditFolderPathDraftValue = useCallback((value: string) => {
    setEditFolderPathDraft(value);
  }, []);

  const saveEditedFolder = useCallback(async () => {
    if (!editingFolderId) {
      return;
    }
    const trimmed = editFolderPathDraft.trim();
    if (!trimmed) {
      setError("Caminho da pasta é obrigatório.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const pathForApi = toRuntimePath(trimmed) || trimmed;
      const updated = await backupService.updateBackupFolder(
        editingFolderId,
        pathForApi,
      );
      setFolders((current) =>
        current.map((f) => (f.id === updated.id ? updated : f)),
      );
      cancelEditingFolder();
      setMessage("Pasta atualizada.");
      await Promise.all([loadSettings(), loadHistory()]);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to update folder."));
    } finally {
      setBusy(false);
    }
  }, [
    editingFolderId,
    editFolderPathDraft,
    cancelEditingFolder,
    toRuntimePath,
    loadSettings,
    loadHistory,
  ]);

  return {
    health,
    loadingHealth,
    folders,
    loadingFolders,
    settings,
    settingsForm,
    savingSettings,
    metrics,
    loadingMetrics,
    pathInput,
    setPathInput: setPathInputValue,
    directorySuggestions,
    loadingSuggestions,
    highlightedSuggestionIndex,
    showSuggestions,
    selectedFolderIds,
    selectedCount,
    allSelected,
    hasFolders,
    busy,
    progress,
    processes,
    loadingProcesses,
    history,
    loadingHistory,
    message,
    error,
    addFolder,
    updateSettingsField,
    setAutoBackupEnabled,
    setPerformanceProfile,
    setCompressionFormat,
    toggleAutoBackupFolderId,
    selectAllAutoBackupFolders,
    clearAutoBackupFolders,
    saveSettings,
    selectDirectorySuggestion,
    openDirectorySuggestions,
    clearDirectorySuggestions,
    handlePathInputKeyDown,
    removeFolder,
    editingFolderId,
    editFolderPathDraft,
    setEditFolderPathDraft: setEditFolderPathDraftValue,
    startEditingFolder,
    cancelEditingFolder,
    saveEditedFolder,
    triggerBackup,
    toggleFolderSelection,
    selectAll,
    clearSelection,
    reload: loadFolders,
    triggerLabel,
    toHostPath,
    toRuntimePath,
    reloadHistory: loadHistory,
    reloadProcesses: loadProcesses,
    reloadSettings: loadSettings,
    reloadMetrics: loadMetrics,
  };
}

export type BackupFoldersController = ReturnType<typeof useBackupFoldersController>;
