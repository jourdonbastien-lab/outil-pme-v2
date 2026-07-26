'use strict';

function createClientOrderHoursController(deps) {
  const {
    hoursService, findOrderByFolder, safeName, safeSegment, parseDuration,
    allowedCategories, formatMinutes, formatDurationLabel, pageTemplate, renderHoursView,
    escapeHtml, clientPageIcon, pcFolderIcon, isoDate
  } = deps;
  if (!hoursService) throw new TypeError('Service heures commande manquant.');
  if (typeof renderHoursView !== 'function') throw new TypeError('Vue heures commande manquante.');
  const folderRedirect = (client, order) =>
    `/pc-folders/${encodeURIComponent(safeName(client))}/${encodeURIComponent(safeName(order))}/Heure%20chantier`;

  function showOrderHoursFolder(req, res) {
    const client = safeName(req.params.client);
    const order = safeName(req.params.order);
    const orderDb = findOrderByFolder(client, order);
    const orderId = Number(orderDb?.id || 0);
    const resolvedOrderId = Number.isFinite(orderId) && orderId > 0 ? orderId : null;
    const rows = hoursService.listHoursForOrder({ orderId: resolvedOrderId, client, order });
    const totalMinutes = rows.reduce((sum, row) => sum + (row.minutes_total || 0), 0);
    const plannedHours = Number(orderDb?.planned_hours || 0);
    const actualHours = totalMinutes / 60;
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const html = renderHoursView({
      client, order, orderId: resolvedOrderId, rows, totalMinutes,
      last7Minutes: hoursService.sumHoursSince({ orderId: resolvedOrderId, client, order, since: since.toISOString().slice(0, 10) }),
      plannedHours, diffHours: actualHours - plannedHours, isOver: actualHours > plannedHours,
      isAtelier: req.session?.user?.role === 'atelier', today: isoDate(),
      escapeHtml, formatMinutes, formatDurationLabel, clientPageIcon, pcFolderIcon
    });
    return res.send(pageTemplate(req, `Heures chantier - ${order}`, html));
  }

  function createOrderHourEntry(req, res) {
    const client = String(req.body.client || '').trim();
    const order = String(req.body.order || '').trim();
    const workDate = String(req.body.work_date || '').trim();
    if (!client || !order || !workDate) return res.status(400).send('Données manquantes');
    const duration = parseDuration(req.body.work_hours, req.body.work_minutes);
    if (duration.error) return res.status(400).send(duration.error);
    const requestedCategory = String(req.body.category || '');
    hoursService.createHourEntry({
      client, order, orderId: hoursService.resolveOrderId(req.body.client_order_id), workDate,
      minutesTotal: duration.minutesTotal, note: String(req.body.note || '').trim(),
      category: allowedCategories.includes(requestedCategory) ? requestedCategory : 'autre'
    });
    return res.redirect(folderRedirect(client, order));
  }
  function deleteOrderHourEntry(req, res) {
    hoursService.deleteHourEntry(req.body.id);
    return res.redirect(folderRedirect(String(req.body.client || '').trim(), String(req.body.order || '').trim()));
  }
  function exportOrderHours(req, res) {
    const client = String(req.query.client || '').trim();
    const order = String(req.query.order || '').trim();
    const rows = hoursService.listHoursForOrder({
      orderId: hoursService.resolveOrderId(req.query.client_order_id), client, order, ascending: true
    });
    const lines = rows.map((row) =>
      `${row.work_date};${row.start_time || ''};${row.end_time || ''};${row.break_minutes || 0};${formatMinutes(row.minutes_total || 0)};${String(row.note || '').replace(/;/g, ',')}`
    ).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="heures_${safeSegment(client)}_${safeSegment(order)}.csv"`);
    return res.send(`date;debut;fin;pause_min;total;note\n${lines}\n`);
  }
  function updatePlannedHours(req, res) {
    hoursService.updatePlannedHours({
      orderId: hoursService.resolveOrderId(req.body.client_order_id),
      client: req.body.client, order: req.body.order, plannedHours: Number(req.body.planned_hours || 0)
    });
    return res.redirect(`/pc-folders/${encodeURIComponent(req.body.client)}/${encodeURIComponent(req.body.order)}/Heure chantier`);
  }
  return { showOrderHoursFolder, createOrderHourEntry, deleteOrderHourEntry, exportOrderHours, updatePlannedHours };
}

module.exports = { createClientOrderHoursController };
