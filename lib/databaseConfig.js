'use strict';

const path = require('path');

function readDatabaseConfig(env = process.env) {
  const client = String(env.DB_CLIENT || 'sqlite').trim().toLowerCase();
  const storageDir = env.OUTIL_PME_STORAGE_DIR || path.join(__dirname, '..', 'storage');
  const sqlitePath = env.OUTIL_PME_DB_PATH || path.join(storageDir, 'data', 'app.db');

  return {
    client,
    sqlite: {
      path: sqlitePath,
    },
    postgres: {
      url: env.DATABASE_URL || '',
      host: env.POSTGRES_HOST || '127.0.0.1',
      port: Number(env.POSTGRES_PORT || 5432),
      database: env.POSTGRES_DB || 'outil_pme',
      user: env.POSTGRES_USER || 'outil_pme',
      password: env.POSTGRES_PASSWORD || '',
      ssl: ['1', 'true', 'yes', 'on'].includes(String(env.POSTGRES_SSL || '').toLowerCase()),
    },
  };
}

module.exports = {
  readDatabaseConfig,
};
