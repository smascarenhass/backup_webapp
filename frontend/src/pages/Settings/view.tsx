import type { BackupFoldersController } from "../BackupFolders/controller";

type SettingsViewProps = {
  controller: BackupFoldersController;
};

function formatBytes(value: number | null | undefined) {
  if (!value || value <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let current = value;
  let idx = 0;
  while (current >= 1024 && idx < units.length - 1) {
    current /= 1024;
    idx += 1;
  }
  return `${current.toFixed(current >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

export function SettingsView({ controller }: SettingsViewProps) {
  const {
    settings,
    settingsForm,
    savingSettings,
    metrics,
    loadingMetrics,
    error,
    message,
    updateSettingsField,
    setAutoBackupEnabled,
    saveSettings,
    toHostPath,
    toRuntimePath,
  } = controller;

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          Settings e definições
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Configure o HD principal, o HD de backup e as regras de retenção.
        </p>
      </header>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 shadow-lg">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Armazenamento e retenção
        </h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-sm text-slate-300">
            HD principal (mount path)
            <input
              type="text"
              value={toHostPath(settingsForm.mainMountPath)}
              onChange={(event) =>
                updateSettingsField(
                  "mainMountPath",
                  toRuntimePath(event.target.value),
                )
              }
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-600"
              placeholder="/hdds/main/disco-principal"
            />
          </label>
          <label className="text-sm text-slate-300">
            HD backup (mount path)
            <input
              type="text"
              value={toHostPath(settingsForm.backupMountPath)}
              onChange={(event) =>
                updateSettingsField(
                  "backupMountPath",
                  toRuntimePath(event.target.value),
                )
              }
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-600"
              placeholder="/hdds/backup/disco-backup"
            />
          </label>
          <label className="text-sm text-slate-300">
            Retenção máxima (dias)
            <input
              type="number"
              min={1}
              value={settingsForm.maxAgeDays}
              onChange={(event) =>
                updateSettingsField("maxAgeDays", event.target.value)
              }
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-600"
            />
          </label>
          <label className="text-sm text-slate-300">
            Retenção máxima (quantidade)
            <input
              type="number"
              min={1}
              value={settingsForm.maxBackups}
              onChange={(event) =>
                updateSettingsField("maxBackups", event.target.value)
              }
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-600"
            />
          </label>
          <label className="text-sm text-slate-300">
            Backup automático
            <div className="mt-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={settingsForm.autoBackupEnabled}
                onChange={(event) => setAutoBackupEnabled(event.target.checked)}
              />
              <span>{settingsForm.autoBackupEnabled ? "Ativado" : "Desativado"}</span>
            </div>
          </label>
          <label className="text-sm text-slate-300">
            Intervalo automático (minutos)
            <input
              type="number"
              min={1}
              value={settingsForm.autoBackupIntervalMinutes}
              onChange={(event) =>
                updateSettingsField("autoBackupIntervalMinutes", event.target.value)
              }
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-600"
              disabled={!settingsForm.autoBackupEnabled}
            />
          </label>
        </div>
        <button
          type="button"
          disabled={savingSettings}
          onClick={() => void saveSettings()}
          className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
        >
          {savingSettings ? "Salvando..." : "Salvar configuração"}
        </button>
        <p className="mt-2 text-xs text-slate-400">
          Base atual para seleção de pastas:{" "}
          <code className="rounded bg-slate-800 px-1 py-0.5">
            {toHostPath(settings?.mainMountPath) || "-"}
          </code>
        </p>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 shadow-lg">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Perspectiva de persistência
        </h2>
        {loadingMetrics && <p className="mt-3 text-slate-400">Carregando métricas...</p>}
        {!loadingMetrics && metrics && (
          <dl className="mt-3 grid gap-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Espaço livre no HD backup</dt>
              <dd className="text-slate-100">{formatBytes(metrics.freeBytes)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Tamanho total dos backups</dt>
              <dd className="text-slate-100">{formatBytes(metrics.totalBackupsSizeBytes)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Média por backup</dt>
              <dd className="text-slate-100">
                {metrics.avgBackupSizeBytes
                  ? formatBytes(metrics.avgBackupSizeBytes)
                  : "Histórico insuficiente"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Estimativa de ciclos possíveis</dt>
              <dd className="text-slate-100">
                {metrics.estimatedBackupsFit ?? "Histórico insuficiente"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Estimativa de dias</dt>
              <dd className="text-slate-100">
                {metrics.estimatedDaysFit
                  ? `${metrics.estimatedDaysFit.toFixed(1)} dias`
                  : "Histórico insuficiente"}
              </dd>
            </div>
          </dl>
        )}
      </section>

      {error && (
        <p className="rounded-lg border border-red-900 bg-red-950/30 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-lg border border-emerald-900 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-300">
          {message}
        </p>
      )}
    </div>
  );
}
