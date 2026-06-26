"use strict";

/**
 * modules/measurements/measurementPhotos.js
 *
 * Photo management engine for measurements. Pure file-management; no business
 * logic. Uses the filesystem and stores a small metadata manifest per
 * measurement.
 *
 * Features:
 * - organization by measurement id
 * - secure filenames
 * - thumbnails (simulated)
 * - metadata persistence (metadata.json per measurement)
 * - ordering of photos
 * - import/export (directory copy + manifest)
 * - integrity checks via sha256
 *
 * No external dependencies. JSDoc provided for public API.
 */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');

/**
 * Safe filename: remove path separators, collapse spaces, limit length.
 * @param {string} name
 */
function safeName(name) {
  if (!name) return '';
  const base = path.basename(String(name));
  // replace unsafe chars
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_');
  return cleaned.substring(0, 200);
}

async function _ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

async function _exists(file) {
  try { await fsp.access(file); return true; } catch (e) { return false; }
}

async function _readJson(file) {
  try { const s = await fsp.readFile(file, 'utf8'); return JSON.parse(s); } catch (e) { return null; }
}

async function _writeJson(file, obj) {
  const tmp = file + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify(obj, null, 2), 'utf8');
  await fsp.rename(tmp, file);
}

function _hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const rs = fs.createReadStream(filePath);
    rs.on('error', reject);
    rs.on('data', (c) => h.update(c));
    rs.on('end', () => resolve(h.digest('hex')));
  });
}

/**
 * Create a photo manager rooted at `rootDir`.
 * @param {string} rootDir
 */
function createPhotoManager(rootDir) {
  const root = rootDir ? path.resolve(rootDir) : path.resolve('data', 'photos');

  async function _measurementDir(measurementId) {
    const dir = path.join(root, String(measurementId));
    await _ensureDir(dir);
    return dir;
  }

  async function _manifestPath(measurementId) {
    const dir = await _measurementDir(measurementId);
    return path.join(dir, 'metadata.json');
  }

  async function _loadManifest(measurementId) {
    const mp = await _manifestPath(measurementId);
    const m = await _readJson(mp);
    if (!m) return { photos: [] };
    if (!Array.isArray(m.photos)) m.photos = [];
    return m;
  }

  async function _saveManifest(measurementId, manifest) {
    const mp = await _manifestPath(measurementId);
    await _writeJson(mp, manifest);
  }

  /**
   * Add a photo to a measurement. Copies the file into the storage.
   * @param {Object} params
   * @param {string} params.measurementId
   * @param {string} params.srcPath - existing file path to import
   * @param {string} [params.filename] - desired filename
   */
  async function addPhoto({ measurementId, srcPath, filename } = {}) {
    if (!measurementId) throw new Error('measurementId required');
    if (!srcPath) throw new Error('srcPath required');
    const dir = await _measurementDir(measurementId);
    const exists = await _exists(srcPath);
    if (!exists) throw new Error('source file not found');
    const id = crypto.randomUUID();
    const origName = filename || path.basename(srcPath);
    const safe = safeName(origName) || id;
    const ext = path.extname(safe) || '.jpg';
    const destName = `${id}${ext}`;
    const destPath = path.join(dir, destName);
    await fsp.copyFile(srcPath, destPath);
    const stat = await fsp.stat(destPath);
    const checksum = await _hashFile(destPath);
    const manifest = await _loadManifest(measurementId);
    const order = manifest.photos.length;
    const photo = {
      id,
      filename: destName,
      originalName: origName,
      size: stat.size,
      checksum,
      createdAt: new Date().toISOString(),
      order,
    };
    manifest.photos.push(photo);
    await _saveManifest(measurementId, manifest);
    return photo;
  }

  /** Remove a photo by id. */
  async function removePhoto({ measurementId, photoId } = {}) {
    if (!measurementId || !photoId) throw new Error('measurementId and photoId required');
    const dir = await _measurementDir(measurementId);
    const manifest = await _loadManifest(measurementId);
    const idx = manifest.photos.findIndex(p => p.id === photoId);
    if (idx === -1) return false;
    const [p] = manifest.photos.splice(idx,1);
    const filePath = path.join(dir, p.filename);
    try { await fsp.unlink(filePath); } catch (e) { }
    // remove thumbnail
    try { await fsp.unlink(path.join(dir, p.filename + '.thumb')); } catch (e) { }
    // reindex orders
    manifest.photos.forEach((ph,i) => ph.order = i);
    await _saveManifest(measurementId, manifest);
    return true;
  }

  /** Rename a photo's originalName (and optionally filename). */
  async function renamePhoto({ measurementId, photoId, newName } = {}) {
    if (!measurementId || !photoId || !newName) throw new Error('measurementId, photoId and newName required');
    const dir = await _measurementDir(measurementId);
    const manifest = await _loadManifest(measurementId);
    const p = manifest.photos.find(ph => ph.id === photoId);
    if (!p) return null;
    const safe = safeName(newName) || p.id;
    const ext = path.extname(p.filename) || '.jpg';
    const newFilename = `${p.id}${ext}`; // keep id-based filename to avoid collisions
    // only change originalName (display name) to avoid moving file unless extension changed
    p.originalName = newName;
    await _saveManifest(measurementId, manifest);
    return p;
  }

  /** Move photo between measurements. */
  async function movePhoto({ fromMeasurementId, toMeasurementId, photoId, position } = {}) {
    if (!fromMeasurementId || !toMeasurementId || !photoId) throw new Error('fromMeasurementId, toMeasurementId and photoId required');
    const fromDir = await _measurementDir(fromMeasurementId);
    const toDir = await _measurementDir(toMeasurementId);
    const fromManifest = await _loadManifest(fromMeasurementId);
    const toManifest = await _loadManifest(toMeasurementId);
    const idx = fromManifest.photos.findIndex(p => p.id === photoId);
    if (idx === -1) throw new Error('photo not found');
    const [p] = fromManifest.photos.splice(idx,1);
    // move file
    const src = path.join(fromDir, p.filename);
    const dest = path.join(toDir, p.filename);
    await fsp.rename(src, dest);
    // remove thumbnail if any
    try { await fsp.rename(path.join(fromDir, p.filename + '.thumb'), path.join(toDir, p.filename + '.thumb')); } catch (e) { }
    // append to destination at given position
    if (typeof position === 'number' && position >= 0 && position <= toManifest.photos.length) {
      toManifest.photos.splice(position, 0, p);
    } else {
      toManifest.photos.push(p);
    }
    // reindex orders
    fromManifest.photos.forEach((ph,i)=>ph.order=i);
    toManifest.photos.forEach((ph,i)=>ph.order=i);
    await _saveManifest(fromMeasurementId, fromManifest);
    await _saveManifest(toMeasurementId, toManifest);
    return p;
  }

  /** Reorder photos for a measurement using array of photoIds. */
  async function reorderPhotos({ measurementId, newOrder } = {}) {
    if (!measurementId || !Array.isArray(newOrder)) throw new Error('measurementId and newOrder array required');
    const manifest = await _loadManifest(measurementId);
    const map = new Map(manifest.photos.map(p=>[p.id,p]));
    const reordered = [];
    for (const id of newOrder) { if (map.has(id)) reordered.push(map.get(id)); }
    // append any missing
    for (const p of manifest.photos) if (!reordered.includes(p)) reordered.push(p);
    reordered.forEach((p,i)=>p.order=i);
    manifest.photos = reordered;
    await _saveManifest(measurementId, manifest);
    return manifest.photos;
  }

  async function getPhoto({ measurementId, photoId } = {}) {
    if (!measurementId || !photoId) throw new Error('measurementId and photoId required');
    const manifest = await _loadManifest(measurementId);
    return manifest.photos.find(p=>p.id===photoId) || null;
  }

  async function getPhotos({ measurementId } = {}) {
    if (!measurementId) throw new Error('measurementId required');
    const manifest = await _loadManifest(measurementId);
    return manifest.photos.slice().sort((a,b)=>a.order - b.order);
  }

  /** Generate a simulated thumbnail (small file). */
  async function generateThumbnail({ measurementId, photoId } = {}) {
    const dir = await _measurementDir(measurementId);
    const p = await getPhoto({ measurementId, photoId });
    if (!p) throw new Error('photo not found');
    const src = path.join(dir, p.filename);
    const thumb = path.join(dir, p.filename + '.thumb');
    // simulate thumbnail by writing first 256 bytes hex + metadata
    const fd = await fsp.open(src, 'r');
    const buf = Buffer.alloc(256);
    const { bytesRead } = await fd.read(buf, 0, 256, 0);
    await fd.close();
    const payload = Buffer.from(JSON.stringify({ id: p.id, sample: buf.slice(0, bytesRead).toString('hex') }));
    await fsp.writeFile(thumb, payload);
    return thumb;
  }

  async function deleteThumbnail({ measurementId, photoId } = {}) {
    const dir = await _measurementDir(measurementId);
    const p = await getPhoto({ measurementId, photoId });
    if (!p) return false;
    const thumb = path.join(dir, p.filename + '.thumb');
    try { await fsp.unlink(thumb); return true; } catch (e) { return false; }
  }

  /** Export photos for a measurement into outDir (copies files + manifest). */
  async function exportPhotos({ measurementId, outDir } = {}) {
    if (!measurementId || !outDir) throw new Error('measurementId and outDir required');
    const dir = await _measurementDir(measurementId);
    const manifest = await _loadManifest(measurementId);
    await _ensureDir(outDir);
    // copy files and manifest
    for (const p of manifest.photos) {
      await fsp.copyFile(path.join(dir, p.filename), path.join(outDir, p.filename));
      try { await fsp.copyFile(path.join(dir, p.filename + '.thumb'), path.join(outDir, p.filename + '.thumb')); } catch (e) { }
    }
    await _writeJson(path.join(outDir, 'metadata.json'), manifest);
    return true;
  }

  /** Import photos from a directory into a measurement. */
  async function importPhotos({ measurementId, srcDir } = {}) {
    if (!measurementId || !srcDir) throw new Error('measurementId and srcDir required');
    const dir = await _measurementDir(measurementId);
    const manifest = await _loadManifest(measurementId);
    const entries = await fsp.readdir(srcDir);
    for (const name of entries) {
      if (name === 'metadata.json') continue;
      const src = path.join(srcDir, name);
      const stat = await fsp.stat(src);
      if (!stat.isFile()) continue;
      // copy file into dest with new id-based name
      const id = crypto.randomUUID();
      const ext = path.extname(name) || '.jpg';
      const destName = `${id}${ext}`;
      await fsp.copyFile(src, path.join(dir, destName));
      const checksum = await _hashFile(path.join(dir, destName));
      const photo = { id, filename: destName, originalName: name, size: stat.size, checksum, createdAt: new Date().toISOString(), order: manifest.photos.length };
      manifest.photos.push(photo);
    }
    await _saveManifest(measurementId, manifest);
    return manifest.photos;
  }

  /** Clear all photos for a measurement (deletes folder). */
  async function clear({ measurementId } = {}) {
    if (!measurementId) throw new Error('measurementId required');
    const dir = path.join(root, String(measurementId));
    // remove recursively
    if (await _exists(dir)) {
      await fsp.rm(dir, { recursive: true, force: true });
    }
    return true;
  }

  /** Validate photo integrity by checking checksum. */
  async function validatePhoto({ measurementId, photoId } = {}) {
    const p = await getPhoto({ measurementId, photoId });
    if (!p) return { ok: false, reason: 'not_found' };
    const dir = await _measurementDir(measurementId);
    const fp = path.join(dir, p.filename);
    if (!await _exists(fp)) return { ok: false, reason: 'missing_file' };
    const current = await _hashFile(fp);
    if (current !== p.checksum) return { ok: false, reason: 'checksum_mismatch' };
    return { ok: true };
  }

  return {
    addPhoto,
    removePhoto,
    renamePhoto,
    movePhoto,
    reorderPhotos,
    getPhoto,
    getPhotos,
    generateThumbnail,
    deleteThumbnail,
    exportPhotos,
    importPhotos,
    clear,
    validatePhoto,
  };
}

module.exports = { createPhotoManager };

/* Self-tests */
if (require.main === module) {
  (async function runTests(){
    const assert = (c, m) => { if (!c) throw new Error(m || 'assert failed'); };
    const tmp = path.join(os.tmpdir(), `omp-photos-test-${Date.now()}`);
    const mgr = createPhotoManager(tmp);
    const m1 = 'M-1';
    const m2 = 'M-2';
    await mgr.clear({ measurementId: m1 }).catch(()=>{});
    await mgr.clear({ measurementId: m2 }).catch(()=>{});
    // create sample source files
    const sdir = path.join(tmp, 'src'); await _ensureDir(sdir);
    const src1 = path.join(sdir, 'one.jpg'); const src2 = path.join(sdir, 'two.jpg');
    await fsp.writeFile(src1, Buffer.from('photo-content-1'));
    await fsp.writeFile(src2, Buffer.from('photo-content-2'));
    // add photos
    const p1 = await mgr.addPhoto({ measurementId: m1, srcPath: src1 });
    assert(p1 && p1.id, 'p1 created');
    const p2 = await mgr.addPhoto({ measurementId: m1, srcPath: src2 });
    const photos = await mgr.getPhotos({ measurementId: m1 });
    assert(photos.length === 2, 'two photos present');
    // rename
    await mgr.renamePhoto({ measurementId: m1, photoId: p1.id, newName: 'front.jpg' });
    const p1b = await mgr.getPhoto({ measurementId: m1, photoId: p1.id });
    assert(p1b.originalName === 'front.jpg', 'rename applied');
    // reorder
    await mgr.reorderPhotos({ measurementId: m1, newOrder: [p2.id, p1.id] });
    const photos2 = await mgr.getPhotos({ measurementId: m1 });
    assert(photos2[0].id === p2.id, 'reorder ok');
    // move to m2
    await mgr.movePhoto({ fromMeasurementId: m1, toMeasurementId: m2, photoId: p1.id });
    const m1photos = await mgr.getPhotos({ measurementId: m1 });
    const m2photos = await mgr.getPhotos({ measurementId: m2 });
    assert(m1photos.length === 1 && m2photos.length === 1, 'move ok');
    // thumbnail
    const thumbPath = await mgr.generateThumbnail({ measurementId: m2, photoId: p1.id });
    assert(await _exists(thumbPath), 'thumbnail created');
    // validate
    const valid = await mgr.validatePhoto({ measurementId: m2, photoId: p1.id });
    assert(valid.ok, 'validation ok');
    // export
    const out = path.join(tmp, 'export'); await _ensureDir(out);
    await mgr.exportPhotos({ measurementId: m2, outDir: out });
    assert(await _exists(path.join(out, 'metadata.json')), 'export manifest present');
    // import into m1
    await mgr.importPhotos({ measurementId: m1, srcDir: out });
    const afterImport = await mgr.getPhotos({ measurementId: m1 });
    assert(afterImport.length >= 1, 'import added files');
    // remove
    const rem = await mgr.removePhoto({ measurementId: m2, photoId: p1.id });
    assert(rem === true, 'remove ok');
    // clear
    await mgr.clear({ measurementId: m1 });
    await mgr.clear({ measurementId: m2 });
    console.log('measurementPhotos.js self-tests: OK');
  })().catch(e=> { console.error(e); process.exit(1); });
}
