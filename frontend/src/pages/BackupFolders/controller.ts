import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as backupService from "../../services/backupService";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function useBackupFoldersController() {
  const allowedBasePath = "/hdds/main";
  const [health, setHealth] = useState<backupService.HealthResponse | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(true);
  const [folders, setFolders] = useState<backupService.BackupFolder[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(true);
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

  useEffect(() => {
    void Promise.all([loadHealth(), loadFolders()]);
  }, [loadHealth, loadFolders]);

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
      await loadFolders();
      setMessage(
        `${response.message} Processed folders: ${response.processedFolders}.`,
      );
    } catch (err) {
      setError(getErrorMessage(err, "Failed to trigger backup."));
    } finally {
      setBusy(false);
    }
  }, [loadFolders, selectedFolderIds]);

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

  return {
    health,
    loadingHealth,
    folders,
    loadingFolders,
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
  };
}
