'use strict';

function createDocumentTextExtractionService({ fs, path, pdfParse, tesseractJs, heicConvert, sharp, pdfDebugPath, logger = console } = {}) {
  async function extractTextFromPdf(buffer) {
    if (!pdfParse) return { text: '', wordCount: 0, warning: 'pdf-parse indisponible: extraction PDF désactivée.' };
    try {
      const result = await pdfParse(buffer); const text = String(result?.text || '');
      const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
      return { text, wordCount, pageCount: Number(result?.numpages || 0), warning: '' };
    } catch (error) {
      logger.error('Scan EBP: lecture PDF impossible:', error.message || error);
      return { text: '', wordCount: 0, warning: 'Lecture PDF impossible. Vérifiez le fichier ou complétez manuellement.' };
    }
  }
  async function preprocessImage(buffer, mimeType) {
    let imageBuffer = buffer;
    if ((mimeType || '').includes('heic') || (mimeType || '').includes('heif')) {
      if (!heicConvert) return { buffer: null, warning: 'HEIC détecté mais conversion indisponible. Utilisez JPG/PNG ou installez heic-convert.' };
      try { imageBuffer = await heicConvert({ buffer, format: 'JPEG', quality: 0.92 }); }
      catch { return { buffer: null, warning: 'Conversion HEIC impossible. Utilisez JPG/PNG/PDF ou corrigez manuellement.' }; }
    }
    if (!sharp) return { buffer: imageBuffer, warning: '' };
    try {
      return { buffer: await sharp(imageBuffer).rotate().resize({ width: 2400, withoutEnlargement: true }).grayscale().normalize().sharpen().toBuffer(), warning: '' };
    } catch { return { buffer: imageBuffer, warning: 'Prétraitement image ignoré, OCR lancé sur l’image brute.' }; }
  }
  async function extractTextFromImage(buffer, mimeType) {
    if (!tesseractJs) return { text: '', wordCount: 0, warning: 'tesseract.js indisponible: OCR image désactivé.' };
    const preprocessed = await preprocessImage(buffer, mimeType);
    if (!preprocessed.buffer) return { text: '', wordCount: 0, warning: preprocessed.warning };
    try {
      const worker = await tesseractJs.createWorker('fra+eng'); const result = await worker.recognize(preprocessed.buffer); await worker.terminate();
      const text = String(result?.data?.text || ''); const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
      return { text, wordCount, warning: preprocessed.warning || '' };
    } catch { return { text: '', wordCount: 0, warning: preprocessed.warning || 'OCR image impossible. Complétez manuellement les champs.' }; }
  }
  async function extractTextFromFile(filePath, mimeType) {
    const buffer = fs.readFileSync(filePath); const lowerMime = String(mimeType || '').toLowerCase();
    const isPdf = lowerMime.includes('pdf') || path.extname(String(filePath || '')).toLowerCase() === '.pdf';
    if (isPdf) {
      const pdfResult = await extractTextFromPdf(buffer);
      try { fs.writeFileSync(pdfDebugPath, String(pdfResult.text || ''), 'utf8'); } catch (error) { logger.warn('Impossible d\'écrire le debug PDF EBP:', error.message); }
      const pdfTextLength = String(pdfResult.text || '').trim().replace(/\s+/g, ' ').length;
      if (pdfResult.wordCount >= 15 || pdfTextLength >= 100) return { source: 'pdf', pdfText: pdfResult.text, ocrText: '', text: pdfResult.text, warning: '', ocrWarning: '', pdfWordCount: pdfResult.wordCount, pdfPageCount: pdfResult.pageCount || 0, ocrWordCount: 0 };
      const ocrResult = await extractTextFromImage(buffer, lowerMime);
      return { source: 'ocr', pdfText: pdfResult.text, ocrText: ocrResult.text, text: ocrResult.text || pdfResult.text, warning: pdfResult.warning || ocrResult.warning || 'PDF peu textuel: OCR utilisé en secours.', ocrWarning: ocrResult.warning || '', pdfWordCount: pdfResult.wordCount, pdfPageCount: pdfResult.pageCount || 0, ocrWordCount: ocrResult.wordCount };
    }
    const ocrResult = await extractTextFromImage(buffer, lowerMime);
    return { source: 'ocr', pdfText: '', ocrText: ocrResult.text, text: ocrResult.text, warning: ocrResult.warning || '', ocrWarning: ocrResult.warning || '', pdfWordCount: 0, pdfPageCount: 0, ocrWordCount: ocrResult.wordCount };
  }
  return { extractTextFromFile, extractTextFromPdf, extractTextFromImage };
}

module.exports = { createDocumentTextExtractionService };
