'use strict';

const assert = require('assert');
const { parseEbpQuoteText } = require('./lib/ebpQuoteParser');

const ebpQuoteText = `
SARL A2 METAL
A2 METAL
Zone de l'Atlantique
44800 SAINT-HERBLAIN

MULTI SERVICE BOVIN
La Quantinière
49800 TRELAZE
Code client Mode de règlement
DE001000
Date 02/07/2026

Description Qté P.U. HT Montant HT TVA
Fabrication de coffre pour rotor
1 3 956,88 3 956,88 20,00

Total HT Net 3 956,88
Total TVA 791,38
Total TTC 4 748,26

Bon pour accord
Conditions générales
Total TTC 9 999,99
`;

const result = parseEbpQuoteText(ebpQuoteText);

assert.strictEqual(result.recognized, true, 'Le devis EBP doit être reconnu');
assert.strictEqual(result.analysisUsed, 'Parser EBP');
assert.strictEqual(result.client_name, 'MULTI SERVICE BOVIN');
assert.strictEqual(result.quote_number, 'DE001000');
assert.strictEqual(result.quote_date, '02/07/2026');
assert.strictEqual(result.title, 'Fabrication de coffre pour rotor');
assert.strictEqual(result.amount_ht, 3956.88);
assert.strictEqual(result.amount_ttc, 4748.26);

console.log('OK');