'use strict';

const assert = require('assert');
const fs = require('fs');
const costs = require('./lib/clientOrderCostLines');

const labor = costs.validateLine({
  line_type: 'labor', designation: 'Fabrication', category: 'Fabrication',
  planned_hours: '7,5', hourly_cost_ht: '38,00', hourly_sale_ht: '58,00'
});
assert.strictEqual(labor.planned_minutes, 450, 'les heures françaises doivent être stockées en minutes');
assert.deepStrictEqual(costs.calculateLine(labor), { cost: 285, sale: 435, margin: 150, hours: 7.5 });

const material = costs.validateLine({
  line_type: 'material', designation: 'Tube 50 × 30 × 2', quantity: '12,0', unit: 'ml',
  unit_cost_ht: '6,20', unit_sale_ht: '11,50', supplier: 'Fournisseur test'
});
assert.deepStrictEqual(costs.calculateLine(material), { cost: 74.4, sale: 138, margin: 63.6, hours: 0 });

const other = costs.validateLine({ line_type: 'other', designation: 'Galvanisation', quantity: 1, unit: 'forfait', unit_cost_ht: 500, unit_sale_ht: 650 });
const summary = costs.summarize([labor, material, other], 1300, 600, null);
assert.strictEqual(summary.totalCost, 859.4);
assert.strictEqual(summary.totalSale, 1223);
assert.strictEqual(summary.margin, 363.6);
assert.strictEqual(summary.plannedHours, 7.5);
assert.strictEqual(summary.actualHours, 10);
assert.strictEqual(summary.hoursVariance, 2.5);
assert.strictEqual(summary.contractVariance, 77);
assert.strictEqual(summary.actualMaterialCost, null);

assert.throws(() => costs.validateLine({ line_type: 'material', designation: '', quantity: 1 }), /désignation/i);
assert.throws(() => costs.validateLine({ line_type: 'material', designation: 'Tube', quantity: '-1' }), /positif/i);
assert.throws(() => costs.validateLine({ line_type: 'invalid', designation: 'Test' }), /Type de ligne/);
assert.strictEqual(costs.validateLine({ line_type: 'other', designation: 'X'.repeat(300), quantity: 1 }).designation.length, 255);

const server = fs.readFileSync('server.js', 'utf8');
const css = fs.readFileSync('public/style.css', 'utf8');
assert(server.includes('CREATE TABLE IF NOT EXISTS client_order_cost_lines'));
assert(server.includes('idx_client_order_cost_lines_order_type'));
assert(server.includes('idx_client_order_cost_lines_quote_source'));
for (const route of [
  "app.post('/orders/client/:orderId/cost-lines', requireLogin",
  "app.post('/orders/client/:orderId/cost-lines/:lineId/edit', requireLogin",
  "app.post('/orders/client/:orderId/cost-lines/:lineId/duplicate', requireLogin",
  "app.post('/orders/client/:orderId/cost-lines/:lineId/delete', requireLogin",
  "app.post('/orders/client/:orderId/cost-lines/import-quote', requireLogin"
]) assert(server.includes(route), `route absente: ${route}`);
assert(server.includes('WHERE id = ? AND client_order_id = ?'), 'isolation commande/ligne absente');
assert(server.includes('INSERT OR IGNORE INTO client_order_cost_lines'), 'import anti-doublon absent');
assert(server.includes('Le prix contractuel reste inchangé'));
assert(server.includes('Aucune matière ni main-d’œuvre renseignée'));
assert(css.includes('.order-forecast-columns'));
assert(css.includes('@media(max-width:600px)'));
assert(css.includes('min-height:48px'));

console.log('OK - lignes prévisionnelles directes des commandes');
