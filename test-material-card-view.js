'use strict';
const assert = require('assert');
const { renderMaterialCard } = require('./views/materialCardView');
const escHtml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll("'", '&#39;');
const html = renderMaterialCard({ id: 7, name: "Tube <acier d'été>", unit: 'ml', price: 12.5 }, { escHtml, type: 'Tubes & profils' });
for (const token of ['class="material-list-row"', 'href="/materials/7"', '12.50 €', 'ml', 'Tube &lt;acier d&#39;été>', 'Tubes &amp; profils', 'aria-hidden="true"']) assert(html.includes(token), token);
console.log('OK - carte matière');
