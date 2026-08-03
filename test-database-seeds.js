'use strict';
const assert = require('assert');
const Database = require('better-sqlite3');
const { initializeDefaultUsers } = require('./database/seeds');
function database() { const db = new Database(':memory:'); db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT UNIQUE,password TEXT,role TEXT DEFAULT 'admin')"); return db; }
let db = database();
initializeDefaultUsers(db);
assert.deepStrictEqual(db.prepare('SELECT username,role FROM users ORDER BY id').all(), [{ username: 'admin', role: 'admin' }, { username: 'Bastien', role: 'admin' }, { username: 'atelier', role: 'atelier' }]);
const passwords = db.prepare('SELECT password FROM users ORDER BY id').all();
initializeDefaultUsers(db);
assert.strictEqual(db.prepare('SELECT COUNT(*) AS count FROM users').get().count, 3);
assert.deepStrictEqual(db.prepare('SELECT password FROM users ORDER BY id').all(), passwords);
db.close();
db = database();
db.prepare('INSERT INTO users(username,password,role) VALUES(?,?,?)').run('Existant', 'test', 'admin');
initializeDefaultUsers(db);
assert.deepStrictEqual(db.prepare('SELECT username,role FROM users ORDER BY id').all(), [{ username: 'Existant', role: 'admin' }, { username: 'atelier', role: 'atelier' }]);
db.close();
console.log('OK - seeds utilisateurs SQLite');
