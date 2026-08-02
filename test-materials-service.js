'use strict';
const assert = require('assert');
const Database = require('better-sqlite3');
const { createMaterialsService, STANDARD_MATERIALS } = require('./services/materialsService');

const db = new Database(':memory:');
db.exec(`CREATE TABLE materials (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, name TEXT, unit TEXT, price REAL NOT NULL DEFAULT 0, kg_per_m REAL, density REAL, created_at TEXT)`);
const parseDecimalInput = (value, fallback = 0) => {
  const normalized = String(value ?? '').trim().replace(',', '.');
  if (!normalized) return fallback;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : fallback;
};
const service = createMaterialsService({ db, parseDecimalInput, now: () => '2026-08-02T10:00:00.000Z' });

assert.deepStrictEqual(service.listMaterials(), { q: '', totalMaterials: 0, materials: [] });
const created = service.createMaterial({ type: 'Tôle', name: "Acier d'été", unit: 'm²', price: '12,50', kg_per_m: '', density: '7,85' });
assert.strictEqual(Number(created.lastInsertRowid), 1);
let material = service.getMaterialById(1);
assert.deepStrictEqual({ type: material.type, name: material.name, unit: material.unit, price: material.price, kg: material.kg_per_m, density: material.density },
  { type: 'Tôle', name: "Acier d'été", unit: 'm²', price: 12.5, kg: null, density: 7.85 });
service.createMaterial({ type: 'Barre', name: 'Zéro', unit: 'ml', price: 0, kg_per_m: '2,4', density: '' });
assert.deepStrictEqual(service.listMaterials('été').materials.map((row) => row.id), [1]);
assert.deepStrictEqual(service.listMaterials().materials.map((row) => row.type), ['Barre', 'Tôle']);
service.updateMaterial(1, { unit: 'kg ', price: '3,25', kg_per_m: '0', density: '' });
material = service.getMaterialById(1);
assert.deepStrictEqual([material.unit, material.price, material.kg_per_m, material.density], ['kg', 3.25, 0, null]);
assert.strictEqual(service.getMaterialById(999), undefined);
assert.strictEqual(service.materialExists(2).id, 2);
service.deleteMaterial(999);
service.deleteMaterial(1);
assert.strictEqual(service.getMaterialById(1), undefined);
const inserted = service.seedStandardMaterials();
assert.strictEqual(inserted, STANDARD_MATERIALS.length);
assert.strictEqual(service.seedStandardMaterials(), 0);
assert.strictEqual(service.listMaterials().totalMaterials, STANDARD_MATERIALS.length + 1);
assert.throws(() => createMaterialsService({ db }), /Parseur/);
db.close();
console.log('OK - service matières');
