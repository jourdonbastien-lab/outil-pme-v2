# Preparation VPS Linux

Ce dossier contient uniquement des fichiers de préparation. Il ne déploie rien.

## Ordre prévu

1. Configurer les variables d'environnement.
2. Démarrer l'application avec PM2 sur `127.0.0.1:3000`.
3. Placer Nginx devant l'application.
4. Garder SQLite comme base active tant que PostgreSQL n'est pas migré.
5. Préparer PostgreSQL en parallèle, puis migrer dans une étape dédiée.

## Variables importantes

- `NODE_ENV=production`
- `HOST=127.0.0.1`
- `PORT=3000`
- `TRUST_PROXY=true`
- `SESSION_SECRET=<secret long>`
- `SESSION_COOKIE_SECURE=true`
- `APP_BASE_URL=https://domaine`
- `OUTIL_PME_STORAGE_DIR=/var/lib/outil-pme/storage`
- `DB_CLIENT=sqlite`

## PostgreSQL

SQLite reste actif par défaut avec `DB_CLIENT=sqlite`.

Les variables PostgreSQL sont prêtes pour une prochaine étape :

- `DATABASE_URL`
- `POSTGRES_HOST`
- `POSTGRES_PORT`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_SSL`

Le code métier utilise encore `better-sqlite3` directement. Le passage réel à PostgreSQL devra passer par une couche d'accès aux données et une migration des schémas.

Par sécurité, si `DB_CLIENT` est différent de `sqlite`, le serveur refuse de démarrer avec un message explicite. Cela évite de croire que PostgreSQL est utilisé alors que les requêtes métier passent encore par SQLite.

`deploy/postgres.bootstrap.sql.example` prépare uniquement le rôle et la base pour une étape future.

## PM2

Exemple de commandes futures sur le VPS :

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

## Nginx

Copier `deploy/nginx.conf.example`, remplacer `example.com`, puis créer un lien vers `sites-enabled`.

Vérifications futures :

```bash
nginx -t
curl http://127.0.0.1:3000/healthz
curl https://example.com/healthz
```
Lors du premier déploiement HTTP :

SESSION_COOKIE_SECURE=false

Après installation du certificat HTTPS (Let's Encrypt) :

SESSION_COOKIE_SECURE=true

La variable est pilotée uniquement par le fichier .env.