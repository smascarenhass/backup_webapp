# backup_webapp

Minimal web panel (React + TypeScript + Vite + Tailwind) with a Node API. The repository also contains the **external** `backup_sync` service (supercronic) under `backend/backup_sync/`.

Documentação detalhada: [`backend/backup_sync/README.md`](backend/backup_sync/README.md).

## Structure

- **`frontend/src/pages/<PageName>/view.tsx`** - page UI.
- **`frontend/src/pages/<PageName>/controller.ts`** - page logic, state, and service calls.
- **`frontend/src/services/backupService.ts`** - API HTTP client.
- **`backend/`** - Express API (`/api/health`, `POST /api/backup/trigger`).
- **`backend/backup_sync/`** - serviço Docker `backup_sync` (supercronic + `backup_sync.sh`) e `backup.conf`.

## Layout dos arquivos de backup (API)

Os `.tar.gz` gerados pelo painel ficam sob o `backupMountPath` configurado, em subpastas separadas de outros usos do mesmo volume (ex.: `backup_sync`):

`<backupMountPath>/webapp/<YYYY>/<MM>/<DD>/<slug>-v<versão>_<HHMMSS>.tar.gz`

- **`<YYYY>/<MM>/<DD>` e `_<HHMMSS>`** são em **UTC** (o horário local aparece na UI em Verificações).
- **`slug`** deriva do caminho da pasta dentro do `mainMountPath` (prefixo removido, `/` viram `__`).
- A **versão** (`vN`) é incremental por pasta configurada e bate com o campo `version` no histórico.

### Limpeza de `.tar.gz` antigos na raiz do backup

Se ainda existirem arquivos **só no primeiro nível** do diretório de backup (ex.: `/hdds/backup/arquivo.tar.gz`), use o script abaixo **a partir do diretório `backend/`**. Sem `--yes` ele apenas lista (dry-run); com `--yes` apaga. Opcional: `--prune-history` remove entradas do histórico (`data/backup-folders.json`) que apontavam para esses caminhos.

```bash
cd /hdds/main/documents/projects/backup_webapp/backend
npm run cleanup:legacy-targz
npm run cleanup:legacy-targz -- --yes
npm run cleanup:legacy-targz -- --yes --prune-history
# ou caminho explícito:
node scripts/cleanup-legacy-root-targz.mjs --backup-root /hdds/backup --yes
```

## Backup automático (painel)

Em **Settings**, o agendamento interno do webapp é **uma vez por dia**:

- **Horário** e **fuso IANA** (ex.: `America/Sao_Paulo`) definem quando o tick da API dispara o pipeline.
- Só as **pastas marcadas** na secção “Pastas incluídas neste agendamento” entram no backup automático (as pastas continuam a ser as mesmas configuradas em **Backups**).
- O backup **manual** na página Backups usa a seleção dessa página; não é o mesmo estado que o agendamento.
- O ficheiro [`backend/data/backup-settings.json`](backend/data/backup-settings.json) guarda `runAtHour`, `runAtMinute`, `timezone`, `folderIds` e `lastScheduledRunDate` (data `YYYY-MM-DD` no fuso escolhida, para no máximo um disparo bem-sucedido por dia). Se `folderIds` for `null` (configuração antiga), o servidor trata como **todas** as pastas até gravares de novo nas Settings.

## Local development

```bash
cd /hdds/main/documents/projects/backup_webapp
cd frontend && npm install && cd ..
cd backend && npm install && cd ..
# Terminal 1
cd backend && npm start
# Terminal 2
cd frontend && npm run dev
```

Vite proxies `/api` to `http://127.0.0.1:8011`.

## Docker Compose

Ports:

- **Frontend (nginx):** `5181` -> container `80`
- **API:** `8011` (optional for debugging; the browser can use only `5181` through proxy)

```bash
cd /hdds/main/documents/projects/backup_webapp
docker compose up -d --build
```

- UI: `http://<host>:5181`
- Health via proxy: `http://<host>:5181/api/health`

The API mounts **`/var/run/docker.sock`** and runs:

`docker exec <BACKUP_CONTAINER_NAME> <BACKUP_SCRIPT_PATH>`

Variables (defaults in `docker-compose.yml`):

- `BACKUP_CONTAINER_NAME=backup_sync`
- `BACKUP_SCRIPT_PATH=/app/backup_sync.sh`

The `backup_sync` service is defined in this repo (`docker-compose.yml`, service `backup_sync`). Start it with:

```bash
cd /hdds/main/documents/projects/backup_webapp
docker compose up -d --build backup_sync
```

Or start everything (webapp + backup_sync):

```bash
docker compose up -d --build
```

## Variables

| Variable | Where | Description |
|----------|-------|-------------|
| `VITE_API_URL` | frontend build | API base URL; empty = same host (recommended in Docker with nginx). |

## License

Internal use / according to repository policy.
