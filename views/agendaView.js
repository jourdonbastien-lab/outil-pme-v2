'use strict';

const { renderAgendaEventCard, renderMonthAgendaEventCard } = require('./agendaEventCardView');

function renderAgendaView(data, dependencies = {}) {
  const { events, requestedView, requestedMonth } = data;
  const { escHtml, clientPageIcon, dateKeyInTimeZone, agendaEventRange, googleSync, timeZone: APP_TIME_ZONE } = dependencies;
  const agendaView = ['day', 'week', 'month'].includes(requestedView) ? requestedView : 'week';

  const now = new Date();
  const todayParts = dateKeyInTimeZone(now, APP_TIME_ZONE).split('-').map(Number);
  const todayStart = new Date(todayParts[0], todayParts[1] - 1, todayParts[2]);

  const tomorrow = new Date(todayStart);
  tomorrow.setDate(todayStart.getDate() + 1);

  const monday = new Date(todayStart);
  monday.setDate(todayStart.getDate() - ((todayStart.getDay() + 6) % 7));

  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);

  const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
  const nextMonth = new Date(todayStart.getFullYear(), todayStart.getMonth() + 1, 1);
  const selectedMonthStart = /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth)
    ? new Date(Number(requestedMonth.slice(0, 4)), Number(requestedMonth.slice(5, 7)) - 1, 1)
    : new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
  if (Number.isNaN(selectedMonthStart.getTime())) {
    selectedMonthStart.setFullYear(todayStart.getFullYear(), todayStart.getMonth(), 1);
  }
  selectedMonthStart.setHours(0, 0, 0, 0);
  const selectedNextMonth = new Date(selectedMonthStart.getFullYear(), selectedMonthStart.getMonth() + 1, 1);
  const selectedMonthKey = `${selectedMonthStart.getFullYear()}-${String(selectedMonthStart.getMonth() + 1).padStart(2, '0')}`;

  function localDateTime(value) {
    return agendaEventRange.agendaDateTime(value, APP_TIME_ZONE);
  }

  function eventEndDate(event) {
    return agendaEventRange.agendaEventEnd(event, APP_TIME_ZONE);
  }

  function isAllDayAgendaEvent(event) {
    const startRaw = String(event?.start_date || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(startRaw)) return true;
    const start = googleSync.normalizeAgendaDateTime(event?.start_date, APP_TIME_ZONE);
    const end = googleSync.normalizeAgendaDateTime(event?.end_date, APP_TIME_ZONE);
    return Boolean(start && end && start.slice(11, 16) === '00:00' && end.slice(11, 16) === '23:59');
  }

  function eventOverlapsDay(event, dayStart, dayEnd) {
    return agendaEventRange.eventOverlapsDay(event, dayStart, dayEnd, APP_TIME_ZONE);
  }

  function monthHref(monthDate) {
    const key = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
    return `/agenda?view=month&month=${key}`;
  }

  function formatAgendaDate(date) {
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long'
    });
  }

  function formatAgendaTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  function renderAgendaEvent(event) {
    return renderAgendaEventCard(event, { escHtml, formatAgendaTime });
  }

  function renderMonthAgendaEvent(event, dayStart) {
    return renderMonthAgendaEventCard(event, dayStart, {
      escHtml,
      localDateTime,
      eventEndDate,
      isAllDayAgendaEvent,
    });
  }

  function renderEventsList(list) {
    const sorted = list.slice().sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
    return sorted.length
      ? sorted.map(renderAgendaEvent).join('')
      : '<div class="planning-empty">Aucun événement</div>';
  }

  const dayLabels = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  const workDayLabels = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];

  function renderDayView() {
    const dayEvents = events.filter((event) => eventOverlapsDay(event, todayStart, tomorrow));
    return `
      <div class="planning-single-day">
        <div class="planning-day">
          <div class="planning-day-header">${escHtml(formatAgendaDate(todayStart))}</div>
          <div class="planning-events">${renderEventsList(dayEvents)}</div>
        </div>
      </div>
    `;
  }

  function renderWeekView() {
    const columns = dayLabels.map((label, index) => {
      const dayStart = new Date(monday);
      dayStart.setDate(monday.getDate() + index);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayStart.getDate() + 1);
      const dayEvents = events.filter((event) => eventOverlapsDay(event, dayStart, dayEnd));

      return `
        <div class="planning-day">
          <div class="planning-day-header">${escHtml(label)} <span>${dayStart.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}</span></div>
          <div class="planning-events">${renderEventsList(dayEvents)}</div>
        </div>
      `;
    }).join('');

    return `<div class="planning-week">${columns}</div>`;
  }

  function renderMonthView() {
    const gridStart = new Date(selectedMonthStart);
    gridStart.setDate(selectedMonthStart.getDate() - ((selectedMonthStart.getDay() + 6) % 7));
    const gridEnd = new Date(selectedNextMonth);
    gridEnd.setDate(selectedNextMonth.getDate() - 1);
    const endWeekdayOffset = (gridEnd.getDay() + 6) % 7;
    gridEnd.setDate(gridEnd.getDate() + (4 - Math.min(endWeekdayOffset, 4)));

    const previousMonth = new Date(selectedMonthStart.getFullYear(), selectedMonthStart.getMonth() - 1, 1);
    const followingMonth = new Date(selectedMonthStart.getFullYear(), selectedMonthStart.getMonth() + 1, 1);
    const monthTitle = selectedMonthStart.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

    const weeks = [];
    for (let weekStart = new Date(gridStart); weekStart <= gridEnd; weekStart.setDate(weekStart.getDate() + 7)) {
      const days = [];
      for (let index = 0; index < 5; index += 1) {
        const dayStart = new Date(weekStart);
        dayStart.setDate(weekStart.getDate() + index);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayStart.getDate() + 1);
        const dayEvents = events
          .filter((event) => eventOverlapsDay(event, dayStart, dayEnd))
          .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
        const visibleEvents = dayEvents.slice(0, 3);
        const hiddenCount = dayEvents.length - visibleEvents.length;
        const isOutsideMonth = dayStart < selectedMonthStart || dayStart >= selectedNextMonth;
        const isToday = dayStart.toDateString() === todayStart.toDateString();

        days.push(`
          <div class="planning-month-workday${isToday ? ' today' : ''}${isOutsideMonth ? ' outside-month' : ''}">
            <div class="planning-month-header">
              <strong>${dayStart.toLocaleDateString('fr-FR', { day: '2-digit' })}</strong>
              <span>${dayStart.toLocaleDateString('fr-FR', { month: 'short' })}</span>
            </div>
            <div class="planning-events planning-month-events">
              ${visibleEvents.map((event) => renderMonthAgendaEvent(event, dayStart)).join('')}
              ${hiddenCount > 0 ? `<div class="planning-month-more">+${hiddenCount} autre${hiddenCount > 1 ? 's' : ''}</div>` : ''}
            </div>
          </div>
        `);
      }
      weeks.push(`<div class="planning-month-week">${days.join('')}</div>`);
    }

    return `
      <section class="planning-month-shell">
        <div class="planning-month-nav">
          <a class="btn btn-secondary" href="${monthHref(previousMonth)}">‹ Mois précédent</a>
          <div>
            <h2>${escHtml(monthTitle)}</h2>
            <span>Du lundi au vendredi</span>
          </div>
          <a class="btn btn-secondary" href="/agenda?view=month&month=${dateKeyInTimeZone(new Date(), APP_TIME_ZONE).slice(0, 7)}">Aujourd’hui</a>
          <a class="btn btn-secondary" href="${monthHref(followingMonth)}">Mois suivant ›</a>
        </div>
        <div class="planning-month-workgrid" aria-label="Agenda mensuel ${escHtml(monthTitle)}">
          <div class="planning-month-weekdays">
            ${workDayLabels.map((label) => `<div><span class="weekday-long">${label}</span><span class="weekday-short">${label[0]}</span></div>`).join('')}
          </div>
          ${weeks.join('')}
        </div>
      </section>
    `;
  }

  const agendaLabels = {
    day: 'Planning jour',
    week: 'Planning semaine',
    month: 'Planning mois'
  };

  const agendaBody = agendaView === 'day'
    ? renderDayView()
    : agendaView === 'month'
      ? renderMonthView()
      : renderWeekView();

  const viewSelector = `
    <nav class="agenda-view-switch" aria-label="Vue agenda">
      <a class="${agendaView === 'day' ? 'active' : ''}" href="/agenda?view=day">Jour</a>
      <a class="${agendaView === 'week' ? 'active' : ''}" href="/agenda?view=week">Semaine</a>
      <a class="${agendaView === 'month' ? 'active' : ''}" href="/agenda?view=month&month=${selectedMonthKey}">Mois</a>
    </nav>
  `;

  const googleSyncButton = `
    <form method="POST" action="/google/sync" class="agenda-sync-form" onsubmit="const b=this.querySelector('button'); if(b.disabled) return false; b.disabled=true; b.textContent='Synchronisation...';">
      <button class="btn btn-secondary" type="submit">
        Synchroniser maintenant
      </button>
    </form>
  `;

  const newEventButton = `
    <button class="btn btn-primary" type="button" onclick="newEvent()">
      + Nouvel événement
    </button>
  `;

  const pageTitle = agendaLabels[agendaView];

  const content = `
      <div class="page-head agenda-page-head app-dark-page-head">
        <div class="clients-create-head">
          ${clientPageIcon('calendar', 'clients-title-icon')}
          <div>
            <h1>${escHtml(pageTitle)}</h1>
            <span>${events.length} événement${events.length > 1 ? 's' : ''}</span>
          </div>
        </div>
        ${viewSelector}
      </div>

      <div class="agenda-toolbar">
        ${googleSyncButton}
        ${newEventButton}
      </div>

      ${agendaBody}

      <div id="event-editor" class="event-editor hidden">

        <h3>Événement</h3>

        <input type="hidden" id="edit-id">

        <label>Titre</label>
        <input id="edit-title">

        <label>Type</label>
        <select id="edit-type">
          <option value="chantier">Chantier</option>
          <option value="pose">Pose</option>
          <option value="rdv">RDV</option>
        </select>

        <label>Début</label>
        <input type="datetime-local" id="edit-start">

        <label>Fin</label>
        <input type="datetime-local" id="edit-end">

        <div class="editor-actions">
          <button id="save-event">Enregistrer</button>
          <button id="delete-event" class="danger">Supprimer</button>
          <button id="cancel-edit">Annuler</button>
        </div>

      </div>

      <script>
      function toLocalDateTimeValue(date) {
        const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
        return offsetDate.toISOString().slice(0, 16);
      }

      function newEvent(){
        document.getElementById('event-editor').classList.remove('hidden');
        document.getElementById('edit-id').value = '';
        document.getElementById('edit-title').value = '';
        document.getElementById('edit-type').value = 'rdv';

        const now = new Date();
        const endDate = new Date(now.getTime() + 60 * 60 * 1000);

        document.getElementById('edit-start').value = toLocalDateTimeValue(now);
        document.getElementById('edit-end').value = toLocalDateTimeValue(endDate);
        document.getElementById('delete-event').style.display = 'none';
      }

      function editEvent(id,title,type,start,end){
        document.getElementById('event-editor').classList.remove('hidden');
        document.getElementById('edit-id').value=id;
        document.getElementById('edit-title').value=title;
        document.getElementById('edit-type').value=type;
        document.getElementById('edit-start').value = String(start || '').substring(0,16);
        document.getElementById('edit-end').value = String(end || '').substring(0,16);
        document.getElementById('delete-event').style.display = 'inline-block';
      }

      document.querySelectorAll('.planning-event').forEach(function (button) {
        button.addEventListener('click', function () {
          editEvent(
            button.dataset.eventId,
            button.dataset.eventTitle,
            button.dataset.eventType,
            button.dataset.eventStart,
            button.dataset.eventEnd
          );
        });
      });

      document.getElementById('cancel-edit').onclick = () => {
        document.getElementById('event-editor').classList.add('hidden');
      };

      document.getElementById('save-event').onclick = () => {
        const payload = {
          title: document.getElementById('edit-title').value,
          type: document.getElementById('edit-type').value,
          start_date: document.getElementById('edit-start').value,
          end_date: document.getElementById('edit-end').value
        };

        const id = document.getElementById('edit-id').value;

        fetch(
          id ? '/agenda/update' : '/agenda/add',
          {
            method:'POST',
            headers:{
              'Content-Type':'application/json'
            },
            body: JSON.stringify(
              id
                ? { id, ...payload }
                : payload
            )
          }
        ).then(()=>location.reload());
      };

      document.getElementById('delete-event').onclick = () => {
        if(!confirm('Supprimer cet événement ?')) return;

        fetch('/agenda/delete',{
          method:'POST',
          headers:{
            'Content-Type':'application/json'
          },
          body:JSON.stringify({
            id:document.getElementById('edit-id').value
          })
        }).then(()=>location.reload());
      };
      </script>
  `;

  return content;
}

module.exports = { renderAgendaView };
