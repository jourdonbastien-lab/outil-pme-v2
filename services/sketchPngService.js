'use strict';

function createSketchPngService({ fs, sketchesDir, safeResolveInside, ensureDir }) {
  function getPath(scope, id) {
    return safeResolveInside(sketchesDir, scope, `${id}.png`);
  }

  function save(scope, id, dataUrl) {
    const cleanId = Number(id);
    if (!Number.isFinite(cleanId) || cleanId <= 0) {
      const error = new Error('ID invalide');
      error.statusCode = 400;
      throw error;
    }

    const match = String(dataUrl || '').match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
    if (!match) {
      const error = new Error('Image PNG invalide');
      error.statusCode = 400;
      throw error;
    }

    const buffer = Buffer.from(match[1], 'base64');
    if (!buffer.length || buffer.length > 10 * 1024 * 1024) {
      const error = new Error('Croquis trop volumineux');
      error.statusCode = 400;
      throw error;
    }

    const dir = safeResolveInside(sketchesDir, scope);
    ensureDir(dir);
    const filePath = getPath(scope, cleanId);
    fs.writeFileSync(filePath, buffer);
    return filePath;
  }

  function find(scope, id) {
    const filePath = getPath(scope, id);
    return fs.existsSync(filePath) ? filePath : null;
  }

  return { getPath, save, find };
}

module.exports = { createSketchPngService };
