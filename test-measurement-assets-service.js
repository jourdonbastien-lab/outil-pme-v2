'use strict';
const assert = require('assert');
const path = require('path');
const { createMeasurementAssetsService } = require('./services/measurementAssetsService');
const root = path.resolve('/tmp/measurements-public');
const safeResolveInside = (base, ...parts) => {
  const target = path.resolve(base, ...parts);
  if (!target.startsWith(path.resolve(base) + path.sep)) throw new Error('Chemin invalide');
  return target;
};
const service = createMeasurementAssetsService({
  path, publicDir: root,
  sheets: { portail: 'portail.html', escalier: 'measurements.html' },
  assets: new Set(['measurements.js', 'photo-recovery.js']),
  technicalDrawingAssets: new Set(['technical-drawing-core.js']), safeResolveInside
});
assert.strictEqual(service.resolveModulePage(' Portail '), path.join(root, 'portail.html'));
assert.strictEqual(service.resolveModulePage('inconnu'), null);
assert.strictEqual(service.resolveMeasurementAsset('measurements.js'), path.join(root, 'measurements.js'));
for (const value of ['absent.js', '..', '../measurements.js', '%2e%2e', '/tmp/x']) assert.strictEqual(service.resolveMeasurementAsset(value), null);
assert.strictEqual(service.resolveTechnicalDrawingAsset('technical-drawing-core.js'), path.join(root, 'technical-drawing', 'technical-drawing-core.js'));
for (const value of ['x.js', '..', '../x.js', '%2fetc', '/tmp/x']) assert.strictEqual(service.resolveTechnicalDrawingAsset(value), null);
console.log('OK - service assets prises de cotes');
