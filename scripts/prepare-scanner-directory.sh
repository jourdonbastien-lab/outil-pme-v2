#!/usr/bin/env bash
set -euo pipefail

# Script préparatoire idempotent. Il n'installe aucun service et ne modifie
# ni pare-feu, ni SSH, ni Samba. À exécuter explicitement sur le VPS.
APP_DIR="${APP_DIR:-/opt/outil-pme-v2}"
SCANNER_USER="${SCANNER_USER:-outilpme-scanner}"
APP_GROUP="${APP_GROUP:-outil-pme}"
CREATE_USER="${CREATE_USER:-false}"
SCANNER_ROOT="$APP_DIR/storage/scanner"

if [[ "$CREATE_USER" == "true" ]] && ! id "$SCANNER_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$SCANNER_ROOT" --shell /usr/sbin/nologin "$SCANNER_USER"
fi

install -d -m 2770 -g "$APP_GROUP" \
  "$SCANNER_ROOT/incoming" "$SCANNER_ROOT/processing" "$SCANNER_ROOT/documents" \
  "$SCANNER_ROOT/rejected" "$SCANNER_ROOT/temp"

if id "$SCANNER_USER" >/dev/null 2>&1; then
  chown -R "$SCANNER_USER:$APP_GROUP" "$SCANNER_ROOT/incoming"
fi

echo "Arborescence prête : $SCANNER_ROOT"
echo "Étapes suivantes : valider le compte PM2, choisir SFTP/FTPS/VPN/relais local, puis tester avec un PDF non sensible."
echo "Aucun port et aucune configuration réseau n'ont été modifiés."
