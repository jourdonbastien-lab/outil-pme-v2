'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { createQuoteAcceptanceService } = require('./services/quoteAcceptanceService');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'quote-acceptance-'));
const db = new Database(':memory:');
db.exec(`
  CREATE TABLE quotes (
    id INTEGER PRIMARY KEY, title TEXT, client_name TEXT, client_email TEXT, client_phone TEXT,
    client_address TEXT, status TEXT, vat_rate REAL, margin_pct REAL,
    heures_etude REAL, heures_atelier REAL, heures_pose REAL
  );
  CREATE TABLE quote_lines (
    id INTEGER PRIMARY KEY, quote_id INTEGER, label TEXT, qty REAL, unit TEXT,
    unit_price REAL, total REAL, position INTEGER
  );
  CREATE TABLE clients (
    id INTEGER PRIMARY KEY, name TEXT, email TEXT, phone TEXT, address TEXT, created_at TEXT
  );
  CREATE TABLE client_orders (
    id INTEGER PRIMARY KEY, name TEXT, description TEXT, date TEXT, price REAL, vat_rate REAL,
    planned_hours REAL, quote_id INTEGER, work_category TEXT, status TEXT, created_at TEXT
  );
`);
db.prepare(`INSERT INTO quotes VALUES (1, 'Portail / entrée', ' Établissements Élégance ', 'a@b.fr', '01', 'Rue',
  'Brouillon', 20, 10, 1, 2, 3)`).run();
db.prepare(`INSERT INTO quote_lines VALUES (11, 1, 'Main-d’œuvre atelier', 9, 'h', 50, 450, 0)`).run();
db.prepare(`INSERT INTO quote_lines VALUES (12, 1, 'Acier', 2, 'u', 100, 200, 1)`).run();

const forecasts = [];
const imports = [];
const safeName = (value) => String(value).trim().replace(/\//g, '');
const ensureDir = (dir) => fs.mkdirSync(dir, { recursive: true });
const service = createQuoteAcceptanceService({
  db, fs, path, clientsRoot: root, safeName,
  uniqueFolder(base, wanted) {
    let name = wanted;
    let index = 2;
    while (fs.existsSync(path.join(base, name))) name = `${wanted}_${index++}`;
    return name;
  },
  ensureDir,
  ensureStandardSubfolders(dir) {
    ['Devis', 'Plans', 'Factures', 'Photos', 'Commandes', 'Heure chantier']
      .forEach((name) => ensureDir(path.join(dir, name)));
  },
  round2: (value) => Math.round((value + Number.EPSILON) * 100) / 100,
  isoDate: () => '2026-07-28',
  parseOptionalVatRate: Number,
  detectWorkCategory: () => 'portail',
  saveProjectForecast: (...args) => forecasts.push(args),
  importMissingQuoteCostLines: (...args) => imports.push(args),
  createDate: () => new Date('2026-07-28T12:00:00.000Z'),
  log() {}
});

assert.throws(() => service.acceptQuote(999), (error) => error.statusCode === 404 && error.message === 'Devis introuvable');
const first = service.acceptQuote(1);
assert.deepStrictEqual(first, { clientOrderId: 1, safeClient: 'Établissements Élégance', safeOrder: 'Portail  entrée' });
assert.deepStrictEqual(db.prepare('SELECT name, email, phone, address FROM clients').get(), {
  name: 'Établissements Élégance', email: 'a@b.fr', phone: '01', address: 'Rue'
});
assert.deepStrictEqual(db.prepare('SELECT name, description, date, price, vat_rate, planned_hours, quote_id, work_category, status FROM client_orders').get(), {
  name: 'Établissements Élégance', description: 'Portail / entrée', date: '2026-07-28',
  price: 715, vat_rate: 20, planned_hours: 6, quote_id: 1, work_category: 'portail', status: 'En cours'
});
assert.strictEqual(db.prepare('SELECT status FROM quotes WHERE id = 1').get().status, 'Accepté');
assert.strictEqual(forecasts.length, 1);
assert.strictEqual(forecasts[0][0].total_ht, 715);
assert.deepStrictEqual(imports, [[1, 1]]);
const orderDir = path.join(root, first.safeClient, first.safeOrder);
for (const folder of ['Devis', 'Plans', 'Factures', 'Photos', 'Commandes', 'Heure chantier']) {
  assert(fs.statSync(path.join(orderDir, folder)).isDirectory());
}
const description = fs.readFileSync(path.join(orderDir, 'Devis', 'Descriptif devis.txt'), 'utf8');
assert(description.includes('9 x Main-d’œuvre atelier - 50 €'));
assert(description.includes('2 x Acier - 100 €'));
assert(description.includes('TOTAL : 715.00 €'));

// Aucun anti-doublon historique : une seconde acceptation crée une seconde commande et un dossier suffixé.
const second = service.acceptQuote(1);
assert.strictEqual(second.clientOrderId, 2);
assert.strictEqual(second.safeOrder, 'Portail  entrée_2');
assert.strictEqual(db.prepare('SELECT COUNT(*) AS count FROM client_orders WHERE quote_id = 1').get().count, 2);
assert.strictEqual(db.prepare('SELECT COUNT(*) AS count FROM clients').get().count, 1);

db.prepare(`INSERT INTO quotes (id, title, client_name) VALUES (2, 'Titre', '')`).run();
assert.throws(() => service.acceptQuote(2), (error) => error.statusCode === 400 && error.message === 'Client manquant sur le devis');
db.prepare(`INSERT INTO quotes (id, title, client_name) VALUES (3, '', 'Client')`).run();
assert.throws(() => service.acceptQuote(3), (error) => error.statusCode === 400 && error.message === 'Titre du devis manquant');

db.close();
fs.rmSync(root, { recursive: true, force: true });
console.log('OK - service acceptation devis');
