'use strict';

function renderDashboardView(data, dependencies) {
  const {
    todayIso, todayLabel, openTasks, eventsToday, clientsCount, openClientOrders,
    activeOrderChantiers, quotesToFollowCount, waitingSupplierOrders, todayEvents,
    upcomingEvents, orderChantiers, activeSupplierOrders, pendingPurchases
  } = data;
  const {
    escHtml, safeName, getProgressFromChantierStatus, formatHours,
    normalizePurchaseStatus, clientOrderFolderName
  } = dependencies;
  const formatDateShort = (value) => {
    const raw = String(value || '').slice(0, 10);
    if (!raw) return '—';
    const date = new Date(`${raw}T00:00:00`);
    if (Number.isNaN(date.getTime())) return raw;
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };
  const orderIconFor = (order) => {
    const label = `${order.description || ''} ${order.name || ''}`
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    const icons = {
      stair: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19h16M4 15h4v4M8 11h4v8M12 7h4v12M16 3h4v16"/></svg>',
      rail: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18V7M20 18V7M4 9h16M7 9v9M11 9v9M15 9v9M19 9v9"/></svg>',
      gate: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V5M20 20V5M6 8h12M6 18h12M8 18V8M12 18V8M16 18V8"/></svg>',
      pergola: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h16M6 9l2-4h8l2 4M7 9v11M17 9v11M5 20h14M9 9v4M12 9v4M15 9v4"/></svg>',
      window: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5zM12 4v16M5 12h14"/></svg>',
      site: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16M6 20V9l6-4 6 4v11M9 20v-6h6v6M8 11h8"/></svg>',
    };
    if (label.includes('escalier')) return icons.stair;
    if (label.includes('garde-corps') || label.includes('garde corps') || label.includes('barriere')) return icons.rail;
    if (label.includes('portail')) return icons.gate;
    if (label.includes('pergola')) return icons.pergola;
    if (label.includes('verriere') || label.includes('fenetre')) return icons.window;
    return icons.site;
  };

  const kpiIcon = (name) => {
    const icons = {
      tasks: '<path d="M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="m8 12 2.5 2.5L16 9"/>',
      calendar: '<path d="M7 3v4M17 3v4M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M8 12h3M8 16h5"/>',
      clients: '<path d="M16 19v-1.5A3.5 3.5 0 0 0 12.5 14h-5A3.5 3.5 0 0 0 4 17.5V19"/><path d="M10 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M20 19v-1.2a3 3 0 0 0-2.4-2.9"/><path d="M15.5 5.3a3 3 0 0 1 0 5.4"/>',
      orders: '<path d="M5 5h5l2 2h7a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M8 12h8M8 15h5"/>',
      suppliers: '<path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7z"/><path d="M6.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>',
      quotes: '<path d="M7 3h7l4 4v14H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h4M9 12h6M9 16h6"/>',
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.orders}</svg>`;
  };

  const kpis = [
    { icon: 'tasks', label: 'Tâches en cours', value: openTasks, href: '/tasks' },
    { icon: 'calendar', label: 'Agenda aujourd’hui', value: eventsToday, href: '/agenda' },
    { icon: 'clients', label: 'Clients', value: clientsCount, href: '/clients' },
    { icon: 'orders', label: 'Commandes / chantiers en cours', value: activeOrderChantiers, href: '/orders/clients' },
    { icon: 'suppliers', label: 'Commandes fournisseurs', value: waitingSupplierOrders, href: '/orders/suppliers' },
    { icon: 'quotes', label: 'Devis', value: quotesToFollowCount, href: '/devis' },
  ]
    .map(
      (item) => `
      <a class="prototype-kpi-card" href="${item.href}">
        <span class="prototype-kpi-icon">${kpiIcon(item.icon)}</span>
        <span class="prototype-kpi-body">
          <strong>${escHtml(item.value)}</strong>
          <small>${escHtml(item.label)}</small>
          <em>Voir ›</em>
        </span>
      </a>
    `
    )
    .join('');

  const formatEventDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' });
  };
  const formatEventTime = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };
  const upcomingEventsHtml = upcomingEvents.length
    ? upcomingEvents
        .map((event) => {
          const startTime = formatEventTime(event.start_date);
          const endTime = formatEventTime(event.end_date);
          const timeLabel = [startTime, endTime].filter(Boolean).join(' - ') || 'Horaire à préciser';
          const location = event.location || event.place || event.lieu || '';
          return `
            <article class="prototype-appointment-card">
              <div>
                <strong>${escHtml(event.title || 'Rendez-vous')}</strong>
                <span>${escHtml(formatEventDate(event.start_date))} · ${escHtml(timeLabel)}</span>
                ${location ? `<small>${escHtml(location)}</small>` : ''}
              </div>
            </article>
          `;
        })
        .join('')
    : '<p class="prototype-empty">Aucun rendez-vous à venir.</p>';

  const orderChantiersHtml = orderChantiers.length
    ? orderChantiers
        .map((order) => {
          const safeClientFolder = safeName(order.name || 'Client');
          const orderFolderName = safeName(
            order.description && order.description.trim() !== '' ? order.description : `Commande_${order.id}`
          );
          const orderUrl = `/pc-folders/${encodeURIComponent(safeClientFolder)}/${encodeURIComponent(orderFolderName)}`;
          const planned = Number(order.planned_hours || 0);
          const hasTrackedHours = Number(order.chantier_hours_count || 0) > 0;
          const done = hasTrackedHours
            ? Number(order.done_hours_calc || 0)
            : Number(order.done_hours || 0);
          const progress = getProgressFromChantierStatus(order.chantier_status);
          const gap = done - planned;
          const endDate = String(order.chantier_end_date || '').slice(0, 10);
          const isLate = endDate && endDate < todayIso;
          return `
        <article class="prototype-order-card prototype-carousel-slide">
          <header>
            <span class="prototype-order-icon">${orderIconFor(order)}</span>
            <div>
              <strong>${escHtml(order.description || `Commande #${order.id}`)}</strong>
              <small>${escHtml(order.name || 'Client')}</small>
            </div>
            <span class="prototype-status">${escHtml(order.chantier_status || order.status || 'En cours')}</span>
            <b>${progress}%</b>
            <a class="prototype-chevron" href="${orderUrl}" aria-label="Ouvrir la commande">›</a>
          </header>
          <div class="prototype-progress" aria-label="Avancement chantier ${progress}%">
            <span style="width:${progress}%"></span>
          </div>
          <div class="prototype-order-metrics">
            <span><strong>${escHtml(formatHours(planned))}</strong><small>Prévues</small></span>
            <span><strong>${escHtml(formatHours(done))}</strong><small>Réalisées</small></span>
            <span><strong>${escHtml(formatHours(gap))}</strong><small>Écart</small></span>
            <span class="${isLate ? 'prototype-metric-late' : ''}"><strong>${escHtml(formatDateShort(endDate))}</strong><small>Fin prévue</small></span>
          </div>
        </article>
      `;
        })
        .join('')
    : '<p class="prototype-empty">Aucune commande / chantier actif</p>';

  const supplierDashboardItems = [
    ...pendingPurchases.map((item) => ({
      key: `purchase-${item.id}`,
      source: 'Achat chantier',
      bucket: normalizePurchaseStatus(item.status) === 'À commander' ? 0 : 1,
      title: item.designation || 'Article',
      subtitle: `${item.client_name || 'Client'} · ${item.order_description || `Commande #${item.order_id}`}`,
      meta: [
        item.category || '',
        item.reference ? `Réf. ${item.reference}` : '',
        item.supplier || 'Fournisseur non renseigné',
        item.needed_date ? `Besoin ${formatDateShort(item.needed_date)}` : '',
      ].filter(Boolean).join(' · '),
      status: normalizePurchaseStatus(item.status),
      href: `/pc-folders/${encodeURIComponent(safeName(item.client_name))}/${encodeURIComponent(clientOrderFolderName({
        id: item.order_id,
        description: item.order_description,
      }))}/Commandes`,
    })),
    ...activeSupplierOrders.map((order) => {
      const status = String(order.status || 'En cours').trim() || 'En cours';
      return {
        key: `supplier-${order.id}`,
        source: 'Commande fournisseur',
        bucket: status === 'Terminée' ? 2 : 1,
        title: order.name || 'Commande fournisseur',
        subtitle: order.description || 'Aucune désignation',
        meta: `Date ${formatDateShort(order.date)}`,
        status,
        href: `/orders/suppliers#supplier-${order.id}`,
      };
    }),
  ]
    .sort((a, b) => a.bucket - b.bucket || String(a.title).localeCompare(String(b.title), 'fr'))
    .slice(0, 12);

  const supplierOrdersHtml = supplierDashboardItems.length
    ? supplierDashboardItems
        .map((item) => `
          <article class="prototype-supplier-order-card prototype-carousel-slide" id="dashboard-${escHtml(item.key)}">
            <header>
              <span class="prototype-order-icon">${kpiIcon('suppliers')}</span>
              <div>
                <em class="prototype-source-badge">${escHtml(item.source)}</em>
                <strong>${escHtml(item.title)}</strong>
                <small>${escHtml(item.subtitle)}</small>
              </div>
              <span class="prototype-status">${escHtml(item.status)}</span>
            </header>
            <div class="prototype-supplier-order-meta">
              <span>${escHtml(item.meta || 'Informations non renseignées')}</span>
            </div>
            <a class="prototype-open-button" href="${item.href}">Ouvrir</a>
          </article>
        `)
        .join('')
    : '<p class="prototype-empty">Aucune commande fournisseur ou achat actif.</p>';

  const renderDashboardCarousel = ({ title, href, linkLabel, itemsHtml, count, kind }) => `
    <div class="prototype-carousel" data-dashboard-carousel data-carousel-count="${count}">
      <div class="prototype-carousel-head">
        <div class="prototype-panel-head">
          <h2>${escHtml(title)}</h2>
          <a href="${href}">${escHtml(linkLabel)}</a>
        </div>
        <div class="prototype-carousel-controls" aria-label="Navigation ${escHtml(title)}">
          <button type="button" data-carousel-prev aria-label="Précédent">‹</button>
          <span data-carousel-counter>0 / ${count}</span>
          <button type="button" data-carousel-next aria-label="Suivant">›</button>
        </div>
      </div>
      <div class="prototype-carousel-track prototype-carousel-${kind}" data-carousel-track>
        ${itemsHtml}
      </div>
    </div>
  `;
  return `
      <div class="dash-shell dashboard-prototype">
        <section class="prototype-hero">
          <div>
            <h1>Bonjour </h1>
            <p>${escHtml(todayLabel)} · Voici l’état de l’activité aujourd’hui.</p>
          </div>
        </section>

        <section class="prototype-kpi-grid" aria-label="Indicateurs principaux">
          ${kpis}
        </section>

        <section class="prototype-main-layout">
          <div class="prototype-carousel-stack">
            <article class="prototype-panel prototype-orders-panel">
              ${renderDashboardCarousel({
                title: 'Commandes clients',
                href: '/orders/clients',
                linkLabel: 'Voir toutes les commandes',
                itemsHtml: orderChantiersHtml,
                count: orderChantiers.length,
                kind: 'clients',
              })}
            </article>

            <article class="prototype-panel prototype-supplier-orders-panel">
              ${renderDashboardCarousel({
                title: 'Commandes fournisseurs et achats',
                href: '/orders/suppliers',
                linkLabel: 'Voir toutes les commandes',
                itemsHtml: supplierOrdersHtml,
                count: supplierDashboardItems.length,
                kind: 'suppliers',
              })}
            </article>
          </div>

          <aside class="prototype-side-stack">
            <article class="prototype-panel prototype-appointments-panel">
              <div class="prototype-panel-head">
                <h2>Prochains rendez-vous</h2>
                <a href="/agenda">Voir agenda ›</a>
              </div>
              <div class="prototype-appointments-list">
                ${upcomingEventsHtml}
              </div>
            </article>

            <article class="prototype-panel prototype-weather-card" data-weather-card aria-live="polite">
              <div class="prototype-weather-head">
                <span class="prototype-weather-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false">
                    <path d="M7 16.5h9a4 4 0 0 0 .7-7.9A6 6 0 0 0 5.5 10.2 3.3 3.3 0 0 0 7 16.5z"/>
                    <path d="M8 20h8M10 22h4"/>
                  </svg>
                </span>
                <div>
                  <h2>Météo Riaillé</h2>
                  <small data-weather-status>Chargement météo...</small>
                </div>
              </div>

              <div class="prototype-weather-content" data-weather-content hidden>
                <div class="prototype-weather-main">
                  <strong data-weather-temp>—</strong>
                  <span data-weather-condition>—</span>
                </div>
                <div class="prototype-weather-meta">
                  <span>Pluie <strong data-weather-rain>—</strong></span>
                  <span>Vent <strong data-weather-wind>—</strong></span>
                </div>
                <div class="prototype-weather-forecast">
                  <span>Aujourd’hui <strong data-weather-today>—</strong></span>
                  <span>Demain <strong data-weather-tomorrow>—</strong></span>
                </div>
              </div>
            </article>
          </aside>
        </section>
      </div>
      <script>
        (function(){
          document.querySelectorAll('[data-dashboard-carousel]').forEach(function(carousel){
            var track = carousel.querySelector('[data-carousel-track]');
            var prev = carousel.querySelector('[data-carousel-prev]');
            var next = carousel.querySelector('[data-carousel-next]');
            var counter = carousel.querySelector('[data-carousel-counter]');
            if (!track) return;
            var slides = Array.prototype.slice.call(track.querySelectorAll('.prototype-carousel-slide'));
            var total = slides.length;
            if (!total) {
              if (prev) prev.hidden = true;
              if (next) next.hidden = true;
              if (counter) counter.textContent = '0 / 0';
              return;
            }
            if (total <= 1) carousel.classList.add('is-single');

            function currentIndex(){
              var left = track.scrollLeft;
              var best = 0;
              var bestDistance = Infinity;
              slides.forEach(function(slide, index){
                var distance = Math.abs(slide.offsetLeft - left);
                if (distance < bestDistance) {
                  bestDistance = distance;
                  best = index;
                }
              });
              return best;
            }

            function update(){
              var index = currentIndex();
              if (counter) counter.textContent = (index + 1) + ' / ' + total;
              if (prev) prev.disabled = index <= 0;
              if (next) next.disabled = index >= total - 1;
            }

            function scrollToIndex(index){
              var target = slides[Math.max(0, Math.min(total - 1, index))];
              if (target) track.scrollTo({ left: target.offsetLeft, behavior: 'smooth' });
            }

            if (prev) prev.addEventListener('click', function(){ scrollToIndex(currentIndex() - 1); });
            if (next) next.addEventListener('click', function(){ scrollToIndex(currentIndex() + 1); });
            track.addEventListener('scroll', function(){ window.requestAnimationFrame(update); }, { passive: true });
            window.addEventListener('resize', update);
            update();
          });
        })();

        (function(){
          const card = document.querySelector('[data-weather-card]');
          if (!card) return;
          const status = card.querySelector('[data-weather-status]');
          const content = card.querySelector('[data-weather-content]');
          const setText = function(selector, value) {
            const el = card.querySelector(selector);
            if (el) el.textContent = value;
          };
          const unavailable = function() {
            if (status) status.textContent = 'Météo indisponible';
            if (content) content.hidden = true;
          };

          fetch('/api/weather', { headers: { Accept: 'application/json' } })
            .then(function(response) {
              if (!response.ok) throw new Error('weather');
              return response.json();
            })
            .then(function(data) {
              if (!data || !data.ok) throw new Error('weather');
              const current = data.current || {};
              const today = data.today || {};
              const tomorrow = data.tomorrow || {};
              setText('[data-weather-temp]', current.temperature === null || current.temperature === undefined ? '—' : current.temperature + '°C');
              setText('[data-weather-condition]', current.condition || '—');
              setText('[data-weather-rain]', today.precipitation === null || today.precipitation === undefined ? '—' : today.precipitation + ' mm');
              setText('[data-weather-wind]', current.wind === null || current.wind === undefined ? '—' : current.wind + ' km/h');
              setText('[data-weather-today]', (today.temperatureMin === null || today.temperatureMin === undefined ? '—' : today.temperatureMin + '°') + ' / ' + (today.temperatureMax === null || today.temperatureMax === undefined ? '—' : today.temperatureMax + '°'));
              setText('[data-weather-tomorrow]', (tomorrow.temperatureMin === null || tomorrow.temperatureMin === undefined ? '—' : tomorrow.temperatureMin + '°') + ' / ' + (tomorrow.temperatureMax === null || tomorrow.temperatureMax === undefined ? '—' : tomorrow.temperatureMax + '°'));
              if (status) status.textContent = current.condition || 'Météo actuelle';
              if (content) content.hidden = false;
            })
            .catch(unavailable);
        })();
      </script>
  `;
}

module.exports = { renderDashboardView };

