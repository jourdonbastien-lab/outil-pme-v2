'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const MIME_TO_EXTENSIONS = new Map([
  ['image/jpeg', new Set(['.jpg', '.jpeg'])],
  ['image/png', new Set(['.png'])],
  ['image/webp', new Set(['.webp'])],
  ['image/heic', new Set(['.heic'])],
  ['image/heif', new Set(['.heif'])]
]);

function positiveId(value) {
  const id = Number(value || 0);
  if (!Number.isInteger(id) || id <= 0) throw new Error('ID fiche invalide');
  return id;
}

function safeResolveInside(baseDir, ...parts) {
  const base = path.resolve(baseDir);
  const target = path.resolve(base, ...parts);
  if (target !== base && !target.startsWith(base + path.sep)) throw new Error('Chemin photo invalide');
  return target;
}

function validatePhotoFile(file) {
  const mimeType = String(file?.mimetype || '').toLowerCase();
  const originalName = path.basename(String(file?.originalname || ''));
  const extension = path.extname(originalName).toLowerCase();
  const allowedExtensions = MIME_TO_EXTENSIONS.get(mimeType);
  if (!allowedExtensions || !allowedExtensions.has(extension)) {
    throw new Error('Format photo invalide ou extension incoherente');
  }
  const size = Number(file?.size || 0);
  if (size > MAX_FILE_SIZE) throw new Error('Photo trop volumineuse');
  return { mimeType, originalName, extension, size };
}

function measurementPhotoDir(baseDir, measurementId) {
  return safeResolveInside(baseDir, String(positiveId(measurementId)), 'photos');
}

function generatedStoredName(file) {
  const descriptor = validatePhotoFile(file);
  const canonicalExtension = descriptor.mimeType === 'image/jpeg' ? '.jpg' : descriptor.extension;
  return `${crypto.randomUUID()}${canonicalExtension}`;
}

function photoFilePath(baseDir, measurementId, storedName) {
  const raw = String(storedName || '');
  const clean = path.basename(raw);
  if (!clean || raw !== clean) throw new Error('Nom de fichier photo invalide');
  return safeResolveInside(measurementPhotoDir(baseDir, measurementId), clean);
}

function fileSha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function removeOwnedFile(baseDir, measurementId, storedName) {
  const filePath = photoFilePath(baseDir, measurementId, storedName);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  return filePath;
}

module.exports = {
  MAX_FILE_SIZE,
  MIME_TO_EXTENSIONS,
  safeResolveInside,
  validatePhotoFile,
  measurementPhotoDir,
  generatedStoredName,
  photoFilePath,
  fileSha256,
  removeOwnedFile
};
