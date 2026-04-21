import { useCallback, useEffect, useState } from "react";
import * as backupService from "../../services/backupService";

export function useDashboardController() {
  const [health, setHealth] = useState<backupService.HealthResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triggerMsg, setTriggerMsg] = useState<string | null>(null);
  const [triggerBusy, setTriggerBusy] = useState(false);

  const loadHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const h = await backupService.fetchHealth();
      setHealth(h);
    } catch (e) {
      setHealth(null);
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  const trigger = useCallback(async () => {
    setTriggerBusy(true);
    setTriggerMsg(null);
    setError(null);
    try {
      const r = await backupService.triggerBackup();
      setTriggerMsg(r.message);
    } catch (e) {
      setTriggerMsg(null);
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setTriggerBusy(false);
    }
  }, []);

  return {
    health,
    loading,
    error,
    reload: loadHealth,
    trigger,
    triggerBusy,
    triggerMsg,
  };
}
