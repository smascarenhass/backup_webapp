import type { BackupFoldersController } from "../BackupFolders/controller";

type DashboardViewProps = {
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

export function DashboardView({ controller }: DashboardViewProps) {
  const {
    health,
    loadingHealth,
    folders,
    loadingFolders,
    metrics,
    loadingMetrics,
    history,
    loadingHistory,
    reloadMetrics,
    reload: reloadFolders,
    toHostPath,
  } = controller;

  const historyCount = history.length;
  const foldersCount = folders.length;

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          Painel
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Resumo do serviço de backup e perspectiva de uso do armazenamento.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 shadow-lg">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            API
          </p>
          {loadingHealth && (
            <p className="mt-2 text-sm text-slate-500">Carregando...</p>
          )}
          {!loadingHealth && health && (
            <p className="mt-2 text-lg font-medium text-emerald-400">
              {health.status}
            </p>
          )}
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 shadow-lg">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Pastas configuradas
          </p>
          {loadingFolders ? (
            <p className="mt-2 text-sm text-slate-500">—</p>
          ) : (
            <p className="mt-2 text-2xl font-semibold text-slate-100">
              {foldersCount}
            </p>
          )}
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 shadow-lg">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Registos no histórico
          </p>
          {loadingHistory ? (
            <p className="mt-2 text-sm text-slate-500">—</p>
          ) : (
            <p className="mt-2 text-2xl font-semibold text-slate-100">
              {historyCount}
            </p>
          )}
        </div>
      </div>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 shadow-lg">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
            Perspectiva de persistência
          </h2>
          <button
            type="button"
            onClick={() => void reloadMetrics()}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700"
          >
            Atualizar métricas
          </button>
        </div>
        {loadingMetrics && <p className="text-slate-400">Carregando métricas...</p>}
        {!loadingMetrics && metrics && (
          <dl className="mt-1 grid gap-2 text-sm md:grid-cols-2">
            <div className="flex justify-between gap-3 rounded-lg border border-slate-800/80 bg-slate-950/40 px-3 py-2">
              <dt className="text-slate-500">Espaço livre no HD backup</dt>
              <dd className="text-right font-medium text-slate-100">
                {formatBytes(metrics.freeBytes)}
              </dd>
            </div>
            <div className="flex justify-between gap-3 rounded-lg border border-slate-800/80 bg-slate-950/40 px-3 py-2">
              <dt className="text-slate-500">Tamanho total dos backups</dt>
              <dd className="text-right font-medium text-slate-100">
                {formatBytes(metrics.totalBackupsSizeBytes)}
              </dd>
            </div>
            <div className="flex justify-between gap-3 rounded-lg border border-slate-800/80 bg-slate-950/40 px-3 py-2">
              <dt className="text-slate-500">Média por backup</dt>
              <dd className="text-right font-medium text-slate-100">
                {metrics.avgBackupSizeBytes
                  ? formatBytes(metrics.avgBackupSizeBytes)
                  : "Histórico insuficiente"}
              </dd>
            </div>
            <div className="flex justify-between gap-3 rounded-lg border border-slate-800/80 bg-slate-950/40 px-3 py-2">
              <dt className="text-slate-500">Entradas consideradas (histórico)</dt>
              <dd className="text-right font-medium text-slate-100">
                {metrics.historyEntries}
              </dd>
            </div>
            <div className="flex justify-between gap-3 rounded-lg border border-slate-800/80 bg-slate-950/40 px-3 py-2">
              <dt className="text-slate-500">Estimativa de ciclos possíveis</dt>
              <dd className="text-right font-medium text-slate-100">
                {metrics.estimatedBackupsFit ?? "Histórico insuficiente"}
              </dd>
            </div>
            <div className="flex justify-between gap-3 rounded-lg border border-slate-800/80 bg-slate-950/40 px-3 py-2">
              <dt className="text-slate-500">Estimativa de dias</dt>
              <dd className="text-right font-medium text-slate-100">
                {metrics.estimatedDaysFit
                  ? `${metrics.estimatedDaysFit.toFixed(1)} dias`
                  : "Histórico insuficiente"}
              </dd>
            </div>
          </dl>
        )}
        {!loadingMetrics && !metrics && (
          <p className="text-slate-500">Métricas indisponíveis no momento.</p>
        )}
      </section>

      {foldersCount > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
              Pastas em backup
            </h2>
            <button
              type="button"
              onClick={() => void reloadFolders()}
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700"
            >
              Atualizar
            </button>
          </div>
          {loadingFolders ? (
            <p className="text-sm text-slate-500">Carregando...</p>
          ) : (
            <ul className="space-y-1 text-sm text-slate-300">
              {folders.map((f) => (
                <li key={f.id} className="font-mono text-xs text-slate-400">
                  {toHostPath(f.path)}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
