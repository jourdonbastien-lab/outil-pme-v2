'use strict';
const assert = require('assert');
const fs = require('fs');
const { renderClientFolderNavigationView } = require('./views/clientFolderNavigationView');
const escapeHtml = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const base = { client: 'Client Démo', folders: [], escapeHtml, pcFolderIcon: () => '<svg></svg>' };
let html = renderClientFolderNavigationView(base);
assert(html.includes('<h1>Client Démo</h1>'));
assert(html.includes('Aucune commande trouvée.'));
assert(html.includes('href="/clients">Retour clients</a>'));
html = renderClientFolderNavigationView({
  ...base,
  client: "<Client d'essai>",
  folders: [
    { displayName: 'Atelier ancien', url: '/pc-folders/Client/Atelier%20ancien', isHistorical: true },
    { displayName: 'Étage', url: '/pc-folders/Client/%C3%89tage', isHistorical: false }
  ]
});
assert(html.indexOf('Atelier ancien') < html.indexOf('Étage'));
assert(html.includes('&lt;Client d\'essai&gt;'));
assert(html.includes('pc-modern-card-link'));
assert(html.includes('<svg'));
const source = fs.readFileSync('views/clientFolderNavigationView.js', 'utf8');
assert(!/req\.|res\.|db\.prepare|sqlite|fs\.|path\./i.test(source));
console.log('OK - vue navigation dossiers clients');
