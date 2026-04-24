# backup_webapp

Minimal web panel (React + TypeScript + Vite + Tailwind) with a Node API. The repository also contains the **external** `backup_sync` service (supercronic) under `backend/backup_sync/`.

Documentação detalhada: [`backend/backup_sync/README.md`](backend/backup_sync/README.md).

## Structure

- **`frontend/src/pages/<PageName>/view.tsx`** - page UI.
- **`frontend/src/pages/<PageName>/controller.ts`** - page logic, state, and service calls.
- **`frontend/src/services/backupService.ts`** - API HTTP client.
- **`backend/`** - Express API (`/api/health`, `POST /api/backup/trigger`).
- **`backend/backup_sync/`** - serviço Docker `backup_sync` (supercronic + `backup_sync.sh`) e `backup.conf`.

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
