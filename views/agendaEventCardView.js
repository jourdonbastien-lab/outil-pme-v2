'use strict';

function renderAgendaEventCard(event, { escHtml, formatAgendaTime }) {
  const start = formatAgendaTime(event.start_date);
  const end = formatAgendaTime(event.end_date);
  return `
      <button
        type="button"
        class="planning-event ${escHtml(event.type || 'rdv')}"
        data-event-id="${event.id}"
        data-event-title="${escHtml(event.title || '')}"
        data-event-type="${escHtml(event.type || 'rdv')}"
        data-event-start="${escHtml(event.start_date || '')}"
        data-event-end="${escHtml(event.end_date || '')}"
      >
        <span class="planning-event-title">${escHtml(event.title || 'Événement')}</span>
        <span class="planning-event-time">${escHtml(start)}${end ? ' - ' + escHtml(end) : ''}</span>
      </button>
    `;
}

function renderMonthAgendaEventCard(event, dayStart, {
  escHtml,
  localDateTime,
  eventEndDate,
  isAllDayAgendaEvent,
}) {
  const startDate = localDateTime(event.start_date);
  const endDate = eventEndDate(event);
  const isMultiDay = startDate && endDate && startDate.toDateString() !== endDate.toDateString();
  const showTime = startDate && startDate.toDateString() === dayStart.toDateString();
  const start = showTime && !isAllDayAgendaEvent(event)
    ? startDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : '';
  return `
      <button
        type="button"
        class="planning-event planning-month-event ${escHtml(event.type || 'rdv')}"
        data-event-id="${event.id}"
        data-event-title="${escHtml(event.title || '')}"
        data-event-type="${escHtml(event.type || 'rdv')}"
        data-event-start="${escHtml(event.start_date || '')}"
        data-event-end="${escHtml(event.end_date || '')}"
      >
        ${start ? `<span class="planning-event-time">${escHtml(start)}</span>` : ''}
        <span class="planning-event-title">${isMultiDay ? '↔ ' : ''}${escHtml(event.title || 'Événement')}</span>
      </button>
    `;
}

module.exports = { renderAgendaEventCard, renderMonthAgendaEventCard };
