const STORAGE_KEY = 'outil-pme.escalier.measurements';
const PLAN_THEME = {
  dim: '#ff7a00',
  line: '#222222',
  fill: '#f4f4f4',
  fillAlt: '#ececec',
  step: 'rgba(34, 34, 34, 0.35)',
  grid: 'rgba(0, 0, 0, 0.08)',
  text: '#666666',
};

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
  const topViewCanvas = document.getElementById('topViewCanvas');
  const topViewContext = topViewCanvas ? topViewCanvas.getContext('2d') : null;
  const tremieGroups = Array.from(document.querySelectorAll('[data-tremie-group]'));

  let photos = [];
  let currentRecordName = '';

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

  function getNumericField(name, fallback) {
    const field = form.elements[name];
    const value = Number(field && field.value);
    return Number.isFinite(value) && value > 0 ? value : fallback;
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

  function drawDimensionLine(ctx, x1, y1, x2, y2, label) {
    ctx.save();
    ctx.strokeStyle = PLAN_THEME.dim;
    ctx.fillStyle = PLAN_THEME.dim;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.moveTo(x1, y1 - 5);
    ctx.lineTo(x1, y1 + 5);
    ctx.moveTo(x2, y2 - 5);
    ctx.lineTo(x2, y2 + 5);
    ctx.stroke();

    ctx.font = '12px Segoe UI';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, (x1 + x2) / 2, Math.min(y1, y2) - 8);
    ctx.restore();
  }

  function drawMarker(ctx, x, y, letter) {
    ctx.save();
    ctx.fillStyle = PLAN_THEME.dim;
    ctx.beginPath();
    ctx.arc(x, y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px Segoe UI';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, x, y + 0.5);
    ctx.restore();
  }

  function drawTechnicalGrid(ctx, width, height) {
    ctx.save();
    ctx.strokeStyle = PLAN_THEME.grid;
    ctx.lineWidth = 1;
    for (let x = 18; x < width; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 18; y < height; y += 24) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawVerticalDimensionLine(ctx, x, y1, y2, label) {
    ctx.save();
    ctx.strokeStyle = PLAN_THEME.dim;
    ctx.fillStyle = PLAN_THEME.dim;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    ctx.moveTo(x, y1);
    ctx.lineTo(x, y2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.moveTo(x - 5, y1);
    ctx.lineTo(x + 5, y1);
    ctx.moveTo(x - 5, y2);
    ctx.lineTo(x + 5, y2);
    ctx.stroke();

    ctx.save();
    ctx.translate(x - 10, (y1 + y2) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.font = '12px Segoe UI';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, 0, 0);
    ctx.restore();
    ctx.restore();
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function drawFlightRect(ctx, x, y, width, height) {
    ctx.save();
    ctx.fillStyle = PLAN_THEME.fill;
    ctx.strokeStyle = PLAN_THEME.line;
    ctx.lineWidth = 3;
    ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x, y, width, height);
    ctx.restore();
  }

  function drawRisers(ctx, x, y, width, height, count, axis) {
    const risers = Math.max(3, count);
    ctx.save();
    ctx.strokeStyle = PLAN_THEME.step;
    ctx.lineWidth = 1;
    if (axis === 'x') {
      for (let index = 1; index < risers; index += 1) {
        const stepX = x + (width / risers) * index;
        ctx.beginPath();
        ctx.moveTo(stepX, y + 11);
        ctx.lineTo(stepX, y + height - 11);
        ctx.stroke();
      }
    } else {
      for (let index = 1; index < risers; index += 1) {
        const stepY = y + (height / risers) * index;
        ctx.beginPath();
        ctx.moveTo(x + 11, stepY);
        ctx.lineTo(x + width - 11, stepY);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawTravelArrow(ctx, points) {
    if (!points.length) return;

    ctx.save();
    ctx.strokeStyle = PLAN_THEME.line;
    ctx.fillStyle = PLAN_THEME.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point[0], point[1]);
      else ctx.lineTo(point[0], point[1]);
    });
    ctx.stroke();

    const end = points[points.length - 1];
    const prev = points[points.length - 2] || points[0];
    const angle = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
    const size = 9;
    ctx.beginPath();
    ctx.moveTo(end[0], end[1]);
    ctx.lineTo(end[0] - size * Math.cos(angle - Math.PI / 6), end[1] - size * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(end[0] - size * Math.cos(angle + Math.PI / 6), end[1] - size * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawTurnWinders(ctx, x, y, size, mode) {
    const inset = 12;
    const lines = 4;

    ctx.save();
    ctx.strokeStyle = PLAN_THEME.step;
    ctx.lineWidth = 1;

    for (let index = 1; index <= lines; index += 1) {
      const ratio = index / (lines + 1);
      let start = null;
      let end = null;

      if (mode === 'left-up') {
        start = [x + ratio * (size - inset * 2) + inset, y + size - inset];
        end = [x + inset, y + size - ratio * (size - inset * 2) - inset];
      } else if (mode === 'down-left') {
        start = [x + size - inset, y + ratio * (size - inset * 2) + inset];
        end = [x + size - ratio * (size - inset * 2) - inset, y + size - inset];
      }

      if (!start || !end) continue;
      ctx.beginPath();
      ctx.moveTo(start[0], start[1]);
      ctx.lineTo(end[0], end[1]);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawTremie(ctx, options) {
    const { x, y, width, height, type, returnLength, returnWidth } = options;

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 122, 0, 0.92)';
    ctx.fillStyle = 'rgba(255, 122, 0, 0.12)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);

    if (type === 'l') {
      const notchLength = Math.max(24, Math.min(width - 18, returnLength));
      const notchWidth = Math.max(24, Math.min(height - 18, returnWidth));
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + width, y);
      ctx.lineTo(x + width, y + notchWidth);
      ctx.lineTo(x + notchLength, y + notchWidth);
      ctx.lineTo(x + notchLength, y + height);
      ctx.lineTo(x, y + height);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(x, y, width, height);
      ctx.strokeRect(x, y, width, height);
    }

    ctx.setLineDash([]);
    ctx.fillStyle = PLAN_THEME.dim;
    ctx.font = '12px Segoe UI';
    ctx.textAlign = 'center';
    ctx.fillText(type === 'l' ? 'TRÉMIE EN L' : 'TRÉMIE RECTANGLE', x + width / 2, y + height + 18);
    ctx.restore();
  }

  function drawTopView() {
    if (!topViewContext || !topViewCanvas) return;

    const ratio = window.devicePixelRatio || 1;
    const bounds = topViewCanvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(bounds.width * ratio));
    const height = Math.max(1, Math.floor(bounds.height * ratio));
    if (topViewCanvas.width !== width || topViewCanvas.height !== height) {
      topViewCanvas.width = width;
      topViewCanvas.height = height;
    }

    topViewContext.setTransform(1, 0, 0, 1, 0, 0);
    topViewContext.scale(ratio, ratio);

    const drawWidth = bounds.width;
    const drawHeight = bounds.height;
    topViewContext.clearRect(0, 0, drawWidth, drawHeight);

    topViewContext.fillStyle = '#ffffff';
    topViewContext.fillRect(0, 0, drawWidth, drawHeight);
    drawTechnicalGrid(topViewContext, drawWidth, drawHeight);

    const stairType = getSelectedStairType();
    const longueur = getNumericField('longueur', 3200);
    const largeur = getNumericField('largeur', 900);
    const tremie = getNumericField('tremie', 1200);
    const reculement = getNumericField('reculement', 900);
    const tremieType = getTremieType();
    const tremieLongueur = getNumericField('tremieLongueur', tremie);
    const tremieLargeur = getNumericField('tremieLargeur', Math.max(900, Math.round(tremie * 0.72)));
    const tremieLGrandeLongueur = getNumericField('tremieLGrandeLongueur', tremie);
    const tremieLGrandeLargeur = getNumericField('tremieLGrandeLargeur', Math.max(950, Math.round(tremie * 0.78)));
    const tremieLRetourLongueur = getNumericField('tremieLRetourLongueur', Math.max(700, Math.round(tremie * 0.46)));
    const tremieLRetourLargeur = getNumericField('tremieLRetourLargeur', Math.max(700, Math.round(tremie * 0.46)));

    topViewContext.fillStyle = PLAN_THEME.text;
    topViewContext.font = '13px Segoe UI';
    topViewContext.fillText(
      stairType === 'double-quarter' ? 'Escalier deux quarts tournants' : stairType === 'quarter' ? 'Escalier quart tournant' : 'Escalier droit',
      24,
      28
    );

    const title = stairType === 'double-quarter'
      ? 'Escalier deux quarts tournants'
      : stairType === 'quarter'
        ? 'Escalier quart tournant'
        : 'Escalier droit';

    topViewContext.fillStyle = PLAN_THEME.text;
    topViewContext.font = '13px Segoe UI';
    topViewContext.fillText(title, 24, 28);

    let tremieArea = null;
    const stepCount = clamp(Math.round(longueur / 250), 5, 16);
    const flightWidth = clamp(drawHeight * 0.18, 72, 92);

    if (stairType === 'straight') {
      const x = 84;
      const y = (drawHeight / 2) - (flightWidth / 2) + 18;
      const runLength = drawWidth - 168;

      drawFlightRect(topViewContext, x, y, runLength, flightWidth);
      drawRisers(topViewContext, x, y, runLength, flightWidth, stepCount, 'x');
      drawTravelArrow(topViewContext, [
        [x + 20, y + (flightWidth / 2)],
        [x + runLength - 20, y + (flightWidth / 2)]
      ]);

      drawDimensionLine(topViewContext, x, y + flightWidth + 34, x + runLength, y + flightWidth + 34, `Longueur ${longueur} mm`);
      drawVerticalDimensionLine(topViewContext, x - 28, y, y + flightWidth, `Largeur ${largeur} mm`);
      tremieArea = {
        x: x + runLength * 0.58,
        y: y + 12,
        width: Math.min(148, runLength * 0.22),
        height: Math.min(flightWidth - 24, 70)
      };
    } else if (stairType === 'quarter') {
      const x = 88;
      const y = 88;
      const horizontalLength = clamp(drawWidth * 0.5, 240, 300);
      const verticalHeight = clamp(drawHeight * 0.54, 180, 230);
      const turnX = x + horizontalLength - flightWidth;
      const turnY = y + verticalHeight - flightWidth;

      drawFlightRect(topViewContext, x, turnY, horizontalLength, flightWidth);
      drawRisers(topViewContext, x, turnY, horizontalLength - flightWidth, flightWidth, Math.round(stepCount * 0.58), 'x');
      drawFlightRect(topViewContext, turnX, y, flightWidth, verticalHeight);
      drawRisers(topViewContext, turnX, y, flightWidth, verticalHeight - flightWidth, Math.round(stepCount * 0.42), 'y');
      drawTurnWinders(topViewContext, turnX, turnY, flightWidth, 'left-up');
      drawTravelArrow(topViewContext, [
        [x + 24, turnY + (flightWidth / 2)],
        [turnX + (flightWidth / 2), turnY + (flightWidth / 2)],
        [turnX + (flightWidth / 2), y + 24]
      ]);

      drawDimensionLine(topViewContext, x, turnY + flightWidth + 34, x + horizontalLength, turnY + flightWidth + 34, `Longueur ${longueur} mm`);
      drawVerticalDimensionLine(topViewContext, x + horizontalLength + 30, y, y + verticalHeight, `Reculement ${reculement} mm`);
      drawVerticalDimensionLine(topViewContext, x - 26, turnY, turnY + flightWidth, `Largeur ${largeur} mm`);
      tremieArea = {
        x: turnX - 118,
        y: y + 18,
        width: 102,
        height: Math.max(82, verticalHeight - flightWidth - 36)
      };
    } else {
      const x = 102;
      const y = 88;
      const horizontalLength = clamp(drawWidth * 0.48, 236, 290);
      const verticalHeight = clamp(drawHeight * 0.56, 190, 240);
      const turnX = x + horizontalLength - flightWidth;
      const bottomY = y + verticalHeight - flightWidth;

      drawFlightRect(topViewContext, x, y, horizontalLength, flightWidth);
      drawRisers(topViewContext, x, y, horizontalLength - flightWidth, flightWidth, Math.round(stepCount * 0.34), 'x');
      drawFlightRect(topViewContext, turnX, y, flightWidth, verticalHeight);
      drawRisers(topViewContext, turnX, y + flightWidth, flightWidth, verticalHeight - (flightWidth * 2), Math.round(stepCount * 0.32), 'y');
      drawFlightRect(topViewContext, x, bottomY, horizontalLength, flightWidth);
      drawRisers(topViewContext, x, bottomY, horizontalLength - flightWidth, flightWidth, Math.round(stepCount * 0.34), 'x');
      drawTurnWinders(topViewContext, turnX, y, flightWidth, 'down-left');
      drawTurnWinders(topViewContext, turnX, bottomY, flightWidth, 'left-up');
      drawTravelArrow(topViewContext, [
        [x + 24, bottomY + (flightWidth / 2)],
        [turnX + (flightWidth / 2), bottomY + (flightWidth / 2)],
        [turnX + (flightWidth / 2), y + (verticalHeight / 2)],
        [turnX + (flightWidth / 2), y + (flightWidth / 2)],
        [x + 24, y + (flightWidth / 2)]
      ]);

      drawDimensionLine(topViewContext, x, bottomY + flightWidth + 32, x + horizontalLength, bottomY + flightWidth + 32, `Longueur ${longueur} mm`);
      drawVerticalDimensionLine(topViewContext, x + horizontalLength + 30, y, y + verticalHeight, `Reculement ${reculement} mm`);
      drawVerticalDimensionLine(topViewContext, x - 28, y, y + flightWidth, `Largeur ${largeur} mm`);
      tremieArea = {
        x: x + 24,
        y: y + flightWidth + 20,
        width: horizontalLength - flightWidth - 48,
        height: verticalHeight - (flightWidth * 2) - 40
      };
    }

    const tremieDrawWidth = tremieType === 'l' ? Math.min(148, tremieArea.width + 36) : Math.min(148, tremieArea.width + 28);
    const tremieDrawHeight = tremieType === 'l' ? Math.min(140, tremieArea.height + 20) : Math.min(104, tremieArea.height);
    const tremieReturnLengthPx = tremieType === 'l' ? Math.max(36, Math.min(tremieDrawWidth - 24, tremieDrawWidth * (tremieLRetourLongueur / Math.max(tremieLGrandeLongueur, 1)))) : 0;
    const tremieReturnWidthPx = tremieType === 'l' ? Math.max(34, Math.min(tremieDrawHeight - 24, tremieDrawHeight * (tremieLRetourLargeur / Math.max(tremieLGrandeLargeur, 1)))) : 0;

    drawTremie(topViewContext, {
      x: tremieArea.x,
      y: tremieArea.y,
      width: tremieDrawWidth,
      height: tremieDrawHeight,
      type: tremieType,
      returnLength: tremieReturnLengthPx,
      returnWidth: tremieReturnWidthPx
    });

    if (tremieType === 'l') {
      drawDimensionLine(
        topViewContext,
        tremieArea.x,
        tremieArea.y - 16,
        tremieArea.x + tremieDrawWidth,
        tremieArea.y - 16,
        `A ${tremieLGrandeLongueur} mm`
      );
      drawVerticalDimensionLine(
        topViewContext,
        tremieArea.x + tremieDrawWidth + 18,
        tremieArea.y,
        tremieArea.y + tremieDrawHeight,
        `B ${tremieLGrandeLargeur} mm`
      );
      drawDimensionLine(
        topViewContext,
        tremieArea.x,
        tremieArea.y + tremieDrawHeight + 22,
        tremieArea.x + tremieReturnLengthPx,
        tremieArea.y + tremieDrawHeight + 22,
        `C ${tremieLRetourLongueur} mm`
      );
      drawVerticalDimensionLine(
        topViewContext,
        tremieArea.x - 18,
        tremieArea.y + tremieReturnWidthPx,
        tremieArea.y + tremieDrawHeight,
        `D ${tremieLRetourLargeur} mm`
      );
      drawMarker(topViewContext, tremieArea.x + tremieDrawWidth / 2, tremieArea.y - 34, 'A');
      drawMarker(topViewContext, tremieArea.x + tremieDrawWidth + 34, tremieArea.y + tremieDrawHeight / 2, 'B');
      drawMarker(topViewContext, tremieArea.x + tremieReturnLengthPx / 2, tremieArea.y + tremieDrawHeight + 38, 'C');
      drawMarker(topViewContext, tremieArea.x - 34, tremieArea.y + tremieReturnWidthPx + (tremieDrawHeight - tremieReturnWidthPx) / 2, 'D');
    } else {
      drawDimensionLine(
        topViewContext,
        tremieArea.x,
        tremieArea.y - 16,
        tremieArea.x + tremieDrawWidth,
        tremieArea.y - 16,
        `A ${tremieLongueur} mm`
      );
      drawVerticalDimensionLine(
        topViewContext,
        tremieArea.x + tremieDrawWidth + 18,
        tremieArea.y,
        tremieArea.y + tremieDrawHeight,
        `B ${tremieLargeur} mm`
      );
      drawMarker(topViewContext, tremieArea.x + tremieDrawWidth / 2, tremieArea.y - 34, 'A');
      drawMarker(topViewContext, tremieArea.x + tremieDrawWidth + 34, tremieArea.y + tremieDrawHeight / 2, 'B');
    }
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
      recordName: recordNameField.value.trim(),
      fields,
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
    setCheckboxValues('typeEscalier', record.typeEscalier);
    setCheckboxValues('structure', record.structure);
    setCheckboxValues('finitions', record.finitions);
    setCheckboxValues('pose', record.pose);
    form.elements.observations.value = record.observations || '';
    photos = Array.isArray(record.photos) ? record.photos.slice() : [];
    renderPhotos();
    syncTremieGroups();
    drawTopView();
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

  function saveRecord() {
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
    drawTopView();
    currentRecordName = '';
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

  form.querySelectorAll('input[name="typeEscalier"], input[name="longueur"], input[name="largeur"], input[name="tremie"], input[name="reculement"], input[name="tremieLongueur"], input[name="tremieLargeur"], input[name="tremieLGrandeLongueur"], input[name="tremieLGrandeLargeur"], input[name="tremieLRetourLongueur"], input[name="tremieLRetourLargeur"], select[name="tremieType"]').forEach((input) => {
    input.addEventListener('input', drawTopView);
    input.addEventListener('change', drawTopView);
  });

  const tremieTypeControl = form.elements.tremieType;
  if (tremieTypeControl) {
    tremieTypeControl.addEventListener('change', () => {
      syncTremieGroups();
      drawTopView();
    });
  }

  window.addEventListener('resize', () => {
    drawTopView();
  });

  setDefaultValues();
  syncTremieGroups();
  drawTopView();
  saveStatus.textContent = getStoredRecords().length
    ? 'Des fiches locales sont disponibles'
    : 'Aucune sauvegarde chargée';
})();
