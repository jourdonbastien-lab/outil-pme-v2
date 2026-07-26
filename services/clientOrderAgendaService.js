'use strict';

function createClientOrderAgendaService({ db, normalizeChantierStatus, now = () => new Date().toISOString() }) {
  if (!db || typeof db.prepare !== 'function') throw new TypeError('Base de données manquante.');
  if (typeof normalizeChantierStatus !== 'function') throw new TypeError('Normaliseur de statut manquant.');

  const getOrder = (id) => db.prepare(
    'SELECT id, name, description, chantier_status FROM client_orders WHERE id = ? LIMIT 1'
  ).get(id);

  function preparePoseEvent(order, body) {
    if (normalizeChantierStatus(order.chantier_status) !== 'En pose') return { error: 'status' };
    const poseDate = String(body.pose_date || '').trim();
    const startTime = String(body.start_time || '').trim();
    const endTime = String(body.end_time || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(poseDate)
      || !/^\d{2}:\d{2}$/.test(startTime)
      || !/^\d{2}:\d{2}$/.test(endTime)
      || startTime >= endTime) return { error: 'input' };

    const orderName = String(order.description || '').trim() || `Commande #${order.id}`;
    const baseTitle = `Pose - ${String(order.name || '').trim()} - ${orderName}`;
    const details = [];
    const place = String(body.place || '').trim();
    const note = String(body.note || '').trim();
    if (place) details.push(`Lieu: ${place}`);
    if (note) details.push(`Note: ${note}`);
    return {
      baseTitle,
      title: details.length ? `${baseTitle} · ${details.join(' · ')}` : baseTitle,
      startIso: `${poseDate}T${startTime}`,
      endIso: `${poseDate}T${endTime}`
    };
  }

  const findDuplicate = (event) => db.prepare(`
    SELECT id FROM events
    WHERE type = 'pose' AND start_date = ? AND (title = ? OR title LIKE ?)
    LIMIT 1
  `).get(event.startIso, event.baseTitle, `${event.baseTitle} · %`);

  const createPoseEvent = (event) => db.prepare(`
    INSERT INTO events (title, type, start_date, end_date, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(event.title, 'pose', event.startIso, event.endIso, now());

  return { getOrder, preparePoseEvent, findDuplicate, createPoseEvent };
}

module.exports = { createClientOrderAgendaService };
