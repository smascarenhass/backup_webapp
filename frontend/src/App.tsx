import { useMemo, useState } from "react";
import { useBackupFoldersController } from "./pages/BackupFolders/controller";
import { BackupFoldersView } from "./pages/BackupFolders/view";
import { SettingsView } from "./pages/Settings/view";
import { VerificationsView } from "./pages/Verifications/view";

export default function App() {
  const [activePage, setActivePage] = useState<
    "backups" | "settings" | "verifications"
  >("backups");
  const controller = useBackupFoldersController();

  const pageTitle = useMemo(() => {
    if (activePage === "settings") return "Settings";
    if (activePage === "verifications") return "Verificações";
    return "Backups";
  }, [activePage]);

  return (
    <div className="flex min-h-screen bg-slate-950">
      <aside className="w-64 border-r border-slate-800 bg-slate-900/50 p-4">
        <h1 className="mb-4 text-lg font-semibold text-white">Backup Webapp</h1>
        <nav className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setActivePage("backups")}
            className={`rounded-lg px-3 py-2 text-left text-sm transition ${
              activePage === "backups"
                ? "bg-emerald-700/40 text-emerald-100"
                : "bg-slate-800 text-slate-200 hover:bg-slate-700"
            }`}
          >
            Backups
          </button>
          <button
            type="button"
            onClick={() => setActivePage("settings")}
            className={`rounded-lg px-3 py-2 text-left text-sm transition ${
              activePage === "settings"
                ? "bg-emerald-700/40 text-emerald-100"
                : "bg-slate-800 text-slate-200 hover:bg-slate-700"
            }`}
          >
            Settings e definições
          </button>
          <button
            type="button"
            onClick={() => setActivePage("verifications")}
            className={`rounded-lg px-3 py-2 text-left text-sm transition ${
              activePage === "verifications"
                ? "bg-emerald-700/40 text-emerald-100"
                : "bg-slate-800 text-slate-200 hover:bg-slate-700"
            }`}
          >
            Verificações
          </button>
        </nav>
      </aside>

      <main className="flex-1">
        <div className="border-b border-slate-800 px-6 py-4">
          <h2 className="text-xl font-semibold text-white">{pageTitle}</h2>
        </div>
        {activePage === "backups" && <BackupFoldersView controller={controller} />}
        {activePage === "settings" && <SettingsView controller={controller} />}
        {activePage === "verifications" && (
          <VerificationsView controller={controller} />
        )}
      </main>
    </div>
  );
}
