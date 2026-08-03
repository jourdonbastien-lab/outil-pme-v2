'use strict';
const assert = require('assert');
const fs = require('fs');
const server = fs.readFileSync('server.js', 'utf8');
const bootstrap = fs.readFileSync('database/bootstrapDatabase.js', 'utf8');
for (const sql of ['CREATE TABLE', 'ALTER TABLE', 'CREATE INDEX', 'CREATE UNIQUE INDEX']) assert(!server.includes(sql), `${sql} reste dans server.js`);
for (const removed of ['function initializeSqlite(', 'function createSqliteTables(', 'function runSqliteMigrations(', 'function runSqliteNormalizations(', 'function initializeDefaultUsers(']) assert(!server.includes(removed), `${removed} reste dans server.js`);
assert.strictEqual((server.match(/new Database\(/g) || []).length, 1, 'la connexion SQLite principale doit rester unique');
assert.strictEqual((server.match(/bootstrapDatabase\(/g) || []).length, 1, 'le bootstrap doit être appelé une seule fois');
assert(server.indexOf('const db = new Database(dbPath)') < server.indexOf('bootstrapDatabase(db'));
assert(server.indexOf('bootstrapDatabase(db') < server.indexOf('new SqliteSessionStore'));
assert(bootstrap.indexOf('createSqliteTables(database)') < bootstrap.indexOf('incomingDocuments.migrateIncomingDocuments(database)'));
assert(bootstrap.indexOf('incomingDocuments.migrateIncomingDocuments(database)') < bootstrap.indexOf('runSqliteMigrations(ensureColumn)'));
assert(bootstrap.indexOf('runSqliteMigrations(ensureColumn)') < bootstrap.indexOf('runSqliteNormalizations(database)'));
assert(bootstrap.indexOf('runSqliteNormalizations(database)') < bootstrap.indexOf('initializeDefaultUsers(database)'));
for (const file of fs.readdirSync('database').map((name) => `database/${name}`)) {
  const source = fs.readFileSync(file, 'utf8');
  assert(!source.includes("require('../server"), `${file} importe server.js`);
  assert(!/\b(?:req|res)\./.test(source), `${file} dépend d’Express`);
}
assert(server.includes("const Database = require('better-sqlite3')"));
assert(server.includes('client: db'));
console.log('OK - architecture bootstrap SQLite');
