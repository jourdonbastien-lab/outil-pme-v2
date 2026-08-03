'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createPcFilesService } = require('./services/pcFilesService');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-files-'));
const allowed = ['Devis', 'Plans', 'Factures', 'Photos', 'Commandes', 'Heure chantier'];
const safeName = (value) => {
  let result = String(value || '').replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim();
  if (!result || result === '.' || result === '..') result = 'item';
  return result.replace(/[. ]+$/g, '') || 'item';
};
const safeResolveInside = (baseDir, ...parts) => {
  const base = path.resolve(baseDir);
  const target = path.resolve(base, ...parts);
  if (!target.startsWith(base + path.sep) && target !== base) throw new Error('Chemin invalide');
  return target;
};
const service = createPcFilesService({
  fs, clientPcDir: root, standardSubfolders: allowed, safeName, safeResolveInside,
  ensureDir: (directory) => fs.mkdirSync(directory, { recursive: true })
});

const names = ['image été.jpg', 'devis.pdf', 'note.txt', "pièce d'atelier.bin"];
const folder = path.join(root, 'Client é', "Commande d'été", 'Plans');
fs.mkdirSync(folder, { recursive: true });
for (const name of names) fs.writeFileSync(path.join(folder, name), name);

for (const name of names) {
  const result = service.resolveRawFile({ client: 'Client é', order: "Commande d'été", type: 'Plans', file: name });
  assert.strictEqual(result.filePath, path.join(folder, name));
}
assert.strictEqual(service.resolveRawFile({ client: 'Client é', order: "Commande d'été", type: 'Croquis', file: 'x' }).error, 'invalid-type');
assert.strictEqual(service.resolveRawFile({ client: 'Client é', order: "Commande d'été", type: 'Plans', file: 'absent' }).error, 'missing');
assert.strictEqual(service.resolveRawFile({ client: '..', order: '..', type: 'Plans', file: 'absent' }).error, 'missing');
for (const file of ['../secret', '%2e%2e%2fsecret']) {
  assert.strictEqual(service.resolveRawFile({ client: 'Client é', order: "Commande d'été", type: 'Plans', file }).error, 'missing');
}
for (const file of ['../../../../../../secret', '/tmp/secret']) {
  assert.strictEqual(service.resolveRawFile({ client: 'Client é', order: "Commande d'été", type: 'Plans', file }).error, 'invalid-path');
}
assert.strictEqual(service.resolveRawFile({ client: 'Client é', order: "Commande d'été", type: 'Plans', file: 'dir\\file' }).error, 'missing');

const preview = service.resolveFileContext({ client: 'Client é', order: "Commande d'été", type: 'Plans', file: 'devis.PDF' });
assert.strictEqual(preview.isPdf, true);
assert.strictEqual(preview.rawUrl, "/pc-file-raw/Client%20%C3%A9/Commande%20d'%C3%A9t%C3%A9/Plans/devis.PDF");
assert.strictEqual(service.resolveFileContext({ client: 'a', order: 'b', type: 'Photos', file: 'x.jpg' }).isPdf, false);

const upload = service.resolveUploadContext({ client: ' Client é ', order: " Commande d'été ", type: 'Photos' }, { createDirectory: true });
assert(fs.existsSync(upload.directory));
assert.strictEqual(upload.redirectUrl, "/pc-folders/Client%20%C3%A9/Commande%20d'%C3%A9t%C3%A9/Photos");
assert.throws(() => service.resolveUploadContext({ client: '', order: '', type: '' }), /Dossier cible invalide/);
assert.throws(() => service.resolveUploadContext({ client: 'A', order: 'B', type: 'Croquis' }), /Type de dossier interdit/);

const outside = path.join(root, '..', `outside-${Date.now()}.txt`);
fs.writeFileSync(outside, 'outside');
const symlink = path.join(folder, 'lien.txt');
try {
  fs.symlinkSync(outside, symlink);
  assert.strictEqual(service.resolveRawFile({ client: 'Client é', order: "Commande d'été", type: 'Plans', file: 'lien.txt' }).filePath, symlink);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(outside, { force: true });
}
console.log('OK - service fichiers PC');
