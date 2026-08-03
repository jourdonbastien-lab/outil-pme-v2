'use strict';

const assert = require('assert');
const fs = require('fs');
const { createPcFilesController } = require('./controllers/pcFilesController');

let result = { rawUrl: '/raw/a.pdf', isPdf: true };
const service = {
  resolveFileContext: () => result,
  resolveRawFile: () => result,
  resolveUploadContext: () => ({ redirectUrl: '/pc-folders/A/B/Plans' })
};
const controller = createPcFilesController({ pcFilesService: service, renderPreviewView: (data) => `VIEW:${data.rawUrl}` });
const response = () => ({
  code: 200,
  status(code) { this.code = code; return this; },
  send(body) { this.body = body; return this; },
  sendFile(filePath) { this.filePath = filePath; return this; },
  redirect(location) { this.location = location; return this; }
});

let res = response();
controller.showFilePreview({ params: {} }, res);
assert.strictEqual(res.body, 'VIEW:/raw/a.pdf');
result = { filePath: '/tmp/test.pdf' };
res = response();
controller.serveRawFile({ params: {} }, res);
assert.strictEqual(res.filePath, '/tmp/test.pdf');
for (const [error, code, message] of [
  ['invalid-type', 400, 'Type de dossier invalide'],
  ['missing', 404, 'Fichier introuvable'],
  ['invalid-path', 400, 'Chemin invalide']
]) {
  result = { error };
  res = response();
  controller.serveRawFile({ params: {} }, res);
  assert.deepStrictEqual([res.code, res.body], [code, message]);
}
res = response();
controller.uploadFile({ params: {}, file: { filename: 'x.pdf' } }, res);
assert.strictEqual(res.location, '/pc-folders/A/B/Plans');
res = response();
controller.uploadFile({ params: {} }, res);
assert.deepStrictEqual([res.code, res.body], [400, 'Aucun fichier reçu']);
assert(!/SELECT|INSERT|UPDATE|DELETE|<!DOCTYPE/.test(fs.readFileSync('controllers/pcFilesController.js', 'utf8')));
console.log('OK - contrôleur fichiers PC');
