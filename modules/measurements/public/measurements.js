const STORAGE_KEY = 'outil-pme.escalier.measurements';
const PLAN_THEME = {
  dim: '#ff7a00',
  line: '#222222',
  fill: '#f4f4f4',
  fillAlt: '#ececec',
  step: 'rgba(34, 34, 34, 0.35)',
  grid: 'rgba(0, 0, 0, 0.08)',
  text: '#666666',
  floor: '#111111',
  slab: '#d7dce0',
  active: '#ff7a00',
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
  const sideViewCanvas = document.getElementById('sideViewCanvas');
  const sideViewContext = sideViewCanvas ? sideViewCanvas.getContext('2d') : null;
  const topViewCanvas = document.getElementById('topViewCanvas');
  const topViewContext = topViewCanvas ? topViewCanvas.getContext('2d') : null;
  const tremieGroups = Array.from(document.querySelectorAll('[data-tremie-group]'));

  let photos = [];
  let currentRecordName = '';
  let currentServerId = null;
  let activeMeasure = '';

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

  function prepareCanvas(canvas, ctx) {
    if (!ctx || !canvas) return null;

    const ratio = window.devicePixelRatio || 1;
    const bounds = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(bounds.width * ratio));
    const height = Math.max(1, Math.floor(bounds.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(ratio, ratio);
    ctx.clearRect(0, 0, bounds.width, bounds.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, bounds.width, bounds.height);
    drawTechnicalGrid(ctx, bounds.width, bounds.height);
    return { width: bounds.width, height: bounds.height };
  }

  function isActive(keys) {
    return [].concat(keys || []).includes(activeMeasure);
  }

  function drawRoundRect(ctx, x, y, width, height, radius) {
    const safeRadius = Math.min(radius, width / 2, height / 2);
    ctx.moveTo(x + safeRadius, y);
    ctx.lineTo(x + width - safeRadius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
    ctx.lineTo(x + width, y + height - safeRadius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
    ctx.lineTo(x + safeRadius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
    ctx.lineTo(x, y + safeRadius);
    ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  }

  function drawTextBox(ctx, text, x, y, options = {}) {
    const font = options.font || '12px Segoe UI';
    ctx.save();
    ctx.font = font;
    const paddingX = 7;
    const paddingY = 4;
    const width = ctx.measureText(text).width + paddingX * 2;
    const height = 20;
    const left = clamp(x - width / 2, 8, options.maxWidth ? options.maxWidth - width - 8 : x - width / 2);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = options.active ? PLAN_THEME.active : 'rgba(17, 24, 39, 0.25)';
    ctx.lineWidth = options.active ? 1.8 : 1;
    ctx.beginPath();
    drawRoundRect(ctx, left, y - height / 2, width, height, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = options.active ? PLAN_THEME.active : PLAN_THEME.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, left + width / 2, y + paddingY - 3);
    ctx.restore();
  }

  function drawDimH(ctx, x1, y, x2, label, key, maxWidth) {
    const active = isActive(key);
    ctx.save();
    ctx.strokeStyle = active ? PLAN_THEME.active : PLAN_THEME.dim;
    ctx.fillStyle = active ? PLAN_THEME.active : PLAN_THEME.dim;
    ctx.lineWidth = active ? 2.4 : 1.5;
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.moveTo(x1, y - 6);
    ctx.lineTo(x1, y + 6);
    ctx.moveTo(x2, y - 6);
    ctx.lineTo(x2, y + 6);
    ctx.stroke();
    const arrow = 6;
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x1 + arrow, y - arrow);
    ctx.moveTo(x1, y);
    ctx.lineTo(x1 + arrow, y + arrow);
    ctx.moveTo(x2, y);
    ctx.lineTo(x2 - arrow, y - arrow);
    ctx.moveTo(x2, y);
    ctx.lineTo(x2 - arrow, y + arrow);
    ctx.stroke();
    drawTextBox(ctx, label, (x1 + x2) / 2, y - 16, { active, maxWidth });
    ctx.restore();
  }

  function drawDimV(ctx, x, y1, y2, label, key, maxWidth) {
    const active = isActive(key);
    ctx.save();
    ctx.strokeStyle = active ? PLAN_THEME.active : PLAN_THEME.dim;
    ctx.fillStyle = active ? PLAN_THEME.active : PLAN_THEME.dim;
    ctx.lineWidth = active ? 2.4 : 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y1);
    ctx.lineTo(x, y2);
    ctx.moveTo(x - 6, y1);
    ctx.lineTo(x + 6, y1);
    ctx.moveTo(x - 6, y2);
    ctx.lineTo(x + 6, y2);
    ctx.stroke();
    ctx.save();
    ctx.translate(x - 20, (y1 + y2) / 2);
    ctx.rotate(-Math.PI / 2);
    drawTextBox(ctx, label, 0, 0, { active, maxWidth });
    ctx.restore();
    ctx.restore();
  }

  function getPlanValues() {
    const hauteur = getNumericField('hauteur', 2800);
    const longueur = getNumericField('longueur', 3200);
    const largeur = getNumericField('largeur', 900);
    const tremie = getNumericField('tremie', 1200);
    const reculement = getNumericField('reculement', longueur);
    const echappee = getNumericField('echappee', 2000);
    const marchesNombre = getNumericField('marchesNombre', Math.max(10, Math.round(hauteur / 175)));
    const giron = Math.round(longueur / Math.max(1, marchesNombre));
    const hauteurMarche = Math.round(hauteur / Math.max(1, marchesNombre));
    return {
      stairType: getSelectedStairType(),
      tremieType: getTremieType(),
      hauteur,
      longueur,
      largeur,
      tremie,
      reculement,
      echappee,
      marchesNombre: clamp(Math.round(marchesNombre), 3, 22),
      giron,
      hauteurMarche,
      tremieLongueur: getNumericField('tremieLongueur', tremie),
      tremieLargeur: getNumericField('tremieLargeur', Math.max(900, Math.round(tremie * 0.72))),
      tremieLGrandeLongueur: getNumericField('tremieLGrandeLongueur', tremie),
      tremieLGrandeLargeur: getNumericField('tremieLGrandeLargeur', Math.max(950, Math.round(tremie * 0.78))),
      tremieLRetourLongueur: getNumericField('tremieLRetourLongueur', Math.max(700, Math.round(tremie * 0.46))),
      tremieLRetourLargeur: getNumericField('tremieLRetourLargeur', Math.max(700, Math.round(tremie * 0.46)))
    };
  }

  function drawSideView(values) {
    const prepared = prepareCanvas(sideViewCanvas, sideViewContext);
    if (!prepared) return;
    const ctx = sideViewContext;
    const { width, height } = prepared;
    const left = 72;
    const right = width - 52;
    const top = 76;
    const bottom = height - 72;
    const run = Math.max(160, right - left - 20);

    ctx.save();
    ctx.font = '12px Segoe UI';
    ctx.strokeStyle = PLAN_THEME.floor;
    ctx.fillStyle = PLAN_THEME.floor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(left - 34, bottom);
    ctx.lineTo(right + 20, bottom);
    ctx.stroke();
    ctx.fillText('Sol bas / départ', left - 26, bottom + 22);

    ctx.fillStyle = PLAN_THEME.slab;
    ctx.fillRect(right - 92, top - 10, 120, 18);
    ctx.strokeStyle = PLAN_THEME.floor;
    ctx.strokeRect(right - 92, top - 10, 120, 18);
    ctx.fillStyle = PLAN_THEME.text;
    ctx.fillText('Sol haut / arrivée', right - 92, top - 18);

    ctx.strokeStyle = PLAN_THEME.line;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(left, bottom);
    const steps = values.marchesNombre;
    for (let i = 1; i <= steps; i += 1) {
      const x = left + (run / steps) * i;
      const y = bottom - ((bottom - top) / steps) * i;
      const prevY = bottom - ((bottom - top) / steps) * (i - 1);
      ctx.lineTo(x, prevY);
      ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(17, 24, 39, 0.55)';
    ctx.setLineDash([9, 6]);
    ctx.beginPath();
    ctx.moveTo(left, bottom);
    ctx.lineTo(left + run, top);
    ctx.stroke();
    ctx.setLineDash([]);

    drawTravelArrow(ctx, [[left + 24, bottom - 18], [left + run - 36, top + 18]]);
    drawTextBox(ctx, 'Sens de montée', left + run * 0.58, top + 44, { maxWidth: width });

    drawDimV(ctx, left - 26, top, bottom, `Hauteur ${values.hauteur} mm`, 'hauteur', width);
    drawDimH(ctx, left, bottom + 34, left + run, `Reculement ${values.reculement} mm`, 'reculement', width);
    drawDimH(ctx, left, bottom + 58, left + run, `Longueur ${values.longueur} mm`, 'longueur', width);
    drawDimV(ctx, right - 126, top, top + (bottom - top) * 0.38, `Échappée ${values.echappee} mm`, 'echappee', width);

    drawTextBox(ctx, `${values.marchesNombre} marches`, left + run * 0.32, bottom - 96, { active: isActive('marchesNombre'), maxWidth: width });
    drawTextBox(ctx, `H marche ${values.hauteurMarche} mm`, left + run * 0.32, bottom - 70, { active: isActive(['hauteur', 'marchesNombre']), maxWidth: width });
    drawTextBox(ctx, `Giron env. ${values.giron} mm`, left + run * 0.66, bottom - 52, { active: isActive(['longueur', 'marchesNombre']), maxWidth: width });
    ctx.restore();
  }

  function drawTopPlan(values) {
    const prepared = prepareCanvas(topViewCanvas, topViewContext);
    if (!prepared) return;
    const ctx = topViewContext;
    const { width, height } = prepared;
    const flightWidth = clamp(height * 0.17, 58, 82);
    const title = values.stairType === 'double-quarter'
      ? 'Vue dessus - deux quarts tournants'
      : values.stairType === 'quarter'
        ? 'Vue dessus - quart tournant'
        : 'Vue dessus - droit';

    ctx.save();
    ctx.fillStyle = PLAN_THEME.text;
    ctx.font = '600 13px Segoe UI';
    ctx.fillText(title, 18, 26);

    const x = 76;
    const y = height * 0.5 - flightWidth / 2;
    const runLength = width - 152;
    let tremieArea = null;

    if (values.stairType === 'straight') {
      drawFlightRect(ctx, x, y, runLength, flightWidth);
      drawRisers(ctx, x, y, runLength, flightWidth, values.marchesNombre, 'x');
      drawTravelArrow(ctx, [[x + 22, y + flightWidth / 2], [x + runLength - 24, y + flightWidth / 2]]);
      drawTextBox(ctx, 'Départ', x + 28, y - 18, { maxWidth: width });
      drawTextBox(ctx, 'Arrivée', x + runLength - 28, y - 18, { maxWidth: width });
      drawDimH(ctx, x, y + flightWidth + 34, x + runLength, `Longueur ${values.longueur} mm`, 'longueur', width);
      drawDimV(ctx, x - 28, y, y + flightWidth, `Largeur ${values.largeur} mm`, 'largeur', width);
      tremieArea = { x: x + runLength * 0.58, y: y + 10, width: runLength * 0.25, height: flightWidth - 20 };
    } else if (values.stairType === 'quarter') {
      const horizontal = clamp(width * 0.52, 230, 360);
      const vertical = clamp(height * 0.55, 180, 250);
      const turnX = x + horizontal - flightWidth;
      const turnY = height - 88 - flightWidth;
      const startY = turnY;
      const topY = turnY - vertical + flightWidth;
      drawFlightRect(ctx, x, startY, horizontal, flightWidth);
      drawFlightRect(ctx, turnX, topY, flightWidth, vertical);
      drawTurnWinders(ctx, turnX, startY, flightWidth, 'left-up');
      drawRisers(ctx, x, startY, horizontal - flightWidth, flightWidth, Math.ceil(values.marchesNombre * 0.58), 'x');
      drawRisers(ctx, turnX, topY, flightWidth, vertical - flightWidth, Math.ceil(values.marchesNombre * 0.42), 'y');
      drawTravelArrow(ctx, [[x + 22, startY + flightWidth / 2], [turnX + flightWidth / 2, startY + flightWidth / 2], [turnX + flightWidth / 2, topY + 24]]);
      drawTextBox(ctx, 'Départ', x + 30, startY - 18, { maxWidth: width });
      drawTextBox(ctx, 'Arrivée', turnX + flightWidth + 36, topY + 20, { maxWidth: width });
      drawDimH(ctx, x, startY + flightWidth + 32, x + horizontal, `Longueur ${values.longueur} mm`, 'longueur', width);
      drawDimV(ctx, x + horizontal + 30, topY, startY + flightWidth, `Reculement ${values.reculement} mm`, 'reculement', width);
      drawDimV(ctx, x - 28, startY, startY + flightWidth, `Largeur ${values.largeur} mm`, 'largeur', width);
      tremieArea = { x: turnX - 118, y: topY + 18, width: 112, height: Math.max(74, vertical - flightWidth - 40) };
    } else {
      const horizontal = clamp(width * 0.48, 220, 330);
      const vertical = clamp(height * 0.58, 190, 260);
      const turnX = x + horizontal - flightWidth;
      const topY = 74;
      const bottomY = topY + vertical - flightWidth;
      drawFlightRect(ctx, x, topY, horizontal, flightWidth);
      drawFlightRect(ctx, turnX, topY, flightWidth, vertical);
      drawFlightRect(ctx, x, bottomY, horizontal, flightWidth);
      drawTurnWinders(ctx, turnX, topY, flightWidth, 'down-left');
      drawTurnWinders(ctx, turnX, bottomY, flightWidth, 'left-up');
      drawRisers(ctx, x, topY, horizontal - flightWidth, flightWidth, Math.ceil(values.marchesNombre * 0.34), 'x');
      drawRisers(ctx, turnX, topY + flightWidth, flightWidth, vertical - flightWidth * 2, Math.ceil(values.marchesNombre * 0.32), 'y');
      drawRisers(ctx, x, bottomY, horizontal - flightWidth, flightWidth, Math.ceil(values.marchesNombre * 0.34), 'x');
      drawTravelArrow(ctx, [[x + 22, bottomY + flightWidth / 2], [turnX + flightWidth / 2, bottomY + flightWidth / 2], [turnX + flightWidth / 2, topY + flightWidth / 2], [x + 24, topY + flightWidth / 2]]);
      drawTextBox(ctx, 'Départ', x + 30, bottomY - 18, { maxWidth: width });
      drawTextBox(ctx, 'Arrivée', x + 30, topY - 18, { maxWidth: width });
      drawDimH(ctx, x, bottomY + flightWidth + 32, x + horizontal, `Longueur ${values.longueur} mm`, 'longueur', width);
      drawDimV(ctx, x + horizontal + 30, topY, bottomY + flightWidth, `Reculement ${values.reculement} mm`, 'reculement', width);
      drawDimV(ctx, x - 28, topY, topY + flightWidth, `Largeur ${values.largeur} mm`, 'largeur', width);
      tremieArea = { x: x + 28, y: topY + flightWidth + 18, width: horizontal - flightWidth - 56, height: vertical - flightWidth * 2 - 36 };
    }

    const tremieDrawWidth = values.tremieType === 'l' ? Math.min(160, tremieArea.width + 38) : Math.min(160, tremieArea.width + 30);
    const tremieDrawHeight = values.tremieType === 'l' ? Math.min(132, tremieArea.height + 22) : Math.min(100, tremieArea.height);
    const returnLength = values.tremieType === 'l' ? Math.max(36, Math.min(tremieDrawWidth - 24, tremieDrawWidth * (values.tremieLRetourLongueur / Math.max(values.tremieLGrandeLongueur, 1)))) : 0;
    const returnWidth = values.tremieType === 'l' ? Math.max(34, Math.min(tremieDrawHeight - 24, tremieDrawHeight * (values.tremieLRetourLargeur / Math.max(values.tremieLGrandeLargeur, 1)))) : 0;

    drawTremie(ctx, {
      x: tremieArea.x,
      y: tremieArea.y,
      width: tremieDrawWidth,
      height: tremieDrawHeight,
      type: values.tremieType,
      returnLength,
      returnWidth
    });

    if (values.tremieType === 'l') {
      drawDimH(ctx, tremieArea.x, tremieArea.y - 18, tremieArea.x + tremieDrawWidth, `A ${values.tremieLGrandeLongueur} mm`, 'tremieLGrandeLongueur', width);
      drawDimV(ctx, tremieArea.x + tremieDrawWidth + 20, tremieArea.y, tremieArea.y + tremieDrawHeight, `B ${values.tremieLGrandeLargeur} mm`, 'tremieLGrandeLargeur', width);
      drawDimH(ctx, tremieArea.x, tremieArea.y + tremieDrawHeight + 24, tremieArea.x + returnLength, `C ${values.tremieLRetourLongueur} mm`, 'tremieLRetourLongueur', width);
      drawDimV(ctx, tremieArea.x - 20, tremieArea.y + returnWidth, tremieArea.y + tremieDrawHeight, `D ${values.tremieLRetourLargeur} mm`, 'tremieLRetourLargeur', width);
    } else {
      drawDimH(ctx, tremieArea.x, tremieArea.y - 18, tremieArea.x + tremieDrawWidth, `A ${values.tremieLongueur} mm`, 'tremieLongueur', width);
      drawDimV(ctx, tremieArea.x + tremieDrawWidth + 20, tremieArea.y, tremieArea.y + tremieDrawHeight, `B ${values.tremieLargeur} mm`, 'tremieLargeur', width);
    }
    ctx.restore();
  }

  function drawPlans() {
    const values = getPlanValues();
    drawSideView(values);
    drawTopPlan(values);
  }

  function drawTopView() {
    drawPlans();
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
    drawTopView();
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
      drawTopView();
    };
    input.addEventListener('focus', updateActivePlan);
    input.addEventListener('input', updateActivePlan);
    input.addEventListener('change', updateActivePlan);
    input.addEventListener('blur', () => {
      window.setTimeout(() => {
        if (!form.contains(document.activeElement) || !planFieldNames.includes(document.activeElement.name)) {
          activeMeasure = '';
          drawTopView();
        }
      }, 80);
    });
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
  initServerLinks();
  syncTremieGroups();
  drawTopView();
  saveStatus.textContent = getStoredRecords().length
    ? 'Des fiches locales sont disponibles'
    : 'Aucune sauvegarde chargée';
})();
