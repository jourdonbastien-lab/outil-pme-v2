# Outil PME

## Sauvegarde automatique

Le script `scripts/backup.sh` crée une archive datée dans `backups/`.

Par défaut sur le VPS, il sauvegarde tout le dossier :

- `/opt/outil-pme-v2/storage/`

Le dossier `storage/backups` est exclu si des sauvegardes y sont stockées, afin de ne pas sauvegarder les sauvegardes dans les sauvegardes. La base SQLite `storage/data/app.db` est copiée avec `sqlite3 .backup` quand la commande est disponible.

Commande manuelle :

```bash
cd /opt/outil-pme-v2
npm run backup
```

Verifier le contenu de la derniere archive :

```bash
tar -tzf "$(ls -1t /opt/outil-pme-v2/backups/outil-pme-backup-*.tar.gz | head -n 1)" | head -n 50
```

Exemple de cron quotidien à 02:00 :

```cron
0 2 * * * cd /opt/outil-pme-v2 && npm run backup >> /opt/outil-pme-v2/backups/backup.log 2>&1
```
