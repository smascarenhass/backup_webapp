import { useState } from "react";
import type { BackupFoldersController } from "../BackupFolders/controller";

type SettingsViewProps = {
  controller: BackupFoldersController;
};

export function SettingsView({ controller }: SettingsViewProps) {
  const {
    settings,
    settingsForm,
    savingSettings,
    folders,
    loadingFolders,
    error,
    message,
    updateSettingsField,
    setAutoBackupEnabled,
    setPerformanceProfile,
    setCompressionFormat,
    toggleAutoBackupFolderId,
    selectAllAutoBackupFolders,
    clearAutoBackupFolders,
    saveSettings,
    reloadSettings,
    toHostPath,
    toRuntimePath,
  } = controller;

  const [storageEditorOpen, setStorageEditorOpen] = useState(false);

  const closeStorageEditor = () => {
    setStorageEditorOpen(false);
    void reloadSettings();
  };

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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
            Armazenamento e retenção
          </h2>
          {!storageEditorOpen ? (
            <button
              type="button"
              onClick={() => setStorageEditorOpen(true)}
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700"
            >
              Editar
            </button>
          ) : (
            <button
              type="button"
              onClick={() => closeStorageEditor()}
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800"
            >
              Fechar
            </button>
          )}
        </div>

        {!storageEditorOpen && !settings && (
          <p className="mt-3 text-sm text-slate-500">Carregando definições...</p>
        )}

        {!storageEditorOpen && settings && (
          <div className="mt-3 space-y-2 text-sm text-slate-400">
            <p>
              <span className="text-slate-500">HD principal:</span>{" "}
              <code className="text-slate-300">
                {toHostPath(settings.mainMountPath) || "—"}
              </code>
            </p>
            <p>
              <span className="text-slate-500">HD backup:</span>{" "}
              <code className="text-slate-300">
                {toHostPath(settings.backupMountPath) || "—"}
              </code>
            </p>
            <p>
              <span className="text-slate-500">Retenção:</span>{" "}
              {settings.retention.maxAgeDays} dias · máx.{" "}
              {settings.retention.maxBackups} cópias
            </p>
            <p>
              <span className="text-slate-500">Performance:</span>{" "}
              perfil {settings.performance.profile} · {settings.performance.compressionFormat}
              {" -"}
              {settings.performance.compressionLevel} · conc.{" "}
              {settings.performance.maxConcurrency}
            </p>
            <p>
              <span className="text-slate-500">Backup automático:</span>{" "}
              {settings.autoBackup.enabled ? (
                <span className="text-emerald-400">
                  Ativado às {String(settings.autoBackup.runAtHour).padStart(2, "0")}:
                  {String(settings.autoBackup.runAtMinute).padStart(2, "0")} (
                  {settings.autoBackup.timezone})
                </span>
              ) : (
                <span>Desativado</span>
              )}
            </p>
            <p className="text-xs text-slate-500">
              Clique em <span className="text-slate-400">Editar</span> para alterar
              caminhos, retenção e agendamento.
            </p>
          </div>
        )}

        {storageEditorOpen && (
          <>
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
            Backup automático (diário)
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
            Horário local do disparo
            <input
              type="time"
              value={settingsForm.autoBackupRunAt}
              onChange={(event) =>
                updateSettingsField("autoBackupRunAt", event.target.value)
              }
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-600"
              disabled={!settingsForm.autoBackupEnabled}
            />
          </label>
          <label className="text-sm text-slate-300 md:col-span-2">
            Fuso horário (IANA, ex. America/Sao_Paulo)
            <input
              type="text"
              value={settingsForm.autoBackupTimezone}
              onChange={(event) =>
                updateSettingsField("autoBackupTimezone", event.target.value)
              }
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-600"
              disabled={!settingsForm.autoBackupEnabled}
              placeholder="America/Sao_Paulo"
            />
          </label>
          <label className="text-sm text-slate-300">
            Perfil de performance
            <select
              value={settingsForm.performanceProfile}
              onChange={(event) =>
                setPerformanceProfile(
                  event.target.value as
                    | "conservative"
                    | "balanced"
                    | "aggressive"
                    | "custom",
                )
              }
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-600"
            >
              <option value="conservative">Conservador</option>
              <option value="balanced">Balanceado</option>
              <option value="aggressive">Agressivo</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label className="text-sm text-slate-300">
            Formato de compressão
            <select
              value={settingsForm.compressionFormat}
              onChange={(event) =>
                setCompressionFormat(event.target.value as "gz" | "xz")
              }
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-600"
            >
              <option value="gz">gzip (.tar.gz)</option>
              <option value="xz">xz (.tar.xz)</option>
            </select>
          </label>
          <label className="text-sm text-slate-300">
            Nível de compressão
            <input
              type="number"
              min={settingsForm.compressionFormat === "xz" ? 0 : 1}
              max={9}
              value={settingsForm.compressionLevel}
              onChange={(event) =>
                updateSettingsField("compressionLevel", event.target.value)
              }
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-600"
            />
          </label>
          <label className="text-sm text-slate-300">
            Concorrência máxima
            <input
              type="number"
              min={1}
              max={8}
              value={settingsForm.maxConcurrency}
              onChange={(event) =>
                updateSettingsField("maxConcurrency", event.target.value)
              }
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-600"
            />
          </label>
          <label className="text-sm text-slate-300 md:col-span-2">
            Exclusões (um padrão por linha)
            <textarea
              value={settingsForm.excludePatternsText}
              onChange={(event) =>
                updateSettingsField("excludePatternsText", event.target.value)
              }
              rows={4}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100 outline-none focus:border-emerald-600"
              placeholder={"node_modules\n*.tmp\n.cache/*"}
            />
          </label>
        </div>
        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-slate-300">
              Pastas incluídas neste agendamento
            </h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!settingsForm.autoBackupEnabled || loadingFolders}
                onClick={() => selectAllAutoBackupFolders()}
                className="rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-40"
              >
                Marcar todas
              </button>
              <button
                type="button"
                disabled={!settingsForm.autoBackupEnabled}
                onClick={() => clearAutoBackupFolders()}
                className="rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-40"
              >
                Limpar
              </button>
            </div>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            As mesmas pastas configuradas em Backups; só as marcadas rodam no
            horário automático. O backup manual na outra página continua usando a
            seleção daquele ecrã.
          </p>
          {loadingFolders && (
            <p className="mt-2 text-xs text-slate-500">Carregando pastas...</p>
          )}
          {!loadingFolders && folders.length === 0 && (
            <p className="mt-2 text-xs text-amber-200/90">
              Adicione pastas em Backups antes de agendar.
            </p>
          )}
          {!loadingFolders && folders.length > 0 && (
            <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto text-sm">
              {folders.map((folder) => (
                <li key={folder.id} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    id={`sched-${folder.id}`}
                    className="mt-1"
                    disabled={!settingsForm.autoBackupEnabled}
                    checked={settingsForm.autoBackupFolderIds.includes(folder.id)}
                    onChange={() => toggleAutoBackupFolderId(folder.id)}
                  />
                  <label
                    htmlFor={`sched-${folder.id}`}
                    className="cursor-pointer font-mono text-xs text-slate-300"
                  >
                    {toHostPath(folder.path)}
                  </label>
                </li>
              ))}
            </ul>
          )}
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
          </>
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
