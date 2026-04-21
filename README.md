# backup_webapp

Painel web mínimo (React + TypeScript + Vite + Tailwind) com API Node para integrar ao sistema de backup Docker (`backup_sync`).

## Estrutura

- **`src/pages/<Nome>/view.tsx`** — UI da página.
- **`src/pages/<Nome>/controller.ts`** — lógica, estado e chamadas via services.
- **`src/services/backupService.ts`** — cliente HTTP da API.
- **`backend/`** — API Express (`/api/health`, `POST /api/backup/trigger`).

## Desenvolvimento local

```bash
cd /hdds/main/services/backup_webapp
npm install
cd backend && npm install && cd ..
# Terminal 1
cd backend && npm start
# Terminal 2
npm run dev
```

O Vite encaminha `/api` para `http://127.0.0.1:8011`.

## Docker Compose

Portas:

- **Frontend (nginx):** `5181` → container `80`
- **API:** `8011` (opcional para depuração; o browser pode usar só `5181` com proxy)

```bash
cd /hdds/main/services/backup_webapp
docker compose up -d --build
```

- UI: `http://<host>:5181`
- Health via proxy: `http://<host>:5181/api/health`

A API monta **`/var/run/docker.sock`** e executa:

`docker exec <BACKUP_CONTAINER_NAME> <BACKUP_SCRIPT_PATH>`

Variáveis (padrão no `docker-compose.yml`):

- `BACKUP_CONTAINER_NAME=backup_sync`
- `BACKUP_SCRIPT_PATH=/app/backup_sync.sh`

Garanta que o container do backup (`/hdds/main/services/backup`) esteja em execução com esse nome.

## Variáveis

| Variável | Onde | Descrição |
|----------|------|-----------|
| `VITE_API_URL` | build frontend | Base da API; vazio = mesmo host (recomendado no Docker com nginx). |

## Licença

Uso interno / conforme repositório.
