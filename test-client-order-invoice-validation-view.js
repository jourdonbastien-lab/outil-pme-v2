'use strict';
const assert = require('assert');
const fs = require('fs');
const { renderClientOrderInvoiceValidationView } = require('./views/clientOrderInvoiceValidationView');
const html = renderClientOrderInvoiceValidationView({
  order: { id: 4, name: '<Client>', description: 'Portail' }, warning: 'Montants incohérents',
  sourceType: 'upload', scanFileName: 'tmp.pdf', existingFileName: '', scanOriginalName: 'facture.pdf',
  fields: { invoice_number: 'FA-1', invoice_date: '2026-07-26' }, amountHt: '100', vatAmount: '20',
  amountTtc: '120', cancelUrl: '/retour', defaultInvoiceDate: '2026-07-26',
  escapeHtml: (v) => String(v).replace(/</g, '&lt;').replace(/>/g, '&gt;'), clientPageIcon: () => '<svg></svg>'
});
assert(html.includes('Validation facture EBP'));
assert(html.includes('method="POST" action="/orders/client/4/invoices/create"'));
for (const name of ['source_type', 'scan_file', 'existing_file', 'scan_original_name', 'amount_ht', 'vat_amount', 'amount_ttc']) {
  assert(html.includes(`name="${name}"`), `champ ${name} absent`);
}
assert(html.includes('&lt;Client&gt;') && html.includes('Montants incohérents'));
const source = fs.readFileSync('views/clientOrderInvoiceValidationView.js', 'utf8');
assert(!/OCR|analyzeEbpFile|db\.prepare|req\.|res\./.test(source));
console.log('OK - vue validation facture EBP');
