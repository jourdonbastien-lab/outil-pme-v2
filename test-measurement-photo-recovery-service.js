'use strict';
const assert = require('assert');
const { createMeasurementPhotoRecoveryService } = require('./services/measurementPhotoRecoveryService');
const service = createMeasurementPhotoRecoveryService({ parseOptionalId: (value) => Number(value) > 0 ? Number(value) : null });
assert.deepStrictEqual(service.getRecoveryAccessContext({ id: '9', role: 'admin' }), { ok: true, allowed: true });
assert.deepStrictEqual(service.getRecoveryAccessContext({ id: '9', role: 'atelier' }), { ok: true, allowed: false });
assert.deepStrictEqual(service.getRecoveryAccessContext({ id: '8', role: 'admin' }), { ok: true, allowed: false });
assert.deepStrictEqual(service.getRecoveryAccessContext({ id: '9' }), { ok: true, allowed: true });
console.log('OK - service accès récupération photos');
