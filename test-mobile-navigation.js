'use strict';

const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('server.js', 'utf8');
function between(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert(start >= 0 && end > start, `source introuvable entre ${startMarker} et ${endMarker}`);
  return source.slice(start, end);
}

const functionsSource = [
  between('function navIcon(name)', 'function mobileNavIcon(name)'),
  between('function mobileNavIcon(name)', 'function clientPageIcon(name'),
  between('function pageTemplate(req, title, content)', '/* ===================== AUTH ===================== */')
].join('\n');
const escHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const pageTemplate = new Function('escHtml', `${functionsSource}; return pageTemplate;`)(escHtml);

function requestFor(role) {
  return {
    path: '/dashboard',
    session: { user: { id: 1, username: role === 'atelier' ? 'atelier' : 'admin', role } },
    navStats: { tasksTodo: 0, eventsToday: 0, clientOrders: 0, supplierOrders: 0 }
  };
}

function moreSheet(html) {
  const start = html.indexOf('<section id="mobileMoreSheet"');
  const end = html.indexOf('</section>', start);
  assert(start >= 0 && end > start, 'menu mobile Plus absent du HTML final');
  return html.slice(start, end + '</section>'.length);
}

const adminSheet = moreSheet(pageTemplate(requestFor('admin'), 'Test admin', '<p>Test</p>'));
const expectedAdminHrefs = [
  '/tasks', '/devis', '/documents-entrants', '/orders/clients', '/orders/suppliers',
  '/outils/prises-cotes', '/materials', '/outils/logibarre', '/outils/logitole',
  '/outils/barreaudage', '/logout'
];
const actualAdminHrefs = Array.from(adminSheet.matchAll(/href="([^"]+)"/g), (match) => match[1]);
assert.deepStrictEqual(actualAdminHrefs, expectedAdminHrefs, 'ordre du menu administrateur incorrect');
assert(adminSheet.includes('href="/documents-entrants"'), 'Documents entrants absent pour un administrateur');
assert(adminSheet.indexOf('href="/devis"') < adminSheet.indexOf('href="/documents-entrants"'));
assert(adminSheet.indexOf('href="/documents-entrants"') < adminSheet.indexOf('href="/orders/clients"'));

const atelierSheet = moreSheet(pageTemplate(requestFor('atelier'), 'Test atelier', '<p>Test</p>'));
assert(!atelierSheet.includes('href="/documents-entrants"'), 'Documents entrants ne doit pas être visible pour atelier');

console.log('OK - navigation mobile par rôle');
