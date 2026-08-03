'use strict';

function createSchemaHelpers(database, { logger = console } = {}) {
  function ensureColumn(table, col, type) {
    const cols = database.prepare(`PRAGMA table_info(${table})`).all();
    const exists = cols.some((c) => c.name === col);
    if (!exists) {
      database.prepare(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`).run();
      logger.log(`✅ Ajout colonne ${table}.${col}`);
    }
  }

  return { ensureColumn };
}

module.exports = { createSchemaHelpers };
