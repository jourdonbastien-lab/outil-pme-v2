#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/outil-pme-v2}"
STORAGE_DIR="${STORAGE_DIR:-$APP_DIR/storage}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
KEEP_BACKUPS="${KEEP_BACKUPS:-30}"

DB_PATH="$STORAGE_DIR/data/app.db"
UPLOADS_DIR="$STORAGE_DIR/uploads"
CLIENTS_DIR="$STORAGE_DIR/clients"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

copy_if_exists() {
  local source="$1"
  local target="$2"

  if [ -e "$source" ]; then
    mkdir -p "$(dirname "$target")"
    cp -a "$source" "$target"
  else
    log "Ignore, introuvable: $source"
  fi
}

backup_sqlite() {
  local target="$1"

  if [ ! -f "$DB_PATH" ]; then
    log "Base SQLite introuvable: $DB_PATH"
    exit 1
  fi

  mkdir -p "$(dirname "$target")"

  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$DB_PATH" ".backup '$target'"
  else
    cp -a "$DB_PATH" "$target"
  fi
}

cleanup_old_backups() {
  local count

  count="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'outil-pme-backup-*.tar.gz' | wc -l | tr -d ' ')"
  if [ "$count" -le "$KEEP_BACKUPS" ]; then
    return
  fi

  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'outil-pme-backup-*.tar.gz' -print \
    | sort \
    | head -n "$((count - KEEP_BACKUPS))" \
    | xargs -r rm -f
}

main() {
  local stamp
  local work_dir
  local archive

  stamp="$(date '+%Y%m%d-%H%M%S')"
  work_dir="$BACKUP_DIR/work-$stamp"
  archive="$BACKUP_DIR/outil-pme-backup-$stamp.tar.gz"

  mkdir -p "$BACKUP_DIR" "$work_dir"

  log "Sauvegarde SQLite: $DB_PATH"
  backup_sqlite "$work_dir/storage/data/app.db"

  log "Sauvegarde fichiers"
  copy_if_exists "$UPLOADS_DIR" "$work_dir/storage/uploads"
  copy_if_exists "$CLIENTS_DIR" "$work_dir/storage/clients"

  log "Creation archive: $archive"
  tar -czf "$archive" -C "$work_dir" .
  rm -rf "$work_dir"

  cleanup_old_backups

  log "Sauvegarde terminee: $archive"
}

main "$@"
