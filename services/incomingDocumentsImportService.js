'use strict';

function createIncomingDocumentsImportService({ db, fs, path, crypto, incomingDocuments, scannerDirs, maxFileSizeBytes, analyzeFile, intervalMs, logger } = {}) {
  const importer = incomingDocuments.createScannerImporter({ database: db, dirs: scannerDirs, intervalMs, maxFileSizeBytes, analyzeFile, logger });
  async function registerUploadedDocument(file) {
    const ext = path.extname(file.originalname).toLowerCase();
    const incomingName = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}${ext}`;
    const incomingPath = incomingDocuments.safeResolveInside(scannerDirs.incoming, incomingName);
    try {
      fs.writeFileSync(incomingPath, file.buffer, { flag: 'wx' });
      return await incomingDocuments.importDocument({ database: db, dirs: scannerDirs, sourcePath: incomingPath, originalName: file.originalname, source: 'upload', analyzeFile, activeAnalyses: importer.activeAnalyses, maxFileSizeBytes });
    } catch (error) {
      if (fs.existsSync(incomingPath)) fs.unlinkSync(incomingPath);
      throw error;
    }
  }
  const reanalyzeDocument = (row) => incomingDocuments.analyzeDocument(db, row, analyzeFile, importer.activeAnalyses);
  return { registerUploadedDocument, reanalyzeDocument, startAutomaticImport: importer.start, stopAutomaticImport: importer.stop, scanIncomingFolder: importer.scanOnce, activeAnalyses: importer.activeAnalyses };
}

module.exports = { createIncomingDocumentsImportService };
