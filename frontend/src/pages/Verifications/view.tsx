import type { BackupHistoryItem } from "../../services/backupService";
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

function formatDurationMs(value: number | null) {
  if (value == null || !Number.isFinite(value) || value < 0) {
    return "-";
  }
  const totalSeconds = Math.round(value / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes > 0 ? `${hours}h ${restMinutes}m` : `${hours}h`;
}

function getHistoryGroupMeta(archivePath: string): {
  groupKey: string;
  destDir: string;
  fileName: string;
} {
  const norm = archivePath.replace(/\\/g, "/");
  const lower = norm.toLowerCase();
  const idx = lower.indexOf("/webapp/");
  if (idx >= 0) {
    const tail = norm.slice(idx + 1);
    const segments = tail.split("/").filter(Boolean);
    if (
      segments.length >= 5 &&
      segments[0].toLowerCase() === "webapp"
    ) {
      const y = segments[1];
      const mo = segments[2];
      const d = segments[3];
      const fileName = segments[4];
      const groupKey = `webapp/${y}/${mo}/${d}`;
      return { groupKey, destDir: groupKey, fileName };
    }
  }
  const fileName = norm.split("/").pop() || norm;
  return {
    groupKey: "__legacy__",
    destDir: "—",
    fileName,
  };
}

function groupHistoryByArchiveDate(history: BackupHistoryItem[]) {
  const map = new Map<string, BackupHistoryItem[]>();
  for (const item of history) {
    const { groupKey } = getHistoryGroupMeta(item.archivePath);
    const list = map.get(groupKey) ?? [];
    list.push(item);
    map.set(groupKey, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  const entries = [...map.entries()].sort((a, b) => {
    if (a[0] === "__legacy__") return 1;
    if (b[0] === "__legacy__") return -1;
    const maxA = Math.max(...a[1].map((i) => Date.parse(i.createdAt) || 0));
    const maxB = Math.max(...b[1].map((i) => Date.parse(i.createdAt) || 0));
    return maxB - maxA;
  });
  return entries;
}

export function VerificationsView({ controller }: VerificationsViewProps) {
  const { history, loadingHistory, reloadHistory, toHostPath } = controller;
  const grouped = groupHistoryByArchiveDate(history);

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          Verificações
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Histórico dos backups agrupado por pasta de data{" "}
          <span className="text-slate-500">(webapp/ano/mês/dia em UTC no arquivo)</span>.
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
          <div className="flex flex-col gap-8">
            {grouped.map(([groupKey, items]) => (
              <div key={groupKey}>
                <h3 className="mb-2 border-b border-slate-800 pb-2 font-mono text-sm text-slate-300">
                  {groupKey === "__legacy__"
                    ? "Raiz / caminhos antigos"
                    : `${groupKey} · UTC`}
                </h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="text-slate-500">
                        <th className="px-2 py-2">Data/Hora</th>
                        <th className="px-2 py-2">Tipo</th>
                        <th className="px-2 py-2">Versão</th>
                        <th className="px-2 py-2">Duração</th>
                        <th className="px-2 py-2">Pasta origem</th>
                        <th className="px-2 py-2">Destino</th>
                        <th className="px-2 py-2">Arquivo</th>
                        <th className="px-2 py-2 text-right">Tamanho</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => {
                        const meta = getHistoryGroupMeta(item.archivePath);
                        return (
                          <tr
                            key={item.id}
                            className="border-t border-slate-800 text-slate-200"
                          >
                            <td className="px-2 py-2">{formatDate(item.createdAt)}</td>
                            <td className="px-2 py-2">
                              {item.triggerType === "automatic"
                                ? "Automático"
                                : "Manual"}
                            </td>
                            <td className="px-2 py-2">v{item.version}</td>
                            <td className="px-2 py-2">
                              {formatDurationMs(item.durationMs)}
                            </td>
                            <td className="px-2 py-2 font-mono text-xs">
                              {toHostPath(item.folderPath)}
                            </td>
                            <td className="px-2 py-2 font-mono text-xs">
                              {meta.destDir}
                            </td>
                            <td className="px-2 py-2 font-mono text-xs">
                              {meta.fileName}
                            </td>
                            <td className="px-2 py-2 text-right">
                              {formatBytes(item.sizeBytes)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
