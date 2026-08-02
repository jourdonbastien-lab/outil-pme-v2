'use strict';
const assert=require('assert'); const parser=require('./lib/ebpQuoteParser'); const {createEbpDocumentParserService}=require('./services/ebpDocumentParserService');
const service=createEbpDocumentParserService({parseEbpQuoteText:parser.parseEbpQuoteText,parseEbpInvoiceText:parser.parseEbpInvoiceText});
const quoteText='DEVIS\nN° DE2026001\nTOTAL HT 1 000,00 €\nTOTAL TTC 1 200,00 €'; const invoiceText='FACTURE N° FA2026001\nTOTAL HT 100,00\nTVA 20,00\nTOTAL TTC 120,00';
assert.deepStrictEqual(service.parseQuote(quoteText),parser.parseEbpQuoteText(quoteText)); assert.deepStrictEqual(service.parseInvoice(invoiceText),parser.parseEbpInvoiceText(invoiceText)); assert.deepStrictEqual(service.parseQuote(''),parser.parseEbpQuoteText('')); console.log('OK - service parser EBP');
