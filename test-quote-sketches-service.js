'use strict';
const assert = require('assert');
const { createQuoteSketchesService } = require('./services/quoteSketchesService');
const removed = [];
let exists = true;
const service = createQuoteSketchesService({
  db: { prepare: () => ({ get: (id) => id === 7 ? { id } : undefined }) },
  quoteSketchPath: (id) => `/sketches/quotes/${id}.png`,
  saveQuoteSketchPng: (id, image) => image ? `/sketches/quotes/${id}.png` : (() => { const error = new Error('Image PNG invalide'); error.statusCode = 400; throw error; })(),
  fileExists: () => exists,
  removeStoragePath: (target) => removed.push(target)
});
assert.deepStrictEqual(service.findQuote(7), { id: 7 });
assert.strictEqual(service.findQuote(8), undefined);
assert.strictEqual(service.getQuoteSketch(7), '/sketches/quotes/7.png');
exists = false;
assert.strictEqual(service.getQuoteSketch(7), null);
assert.strictEqual(service.saveQuoteSketch(7, 'data:image/png;base64,AA=='), '/sketches/quotes/7.png');
assert.throws(() => service.saveQuoteSketch(7, ''), /Image PNG invalide/);
service.deleteQuoteSketch(7);
assert.deepStrictEqual(removed, ['/sketches/quotes/7.png']);
console.log('OK - service croquis devis');
