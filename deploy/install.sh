#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="${APP_NAME:-outil-pme}"
APP_DIR="${APP_DIR:-/opt/outil-pme}"
APP_USER="${APP_USER:-outilpme}"
REPO_URL="${REPO_URL:-}"
BRANCH="${BRANCH:-main}"
DOMAIN="${DOMAIN:-_}"
PORT="${PORT:-3000}"
STORAGE_DIR="${STORAGE_DIR:-/var/lib/outil-pme/storage}"
APP_BASE_URL="${APP_BASE_URL:-}"

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    echo "Ce script doit etre execute en root ou avec sudo." >&2
    exit 1
  fi
}

install_node_lts() {
  log "Installation de Node.js LTS"
  apt-get update
  apt-get install -y ca-certificates curl gnupg git sudo build-essential python3 make g++ sqlite3 tar
  curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
  apt-get update
  apt-get install -y nodejs
}

install_pm2_nginx() {
  log "Installation de PM2 et Nginx"
  npm install -g pm2
  apt-get install -y nginx
  systemctl enable nginx
}

create_user_and_dirs() {
  log "Creation utilisateur et dossiers"
  if ! id "$APP_USER" >/dev/null 2>&1; then
    useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
  fi

  mkdir -p "$APP_DIR"
  mkdir -p "$STORAGE_DIR"/{data,clients,client_orders_files,quote_photos,measurement_photos,pdf,backups}
  chown -R "$APP_USER":"$APP_USER" "$APP_DIR" "$STORAGE_DIR"
}

install_application_code() {
  log "Installation du code applicatif"
  if [ -n "$REPO_URL" ]; then
    if [ -d "$APP_DIR/.git" ]; then
      sudo -H -u "$APP_USER" git -C "$APP_DIR" fetch origin "$BRANCH"
      sudo -H -u "$APP_USER" git -C "$APP_DIR" checkout "$BRANCH"
      sudo -H -u "$APP_USER" git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
    else
      rm -rf "$APP_DIR"
      sudo -H -u "$APP_USER" git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
    fi
  elif [ ! -f "$APP_DIR/package.json" ]; then
    echo "REPO_URL est requis si le projet n'est pas deja present dans $APP_DIR." >&2
    exit 1
  fi
}

write_env_file() {
  log "Configuration .env"
  local env_file="$APP_DIR/.env"
  if [ -f "$env_file" ]; then
    log ".env existe deja, conservation du fichier existant"
    return
  fi

  local session_secret
  session_secret="$(openssl rand -hex 32)"
  local app_base_url="$APP_BASE_URL"
  if [ -z "$app_base_url" ]; then
    if [ "$DOMAIN" = "_" ]; then
      app_base_url="http://localhost:$PORT"
    else
      app_base_url="http://$DOMAIN"
    fi
  fi

  cat > "$env_file" <<EOF
NODE_ENV=production
HOST=127.0.0.1
PORT=$PORT
APP_BASE_URL=$app_base_url
TRUST_PROXY=true
SESSION_SECRET=$session_secret
SESSION_COOKIE_SECURE=false
SESSION_COOKIE_SAMESITE=lax

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=$app_base_url/google/callback

OUTIL_PME_STORAGE_DIR=$STORAGE_DIR
OUTIL_PME_DATA_DIR=$STORAGE_DIR/data
OUTIL_PME_DB_PATH=$STORAGE_DIR/data/app.db
OUTIL_PME_CLIENTS_DIR=$STORAGE_DIR/clients
OUTIL_PME_ATTACHMENTS_DIR=$STORAGE_DIR/client_orders_files
OUTIL_PME_QUOTE_PHOTO_DIR=$STORAGE_DIR/quote_photos
OUTIL_PME_MEASUREMENT_PHOTO_DIR=$STORAGE_DIR/measurement_photos
OUTIL_PME_PDF_DIR=$STORAGE_DIR/pdf

DB_CLIENT=sqlite
EOF

  chown "$APP_USER":"$APP_USER" "$env_file"
  chmod 600 "$env_file"
}

install_dependencies() {
  log "Installation des dependances npm"
  cd "$APP_DIR"
  if [ -f package-lock.json ]; then
    sudo -H -u "$APP_USER" npm ci --omit=dev
  else
    sudo -H -u "$APP_USER" npm install --omit=dev
  fi
}

configure_nginx() {
  log "Configuration Nginx"
  cat > "/etc/nginx/sites-available/$APP_NAME" <<EOF
server {
  listen 80;
  server_name $DOMAIN;

  client_max_body_size 50m;

  location / {
    proxy_pass http://127.0.0.1:$PORT;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
  }

  location /healthz {
    proxy_pass http://127.0.0.1:$PORT/healthz;
    access_log off;
  }
}
EOF

  ln -sfn "/etc/nginx/sites-available/$APP_NAME" "/etc/nginx/sites-enabled/$APP_NAME"
  nginx -t
  systemctl reload nginx
}

start_pm2() {
  log "Lancement PM2"
  cd "$APP_DIR"
  sudo -H -u "$APP_USER" pm2 start ecosystem.config.cjs --update-env
  sudo -H -u "$APP_USER" pm2 save
  env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$APP_USER" --hp "$(getent passwd "$APP_USER" | cut -d: -f6)"
}

main() {
  require_root
  install_node_lts
  install_pm2_nginx
  create_user_and_dirs
  install_application_code
  write_env_file
  install_dependencies
  configure_nginx
  start_pm2
  log "Installation terminee. Verifier: curl http://127.0.0.1:$PORT/healthz"
}

main "$@"
