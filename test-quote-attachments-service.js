'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createQuoteAttachmentsService } = require('./services/quoteAttachmentsService');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'quote-attachments-'));
const quoteDir = path.join(root, '7');
fs.mkdirSync(quoteDir);
const filePath = path.join(quoteDir, 'photo été.jpg');
fs.writeFileSync(filePath, 'photo');
const removed = [];
const safeResolveInside = (base, ...parts) => {
  const target = path.resolve(base, ...parts);
  if (target !== path.resolve(base) && !target.startsWith(path.resolve(base) + path.sep)) throw new Error('Chemin invalide');
  return target;
};
const service = createQuoteAttachmentsService({
  photosRoot: root,
  safeResolveInside,
  basename: path.basename,
  fileExists: fs.existsSync,
  deleteFile: fs.unlinkSync,
  removeStoragePath(target) { removed.push(target); }
});
assert.strictEqual(service.uploadedPhotoPath(7, { path: filePath }), filePath);
assert.strictEqual(service.uploadedPhotoPath(7, { filename: 'photo été.jpg' }), filePath);
assert.strictEqual(service.getQuotePhoto(7, 'photo été.jpg'), filePath);
assert.strictEqual(service.getQuotePhoto(7, '../absent.jpg'), null);
assert.strictEqual(service.getQuotePhoto(7, '/etc/passwd'), null);
service.deleteQuotePhoto(7, 'absent.jpg');
assert(fs.existsSync(filePath));
service.deleteQuotePhoto(7, 'photo été.jpg');
assert(!fs.existsSync(filePath));
service.deleteAllQuotePhotos(7);
assert.deepStrictEqual(removed, [quoteDir]);
fs.rmSync(root, { recursive: true, force: true });
console.log('OK - service pièces jointes devis');
