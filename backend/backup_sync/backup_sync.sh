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
DEFAULT_COMPRESS_FORMAT="gz"
DEFAULT_COMPRESS_LEVEL=3
DEFAULT_JOBS_CONCURRENCY=2

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
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  local fallback_config="${script_dir}/backup.conf"

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
  COMPRESS_FORMAT="${COMPRESS_FORMAT:-$DEFAULT_COMPRESS_FORMAT}"
  COMPRESS_LEVEL="${COMPRESS_LEVEL:-$DEFAULT_COMPRESS_LEVEL}"
  JOBS_CONCURRENCY="${JOBS_CONCURRENCY:-$DEFAULT_JOBS_CONCURRENCY}"
  BACKUP_EXCLUDES="${BACKUP_EXCLUDES:-}"

  # If JOBS is undefined or empty, create a single job from simple fields
  if ! declare -p JOBS >/dev/null 2>&1; then
    JOBS=("${FILE_PREFIX}|${ORIGEM}|${DESTINO}")
  elif [[ ${#JOBS[@]} -eq 0 ]]; then
    JOBS=("${FILE_PREFIX}|${ORIGEM}|${DESTINO}")
  fi

  if [[ ! "$COMPRESS_FORMAT" =~ ^(gz|xz)$ ]]; then
    log "Invalid COMPRESS_FORMAT='$COMPRESS_FORMAT' (allowed: gz|xz)."
    exit 1
  fi
  if [[ ! "$COMPRESS_LEVEL" =~ ^[0-9]+$ ]]; then
    log "Invalid COMPRESS_LEVEL='$COMPRESS_LEVEL' (0-9)."
    exit 1
  fi
  if [[ ! "$JOBS_CONCURRENCY" =~ ^[0-9]+$ ]] || [[ "$JOBS_CONCURRENCY" -lt 1 ]] || [[ "$JOBS_CONCURRENCY" -gt 8 ]]; then
    log "Invalid JOBS_CONCURRENCY='$JOBS_CONCURRENCY' (1-8)."
    exit 1
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
  local pids=()
  local running=0
  local overall_start
  overall_start=$(date +%s)

  run_single_job() {
    local job_line="$1"
    parse_job "$job_line"
    local data arquivo inicio fim duracao minutos segundos destino_final size_bytes throughput
    local tar_args=()
    local exclude_args=()

    data=$(date +%Y%m%d_%H%M%S)
    if [[ "$COMPRESS_FORMAT" == "xz" ]]; then
      arquivo="${JOB_PREFIX}_${data}.tar.xz"
      tar_args=(-I "xz -${COMPRESS_LEVEL}" -cf)
    else
      arquivo="${JOB_PREFIX}_${data}.tar.gz"
      tar_args=(-I "gzip -${COMPRESS_LEVEL}" -cf)
    fi
    destino_final="${JOB_DESTINO}${arquivo}"

    if [[ -n "$BACKUP_EXCLUDES" ]]; then
      IFS=',' read -r -a excludes_arr <<< "$BACKUP_EXCLUDES"
      for pattern in "${excludes_arr[@]}"; do
        pattern="$(echo "$pattern" | xargs)"
        [[ -z "$pattern" ]] && continue
        if [[ ! "$pattern" =~ ^[a-zA-Z0-9_./*?@+-]+$ ]]; then
          log "Ignoring invalid exclude pattern: $pattern"
          continue
        fi
        exclude_args+=("--exclude=$pattern")
      done
    fi

    log "----------------------------------------"
    log "Backup start (${JOB_PREFIX}): $(date)"
    log "Source: $JOB_ORIGEM"
    log "Target: $destino_final"
    log "Compression (${JOB_PREFIX}): ${COMPRESS_FORMAT}-${COMPRESS_LEVEL}"

    inicio=$(date +%s)

    if [[ -n "$LOG_FILE" ]]; then
      if tar "${tar_args[@]}" "$destino_final" -C "$JOB_ORIGEM" "${exclude_args[@]}" . >> "$LOG_FILE" 2>&1; then
        :
      else
        log "Error during backup (${JOB_PREFIX}) (see $LOG_FILE for details)."
        return 1
      fi
    else
      if ! tar "${tar_args[@]}" "$destino_final" -C "$JOB_ORIGEM" "${exclude_args[@]}" .; then
        log "Error during backup (${JOB_PREFIX})."
        return 1
      fi
    fi

    fim=$(date +%s)
    duracao=$((fim - inicio))
    minutos=$((duracao / 60))
    segundos=$((duracao % 60))
    size_bytes=$(stat -c%s "$destino_final" 2>/dev/null || echo 0)
    if [[ "$duracao" -gt 0 ]]; then
      throughput=$(awk "BEGIN { printf \"%.2f\", ($size_bytes/1024/1024)/$duracao }")
    else
      throughput="0.00"
    fi

    log "Backup finished (${JOB_PREFIX}) at $(date)"
    log "Duration (${JOB_PREFIX}): ${minutos} minutes and ${segundos} seconds"
    log "Metrics (${JOB_PREFIX}): size=${size_bytes} bytes throughput=${throughput} MB/s"
    return 0
  }

  for job in "${JOBS[@]}"; do
    run_single_job "$job" &
    pids+=("$!")
    running=$((running + 1))

    if [[ "$running" -ge "$JOBS_CONCURRENCY" ]]; then
      if ! wait -n; then
        log "At least one backup job failed."
        exit 1
      fi
      running=$((running - 1))
    fi
  done

  for pid in "${pids[@]}"; do
    if ! wait "$pid"; then
      log "At least one backup job failed (pid=$pid)."
      exit 1
    fi
  done

  local overall_end overall_duration
  overall_end=$(date +%s)
  overall_duration=$((overall_end - overall_start))
  log "Backup run summary: jobs=${#JOBS[@]} concurrency=${JOBS_CONCURRENCY} duration=${overall_duration}s"
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

