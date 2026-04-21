import { useDashboardController } from "./controller";

export function DashboardView() {
  const {
    health,
    loading,
    error,
    reload,
    trigger,
    triggerBusy,
    triggerMsg,
  } = useDashboardController();

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          Backup Webapp
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Painel mínimo para monitorar a API e solicitar backup (integração
          real pode ser adicionada no backend).
        </p>
      </header>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 shadow-lg">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Status da API
        </h2>
        {loading && (
          <p className="mt-3 text-slate-400" data-testid="health-loading">
            Carregando…
          </p>
        )}
        {!loading && error && (
          <p className="mt-3 text-red-400" data-testid="health-error">
            {error}
          </p>
        )}
        {!loading && !error && health && (
          <dl className="mt-3 grid gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Serviço</dt>
              <dd className="font-mono text-emerald-400">{health.service}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Status</dt>
              <dd className="font-mono text-emerald-400">{health.status}</dd>
            </div>
          </dl>
        )}
        <button
          type="button"
          onClick={() => void reload()}
          className="mt-4 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-700"
        >
          Atualizar status
        </button>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 shadow-lg">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Backup
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Dispara o endpoint de backup no backend. A implementação pode
          evoluir para chamar{" "}
          <code className="rounded bg-slate-800 px-1 py-0.5 text-xs">
            docker exec backup_sync
          </code>{" "}
          ou outro orquestrador.
        </p>
        <button
          type="button"
          disabled={triggerBusy}
          onClick={() => void trigger()}
          className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
        >
          {triggerBusy ? "Enviando…" : "Solicitar backup"}
        </button>
        {triggerMsg && (
          <p className="mt-3 text-sm text-emerald-400" data-testid="trigger-msg">
            {triggerMsg}
          </p>
        )}
      </section>
    </div>
  );
}
