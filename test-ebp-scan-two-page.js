'use strict';

const assert = require('assert');
const { parseEbpQuoteText } = require('./lib/ebpQuoteParser');

const extractedTwoPagePdfText = [
  '1 sur 2',
  'SARL A2 METAL',
  'CLIENT TEST',
  'Devis',
  'Numero',
  'DE12345',
  'Date',
  '17/07/2026',
  'Date de validite',
  '31/07/2026',
  'Mode de reglement Code client',
  'Description Qte P.U. HT TVA Montant HT',
  'Portail acier thermolaque',
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

const result = parseEbpQuoteText(extractedTwoPagePdfText);

assert.strictEqual(result.recognized, true, result.reason);
assert.strictEqual(result.client_name, 'CLIENT TEST');
assert.strictEqual(result.quote_number, 'DE12345');
assert.strictEqual(result.quote_date, '17/07/2026');
assert.strictEqual(result.title, 'Portail acier thermolaque');
assert.strictEqual(result.amount_ht, 1000);
assert.strictEqual(result.amount_ttc, 1200);
assert.strictEqual(result.pageCount, 2);

console.log('ebp two-page extracted PDF text test ok');
