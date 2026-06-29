#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/outil-pme}"
STORAGE_DIR="${STORAGE_DIR:-/var/lib/outil-pme/storage}"
BACKUP_DIR="${BACKUP_DIR:-}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

load_env() {
  local env_file="$APP_DIR/.env"
  if [ -f "$env_file" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$env_file"
    set +a
  fi

  STORAGE_DIR="${OUTIL_PME_STORAGE_DIR:-$STORAGE_DIR}"
  BACKUP_DIR="${BACKUP_DIR:-$STORAGE_DIR/backups}"
  DB_PATH="${OUTIL_PME_DB_PATH:-$STORAGE_DIR/data/app.db}"
  QUOTE_PHOTO_DIR="${OUTIL_PME_QUOTE_PHOTO_DIR:-$STORAGE_DIR/quote_photos}"
  MEASUREMENT_PHOTO_DIR="${OUTIL_PME_MEASUREMENT_PHOTO_DIR:-$STORAGE_DIR/measurement_photos}"
  PDF_DIR="${OUTIL_PME_PDF_DIR:-$STORAGE_DIR/pdf}"
  CLIENTS_DIR="${OUTIL_PME_CLIENTS_DIR:-$STORAGE_DIR/clients}"
  ATTACHMENTS_DIR="${OUTIL_PME_ATTACHMENTS_DIR:-$STORAGE_DIR/client_orders_files}"
}

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

copy_if_exists() {
  local source="$1"
  local target="$2"
  if [ -e "$source" ]; then
    mkdir -p "$(dirname "$target")"
    cp -a "$source" "$target"
  fi
}

backup_sqlite() {
  local target="$1"
  mkdir -p "$(dirname "$target")"

  if [ ! -f "$DB_PATH" ]; then
    log "Base SQLite introuvable: $DB_PATH"
    return
  fi

  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$DB_PATH" ".backup '$target'"
  else
    cp -a "$DB_PATH" "$target"
  fi
}

main() {
  load_env

  local stamp
  stamp="$(date '+%Y%m%d-%H%M%S')"
  local work_dir="$BACKUP_DIR/work-$stamp"
  local archive="$BACKUP_DIR/outil-pme-backup-$stamp.tar.gz"

  log "Preparation sauvegarde"
  mkdir -p "$work_dir"

  log "Sauvegarde SQLite"
  backup_sqlite "$work_dir/sqlite/app.db"

  log "Sauvegarde photos, PDF et pieces jointes"
  copy_if_exists "$QUOTE_PHOTO_DIR" "$work_dir/files/quote_photos"
  copy_if_exists "$MEASUREMENT_PHOTO_DIR" "$work_dir/files/measurement_photos"
  copy_if_exists "$PDF_DIR" "$work_dir/files/pdf"
  copy_if_exists "$CLIENTS_DIR" "$work_dir/files/clients"
  copy_if_exists "$ATTACHMENTS_DIR" "$work_dir/files/client_orders_files"

  log "Creation archive"
  tar -czf "$archive" -C "$work_dir" .
  rm -rf "$work_dir"

  if [ "$RETENTION_DAYS" -gt 0 ] 2>/dev/null; then
    find "$BACKUP_DIR" -maxdepth 1 -name 'outil-pme-backup-*.tar.gz' -type f -mtime +"$RETENTION_DAYS" -delete
  fi

  log "Archive creee: $archive"
}

main "$@"
