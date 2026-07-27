'use strict';
const assert = require('assert');
const { createClientsService } = require('./services/clientsService');

function fakeDb(rows = []) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return {
        all() { calls.push(['all', sql]); return rows; },
        get(value) { calls.push(['get', sql, value]); return rows.find((row) => row.name.toLowerCase() === String(value).toLowerCase()); },
        run(...values) { calls.push(['run', sql, ...values]); return { changes: 1 }; }
      };
    }
  };
}
const normalize = (value) => String(value).replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
const safe = (value) => String(value).replace(/[^a-z0-9_-]/gi, '_');
function service({ rows = [], entries = [], ensured = [], db = fakeDb(rows), listError } = {}) {
  return {
    db,
    ensured,
    value: createClientsService({
      db, clientsRoot: '/clients', safeName: safe, normalizeKey: normalize,
      joinPath: (a, b) => `${a}/${b}`,
      listDirectoryEntries() { if (listError) throw listError; return entries; },
      ensureDirectory(path) { ensured.push(path); },
      now: () => '2026-07-27T00:00:00.000Z',
      logError() {}
    })
  };
}
assert.throws(() => createClientsService({}), /Base clients/);
{
  const { value } = service();
  assert.deepStrictEqual(value.buildMergedClientList(), []);
}
{
  const rows = [{ id: 1, name: 'Dupont', city: 'Paris' }];
  const entries = [
    { name: 'DUPONT', isDirectory: () => true },
    { name: 'Société André', isDirectory: () => true },
    { name: 'fichier.txt', isDirectory: () => false }
  ];
  const { value, ensured } = service({ rows, entries });
  const clients = value.buildMergedClientList();
  assert.strictEqual(clients.length, 2);
  assert.deepStrictEqual(clients.map((client) => client.name), ['Dupont', 'Société André']);
  assert.strictEqual(clients[0].source, 'db');
  assert.strictEqual(clients[1].isFolderOnly, true);
  assert.strictEqual(clients[1].urls.folder, '/pc-folders/Soci%C3%A9t%C3%A9%20Andr%C3%A9');
  assert.deepStrictEqual(ensured, ['/clients/Dupont']); // comportement historique du GET
}
{
  const rows = [
    { id: 1, name: "L'Atelier" },
    { id: 2, name: 'Dupont-SARL' },
    { id: 3, name: 'Dupont SARL' }
  ];
  const clients = service({ rows }).value.buildMergedClientList();
  assert.strictEqual(clients.length, 3);
  assert(clients.every((client) => client.existsInDatabase));
}
{
  const state = service({ rows: [] });
  state.value.createClient({ name: 'Client A', address: '', postal_code: '', city: '', email: '', phone: '' });
  assert(state.db.calls.some((call) => call[0] === 'run' && /INSERT INTO clients/.test(call[1])));
  assert.deepStrictEqual(state.ensured, ['/clients/Client_A']);
}
{
  const db = fakeDb([{ id: 4, name: 'Client A' }]);
  const state = service({ db });
  state.value.createClient({ name: 'client a' });
  assert(!db.calls.some((call) => call[0] === 'run' && /INSERT INTO clients/.test(call[1])));
  assert.deepStrictEqual(state.ensured, ['/clients/client_a']);
  state.value.deleteClient(4);
  assert(db.calls.some((call) => call[0] === 'run' && /DELETE FROM clients WHERE id = \\?/.test(call[1])));
}
assert.deepStrictEqual(service({ listError: new Error('lecture') }).value.listClientFolders(), []);
console.log('test-clients-service: OK');
