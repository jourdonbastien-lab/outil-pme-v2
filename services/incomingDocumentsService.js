'use strict';

function createIncomingDocumentsService({ db, fs, path, incomingDocuments, scannerDirs, round2, now = () => new Date().toISOString() } = {}) {
  function getDocumentById(rawId) {
    const id = Number(rawId || 0);
    if (!Number.isInteger(id) || id <= 0) return null;
    return db.prepare('SELECT * FROM incoming_documents WHERE id = ?').get(id) || null;
  }
  function listDocuments(query = {}) {
    const allowedStatuses = new Set(['', ...incomingDocuments.STATUSES]);
    const allowedTypes = new Set(['', ...incomingDocuments.DOCUMENT_TYPES]);
    const status = allowedStatuses.has(String(query.status || '')) ? String(query.status || '') : '';
    const type = allowedTypes.has(String(query.type || '')) ? String(query.type || '') : '';
    const period = ['7', '30', '90'].includes(String(query.period || '')) ? Number(query.period) : null;
    const search = String(query.search || '').trim().slice(0, 120);
    const page = Math.max(1, Number.parseInt(String(query.page || '1'), 10) || 1);
    const pageSize = 20; const where = []; const params = [];
    if (status) { where.push('status = ?'); params.push(status); }
    if (type) { where.push('document_type = ?'); params.push(type); }
    if (period) { where.push("received_at >= datetime('now', ?)"); params.push(`-${period} days`); }
    if (search) { where.push('(original_name LIKE ? OR supplier_name LIKE ? OR document_number LIKE ?)'); const term = `%${search}%`; params.push(term, term, term); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = Number(db.prepare(`SELECT COUNT(*) AS count FROM incoming_documents ${whereSql}`).get(...params)?.count || 0);
    const rows = db.prepare(`SELECT * FROM incoming_documents ${whereSql} ORDER BY received_at DESC, id DESC LIMIT ? OFFSET ?`).all(...params, pageSize, (page - 1) * pageSize);
    const counts = db.prepare(`SELECT SUM(CASE WHEN status = 'nouveau' THEN 1 ELSE 0 END) AS nouveaux,
      SUM(CASE WHEN document_type = 'a_classer' AND status != 'rejete' THEN 1 ELSE 0 END) AS a_classer,
      SUM(CASE WHEN status = 'erreur' THEN 1 ELSE 0 END) AS erreurs FROM incoming_documents`).get();
    return { status, type, period, search, page, pageSize, total, rows, counts, pages: Math.max(1, Math.ceil(total / pageSize)), statuses: incomingDocuments.STATUSES, documentTypes: incomingDocuments.DOCUMENT_TYPES };
  }
  function resolveDocumentFile(row) {
    const storedName = path.basename(String(row?.stored_name || ''));
    if (!storedName) throw new Error('Fichier document invalide');
    const expected = incomingDocuments.safeResolveInside(scannerDirs.documents, storedName);
    if (path.resolve(String(row.stored_path || '')) !== path.resolve(expected)) throw new Error('Chemin document incohérent');
    if (!fs.existsSync(expected) || !fs.statSync(expected).isFile()) throw new Error('Fichier document introuvable');
    return expected;
  }
  function classifyDocument(row, body, userId) {
    const type = String(body.document_type || '');
    if (!incomingDocuments.DOCUMENT_TYPES.includes(type)) return { error: 'Type de document invalide' };
    const clean = (value, max) => String(value || '').trim().slice(0, max) || null;
    const amount = (value) => { if (String(value ?? '').trim() === '') return null; const number = Number(String(value).replace(',', '.')); if (!Number.isFinite(number) || number < 0) throw new Error('Montant invalide'); return round2(number); };
    const date = clean(body.document_date, 10);
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Date invalide' };
    const timestamp = now();
    db.prepare(`UPDATE incoming_documents SET document_type = ?, supplier_name = ?, document_number = ?, document_date = ?, amount_ht = ?, amount_tva = ?, amount_ttc = ?, notes = ?, status = 'classe', classified_at = ?, classified_by = ?, updated_at = ? WHERE id = ?`)
      .run(type, clean(body.supplier_name, 255), clean(body.document_number, 120), date, amount(body.amount_ht), amount(body.amount_tva), amount(body.amount_ttc), clean(body.notes, 4000), timestamp, userId, timestamp, row.id);
    return { success: true };
  }
  function rejectDocument(row, reason) {
    return db.prepare("UPDATE incoming_documents SET status = 'rejete', notes = ?, updated_at = ? WHERE id = ?")
      .run(String(reason || 'Rejet manuel').trim().slice(0, 1000), now(), row.id);
  }
  return { listDocuments, getDocumentById, resolveDocumentFile, classifyDocument, rejectDocument };
}

module.exports = { createIncomingDocumentsService };
