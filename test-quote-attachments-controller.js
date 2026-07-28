'use strict';
const assert = require('assert');
const { createQuoteAttachmentsController } = require('./controllers/quoteAttachmentsController');
let exists = true;
const calls = [];
let uploadBehavior = 'success';
const controller = createQuoteAttachmentsController({
  attachmentsService: {
    uploadedPhotoPath: () => '/tmp/photo.jpg',
    fileExists: () => exists,
    getQuotePhoto: (_id, name) => name === 'found.jpg' ? '/tmp/found.jpg' : null,
    deleteQuotePhoto(...args) { calls.push(['delete', ...args]); }
  },
  uploadPhoto(req, _res, callback) {
    if (uploadBehavior === 'error') return callback(new Error('upload'));
    if (uploadBehavior === 'missing') return callback();
    req.file = { filename: 'photo.jpg', destination: '/tmp', size: 4 };
    callback();
  },
  log() {}, warn() {}, logError() {}
});
function response() {
  return { code: 200, body: null, location: null, sentFile: null, status(code) { this.code = code; return this; }, send(body) { this.body = body; return this; }, redirect(location) { this.location = location; return this; }, sendFile(file) { this.sentFile = file; return this; } };
}
let res = response();
controller.uploadQuotePhoto({ params: { id: '7' }, body: {} }, res);
assert.strictEqual(res.location, '/devis/7');
uploadBehavior = 'missing';
res = response();
controller.uploadQuotePhoto({ params: { id: '7' }, body: {} }, res);
assert.strictEqual(res.code, 400);
assert(res.body.startsWith('Aucun fichier reçu.'));
uploadBehavior = 'error';
res = response();
controller.uploadQuotePhoto({ params: { id: '7' }, body: {} }, res);
assert.strictEqual(res.body, 'Impossible d’ajouter ce fichier au devis.');
uploadBehavior = 'success';
exists = false;
res = response();
controller.uploadQuotePhoto({ params: { id: '7' }, body: {} }, res);
assert.strictEqual(res.code, 500);
exists = true;
res = response();
controller.serveQuotePhoto({ params: { id: '7', file: 'found.jpg' } }, res);
assert.strictEqual(res.sentFile, '/tmp/found.jpg');
res = response();
controller.serveQuotePhoto({ params: { id: '7', file: 'missing.jpg' } }, res);
assert.strictEqual(res.code, 404);
res = response();
controller.deleteQuotePhoto({ params: { id: '7' }, body: { photo: 'found.jpg' } }, res);
assert.strictEqual(res.location, '/devis/7');
assert.deepStrictEqual(calls[0], ['delete', 7, 'found.jpg']);
console.log('OK - contrôleur pièces jointes devis');
