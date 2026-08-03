'use strict';

function createEbpIncomingService({ fs, path, incomingDir, scanDir, safeResolveInside, uniqueFilePath, ensureDir } = {}) {
  function safeIncomingPdfName(rawName) {
    const name = path.basename(String(rawName || '').trim());
    if (!name || path.extname(name).toLowerCase() !== '.pdf') return '';
    return name;
  }
  function listIncomingFiles() {
    ensureDir(incomingDir);
    return fs.readdirSync(incomingDir, { withFileTypes: true }).filter((entry) => entry.isFile() && safeIncomingPdfName(entry.name)).map((entry) => {
      const filePath = safeResolveInside(incomingDir, entry.name); const stat = fs.statSync(filePath);
      return { name: entry.name, size: stat.size, addedAt: stat.birthtime || stat.mtime };
    }).sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
  }
  function resolveIncomingFile(rawName) {
    const name = safeIncomingPdfName(rawName); if (!name) return { error: 'invalid' };
    const filePath = safeResolveInside(incomingDir, name); if (!fs.existsSync(filePath)) return { error: 'missing' };
    return { name, filePath };
  }
  function copyIncomingForAnalysis(rawName) {
    const resolved = resolveIncomingFile(rawName); if (resolved.error) return resolved;
    const scanPath = uniqueFilePath(scanDir, resolved.name); fs.copyFileSync(resolved.filePath, scanPath);
    return { ...resolved, scanPath, scanFileName: path.basename(scanPath) };
  }
  return { safeIncomingPdfName, listIncomingFiles, resolveIncomingFile, copyIncomingForAnalysis };
}
module.exports = { createEbpIncomingService };
