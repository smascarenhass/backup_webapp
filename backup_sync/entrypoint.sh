#!/bin/bash
set -euo pipefail

CRON_SCHEDULE="${CRON_SCHEDULE:-}"
BACKUP_CONFIG_FILE="${BACKUP_CONFIG_FILE:-/config/backup.conf}"
SCHEDULE_FILE="/etc/supercronic.cron"

# Permite definir CRON_SCHEDULE dentro do arquivo de configuração.
if [[ -f "$BACKUP_CONFIG_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$BACKUP_CONFIG_FILE"
fi

if [[ -z "${CRON_SCHEDULE:-}" ]]; then
  CRON_SCHEDULE="0 3 * * *"
fi

echo "${CRON_SCHEDULE} /app/backup_sync.sh" > "$SCHEDULE_FILE"

if [[ ! -f "$BACKUP_CONFIG_FILE" ]]; then
  echo "Warning: config file not found at ${BACKUP_CONFIG_FILE}; using script defaults."
fi

exec /usr/bin/supercronic "$SCHEDULE_FILE"

