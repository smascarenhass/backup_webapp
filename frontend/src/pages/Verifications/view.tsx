import type { BackupFoldersController } from "../BackupFolders/controller";

type VerificationsViewProps = {
  controller: BackupFoldersController;
};

function formatDate(value: string | null) {
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

function formatBytes(value: number) {
  if (!value || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let current = value;
  let idx = 0;
  while (current >= 1024 && idx < units.length - 1) {
    current /= 1024;
    idx += 1;
  }
  return `${current.toFixed(current >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

export function VerificationsView({ controller }: VerificationsViewProps) {
  const { history, loadingHistory, reloadHistory, toHostPath } = controller;

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          Verificações
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Histórico completo dos backups, com versões por pasta.
        </p>
      </header>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 shadow-lg">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
            Histórico e versões
          </h2>
          <button
            type="button"
            onClick={() => void reloadHistory()}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700"
          >
            Atualizar
          </button>
        </div>

        {loadingHistory && <p className="text-slate-400">Carregando histórico...</p>}
        {!loadingHistory && history.length === 0 && (
          <p className="text-slate-400">Nenhum backup registrado ainda.</p>
        )}

        {!loadingHistory && history.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="text-slate-500">
                  <th className="px-2 py-2">Data/Hora</th>
                  <th className="px-2 py-2">Tipo</th>
                  <th className="px-2 py-2">Versão</th>
                  <th className="px-2 py-2">Pasta</th>
                  <th className="px-2 py-2">Arquivo</th>
                  <th className="px-2 py-2 text-right">Tamanho</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item.id} className="border-t border-slate-800 text-slate-200">
                    <td className="px-2 py-2">{formatDate(item.createdAt)}</td>
                    <td className="px-2 py-2">
                      {item.triggerType === "automatic" ? "Automático" : "Manual"}
                    </td>
                    <td className="px-2 py-2">v{item.version}</td>
                    <td className="px-2 py-2 font-mono text-xs">{toHostPath(item.folderPath)}</td>
                    <td className="px-2 py-2 font-mono text-xs">{toHostPath(item.archivePath)}</td>
                    <td className="px-2 py-2 text-right">{formatBytes(item.sizeBytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
