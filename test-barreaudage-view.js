'use strict';

const assert = require('assert');
const { renderBarreaudageView } = require('./views/barreaudageView');
const icon = '<svg data-icon="barreaudage"></svg>';
const html = renderBarreaudageView({ clientPageIcon: (name, className) => { assert.strictEqual(name, 'barreaudage'); assert.strictEqual(className, 'clients-title-icon'); return icon; } });

for (const expected of [
  'Calcul barreaudage', 'Espacement et positions', 'id="railing-total-length"', 'value="1500"',
  'id="railing-bar-width"', 'value="20"', 'id="railing-max-space"', 'value="110"',
  'id="railing-bar-count"', 'placeholder="Auto"', 'onclick="calculateBarreaudage()"',
  'onclick="resetBarreaudage()"', 'id="railing-result"', 'function getRailingNumber(id)',
  'function formatRailingMm(value)', 'function findMinimumBars(totalLength, barWidth, maxSpace)',
  'function buildRailingDiagram(totalLength, barWidth, barCount, spacing, maxSpace)',
  'function buildRailingPositions(barCount, barWidth, spacing)',
  'function buildRailingPositionsHtml(positions)', 'function calculateBarreaudage()',
  'function resetBarreaudage()', '<svg class="barreaudage-svg"', '760', '220', icon
]) assert(html.includes(expected), `Barreaudage: contenu absent: ${expected}`);
assert(html.includes('Math.round(value * 10) / 10'));
assert(html.includes('(totalLength - count * barWidth) / (count + 1)'));
assert(html.includes('manualCount > 0 ? Math.floor(manualCount)'));

console.log('OK - vue Barreaudage');
