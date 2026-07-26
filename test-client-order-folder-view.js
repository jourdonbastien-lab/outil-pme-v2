'use strict';
const assert = require('assert');
const fs = require('fs');
const {
  renderClientOrderFolderView, renderClientOrderRootFolderView,
  renderClientOrderFilesList, renderPurchasesBlock
} = require('./views/clientOrderFolderView');
const common = { escapeHtml: String, pcFolderIcon: () => '<svg></svg>' };
const filesHtml = renderClientOrderFilesList({
  files: [{ name: 'plan.pdf', iconName: 'file', invoiceAnalyzeAction: '<form>Analyser</form>' }],
  client: 'Client', order: 'Portail', type: 'Plans', ...common
});
assert(filesHtml.includes('/pc-file/Client/Portail/Plans/plan.pdf'));
assert(filesHtml.includes('Analyser'));
const purchasesHtml = renderPurchasesBlock({
  type: 'Commandes', orderDb: null, purchases: [], escapeHtml: String,
  clientPageIcon: () => '', normalizePurchaseStatus: String, purchaseStatusClass: String,
  purchaseStatusOptions: String, formatDateLabel: String
});
assert(purchasesHtml.includes('Commande non retrouvée en base'));
const html = renderClientOrderFolderView({
  client: 'Client', order: 'Portail', type: 'Plans', files: [{ name: 'plan.pdf' }],
  filesHtml, purchasesHtml: '', invoicesHtml: '', ...common
});
assert(html.includes('<h1>Plans</h1>'));
assert(html.includes('enctype="multipart/form-data"'));
assert(html.includes('action="/pc-folders/Client/Portail/Plans/upload"'));
const rootHtml = renderClientOrderRootFolderView({
  client: 'Client', order: 'Portail', folders: ['Plans', 'Photos'],
  orderDb: { id: 7, chantier_status: 'En pose' }, linkedMeasurementsHtml: '<article>Mesure</article>',
  escapeHtml: String, pcFolderIcon: () => '<svg></svg>', clientPageIcon: () => '<svg></svg>',
  chantierStatusOptions: () => '<option>En pose</option>'
});
assert(rootHtml.includes('action="/orders/client/7/chantier"'));
assert(rootHtml.includes('/orders/client/7/profitability'));
assert(rootHtml.includes('Saisir des heures'));
assert(rootHtml.includes('Prises de cotes liées'));
const source = fs.readFileSync('views/clientOrderFolderView.js', 'utf8');
assert(!/db\.prepare|fs\.|req\.|res\./.test(source));
console.log('OK - vue dossier commande client');
