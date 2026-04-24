#!/bin/bash
set -euo pipefail

# Default config file can be overridden by:
# 1) env var BACKUP_CONFIG_FILE
# 2) first script argument
BACKUP_CONFIG_FILE="${BACKUP_CONFIG_FILE:-${1:-/config/backup.conf}}"

# Default values (overridden by config file)
# Keep defaults aligned with container mounts (/data/origem, /data/backup).
DEFAULT_ORIGEM="/data/origem/aninha"
DEFAULT_DESTINO="/data/backup/aninha"
DEFAULT_FILE_PREFIX="backup_aninha"
DEFAULT_RETENTION_DAYS=1
DEFAULT_LOG_FILE=""

log() {
  local msg="$1"
  local ts
  ts=$(date "+%Y-%m-%d %H:%M:%S")
  echo "[$ts] $msg"
  if [[ -n "${LOG_FILE:-}" ]]; then
    mkdir -p "$(dirname "$LOG_FILE")"
    echo "[$ts] $msg" >> "$LOG_FILE"
  fi
}

log_multiline() {
  while IFS= read -r line; do
    log "$line"
  done
}

ensure_command() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    log "Required command not found: $cmd"
    exit 1
  fi
}

load_config() {
  local fallback_config="/hdds/main/documents/projects/backup_webapp/backup_sync/backup.conf"

  if [[ -f "$BACKUP_CONFIG_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$BACKUP_CONFIG_FILE"
  elif [[ -f "$fallback_config" ]]; then
    log "Warning: config file not found at $BACKUP_CONFIG_FILE; using fallback $fallback_config."
    BACKUP_CONFIG_FILE="$fallback_config"
    # shellcheck disable=SC1091
    source "$BACKUP_CONFIG_FILE"
  else
    log "Warning: config file not found at $BACKUP_CONFIG_FILE (and no fallback); using defaults."
  fi

  ORIGEM="${ORIGEM:-$DEFAULT_ORIGEM}"
  DESTINO="${DESTINO:-$DEFAULT_DESTINO}"
  FILE_PREFIX="${FILE_PREFIX:-$DEFAULT_FILE_PREFIX}"
  RETENTION_DAYS="${RETENTION_DAYS:-$DEFAULT_RETENTION_DAYS}"
  LOG_FILE="${LOG_FILE:-$DEFAULT_LOG_FILE}"

  # If JOBS is undefined or empty, create a single job from simple fields
  if ! declare -p JOBS >/dev/null 2>&1; then
    JOBS=("${FILE_PREFIX}|${ORIGEM}|${DESTINO}")
  elif [[ ${#JOBS[@]} -eq 0 ]]; then
    JOBS=("${FILE_PREFIX}|${ORIGEM}|${DESTINO}")
  fi
}

parse_job() {
  local job_line="$1"
  IFS='|' read -r JOB_PREFIX JOB_ORIGEM JOB_DESTINO <<< "$job_line"

  if [[ -z "${JOB_PREFIX:-}" || -z "${JOB_ORIGEM:-}" || -z "${JOB_DESTINO:-}" ]]; then
    log "Invalid job (expected: prefix|source|destination): '$job_line'"
    exit 1
  fi

  JOB_DESTINO="${JOB_DESTINO%/}/"
}

prepare_environment() {
  ensure_command tar
  ensure_command find
  ensure_command df

  for job in "${JOBS[@]}"; do
    parse_job "$job"

    if [[ ! -d "$JOB_ORIGEM" ]]; then
      log "Source directory does not exist for job '${JOB_PREFIX}': $JOB_ORIGEM"
      exit 1
    fi

    mkdir -p "$JOB_DESTINO"
  done

  if [[ -n "$LOG_FILE" ]]; then
    mkdir -p "$(dirname "$LOG_FILE")"
  fi
}

remove_old_backups() {
  if [[ "${RETENTION_DAYS:-0}" -lt 0 ]]; then
    log "RETENTION_DAYS cannot be negative."
    exit 1
  fi

  if [[ "${RETENTION_DAYS:-0}" -eq 0 ]]; then
    log "RETENTION_DAYS=0, no old backups will be removed."
    return
  fi

  for job in "${JOBS[@]}"; do
    parse_job "$job"
    local pattern="${JOB_PREFIX}_*.tar.*"
    while IFS= read -r arquivo; do
      [[ -z "$arquivo" ]] && continue
      log "Removing old backup (${JOB_PREFIX}): $arquivo"
      rm -f "$arquivo"
    done < <(find "$JOB_DESTINO" -name "$pattern" -type f -mtime +"$RETENTION_DAYS")
  done
}

run_backup() {
  for job in "${JOBS[@]}"; do
    parse_job "$job"

    local data arquivo inicio fim duracao minutos segundos destino_final

    data=$(date +%Y%m%d_%H%M%S)
    arquivo="${JOB_PREFIX}_${data}.tar.xz"
    destino_final="${JOB_DESTINO}${arquivo}"

    log "----------------------------------------"
    log "Backup start (${JOB_PREFIX}): $(date)"
    log "Source: $JOB_ORIGEM"
    log "Target: $destino_final"

    inicio=$(date +%s)

    if [[ -n "$LOG_FILE" ]]; then
      if tar -cJf "$destino_final" -C "$JOB_ORIGEM" . >> "$LOG_FILE" 2>&1; then
        :
      else
        log "Error during backup (${JOB_PREFIX}) (see $LOG_FILE for details)."
        exit 1
      fi
    else
      if ! tar -cJf "$destino_final" -C "$JOB_ORIGEM" .; then
        log "Error during backup (${JOB_PREFIX})."
        exit 1
      fi
    fi

    fim=$(date +%s)
    duracao=$((fim - inicio))
    minutos=$((duracao / 60))
    segundos=$((duracao % 60))

    log "Backup finished (${JOB_PREFIX}) at $(date)"
    log "Duration (${JOB_PREFIX}): ${minutos} minutes and ${segundos} seconds"
  done
}

report_disk() {
  log "Free space after backups:"
  # Report unique destination paths
  local paths=()
  for job in "${JOBS[@]}"; do
    parse_job "$job"
    paths+=("$JOB_DESTINO")
  done
  # Remove duplicados
  local unique=()
  for p in "${paths[@]}"; do
    local seen=false
    for u in "${unique[@]}"; do
      if [[ "$u" == "$p" ]]; then
        seen=true
        break
      fi
    done
    if [[ "$seen" == false ]]; then
      unique+=("$p")
    fi
  done

  df -h "${unique[@]}" | log_multiline
  log "----------------------------------------"
}

main() {
  load_config
  prepare_environment
  remove_old_backups
  run_backup
  report_disk
}

main "$@"

