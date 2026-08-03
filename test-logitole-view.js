'use strict';

const assert = require('assert');
const { renderLogitoleView } = require('./views/logitoleView');
const icon = '<svg data-icon="logitole"></svg>';
const html = renderLogitoleView({ clientPageIcon: (name, className) => { assert.strictEqual(name, 'logitole'); assert.strictEqual(className, 'clients-title-icon'); return icon; } });

for (const expected of [
  'Calculateur de tôles', 'Optimisation de découpe', 'id="sheet-width"', 'value="3000"',
  'id="sheet-height"', 'value="1500"', 'id="sheet-gap"', 'value="3"',
  'id="sheet-cuts-body"', 'value="500"', 'value="300"', 'onclick="addSheetRow()"',
  'onclick="calculateSheets()"', 'onclick="printSheets()"', 'id="sheet-result"',
  'id="sheet-canvas"', 'width="900"', 'height="500"', 'function addSheetRow()',
  'function removeSheetRow(btn)', 'function calculateSheets()', 'function drawSheets(sheets, W, H, gap)',
  'function printSheets()', 'Aucune pièce', 'Rien à imprimer', '/outils/logitole',
  'Plan de découpe tôles', '#cfe8ff', icon
]) assert(html.includes(expected), `LogiTôle: contenu absent: ${expected}`);
assert(html.includes('Math.max(b.w, b.h) - Math.max(a.w, a.h)'));
assert(html.includes('row.remaining -= p.w'));
assert(html.includes('sheet.remaining -= p.h'));
assert(html.includes('ctx.fillRect(x, y, pw, ph)'));

console.log('OK - vue LogiTôle');
