const STORAGE_KEY = 'outil-pme.escalier.measurements';
(function () {
  const form = document.getElementById('measurementForm');
  const photoInput = document.getElementById('photoInput');
  const photoGallery = document.getElementById('photoGallery');
  const saveBtn = document.getElementById('saveBtn');
  const loadBtn = document.getElementById('loadBtn');
  const resetBtn = document.getElementById('resetBtn');
  const printBtn = document.getElementById('printBtn');
  const saveStatus = document.getElementById('saveStatus');
  const recordNameField = document.getElementById('recordName');
  const photoTemplate = document.getElementById('photoItemTemplate');
  const sideViewSvg = document.getElementById('sideViewSvg');
  const topViewSvg = document.getElementById('topViewSvg');
  const tremieGroups = Array.from(document.querySelectorAll('[data-tremie-group]'));

  let photos = [];
  let currentRecordName = '';
  let currentServerId = null;
  let activeMeasure = '';
  let svgMarkerPrefix = 'plan';

  function setDefaultValues() {
    const dateField = form.elements.date;
    if (dateField && !dateField.value) {
      dateField.value = new Date().toISOString().slice(0, 10);
    }
  }

  function getSelectedStairType() {
    const selected = getCheckboxValues('typeEscalier');
    if (selected.includes('Deux quarts tournants')) return 'double-quarter';
    if (selected.includes('Quart tournant')) return 'quarter';
    return 'straight';
  }

  function getTremieType() {
    const tremieTypeField = form.elements.tremieType;
    return tremieTypeField ? tremieTypeField.value : 'rectangle';
  }

  function syncTremieGroups() {
    const tremieType = getTremieType();
    tremieGroups.forEach((group) => {
      group.hidden = group.dataset.tremieGroup !== tremieType;
    });
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function isActive(keys) {
    return [].concat(keys || []).includes(activeMeasure);
  }

  function readMeasure(name, fallback) {
    const field = form.elements[name];
    const rawValue = field ? String(field.value || '').replace(',', '.').trim() : '';
    const numeric = Number(rawValue);
    const hasValue = rawValue !== '' && Number.isFinite(numeric) && numeric > 0;
    return {
      value: hasValue ? numeric : null,
      geom: hasValue ? numeric : fallback
    };
  }

  function formatMeasure(measure, suffix = 'mm') {
    if (!measure || measure.value === null) return '—';
    const rounded = Math.round(measure.value * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded.toFixed(0) : String(rounded).replace('.', ',')} ${suffix}`;
  }

  function getPlanValues() {
    const hauteur = readMeasure('hauteur', 2800);
    const longueur = readMeasure('longueur', 3200);
    const largeur = readMeasure('largeur', 900);
    const tremie = readMeasure('tremie', 1200);
    const reculement = readMeasure('reculement', longueur.geom);
    const echappee = readMeasure('echappee', 2000);
    const marchesNombre = readMeasure('marchesNombre', Math.max(10, Math.round(hauteur.geom / 175)));
    const marchesGeom = clamp(Math.round(marchesNombre.geom), 3, 22);
    const giron = longueur.value !== null && marchesNombre.value !== null
      ? { value: longueur.value / Math.max(1, marchesNombre.value), geom: longueur.value / Math.max(1, marchesNombre.value) }
      : { value: null, geom: longueur.geom / Math.max(1, marchesGeom) };
    const hauteurMarche = hauteur.value !== null && marchesNombre.value !== null
      ? { value: hauteur.value / Math.max(1, marchesNombre.value), geom: hauteur.value / Math.max(1, marchesNombre.value) }
      : { value: null, geom: hauteur.geom / Math.max(1, marchesGeom) };
    return {
      stairType: getSelectedStairType(),
      tremieType: getTremieType(),
      hauteur,
      longueur,
      largeur,
      tremie,
      reculement,
      echappee,
      marchesNombre,
      marchesGeom,
      giron,
      hauteurMarche,
      tremieLongueur: readMeasure('tremieLongueur', tremie.geom),
      tremieLargeur: readMeasure('tremieLargeur', Math.max(900, Math.round(tremie.geom * 0.72))),
      tremieLGrandeLongueur: readMeasure('tremieLGrandeLongueur', tremie.geom),
      tremieLGrandeLargeur: readMeasure('tremieLGrandeLargeur', Math.max(950, Math.round(tremie.geom * 0.78))),
      tremieLRetourLongueur: readMeasure('tremieLRetourLongueur', Math.max(700, Math.round(tremie.geom * 0.46))),
      tremieLRetourLargeur: readMeasure('tremieLRetourLargeur', Math.max(700, Math.round(tremie.geom * 0.46)))
    };
  }

  function svgGrid(width, height) {
    const lines = [];
    for (let x = 20; x < width; x += 20) lines.push(`<line class="grid-line" x1="${x}" y1="0" x2="${x}" y2="${height}"/>`);
    for (let y = 20; y < height; y += 20) lines.push(`<line class="grid-line" x1="0" y1="${y}" x2="${width}" y2="${y}"/>`);
    return lines.join('');
  }

  function labelBox(text, x, y, width, key = '') {
    const active = key && isActive(key) ? ' active' : '';
    return `<g class="${active.trim()}"><rect class="label-box" x="${x - width / 2}" y="${y - 12}" width="${width}" height="24" rx="6"/><text class="label" x="${x}" y="${y + 4}" text-anchor="middle">${text}</text></g>`;
  }

  function dimH(x1, y, x2, label, key, offset = 10) {
    const active = isActive(key) ? ' active' : '';
    const textY = y - offset;
    return `<g class="dim-group${active}">
      <line class="dim-line" x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" marker-start="url(#${svgMarkerPrefix}DimArrow)" marker-end="url(#${svgMarkerPrefix}DimArrow)"/>
      <line class="dim-line" x1="${x1}" y1="${y - 9}" x2="${x1}" y2="${y + 9}"/>
      <line class="dim-line" x1="${x2}" y1="${y - 9}" x2="${x2}" y2="${y + 9}"/>
      <text class="dim-label" x="${(x1 + x2) / 2}" y="${textY}" text-anchor="middle">${label}</text>
    </g>`;
  }

  function dimV(x, y1, y2, label, key, textSide = 'left') {
    const active = isActive(key) ? ' active' : '';
    const textX = textSide === 'right' ? x + 15 : x - 15;
    const anchor = textSide === 'right' ? 'start' : 'end';
    return `<g class="dim-group${active}">
      <line class="dim-line" x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" marker-start="url(#${svgMarkerPrefix}DimArrow)" marker-end="url(#${svgMarkerPrefix}DimArrow)"/>
      <line class="dim-line" x1="${x - 9}" y1="${y1}" x2="${x + 9}" y2="${y1}"/>
      <line class="dim-line" x1="${x - 9}" y1="${y2}" x2="${x + 9}" y2="${y2}"/>
      <text class="dim-label" x="${textX}" y="${(y1 + y2) / 2 + 4}" text-anchor="${anchor}">${label}</text>
    </g>`;
  }

  function arrowPolyline(points) {
    return `<polyline class="thin-line" points="${points.map((point) => point.join(',')).join(' ')}" marker-end="url(#${svgMarkerPrefix}TravelArrow)"/>`;
  }

  function stepLinesHorizontal(x, y, width, height, count) {
    const lines = [];
    const risers = clamp(Math.round(count), 3, 22);
    for (let index = 1; index < risers; index += 1) {
      const stepX = x + (width / risers) * index;
      lines.push(`<line class="thin-line" x1="${stepX}" y1="${y + 8}" x2="${stepX}" y2="${y + height - 8}"/>`);
    }
    return lines.join('');
  }

  function stepLinesVertical(x, y, width, height, count) {
    const lines = [];
    const risers = clamp(Math.round(count), 3, 22);
    for (let index = 1; index < risers; index += 1) {
      const stepY = y + (height / risers) * index;
      lines.push(`<line class="thin-line" x1="${x + 8}" y1="${stepY}" x2="${x + width - 8}" y2="${stepY}"/>`);
    }
    return lines.join('');
  }

  function turnLines(x, y, size, mode) {
    const lines = [];
    for (let index = 1; index <= 4; index += 1) {
      const ratio = index / 5;
      if (mode === 'left-up') {
        lines.push(`<line class="thin-line" x1="${x + 10 + ratio * (size - 20)}" y1="${y + size - 10}" x2="${x + 10}" y2="${y + size - 10 - ratio * (size - 20)}"/>`);
      } else {
        lines.push(`<line class="thin-line" x1="${x + size - 10}" y1="${y + 10 + ratio * (size - 20)}" x2="${x + size - 10 - ratio * (size - 20)}" y2="${y + size - 10}"/>`);
      }
    }
    return lines.join('');
  }

  function svgShell(width, height, body) {
    return `<svg viewBox="0 0 ${width} ${height}" role="img" preserveAspectRatio="xMidYMid meet">
      <defs>
        <marker id="${svgMarkerPrefix}DimArrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto" markerUnits="strokeWidth">
          <path d="M 0 0 L 8 4 L 0 8 z" fill="#ff7a00"/>
        </marker>
        <marker id="${svgMarkerPrefix}TravelArrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto" markerUnits="strokeWidth">
          <path d="M 0 0 L 9 4.5 L 0 9 z" fill="#1f2933"/>
        </marker>
      </defs>
      <rect class="sheet-bg" x="0" y="0" width="${width}" height="${height}"/>
      ${svgGrid(width, height)}
      ${body}
    </svg>`;
  }

  function renderSidePlan(values) {
    svgMarkerPrefix = 'sidePlan';
    const width = 760;
    const height = 430;
    const left = 116;
    const right = 650;
    const top = 78;
    const bottom = 304;
    const run = right - left;
    const steps = values.marchesGeom;
    let stairPath = `M ${left} ${bottom}`;
    for (let index = 1; index <= steps; index += 1) {
      const x = left + (run / steps) * index;
      const y = bottom - ((bottom - top) / steps) * index;
      const prevY = bottom - ((bottom - top) / steps) * (index - 1);
      stairPath += ` L ${x} ${prevY} L ${x} ${y}`;
    }

    const body = `
      <line class="cut-line" x1="72" y1="${bottom}" x2="696" y2="${bottom}"/>
      <text class="caption" x="74" y="${bottom + 23}">Sol bas / départ</text>
      <rect class="slab-fill" x="${right - 8}" y="${top - 13}" width="86" height="22"/>
      <line class="cut-line" x1="${right - 22}" y1="${top}" x2="${right + 96}" y2="${top}"/>
      <text class="caption" x="${right - 8}" y="${top - 24}">Sol haut / dalle</text>
      <path class="outline-line" d="${stairPath}"/>
      <line class="thin-line" x1="${left}" y1="${bottom}" x2="${right}" y2="${top}"/>
      ${arrowPolyline([[left + 38, bottom - 22], [right - 72, top + 26]])}
      <text class="caption" x="${left + 314}" y="${top + 52}" text-anchor="middle">Sens de montée</text>
      ${dimV(76, top, bottom, `Hauteur ${formatMeasure(values.hauteur)}`, 'hauteur')}
      ${dimH(left, 342, right, `Reculement ${formatMeasure(values.reculement)}`, 'reculement')}
      ${dimH(left, 380, right, `Longueur ${formatMeasure(values.longueur)}`, 'longueur')}
      ${dimV(right + 58, top + 12, top + 112, `Échappée ${formatMeasure(values.echappee)}`, 'echappee', 'right')}
      ${labelBox(`${formatMeasure(values.marchesNombre, 'marches')}`, left + 174, bottom - 108, 112, 'marchesNombre')}
      ${labelBox(`H marche ${formatMeasure(values.hauteurMarche)}`, left + 202, bottom - 74, 150, 'hauteur')}
      ${labelBox(`Giron ${formatMeasure(values.giron)}`, left + 410, bottom - 54, 126, 'longueur')}
    `;
    sideViewSvg.innerHTML = svgShell(width, height, body);
  }

  function renderTremie(values, x, y, width, height) {
    if (values.tremieType !== 'l') {
      return `<rect class="tremie-fill" x="${x}" y="${y}" width="${width}" height="${height}"/>
        <text class="caption" x="${x + width / 2}" y="${y + height / 2 + 4}" text-anchor="middle">TRÉMIE</text>
        ${dimH(x, y - 20, x + width, `Trémie L ${formatMeasure(values.tremieLongueur)}`, 'tremieLongueur')}
        ${dimV(x + width + 24, y, y + height, `l ${formatMeasure(values.tremieLargeur)}`, 'tremieLargeur', 'right')}`;
    }

    const notchW = clamp(width * (values.tremieLRetourLongueur.geom / Math.max(values.tremieLGrandeLongueur.geom, 1)), 42, width - 28);
    const notchH = clamp(height * (values.tremieLRetourLargeur.geom / Math.max(values.tremieLGrandeLargeur.geom, 1)), 36, height - 28);
    const path = `M ${x} ${y} H ${x + width} V ${y + notchH} H ${x + notchW} V ${y + height} H ${x} Z`;
    return `<path class="tremie-fill" d="${path}"/>
      <text class="caption" x="${x + width / 2}" y="${y + 18}" text-anchor="middle">TRÉMIE EN L</text>
      ${dimH(x, y - 20, x + width, `A ${formatMeasure(values.tremieLGrandeLongueur)}`, 'tremieLGrandeLongueur')}
      ${dimV(x + width + 24, y, y + height, `B ${formatMeasure(values.tremieLGrandeLargeur)}`, 'tremieLGrandeLargeur', 'right')}
      ${dimH(x, y + height + 28, x + notchW, `C ${formatMeasure(values.tremieLRetourLongueur)}`, 'tremieLRetourLongueur', 8)}
      ${dimV(x - 24, y + notchH, y + height, `D ${formatMeasure(values.tremieLRetourLargeur)}`, 'tremieLRetourLargeur')}`;
  }

  function renderTopPlan(values) {
    svgMarkerPrefix = 'topPlan';
    const width = 760;
    const height = 430;
    const flight = 68;
    const startX = 112;
    const centerY = 208;
    let body = '';
    let tremie = { x: 472, y: 152, width: 142, height: 90 };

    if (values.stairType === 'straight') {
      const run = 486;
      const y = centerY - flight / 2;
      body += `<rect class="stair-fill" x="${startX}" y="${y}" width="${run}" height="${flight}"/>
        ${stepLinesHorizontal(startX, y, run, flight, values.marchesGeom)}
        ${arrowPolyline([[startX + 30, centerY], [startX + run - 34, centerY]])}
        <text class="caption" x="${startX + 8}" y="${y - 14}">Départ</text>
        <text class="caption" x="${startX + run - 48}" y="${y - 14}">Arrivée</text>
        ${dimH(startX, y + flight + 42, startX + run, `Longueur ${formatMeasure(values.longueur)}`, 'longueur')}
        ${dimV(startX - 34, y, y + flight, `Largeur ${formatMeasure(values.largeur)}`, 'largeur')}`;
      tremie = { x: startX + run * 0.62, y: y + 10, width: 134, height: 48 };
    } else if (values.stairType === 'quarter') {
      const horizontal = 344;
      const vertical = 210;
      const turnX = startX + horizontal - flight;
      const bottomY = 292 - flight;
      const topY = bottomY - vertical + flight;
      body += `<rect class="stair-fill" x="${startX}" y="${bottomY}" width="${horizontal}" height="${flight}"/>
        <rect class="stair-fill" x="${turnX}" y="${topY}" width="${flight}" height="${vertical}"/>
        ${stepLinesHorizontal(startX, bottomY, horizontal - flight, flight, Math.ceil(values.marchesGeom * 0.58))}
        ${stepLinesVertical(turnX, topY, flight, vertical - flight, Math.ceil(values.marchesGeom * 0.42))}
        ${turnLines(turnX, bottomY, flight, 'left-up')}
        ${arrowPolyline([[startX + 28, bottomY + flight / 2], [turnX + flight / 2, bottomY + flight / 2], [turnX + flight / 2, topY + 28]])}
        <text class="caption" x="${startX + 8}" y="${bottomY - 14}">Départ</text>
        <text class="caption" x="${turnX + 78}" y="${topY + 22}">Arrivée</text>
        ${dimH(startX, bottomY + flight + 40, startX + horizontal, `Longueur ${formatMeasure(values.longueur)}`, 'longueur')}
        ${dimV(startX + horizontal + 36, topY, bottomY + flight, `Reculement ${formatMeasure(values.reculement)}`, 'reculement', 'right')}
        ${dimV(startX - 34, bottomY, bottomY + flight, `Largeur ${formatMeasure(values.largeur)}`, 'largeur')}`;
      tremie = { x: turnX - 132, y: topY + 20, width: 116, height: 122 };
    } else {
      const horizontal = 330;
      const vertical = 236;
      const turnX = startX + horizontal - flight;
      const topY = 80;
      const bottomY = topY + vertical - flight;
      body += `<rect class="stair-fill" x="${startX}" y="${topY}" width="${horizontal}" height="${flight}"/>
        <rect class="stair-fill" x="${turnX}" y="${topY}" width="${flight}" height="${vertical}"/>
        <rect class="stair-fill" x="${startX}" y="${bottomY}" width="${horizontal}" height="${flight}"/>
        ${stepLinesHorizontal(startX, topY, horizontal - flight, flight, Math.ceil(values.marchesGeom * 0.34))}
        ${stepLinesVertical(turnX, topY + flight, flight, vertical - flight * 2, Math.ceil(values.marchesGeom * 0.32))}
        ${stepLinesHorizontal(startX, bottomY, horizontal - flight, flight, Math.ceil(values.marchesGeom * 0.34))}
        ${turnLines(turnX, topY, flight, 'down-left')}
        ${turnLines(turnX, bottomY, flight, 'left-up')}
        ${arrowPolyline([[startX + 28, bottomY + flight / 2], [turnX + flight / 2, bottomY + flight / 2], [turnX + flight / 2, topY + flight / 2], [startX + 28, topY + flight / 2]])}
        <text class="caption" x="${startX + 8}" y="${bottomY - 14}">Départ</text>
        <text class="caption" x="${startX + 8}" y="${topY - 14}">Arrivée</text>
        ${dimH(startX, bottomY + flight + 40, startX + horizontal, `Longueur ${formatMeasure(values.longueur)}`, 'longueur')}
        ${dimV(startX + horizontal + 36, topY, bottomY + flight, `Reculement ${formatMeasure(values.reculement)}`, 'reculement', 'right')}
        ${dimV(startX - 34, topY, topY + flight, `Largeur ${formatMeasure(values.largeur)}`, 'largeur')}`;
      tremie = { x: startX + 34, y: topY + flight + 22, width: 162, height: 80 };
    }

    body += renderTremie(values, tremie.x, tremie.y, tremie.width, tremie.height);
    topViewSvg.innerHTML = svgShell(width, height, body);
  }

  function renderPlans() {
    const values = getPlanValues();
    if (sideViewSvg) renderSidePlan(values);
    if (topViewSvg) renderTopPlan(values);
  }

  function renderPhotos() {
    photoGallery.innerHTML = '';
    photos.forEach((photo, index) => {
      const node = photoTemplate.content.firstElementChild.cloneNode(true);
      node.querySelector('img').src = photo.dataUrl;
      node.querySelector('img').alt = photo.name || 'Photo chantier';
      node.querySelector('.photo-remove').addEventListener('click', () => {
        photos.splice(index, 1);
        renderPhotos();
      });
      photoGallery.appendChild(node);
    });
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function getCheckboxValues(name) {
    return Array.from(form.querySelectorAll(`input[name="${name}"]:checked`)).map((input) => input.value);
  }

  function setCheckboxValues(name, values) {
    const valueSet = new Set(values || []);
    form.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
      input.checked = valueSet.has(input.value);
    });
  }

  function collectFormData() {
    const fields = {};
    Array.from(form.elements).forEach((field) => {
      if (!field.name || field.type === 'checkbox' || field.type === 'file' || field.tagName === 'BUTTON') return;
      fields[field.name] = field.value;
    });
    return {
      server_id: currentServerId,
      module: 'Escalier',
      recordName: recordNameField.value.trim(),
      fields,
      quote_id: fields.quote_id || '',
      client_order_id: fields.quote_id ? '' : (fields.client_order_id || ''),
      typeEscalier: getCheckboxValues('typeEscalier'),
      structure: getCheckboxValues('structure'),
      finitions: getCheckboxValues('finitions'),
      pose: getCheckboxValues('pose'),
      observations: form.elements.observations.value,
      photos,
      updatedAt: new Date().toISOString(),
    };
  }

  function applyFormData(record) {
    const fields = record.fields || {};
    Object.keys(fields).forEach((key) => {
      if (form.elements[key]) {
        form.elements[key].value = fields[key];
      }
    });
    recordNameField.value = record.recordName || '';
    currentServerId = record.server_id || record.id || null;
    setCheckboxValues('typeEscalier', record.typeEscalier);
    setCheckboxValues('structure', record.structure);
    setCheckboxValues('finitions', record.finitions);
    setCheckboxValues('pose', record.pose);
    form.elements.observations.value = record.observations || '';
    photos = Array.isArray(record.photos) ? record.photos.slice() : [];
    renderPhotos();
    syncTremieGroups();
    renderPlans();
    currentRecordName = record.recordName || '';
    saveStatus.textContent = record.updatedAt
      ? `Fiche chargée - dernière sauvegarde le ${new Date(record.updatedAt).toLocaleString('fr-FR')}`
      : 'Fiche chargée';
  }

  function getStoredRecords() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  }

  function saveStoredRecords(records) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }

  function buildOption(value, label) {
    const option = document.createElement('option');
    option.value = value ? String(value) : '';
    option.textContent = label;
    return option;
  }

  async function initServerLinks() {
    const firstBlock = form.querySelector('.block');
    if (!firstBlock || document.getElementById('measurementQuoteLink')) return;

    const section = document.createElement('section');
    section.className = 'block measurement-link-block';
    section.innerHTML = [
      '<div class="block-title">',
      '<h3>Rattachement</h3>',
      '</div>',
      '<div class="grid grid-2">',
      '<label class="field"><span>Rattacher à un devis</span><select id="measurementQuoteLink" name="quote_id"><option value="">Aucun devis</option></select></label>',
      '<label class="field"><span>Rattacher à une commande client</span><select id="measurementOrderLink" name="client_order_id"><option value="">Aucune commande</option></select></label>',
      '</div>'
    ].join('');
    firstBlock.parentNode.insertBefore(section, firstBlock.nextSibling);

    const quoteSelect = section.querySelector('#measurementQuoteLink');
    const orderSelect = section.querySelector('#measurementOrderLink');
    quoteSelect.addEventListener('change', () => {
      if (quoteSelect.value) orderSelect.value = '';
    });
    orderSelect.addEventListener('change', () => {
      if (orderSelect.value) quoteSelect.value = '';
    });

    try {
      const response = await fetch('/api/measurements/link-options');
      if (!response.ok) return;
      const data = await response.json();
      (data.quotes || []).forEach((quote) => quoteSelect.appendChild(buildOption(quote.id, quote.label)));
      (data.clientOrders || []).forEach((order) => orderSelect.appendChild(buildOption(order.id, order.label)));
    } catch {}
  }

  async function saveRecord() {
    const payload = collectFormData();
    const recordName = payload.recordName || `Fiche escalier ${new Date().toLocaleDateString('fr-FR')}`;
    payload.recordName = recordName;
    recordNameField.value = recordName;

    const records = getStoredRecords();
    const index = records.findIndex((entry) => entry.recordName === recordName);
    if (index >= 0) {
      records[index] = payload;
    } else {
      records.push(payload);
    }
    saveStoredRecords(records);
    currentRecordName = recordName;
    saveStatus.textContent = `Enregistré localement - ${new Date(payload.updatedAt).toLocaleString('fr-FR')}`;

    try {
      const serverPayload = Object.assign({}, payload, { photos: [] });
      const response = await fetch('/api/measurements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serverPayload)
      });
      if (!response.ok) throw new Error('server-save-failed');
      const result = await response.json();
      currentServerId = result.id || currentServerId;
      payload.server_id = currentServerId;
      const refreshed = getStoredRecords();
      const refreshedIndex = refreshed.findIndex((entry) => entry.recordName === recordName);
      if (refreshedIndex >= 0) refreshed[refreshedIndex] = payload;
      saveStoredRecords(refreshed);
      saveStatus.textContent = `Enregistré - ${new Date(payload.updatedAt).toLocaleString('fr-FR')}`;
    } catch {
      saveStatus.textContent = 'Enregistré localement - serveur indisponible';
    }
  }

  function loadRecord() {
    const records = getStoredRecords();
    if (!records.length) {
      saveStatus.textContent = 'Aucune fiche enregistrée';
      return;
    }

    const preferred = recordNameField.value.trim() || currentRecordName;
    let record = preferred ? records.find((entry) => entry.recordName === preferred) : null;

    if (!record) {
      const list = records.map((entry) => entry.recordName).join('\n- ');
      const chosen = window.prompt(`Nom de fiche à ouvrir :\n- ${list}`, preferred || records[records.length - 1].recordName);
      if (!chosen) return;
      record = records.find((entry) => entry.recordName === chosen.trim());
    }

    if (!record) {
      saveStatus.textContent = 'Fiche introuvable';
      return;
    }

    form.reset();
    applyFormData(record);
  }

  function resetForm() {
    form.reset();
    photos = [];
    renderPhotos();
    syncTremieGroups();
    renderPlans();
    currentRecordName = '';
    currentServerId = null;
    saveStatus.textContent = 'Nouvelle fiche prête';
    setDefaultValues();
  }

  photoInput.addEventListener('change', async (event) => {
    const files = Array.from(event.target.files || []);
    const newPhotos = [];
    for (const file of files) {
      newPhotos.push({
        name: file.name,
        dataUrl: await fileToDataUrl(file),
      });
    }
    photos = photos.concat(newPhotos);
    renderPhotos();
    photoInput.value = '';
  });

  saveBtn.addEventListener('click', saveRecord);
  loadBtn.addEventListener('click', loadRecord);
  resetBtn.addEventListener('click', resetForm);
  printBtn.addEventListener('click', () => window.print());

  const planFieldNames = [
    'typeEscalier',
    'hauteur',
    'longueur',
    'largeur',
    'tremie',
    'reculement',
    'echappee',
    'marchesNombre',
    'tremieType',
    'tremieLongueur',
    'tremieLargeur',
    'tremieLGrandeLongueur',
    'tremieLGrandeLargeur',
    'tremieLRetourLongueur',
    'tremieLRetourLargeur',
  ];
  const planSelector = planFieldNames.map((name) => `[name="${name}"]`).join(', ');

  form.querySelectorAll(planSelector).forEach((input) => {
    const updateActivePlan = () => {
      activeMeasure = input.name;
      renderPlans();
    };
    input.addEventListener('focus', updateActivePlan);
    input.addEventListener('input', updateActivePlan);
    input.addEventListener('change', updateActivePlan);
    input.addEventListener('blur', () => {
      window.setTimeout(() => {
        if (!form.contains(document.activeElement) || !planFieldNames.includes(document.activeElement.name)) {
          activeMeasure = '';
          renderPlans();
        }
      }, 80);
    });
  });

  const tremieTypeControl = form.elements.tremieType;
  if (tremieTypeControl) {
    tremieTypeControl.addEventListener('change', () => {
      syncTremieGroups();
      renderPlans();
    });
  }

  window.addEventListener('resize', () => {
    renderPlans();
  });

  setDefaultValues();
  initServerLinks();
  syncTremieGroups();
  renderPlans();
  saveStatus.textContent = getStoredRecords().length
    ? 'Des fiches locales sont disponibles'
    : 'Aucune sauvegarde chargée';
})();
