'use strict';

function createEbpDocumentParserService({ parseEbpQuoteText, parseEbpInvoiceText, parserHelpers } = {}) {
  function parseQuote(text) {
    const parsed = parseEbpQuoteText(text);
    return parsed.recognized ? parsed : parserHelpers.extractGenericQuoteFields(text, parsed);
  }

  function parseInvoice(text) {
    const parsed = parseEbpInvoiceText(text);
    return parserHelpers.applyInvoiceFallback(text, parsed);
  }

  return { parseQuote, parseInvoice };
}

module.exports = { createEbpDocumentParserService };
