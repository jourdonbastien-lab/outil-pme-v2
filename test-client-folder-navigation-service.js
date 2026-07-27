'use strict';
const assert = require('assert');
const { createClientFolderNavigationService } = require('./services/clientFolderNavigationService');

assert.throws(() => createClientFolderNavigationService({}), /Racine/);
const entries = [
  { name: 'Étage', isDirectory: () => true },
  { name: 'archive.txt', isDirectory: () => false },
  { name: 'Atelier ancien', isDirectory: () => true },
  { name: "L'entrée", isDirectory: () => true }
];
const matched = { id: 9, name: 'Client Démo', description: 'Étage' };
const safeCalls = [];
const service = createClientFolderNavigationService({
  clientsRoot: '/clients',
  safeName(value) {
    safeCalls.push(value);
    return String(value || '').replace(/[\\/]/g, '').replace(/\.\./g, '').trim();
  },
  joinPath: (...parts) => parts.join('/'),
  folderExists: (folderPath) => folderPath === '/clients/Client Démo',
  listDirectoryEntries: () => entries,
  clientOrderFolderService: {
    resolveClientOrder: (_client, folder) => folder === 'Étage' ? matched : undefined
  }
});
const resolved = service.resolveClientFolder('Client Démo');
assert.deepStrictEqual(resolved, { client: 'Client Démo', absolutePath: '/clients/Client Démo', exists: true });
const model = service.buildClientFolderNavigationModel('Client Démo');
assert.deepStrictEqual(model.folders.map((folder) => folder.folderName), ['Atelier ancien', 'Étage', "L'entrée"]);
assert.strictEqual(model.folders[0].isHistorical, true);
assert.strictEqual(model.folders[1].orderId, 9);
assert.strictEqual(model.folders[1].isHistorical, false);
assert.strictEqual(model.folders[2].url, "/pc-folders/Client%20D%C3%A9mo/L'entr%C3%A9e");
assert(!model.folders.some((folder) => folder.folderName === 'archive.txt'));
assert.deepStrictEqual(service.buildClientFolderNavigationModel('Inconnu').folders, []);
service.resolveClientFolder('../etc');
assert(safeCalls.includes('../etc'));
console.log('OK - service navigation dossiers clients');
