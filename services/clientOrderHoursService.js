'use strict';

function createClientOrderHoursService({ db, now = () => new Date().toISOString() }) {
  if (!db || typeof db.prepare !== 'function') throw new TypeError('Base de données manquante.');

  const getOrderById = (id) => db.prepare('SELECT * FROM client_orders WHERE id = ?').get(id);
  function resolveOrderId(value) {
    const id = Number(value || 0);
    return Number.isFinite(id) && id > 0 && getOrderById(id) ? id : null;
  }
  function listHoursForOrder({ orderId, client, order, ascending = false }) {
    const direction = ascending ? 'ASC' : 'DESC';
    return orderId
      ? db.prepare(`SELECT * FROM chantier_hours
          WHERE client_order_id = ? OR (client_order_id IS NULL AND client = ? AND order_name = ?)
          ORDER BY work_date ${direction}, id ${direction}`).all(orderId, client, order)
      : db.prepare(`SELECT * FROM chantier_hours WHERE client = ? AND order_name = ?
          ORDER BY work_date ${direction}, id ${direction}`).all(client, order);
  }
  function sumHoursSince({ orderId, client, order, since }) {
    const row = orderId
      ? db.prepare(`SELECT COALESCE(SUM(minutes_total),0) AS m FROM chantier_hours
          WHERE (client_order_id = ? OR (client_order_id IS NULL AND client = ? AND order_name = ?))
          AND work_date >= ?`).get(orderId, client, order, since)
      : db.prepare(`SELECT COALESCE(SUM(minutes_total),0) AS m FROM chantier_hours
          WHERE client = ? AND order_name = ? AND work_date >= ?`).get(client, order, since);
    return Number(row.m || 0);
  }
  const createHourEntry = (entry) => db.prepare(`
    INSERT INTO chantier_hours
      (client, order_name, client_order_id, work_date, start_time, end_time, break_minutes, minutes_total, note, category, created_at)
    VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?)
  `).run(entry.client, entry.order, entry.orderId, entry.workDate, entry.minutesTotal, entry.note || null, entry.category, now());
  const deleteHourEntry = (id) => db.prepare('DELETE FROM chantier_hours WHERE id = ?').run(id);
  function updatePlannedHours({ orderId, client, order, plannedHours }) {
    return orderId
      ? db.prepare('UPDATE client_orders SET planned_hours = ? WHERE id = ?').run(plannedHours, orderId)
      : db.prepare('UPDATE client_orders SET planned_hours = ? WHERE name = ? AND description = ?')
        .run(plannedHours, client, order);
  }
  return {
    getOrderById, resolveOrderId, listHoursForOrder, sumHoursSince,
    createHourEntry, deleteHourEntry, updatePlannedHours
  };
}

module.exports = { createClientOrderHoursService };
