import type { BackupFoldersController } from "./controller";

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

type BackupFoldersViewProps = {
  controller: BackupFoldersController;
};

export function BackupFoldersView({ controller }: BackupFoldersViewProps) {
  const {
    health,
    loadingHealth,
    folders,
    loadingFolders,
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
    progress,
    message,
    error,
    addFolder,
    selectDirectorySuggestion,
    openDirectorySuggestions,
    clearDirectorySuggestions,
    handlePathInputKeyDown,
    removeFolder,
    editingFolderId,
    editFolderPathDraft,
    setEditFolderPathDraft,
    startEditingFolder,
    cancelEditingFolder,
    saveEditedFolder,
    triggerBackup,
    toggleFolderSelection,
    selectAll,
    clearSelection,
    reload,
    triggerLabel,
    toHostPath,
  } = controller;

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
          Progresso do backup (manual e automático)
        </h2>
        {!progress && <p className="mt-3 text-slate-400">Carregando progresso...</p>}
        {progress && (
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between text-slate-300">
              <span>
                Tipo:{" "}
                {progress.triggerType === "automatic"
                  ? "Automático"
                  : progress.triggerType === "manual"
                    ? "Manual"
                    : "-"}
              </span>
              <span className="font-medium">
                {progress.progressPct}% ·{" "}
                {progress.processedFolders}/{progress.totalFolders} pastas
              </span>
            </div>
            <div className="h-2 w-full rounded bg-slate-800">
              <div
                className="h-2 rounded bg-emerald-500 transition-all"
                style={{ width: `${Math.max(0, Math.min(100, progress.progressPct))}%` }}
              />
            </div>
            <p className="text-slate-300">{progress.lastMessage}</p>
            {progress.currentFolderPath && (
              <p className="font-mono text-xs text-slate-400">
                Pasta atual: {toHostPath(progress.currentFolderPath)}
              </p>
            )}
            {progress.lastError && (
              <p className="text-red-300">Erro recente: {progress.lastError}</p>
            )}
          </div>
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
                        {editingFolderId === folder.id ? (
                          <div className="flex min-w-[12rem] flex-col gap-2">
                            <input
                              type="text"
                              value={editFolderPathDraft}
                              onChange={(event) =>
                                setEditFolderPathDraft(event.target.value)
                              }
                              className="w-full rounded-lg border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-emerald-600"
                              aria-label="Novo caminho da pasta"
                            />
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void saveEditedFolder()}
                                className="rounded-md bg-emerald-700 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
                              >
                                Salvar
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => cancelEditingFolder()}
                                className="rounded-md bg-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-600 disabled:opacity-50"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          toHostPath(folder.path)
                        )}
                      </td>
                      <td className="px-2 py-2 text-slate-300">
                        {formatDate(folder.lastBackupAt)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            disabled={
                              busy ||
                              (editingFolderId !== null &&
                                editingFolderId !== folder.id)
                            }
                            onClick={() => startEditingFolder(folder)}
                            className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-600 disabled:opacity-50"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            disabled={busy || editingFolderId === folder.id}
                            onClick={() => void removeFolder(folder.id)}
                            className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-600 disabled:opacity-50"
                          >
                            Remover
                          </button>
                        </div>
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
