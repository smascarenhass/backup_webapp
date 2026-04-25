# Serviço `backup_sync` (backup externo)

Este diretório contém o **container de backup agendado** usado pelo painel (via Docker): imagem **Alpine**, **`supercronic`** (cron para containers) e o script **`backup_sync.sh`**.

O **pipeline de backup compactado do webapp** (`.tar.gz` gerado pela API) é outro fluxo; ele grava diretamente em `backupMountPath` (tipicamente `/hdds/backup`).  
Este serviço grava em subpastas sob **`/data/backup/sync/...`** dentro do container (no host: **`/hdds/backup/sync/...`**) para **não misturar** com os arquivos do webapp.

## Arquivos

| Arquivo | Função |
|--------|--------|
| `Dockerfile` | Imagem e cópia dos scripts |
| `entrypoint.sh` | Monta `/etc/supercronic.cron` e executa `supercronic` |
| `backup_sync.sh` | Jobs, retenção, `tar` (`.tar.xz`), logs |
| `backup.conf` | Jobs (`JOBS`), retenção, log, `CRON_SCHEDULE` |
| `logs/` | Logs montados no host (gitignored) |

## Como sobe com o restante do projeto

Na raiz do repositório:

```bash
cd /hdds/main/documents/projects/backup_webapp
docker compose up -d --build backup_sync
```

Ou tudo junto:

```bash
docker compose up -d --build
```

Definição do serviço: [`docker-compose.yml`](../../docker-compose.yml) (serviço `backup_sync`).

## Volumes (host → container)

Conforme o `docker-compose.yml` na raiz:

| Host | Container | Modo |
|------|-------------|------|
| `./backend/backup_sync/backup.conf` | `/config/backup.conf` | ro |
| `/hdds/main` | `/data/origem` | ro |
| `/hdds/backup` | `/data/backup` | rw |
| `./backend/backup_sync/logs` | `/var/log/backup` | rw |

## Configuração (`backup.conf`)

- **`JOBS`**: linhas `PREFIXO|origem_no_container|destino_no_container`.
- **`RETENTION_DAYS`**: retenção por idade (dias); `0` desliga remoção.
- **`LOG_FILE`**: arquivo de log dentro do container (ex.: `/var/log/backup/...`).
- **`CRON_SCHEDULE`**: após o `entrypoint.sh` dar `source` neste arquivo, **este valor manda** no agendamento efetivo.
- **`COMPRESS_FORMAT`**: `gz` (mais rápido) ou `xz` (maior compressão).
- **`COMPRESS_LEVEL`**: nível de compressão (`gz`: 1-9, `xz`: 0-9).
- **`JOBS_CONCURRENCY`**: jobs paralelos (1-8, default balanceado 2).
- **`BACKUP_EXCLUDES`**: padrões separados por vírgula para `tar --exclude` (ex.: `node_modules,.cache/*`).

O script agora também registra métricas por job:

- duração
- tamanho final (bytes)
- throughput aproximado (MB/s)

## Operação útil

```bash
docker logs -f backup_sync
docker exec backup_sync /app/backup_sync.sh
```

## Integração com a API do webapp

A API (quando configurada) usa:

- `docker exec backup_sync /app/backup_sync.sh`

Variáveis no compose da API: `BACKUP_CONTAINER_NAME`, `BACKUP_SCRIPT_PATH`.
