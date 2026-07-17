'use strict';

const assert = require('assert');
const { parseEbpInvoiceText } = require('./lib/ebpQuoteParser');

function remaining(orderAmountHt, invoices) {
  const total = invoices.reduce((sum, invoice) => sum + Number(invoice.amount_ht || 0), 0);
  return Math.max(0, Math.round((Number(orderAmountHt || 0) - total) * 100) / 100);
}

function hasDuplicate(existing, candidate) {
  return existing.some((invoice) => {
    if (Number(invoice.client_order_id) !== Number(candidate.client_order_id)) return false;
    const sameNumber = invoice.invoice_number
      && candidate.invoice_number
      && invoice.invoice_number.toLowerCase() === candidate.invoice_number.toLowerCase();
    const sameHash = invoice.file_hash && candidate.file_hash && invoice.file_hash === candidate.file_hash;
    return sameNumber || sameHash;
  });
}

const twoPageInvoiceText = [
  '1 sur 2',
  'SARL A2 METAL',
  'CLIENT TEST',
  'Facture',
  'Numero',
  'FA20260717',
  'Date',
  '17/07/2026',
  'Mode de reglement Code client',
  'Description Qte P.U. HT TVA Montant HT',
  'Acompte portail acier',
  '\f',
  '2 sur 2',
  'Total HT Net',
  'Total TVA',
  'Total TTC',
  'Net a payer',
  '1 000,00',
  '200,00',
  '1 200,00',
  '1 200,00'
].join('\n');

const parsed = parseEbpInvoiceText(twoPageInvoiceText);
assert.strictEqual(parsed.recognized, true, parsed.reason);
assert.strictEqual(parsed.invoice_number, 'FA20260717');
assert.strictEqual(parsed.invoice_date, '17/07/2026');
assert.strictEqual(parsed.client_name, 'CLIENT TEST');
assert.strictEqual(parsed.amount_ht, 1000);
assert.strictEqual(parsed.vat_amount, 200);
assert.strictEqual(parsed.amount_ttc, 1200);
assert.strictEqual(parsed.pageCount, 2);

const invoices = [
  { client_order_id: 10, invoice_number: 'FA1', amount_ht: 400, original_file_name: 'fa1.pdf', file_hash: 'h1' },
  { client_order_id: 10, invoice_number: 'FA2', amount_ht: 350, original_file_name: 'fa2.pdf', file_hash: 'h2' },
];
assert.strictEqual(remaining(1000, invoices), 250, 'two partial invoices leave remaining amount');

const afterDelete = invoices.filter((invoice) => invoice.invoice_number !== 'FA1');
assert.strictEqual(remaining(1000, afterDelete), 650, 'deleting one invoice recalculates remaining amount');

const fullyPaid = invoices.concat({ client_order_id: 10, invoice_number: 'FA3', amount_ht: 500, original_file_name: 'fa3.pdf', file_hash: 'h3' });
assert.strictEqual(remaining(1000, fullyPaid), 0, 'fully invoiced order contributes zero');

assert.strictEqual(hasDuplicate(invoices, { client_order_id: 10, invoice_number: 'fa1', original_file_name: 'other.pdf', file_hash: 'other' }), true);
assert.strictEqual(hasDuplicate(invoices, { client_order_id: 10, invoice_number: 'FA9', original_file_name: 'fa2.pdf', file_hash: 'other' }), false);
assert.strictEqual(hasDuplicate(invoices, { client_order_id: 10, invoice_number: 'FA9', original_file_name: 'other.pdf', file_hash: 'h2' }), true);
assert.strictEqual(hasDuplicate(invoices, { client_order_id: 10, invoice_number: 'FA9', original_file_name: 'other.pdf', file_hash: 'h9' }), false);
assert.strictEqual(hasDuplicate(invoices, { client_order_id: 10, invoice_number: '', original_file_name: 'fa1.pdf', file_hash: 'h9' }), false);
assert.strictEqual(hasDuplicate(invoices, { client_order_id: 10, invoice_number: '', original_file_name: 'facture.pdf', file_hash: 'h2' }), true);
assert.strictEqual(hasDuplicate(invoices, { client_order_id: 11, invoice_number: 'FA1', original_file_name: 'other.pdf', file_hash: 'h1' }), false);

function invoiceTotalsAreConsistent(amountHt, vatAmount, amountTtc) {
  const expectedTtc = Math.round((Number(amountHt || 0) + Number(vatAmount || 0)) * 100) / 100;
  return Math.abs(expectedTtc - Number(amountTtc || 0)) <= 0.05;
}

assert.strictEqual(invoiceTotalsAreConsistent(1000, 200, 1200), true);
assert.strictEqual(invoiceTotalsAreConsistent(1000, 200, 1200.04), true);
assert.strictEqual(invoiceTotalsAreConsistent(1000, 200, 1198), false);

function shouldDeletePhysicalInvoiceFile(invoice) {
  return Boolean(invoice.stored_file_name && invoice.source_type !== 'existing');
}

function storedFileNameForValidation(sourceType, existingFileName, copiedFileName) {
  return sourceType === 'existing' ? existingFileName : copiedFileName;
}

assert.strictEqual(storedFileNameForValidation('existing', 'facture.pdf', 'facture-1.pdf'), 'facture.pdf');
assert.strictEqual(storedFileNameForValidation('upload', 'facture.pdf', 'facture-1.pdf'), 'facture-1.pdf');
assert.strictEqual(shouldDeletePhysicalInvoiceFile({ source_type: 'existing', stored_file_name: 'facture.pdf' }), false);
assert.strictEqual(shouldDeletePhysicalInvoiceFile({ source_type: 'upload', stored_file_name: 'facture.pdf' }), true);
assert.strictEqual(shouldDeletePhysicalInvoiceFile({ source_type: null, stored_file_name: 'facture.pdf' }), true);

console.log('ebp invoice tests ok');
