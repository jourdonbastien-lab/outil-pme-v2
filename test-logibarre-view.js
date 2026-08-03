'use strict';

const assert = require('assert');
const { renderLogibarreView } = require('./views/logibarreView');
const icon = '<svg data-icon="logibarre"></svg>';
const html = renderLogibarreView({ clientPageIcon: (name, className) => { assert.strictEqual(name, 'logibarre'); assert.strictEqual(className, 'clients-title-icon'); return icon; } });

for (const expected of [
  'Calculateur de barres', 'Optimisation des coupes', 'id="bar-length"', 'value="6000"',
  'id="bar-loss"', 'value="3"', 'id="cuts-body"', 'value="1200"',
  'onclick="addRow()"', 'onclick="calculateBars()"', 'onclick="printBars()"',
  'id="bar-result"', 'function addRow()', 'function removeRow(btn)',
  'function calculateBars()', 'function printBars()', 'Longueur de barre invalide',
  'Aucune coupe', 'Rien à imprimer', '/outils/logibarre', 'Plan de coupe barres', icon
]) assert(html.includes(expected), `LogiBarre: contenu absent: ${expected}`);
assert(html.indexOf("cuts.sort(function(a, b)") < html.indexOf('cuts.forEach(function(cut)'));
assert(html.includes('bar.remaining -= cut'));
assert(html.includes('return c - loss'));

console.log('OK - vue LogiBarre');
