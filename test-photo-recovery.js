'use strict';

const assert = require('assert');
const fs = require('fs');
const recovery = require('./modules/measurements/public/photo-recovery');

class FakeLocalStorage {
  constructor(values) { this.values = { ...values }; }
  get length() { return Object.keys(this.values).length; }
  key(index) { return Object.keys(this.values)[index] ?? null; }
  getItem(key) { return Object.prototype.hasOwnProperty.call(this.values, key) ? this.values[key] : null; }
  setItem() { throw new Error('recovery must never write localStorage'); }
  removeItem() { throw new Error('recovery must never remove localStorage'); }
}

const imageA = 'data:image/jpeg;base64,QUJD';
const imageB = 'data:image/png;base64,REVG';
const target = {
  server_id: 9,
  module: 'Portail',
  recordName: 'Portail devis 6',
  fields: { quote_id: '6', date: '2026-07-20' },
  photos: [
    { name: 'portail-1.jpg', caption: 'Vue extérieure', dataUrl: imageA },
    { name: 'portail-2.png', caption: '', dataUrl: imageB }
  ]
};
const other = {
  server_id: 10,
  module: 'Portail',
  fields: { quote_id: '6', date: '2026-07-20' },
  photos: [{ name: 'autre.jpg', caption: 'Autre fiche', dataUrl: imageA }]
};

{
  const storage = new FakeLocalStorage({
    'outil-pme.portail.measurements': JSON.stringify([target, other]),
    'outil-pme.invalid.measurements': '{invalide'
  });
  const result = recovery.scanLocalStorage(storage, { id: 9, module: 'Portail', quoteId: 6, date: '2026-07-20' });
  assert.strictEqual(result.records.length, 1, 'another Portail record must not be confused with target');
  assert.strictEqual(result.records[0].id, '9');
  assert.strictEqual(result.records[0].date, '2026-07-20');
  assert.strictEqual(result.photoCount, 2);
  assert.deepStrictEqual(result.records[0].photos.map((photo) => photo.name), ['portail-1.jpg', 'portail-2.png']);
  assert.deepStrictEqual(result.invalidKeys, ['outil-pme.invalid.measurements']);
}

{
  const storage = new FakeLocalStorage({
    'outil-pme.portail.measurements': JSON.stringify([{ ...target, photos: [] }])
  });
  const result = recovery.scanLocalStorage(storage, { id: 9, module: 'Portail', quoteId: 6, date: '2026-07-20' });
  assert.strictEqual(result.records.length, 1);
  assert.strictEqual(result.photoCount, 0, 'record without photos must be reported safely');
}

const server = (fs.readFileSync('server.js', 'utf8') + fs.readFileSync('app/createApplication.js', 'utf8'));
const legacyRoutes = fs.readFileSync('routes/measurementLegacy.js', 'utf8');
const recoveryView = fs.readFileSync('views/measurementPhotoRecoveryView.js', 'utf8');
const moduleSheet = fs.readFileSync('modules/measurements/public/module-sheet.js', 'utf8');
assert.ok(legacyRoutes.includes("app.get('/outils/prises-cotes/recuperation-photos', requireAdmin"), 'recovery page must remain admin-only');
assert.ok(recoveryView.includes('href="/outils/prises-cotes/portail?id=9&amp;from_quote=6"'), 'recovery page must return to Portail #9');
assert.ok(moduleSheet.includes("moduleLabel !== 'Portail' || initialServerId !== 9"), 'button must be limited to target Portail record');
assert.ok(moduleSheet.includes("link.href = '/outils/prises-cotes/recuperation-photos'"), 'button must use a relative same-app link');
assert.ok(!moduleSheet.includes("link.target = '_blank'"), 'recovery link must stay in the same tab');

console.log('photo recovery tests ok');
