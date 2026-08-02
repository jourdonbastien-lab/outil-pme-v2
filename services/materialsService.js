'use strict';

const STANDARD_MATERIALS = [
  ...['20x20x2', '25x25x2', '30x30x2', '40x40x2', '50x50x2', '60x60x3', '80x80x3', '100x100x4']
    .map((name) => ({ type: 'Tubes carrés acier', name, unit: 'ml' })),
  ...['40x20x2', '50x30x2', '60x30x2', '80x40x3', '100x50x3', '120x60x4', '150x100x5']
    .map((name) => ({ type: 'Tubes rectangulaires acier', name, unit: 'ml' })),
  ...['Ø20x2', 'Ø26,9x2,3', 'Ø33,7x2,6', 'Ø42,4x2,6', 'Ø48,3x3,2', 'Ø60,3x3,2']
    .map((name) => ({ type: 'Tubes ronds acier', name, unit: 'ml' })),
  ...['25x25x3', '30x30x3', '40x40x4', '50x50x5', '60x60x6']
    .map((name) => ({ type: 'Cornières acier', name, unit: 'ml' })),
  ...['20x5', '30x5', '40x5', '50x8', '60x10', '80x10', '100x10']
    .map((name) => ({ type: 'Plats acier', name, unit: 'ml' })),
  ...['UPN 80', 'UPN 100', 'UPN 120', 'IPN 80', 'IPN 100', 'IPN 120', 'IPE 100', 'IPE 120', 'HEA 100', 'HEA 120']
    .map((name) => ({ type: 'UPN / IPN / IPE / HEA', name, unit: 'ml' })),
  ...['1,5 mm', '2 mm', '3 mm', '4 mm', '5 mm', '6 mm', '8 mm', '10 mm', 'larmée 3/5', 'perforée standard']
    .map((name) => ({ type: 'Tôles acier', name, unit: 'm²' })),
  ...['2 mm', '3 mm', '4 mm', '5 mm', 'damier 3/5']
    .map((name) => ({ type: 'Tôles alu', name, unit: 'm²' })),
  ...['1,5 mm', '2 mm', '3 mm', 'brossée 2 mm', 'brossée 3 mm']
    .map((name) => ({ type: 'Tôles inox', name, unit: 'm²' })),
  ...['caillebotis 30x30', 'caillebotis 30x10', 'marche caillebotis standard']
    .map((name) => ({ type: 'Caillebotis', name, unit: 'm²' })),
  ...[
    'platine 100x100x8', 'platine 150x150x10', 'paumelle portail', 'gond réglable',
    'serrure portail', 'bouchon tube carré 40', 'bouchon tube carré 50',
    'bouchon tube rectangulaire 80x40', 'main courante ronde inox', 'câble inox', 'tendeur inox'
  ].map((name) => ({ type: 'Accessoires courants', name, unit: 'pièce' }))
];

function createMaterialsService({ db, parseDecimalInput, now = () => new Date().toISOString() } = {}) {
  if (!db || typeof db.prepare !== 'function') throw new TypeError('Base matières manquante.');
  if (typeof parseDecimalInput !== 'function') throw new TypeError('Parseur décimal matières manquant.');

  function listMaterials(search = '') {
    const q = String(search || '').trim();
    const totalMaterials = db.prepare('SELECT COUNT(*) AS c FROM materials').get().c;
    const materials = q
      ? db.prepare(`
          SELECT *
          FROM materials
          WHERE lower(COALESCE(type, '')) LIKE lower(?)
             OR lower(COALESCE(name, '')) LIKE lower(?)
             OR lower(COALESCE(unit, '')) LIKE lower(?)
          ORDER BY type, name
        `).all(`%${q}%`, `%${q}%`, `%${q}%`)
      : db.prepare('SELECT * FROM materials ORDER BY type, name').all();
    return { q, totalMaterials, materials };
  }

  function getMaterialById(id) {
    return db.prepare('SELECT * FROM materials WHERE id = ?').get(id);
  }

  function materialExists(id) {
    return db.prepare('SELECT id FROM materials WHERE id = ?').get(id);
  }

  function createMaterial(body) {
    const kgPerM = String(body.kg_per_m || '').trim() !== '' ? parseDecimalInput(body.kg_per_m, null) : null;
    const density = String(body.density || '').trim() !== '' ? parseDecimalInput(body.density, null) : null;
    return db.prepare(
      'INSERT INTO materials (type, name, unit, price, kg_per_m, density, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(body.type, body.name, body.unit, parseDecimalInput(body.price, 0), kgPerM, density, now());
  }

  function updateMaterial(id, body) {
    const unit = String(body.unit || '').trim();
    const price = parseDecimalInput(body.price, 0);
    const kgPerM = String(body.kg_per_m || '').trim() !== '' ? parseDecimalInput(body.kg_per_m, null) : null;
    const density = String(body.density || '').trim() !== '' ? parseDecimalInput(body.density, null) : null;
    return db.prepare('UPDATE materials SET unit = ?, price = ?, kg_per_m = ?, density = ? WHERE id = ?')
      .run(unit, price, kgPerM, density, id);
  }

  function deleteMaterial(id) {
    return db.prepare('DELETE FROM materials WHERE id = ?').run(id);
  }

  function seedStandardMaterials() {
    const findExisting = db.prepare('SELECT id FROM materials WHERE lower(type) = lower(?) AND lower(name) = lower(?) LIMIT 1');
    const insertMaterial = db.prepare(
      'INSERT INTO materials (type, name, unit, price, kg_per_m, density, created_at) VALUES (?, ?, ?, 0, NULL, NULL, ?)'
    );
    const createdAt = now();
    const run = db.transaction((items) => {
      let inserted = 0;
      for (const item of items) {
        const type = String(item.type || '').trim();
        const name = String(item.name || '').trim();
        const unit = String(item.unit || '').trim();
        if (!type || !name) continue;
        if (findExisting.get(type, name)) continue;
        insertMaterial.run(type, name, unit, createdAt);
        inserted += 1;
      }
      return inserted;
    });
    return run(STANDARD_MATERIALS);
  }

  return { listMaterials, getMaterialById, materialExists, createMaterial, updateMaterial, deleteMaterial, seedStandardMaterials };
}

module.exports = { createMaterialsService, STANDARD_MATERIALS };
