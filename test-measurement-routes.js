'use strict';

const assert = require('assert');
const fs = require('fs');
const routes = require('./lib/measurementRoutes');

assert.strictEqual(
  routes.newMeasurementUrl('Portail', 6),
  '/outils/prises-cotes/portail?quote_id=6&from_quote=6',
  'Portail creation from quote must carry quote context'
);
assert.strictEqual(
  routes.canonicalMeasurementUrl({ id: 42, module: 'Portail' }, { fromQuoteId: 6 }),
  '/outils/prises-cotes/portail?id=42&from_quote=6',
  'linked Portail must open its complete editor'
);

const expectedModules = new Map([
  ['Escalier', 'escalier'], ['Portail', 'portail'], ['Clôture', 'cloture'],
  ['Garde-corps', 'garde-corps'], ['Pergola', 'pergola'], ['Verrière', 'verriere'], ['Autres', 'autres']
]);
for (const [moduleName, slug] of expectedModules) {
  assert.strictEqual(routes.canonicalMeasurementUrl({ id: 7, module: moduleName }), `/outils/prises-cotes/${slug}?id=7`);
}

{
  const payload = routes.buildMeasurementEditorPayload({
    id: 8, module: 'Portail', record_name: 'Portail devis', quote_id: 6,
    client: null, chantier: null,
    data: JSON.stringify({ fields: { largeur: '3500', technical_drawing_sketches: [{ id: 'sketch-1' }] }, photos: [{ id: 'photo-1' }], notes: 'Notes fiche' })
  }, { id: 6, client_name: 'Prospect Dupont', title: 'Portail entrée' });
  assert.strictEqual(payload.fields.client, 'Prospect Dupont', 'quote client or prospect name must prefill client');
  assert.strictEqual(payload.fields.chantier, 'Portail entrée', 'quote title must prefill chantier');
  assert.strictEqual(payload.fields.largeur, '3500');
  assert.strictEqual(payload.fields.technical_drawing_sketches[0].id, 'sketch-1');
  assert.strictEqual(payload.photos[0].id, 'photo-1');
  assert.strictEqual(payload.notes, 'Notes fiche');
}

{
  const payload = routes.buildMeasurementEditorPayload({
    id: 9, module: 'Portail', quote_id: 6, client: 'Client enregistré', chantier: 'Chantier enregistré',
    data: JSON.stringify({ fields: {} })
  }, { client_name: 'Autre client', title: 'Autre titre' });
  assert.strictEqual(payload.fields.client, 'Client enregistré', 'stored client must not be overwritten');
  assert.strictEqual(payload.fields.chantier, 'Chantier enregistré', 'stored chantier must not be overwritten');
}

assert.strictEqual(routes.canonicalMeasurementUrl({ id: 10, module: 'Module historique' }), '', 'unknown legacy module keeps generic detail');

const server = (fs.readFileSync('server.js', 'utf8') + fs.readFileSync('app/createApplication.js', 'utf8'));
const measurementController = fs.readFileSync('controllers/measurementsController.js', 'utf8');
const measurementCardView = fs.readFileSync('views/measurementCardView.js', 'utf8');
const measurementDetailView = fs.readFileSync('views/measurementDetailShellView.js', 'utf8');
const quoteDetailView = fs.readFileSync('views/quoteDetailView.js', 'utf8');
const moduleSheet = fs.readFileSync('modules/measurements/public/module-sheet.js', 'utf8');
const stairSheet = fs.readFileSync('modules/measurements/public/measurements.js', 'utf8');
assert.ok(measurementController.includes('if(canonical)return res.redirect(302,canonical)'), 'generic detail must redirect known modules');
assert.ok(measurementCardView.includes('measurementRoutes.canonicalMeasurementUrl(row,options)'), 'measurement cards must use canonical links');
assert.ok(quoteDetailView.includes('renderMeasurementCards(linkedMeasurements, { fromQuoteId: id })'), 'quote cards must keep quote return context');
assert.ok(moduleSheet.includes('if (initialServerId) await loadServerRecord(initialServerId)'), 'module editors must load server data by id');
assert.ok(stairSheet.includes('if (initialServerId) await loadServerRecord(initialServerId)'), 'Escalier editor must load server data by id');
assert.ok(moduleSheet.includes("const returnUrl = fromQuoteId ? `/devis/${fromQuoteId}#quote-section-measurements` : '/outils/prises-cotes'"), 'quote return and direct-list return must coexist');
assert.ok(measurementDetailView.includes("renderSketchBlock({scope:'measurements',id,className:'panel-soft'})"), 'legacy generic sketch remains available for unknown modules');

console.log('measurement route tests ok');
