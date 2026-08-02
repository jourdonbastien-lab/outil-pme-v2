'use strict';
const assert = require('assert');
const { createMaterialsController } = require('./controllers/materialsController');
const calls = [];
const materialsService = {
  listMaterials(q) { calls.push(['list', q]); return { q: q || '', totalMaterials: 0, materials: [] }; },
  createMaterial(body) { calls.push(['create', body]); }, updateMaterial(id, body) { calls.push(['update', id, body]); },
  deleteMaterial(id) { calls.push(['delete', id]); }, seedStandardMaterials() { calls.push(['seed']); return 4; },
  getMaterialById(id) { calls.push(['get', id]); return id === 8 ? { id, name: 'Acier', created_at: '2026-08-01' } : undefined; },
  materialExists(id) { calls.push(['exists', id]); return id === 8 ? { id } : undefined; }
};
const controller = createMaterialsController({ materialsService, renderMaterialsListView: () => 'LIST', renderMaterialDetailView: () => 'DETAIL', pageTemplate: (req, title, html) => `${title}:${html}`, formatDateLabel: () => '01/08/2026', viewDependencies: {} });
function response() { return { statusCode: 200, status(code) { this.statusCode = code; return this; }, send(value) { this.sent = value; return this; }, redirect(value) { this.redirected = value; return this; } }; }
let res = response(); controller.showMaterials({ query: { q: 'tube' }, session: { user: { role: 'admin' } } }, res); assert.strictEqual(res.sent, 'Bibliothèque matière:LIST');
res = response(); controller.createMaterial({ body: { name: 'A' } }, res); assert.strictEqual(res.redirected, '/materials');
res = response(); controller.updateMaterialFromBody({ body: { id: '0' } }, res); assert.deepStrictEqual([res.statusCode, res.sent], [400, 'ID matière invalide']);
res = response(); controller.updateMaterialFromBody({ body: { id: '8' } }, res); assert.strictEqual(res.redirected, '/materials/8?saved=1');
res = response(); controller.seedMaterials({}, res); assert.strictEqual(res.redirected, '/materials?seeded=1&added=4');
res = response(); controller.deleteMaterial({ body: { id: '8' } }, res); assert.strictEqual(res.redirected, '/materials');
res = response(); controller.showMaterial({ params: { id: 'x' }, query: {} }, res); assert.strictEqual(res.statusCode, 400);
res = response(); controller.showMaterial({ params: { id: '9' }, query: {} }, res); assert.deepStrictEqual([res.statusCode, res.sent], [404, 'Matière introuvable']);
res = response(); controller.showMaterial({ params: { id: '8' }, query: {} }, res); assert.strictEqual(res.sent, 'Acier:DETAIL');
res = response(); controller.updateMaterial({ params: { id: '9' }, body: {} }, res); assert.strictEqual(res.statusCode, 404);
res = response(); controller.updateMaterial({ params: { id: '8' }, body: {} }, res); assert.strictEqual(res.redirected, '/materials/8?saved=1');
console.log('OK - contrôleur matières');
