'use strict';

const assert = require('assert');
const { parseEbpQuoteText } = require('./lib/ebpQuoteParser');

const ebpQuoteText = [
  'Siret : 000 000 000 00000',
  '1 sur 2',
  'MULTI SERVICE BOVIN',
  'La Quantiniere',
  '49800 TRELAZE',
  'Mode de reglementCode client',
  'CL00707',
  'Date',
  '02/07/2026',
  'Numero',
  'DE001000',
  'Date de validite',
  '01/08/2026',
  'Devis',
  'SARL A2 METAL',
  '',
  'TVAMontant HTP.U. HTQteDescription',
  '0,00',
  '0,00\u00A00,00',
  '0,00',
  'Fabrication de coffre pour rotor',
  'Dimensions: 720 x 260 x 280 mm',
  '',
  'Total HT Net',
  'Total TVA',
  'Total TTC',
  'Net a payer',
  '3\u202F956,88',
  '791,38',
  '4\u00A0748,26',
  '4\u00A0748,26 EUR',
  '',
  'Conditions generales',
  'Total TTC 9 999,99',
].join('\n');

const result = parseEbpQuoteText(ebpQuoteText);

assert.strictEqual(result.matched, true, 'Le devis EBP doit etre reconnu');
assert.strictEqual(result.analysisUsed, 'Parser EBP');
assert.strictEqual(result.client_name, 'MULTI SERVICE BOVIN');
assert.strictEqual(result.quote_number, 'DE001000');
assert.strictEqual(result.quote_date, '02/07/2026');
assert.strictEqual(result.title, 'Fabrication de coffre pour rotor');
assert.strictEqual(result.amount_ht, 3956.88);
assert.strictEqual(result.amount_ttc, 4748.26);

console.log('OK');
