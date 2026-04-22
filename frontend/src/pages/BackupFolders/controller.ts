import { useCallback, useEffect, useMemo, useState } from "react";
import * as backupService from "../../services/backupService";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function useBackupFoldersController() {
  const [health, setHealth] = useState<backupService.HealthResponse | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(true);
  const [folders, setFolders] = useState<backupService.BackupFolder[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(true);
  const [pathInput, setPathInput] = useState("");
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      setMessage("Folder added to backup configuration.");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to add folder."));
    } finally {
      setBusy(false);
    }
  }, [pathInput]);

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
    setPathInput,
    selectedFolderIds,
    selectedCount,
    allSelected,
    hasFolders,
    busy,
    message,
    error,
    addFolder,
    removeFolder,
    triggerBackup,
    toggleFolderSelection,
    selectAll,
    clearSelection,
    reload: loadFolders,
    triggerLabel,
  };
}
