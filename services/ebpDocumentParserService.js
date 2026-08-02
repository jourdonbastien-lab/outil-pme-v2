'use strict';

function createEbpDocumentParserService({ parseEbpQuoteText, parseEbpInvoiceText } = {}) {
  return { parseQuote: parseEbpQuoteText, parseInvoice: parseEbpInvoiceText };
}

module.exports = { createEbpDocumentParserService };
