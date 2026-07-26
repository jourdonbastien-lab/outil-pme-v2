'use strict';

function createClientOrderService({ db, now = () => new Date().toISOString() }) {
  if (!db || typeof db.prepare !== 'function') throw new TypeError('Base de données manquante.');
  const getOrderById = (id) => db.prepare('SELECT * FROM client_orders WHERE id = ?').get(id);
  const quoteExists = (id) => Boolean(db.prepare('SELECT id FROM quotes WHERE id = ?').get(id));
  const listActiveOrders = () => db.prepare(
    "SELECT * FROM client_orders WHERE status != 'Terminée' ORDER BY date DESC, id DESC"
  ).all();
  const listAvailableQuotes = () => db.prepare(
    "SELECT id, title, client_name, status FROM quotes WHERE status != 'Supprimé' ORDER BY id DESC"
  ).all();
  const listHoursTotals = () => db.prepare(`
    SELECT client_order_id, client, order_name, COALESCE(SUM(minutes_total), 0) AS total_minutes
    FROM chantier_hours GROUP BY client_order_id, client, order_name
  `).all();
  const listPoseEvents = () => db.prepare(`
    SELECT id, title, start_date, end_date FROM events
    WHERE type = 'pose' ORDER BY datetime(start_date) DESC, id DESC
  `).all();
  function createOrder(order) {
    return db.prepare(`
      INSERT INTO client_orders
        (name, description, date, price, vat_rate, planned_hours, chantier_status,
         chantier_start_date, chantier_end_date, quote_id, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'En cours', ?)
    `).run(order.name, order.description || null, order.date, order.price, order.vatRate,
      order.plannedHours, order.chantierStatus, order.startDate, order.endDate, order.quoteId, now());
  }
  function updateOrderForAtelier(id, order) {
    return db.prepare(`UPDATE client_orders SET date = ?, planned_hours = ?, chantier_end_date = ?,
      chantier_status = ?, chantier_progress = ? WHERE id = ?`)
      .run(order.date, order.plannedHours, order.endDate, order.chantierStatus, order.progress, id);
  }
  function updateOrderForAdmin(id, order, afterUpdate) {
    return db.transaction(() => {
      db.prepare(`UPDATE client_orders SET date = ?, price = ?, vat_rate = ?, planned_hours = ?,
        chantier_end_date = ?, chantier_status = ?, chantier_progress = ?, quote_id = ? WHERE id = ?`)
        .run(order.date, order.price, order.vatRate, order.plannedHours, order.endDate,
          order.chantierStatus, order.progress, order.quoteId, id);
      if (afterUpdate) afterUpdate();
    })();
  }
  const completeOrder = (id) => db.prepare("UPDATE client_orders SET status = 'Terminée' WHERE id = ?").run(id);
  function updateChantier(id, values) {
    return db.prepare(`UPDATE client_orders SET chantier_status = ?, planned_hours = ?, done_hours = ?,
      chantier_progress = ?, chantier_start_date = ?, chantier_end_date = ?, chantier_notes = ? WHERE id = ?`)
      .run(values.status, values.plannedHours, values.doneHours, values.progress,
        values.startDate, values.endDate, values.notes, id);
  }
  return {
    getOrderById, quoteExists, listActiveOrders, listAvailableQuotes, listHoursTotals,
    listPoseEvents, createOrder, updateOrderForAtelier, updateOrderForAdmin,
    completeOrder, updateChantier
  };
}

module.exports = { createClientOrderService };
