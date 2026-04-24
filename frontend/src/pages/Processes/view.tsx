import type { BackupFoldersController } from "../BackupFolders/controller";

type ProcessesViewProps = {
  controller: BackupFoldersController;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}

export function ProcessesView({ controller }: ProcessesViewProps) {
  const {
    progress,
    processes,
    loadingProcesses,
    history,
    loadingHistory,
    reloadProcesses,
    reloadHistory,
    toHostPath,
  } = controller;

  const recentHistory = history.slice(0, 8);
  const ext = processes?.externalBackupSync;

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          Processos
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Visão consolidada do backup interno (webapp), agendamento automático e
          o serviço externo <span className="font-mono text-slate-300">backup_sync</span>.
        </p>
      </header>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 shadow-lg">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
            Backup interno (em execução)
          </h2>
          <button
            type="button"
            onClick={() => void reloadProcesses()}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700"
          >
            Atualizar processos
          </button>
        </div>
        {!progress && (
          <p className="text-slate-400">Carregando progresso...</p>
        )}
        {progress && (
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap justify-between gap-2 text-slate-300">
              <span>
                Estado:{" "}
                <span className="font-medium text-emerald-300">
                  {progress.running ? "Rodando" : "Parado"}
                </span>
              </span>
              <span>
                Tipo:{" "}
                {progress.triggerType === "automatic"
                  ? "Automático"
                  : progress.triggerType === "manual"
                    ? "Manual"
                    : "-"}
              </span>
              <span className="font-medium">
                {progress.progressPct}% · {progress.processedFolders}/
                {progress.totalFolders} pastas
              </span>
            </div>
            <div className="h-2 w-full rounded bg-slate-800">
              <div
                className="h-2 rounded bg-emerald-500 transition-all"
                style={{
                  width: `${Math.max(0, Math.min(100, progress.progressPct))}%`,
                }}
              />
            </div>
            <p className="text-slate-300">{progress.lastMessage}</p>
            {progress.currentFolderPath && (
              <p className="font-mono text-xs text-slate-400">
                Pasta atual: {toHostPath(progress.currentFolderPath)}
              </p>
            )}
            <div className="grid gap-1 text-xs text-slate-500 sm:grid-cols-2">
              <p>Início: {formatDateTime(progress.startedAt)}</p>
              <p>Término: {formatDateTime(progress.finishedAt)}</p>
            </div>
            {progress.lastError && (
              <p className="text-sm text-red-300">
                Erro recente: {progress.lastError}
              </p>
            )}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 shadow-lg">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Programados (webapp)
        </h2>
        {loadingProcesses && !processes && (
          <p className="mt-3 text-slate-400">Carregando agendamento...</p>
        )}
        {processes && (
          <div className="mt-3 space-y-2 text-sm text-slate-300">
            <p>
              Auto backup:{" "}
              <span className="font-medium text-emerald-300">
                {processes.schedule.autoBackupEnabled ? "Ativado" : "Desativado"}
              </span>
            </p>
            <p>
              Horário configurado:{" "}
              <span className="font-mono text-slate-200">
                {processes.schedule.runAtLocal}
              </span>{" "}
              <span className="text-slate-500">({processes.schedule.timezone})</span>
            </p>
            <p>
              Pastas no agendamento:{" "}
              <span className="font-medium text-slate-200">
                {processes.schedule.scheduledFolders.length}
              </span>
              {processes.schedule.legacyAllFolders ? (
                <span className="text-xs text-slate-500"> (legado: todas)</span>
              ) : null}
            </p>
            {processes.schedule.scheduledFolders.length > 0 && (
              <ul className="max-h-32 space-y-1 overflow-y-auto font-mono text-xs text-slate-400">
                {processes.schedule.scheduledFolders.map((f) => (
                  <li key={f.id}>{toHostPath(f.path)}</li>
                ))}
              </ul>
            )}
            {processes.schedule.lastScheduledRunDate && (
              <p className="text-xs text-slate-500">
                Último dia processado pelo agendador:{" "}
                <span className="font-mono text-slate-400">
                  {processes.schedule.lastScheduledRunDate}
                </span>
              </p>
            )}
            <p>
              Próximo disparo (estimado):{" "}
              <span className="font-mono text-slate-200">
                {formatDateTime(processes.schedule.estimatedNextInternalRunAt)}
              </span>
            </p>
            <p className="text-xs text-slate-500">
              Tick do servidor: {processes.serverTickMs} ms.{" "}
              {processes.schedule.estimatedNextInternalRunNote}
            </p>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 shadow-lg">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Programados / serviço externo (backup_sync)
        </h2>
        {!processes && !loadingProcesses && (
          <p className="mt-3 text-slate-400">
            Não foi possível carregar o status do Docker agora.
          </p>
        )}
        {processes && ext && (
          <div className="mt-3 space-y-2 text-sm text-slate-300">
            <p>
              Container:{" "}
              <span className="font-mono text-slate-200">{ext.containerName}</span>
            </p>
            {ext.status === "ok" && (
              <>
                <p>
                  Docker:{" "}
                  <span className="font-medium text-emerald-300">
                    {ext.dockerState}
                  </span>
                  {ext.healthStatus ? (
                    <span className="text-slate-500">
                      {" "}
                      · health: {ext.healthStatus}
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-slate-500">
                  Início (Docker): {formatDateTime(ext.startedAt)}
                </p>
                {ext.supercronicCronLine ? (
                  <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      supercronic.cron
                    </p>
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-xs text-slate-200">
                      {ext.supercronicCronLine}
                    </pre>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    Linha de cron não disponível (container parado ou arquivo
                    ausente).
                  </p>
                )}
              </>
            )}
            {(ext.status === "unavailable" || ext.status === "invalid_name") && (
              <p className="text-amber-200">
                {ext.detail ?? "Serviço externo indisponível."}
              </p>
            )}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 shadow-lg">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
            Histórico recente
          </h2>
          <button
            type="button"
            onClick={() => void reloadHistory()}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700"
          >
            Atualizar histórico
          </button>
        </div>
        {loadingHistory && <p className="text-slate-400">Carregando...</p>}
        {!loadingHistory && recentHistory.length === 0 && (
          <p className="text-slate-400">Nenhum backup registrado ainda.</p>
        )}
        {!loadingHistory && recentHistory.length > 0 && (
          <ul className="space-y-2 text-sm text-slate-300">
            {recentHistory.map((item) => (
              <li
                key={item.id}
                className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <span>{formatDateTime(item.createdAt)}</span>
                  <span className="text-slate-500">
                    {item.triggerType === "automatic" ? "Automático" : "Manual"}
                  </span>
                </div>
                <p className="mt-1 font-mono text-xs text-slate-400">
                  {toHostPath(item.folderPath)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
