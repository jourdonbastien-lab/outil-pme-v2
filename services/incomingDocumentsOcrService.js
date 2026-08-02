'use strict';

function createIncomingDocumentsOcrService({ analyzeEbpFile } = {}) {
  async function extractTextFromDocument(filePath, mimeType) {
    const analysis = await analyzeEbpFile(filePath, mimeType);
    if (!String(analysis.text || '').trim() && analysis.warning) throw new Error(String(analysis.warning).slice(0, 500));
    return analysis;
  }
  return { extractTextFromDocument };
}

module.exports = { createIncomingDocumentsOcrService };
