'use strict';

const assert = require('assert');
const { renderPcFilePreviewView } = require('./views/pcFilePreviewView');

const pdf = renderPcFilePreviewView({ rawUrl: '/pc-file-raw/A/B/Devis/devis.pdf', isPdf: true });
assert(pdf.includes('<embed'));
assert(pdf.includes('type="application/pdf"'));
assert(!pdf.includes('<iframe'));
assert(pdf.includes('class="topbar"'));
assert(pdf.includes('class="close-btn"'));
assert(pdf.includes('onclick="history.back()">Retour</button>'));
assert(pdf.includes('src="/pc-file-raw/A/B/Devis/devis.pdf"'));

for (const rawUrl of [
  '/pc-file-raw/A/B/Photos/image.jpg',
  '/pc-file-raw/A/B/Plans/note.txt',
  "/pc-file-raw/Client%20%C3%A9/Commande%20d'%C3%A9t%C3%A9/Plans/pi%C3%A8ce.bin"
]) {
  const html = renderPcFilePreviewView({ rawUrl, isPdf: false });
  assert(html.includes('<iframe'));
  assert(!html.includes('<embed'));
  assert(html.includes(`src="${rawUrl}"`));
}
console.log('OK - vue aperçu fichier PC');
