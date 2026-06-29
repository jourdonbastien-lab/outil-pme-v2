"use strict";

/**
 * Generic PDF engine for the measurements module.
 *
 * This file provides a small, well-documented API built on `pdfkit` so the
 * various measurement types (stairs, gates, guardrails...) can generate
 * consistent professional PDFs. It intentionally contains no business logic
 * and no domain-specific code.
 */

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

/**
 * Create a new PDFDocument instance. The returned document is not yet piped
 * to a file or buffer — call `savePdf(doc, outputPath)` to write it.
 *
 * @param {object} [options] - PDFKit create options (size, margin, info, ...)
 * @returns {PDFDocument} pdfkit document
 */
function createDocument(options = {}) {
  const doc = new PDFDocument(Object.assign({ size: 'A4', margin: 40 }, options));
  return doc;
}

/**
 * Add a simple header with optional logo and title.
 * @param {PDFDocument} doc
 * @param {string} title
 * @param {object} [opts] - { logoPath, date }
 */
function addHeader(doc, title, opts = {}) {
  if (!doc || typeof doc.text !== 'function') return;
  const { logoPath, date } = opts;
  const startY = doc.y;
  if (logoPath && fs.existsSync(logoPath)) {
    try { doc.image(logoPath, doc.x, doc.y, { width: 80 }); } catch (e) {}
  }
  doc.fontSize(18).text(title || '', logoPath ? doc.x + 90 : doc.x, startY);
  if (date) doc.fontSize(10).text(String(date), { align: 'right' });
  doc.moveDown();
}

/**
 * Add a footer on the current page. If called on multiple pages, it will
 * appear on the current page only. It is up to the caller to call this at
 * the bottom of each page when needed.
 * @param {PDFDocument} doc
 * @param {string} text
 */
function addFooter(doc, text) {
  if (!doc) return;
  const oldY = doc.y;
  doc.fontSize(9);
  const bottom = doc.page.height - doc.page.margins.bottom - 20;
  doc.text(text || '', doc.page.margins.left, bottom, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: 'center' });
  doc.y = oldY;
}

/**
 * Add client information block.
 * @param {PDFDocument} doc
 * @param {object} client - { name, address, phone, email }
 */
function addClientInfo(doc, client = {}) {
  if (!doc) return;
  doc.fontSize(11).text('Client:', { underline: true });
  const lines = [];
  if (client.name) lines.push(client.name);
  if (client.address) lines.push(client.address);
  if (client.phone) lines.push(`T: ${client.phone}`);
  if (client.email) lines.push(`E: ${client.email}`);
  doc.fontSize(10).text(lines.join('\n'));
  doc.moveDown();
}

/**
 * Add project/site information block.
 * @param {PDFDocument} doc
 * @param {object} project - { reference, site, date }
 */
function addProjectInfo(doc, project = {}) {
  if (!doc) return;
  doc.fontSize(11).text('Projet / Chantier:', { underline: true });
  const lines = [];
  if (project.reference) lines.push(`Réf: ${project.reference}`);
  if (project.site) lines.push(String(project.site));
  if (project.date) lines.push(String(project.date));
  doc.fontSize(10).text(lines.join('\n'));
  doc.moveDown();
}

/**
 * Add a simple measurements table. Each measurement must be an object with
 * `label` and `value` properties. The table is rendered as two columns.
 * @param {PDFDocument} doc
 * @param {Array<{label:string,value:string|number}>} measurements
 */
function addMeasurementsTable(doc, measurements = []) {
  if (!doc) return;
  const startX = doc.x;
  const col1Width = 200;
  const rowHeight = 16;
  doc.fontSize(10);
  measurements.forEach((m) => {
    doc.text(String(m.label || ''), startX, doc.y, { continued: true, width: col1Width });
    doc.text(String(m.value ?? ''), startX + col1Width + 10, doc.y);
    doc.moveDown(0.5);
  });
  doc.moveDown();
}

/**
 * Add photos to the document. Accepts an array of paths or buffers. Missing
 * images are skipped silently.
 * @param {PDFDocument} doc
 * @param {Array<string|Buffer>} photos
 * @param {object} [opts] - { maxWidth }
 */
function addPhotos(doc, photos = [], opts = {}) {
  if (!doc || !Array.isArray(photos)) return;
  const maxWidth = opts.maxWidth || 250;
  photos.forEach((p) => {
    try {
      if (Buffer.isBuffer(p)) {
        doc.image(p, { fit: [maxWidth, 200] });
      } else if (typeof p === 'string' && fs.existsSync(p)) {
        doc.image(p, { fit: [maxWidth, 200] });
      }
      doc.moveDown();
    } catch (e) {
      // silently continue on image errors
    }
  });
}

/**
 * Add an SVG drawing. This generic function accepts either:
 * - a raster Buffer/path (PNG/JPEG) -> embedded using PDFKit;
 * - a drawing function `fn(doc, x, y, w, h)` which will be invoked so the
 *   caller can draw with PDFKit primitives; or
 * - an SVG string -> if the runtime cannot render SVG it is inserted as a
 *   labeled block (SVG rendering is not performed automatically).
 *
 * @param {PDFDocument} doc
 * @param {string|Buffer|function} svgOrDrawable
 * @param {object} [opts] - { width, height }
 */
function addSvgDrawing(doc, svgOrDrawable, opts = {}) {
  if (!doc) return;
  const w = opts.width || 300;
  const h = opts.height || 200;
  if (typeof svgOrDrawable === 'function') {
    // delegate drawing to the provided function
    try { svgOrDrawable(doc, doc.x, doc.y, w, h); } catch (e) {}
    doc.moveDown();
    return;
  }
  if (Buffer.isBuffer(svgOrDrawable)) {
    try { doc.image(svgOrDrawable, { fit: [w, h] }); } catch (e) {}
    doc.moveDown();
    return;
  }
  if (typeof svgOrDrawable === 'string') {
    // file path?
    if (fs.existsSync(svgOrDrawable)) {
      try { doc.image(svgOrDrawable, { fit: [w, h] }); } catch (e) {}
      doc.moveDown();
      return;
    }
    // raw SVG string: PDFKit cannot render SVG natively here; include the
    // raw SVG as preformatted text as a fallback so the PDF still contains
    // the vector source for later processing.
    doc.fontSize(8).text('SVG (source):', { underline: true });
    doc.font('Courier').fontSize(7).text(svgOrDrawable.slice(0, 1000));
    doc.font('Helvetica');
    doc.moveDown();
    return;
  }
}

/**
 * Add free-form observations text.
 * @param {PDFDocument} doc
 * @param {string} text
 */
function addObservations(doc, text) {
  if (!doc) return;
  doc.addPage();
  doc.fontSize(11).text('Observations', { underline: true });
  doc.moveDown();
  doc.fontSize(10).text(String(text || ''));
}

/**
 * Add a signature image or draw a signature box. If a buffer/path is
 * provided, the image is embedded. Otherwise a box and signer name are
 * rendered.
 * @param {PDFDocument} doc
 * @param {object} [opts] - { signatureImage, name, date }
 */
function addSignature(doc, opts = {}) {
  if (!doc) return;
  const { signatureImage, name, date } = opts;
  if (signatureImage && (Buffer.isBuffer(signatureImage) || (typeof signatureImage === 'string' && fs.existsSync(signatureImage)))) {
    try { doc.image(signatureImage, { width: 200 }); } catch (e) {}
  } else {
    const boxW = 250;
    const boxH = 80;
    const x = doc.x;
    const y = doc.y;
    doc.rect(x, y, boxW, boxH).stroke();
    doc.moveDown(5);
  }
  if (name) doc.text(String(name));
  if (date) doc.text(String(date));
}

/**
 * Save the PDF document to the given outputPath. Returns a Promise that
 * resolves when writing is complete.
 * @param {PDFDocument} doc
 * @param {string} outputPath
 * @returns {Promise<string>} resolves to outputPath
 */
function savePdf(doc, outputPath) {
  return new Promise((resolve) => {
    if (!doc || !outputPath) { resolve(null); return; }
    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);
    doc.end();
    stream.on('finish', () => resolve(outputPath));
    stream.on('error', () => resolve(null));
  });
}

module.exports = {
  createDocument,
  addHeader,
  addFooter,
  addClientInfo,
  addProjectInfo,
  addMeasurementsTable,
  addPhotos,
  addSvgDrawing,
  addObservations,
  addSignature,
  savePdf,
};

// Self-test: generate a sample PDF to verify the engine works.
async function runSelfTest() {
  const storageRoot = process.env.OUTIL_PME_STORAGE_DIR || path.join(process.cwd(), 'storage');
  const pdfDir = process.env.OUTIL_PME_PDF_DIR || path.join(storageRoot, 'pdf');
  const out = path.join(pdfDir, 'test-output.pdf');
  const doc = createDocument();
  addHeader(doc, 'Fiche de prise de cotes - Exemples', { date: new Date().toLocaleDateString() });
  addClientInfo(doc, { name: 'SARL Exemple', address: '1 Rue Test, 75000 Paris', phone: '01 23 45 67 89' });
  addProjectInfo(doc, { reference: 'PJT-001', site: 'Site Exemple', date: new Date().toLocaleDateString() });
  addMeasurementsTable(doc, [ { label: 'Hauteur totale', value: '1700 mm' }, { label: 'Largeur marche', value: '250 mm' }]);
  // use a simple drawing function to draw a schematic rectangle
  addSvgDrawing(doc, function(drawDoc, x, y, w, h) {
    const px = x || drawDoc.x;
    const py = y || drawDoc.y;
    drawDoc.save();
    drawDoc.rect(px, py, w, h).stroke();
    drawDoc.moveDown();
    drawDoc.restore();
  }, { width: 300, height: 160 });
  addObservations(doc, 'Exemple d\'observations : vérifier cotes sur site.');
  addSignature(doc, { name: 'Technicien', date: new Date().toLocaleDateString() });
  const res = await savePdf(doc, out);
  return res;
}

if (require.main === module) {
  runSelfTest().then((p) => {
    if (p) console.log('pdf.js self-test: written to', p);
    else console.log('pdf.js self-test: failed to write file');
  });
}
