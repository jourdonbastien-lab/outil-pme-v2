#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/outil-pme-v2}"
STORAGE_DIR="${STORAGE_DIR:-$APP_DIR/storage}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"

DB_PATH="$STORAGE_DIR/data/app.db"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
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

backup_storage() {
  local target="$1"

  if [ ! -d "$STORAGE_DIR" ]; then
    log "Dossier storage introuvable: $STORAGE_DIR"
    exit 1
  fi

  mkdir -p "$target"

  tar \
    --exclude='./backups' \
    --exclude='./backups/*' \
    --exclude='./data/app.db' \
    -cf - \
    -C "$STORAGE_DIR" . \
    | tar -xf - -C "$target"
}

main() {
  local stamp
  local work_dir
  local archive

  stamp="$(date '+%Y%m%d-%H%M%S')"
  work_dir="$BACKUP_DIR/work-$stamp"
  archive="$BACKUP_DIR/outil-pme-backup-$stamp.tar.gz"

  mkdir -p "$BACKUP_DIR" "$work_dir"

  log "Sauvegarde complete du dossier storage: $STORAGE_DIR"
  backup_storage "$work_dir/storage"

  log "Sauvegarde SQLite coherente: $DB_PATH"
  backup_sqlite "$work_dir/storage/data/app.db"

  log "Creation archive: $archive"
  tar -czf "$archive" -C "$work_dir" .
  rm -rf "$work_dir"

  log "Fichier backup cree: $archive"
}

main "$@"
