(function () {
  'use strict';

  document.body.classList.add('measurement-modern-page');

  const form = document.getElementById('measurementForm') || document.getElementById('form');
  const hero = document.querySelector('.hero, .v2-header');
  const heroCopy = document.querySelector('.hero-copy');
  const moduleName = String(
    form?.dataset?.moduleLabel ||
    document.querySelector('.v2-header h1, .hero h1')?.textContent ||
    'Prise de cotes'
  ).replace(/^.*fiche\s+/i, '').replace(/^.*prises? de cotes?\s*/i, '').trim();

  const iconPaths = /portail/i.test(moduleName)
    ? '<path d="M4 20V5M20 20V5M6 8h12M6 18h12M8 18V8M12 18V8M16 18V8"/>'
    : /cl[oô]ture/i.test(moduleName)
      ? '<path d="M4 20V9l3-4 3 4v11M10 20V9l3-4 3 4v11M16 20V9l3-4 3 4v11"/><path d="M3 13h18M3 17h18"/>'
      : /garde/i.test(moduleName)
        ? '<path d="M4 18V7M20 18V7M4 9h16M7 9v9M11 9v9M15 9v9M19 9v9"/>'
        : /pergola/i.test(moduleName)
          ? '<path d="M4 9h16M6 9l2-4h8l2 4M7 9v11M17 9v11M5 20h14M9 9v4M12 9v4M15 9v4"/>'
          : /verri[eè]re/i.test(moduleName)
            ? '<path d="M5 4h14v16H5zM12 4v16M5 12h14M8.5 4v16M15.5 4v16"/>'
            : /escalier/i.test(moduleName)
              ? '<path d="M4 19h16M4 15h4v4M8 11h4v8M12 7h4v12M16 3h4v16"/>'
              : '<path d="M12 4v16M4 12h16M6 6l12 12M18 6 6 18"/>';

  if (heroCopy && !heroCopy.querySelector('.measurement-module-icon')) {
    const icon = document.createElement('span');
    icon.className = 'measurement-module-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = `<svg viewBox="0 0 24 24">${iconPaths}</svg>`;
    heroCopy.prepend(icon);
  }

  const valueOf = (...names) => {
    for (const name of names) {
      const field = form?.elements?.[name] || document.getElementById(name);
      if (field && String(field.value || '').trim()) return String(field.value).trim();
    }
    return '';
  };

  let meta = null;
  function renderMeta() {
    if (!hero || !form) return;
    if (!meta) {
      meta = document.createElement('div');
      meta.className = 'measurement-hero-meta';
      const target = heroCopy || hero.querySelector('.v2-header-main') || hero;
      target.appendChild(meta);
    }
    const client = valueOf('client');
    const chantier = valueOf('chantier', 'commande');
    const date = valueOf('date');
    const quoteId = valueOf('quote_id');
    const items = [
      client ? `<span class="measurement-meta-item">Client · ${escapeHtml(client)}</span>` : '',
      chantier ? `<span class="measurement-meta-item">Chantier · ${escapeHtml(chantier)}</span>` : '',
      date ? `<span class="measurement-meta-item">Date · ${escapeHtml(formatDate(date))}</span>` : '',
      quoteId ? `<span class="measurement-quote-badge">Liée au devis #${escapeHtml(quoteId)}</span>` : ''
    ];
    meta.innerHTML = items.filter(Boolean).join('') || '<span class="measurement-meta-item">Nouvelle fiche</span>';
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"]/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
    })[character]);
  }

  function formatDate(value) {
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
  }

  if (form) {
    form.addEventListener('input', renderMeta);
    form.addEventListener('change', renderMeta);
    window.setTimeout(renderMeta, 0);
    window.setTimeout(renderMeta, 500);
  }

  const returnLink = document.querySelector('.back-link, .v2-back');
  const saveButton = document.getElementById('saveBtn');
  const newButton = document.getElementById('resetBtn') || document.getElementById('newBtn');
  if (returnLink || saveButton || newButton) {
    const mobileActions = document.createElement('nav');
    mobileActions.className = 'measurement-mobile-actions';
    mobileActions.setAttribute('aria-label', 'Actions de la fiche');
    if (returnLink) {
      const back = document.createElement('a');
      back.className = 'measurement-mobile-action';
      back.href = returnLink.getAttribute('href') || '/outils/prises-cotes';
      back.textContent = 'Retour';
      mobileActions.appendChild(back);
      new MutationObserver(() => { back.href = returnLink.getAttribute('href') || back.href; })
        .observe(returnLink, { attributes: true, attributeFilter: ['href'] });
    }
    if (newButton) {
      const fresh = document.createElement('button');
      fresh.type = 'button';
      fresh.className = 'measurement-mobile-action';
      fresh.textContent = 'Nouvelle';
      fresh.addEventListener('click', () => newButton.click());
      mobileActions.appendChild(fresh);
    }
    if (saveButton) {
      const save = document.createElement('button');
      save.type = 'button';
      save.className = 'measurement-mobile-action is-primary';
      save.textContent = 'Enregistrer';
      save.addEventListener('click', () => saveButton.click());
      mobileActions.appendChild(save);
    }
    document.body.appendChild(mobileActions);
  }
})();
