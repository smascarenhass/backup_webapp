import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as backupService from "../../services/backupService";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const suggestionRequestIdRef = useRef(0);

  const allowedBasePath = settings?.mainMountPath || "/hdds/main";

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
      const nextSettings = await backupService.fetchBackupSettings();
      setSettings(nextSettings);
      setSettingsForm({
        mainMountPath: nextSettings.mainMountPath,
        backupMountPath: nextSettings.backupMountPath,
        maxAgeDays: String(nextSettings.retention.maxAgeDays),
        maxBackups: String(nextSettings.retention.maxBackups),
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

  useEffect(() => {
    void Promise.all([loadHealth(), loadFolders(), loadSettings(), loadMetrics()]);
  }, [loadHealth, loadFolders, loadMetrics, loadSettings]);

  useEffect(() => {
    const trimmed = pathInput.trim();
    if (!trimmed || !isSuggestionsOpen) {
      return;
    }

    if (trimmed.startsWith("/") && !trimmed.startsWith(allowedBasePath)) {
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
    const query = current || `${allowedBasePath}/`;
    if (query.startsWith("/") && !query.startsWith(allowedBasePath)) {
      setPathInput(`${allowedBasePath}/`);
      void loadDirectorySuggestions(`${allowedBasePath}/`);
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
      if (key === "Backspace" && pathInput.endsWith("/") && pathInput !== `${allowedBasePath}/`) {
        const parentPath = pathInput.replace(/\/+$/, "");
        const parent = parentPath.slice(0, parentPath.lastIndexOf("/") + 1);
        if (parent.startsWith(`${allowedBasePath}/`) || parent === `${allowedBasePath}/`) {
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

  const removeFolder = useCallback(async (id: string) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await backupService.deleteBackupFolder(id);
      setFolders((current) => current.filter((folder) => folder.id !== id));
      setSelectedFolderIds((current) => current.filter((folderId) => folderId !== id));
      setMessage("Folder removed from backup configuration.");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to remove folder."));
    } finally {
      setBusy(false);
    }
  }, []);

  const triggerBackup = useCallback(async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await backupService.triggerBackup(selectedFolderIds);
      await Promise.all([loadFolders(), loadMetrics()]);
      setMessage(
        `${response.message} Processed folders: ${response.processedFolders}. Removed by retention: ${
          response.removedByRetention ?? 0
        }.`,
      );
    } catch (err) {
      setError(getErrorMessage(err, "Failed to trigger backup."));
    } finally {
      setBusy(false);
    }
  }, [loadFolders, loadMetrics, selectedFolderIds]);

  const updateSettingsField = useCallback(
    (field: "mainMountPath" | "backupMountPath" | "maxAgeDays" | "maxBackups", value: string) => {
      setSettingsForm((current) => ({ ...current, [field]: value }));
    },
    [],
  );

  const saveSettings = useCallback(async () => {
    setSavingSettings(true);
    setError(null);
    setMessage(null);
    try {
      const normalized: backupService.BackupSettings = {
        mainMountPath: settingsForm.mainMountPath.trim(),
        backupMountPath: settingsForm.backupMountPath.trim(),
        retention: {
          maxAgeDays: Number.parseInt(settingsForm.maxAgeDays, 10),
          maxBackups: Number.parseInt(settingsForm.maxBackups, 10),
        },
      };
      const saved = await backupService.updateBackupSettings(normalized);
      setSettings(saved);
      setSettingsForm({
        mainMountPath: saved.mainMountPath,
        backupMountPath: saved.backupMountPath,
        maxAgeDays: String(saved.retention.maxAgeDays),
        maxBackups: String(saved.retention.maxBackups),
      });
      await Promise.all([loadMetrics(), loadFolders()]);
      setMessage("Configurações de armazenamento salvas.");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to save backup settings."));
    } finally {
      setSavingSettings(false);
    }
  }, [loadFolders, loadMetrics, settingsForm]);

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
    message,
    error,
    addFolder,
    updateSettingsField,
    saveSettings,
    selectDirectorySuggestion,
    openDirectorySuggestions,
    clearDirectorySuggestions,
    handlePathInputKeyDown,
    removeFolder,
    triggerBackup,
    toggleFolderSelection,
    selectAll,
    clearSelection,
    reload: loadFolders,
    triggerLabel,
    toHostPath,
    toRuntimePath,
  };
}
