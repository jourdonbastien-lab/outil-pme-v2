'use strict';

function createWorksitesService({ db, normalizeChantierStatus, parsePositiveNumber, now = () => new Date().toISOString() } = {}) {
  function worksiteProgress(doneHours, plannedHours) {
    const planned = Number(plannedHours || 0);
    const done = Number(doneHours || 0);
    if (planned <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((done / planned) * 100)));
  }
  function listWorksites() {
    const clients = db.prepare('SELECT id, name FROM clients ORDER BY name ASC').all();
    const worksites = db.prepare(`
      SELECT chantiers.*, clients.name AS client_name
      FROM chantiers
      LEFT JOIN clients ON clients.id = chantiers.client_id
      ORDER BY
        CASE WHEN chantiers.status IN ('Terminé', 'Facturé') THEN 1 ELSE 0 END,
        chantiers.created_at DESC,
        chantiers.id DESC
    `).all();
    return { clients, worksites: worksites.map((worksite) => enrich(worksite)) };
  }
  function enrich(worksite) {
    const plannedHours = Number(worksite.planned_hours || 0);
    const doneHours = Number(worksite.done_hours || 0);
    return { ...worksite, plannedHours, doneHours, differenceHours: doneHours - plannedHours,
      progress: worksiteProgress(doneHours, plannedHours), normalizedStatus: normalizeChantierStatus(worksite.status) };
  }
  function getWorksiteById(id) {
    const worksite = db.prepare(`
      SELECT chantiers.*, clients.name AS client_name
      FROM chantiers
      LEFT JOIN clients ON clients.id = chantiers.client_id
      WHERE chantiers.id = ?
    `).get(id);
    return worksite ? enrich(worksite) : undefined;
  }
  function worksiteExists(id) { return db.prepare('SELECT id FROM chantiers WHERE id = ?').get(id); }
  function createWorksite(body) {
    let clientId = optionalClientId(body.client_id);
    if (clientId && !db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId)) clientId = null;
    const result = db.prepare(`
      INSERT INTO chantiers (name, client_id, description, status, planned_hours, done_hours, start_date, end_date, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
    `).run(String(body.name || '').trim(), clientId, nullable(body.description), normalizeChantierStatus(body.status),
      parsePositiveNumber(body.planned_hours), nullable(body.start_date), nullable(body.end_date), now());
    return result;
  }
  function updateWorksite(id, body) {
    return db.prepare(`
      UPDATE chantiers
      SET status = ?, planned_hours = ?, done_hours = ?, description = ?, start_date = ?, end_date = ?
      WHERE id = ?
    `).run(normalizeChantierStatus(body.status), parsePositiveNumber(body.planned_hours), parsePositiveNumber(body.done_hours),
      nullable(body.description), nullable(body.start_date), nullable(body.end_date), id);
  }
  function optionalClientId(value) {
    const id = Number(value || 0);
    return Number.isInteger(id) && id > 0 ? id : null;
  }
  function nullable(value) { return String(value || '').trim() || null; }
  return { listWorksites, getWorksiteById, worksiteExists, createWorksite, updateWorksite, worksiteProgress };
}

module.exports = { createWorksitesService };
