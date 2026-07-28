'use strict';
const assert = require('assert');
const { createQuoteSketchesController } = require('./controllers/quoteSketchesController');
let found = true;
let sketch = '/tmp/7.png';
let saveError = null;
const controller = createQuoteSketchesController({
  sketchesService: {
    findQuote: () => found ? { id: 7 } : null,
    getQuoteSketch: () => sketch,
    saveQuoteSketch: () => { if (saveError) throw saveError; return '/tmp/7.png'; }
  }
});
function response() {
  return { code: 200, body: null, jsonBody: null, file: null, status(code) { this.code = code; return this; }, send(body) { this.body = body; return this; }, json(body) { this.jsonBody = body; return this; }, sendFile(file) { this.file = file; return this; } };
}
let res = response();
controller.serveQuoteSketch({ params: { id: '7' } }, res);
assert.strictEqual(res.file, '/tmp/7.png');
sketch = null;
res = response();
controller.serveQuoteSketch({ params: { id: '7' } }, res);
assert.strictEqual(res.body, 'Croquis introuvable');
found = false;
res = response();
controller.saveQuoteSketch({ params: { id: '7' }, body: {} }, res);
assert.deepStrictEqual(res.jsonBody, { ok: false, error: 'Devis introuvable' });
found = true;
saveError = Object.assign(new Error('Image PNG invalide'), { statusCode: 400 });
res = response();
controller.saveQuoteSketch({ params: { id: '7' }, body: { image: 'x' } }, res);
assert.strictEqual(res.code, 400);
assert.deepStrictEqual(res.jsonBody, { ok: false, error: 'Image PNG invalide' });
saveError = null;
res = response();
controller.saveQuoteSketch({ params: { id: '7' }, body: { image: 'x' } }, res);
assert.deepStrictEqual(res.jsonBody, { ok: true, path: '/tmp/7.png' });
console.log('OK - contrôleur croquis devis');
