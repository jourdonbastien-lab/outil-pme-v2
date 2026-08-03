'use strict';

const { createSchemaHelpers } = require('./schemaHelpers');
const { createSqliteTables } = require('./schema');
const { runSqliteMigrations, runSqliteNormalizations } = require('./migrations');
const { initializeDefaultUsers } = require('./seeds');

function logSqliteDebug(database, { logger = console, dbPath } = {}) {
  logger.log('TASKS');
  logger.log(database.prepare('PRAGMA table_info(tasks)').all());

  logger.log('CLIENT_ORDERS');
  logger.log(database.prepare('PRAGMA table_info(client_orders)').all());

  logger.log('SUPPLIER_ORDERS');
  logger.log(database.prepare('PRAGMA table_info(supplier_orders)').all());

  const sqliteUsers = database.prepare('SELECT id, username, role FROM users').all();

  logger.log('UTILISATEURS =', sqliteUsers);
  logger.log(sqliteUsers);
  logger.log('BASE =', dbPath);
  logger.log('UTILISATEURS =', sqliteUsers);
}

function bootstrapDatabase(database, dependencies = {}) {
  const { incomingDocuments, logger = console, dbPath } = dependencies;
  const { ensureColumn } = createSchemaHelpers(database, { logger });
  createSqliteTables(database);
  incomingDocuments.migrateIncomingDocuments(database);
  runSqliteMigrations(ensureColumn);
  runSqliteNormalizations(database);
  initializeDefaultUsers(database);
  logSqliteDebug(database, { logger, dbPath });
  return database;
}

module.exports = { bootstrapDatabase, logSqliteDebug };
