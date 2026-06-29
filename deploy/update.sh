#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="${APP_NAME:-outil-pme}"
APP_DIR="${APP_DIR:-/opt/outil-pme}"
APP_USER="${APP_USER:-outilpme}"
BRANCH="${BRANCH:-main}"

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

run_as_app() {
  if [ "$(id -u)" -eq 0 ]; then
    sudo -H -u "$APP_USER" "$@"
  else
    "$@"
  fi
}

main() {
  if [ ! -d "$APP_DIR/.git" ]; then
    echo "Depot git introuvable dans $APP_DIR." >&2
    exit 1
  fi

  log "Mise a jour du code"
  run_as_app git -C "$APP_DIR" fetch origin "$BRANCH"
  run_as_app git -C "$APP_DIR" checkout "$BRANCH"
  run_as_app git -C "$APP_DIR" pull --ff-only origin "$BRANCH"

  log "Installation des dependances"
  cd "$APP_DIR"
  if [ -f package-lock.json ]; then
    run_as_app npm ci --omit=dev
  else
    run_as_app npm install --omit=dev
  fi

  log "Redemarrage PM2"
  run_as_app pm2 reload "$APP_NAME" --update-env || run_as_app pm2 start ecosystem.config.cjs --update-env
  run_as_app pm2 save

  log "Mise a jour terminee"
}

main "$@"
