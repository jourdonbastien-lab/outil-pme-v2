'use strict';
const assert = require('assert');
const fs = require('fs');
const server = fs.readFileSync('server.js', 'utf8');
const createApplication = fs.readFileSync('app/createApplication.js', 'utf8');
const startApplication = fs.readFileSync('app/startApplication.js', 'utf8');
assert(server.split(/\r?\n/).length < 20, 'server.js doit rester un point d’entrée minimal');
assert(server.includes('createApplication()'));
assert(server.includes('startApplication(runtime)'));
assert(!/app\.(?:get|post|put|patch|delete)\(/.test(server));
assert(!/\b(?:SELECT|INSERT INTO|UPDATE|DELETE FROM|CREATE TABLE|ALTER TABLE)\b/.test(server));
assert(!/<(?:script|form|section)|<!DOCTYPE/.test(server));
assert.strictEqual((createApplication.match(/new Database\(/g) || []).length, 1);
assert.strictEqual((createApplication.match(/express\(\)/g) || []).length, 1);
assert.strictEqual((startApplication.match(/\.listen\(/g) || []).length, 1);
for (const root of ['app','routes','controllers','services','middleware','views','database']) {
  if (!fs.existsSync(root)) continue;
  for (const name of fs.readdirSync(root)) {
    const file = `${root}/${name}`;
    if (!fs.statSync(file).isFile() || !file.endsWith('.js')) continue;
    assert(!fs.readFileSync(file, 'utf8').includes("require('../server"), `${file} importe server.js`);
  }
}
console.log('OK - architecture composition serveur');
