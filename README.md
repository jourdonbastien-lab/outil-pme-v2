# Outil PME

## Sauvegarde automatique

Le script `scripts/backup.sh` crée une archive datée dans `backups/`.

Par défaut sur le VPS, il sauvegarde :

- `/opt/outil-pme-v2/storage/data/app.db`
- `/opt/outil-pme-v2/storage/uploads` si le dossier existe
- `/opt/outil-pme-v2/storage/clients` si le dossier existe

Il conserve uniquement les 30 dernières archives.

Commande manuelle :

```bash
cd /opt/outil-pme-v2
npm run backup
```

Exemple de cron quotidien à 02:00 :

```cron
0 2 * * * cd /opt/outil-pme-v2 && npm run backup >> /opt/outil-pme-v2/backups/backup.log 2>&1
```
