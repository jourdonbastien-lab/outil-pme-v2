'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const publicDir = path.join(root, 'modules', 'measurements', 'public');
const backupDir = path.join(root, 'backups', 'measurement-design-2026-07-20-1500');
const modules = [
  'measurements.html',
  'escalier-v2.html',
  'portail.html',
  'cloture.html',
  'garde-corps.html',
  'pergola.html',
  'verriere.html',
  'autres.html'
];

function savedFieldNames(html) {
  return Array.from(html.matchAll(/\bname=["']([^"']+)["']/g), (match) => match[1]).sort();
}

for (const file of modules) {
  const current = fs.readFileSync(path.join(publicDir, file), 'utf8');
  const before = fs.readFileSync(path.join(backupDir, file), 'utf8');
  assert(current.includes('measurement-modern.css'), `${file}: feuille partagee absente`);
  assert(current.includes('measurement-modern.js'), `${file}: interface partagee absente`);
  assert.deepStrictEqual(savedFieldNames(current), savedFieldNames(before), `${file}: un nom de champ sauvegarde a change`);
}

const css = fs.readFileSync(path.join(publicDir, 'measurement-modern.css'), 'utf8');
assert(css.includes('--measurement-dark: #0b1220'), 'la couleur bleu nuit doit venir de la charte');
assert(css.includes('--measurement-orange: #f97316'), 'l orange A2 Metal doit venir de la charte');
assert(css.includes('min-height: 44px'), 'les cibles tactiles doivent mesurer au moins 44 px');
assert(css.includes('env(safe-area-inset-bottom)'), 'la safe area iPhone doit etre prise en compte');
assert(css.includes('@media (max-width: 600px)'), 'la disposition iPhone doit exister');
assert(css.includes('@media (max-width: 900px)'), 'la disposition tablette doit exister');
assert(css.includes('@media (min-width: 900px)'), 'la disposition ordinateur doit exister');
assert(css.includes('.measurement-mobile-actions'), 'les actions mobiles fixes doivent etre gerees');
assert(css.includes('padding: 12px 12px calc(104px + env(safe-area-inset-bottom))'), 'le contenu doit rester au-dessus des actions mobiles');

const ui = fs.readFileSync(path.join(publicDir, 'measurement-modern.js'), 'utf8');
assert(ui.includes('measurement-quote-badge'), 'le badge devis doit etre affiche');
assert(ui.includes("document.getElementById('saveBtn')"), 'le bouton Enregistrer existant doit etre reutilise');
assert(!ui.includes('fetch('), 'la couche de design ne doit modifier aucune donnee ni route');
assert(!ui.includes('localStorage'), 'la couche de design ne doit modifier aucun stockage local');

const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
assert(server.includes("'measurement-modern.css'"), 'la feuille partagee doit etre servie en mode authentifie');
assert(server.includes("'measurement-modern.js'"), 'le script partage doit etre servi en mode authentifie');

console.log('OK - design partage des prises de cotes');
