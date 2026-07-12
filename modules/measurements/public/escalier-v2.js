(function () {
  const MODULE_NAME = 'Escalier V2';
  const PHOTO_CATEGORIES = [
    'Vue generale',
    'Depart',
    'Arrivee',
    'Tremie',
    'Dessous',
    'Mur gauche',
    'Mur droit',
    'Details',
    'Autres',
  ];

  const form = document.getElementById('form');
  const listView = document.getElementById('listView');
  const formView = document.getElementById('formView');
  const tabList = document.getElementById('tabList');
  const newBtn = document.getElementById('newBtn');
  const saveBtn = document.getElementById('saveBtn');
  const saveBtnBottom = document.getElementById('saveBtnBottom');
  const backToListBtn = document.getElementById('backToListBtn');
  const cards = document.getElementById('cards');
  const saveIndicator = document.getElementById('saveIndicator');
  const photoSlotsRoot = document.getElementById('photoSlots');
  const photoTotalCount = document.getElementById('photoTotalCount');
  const photoViewer = document.getElementById('photoViewer');
  const photoViewerImg = document.getElementById('photoViewerImg');
  const photoViewerCaption = document.getElementById('photoViewerCaption');
  const photoViewerClose = document.getElementById('photoViewerClose');
  const openSketchBtn = document.getElementById('openSketchBtn');
  const sketchStatusInline = document.getElementById('sketchStatusInline');
  const sketchModal = document.getElementById('sketchModal');
  const sketchModalContent = sketchModal ? sketchModal.querySelector('.sketch-modal-content') : null;
  const sketchCloseBtn = document.getElementById('sketchCloseBtn');
  const sketchSaveBtn = document.getElementById('sketchSaveBtn');
  const sketchStatus = document.getElementById('sketchStatus');
  const sketchCanvas = document.getElementById('sketchCanvas');
  const toolPenBtn = document.getElementById('toolPenBtn');
  const toolEraserBtn = document.getElementById('toolEraserBtn');
  const undoSketchBtn = document.getElementById('undoSketchBtn');
  const redoSketchBtn = document.getElementById('redoSketchBtn');
  const clearSketchBtn = document.getElementById('clearSketchBtn');
  const sketchToolbarToggle = document.getElementById('sketchToolbarToggle');
  const sketchColorPalette = document.getElementById('sketchColorPalette');
  const sketchSizePalette = document.getElementById('sketchSizePalette');
  const useSketchPhotoBtn = document.getElementById('useSketchPhotoBtn');
  const removeSketchPhotoBtn = document.getElementById('removeSketchPhotoBtn');
  const sketchBgLabel = document.getElementById('sketchBgLabel');
  const sketchPhotoPicker = document.getElementById('sketchPhotoPicker');
  const sketchPhotoPickerBackdrop = document.getElementById('sketchPhotoPickerBackdrop');
  const sketchPhotoPickerList = document.getElementById('sketchPhotoPickerList');
  const closeSketchPhotoPickerBtn = document.getElementById('closeSketchPhotoPickerBtn');
  const sketchToolButtons = Array.from(document.querySelectorAll('[data-sketch-tool]'));
  const openSketchSymbolBtn = document.getElementById('openSketchSymbolBtn');
  const sketchSymbolPicker = document.getElementById('sketchSymbolPicker');
  const sketchSymbolPickerBackdrop = document.getElementById('sketchSymbolPickerBackdrop');
  const sketchSymbolPickerList = document.getElementById('sketchSymbolPickerList');
  const closeSketchSymbolPickerBtn = document.getElementById('closeSketchSymbolPickerBtn');
  const sketchSymbolControls = document.getElementById('sketchSymbolControls');
  const sketchSymbolSmallerBtn = document.getElementById('sketchSymbolSmallerBtn');
  const sketchSymbolLargerBtn = document.getElementById('sketchSymbolLargerBtn');
  const sketchSymbolDeleteBtn = document.getElementById('sketchSymbolDeleteBtn');
  const sketchTextDialog = document.getElementById('sketchTextDialog');
  const sketchTextDialogTitle = document.getElementById('sketchTextDialogTitle');
  const sketchTextInput = document.getElementById('sketchTextInput');
  const sketchTextCancelBtn = document.getElementById('sketchTextCancelBtn');
  const sketchTextConfirmBtn = document.getElementById('sketchTextConfirmBtn');
  const measurementsV2Progress = document.getElementById('measurementsV2Progress');
  const measurementsV2Schema = document.getElementById('measurementsV2Schema');
  const measurementsV2Fields = document.getElementById('measurementsV2Fields');
  const measurementsV2Checks = document.getElementById('measurementsV2Checks');

  const ANNOTATION_TOOLS = new Set(['line', 'arrow', 'rect', 'ellipse', 'text', 'marker', 'dimension', 'symbol']);
  const SYMBOL_LIBRARY = [
    { key: 'prise_electrique', label: 'Prise électrique', icon: 'P' },
    { key: 'interrupteur', label: 'Interrupteur', icon: 'I' },
    { key: 'radiateur', label: 'Radiateur', icon: 'R' },
    { key: 'poutre', label: 'Poutre', icon: '━' },
    { key: 'ipn', label: 'IPN', icon: 'H' },
    { key: 'poteau', label: 'Poteau', icon: '●' },
    { key: 'fenetre', label: 'Fenêtre', icon: '▦' },
    { key: 'porte', label: 'Porte', icon: '⌜' },
    { key: 'mur_beton', label: 'Mur béton', icon: '▤' },
    { key: 'mur_pierre', label: 'Mur pierre', icon: '▥' },
    { key: 'cloison', label: 'Cloison', icon: '│' },
    { key: 'niveau', label: 'Niveau', icon: '⌁' },
    { key: 'sens_montee', label: 'Sens de montée', icon: '↗' },
    { key: 'depart', label: 'Départ', icon: 'D' },
    { key: 'arrivee', label: 'Arrivée', icon: 'A' },
    { key: 'obstacle', label: 'Obstacle', icon: '!' },
    { key: 'gaine_technique', label: 'Gaine technique', icon: 'G' },
    { key: 'tremie', label: 'Trémie', icon: '□' },
    { key: 'dalle', label: 'Dalle', icon: '▭' },
    { key: 'point_fixation', label: 'Point de fixation', icon: '⊕' },
  ];
  const MEASURE_BASE_VALUES = {
    totalHeight: '',
    totalRun: '',
    stairWidth: '',
    openingLength: '',
    openingWidth: '',
    headroom: '',
  };
  const MEASURE_FIELD_DEFS = {
    totalHeight: { label: 'Hauteur sol a sol', unit: 'mm', kind: 'number' },
    totalRun: { label: 'Reculement / longueur disponible', unit: 'mm', kind: 'number' },
    stairWidth: { label: 'Largeur escalier', unit: 'mm', kind: 'number' },
    openingLength: { label: 'Longueur tremie', unit: 'mm', kind: 'number' },
    openingWidth: { label: 'Largeur tremie', unit: 'mm', kind: 'number' },
    headroom: { label: 'Echappee', unit: 'mm', kind: 'number' },
    lowerRun: { label: 'Volée basse', unit: 'mm', kind: 'number' },
    upperRun: { label: 'Volée haute', unit: 'mm', kind: 'number' },
    landingLength: { label: 'Longueur palier', unit: 'mm', kind: 'number' },
    diameter: { label: 'Diametre / emprise', unit: 'mm', kind: 'number' },
    turnSide: {
      label: 'Sens du tournant',
      kind: 'select',
      options: ['Droite', 'Gauche'],
    },
    rotationDirection: {
      label: 'Sens de rotation',
      kind: 'select',
      options: ['Droite', 'Gauche'],
    },
    notes: { label: 'Notes de mesure', kind: 'textarea' },
  };
  const MEASURE_TYPE_CONFIG = {
    straight: {
      label: 'Droit',
      required: ['totalHeight', 'totalRun', 'stairWidth', 'openingLength', 'openingWidth'],
      optional: ['headroom', 'notes'],
    },
    quarter_low: {
      label: '1/4 tournant bas',
      required: ['totalHeight', 'lowerRun', 'upperRun', 'stairWidth', 'openingLength', 'openingWidth', 'turnSide'],
      optional: ['headroom', 'notes'],
    },
    quarter_high: {
      label: '1/4 tournant haut',
      required: ['totalHeight', 'lowerRun', 'upperRun', 'stairWidth', 'openingLength', 'openingWidth', 'turnSide'],
      optional: ['headroom', 'notes'],
    },
    double_quarter: {
      label: 'Double 1/4 tournant',
      required: ['totalHeight', 'lowerRun', 'upperRun', 'stairWidth', 'openingLength', 'openingWidth', 'turnSide'],
      optional: ['headroom', 'notes'],
    },
    landing_two_flights: {
      label: '2 volees avec palier',
      required: ['totalHeight', 'lowerRun', 'upperRun', 'landingLength', 'stairWidth', 'openingLength', 'openingWidth'],
      optional: ['headroom', 'notes'],
    },
    helical: {
      label: 'Helicoidal',
      required: ['totalHeight', 'diameter', 'stairWidth', 'openingLength', 'openingWidth', 'rotationDirection'],
      optional: ['headroom', 'notes'],
    },
    other: {
      label: 'Autre',
      required: ['totalHeight', 'stairWidth'],
      optional: ['totalRun', 'openingLength', 'openingWidth', 'headroom', 'notes'],
    },
  };

  const params = new URLSearchParams(window.location.search);
  const initialOrderId = normalizeId(params.get('client_order_id'));
  const initialDraftId = normalizeId(params.get('id'));

  let currentId = null;
  let dirty = false;
  let linkOptionsLoaded = false;
  let orderLock = initialOrderId;
  let photoSlots = makeEmptyPhotoSlots();
  let sketchUpdatedAt = '';
  let sketchCtx = null;
  let sketchInkCanvas = null;
  let sketchInkCtx = null;
  let sketchDrawing = false;
  let sketchTool = 'pen';
  let sketchColor = '#111827';
  let sketchSize = 2;
  let sketchHistory = [];
  let sketchHistoryIndex = -1;
  let sketchLoadingState = false;
  let sketchBackgroundPhotoId = '';
  let sketchBackgroundUrl = '';
  let sketchBackgroundImage = null;
  let sketchAnnotations = [];
  let sketchDraftAnnotation = null;
  let sketchMarkerCounter = 0;
  let sketchTextRequest = null;
  let sketchSelectedAnnotationIndex = -1;
  let sketchMoveState = null;
  let measurementsV2State = null;

  function normalizeId(value) {
    const num = Number(value || 0);
    return Number.isInteger(num) && num > 0 ? num : null;
  }

  function setIndicator(state, text) {
    saveIndicator.dataset.state = state;
    saveIndicator.textContent = text;
  }

  function setTodayIfEmpty() {
    const dateField = form.elements.date;
    if (dateField && !dateField.value) dateField.value = new Date().toISOString().slice(0, 10);
  }

  function getValue(name) {
    return String(form.elements[name] ? form.elements[name].value : '').trim();
  }

  function normalizeStairTypeKey(value) {
    const text = String(value || '').toLowerCase();
    if (text.includes('helico')) return 'helical';
    if (text.includes('palier')) return 'landing_two_flights';
    if (text.includes('double')) return 'double_quarter';
    if (text.includes('1/4') && text.includes('haut')) return 'quarter_high';
    if (text.includes('1/4') && text.includes('bas')) return 'quarter_low';
    if (text.includes('autre')) return 'other';
    return 'straight';
  }

  function createMeasurementsV2State(stairType, values) {
    return {
      schemaVersion: 1,
      stairType: stairType || 'straight',
      values: {
        ...MEASURE_BASE_VALUES,
        ...(values && typeof values === 'object' ? values : {}),
      },
      completedKeys: [],
      requiredCompleted: 0,
      requiredTotal: 0,
      optionalCompleted: 0,
      optionalTotal: 0,
      warnings: [],
      updatedAt: '',
    };
  }

  function normalizeMeasurementsV2(value, fallbackStairType) {
    const fallback = normalizeStairTypeKey(fallbackStairType);
    if (!value || typeof value !== 'object') return createMeasurementsV2State(fallback);
    const stairType = MEASURE_TYPE_CONFIG[value.stairType] ? value.stairType : fallback;
    const safeValues = { ...MEASURE_BASE_VALUES };
    if (value.values && typeof value.values === 'object') {
      Object.keys(value.values).forEach((key) => {
        safeValues[key] = value.values[key] == null ? '' : String(value.values[key]);
      });
    }
    return {
      ...createMeasurementsV2State(stairType, safeValues),
      updatedAt: value.updatedAt ? String(value.updatedAt) : '',
    };
  }

  function measurementConfig() {
    const state = measurementsV2State || createMeasurementsV2State('straight');
    return MEASURE_TYPE_CONFIG[state.stairType] || MEASURE_TYPE_CONFIG.straight;
  }

  function measureValue(key) {
    return String((measurementsV2State && measurementsV2State.values && measurementsV2State.values[key]) || '').trim();
  }

  function measureNumber(key) {
    const normalized = measureValue(key).replace(',', '.');
    const number = Number(normalized);
    return Number.isFinite(number) ? number : null;
  }

  function analyzeMeasurementsV2() {
    if (!measurementsV2State) {
      measurementsV2State = createMeasurementsV2State(normalizeStairTypeKey(getValue('type_escalier')));
    }
    const config = measurementConfig();
    const required = config.required || [];
    const optional = config.optional || [];
    const completedKeys = [...required, ...optional].filter((key) => measureValue(key));
    const warnings = [];

    required.forEach((key) => {
      if (!measureValue(key)) warnings.push(`${MEASURE_FIELD_DEFS[key]?.label || key} manquant.`);
    });

    [...required, ...optional].forEach((key) => {
      const def = MEASURE_FIELD_DEFS[key];
      if (!def || def.kind !== 'number' || !measureValue(key)) return;
      const number = measureNumber(key);
      if (!number || number <= 0) warnings.push(`${def.label} doit etre superieur a 0.`);
    });

    const stairWidth = measureNumber('stairWidth');
    const openingWidth = measureNumber('openingWidth');
    const headroom = measureNumber('headroom');
    if (stairWidth && openingWidth && openingWidth < stairWidth) {
      warnings.push('La largeur de tremie est inferieure a la largeur escalier.');
    }
    if (headroom && headroom < 1900) {
      warnings.push('Echappee inferieure a 1900 mm : a verifier sur chantier.');
    }

    measurementsV2State.completedKeys = completedKeys;
    measurementsV2State.requiredCompleted = required.filter((key) => measureValue(key)).length;
    measurementsV2State.requiredTotal = required.length;
    measurementsV2State.optionalCompleted = optional.filter((key) => measureValue(key)).length;
    measurementsV2State.optionalTotal = optional.length;
    measurementsV2State.warnings = warnings;
    return measurementsV2State;
  }

  function renderMeasurementsV2Schema() {
    if (!measurementsV2Schema) return;
    const config = measurementConfig();
    const type = measurementsV2State ? measurementsV2State.stairType : 'straight';
    const shapeByType = {
      straight: '<path d="M78 128H292V176H78Z" /><g><line x1="108" y1="128" x2="108" y2="176" /><line x1="138" y1="128" x2="138" y2="176" /><line x1="168" y1="128" x2="168" y2="176" /><line x1="198" y1="128" x2="198" y2="176" /><line x1="228" y1="128" x2="228" y2="176" /><line x1="258" y1="128" x2="258" y2="176" /></g>',
      quarter_low: '<path d="M78 150H178V72H228V200H78Z" /><g><line x1="108" y1="150" x2="108" y2="200" /><line x1="138" y1="150" x2="138" y2="200" /><line x1="178" y1="150" x2="228" y2="122" /><line x1="178" y1="122" x2="228" y2="98" /><line x1="178" y1="96" x2="228" y2="96" /></g>',
      quarter_high: '<path d="M78 72H228V122H128V200H78Z" /><g><line x1="108" y1="72" x2="108" y2="122" /><line x1="138" y1="72" x2="138" y2="122" /><line x1="168" y1="72" x2="128" y2="122" /><line x1="128" y1="122" x2="78" y2="150" /><line x1="128" y1="150" x2="78" y2="176" /></g>',
      double_quarter: '<path d="M78 162H158V82H248V132H208V212H78Z" /><g><line x1="108" y1="162" x2="108" y2="212" /><line x1="138" y1="162" x2="138" y2="212" /><line x1="158" y1="162" x2="208" y2="132" /><line x1="158" y1="112" x2="248" y2="112" /><line x1="208" y1="132" x2="208" y2="212" /></g>',
      landing_two_flights: '<path d="M76 150H162V112H232V70H282V162H76Z" /><g><line x1="104" y1="150" x2="104" y2="162" /><line x1="132" y1="150" x2="132" y2="162" /><line x1="162" y1="112" x2="232" y2="112" /><line x1="232" y1="92" x2="282" y2="92" /><line x1="232" y1="116" x2="282" y2="116" /></g>',
      helical: '<circle cx="180" cy="138" r="72" /><g><path d="M180 138L248 114" /><path d="M180 138L228 190" /><path d="M180 138L132 190" /><path d="M180 138L112 114" /><path d="M180 138L180 66" /></g>',
      other: '<path d="M94 86H274V184H94Z" stroke-dasharray="8 7" /><path d="M112 128H252" /><path d="M112 152H252" />',
    };
    measurementsV2Schema.innerHTML = `
      <svg viewBox="0 0 360 240" role="img" aria-label="Schema ${escapeHtml(config.label)}">
        <rect x="14" y="14" width="332" height="212" rx="12" fill="#fff" stroke="#e5e7eb" />
        <text x="28" y="42" fill="#111827" font-size="15" font-weight="800">${escapeHtml(config.label)}</text>
        <g fill="none" stroke="#111827" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          ${shapeByType[type] || shapeByType.straight}
        </g>
        <g stroke="#f97316" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <path d="M70 206H294" />
          <path d="M294 206l-12-8M294 206l-12 8" />
        </g>
        <text x="70" y="222" fill="#9a3412" font-size="12" font-weight="700">Sens de releve et cotes a confirmer sur chantier</text>
      </svg>
    `;
  }

  function renderMeasureInput(key, required) {
    const def = MEASURE_FIELD_DEFS[key] || { label: key, kind: 'text' };
    const value = measureValue(key);
    const badge = required ? 'Obligatoire' : 'Optionnel';
    const meta = [badge, def.unit].filter(Boolean).join(' · ');
    if (def.kind === 'select') {
      const options = (def.options || []).map((option) => `
        <option value="${escapeHtml(option)}"${value === option ? ' selected' : ''}>${escapeHtml(option)}</option>
      `).join('');
      return `
        <div class="measure-field">
          <label for="measure-${escapeHtml(key)}">${escapeHtml(def.label)} <span>${badge}</span></label>
          <select id="measure-${escapeHtml(key)}" data-measure-key="${escapeHtml(key)}">
            <option value="">A choisir</option>
            ${options}
          </select>
        </div>
      `;
    }
    if (def.kind === 'textarea') {
      return `
        <div class="measure-field">
          <label for="measure-${escapeHtml(key)}">${escapeHtml(def.label)} <span>${badge}</span></label>
          <textarea id="measure-${escapeHtml(key)}" data-measure-key="${escapeHtml(key)}">${escapeHtml(value)}</textarea>
        </div>
      `;
    }
    return `
      <div class="measure-field">
        <label for="measure-${escapeHtml(key)}">${escapeHtml(def.label)} <span>${escapeHtml(meta)}</span></label>
        <input id="measure-${escapeHtml(key)}" data-measure-key="${escapeHtml(key)}" type="text" inputmode="decimal" value="${escapeHtml(value)}" placeholder="${required ? 'A relever' : 'Optionnel'}" />
      </div>
    `;
  }

  function renderMeasurementsV2Fields() {
    if (!measurementsV2Fields) return;
    const config = measurementConfig();
    const required = config.required || [];
    const optional = config.optional || [];
    measurementsV2Fields.innerHTML = [
      ...required.map((key) => renderMeasureInput(key, true)),
      ...optional.map((key) => renderMeasureInput(key, false)),
    ].join('');
  }

  function renderMeasurementsV2Checks() {
    if (!measurementsV2Checks || !measurementsV2Progress) return;
    const state = analyzeMeasurementsV2();
    measurementsV2Progress.textContent = `${state.requiredCompleted} / ${state.requiredTotal}`;
    if (!state.warnings.length) {
      measurementsV2Checks.innerHTML = '<div class="measure-check is-ok">Mesures obligatoires completes. Controle visuel a faire avant validation.</div>';
      return;
    }
    measurementsV2Checks.innerHTML = state.warnings.map((warning) => `
      <div class="measure-check is-warning">${escapeHtml(warning)}</div>
    `).join('');
  }

  function renderMeasurementsV2() {
    if (!measurementsV2State) {
      measurementsV2State = createMeasurementsV2State(normalizeStairTypeKey(getValue('type_escalier')));
    }
    renderMeasurementsV2Schema();
    renderMeasurementsV2Fields();
    renderMeasurementsV2Checks();
  }

  function buildMeasurementsV2Payload() {
    const state = analyzeMeasurementsV2();
    return {
      schemaVersion: 1,
      stairType: state.stairType,
      values: { ...state.values },
      completedKeys: [...state.completedKeys],
      requiredCompleted: state.requiredCompleted,
      requiredTotal: state.requiredTotal,
      optionalCompleted: state.optionalCompleted,
      optionalTotal: state.optionalTotal,
      warnings: [...state.warnings],
      updatedAt: new Date().toISOString(),
    };
  }

  function applyFieldValues(fields) {
    Object.keys(fields || {}).forEach((key) => {
      if (!form.elements[key]) return;
      form.elements[key].value = fields[key] == null ? '' : String(fields[key]);
    });
  }

  function makeDefaultRecordName() {
    const client = getValue('client');
    const date = getValue('date') || new Date().toISOString().slice(0, 10);
    return client ? `${client} - Escalier V2 - ${date}` : `Fiche Escalier V2 ${date}`;
  }

  function makeEmptyPhotoSlots() {
    return PHOTO_CATEGORIES.map((category) => ({ category, count: 0, photos: [] }));
  }

  function normalizePhotoSlots(slots) {
    const byCategory = new Map();
    makeEmptyPhotoSlots().forEach((slot) => byCategory.set(slot.category, slot));

    (slots || []).forEach((slot) => {
      const category = String(slot && slot.category ? slot.category : '').trim();
      if (!byCategory.has(category)) return;

      const photos = Array.isArray(slot.photos) ? slot.photos : [];
      byCategory.get(category).photos = photos
        .map((photo) => ({
          id: String(photo && photo.id ? photo.id : '').trim(),
          fileName: String(photo && photo.fileName ? photo.fileName : '').trim(),
          caption: String(photo && photo.caption ? photo.caption : '').trim(),
          size: Number(photo && photo.size ? photo.size : 0),
          mimeType: String(photo && photo.mimeType ? photo.mimeType : '').trim(),
          createdAt: String(photo && photo.createdAt ? photo.createdAt : '').trim(),
          url: String(photo && photo.url ? photo.url : '').trim(),
        }))
        .filter((photo) => photo.id && photo.fileName && photo.url);
    });

    return Array.from(byCategory.values()).map((slot) => ({
      category: slot.category,
      count: slot.photos.length,
      photos: slot.photos,
    }));
  }

  function serializePhotoSlotsForSave() {
    return normalizePhotoSlots(photoSlots).map((slot) => ({
      category: slot.category,
      photos: slot.photos.map((photo) => ({
        id: photo.id,
        fileName: photo.fileName,
        caption: photo.caption || '',
        size: Number(photo.size || 0),
        mimeType: photo.mimeType || '',
        createdAt: photo.createdAt || null,
      })),
    }));
  }

  function updatePhotoTotal() {
    if (!photoTotalCount) return;
    const total = normalizePhotoSlots(photoSlots).reduce((sum, slot) => sum + slot.photos.length, 0);
    photoTotalCount.textContent = `${total} photo${total > 1 ? 's' : ''}`;
  }

  function openViewer(url, caption) {
    if (!photoViewer || !photoViewerImg) return;
    photoViewerImg.src = url;
    photoViewerCaption.textContent = caption || '';
    photoViewer.hidden = false;
    photoViewer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeViewer() {
    if (!photoViewer || !photoViewerImg) return;
    photoViewer.hidden = true;
    photoViewer.setAttribute('aria-hidden', 'true');
    photoViewerImg.removeAttribute('src');
    photoViewerCaption.textContent = '';
    document.body.style.overflow = '';
  }

  function setSketchStatus(text, isError) {
    const message = String(text || 'Pret');
    if (sketchStatus) sketchStatus.textContent = message;
    if (sketchStatusInline) sketchStatusInline.textContent = message;
    if (sketchStatus) sketchStatus.style.color = isError ? '#991b1b' : '';
    if (sketchStatusInline) sketchStatusInline.style.color = isError ? '#991b1b' : '';
  }

  function sketchCssSize() {
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    return {
      ratio,
      cssWidth: Math.max(1, sketchCanvas ? sketchCanvas.width / ratio : 1),
      cssHeight: Math.max(1, sketchCanvas ? sketchCanvas.height / ratio : 1),
    };
  }

  function cloneSketchAnnotations(value) {
    try {
      return JSON.parse(JSON.stringify(Array.isArray(value) ? value : []));
    } catch {
      return [];
    }
  }

  function normalizeUnit(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Math.min(1, Math.max(0, num));
  }

  function normalizeSketchAnnotation(annotation) {
    if (!annotation || typeof annotation !== 'object') return null;
    const type = String(annotation.type || '').trim();
    if (!ANNOTATION_TOOLS.has(type)) return null;
    const base = {
      type,
      color: String(annotation.color || '#111827'),
      width: Math.max(1, Number(annotation.width || 2)),
    };
    if (type === 'text') {
      return {
        ...base,
        x: normalizeUnit(annotation.x),
        y: normalizeUnit(annotation.y),
        text: String(annotation.text || '').slice(0, 500),
      };
    }
    if (type === 'marker') {
      return {
        ...base,
        x: normalizeUnit(annotation.x),
        y: normalizeUnit(annotation.y),
        number: Math.max(1, Number(annotation.number || 1)),
      };
    }
    if (type === 'symbol') {
      const symbol = String(annotation.symbol || '').trim();
      const found = SYMBOL_LIBRARY.find((item) => item.key === symbol);
      return {
        type,
        color: base.color,
        strokeWidth: Math.max(1, Number(annotation.strokeWidth || annotation.lineWidth || 2)),
        symbol: found ? found.key : 'obstacle',
        x: normalizeUnit(annotation.x),
        y: normalizeUnit(annotation.y),
        width: normalizeUnit(annotation.width || 0.12) || 0.12,
        height: normalizeUnit(annotation.height || 0.08) || 0.08,
        rotation: Number.isFinite(Number(annotation.rotation)) ? Number(annotation.rotation) : 0,
        label: String(annotation.label || (found ? found.label : 'Symbole')).slice(0, 80),
      };
    }
    return {
      ...base,
      x1: normalizeUnit(annotation.x1),
      y1: normalizeUnit(annotation.y1),
      x2: normalizeUnit(annotation.x2),
      y2: normalizeUnit(annotation.y2),
      text: type === 'dimension' ? String(annotation.text || '').slice(0, 200) : undefined,
    };
  }

  function normalizeSketchAnnotations(value) {
    return (Array.isArray(value) ? value : [])
      .map(normalizeSketchAnnotation)
      .filter(Boolean);
  }

  function sketchCanvasPointToUnit(point) {
    const size = sketchCssSize();
    return {
      x: normalizeUnit(point.x / size.cssWidth),
      y: normalizeUnit(point.y / size.cssHeight),
    };
  }

  function sketchUnitToCanvasPoint(x, y) {
    const size = sketchCssSize();
    return {
      x: normalizeUnit(x) * size.cssWidth,
      y: normalizeUnit(y) * size.cssHeight,
    };
  }

  function drawArrowHead(ctx, from, to, color, width) {
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const length = Math.max(10, width * 5);
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - length * Math.cos(angle - Math.PI / 7), to.y - length * Math.sin(angle - Math.PI / 7));
    ctx.lineTo(to.x - length * Math.cos(angle + Math.PI / 7), to.y - length * Math.sin(angle + Math.PI / 7));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawSymbolShape(ctx, symbol, width, height) {
    const w = width;
    const h = height;
    const hw = w / 2;
    const hh = h / 2;
    const drawZigzag = () => {
      ctx.beginPath();
      for (let i = 0; i <= 6; i += 1) {
        const x = -hw + (w / 6) * i;
        const y = i % 2 ? -hh * 0.25 : hh * 0.25;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    if (symbol === 'prise_electrique') {
      ctx.strokeRect(-hw * 0.75, -hh * 0.75, w * 0.75, h * 0.75);
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(w, h) * 0.16, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    if (symbol === 'interrupteur') {
      ctx.strokeRect(-hw * 0.65, -hh * 0.65, w * 0.65, h * 0.65);
      ctx.beginPath();
      ctx.moveTo(-hw * 0.25, hh * 0.2);
      ctx.lineTo(hw * 0.28, -hh * 0.28);
      ctx.stroke();
      return;
    }
    if (symbol === 'radiateur') {
      for (let i = -2; i <= 2; i += 1) {
        ctx.strokeRect((i * w) / 7 - w / 18, -hh * 0.65, w / 9, h * 0.85);
      }
      return;
    }
    if (symbol === 'poutre' || symbol === 'ipn') {
      ctx.beginPath();
      ctx.moveTo(-hw, -hh * 0.55);
      ctx.lineTo(hw, -hh * 0.55);
      ctx.moveTo(-hw, hh * 0.55);
      ctx.lineTo(hw, hh * 0.55);
      ctx.moveTo(0, -hh * 0.55);
      ctx.lineTo(0, hh * 0.55);
      ctx.stroke();
      return;
    }
    if (symbol === 'poteau' || symbol === 'point_fixation') {
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(w, h) * 0.28, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-hw * 0.35, 0);
      ctx.lineTo(hw * 0.35, 0);
      ctx.moveTo(0, -hh * 0.35);
      ctx.lineTo(0, hh * 0.35);
      ctx.stroke();
      return;
    }
    if (symbol === 'fenetre') {
      ctx.strokeRect(-hw * 0.75, -hh * 0.6, w * 0.75, h * 0.6);
      ctx.beginPath();
      ctx.moveTo(0, -hh * 0.6);
      ctx.lineTo(0, hh * 0.6);
      ctx.moveTo(-hw * 0.75, 0);
      ctx.lineTo(hw * 0.75, 0);
      ctx.stroke();
      return;
    }
    if (symbol === 'porte') {
      ctx.beginPath();
      ctx.moveTo(-hw * 0.55, hh * 0.65);
      ctx.lineTo(-hw * 0.55, -hh * 0.65);
      ctx.lineTo(hw * 0.2, -hh * 0.65);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-hw * 0.55, hh * 0.65, w * 0.75, -Math.PI / 2, 0);
      ctx.stroke();
      return;
    }
    if (symbol === 'mur_beton' || symbol === 'dalle') {
      ctx.strokeRect(-hw, -hh * 0.35, w, h * 0.7);
      for (let i = -2; i <= 2; i += 1) {
        ctx.beginPath();
        ctx.moveTo((i * w) / 5, -hh * 0.35);
        ctx.lineTo((i * w) / 5 - w * 0.18, hh * 0.35);
        ctx.stroke();
      }
      return;
    }
    if (symbol === 'mur_pierre') {
      ctx.strokeRect(-hw, -hh * 0.38, w, h * 0.76);
      for (let i = -2; i <= 2; i += 1) {
        ctx.beginPath();
        ctx.moveTo(-hw, (i * h) / 8);
        ctx.lineTo(hw, (i * h) / 8);
        ctx.stroke();
      }
      return;
    }
    if (symbol === 'cloison') {
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(0, -hh);
      ctx.lineTo(0, hh);
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }
    if (symbol === 'niveau') {
      ctx.strokeRect(-hw * 0.8, -hh * 0.18, w * 0.8, h * 0.36);
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(w, h) * 0.12, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    if (symbol === 'sens_montee') {
      ctx.beginPath();
      ctx.moveTo(-hw * 0.75, hh * 0.5);
      ctx.lineTo(hw * 0.65, -hh * 0.45);
      ctx.stroke();
      drawArrowHead(ctx, { x: -hw * 0.75, y: hh * 0.5 }, { x: hw * 0.65, y: -hh * 0.45 }, ctx.strokeStyle, ctx.lineWidth);
      return;
    }
    if (symbol === 'depart' || symbol === 'arrivee') {
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(w, h) * 0.35, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = `700 ${Math.max(14, Math.min(w, h) * 0.35)}px Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(symbol === 'depart' ? 'D' : 'A', 0, 1);
      return;
    }
    if (symbol === 'obstacle') {
      ctx.strokeRect(-hw * 0.65, -hh * 0.65, w * 0.65, h * 0.65);
      ctx.beginPath();
      ctx.moveTo(-hw * 0.55, -hh * 0.55);
      ctx.lineTo(hw * 0.55, hh * 0.55);
      ctx.moveTo(hw * 0.55, -hh * 0.55);
      ctx.lineTo(-hw * 0.55, hh * 0.55);
      ctx.stroke();
      return;
    }
    if (symbol === 'gaine_technique') {
      ctx.strokeRect(-hw * 0.55, -hh * 0.7, w * 0.55, h * 0.7);
      drawZigzag();
      return;
    }
    if (symbol === 'tremie') {
      ctx.setLineDash([7, 5]);
      ctx.strokeRect(-hw * 0.8, -hh * 0.6, w * 0.8, h * 0.6);
      ctx.setLineDash([]);
      return;
    }
    drawZigzag();
  }

  function drawSketchAnnotation(ctx, annotation, index) {
    const item = normalizeSketchAnnotation(annotation);
    if (!item) return;
    const color = item.color || '#111827';
    const width = Math.max(1, Number(item.width || 2));
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.font = `${Math.max(16, width * 4 + 10)}px Arial, sans-serif`;
    ctx.textBaseline = 'top';

    if (item.type === 'text') {
      const p = sketchUnitToCanvasPoint(item.x, item.y);
      String(item.text || '').split(/\n/).forEach((line, index) => {
        ctx.fillText(line, p.x, p.y + index * Math.max(20, width * 5 + 14));
      });
      ctx.restore();
      return;
    }

    if (item.type === 'marker') {
      const p = sketchUnitToCanvasPoint(item.x, item.y);
      const radius = Math.max(12, width * 5);
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = `700 ${Math.max(14, radius)}px Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(item.number || 1), p.x, p.y + 1);
      ctx.restore();
      return;
    }

    if (item.type === 'symbol') {
      const p = sketchUnitToCanvasPoint(item.x, item.y);
      const size = sketchCssSize();
      const w = Math.max(24, item.width * size.cssWidth);
      const h = Math.max(20, item.height * size.cssHeight);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((Number(item.rotation || 0) * Math.PI) / 180);
      ctx.lineWidth = Math.max(2, Number(item.strokeWidth || width || 2));
      drawSymbolShape(ctx, item.symbol, w, h);
      if (item.label) {
        ctx.font = `700 ${Math.max(11, Math.min(16, h * 0.22))}px Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(item.label, 0, h / 2 + 4);
      }
      ctx.restore();
      if (index === sketchSelectedAnnotationIndex) {
        ctx.save();
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 2;
        ctx.strokeRect(p.x - w / 2 - 6, p.y - h / 2 - 6, w + 12, h + 12);
        ctx.setLineDash([]);
        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.arc(p.x + w / 2 + 6, p.y + h / 2 + 6, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
      return;
    }

    const p1 = sketchUnitToCanvasPoint(item.x1, item.y1);
    const p2 = sketchUnitToCanvasPoint(item.x2, item.y2);

    if (item.type === 'line' || item.type === 'arrow' || item.type === 'dimension') {
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      if (item.type === 'arrow') drawArrowHead(ctx, p1, p2, color, width);
      if (item.type === 'dimension') {
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        const tick = Math.max(10, width * 5);
        const drawTick = (p) => {
          ctx.beginPath();
          ctx.moveTo(p.x + Math.cos(angle + Math.PI / 2) * tick * 0.5, p.y + Math.sin(angle + Math.PI / 2) * tick * 0.5);
          ctx.lineTo(p.x - Math.cos(angle + Math.PI / 2) * tick * 0.5, p.y - Math.sin(angle + Math.PI / 2) * tick * 0.5);
          ctx.stroke();
        };
        drawTick(p1);
        drawTick(p2);
        drawArrowHead(ctx, p2, p1, color, Math.max(1, width * 0.8));
        drawArrowHead(ctx, p1, p2, color, Math.max(1, width * 0.8));
        if (item.text) {
          const mx = (p1.x + p2.x) / 2;
          const my = (p1.y + p2.y) / 2;
          ctx.save();
          ctx.font = `700 ${Math.max(15, width * 4 + 9)}px Arial, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(item.text, mx, my - 8);
          ctx.restore();
        }
      }
      ctx.restore();
      return;
    }

    const x = Math.min(p1.x, p2.x);
    const y = Math.min(p1.y, p2.y);
    const w = Math.abs(p2.x - p1.x);
    const h = Math.abs(p2.y - p1.y);
    if (item.type === 'rect') {
      ctx.strokeRect(x, y, w, h);
    } else if (item.type === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, Math.max(1, w / 2), Math.max(1, h / 2), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function sketchRenderComposite(includeAnnotations = true) {
    if (!sketchCtx || !sketchCanvas || !sketchInkCanvas) return;
    const size = sketchCssSize();

    sketchCtx.save();
    sketchCtx.setTransform(1, 0, 0, 1, 0, 0);
    sketchCtx.clearRect(0, 0, sketchCanvas.width, sketchCanvas.height);
    sketchCtx.restore();

    sketchCtx.fillStyle = '#ffffff';
    sketchCtx.fillRect(0, 0, size.cssWidth, size.cssHeight);

    if (sketchBackgroundImage) {
      sketchCtx.drawImage(sketchBackgroundImage, 0, 0, size.cssWidth, size.cssHeight);
    }

    sketchCtx.drawImage(sketchInkCanvas, 0, 0, size.cssWidth, size.cssHeight);
    if (includeAnnotations) {
      sketchAnnotations.forEach((annotation, index) => drawSketchAnnotation(sketchCtx, annotation, index));
      if (sketchDraftAnnotation) drawSketchAnnotation(sketchCtx, sketchDraftAnnotation);
    }
  }

  function sketchClearInk() {
    if (!sketchInkCtx || !sketchInkCanvas) return;
    sketchInkCtx.save();
    sketchInkCtx.setTransform(1, 0, 0, 1, 0, 0);
    sketchInkCtx.clearRect(0, 0, sketchInkCanvas.width, sketchInkCanvas.height);
    sketchInkCtx.restore();
    sketchRenderComposite();
  }

  function setSketchBackgroundUi() {
    const hasBackground = Boolean(sketchBackgroundPhotoId && sketchBackgroundImage);
    if (sketchBgLabel) {
      sketchBgLabel.textContent = hasBackground ? `Fond: photo ${sketchBackgroundPhotoId.slice(0, 8)}` : 'Fond: aucun';
    }
    if (removeSketchPhotoBtn) {
      removeSketchPhotoBtn.disabled = !hasBackground;
      removeSketchPhotoBtn.classList.toggle('has-background', hasBackground);
    }
  }

  function closeSketchPhotoPicker() {
    if (!sketchPhotoPicker) return;
    sketchPhotoPicker.hidden = true;
    sketchPhotoPicker.setAttribute('aria-hidden', 'true');
    if (sketchPhotoPickerBackdrop) {
      sketchPhotoPickerBackdrop.hidden = true;
      sketchPhotoPickerBackdrop.setAttribute('aria-hidden', 'true');
    }
  }

  function closeSketchSymbolPicker() {
    if (!sketchSymbolPicker) return;
    sketchSymbolPicker.hidden = true;
    sketchSymbolPicker.setAttribute('aria-hidden', 'true');
    if (sketchSymbolPickerBackdrop) {
      sketchSymbolPickerBackdrop.hidden = true;
      sketchSymbolPickerBackdrop.setAttribute('aria-hidden', 'true');
    }
  }

  function renderSketchSymbolPicker() {
    if (!sketchSymbolPickerList) return;
    sketchSymbolPickerList.innerHTML = SYMBOL_LIBRARY
      .map((symbol) => `
        <button type="button" class="sketch-symbol-choice" data-sketch-symbol="${escapeHtml(symbol.key)}">
          <span>${escapeHtml(symbol.icon)}</span>
          <span>${escapeHtml(symbol.label)}</span>
        </button>
      `)
      .join('');
    sketchSymbolPickerList.querySelectorAll('[data-sketch-symbol]').forEach((button) => {
      button.addEventListener('click', () => {
        const key = String(button.getAttribute('data-sketch-symbol') || '').trim();
        addSketchSymbol(key);
        closeSketchSymbolPicker();
      });
    });
  }

  function openSketchSymbolPicker() {
    if (!sketchSymbolPicker || !sketchSymbolPickerList) return;
    renderSketchSymbolPicker();
    sketchSymbolPicker.hidden = false;
    sketchSymbolPicker.setAttribute('aria-hidden', 'false');
    if (sketchSymbolPickerBackdrop) {
      sketchSymbolPickerBackdrop.hidden = false;
      sketchSymbolPickerBackdrop.setAttribute('aria-hidden', 'false');
    }
  }

  function openSketchPhotoPicker() {
    if (!sketchPhotoPicker || !sketchPhotoPickerList) return;
    const slots = normalizePhotoSlots(photoSlots);
    const photos = [];
    slots.forEach((slot) => {
      slot.photos.forEach((photo) => {
        photos.push({
          id: photo.id,
          url: photo.url,
          label: `${slot.category} - ${photo.caption || photo.fileName || 'Photo'}`,
        });
      });
    });

    if (!photos.length) {
      sketchPhotoPickerList.innerHTML = '<div class="photo-empty">Aucune photo disponible sur cette fiche.</div>';
    } else {
      sketchPhotoPickerList.innerHTML = photos
        .map((photo) => `
          <button type="button" class="sketch-photo-choice" data-sketch-photo-choice="${escapeHtml(photo.id)}">
            <img src="${escapeHtml(photo.url)}" alt="Photo ${escapeHtml(photo.label)}" loading="lazy" />
            <span>${escapeHtml(photo.label)}</span>
          </button>
        `)
        .join('');

      sketchPhotoPickerList.querySelectorAll('[data-sketch-photo-choice]').forEach((button) => {
        button.addEventListener('click', () => {
          const photoId = String(button.getAttribute('data-sketch-photo-choice') || '').trim();
          if (!photoId) return;
          setSketchBackgroundFromPhoto(photoId);
        });
      });
    }

    sketchPhotoPicker.hidden = false;
    sketchPhotoPicker.setAttribute('aria-hidden', 'false');
    if (sketchPhotoPickerBackdrop) {
      sketchPhotoPickerBackdrop.hidden = false;
      sketchPhotoPickerBackdrop.setAttribute('aria-hidden', 'false');
    }
  }

  function loadSketchBackgroundImage(url) {
    return new Promise((resolve) => {
      if (!url) return resolve(null);
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
    });
  }

  async function setSketchBackgroundFromPhoto(photoId) {
    const found = photoById(photoId);
    if (!found || !found.photo || !found.photo.url) {
      setSketchStatus('Photo de fond introuvable', true);
      return;
    }

    const image = await loadSketchBackgroundImage(found.photo.url);
    if (!image) {
      setSketchStatus('Impossible de charger la photo', true);
      return;
    }

    sketchBackgroundPhotoId = photoId;
    sketchBackgroundUrl = found.photo.url;
    sketchBackgroundImage = image;
    setSketchBackgroundUi();
    sketchRenderComposite();
    closeSketchPhotoPicker();
    dirty = true;
    setSketchStatus('Photo de fond appliquee');
  }

  async function applyStoredSketchBackground() {
    if (!sketchBackgroundPhotoId) {
      sketchBackgroundUrl = '';
      sketchBackgroundImage = null;
      setSketchBackgroundUi();
      sketchRenderComposite();
      return;
    }

    const found = photoById(sketchBackgroundPhotoId);
    if (!found || !found.photo || !found.photo.url) {
      sketchBackgroundUrl = '';
      sketchBackgroundImage = null;
      setSketchBackgroundUi();
      sketchRenderComposite();
      return;
    }

    sketchBackgroundUrl = found.photo.url;
    sketchBackgroundImage = await loadSketchBackgroundImage(sketchBackgroundUrl);
    setSketchBackgroundUi();
    sketchRenderComposite();
  }

  function removeSketchBackground() {
    sketchBackgroundPhotoId = '';
    sketchBackgroundUrl = '';
    sketchBackgroundImage = null;
    setSketchBackgroundUi();
    sketchRenderComposite();
    dirty = true;
    setSketchStatus('Fond retire');
  }

  function sketchApplyBrush() {
    if (!sketchInkCtx) return;
    sketchInkCtx.lineCap = 'round';
    sketchInkCtx.lineJoin = 'round';
    if (sketchTool === 'eraser') {
      sketchInkCtx.globalCompositeOperation = 'destination-out';
      sketchInkCtx.strokeStyle = 'rgba(0,0,0,1)';
      sketchInkCtx.lineWidth = Math.max(10, sketchSize * 4);
    } else {
      sketchInkCtx.globalCompositeOperation = 'source-over';
      sketchInkCtx.strokeStyle = sketchColor;
      sketchInkCtx.lineWidth = Math.max(1, sketchSize * 2);
    }
  }

  function sketchCaptureState() {
    if (!sketchInkCanvas) return '';
    return sketchInkCanvas.toDataURL('image/png');
  }

  function sketchCaptureHistoryState() {
    return {
      ink: sketchCaptureState(),
      annotations: cloneSketchAnnotations(sketchAnnotations),
      markerCounter: sketchMarkerCounter,
    };
  }

  function serializeSketchHistoryState(state) {
    if (typeof state === 'string') return state;
    try {
      return JSON.stringify(state || {});
    } catch {
      return '';
    }
  }

  async function sketchRestoreHistoryState(state) {
    sketchLoadingState = true;
    if (typeof state === 'string') {
      sketchAnnotations = [];
      sketchMarkerCounter = 0;
      await sketchLoadDataUrl(state);
    } else {
      sketchAnnotations = normalizeSketchAnnotations(state && state.annotations);
      sketchMarkerCounter = Math.max(0, Number(state && state.markerCounter ? state.markerCounter : 0));
      await sketchLoadDataUrl(state && state.ink ? state.ink : '');
    }
    sketchDraftAnnotation = null;
    sketchMoveState = null;
    setSelectedSketchAnnotation(-1);
    sketchRenderComposite();
    sketchLoadingState = false;
  }

  function sketchLoadDataUrl(dataUrl) {
    return new Promise((resolve) => {
      if (!sketchInkCtx || !sketchInkCanvas) return resolve(false);
      if (!dataUrl) {
        sketchClearInk();
        sketchApplyBrush();
        return resolve(true);
      }

      const image = new Image();
      image.onload = function () {
        sketchInkCtx.save();
        sketchInkCtx.setTransform(1, 0, 0, 1, 0, 0);
        sketchInkCtx.clearRect(0, 0, sketchInkCanvas.width, sketchInkCanvas.height);
        sketchInkCtx.restore();
        const size = sketchCssSize();
        sketchInkCtx.drawImage(image, 0, 0, size.cssWidth, size.cssHeight);
        sketchApplyBrush();
        sketchRenderComposite();
        resolve(true);
      };
      image.onerror = function () {
        sketchClearInk();
        sketchApplyBrush();
        resolve(false);
      };
      image.src = dataUrl;
    });
  }

  function sketchReplaceHistoryWithCurrent() {
    const state = sketchCaptureHistoryState();
    sketchHistory = state ? [state] : [];
    sketchHistoryIndex = sketchHistory.length ? 0 : -1;
  }

  function sketchPushHistory() {
    if (!sketchCanvas || sketchLoadingState) return;
    const state = sketchCaptureHistoryState();
    if (!state) return;
    if (sketchHistoryIndex >= 0 && serializeSketchHistoryState(sketchHistory[sketchHistoryIndex]) === serializeSketchHistoryState(state)) return;

    sketchHistory = sketchHistory.slice(0, sketchHistoryIndex + 1);
    sketchHistory.push(state);
    if (sketchHistory.length > 40) {
      sketchHistory.shift();
    }
    sketchHistoryIndex = sketchHistory.length - 1;
  }

  async function sketchUndo() {
    if (sketchHistoryIndex <= 0) return;
    sketchHistoryIndex -= 1;
    await sketchRestoreHistoryState(sketchHistory[sketchHistoryIndex]);
    setSketchStatus('Annulation');
  }

  async function sketchRedo() {
    if (sketchHistoryIndex < 0 || sketchHistoryIndex >= sketchHistory.length - 1) return;
    sketchHistoryIndex += 1;
    await sketchRestoreHistoryState(sketchHistory[sketchHistoryIndex]);
    setSketchStatus('Refaire');
  }

  function sketchCanvasPoint(event) {
    const rect = sketchCanvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function makeSketchAnnotationFromDrag(type, start, end, text) {
    return normalizeSketchAnnotation({
      type,
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
      color: sketchColor,
      width: Math.max(1, sketchSize * 2),
      text: text || '',
    });
  }

  function openSketchTextDialog(options) {
    if (!sketchTextDialog || !sketchTextInput || !sketchTextDialogTitle) return;
    sketchTextRequest = options || null;
    sketchTextDialogTitle.textContent = options && options.title ? options.title : 'Annotation';
    sketchTextInput.value = options && options.value ? options.value : '';
    sketchTextDialog.hidden = false;
    sketchTextDialog.setAttribute('aria-hidden', 'false');
    window.setTimeout(() => sketchTextInput.focus(), 30);
  }

  function closeSketchTextDialog() {
    if (!sketchTextDialog || !sketchTextInput) return;
    sketchTextDialog.hidden = true;
    sketchTextDialog.setAttribute('aria-hidden', 'true');
    sketchTextInput.value = '';
    sketchTextRequest = null;
  }

  function confirmSketchTextDialog() {
    if (!sketchTextRequest || !sketchTextInput) {
      closeSketchTextDialog();
      return;
    }
    const text = String(sketchTextInput.value || '').trim();
    if (!text) {
      closeSketchTextDialog();
      return;
    }
    if (sketchTextRequest.type === 'text') {
      sketchAnnotations.push(normalizeSketchAnnotation({
        type: 'text',
        x: sketchTextRequest.point.x,
        y: sketchTextRequest.point.y,
        text,
        color: sketchColor,
        width: Math.max(1, sketchSize * 2),
      }));
    } else if (sketchTextRequest.type === 'dimension') {
      sketchAnnotations.push(makeSketchAnnotationFromDrag('dimension', sketchTextRequest.start, sketchTextRequest.end, text));
    }
    sketchDraftAnnotation = null;
    dirty = true;
    sketchRenderComposite();
    sketchPushHistory();
    closeSketchTextDialog();
  }

  function setSelectedSketchAnnotation(index) {
    sketchSelectedAnnotationIndex = Number.isInteger(index) ? index : -1;
    if (sketchSymbolControls) {
      const selected = sketchAnnotations[sketchSelectedAnnotationIndex];
      const hasSymbol = Boolean(selected && selected.type === 'symbol');
      sketchSymbolControls.hidden = !hasSymbol;
      sketchSymbolControls.setAttribute('aria-hidden', hasSymbol ? 'false' : 'true');
    }
    sketchRenderComposite();
  }

  function symbolBounds(annotation) {
    const item = normalizeSketchAnnotation(annotation);
    if (!item || item.type !== 'symbol') return null;
    const size = sketchCssSize();
    const center = sketchUnitToCanvasPoint(item.x, item.y);
    const width = Math.max(24, item.width * size.cssWidth);
    const height = Math.max(20, item.height * size.cssHeight);
    return {
      center,
      width,
      height,
      left: center.x - width / 2,
      top: center.y - height / 2,
      right: center.x + width / 2,
      bottom: center.y + height / 2,
    };
  }

  function findSketchSymbolAtPoint(point) {
    for (let i = sketchAnnotations.length - 1; i >= 0; i -= 1) {
      const bounds = symbolBounds(sketchAnnotations[i]);
      if (!bounds) continue;
      if (
        point.x >= bounds.left - 10 &&
        point.x <= bounds.right + 10 &&
        point.y >= bounds.top - 10 &&
        point.y <= bounds.bottom + 10
      ) {
        const onResize = point.x >= bounds.right - 8 && point.y >= bounds.bottom - 8;
        return { index: i, bounds, mode: onResize ? 'resize' : 'move' };
      }
    }
    return null;
  }

  function addSketchSymbol(symbolKey) {
    const symbol = SYMBOL_LIBRARY.find((item) => item.key === symbolKey) || SYMBOL_LIBRARY.find((item) => item.key === 'obstacle');
    if (!symbol) return;
    const annotation = normalizeSketchAnnotation({
      type: 'symbol',
      symbol: symbol.key,
      x: 0.5,
      y: 0.5,
      width: 0.12,
      height: 0.08,
      rotation: 0,
      color: sketchColor,
      strokeWidth: Math.max(1, sketchSize * 2),
      label: symbol.label,
    });
    sketchAnnotations.push(annotation);
    dirty = true;
    setSelectedSketchAnnotation(sketchAnnotations.length - 1);
    sketchPushHistory();
    setSketchStatus(`${symbol.label} ajoute`);
  }

  function resizeSelectedSketchSymbol(factor) {
    const annotation = sketchAnnotations[sketchSelectedAnnotationIndex];
    if (!annotation || annotation.type !== 'symbol') return;
    annotation.width = normalizeUnit(Math.max(0.035, Math.min(0.5, Number(annotation.width || 0.12) * factor)));
    annotation.height = normalizeUnit(Math.max(0.03, Math.min(0.5, Number(annotation.height || 0.08) * factor)));
    dirty = true;
    sketchRenderComposite();
    sketchPushHistory();
  }

  function deleteSelectedSketchSymbol() {
    const annotation = sketchAnnotations[sketchSelectedAnnotationIndex];
    if (!annotation || annotation.type !== 'symbol') return;
    sketchAnnotations.splice(sketchSelectedAnnotationIndex, 1);
    sketchSelectedAnnotationIndex = -1;
    dirty = true;
    setSelectedSketchAnnotation(-1);
    sketchPushHistory();
    setSketchStatus('Symbole supprime');
  }

  function sketchStartDrawing(event) {
    if (!sketchInkCtx || !sketchCanvas) return;
    event.preventDefault();
    const canvasPoint = sketchCanvasPoint(event);
    const point = sketchCanvasPointToUnit(canvasPoint);
    const symbolHit = findSketchSymbolAtPoint(canvasPoint);

    if (symbolHit) {
      setSelectedSketchAnnotation(symbolHit.index);
      const annotation = sketchAnnotations[symbolHit.index];
      sketchMoveState = {
        index: symbolHit.index,
        mode: symbolHit.mode,
        start: point,
        original: cloneSketchAnnotations([annotation])[0],
      };
      sketchDrawing = true;
      try {
        sketchCanvas.setPointerCapture(event.pointerId);
      } catch {}
      return;
    }

    setSelectedSketchAnnotation(-1);

    if (sketchTool === 'text') {
      openSketchTextDialog({ type: 'text', point, title: 'Texte' });
      return;
    }

    if (sketchTool === 'marker') {
      sketchMarkerCounter += 1;
      sketchAnnotations.push(normalizeSketchAnnotation({
        type: 'marker',
        x: point.x,
        y: point.y,
        number: sketchMarkerCounter,
        color: sketchColor,
        width: Math.max(1, sketchSize * 2),
      }));
      dirty = true;
      sketchRenderComposite();
      sketchPushHistory();
      setSketchStatus(`Repere ${sketchMarkerCounter}`);
      return;
    }

    sketchDrawing = true;
    if (ANNOTATION_TOOLS.has(sketchTool)) {
      sketchDraftAnnotation = makeSketchAnnotationFromDrag(sketchTool, point, point);
    } else {
      sketchApplyBrush();
      const drawPoint = sketchCanvasPoint(event);
      sketchInkCtx.beginPath();
      sketchInkCtx.moveTo(drawPoint.x, drawPoint.y);
    }
    try {
      sketchCanvas.setPointerCapture(event.pointerId);
    } catch {}
  }

  function sketchDraw(event) {
    if (!sketchDrawing || !sketchInkCtx) return;
    event.preventDefault();
    if (sketchMoveState) {
      const point = sketchCanvasPointToUnit(sketchCanvasPoint(event));
      const annotation = sketchAnnotations[sketchMoveState.index];
      if (annotation && annotation.type === 'symbol') {
        const dx = point.x - sketchMoveState.start.x;
        const dy = point.y - sketchMoveState.start.y;
        if (sketchMoveState.mode === 'resize') {
          annotation.width = normalizeUnit(Math.max(0.035, Math.min(0.5, Number(sketchMoveState.original.width || 0.12) + dx)));
          annotation.height = normalizeUnit(Math.max(0.03, Math.min(0.5, Number(sketchMoveState.original.height || 0.08) + dy)));
        } else {
          annotation.x = normalizeUnit(Number(sketchMoveState.original.x || 0.5) + dx);
          annotation.y = normalizeUnit(Number(sketchMoveState.original.y || 0.5) + dy);
        }
        dirty = true;
      }
    } else if (sketchDraftAnnotation && ANNOTATION_TOOLS.has(sketchTool)) {
      const point = sketchCanvasPointToUnit(sketchCanvasPoint(event));
      sketchDraftAnnotation = makeSketchAnnotationFromDrag(sketchTool, {
        x: sketchDraftAnnotation.x1,
        y: sketchDraftAnnotation.y1,
      }, point, sketchDraftAnnotation.text || '');
    } else {
      const point = sketchCanvasPoint(event);
      sketchInkCtx.lineTo(point.x, point.y);
      sketchInkCtx.stroke();
    }
    sketchRenderComposite();
  }

  function sketchStopDrawing(event) {
    if (!sketchDrawing || !sketchCanvas) return;
    sketchDrawing = false;
    if (sketchMoveState) {
      sketchMoveState = null;
      try {
        sketchCanvas.releasePointerCapture(event.pointerId);
      } catch {}
      sketchRenderComposite();
      sketchPushHistory();
      return;
    }
    const draft = sketchDraftAnnotation ? normalizeSketchAnnotation(sketchDraftAnnotation) : null;
    sketchDraftAnnotation = null;
    try {
      sketchCanvas.releasePointerCapture(event.pointerId);
    } catch {}
    if (draft && ANNOTATION_TOOLS.has(draft.type)) {
      const dx = Math.abs(Number(draft.x2 || 0) - Number(draft.x1 || 0));
      const dy = Math.abs(Number(draft.y2 || 0) - Number(draft.y1 || 0));
      if (dx > 0.004 || dy > 0.004) {
        if (draft.type === 'dimension') {
          openSketchTextDialog({
            type: 'dimension',
            start: { x: draft.x1, y: draft.y1 },
            end: { x: draft.x2, y: draft.y2 },
            title: 'Valeur de cote',
          });
          sketchRenderComposite();
          return;
        }
        sketchAnnotations.push(draft);
        dirty = true;
        sketchRenderComposite();
      }
    }
    sketchPushHistory();
  }

  async function resizeSketchCanvas() {
    if (!sketchCanvas || !sketchCtx || !sketchInkCtx || !sketchInkCanvas || !sketchModal || sketchModal.hidden) return;
    const wrap = sketchCanvas.parentElement;
    if (!wrap) return;

    const snapshot = sketchCaptureState();
    const rect = wrap.getBoundingClientRect();
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const width = Math.max(320, Math.round(rect.width * ratio));
    const height = Math.max(260, Math.round(rect.height * ratio));
    if (sketchCanvas.width === width && sketchCanvas.height === height) return;

    sketchCanvas.width = width;
    sketchCanvas.height = height;
    sketchInkCanvas.width = width;
    sketchInkCanvas.height = height;
    sketchCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
    sketchInkCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
    await sketchLoadDataUrl(snapshot);
  }

  function initSketchCanvas() {
    if (!sketchCanvas || sketchCtx) return;
    sketchCtx = sketchCanvas.getContext('2d', { alpha: false });
    sketchInkCanvas = document.createElement('canvas');
    sketchInkCtx = sketchInkCanvas.getContext('2d', { alpha: true });
    if (!sketchCtx || !sketchInkCtx) return;

    sketchCanvas.addEventListener('pointerdown', sketchStartDrawing);
    sketchCanvas.addEventListener('pointermove', sketchDraw);
    sketchCanvas.addEventListener('pointerup', sketchStopDrawing);
    sketchCanvas.addEventListener('pointercancel', sketchStopDrawing);
  }

  async function loadSketchFromServer() {
    if (!sketchCanvas) return;
    sketchLoadingState = true;
    if (!currentId) {
      sketchClearInk();
      sketchReplaceHistoryWithCurrent();
      sketchLoadingState = false;
      return;
    }

    const imageUrl = `/sketches/measurements/${currentId}.png?t=${Date.now()}`;
    const ok = await sketchLoadDataUrl(imageUrl);
    sketchReplaceHistoryWithCurrent();
    sketchLoadingState = false;
    setSketchStatus(ok ? 'Croquis charge' : 'Aucun croquis enregistre');
  }

  async function openSketchModal() {
    const recordId = await ensureCurrentRecordId();
    if (!recordId) {
      setSketchStatus('Enregistrez la fiche avant croquis', true);
      return;
    }

    initSketchCanvas();
    if (!sketchModal) return;
    sketchModal.hidden = false;
    sketchModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('sketch-open');
    closeSketchPhotoPicker();
    await refreshPhotoSlots();
    await resizeSketchCanvas();
    await applyStoredSketchBackground();
    await loadSketchFromServer();
  }

  function closeSketchModal() {
    if (!sketchModal) return;
    sketchModal.hidden = true;
    sketchModal.setAttribute('aria-hidden', 'true');
    closeSketchPhotoPicker();
    closeSketchSymbolPicker();
    closeSketchTextDialog();
    sketchDraftAnnotation = null;
    document.body.classList.remove('sketch-open');
  }

  function setSketchToolbarCollapsed(collapsed) {
    if (!sketchModalContent || !sketchToolbarToggle) return;
    sketchModalContent.classList.toggle('sketch-tools-collapsed', collapsed);
    sketchToolbarToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    sketchToolbarToggle.setAttribute('aria-label', collapsed ? "Afficher la barre d'outils" : "Masquer la barre d'outils");
    sketchToolbarToggle.setAttribute('title', collapsed ? "Afficher la barre d'outils" : "Masquer la barre d'outils");
    sketchToolbarToggle.textContent = collapsed ? '›' : '‹';
    window.setTimeout(() => {
      if (sketchModal && !sketchModal.hidden) resizeSketchCanvas();
    }, 180);
  }

  function setSketchTool(nextTool) {
    sketchTool = nextTool === 'eraser' || ANNOTATION_TOOLS.has(nextTool) ? nextTool : 'pen';
    sketchDraftAnnotation = null;
    if (toolPenBtn) {
      const active = sketchTool === 'pen';
      toolPenBtn.classList.toggle('is-active', active);
      toolPenBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    if (toolEraserBtn) {
      const active = sketchTool === 'eraser';
      toolEraserBtn.classList.toggle('is-active', active);
      toolEraserBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    sketchToolButtons.forEach((button) => {
      const active = String(button.getAttribute('data-sketch-tool') || '') === sketchTool;
      button.classList.toggle('annotation-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    sketchApplyBrush();
    sketchRenderComposite();
  }

  function setSketchColor(nextColor) {
    if (!nextColor) return;
    sketchColor = nextColor;
    setSketchTool('pen');
    if (sketchColorPalette) {
      sketchColorPalette.querySelectorAll('[data-sketch-color]').forEach((button) => {
        const active = String(button.getAttribute('data-sketch-color')) === sketchColor;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }
    sketchApplyBrush();
  }

  function setSketchSize(nextSize) {
    const parsed = Number(nextSize || 0);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    sketchSize = parsed;
    if (sketchSizePalette) {
      sketchSizePalette.querySelectorAll('[data-sketch-size]').forEach((button) => {
        const active = Number(button.getAttribute('data-sketch-size')) === sketchSize;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }
    sketchApplyBrush();
  }

  async function clearSketchWithConfirm() {
    if (!window.confirm('Effacer le croquis et les annotations ?')) return;
    sketchClearInk();
    sketchAnnotations = [];
    sketchDraftAnnotation = null;
    sketchMarkerCounter = 0;
    sketchPushHistory();
    setSketchStatus('Annotations effacees');
  }

  async function saveSketchToServer() {
    const recordId = await ensureCurrentRecordId();
    if (!recordId || !sketchCanvas) {
      setSketchStatus('Fiche introuvable', true);
      return;
    }

    setSketchStatus('Enregistrement...');
    try {
      sketchRenderComposite(false);
      const response = await fetch(`/api/measurements/${recordId}/sketch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: sketchCanvas.toDataURL('image/png') }),
      });
      if (!response.ok) throw new Error('save-sketch-failed');

      sketchUpdatedAt = new Date().toISOString();
      dirty = true;
      await saveRecord();
      sketchRenderComposite();
      setSketchStatus('Enregistre');
    } catch {
      sketchRenderComposite();
      setSketchStatus('Erreur enregistrement', true);
    }
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function photoById(photoId) {
    const slots = normalizePhotoSlots(photoSlots);
    for (let i = 0; i < slots.length; i += 1) {
      for (let j = 0; j < slots[i].photos.length; j += 1) {
        if (slots[i].photos[j].id === photoId) {
          return { slot: slots[i], photo: slots[i].photos[j] };
        }
      }
    }
    return null;
  }

  function applySlotsFromApi(slots) {
    photoSlots = normalizePhotoSlots(slots);
    renderPhotoSlots();
    if (sketchModal && !sketchModal.hidden && sketchBackgroundPhotoId) {
      void applyStoredSketchBackground();
    }
  }

  async function refreshPhotoSlots() {
    if (!currentId) return;
    try {
      const response = await fetch(`/api/measurements/escalier-v2/${currentId}/photos`);
      if (!response.ok) return;
      const data = await response.json();
      applySlotsFromApi(data.slots || []);
    } catch {
      setIndicator('error', 'Erreur chargement photos');
    }
  }

  async function ensureCurrentRecordId() {
    if (currentId) return currentId;
    const savedId = await saveRecord();
    return savedId || null;
  }

  async function uploadPhotos(category, files) {
    const recordId = await ensureCurrentRecordId();
    if (!recordId) {
      setIndicator('error', 'Enregistrez la fiche avant upload');
      return;
    }

    const list = Array.from(files || []);
    if (!list.length) return;

    const body = new FormData();
    body.append('category', category);
    list.forEach((file) => body.append('photos', file));

    setIndicator('saving', 'Upload photos en cours');
    try {
      const response = await fetch(`/api/measurements/escalier-v2/${recordId}/photos`, {
        method: 'POST',
        body,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || 'upload-failed');
      applySlotsFromApi(data.slots || []);
      setIndicator('saved', 'Photos enregistrees');
    } catch {
      setIndicator('error', 'Erreur upload photos');
    }
  }

  async function deletePhoto(photoId) {
    if (!currentId || !photoId) return;
    if (!window.confirm('Supprimer cette photo ?')) return;

    setIndicator('saving', 'Suppression photo');
    try {
      const response = await fetch(`/api/measurements/escalier-v2/${currentId}/photos/${encodeURIComponent(photoId)}`, {
        method: 'DELETE',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || 'delete-failed');
      applySlotsFromApi(data.slots || []);
      setIndicator('saved', 'Photo supprimee');
    } catch {
      setIndicator('error', 'Erreur suppression photo');
    }
  }

  async function saveCaption(photoId, caption) {
    if (!currentId || !photoId) return;

    setIndicator('saving', 'Enregistrement legende');
    try {
      const response = await fetch(`/api/measurements/escalier-v2/${currentId}/photos/${encodeURIComponent(photoId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caption }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || 'caption-failed');
      applySlotsFromApi(data.slots || []);
      setIndicator('saved', 'Legende enregistree');
    } catch {
      setIndicator('error', 'Erreur legende');
    }
  }

  function renderPhotoSlots() {
    if (!photoSlotsRoot) return;

    const slots = normalizePhotoSlots(photoSlots);
    photoSlotsRoot.innerHTML = slots
      .map((slot, index) => {
        const photosHtml = slot.photos.length
          ? `<div class="photo-grid">${slot.photos.map((photo) => `
              <article class="photo-item" data-photo-id="${escapeHtml(photo.id)}">
                <button type="button" class="photo-open" data-photo-open="${escapeHtml(photo.id)}">
                  <img class="photo-thumb" src="${escapeHtml(photo.url)}" alt="${escapeHtml(slot.category)}" loading="lazy" />
                </button>
                <div class="row">
                  <input class="photo-caption" type="text" maxlength="300" value="${escapeHtml(photo.caption || '')}" placeholder="Legende" data-photo-caption="${escapeHtml(photo.id)}" />
                  <button type="button" data-photo-caption-save="${escapeHtml(photo.id)}">OK</button>
                </div>
                <button type="button" class="photo-delete" data-photo-delete="${escapeHtml(photo.id)}">Supprimer</button>
              </article>
            `).join('')}</div>`
          : '<div class="photo-empty">Aucune photo dans cette categorie.</div>';

        return `
          <article class="photo-slot" data-photo-category="${escapeHtml(slot.category)}">
            <div class="photo-slot-head">
              <span class="label">${escapeHtml(slot.category)}</span>
              <span class="count">${slot.photos.length} photo${slot.photos.length > 1 ? 's' : ''}</span>
            </div>
            <div class="photo-actions">
              <button type="button" data-photo-pick-camera="${escapeHtml(slot.category)}">Camera</button>
              <button type="button" data-photo-pick-gallery="${escapeHtml(slot.category)}">Galerie</button>
            </div>
            <input id="photo-camera-${index}" data-photo-input-type="camera" type="file" accept="image/*" capture="environment" multiple hidden />
            <input id="photo-gallery-${index}" data-photo-input-type="gallery" type="file" accept="image/*" multiple hidden />
            ${photosHtml}
          </article>
        `;
      })
      .join('');

    photoSlotsRoot.querySelectorAll('[data-photo-pick-camera]').forEach((button) => {
      button.addEventListener('click', () => {
        const host = button.closest('[data-photo-category]');
        if (!host) return;
        const input = host.querySelector('input[data-photo-input-type="camera"]');
        if (input) input.click();
      });
    });

    photoSlotsRoot.querySelectorAll('[data-photo-pick-gallery]').forEach((button) => {
      button.addEventListener('click', () => {
        const host = button.closest('[data-photo-category]');
        if (!host) return;
        const input = host.querySelector('input[data-photo-input-type="gallery"]');
        if (input) input.click();
      });
    });

    photoSlotsRoot.querySelectorAll('input[data-photo-input-type]').forEach((input) => {
      input.addEventListener('change', () => {
        const host = input.closest('[data-photo-category]');
        const category = host ? String(host.getAttribute('data-photo-category') || '').trim() : '';
        if (!category) return;
        uploadPhotos(category, input.files);
        input.value = '';
      });
    });

    photoSlotsRoot.querySelectorAll('[data-photo-open]').forEach((button) => {
      button.addEventListener('click', () => {
        const photoId = String(button.getAttribute('data-photo-open') || '').trim();
        const found = photoById(photoId);
        if (!found) return;
        openViewer(found.photo.url, found.photo.caption || found.slot.category);
      });
    });

    photoSlotsRoot.querySelectorAll('[data-photo-delete]').forEach((button) => {
      button.addEventListener('click', () => {
        const photoId = String(button.getAttribute('data-photo-delete') || '').trim();
        deletePhoto(photoId);
      });
    });

    photoSlotsRoot.querySelectorAll('[data-photo-caption-save]').forEach((button) => {
      button.addEventListener('click', () => {
        const photoId = String(button.getAttribute('data-photo-caption-save') || '').trim();
        const input = photoSlotsRoot.querySelector(`[data-photo-caption="${photoId}"]`);
        if (!input) return;
        saveCaption(photoId, String(input.value || '').trim());
      });
    });

    photoSlotsRoot.querySelectorAll('[data-photo-caption]').forEach((input) => {
      input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const photoId = String(input.getAttribute('data-photo-caption') || '').trim();
        saveCaption(photoId, String(input.value || '').trim());
      });
    });

    updatePhotoTotal();
  }

  async function loadLinkOptions() {
    if (linkOptionsLoaded) return;
    const quoteSelect = form.elements.quote_id;
    const orderSelect = form.elements.client_order_id;

    try {
      const response = await fetch('/api/measurements/link-options');
      if (!response.ok) return;
      const data = await response.json();
      (data.quotes || []).forEach((q) => {
        const option = document.createElement('option');
        option.value = String(q.id);
        option.textContent = q.label;
        quoteSelect.appendChild(option);
      });
      (data.clientOrders || []).forEach((o) => {
        const option = document.createElement('option');
        option.value = String(o.id);
        option.textContent = o.label;
        orderSelect.appendChild(option);
      });
      linkOptionsLoaded = true;
    } catch {
      setIndicator('error', 'Erreur chargement liens');
    }
  }

  function renderCards(items) {
    if (!items.length) {
      cards.innerHTML = '<div class="empty">Aucune fiche Escalier V2.</div>';
      return;
    }

    cards.innerHTML = items
      .map((item) => {
        const date = item.date || 'Non renseignee';
        const statut = item.statut || 'Brouillon';
        const updated = item.updatedAt ? new Date(item.updatedAt).toLocaleString('fr-FR') : 'Non renseigne';
        return `
          <article class="card">
            <h4>${escapeHtml(item.recordName || `Fiche #${item.id}`)}</h4>
            <div class="meta">
              <span>Client: ${escapeHtml(item.client || '—')}</span>
              <span>Commande: ${escapeHtml(item.commande || '—')}</span>
              <span>Date: ${escapeHtml(date)}</span>
              <span>Type: ${escapeHtml(item.typeEscalier || 'Autre')}</span>
              <span>Statut: ${escapeHtml(statut)}</span>
              <span>Maj: ${escapeHtml(updated)}</span>
            </div>
            <div class="open-row">
              <button type="button" data-open-id="${item.id}">Ouvrir</button>
            </div>
          </article>
        `;
      })
      .join('');

    cards.querySelectorAll('[data-open-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = normalizeId(button.getAttribute('data-open-id'));
        if (id) openRecord(id);
      });
    });
  }

  async function refreshList() {
    const query = orderLock ? `?client_order_id=${encodeURIComponent(String(orderLock))}` : '';
    const response = await fetch(`/api/measurements/escalier-v2/list${query}`);
    if (!response.ok) {
      cards.innerHTML = '<div class="empty">Erreur de chargement des fiches.</div>';
      return;
    }
    const data = await response.json();
    renderCards(data.items || []);
  }

  async function openRecord(id) {
    await loadLinkOptions();
    const response = await fetch(`/api/measurements/escalier-v2/${id}`);
    if (!response.ok) {
      setIndicator('error', 'Fiche introuvable');
      return;
    }

    const data = await response.json();
    const item = data.item || {};
    currentId = normalizeId(item.id);
    applyFieldValues(item.fields || {});
    measurementsV2State = normalizeMeasurementsV2(item.fields?.measurements_v2, getValue('type_escalier'));
    sketchUpdatedAt = String(item.fields?.sketch_updated_at || '').trim();
    sketchBackgroundPhotoId = String(item.fields?.sketch_background_photo_id || '').trim();
    sketchAnnotations = normalizeSketchAnnotations(item.fields?.sketch_annotations || []);
    sketchMarkerCounter = Math.max(0, Number(item.fields?.sketch_marker_counter || 0));
    sketchBackgroundUrl = '';
    sketchBackgroundImage = null;
    sketchDraftAnnotation = null;
    setSelectedSketchAnnotation(-1);
    setSketchBackgroundUi();
    setSketchStatus(sketchUpdatedAt ? 'Croquis existant' : 'Pret');
    photoSlots = normalizePhotoSlots(item.photoSlots || item.fields?.photo_slots || []);
    renderPhotoSlots();
    renderMeasurementsV2();

    if (form.elements.quote_id) form.elements.quote_id.value = item.quote_id ? String(item.quote_id) : '';
    if (form.elements.client_order_id) form.elements.client_order_id.value = item.client_order_id ? String(item.client_order_id) : '';

    if (orderLock && !form.elements.client_order_id.value) {
      form.elements.client_order_id.value = String(orderLock);
    }

    if (form.elements.record_name) {
      form.elements.record_name.value = item.recordName || makeDefaultRecordName();
    }

    if (!getValue('statut')) form.elements.statut.value = 'Brouillon';
    dirty = false;
    showForm();
    setIndicator('saved', 'Brouillon charge');
  }

  function newRecord(prefill) {
    form.reset();
    currentId = null;
    setTodayIfEmpty();
    form.elements.statut.value = 'Brouillon';
    form.elements.type_escalier.value = 'Droit';

    if (prefill) {
      if (prefill.client) form.elements.client.value = prefill.client;
      if (prefill.commande) form.elements.commande.value = prefill.commande;
      if (prefill.client_order_id) form.elements.client_order_id.value = String(prefill.client_order_id);
    }

    form.elements.record_name.value = makeDefaultRecordName();
    sketchUpdatedAt = '';
    sketchBackgroundPhotoId = '';
    sketchBackgroundUrl = '';
    sketchBackgroundImage = null;
    sketchAnnotations = [];
    sketchDraftAnnotation = null;
    sketchMarkerCounter = 0;
    setSelectedSketchAnnotation(-1);
    setSketchBackgroundUi();
    setSketchStatus('Pret');
    photoSlots = makeEmptyPhotoSlots();
    renderPhotoSlots();
    measurementsV2State = createMeasurementsV2State(normalizeStairTypeKey(getValue('type_escalier')));
    renderMeasurementsV2();
    dirty = true;
    showForm();
  }

  function payloadForSave() {
    const fields = {
      client: getValue('client'),
      commande: getValue('commande'),
      chantier: getValue('chantier'),
      date: getValue('date'),
      metreur: getValue('metreur'),
      reference_interne: getValue('reference_interne'),
      type_escalier: getValue('type_escalier'),
      statut: getValue('statut') || 'Brouillon',
      quote_id: getValue('quote_id'),
      client_order_id: getValue('client_order_id'),
      sketch_updated_at: sketchUpdatedAt || null,
      sketch_background_photo_id: sketchBackgroundPhotoId || null,
      sketch_annotations: cloneSketchAnnotations(sketchAnnotations),
      sketch_marker_counter: sketchMarkerCounter,
      sketch_version: 2,
      measurements_v2: buildMeasurementsV2Payload(),
      photo_slots: serializePhotoSlotsForSave(),
    };

    const recordName = getValue('record_name') || makeDefaultRecordName();

    return {
      server_id: currentId,
      module: MODULE_NAME,
      recordName,
      quote_id: fields.quote_id,
      client_order_id: fields.client_order_id,
      fields,
    };
  }

  async function saveRecord() {
    setIndicator('saving', 'Enregistrement en cours');
    const payload = payloadForSave();

    try {
      const response = await fetch('/api/measurements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('save-failed');
      const result = await response.json();
      currentId = normalizeId(result.id) || currentId;
      dirty = false;
      setIndicator('saved', 'Enregistre');
      await refreshPhotoSlots();
      await refreshList();
      return currentId;
    } catch {
      setIndicator('error', 'Erreur enregistrement');
      return null;
    }
  }

  async function switchToListWithAutosave() {
    if (sketchModal && !sketchModal.hidden) closeSketchModal();
    if (formView.hidden) return;
    if (dirty) await saveRecord();
    showList();
  }

  function showList() {
    listView.hidden = false;
    formView.hidden = true;
    tabList.classList.add('is-active');
  }

  function showForm() {
    listView.hidden = true;
    formView.hidden = false;
    tabList.classList.remove('is-active');
  }

  async function initBootstrap() {
    await loadLinkOptions();
    const query = new URLSearchParams();
    if (initialOrderId) query.set('client_order_id', String(initialOrderId));
    if (initialDraftId) query.set('id', String(initialDraftId));

    try {
      const response = await fetch(`/api/measurements/escalier-v2/bootstrap?${query.toString()}`);
      if (!response.ok) throw new Error('bootstrap-error');
      const bootstrap = await response.json();

      if (bootstrap.prefill && bootstrap.prefill.client_order_id) {
        orderLock = normalizeId(bootstrap.prefill.client_order_id) || orderLock;
      }

      await refreshList();

      if (bootstrap.currentDraftId) {
        await openRecord(bootstrap.currentDraftId);
      } else if (orderLock) {
        newRecord(bootstrap.prefill || null);
      }
    } catch {
      await refreshList();
      setIndicator('error', 'Erreur de chargement initial');
    }
  }

  form.addEventListener('input', () => {
    dirty = true;
  });

  form.elements.quote_id.addEventListener('change', () => {
    if (form.elements.quote_id.value) form.elements.client_order_id.value = '';
    dirty = true;
  });

  form.elements.client_order_id.addEventListener('change', () => {
    if (form.elements.client_order_id.value) form.elements.quote_id.value = '';
    dirty = true;
  });

  if (form.elements.type_escalier) {
    form.elements.type_escalier.addEventListener('change', () => {
      const nextType = normalizeStairTypeKey(getValue('type_escalier'));
      if (!measurementsV2State) measurementsV2State = createMeasurementsV2State(nextType);
      measurementsV2State.stairType = nextType;
      renderMeasurementsV2();
      dirty = true;
    });
  }

  if (measurementsV2Fields) {
    measurementsV2Fields.addEventListener('input', (event) => {
      const target = event.target;
      if (!target || !target.getAttribute) return;
      const key = target.getAttribute('data-measure-key');
      if (!key) return;
      if (!measurementsV2State) {
        measurementsV2State = createMeasurementsV2State(normalizeStairTypeKey(getValue('type_escalier')));
      }
      measurementsV2State.values[key] = String(target.value || '');
      renderMeasurementsV2Checks();
      dirty = true;
    });

    measurementsV2Fields.addEventListener('change', (event) => {
      const target = event.target;
      if (!target || !target.getAttribute) return;
      const key = target.getAttribute('data-measure-key');
      if (!key) return;
      if (!measurementsV2State) {
        measurementsV2State = createMeasurementsV2State(normalizeStairTypeKey(getValue('type_escalier')));
      }
      measurementsV2State.values[key] = String(target.value || '');
      renderMeasurementsV2();
      dirty = true;
    });
  }

  if (photoViewerClose) {
    photoViewerClose.addEventListener('click', closeViewer);
  }

  if (photoViewer) {
    photoViewer.hidden = true;
    photoViewer.setAttribute('aria-hidden', 'true');
  }

  if (sketchModal) {
    sketchModal.hidden = true;
    sketchModal.setAttribute('aria-hidden', 'true');
  }

  if (photoViewer) {
    photoViewer.addEventListener('click', (event) => {
      if (event.target === photoViewer) closeViewer();
    });
  }

  if (openSketchBtn) {
    openSketchBtn.addEventListener('click', openSketchModal);
  }

  if (sketchCloseBtn) {
    sketchCloseBtn.addEventListener('click', closeSketchModal);
  }

  if (sketchSaveBtn) {
    sketchSaveBtn.addEventListener('click', saveSketchToServer);
  }

  if (toolPenBtn) {
    toolPenBtn.addEventListener('click', () => setSketchTool('pen'));
  }

  if (toolEraserBtn) {
    toolEraserBtn.addEventListener('click', () => setSketchTool('eraser'));
  }

  sketchToolButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setSketchTool(String(button.getAttribute('data-sketch-tool') || 'pen'));
    });
  });

  if (undoSketchBtn) {
    undoSketchBtn.addEventListener('click', sketchUndo);
  }

  if (redoSketchBtn) {
    redoSketchBtn.addEventListener('click', sketchRedo);
  }

  if (clearSketchBtn) {
    clearSketchBtn.addEventListener('click', clearSketchWithConfirm);
  }

  if (useSketchPhotoBtn) {
    useSketchPhotoBtn.addEventListener('click', openSketchPhotoPicker);
  }

  if (removeSketchPhotoBtn) {
    removeSketchPhotoBtn.addEventListener('click', removeSketchBackground);
  }

  if (openSketchSymbolBtn) {
    openSketchSymbolBtn.addEventListener('click', openSketchSymbolPicker);
  }

  if (sketchToolbarToggle) {
    sketchToolbarToggle.addEventListener('click', () => {
      const collapsed = Boolean(sketchModalContent && sketchModalContent.classList.contains('sketch-tools-collapsed'));
      setSketchToolbarCollapsed(!collapsed);
    });
  }

  if (closeSketchPhotoPickerBtn) {
    closeSketchPhotoPickerBtn.addEventListener('click', closeSketchPhotoPicker);
  }

  if (sketchPhotoPickerBackdrop) {
    sketchPhotoPickerBackdrop.addEventListener('click', closeSketchPhotoPicker);
  }

  if (closeSketchSymbolPickerBtn) {
    closeSketchSymbolPickerBtn.addEventListener('click', closeSketchSymbolPicker);
  }

  if (sketchSymbolPickerBackdrop) {
    sketchSymbolPickerBackdrop.addEventListener('click', closeSketchSymbolPicker);
  }

  if (sketchSymbolSmallerBtn) {
    sketchSymbolSmallerBtn.addEventListener('click', () => resizeSelectedSketchSymbol(0.86));
  }

  if (sketchSymbolLargerBtn) {
    sketchSymbolLargerBtn.addEventListener('click', () => resizeSelectedSketchSymbol(1.16));
  }

  if (sketchSymbolDeleteBtn) {
    sketchSymbolDeleteBtn.addEventListener('click', deleteSelectedSketchSymbol);
  }

  if (sketchTextCancelBtn) {
    sketchTextCancelBtn.addEventListener('click', () => {
      sketchDraftAnnotation = null;
      closeSketchTextDialog();
      sketchRenderComposite();
    });
  }

  if (sketchTextConfirmBtn) {
    sketchTextConfirmBtn.addEventListener('click', confirmSketchTextDialog);
  }

  if (sketchTextInput) {
    sketchTextInput.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') confirmSketchTextDialog();
    });
  }

  if (sketchColorPalette) {
    sketchColorPalette.querySelectorAll('[data-sketch-color]').forEach((button) => {
      button.addEventListener('click', () => {
        setSketchColor(String(button.getAttribute('data-sketch-color') || ''));
      });
    });
  }

  if (sketchSizePalette) {
    sketchSizePalette.querySelectorAll('[data-sketch-size]').forEach((button) => {
      button.addEventListener('click', () => {
        setSketchSize(button.getAttribute('data-sketch-size'));
      });
    });
  }

  if (sketchModal) {
    sketchModal.addEventListener('click', (event) => {
      if (event.target === sketchModal) closeSketchModal();
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && sketchModal && !sketchModal.hidden) {
      if (sketchTextDialog && !sketchTextDialog.hidden) {
        sketchDraftAnnotation = null;
        closeSketchTextDialog();
        sketchRenderComposite();
        return;
      }
      if (sketchPhotoPicker && !sketchPhotoPicker.hidden) {
        closeSketchPhotoPicker();
        return;
      }
      if (sketchSymbolPicker && !sketchSymbolPicker.hidden) {
        closeSketchSymbolPicker();
        return;
      }
      closeSketchModal();
      return;
    }
    if (event.key === 'Escape' && photoViewer && !photoViewer.hidden) closeViewer();
  });

  window.addEventListener('resize', () => {
    if (sketchModal && !sketchModal.hidden) resizeSketchCanvas();
  });

  window.addEventListener('orientationchange', () => {
    if (sketchModal && !sketchModal.hidden) resizeSketchCanvas();
  });

  tabList.addEventListener('click', switchToListWithAutosave);
  newBtn.addEventListener('click', async () => {
    if (!formView.hidden && dirty) await saveRecord();
    newRecord(orderLock ? {
      client_order_id: orderLock,
      client: getValue('client'),
      commande: getValue('commande'),
    } : null);
  });
  saveBtn.addEventListener('click', saveRecord);
  saveBtnBottom.addEventListener('click', saveRecord);
  backToListBtn.addEventListener('click', switchToListWithAutosave);

  setTodayIfEmpty();
  setSketchTool('pen');
  setSketchSize(2);
  setSketchBackgroundUi();
  closeSketchPhotoPicker();
  setSketchStatus('Pret');
  photoSlots = makeEmptyPhotoSlots();
  renderPhotoSlots();
  measurementsV2State = createMeasurementsV2State(normalizeStairTypeKey(getValue('type_escalier')));
  renderMeasurementsV2();
  initBootstrap();
})();
