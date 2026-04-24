import { useBackupFoldersController } from "./controller";

function formatDate(value: string | null) {
  if (!value) {
    return "Nunca";
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

export function BackupFoldersView() {
  const {
    health,
    loadingHealth,
    folders,
    loadingFolders,
    settings,
    settingsForm,
    savingSettings,
    metrics,
    loadingMetrics,
    pathInput,
    setPathInput,
    directorySuggestions,
    loadingSuggestions,
    highlightedSuggestionIndex,
    showSuggestions,
    selectedFolderIds,
    selectedCount,
    allSelected,
    hasFolders,
    busy,
    message,
    error,
    addFolder,
    updateSettingsField,
    saveSettings,
    selectDirectorySuggestion,
    openDirectorySuggestions,
    clearDirectorySuggestions,
    handlePathInputKeyDown,
    removeFolder,
    triggerBackup,
    toggleFolderSelection,
    selectAll,
    clearSelection,
    reload,
    triggerLabel,
    toHostPath,
    toRuntimePath,
  } = useBackupFoldersController();

  const formatBytes = (value: number | null | undefined) => {
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
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          Configuração de backups
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Cadastre as pastas que devem entrar no backup e acompanhe quando cada
          uma foi processada.
        </p>
      </header>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 shadow-lg">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Status da API
        </h2>
        {loadingHealth && <p className="mt-3 text-slate-400">Carregando...</p>}
        {!loadingHealth && health && (
          <p className="mt-3 text-sm text-emerald-400">
            {health.service}: {health.status}
          </p>
        )}
      </section>

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

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 shadow-lg">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Adicionar pasta
        </h2>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <div className="relative w-full">
            <input
              type="text"
              value={pathInput}
              onChange={(event) => setPathInput(event.target.value)}
              onFocus={() => {
                openDirectorySuggestions();
              }}
              onKeyDown={(event) => {
                const handled = handlePathInputKeyDown(event.key);
                if (handled) {
                  event.preventDefault();
                }
              }}
              onBlur={() => {
                setTimeout(() => {
                  clearDirectorySuggestions();
                }, 120);
              }}
              placeholder="/caminho/da/pasta"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-600"
            />
            {showSuggestions && (
              <div
                role="listbox"
                className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-700 bg-slate-950 shadow-lg"
              >
                {loadingSuggestions && (
                  <p className="px-3 py-2 text-sm text-slate-400">Buscando pastas...</p>
                )}
                {!loadingSuggestions && directorySuggestions.length === 0 && (
                  <p className="px-3 py-2 text-sm text-slate-400">
                    Nenhum diretório encontrado neste nível.
                  </p>
                )}
                {!loadingSuggestions &&
                  directorySuggestions.map((suggestion, index) => {
                    const highlighted = index === highlightedSuggestionIndex;
                    return (
                      <button
                        key={suggestion.path}
                        role="option"
                        aria-selected={highlighted}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => selectDirectorySuggestion(suggestion.path)}
                        className={`block w-full px-3 py-2 text-left text-sm ${
                          highlighted
                            ? "bg-emerald-700/40 text-emerald-100"
                            : "text-slate-200 hover:bg-slate-800"
                        }`}
                      >
                        <span className="font-medium">{suggestion.name}</span>
                        <span className="ml-2 font-mono text-xs text-slate-400">
                          {suggestion.path}
                        </span>
                      </button>
                    );
                  })}
              </div>
            )}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void addFolder()}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            Adicionar
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 shadow-lg">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
            Pastas configuradas
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!hasFolders || allSelected}
              onClick={selectAll}
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
            >
              Selecionar todas
            </button>
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={clearSelection}
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
            >
              Limpar seleção
            </button>
            <button
              type="button"
              onClick={() => void reload()}
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700"
            >
              Atualizar
            </button>
          </div>
        </div>

        {loadingFolders && <p className="mt-3 text-slate-400">Carregando...</p>}
        {!loadingFolders && folders.length === 0 && (
          <p className="mt-3 text-sm text-slate-400">
            Nenhuma pasta configurada até o momento.
          </p>
        )}

        {!loadingFolders && folders.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="text-slate-500">
                  <th className="px-2 py-2">Sel.</th>
                  <th className="px-2 py-2">Pasta</th>
                  <th className="px-2 py-2">Último backup</th>
                  <th className="px-2 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {folders.map((folder) => {
                  const checked = selectedFolderIds.includes(folder.id);
                  return (
                    <tr
                      key={folder.id}
                      className="border-t border-slate-800 text-slate-200"
                    >
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleFolderSelection(folder.id)}
                        />
                      </td>
                      <td className="px-2 py-2 font-mono text-xs sm:text-sm">
                        {toHostPath(folder.path)}
                      </td>
                      <td className="px-2 py-2 text-slate-300">
                        {formatDate(folder.lastBackupAt)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void removeFolder(folder.id)}
                          className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-600 disabled:opacity-50"
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 shadow-lg">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Executar backup
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Com nada selecionado, o backup é disparado para todas as pastas
          configuradas.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void triggerBackup()}
          className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
        >
          {busy ? "Enviando..." : triggerLabel}
        </button>
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
