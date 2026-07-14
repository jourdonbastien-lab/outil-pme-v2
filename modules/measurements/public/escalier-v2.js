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
  const photosToggleBtn = document.getElementById('photosToggleBtn');
  const photosPanel = document.getElementById('photosPanel');
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
  const sketchZoomOutBtn = document.getElementById('sketchZoomOutBtn');
  const sketchZoomInBtn = document.getElementById('sketchZoomInBtn');
  const sketchZoomLabel = document.getElementById('sketchZoomLabel');
  const sketchFitBtn = document.getElementById('sketchFitBtn');
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
  const sketchDimensionDialog = document.getElementById('sketchDimensionDialog');
  const sketchDimensionInput = document.getElementById('sketchDimensionInput');
  const sketchDimensionSideLabel = document.getElementById('sketchDimensionSideLabel');
  const sketchDimensionSaveBtn = document.getElementById('sketchDimensionSaveBtn');
  const sketchDimensionSideBtn = document.getElementById('sketchDimensionSideBtn');
  const sketchDimensionDeleteBtn = document.getElementById('sketchDimensionDeleteBtn');
  const sketchDimensionCancelBtn = document.getElementById('sketchDimensionCancelBtn');
  const sketchInclinedDialog = document.getElementById('sketchInclinedDialog');
  const sketchInclinedAngleInput = document.getElementById('sketchInclinedAngleInput');
  const sketchInclinedLengthInput = document.getElementById('sketchInclinedLengthInput');
  const sketchInclinedSaveBtn = document.getElementById('sketchInclinedSaveBtn');
  const sketchInclinedCancelBtn = document.getElementById('sketchInclinedCancelBtn');
  const sketchAngleDialog = document.getElementById('sketchAngleDialog');
  const sketchAngleDialogValue = document.getElementById('sketchAngleDialogValue');
  const sketchAngleInput = document.getElementById('sketchAngleInput');
  const sketchAngleInvertBtn = document.getElementById('sketchAngleInvertBtn');
  const sketchAngleApplyBtn = document.getElementById('sketchAngleApplyBtn');
  const sketchAngleDeleteBtn = document.getElementById('sketchAngleDeleteBtn');
  const sketchAngleCloseBtn = document.getElementById('sketchAngleCloseBtn');
  const sketchAutoTraceControls = document.getElementById('sketchAutoTraceControls');
  const autoTraceScaleSelect = document.getElementById('autoTraceScaleSelect');
  const scaleAutoTraceBtn = document.getElementById('scaleAutoTraceBtn');
  const autoTraceScaleLabel = document.getElementById('autoTraceScaleLabel');
  const finishAutoTraceBtn = document.getElementById('finishAutoTraceBtn');
  const undoAutoTraceBtn = document.getElementById('undoAutoTraceBtn');
  const cancelAutoTraceBtn = document.getElementById('cancelAutoTraceBtn');
  const measurementsV2Progress = document.getElementById('measurementsV2Progress');
  const measurementsV2Schema = document.getElementById('measurementsV2Schema');
  const measurementsV2Fields = document.getElementById('measurementsV2Fields');
  const measurementsV2Checks = document.getElementById('measurementsV2Checks');

  const ANNOTATION_TOOLS = new Set(['line', 'arrow', 'rect', 'ellipse', 'text', 'marker', 'dimension', 'symbol', 'auto_trace']);
  const SKETCH_TOOLS = new Set([...ANNOTATION_TOOLS, 'auto_dimension', 'inclined_trace', 'angle_dimension', 'pan']);
  const AUTO_TRACE_SCALE_OPTIONS = [10, 20, 25, 50, 100];
  const CSS_PIXELS_PER_MILLIMETER = 96 / 25.4;
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
    totalHeight: { label: 'Hauteur sol a sol', unit: 'mm', kind: 'number', group: 'general', ref: 'H', help: 'Mesure verticale entre sol fini bas et sol fini haut.' },
    totalRun: { label: 'Reculement / longueur disponible', unit: 'mm', kind: 'number', group: 'general', ref: 'R', help: 'Longueur au sol disponible depuis le depart jusqu a l arrivee.' },
    stairWidth: { label: 'Largeur escalier', unit: 'mm', kind: 'number', group: 'general', ref: 'L', help: 'Largeur utile de passage ou largeur de fabrication demandee.' },
    openingLength: { label: 'Longueur tremie', unit: 'mm', kind: 'number', group: 'opening', ref: 'TL', help: 'Longueur de l ouverture disponible dans la dalle.' },
    openingWidth: { label: 'Largeur tremie', unit: 'mm', kind: 'number', group: 'opening', ref: 'TI', help: 'Largeur de l ouverture disponible dans la dalle.' },
    headroom: { label: 'Echappee', unit: 'mm', kind: 'number', group: 'safety', ref: 'E', help: 'Hauteur libre au passage, a verifier aux points critiques.' },
    lowerRun: { label: 'Volée basse', unit: 'mm', kind: 'number', group: 'lowerFlight', ref: 'VB', help: 'Longueur disponible sur la premiere volee.' },
    upperRun: { label: 'Volée haute', unit: 'mm', kind: 'number', group: 'upperFlight', ref: 'VH', help: 'Longueur disponible sur la volee apres le tournant ou le palier.' },
    landingLength: { label: 'Longueur palier', unit: 'mm', kind: 'number', group: 'landing', ref: 'P', help: 'Dimension utile du palier intermediaire.' },
    diameter: { label: 'Diametre / emprise', unit: 'mm', kind: 'number', group: 'general', ref: 'D', help: 'Diametre ou emprise maximale disponible.' },
    turnSide: {
      label: 'Sens du tournant',
      kind: 'select',
      options: ['Droite', 'Gauche'],
      group: 'general',
      ref: 'S',
      help: 'Sens du quart tournant vu depuis le depart de l escalier.',
    },
    rotationDirection: {
      label: 'Sens de rotation',
      kind: 'select',
      options: ['Droite', 'Gauche'],
      group: 'general',
      ref: 'S',
      help: 'Sens de rotation vu depuis le depart.',
    },
    notes: { label: 'Notes de mesure', kind: 'textarea', group: 'notes', ref: 'N', help: 'Informations chantier utiles qui ne rentrent pas dans les cotes.' },
  };
  const MEASURE_GROUPS = [
    ['general', 'Dimensions generales'],
    ['opening', 'Tremie'],
    ['lowerFlight', 'Volee basse'],
    ['upperFlight', 'Volee haute'],
    ['landing', 'Palier'],
    ['safety', 'Securite et echappee'],
    ['notes', 'Informations complementaires'],
  ];
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
  let sketchAutoTracePoints = [];
  let sketchAutoTraceId = '';
  let sketchAutoTracePreviewPoint = null;
  let sketchAutoTraceDirections = [];
  let sketchAutoTraceDimensions = [];
  let sketchAutoTraceAngleDimensions = [];
  let sketchAutoTraceScaleMode = 'auto';
  let sketchAutoTraceScale = null;
  let sketchAutoTraceAnchor = null;
  let sketchAutoTraceHoverAnchor = null;
  let sketchSelectedAutoTraceSegment = null;
  let sketchDimensionRequest = null;
  let sketchInclinedRequest = null;
  let sketchAngleRequest = null;
  let sketchAngleFirstSegment = null;
  let sketchViewport = { scale: 1, offsetX: 0, offsetY: 0 };
  let sketchPointers = new Map();
  let sketchGesture = null;
  let sketchActivePointerId = null;
  let measurementsV2State = null;
  let activeMeasurementKey = '';
  let photosPanelOpen = false;

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

  function isRequiredMeasurement(key) {
    return (measurementConfig().required || []).includes(key);
  }

  function measurementStateClass(key) {
    if (key === activeMeasurementKey) return 'is-active';
    if (measureValue(key)) return 'is-complete';
    return isRequiredMeasurement(key) ? 'is-missing' : 'is-optional';
  }

  function measurementDisplayValue(key) {
    const value = measureValue(key);
    const def = MEASURE_FIELD_DEFS[key] || {};
    if (!value) return '—';
    if (def.kind === 'number') return `${value} mm`;
    return value;
  }

  function measurementShortLabel(key) {
    const def = MEASURE_FIELD_DEFS[key] || {};
    const value = measureValue(key);
    return `${def.ref || key}  ${value || '—'}`;
  }

  function measurementLegendLabel(key) {
    const def = MEASURE_FIELD_DEFS[key] || {};
    return `${def.ref || key} — ${def.label || key}`;
  }

  function renderCadDimension(key, x1, y1, x2, y2, tx, ty) {
    const def = MEASURE_FIELD_DEFS[key] || {};
    const className = measurementStateClass(key);
    const label = measurementShortLabel(key);
    const required = isRequiredMeasurement(key) ? 'obligatoire' : 'facultative';
    const isVertical = Math.abs(x1 - x2) < Math.abs(y1 - y2);
    const tick = 7;
    const ext = 16;
    const ext1 = isVertical
      ? `x1="${x1}" y1="${y1}" x2="${x1 - ext}" y2="${y1}"`
      : `x1="${x1}" y1="${y1}" x2="${x1}" y2="${y1 - ext}"`;
    const ext2 = isVertical
      ? `x1="${x2}" y1="${y2}" x2="${x2 - ext}" y2="${y2}"`
      : `x1="${x2}" y1="${y2}" x2="${x2}" y2="${y2 - ext}"`;
    const tickPath = isVertical
      ? `M${x1 - tick} ${y1 - tick}L${x1 + tick} ${y1 + tick}M${x2 - tick} ${y2 - tick}L${x2 + tick} ${y2 + tick}`
      : `M${x1 - tick} ${y1 + tick}L${x1 + tick} ${y1 - tick}M${x2 - tick} ${y2 + tick}L${x2 + tick} ${y2 - tick}`;
    return `
      <g class="measure-dimension ${className}" data-measure-key="${escapeHtml(key)}" tabindex="0" role="button" aria-label="${escapeHtml(`${def.label || key}, ${required}, ${measurementDisplayValue(key)}`)}">
        <line class="measure-hit" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />
        <line class="measure-ext" ${ext1} />
        <line class="measure-ext" ${ext2} />
        <line class="measure-line" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />
        <path class="measure-tick" d="${tickPath}" />
        <text class="measure-label" x="${tx}" y="${ty}">${escapeHtml(label)}</text>
      </g>
    `;
  }

  function renderCadNote(key, x, y) {
    const def = MEASURE_FIELD_DEFS[key] || {};
    return `
      <g class="measure-note ${measurementStateClass(key)}" data-measure-key="${escapeHtml(key)}" tabindex="0" role="button" aria-label="${escapeHtml(def.label || key)}">
        <circle class="measure-note-dot" cx="${x}" cy="${y}" r="14" />
        <text class="measure-note-text" x="${x}" y="${y + 5}">${escapeHtml(def.ref || '?')}</text>
      </g>
    `;
  }

  function renderPlanGeometry(type) {
    const planByType = {
      straight: `
        <rect class="cad-opening" x="100" y="120" width="390" height="155" />
        <rect class="cad-main cad-cut" x="140" y="172" width="300" height="70" />
        ${[170, 200, 230, 260, 290, 320, 350, 380, 410].map((x) => `<line class="cad-step" x1="${x}" y1="172" x2="${x}" y2="242" />`).join('')}
        <text class="cad-small-label" x="138" y="264">DÉPART</text>
        <text class="cad-small-label" x="382" y="164">ARRIVÉE</text>
        <path class="cad-walkline" d="M152 207H424" />
        <path class="cad-arrow" d="M424 207l-15-8M424 207l-15 8" />
        <text class="cad-rise-label" x="276" y="198">MONTÉE</text>
      `,
      quarter_low: `
        <path class="cad-opening" d="M95 80H505V365H95Z" />
        <path class="cad-main cad-cut" d="M140 250H320V110H390V320H140Z" />
        <line class="cad-step" x1="170" y1="250" x2="170" y2="320" />
        <line class="cad-step" x1="200" y1="250" x2="200" y2="320" />
        <line class="cad-step" x1="230" y1="250" x2="230" y2="320" />
        <line class="cad-step" x1="260" y1="250" x2="260" y2="320" />
        <line class="cad-step" x1="320" y1="250" x2="390" y2="222" />
        <line class="cad-step" x1="320" y1="250" x2="390" y2="194" />
        <line class="cad-step" x1="320" y1="250" x2="356" y2="180" />
        <line class="cad-step" x1="320" y1="220" x2="390" y2="220" />
        <line class="cad-step" x1="320" y1="190" x2="390" y2="190" />
        <line class="cad-step" x1="320" y1="160" x2="390" y2="160" />
        <text class="cad-small-label" x="140" y="342">DÉPART</text>
        <text class="cad-small-label" x="398" y="112">ARRIVÉE</text>
        <path class="cad-walkline" d="M156 285H294Q354 285 354 225V124" />
        <path class="cad-arrow" d="M354 124l-9 16M354 124l9 16" />
        <text class="cad-rise-label" x="260" y="276">MONTÉE</text>
      `,
      quarter_high: `
        <path class="cad-opening" d="M95 80H505V365H95Z" />
        <path class="cad-main cad-cut" d="M140 110H390V180H250V320H180V180H140Z" />
        <line class="cad-step" x1="170" y1="110" x2="170" y2="180" />
        <line class="cad-step" x1="200" y1="110" x2="200" y2="180" />
        <line class="cad-step" x1="230" y1="110" x2="250" y2="180" />
        <line class="cad-step" x1="250" y1="180" x2="180" y2="218" />
        <line class="cad-step" x1="250" y1="180" x2="180" y2="250" />
        <line class="cad-step" x1="250" y1="210" x2="180" y2="210" />
        <line class="cad-step" x1="250" y1="240" x2="180" y2="240" />
        <line class="cad-step" x1="250" y1="270" x2="180" y2="270" />
        <text class="cad-small-label" x="178" y="342">DÉPART</text>
        <text class="cad-small-label" x="392" y="108">ARRIVÉE</text>
        <path class="cad-walkline" d="M190 285V216Q190 145 262 145H376" />
        <path class="cad-arrow" d="M376 145l-15-8M376 145l-15 8" />
        <text class="cad-rise-label" x="214" y="226">MONTÉE</text>
      `,
      double_quarter: `
        <path class="cad-opening" d="M90 70H510V372H90Z" />
        <path class="cad-main cad-cut" d="M130 260H260V130H440V200H330V330H130Z" />
        <line class="cad-step" x1="165" y1="260" x2="165" y2="330" />
        <line class="cad-step" x1="200" y1="260" x2="200" y2="330" />
        <line class="cad-step" x1="235" y1="260" x2="235" y2="330" />
        <line class="cad-step" x1="260" y1="260" x2="330" y2="226" />
        <line class="cad-step" x1="260" y1="210" x2="440" y2="210" />
        <line class="cad-step" x1="300" y1="130" x2="300" y2="200" />
        <line class="cad-step" x1="340" y1="130" x2="340" y2="200" />
        <line class="cad-step" x1="330" y1="200" x2="330" y2="330" />
        <text class="cad-small-label" x="132" y="354">DÉPART</text>
        <text class="cad-small-label" x="442" y="126">ARRIVÉE</text>
        <path class="cad-walkline" d="M146 296H286Q310 296 310 272V166H424" />
        <path class="cad-arrow" d="M424 166l-15-8M424 166l-15 8" />
      `,
      landing_two_flights: `
        <path class="cad-opening" d="M95 85H500V345H95Z" />
        <path class="cad-main cad-cut" d="M140 245H260V190H345V135H420V220H260V315H140Z" />
        <line class="cad-step" x1="170" y1="245" x2="170" y2="315" />
        <line class="cad-step" x1="200" y1="245" x2="200" y2="315" />
        <line class="cad-step" x1="230" y1="245" x2="230" y2="315" />
        <line class="cad-step" x1="260" y1="190" x2="345" y2="190" />
        <line class="cad-step" x1="345" y1="158" x2="420" y2="158" />
        <line class="cad-step" x1="345" y1="188" x2="420" y2="188" />
        <text class="cad-small-label" x="142" y="338">DÉPART</text>
        <text class="cad-small-label" x="422" y="132">ARRIVÉE</text>
        <path class="cad-walkline" d="M156 280H306Q325 280 325 245V176H404" />
        <path class="cad-arrow" d="M404 176l-15-8M404 176l-15 8" />
      `,
      helical: `
        <circle class="cad-opening" cx="290" cy="205" r="122" />
        <circle class="cad-main cad-cut" cx="290" cy="205" r="78" />
        ${[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((angle) => {
          const rad = (angle * Math.PI) / 180;
          const x = 290 + Math.cos(rad) * 78;
          const y = 205 + Math.sin(rad) * 78;
          return `<line class="cad-step" x1="290" y1="205" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" />`;
        }).join('')}
        <text class="cad-small-label" x="206" y="300">DÉPART</text>
        <text class="cad-small-label" x="354" y="120">ARRIVÉE</text>
        <path class="cad-walkline" d="M254 245C226 210 242 154 292 146C344 139 372 196 343 235" />
        <path class="cad-arrow" d="M343 235l-2-15M343 235l-14-5" />
      `,
      other: `
        <rect class="cad-opening" x="105" y="120" width="370" height="170" />
        <path class="cad-main cad-cut" d="M150 175H430V245H150Z" stroke-dasharray="9 7" />
        <line class="cad-step" x1="150" y1="198" x2="430" y2="198" />
        <line class="cad-step" x1="150" y1="222" x2="430" y2="222" />
        <text class="cad-small-label" x="154" y="312">DÉPART</text>
        <text class="cad-small-label" x="386" y="170">ARRIVÉE</text>
        <path class="cad-walkline" d="M162 210H416" />
        <path class="cad-arrow" d="M416 210l-15-8M416 210l-15 8" />
      `,
    };
    return planByType[type] || planByType.straight;
  }

  function renderPlanDimensions(type) {
    if (type === 'straight' || type === 'other') {
      return [
        renderCadDimension('openingLength', 100, 72, 490, 72, 295, 58),
        renderCadDimension('openingWidth', 525, 120, 525, 275, 562, 198),
        renderCadDimension('totalRun', 140, 312, 440, 312, 290, 298),
        renderCadDimension('stairWidth', 462, 172, 462, 242, 504, 207),
      ].join('');
    }
    if (type === 'helical') {
      return [
        renderCadDimension('diameter', 168, 54, 412, 54, 290, 40),
        renderCadDimension('openingLength', 168, 360, 412, 360, 290, 346),
        renderCadDimension('openingWidth', 456, 83, 456, 327, 496, 205),
      ].join('');
    }
    if (type === 'landing_two_flights') {
      return [
        renderCadDimension('openingLength', 95, 58, 500, 58, 298, 44),
        renderCadDimension('openingWidth', 536, 85, 536, 345, 574, 215),
        renderCadDimension('lowerRun', 140, 362, 260, 362, 200, 348),
        renderCadDimension('landingLength', 260, 82, 345, 82, 302, 68),
        renderCadDimension('upperRun', 345, 300, 420, 300, 382, 286),
        renderCadDimension('stairWidth', 105, 245, 105, 315, 67, 280),
      ].join('');
    }
    if (type === 'double_quarter') {
      return [
        renderCadDimension('openingLength', 90, 48, 510, 48, 300, 34),
        renderCadDimension('openingWidth', 548, 70, 548, 372, 586, 221),
        renderCadDimension('lowerRun', 130, 372, 260, 372, 195, 358),
        renderCadDimension('upperRun', 330, 356, 440, 356, 385, 342),
        renderCadDimension('stairWidth', 100, 260, 100, 330, 62, 295),
      ].join('');
    }
    return [
      renderCadDimension('openingLength', 95, 52, 505, 52, 300, 38),
      renderCadDimension('openingWidth', 540, 80, 540, 365, 578, 222),
      renderCadDimension('lowerRun', 140, 350, 320, 350, 230, 336),
      renderCadDimension('upperRun', 420, 110, 420, 250, 458, 180),
      renderCadDimension('stairWidth', 112, 250, 112, 320, 74, 285),
    ].join('');
  }

  function renderSideElevation() {
    const type = measurementsV2State ? measurementsV2State.stairType : 'straight';
    const runKey = (type === 'straight' || type === 'other') ? 'totalRun' : (type === 'helical' ? 'diameter' : 'lowerRun');
    return `
      <g class="cad-elevation">
        <path class="cad-floor" d="M92 262H402" />
        <path class="cad-floor" d="M264 92H430" />
        <path class="cad-dalle" d="M264 92H430V118H282" />
        <path class="cad-main" d="M112 262H152V238H192V214H232V190H272V166H312V142H352V118H392V92" />
        <path class="cad-walkline" d="M112 262L392 92" />
        <text class="cad-small-label" x="100" y="286">Sol bas</text>
        <text class="cad-small-label" x="354" y="86">Sol haut</text>
        ${renderCadDimension('totalHeight', 468, 92, 468, 262, 438, 177)}
        ${renderCadDimension(runKey, 112, 318, 392, 318, 252, 304)}
        ${renderCadDimension('headroom', 306, 92, 306, 190, 266, 141)}
      </g>
    `;
  }

  function renderMeasurementLegend(type) {
    const config = measurementConfig();
    const keys = [...(config.required || []), ...(config.optional || [])].filter((key) => key !== 'notes');
    const visibleKeys = type === 'helical'
      ? keys.filter((key) => ['diameter', 'openingLength', 'openingWidth', 'totalHeight', 'headroom', 'rotationDirection'].includes(key))
      : keys.filter((key) => key !== 'turnSide' || type !== 'straight');
    return visibleKeys.map((key) => `
      <button type="button" class="measure-legend-item ${measurementStateClass(key)}" data-measure-key="${escapeHtml(key)}">
        ${escapeHtml(measurementLegendLabel(key))}
      </button>
    `).join('');
  }

  function renderMeasurementsV2Schema() {
    if (!measurementsV2Schema) return;
    const config = measurementConfig();
    const type = measurementsV2State ? measurementsV2State.stairType : 'straight';
    measurementsV2Schema.innerHTML = `
      <div class="measure-schema-grid">
        <figure class="measure-view">
          <figcaption>Vue en plan · ${escapeHtml(config.label)}</figcaption>
          <svg class="measurements-v2-svg" viewBox="0 0 620 420" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Vue en plan cotee ${escapeHtml(config.label)}">
            <rect class="cad-sheet" x="10" y="10" width="600" height="400" rx="2" />
            <text class="cad-unit-label" x="28" y="36">Cotes en mm</text>
            <g class="cad-plan">
              ${renderPlanGeometry(type)}
              ${renderPlanDimensions(type)}
            </g>
          </svg>
        </figure>
        <figure class="measure-view">
          <figcaption>Vue de côté</figcaption>
          <svg class="measurements-v2-svg" viewBox="0 0 520 360" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Vue de cote cotee ${escapeHtml(config.label)}">
            <rect class="cad-sheet" x="10" y="10" width="500" height="340" rx="2" />
            <text class="cad-unit-label" x="28" y="36">Cotes en mm</text>
            ${renderSideElevation()}
          </svg>
        </figure>
      </div>
      <div class="measure-legend" aria-label="Legende des reperes de mesure">
        ${renderMeasurementLegend(type)}
      </div>
      <p class="measure-schema-help">Touchez une cote ou un repère pour saisir la mesure correspondante.</p>
    `;
  }

  function renderMeasureInput(key, required) {
    const def = MEASURE_FIELD_DEFS[key] || { label: key, kind: 'text' };
    const value = measureValue(key);
    const badge = required ? 'Obligatoire' : 'Optionnel';
    const meta = [badge, def.unit].filter(Boolean).join(' · ');
    const fieldClass = `measure-field ${measurementStateClass(key)}${key === activeMeasurementKey ? ' is-active' : ''}`;
    const ref = def.ref ? `<strong>${escapeHtml(def.ref)}</strong>` : '';
    const help = def.help ? `<p>${escapeHtml(def.help)}</p>` : '';
    if (def.kind === 'select') {
      const options = (def.options || []).map((option) => `
        <option value="${escapeHtml(option)}"${value === option ? ' selected' : ''}>${escapeHtml(option)}</option>
      `).join('');
      return `
        <div class="${fieldClass}" data-measure-field="${escapeHtml(key)}">
          <label for="measure-${escapeHtml(key)}">${ref}<em>${escapeHtml(def.label)}</em> <span>${badge}</span></label>
          <select id="measure-${escapeHtml(key)}" data-measure-key="${escapeHtml(key)}">
            <option value="">A choisir</option>
            ${options}
          </select>
          ${help}
        </div>
      `;
    }
    if (def.kind === 'textarea') {
      return `
        <div class="${fieldClass}" data-measure-field="${escapeHtml(key)}">
          <label for="measure-${escapeHtml(key)}">${ref}<em>${escapeHtml(def.label)}</em> <span>${badge}</span></label>
          <textarea id="measure-${escapeHtml(key)}" data-measure-key="${escapeHtml(key)}">${escapeHtml(value)}</textarea>
          ${help}
        </div>
      `;
    }
    return `
      <div class="${fieldClass}" data-measure-field="${escapeHtml(key)}">
        <label for="measure-${escapeHtml(key)}">${ref}<em>${escapeHtml(def.label)}</em> <span>${escapeHtml(meta)}</span></label>
        <input id="measure-${escapeHtml(key)}" data-measure-key="${escapeHtml(key)}" type="text" inputmode="decimal" value="${escapeHtml(value)}" placeholder="${required ? 'A relever' : 'Optionnel'}" />
        ${help}
      </div>
    `;
  }

  function renderMeasurementsV2Fields() {
    if (!measurementsV2Fields) return;
    const config = measurementConfig();
    const required = config.required || [];
    const optional = config.optional || [];
    const keys = [...required, ...optional];
    measurementsV2Fields.innerHTML = MEASURE_GROUPS.map(([groupKey, groupLabel]) => {
      const groupKeys = keys.filter((key) => (MEASURE_FIELD_DEFS[key]?.group || 'general') === groupKey);
      if (!groupKeys.length) return '';
      return `
        <section class="measure-group measure-group-${escapeHtml(groupKey)}">
          <h5>${escapeHtml(groupLabel)}</h5>
          ${groupKeys.map((key) => renderMeasureInput(key, required.includes(key))).join('')}
        </section>
      `;
    }).join('');
  }

  function renderMeasurementsV2Checks() {
    if (!measurementsV2Checks || !measurementsV2Progress) return;
    const state = analyzeMeasurementsV2();
    const config = measurementConfig();
    const missingKeys = (config.required || []).filter((key) => !measureValue(key));
    const fieldWarnings = new Set([
      ...missingKeys,
      ...Object.keys(MEASURE_FIELD_DEFS).filter((key) => {
        const def = MEASURE_FIELD_DEFS[key];
        return def && def.kind === 'number' && measureValue(key) && (!measureNumber(key) || measureNumber(key) <= 0);
      }),
    ]);
    if (measureNumber('stairWidth') && measureNumber('openingWidth') && measureNumber('openingWidth') < measureNumber('stairWidth')) {
      fieldWarnings.add('openingWidth');
      fieldWarnings.add('stairWidth');
    }
    if (measureNumber('headroom') && measureNumber('headroom') < 1900) fieldWarnings.add('headroom');
    measurementsV2Progress.textContent = `${state.requiredCompleted} / ${state.requiredTotal}`;
    if (!state.warnings.length) {
      measurementsV2Checks.innerHTML = `
        <div class="measure-check-summary is-ok">
          <strong>Toutes les mesures obligatoires sont renseignées.</strong>
          <span>Contrôle visuel à faire avant validation chantier.</span>
        </div>
      `;
      return;
    }
    const missingText = `${missingKeys.length} mesure${missingKeys.length > 1 ? 's' : ''} obligatoire${missingKeys.length > 1 ? 's' : ''} manquante${missingKeys.length > 1 ? 's' : ''}`;
    const rows = Array.from(fieldWarnings).map((key) => {
      const def = MEASURE_FIELD_DEFS[key] || {};
      return `
        <button type="button" class="measure-check-row ${measurementStateClass(key)}" data-measure-key="${escapeHtml(key)}">
          <strong>${escapeHtml(def.ref || key)}</strong>
          <span>${escapeHtml(def.label || key)}</span>
        </button>
      `;
    }).join('');
    measurementsV2Checks.innerHTML = `
      <div class="measure-check-summary is-warning">
        <strong>Mesures à compléter</strong>
        <span>${escapeHtml(missingText)}</span>
        <div class="measure-check-list">${rows}</div>
      </div>
    `;
  }

  function renderMeasurementsV2() {
    if (!measurementsV2State) {
      measurementsV2State = createMeasurementsV2State(normalizeStairTypeKey(getValue('type_escalier')));
    }
    const config = measurementConfig();
    const availableKeys = [...(config.required || []), ...(config.optional || [])];
    if (activeMeasurementKey && !availableKeys.includes(activeMeasurementKey)) activeMeasurementKey = '';
    renderMeasurementsV2Schema();
    renderMeasurementsV2Fields();
    renderMeasurementsV2Checks();
  }

  function updateActiveMeasurementUi() {
    if (measurementsV2Schema) {
      measurementsV2Schema.querySelectorAll('[data-measure-key]').forEach((node) => {
        node.classList.toggle('is-active', node.getAttribute('data-measure-key') === activeMeasurementKey);
      });
    }
    if (measurementsV2Fields) {
      measurementsV2Fields.querySelectorAll('[data-measure-field]').forEach((node) => {
        node.classList.toggle('is-active', node.getAttribute('data-measure-field') === activeMeasurementKey);
      });
    }
  }

  function focusMeasurementField(key, scrollIntoView) {
    if (!measurementsV2Fields || !key) return;
    const field = Array.from(measurementsV2Fields.querySelectorAll('[data-measure-field]'))
      .find((node) => node.getAttribute('data-measure-field') === key);
    const input = Array.from(measurementsV2Fields.querySelectorAll('[data-measure-key]'))
      .find((node) => node.getAttribute('data-measure-key') === key);
    if (field && scrollIntoView) {
      field.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (input && typeof input.focus === 'function') {
      window.setTimeout(() => input.focus({ preventScroll: true }), scrollIntoView ? 220 : 0);
    }
  }

  function selectMeasurementKey(key, options) {
    if (!key || !MEASURE_FIELD_DEFS[key]) return;
    activeMeasurementKey = key;
    renderMeasurementsV2Schema();
    updateActiveMeasurementUi();
    if (options && options.focus) focusMeasurementField(key, Boolean(options.scroll));
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

  function setPhotosPanelOpen(open) {
    photosPanelOpen = Boolean(open);
    if (photosPanel) photosPanel.hidden = !photosPanelOpen;
    if (photosToggleBtn) {
      photosToggleBtn.setAttribute('aria-expanded', photosPanelOpen ? 'true' : 'false');
    }
    const photoSection = photosToggleBtn ? photosToggleBtn.closest('.photo-section') : null;
    if (photoSection) photoSection.classList.toggle('is-open', photosPanelOpen);
  }

  function openPhotosPanelForError() {
    setPhotosPanelOpen(true);
    if (photosToggleBtn && typeof photosToggleBtn.focus === 'function') {
      window.setTimeout(() => photosToggleBtn.focus({ preventScroll: true }), 0);
    }
  }

  function updatePhotoTotal() {
    if (!photoTotalCount) return;
    const total = normalizePhotoSlots(photoSlots).reduce((sum, slot) => sum + slot.photos.length, 0);
    photoTotalCount.textContent = `Photos (${total})`;
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

  function clampSketchViewport() {
    const size = sketchCssSize();
    const minOffsetX = size.cssWidth - size.cssWidth * sketchViewport.scale;
    const minOffsetY = size.cssHeight - size.cssHeight * sketchViewport.scale;
    const padX = size.cssWidth * 0.8;
    const padY = size.cssHeight * 0.8;
    sketchViewport.offsetX = Math.max(minOffsetX - padX, Math.min(padX, sketchViewport.offsetX));
    sketchViewport.offsetY = Math.max(minOffsetY - padY, Math.min(padY, sketchViewport.offsetY));
  }

  function updateSketchZoomLabel() {
    if (sketchZoomLabel) sketchZoomLabel.textContent = `${Math.round(sketchViewport.scale * 100)} %`;
  }

  function setSketchViewport(nextViewport) {
    sketchViewport = {
      scale: Math.max(0.5, Math.min(5, Number(nextViewport.scale || 1))),
      offsetX: Number(nextViewport.offsetX || 0),
      offsetY: Number(nextViewport.offsetY || 0),
    };
    clampSketchViewport();
    updateSketchZoomLabel();
    sketchRenderComposite();
  }

  function sketchScreenToDrawingPoint(point) {
    return {
      x: (point.x - sketchViewport.offsetX) / sketchViewport.scale,
      y: (point.y - sketchViewport.offsetY) / sketchViewport.scale,
    };
  }

  function sketchDrawingToScreenPoint(point) {
    return {
      x: point.x * sketchViewport.scale + sketchViewport.offsetX,
      y: point.y * sketchViewport.scale + sketchViewport.offsetY,
    };
  }

  function zoomSketchAt(screenPoint, nextScale) {
    const drawingPoint = sketchScreenToDrawingPoint(screenPoint);
    setSketchViewport({
      scale: nextScale,
      offsetX: screenPoint.x - drawingPoint.x * nextScale,
      offsetY: screenPoint.y - drawingPoint.y * nextScale,
    });
  }

  function zoomSketchBy(factor) {
    const size = sketchCssSize();
    zoomSketchAt({ x: size.cssWidth / 2, y: size.cssHeight / 2 }, sketchViewport.scale * factor);
  }

  function expandBounds(bounds, point) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return bounds;
    return {
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
    };
  }

  function collectSketchDrawingBounds() {
    let bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    const addPoint = (point) => {
      bounds = expandBounds(bounds, point);
    };
    sketchAnnotations.forEach((annotation) => {
      const item = normalizeSketchAnnotation(annotation);
      if (!item) return;
      if (item.type === 'auto_trace') {
        autoTraceCanvasPointsForItem(item).forEach(addPoint);
        return;
      }
      if (item.type === 'symbol' || item.type === 'text' || item.type === 'marker') {
        addPoint(sketchUnitToCanvasPoint(item.x, item.y));
        return;
      }
      if (Number.isFinite(item.x1) && Number.isFinite(item.y1)) addPoint(sketchUnitToCanvasPoint(item.x1, item.y1));
      if (Number.isFinite(item.x2) && Number.isFinite(item.y2)) addPoint(sketchUnitToCanvasPoint(item.x2, item.y2));
    });
    const draft = sketchDraftAnnotation ? normalizeSketchAnnotation(sketchDraftAnnotation) : null;
    if (draft && draft.type === 'auto_trace') autoTraceCanvasPointsForItem(draft).forEach(addPoint);
    return Number.isFinite(bounds.minX) ? bounds : null;
  }

  function fitSketchViewport() {
    const size = sketchCssSize();
    const bounds = collectSketchDrawingBounds();
    if (!bounds) {
      setSketchViewport({ scale: 1, offsetX: 0, offsetY: 0 });
      return;
    }
    const margin = 48;
    const width = Math.max(1, bounds.maxX - bounds.minX);
    const height = Math.max(1, bounds.maxY - bounds.minY);
    const scale = Math.max(0.5, Math.min(5, Math.min(
      (size.cssWidth - margin * 2) / width,
      (size.cssHeight - margin * 2) / height
    )));
    setSketchViewport({
      scale,
      offsetX: (size.cssWidth - width * scale) / 2 - bounds.minX * scale,
      offsetY: (size.cssHeight - height * scale) / 2 - bounds.minY * scale,
    });
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

  function normalizeAutoTraceSide(value, fallback = 'right') {
    const side = String(value || '').trim();
    return ['top', 'bottom', 'left', 'right'].includes(side) ? side : fallback;
  }

  function normalizeAutoTraceDimension(value, segmentCount) {
    if (!value || typeof value !== 'object') return null;
    const segmentIndex = Math.floor(Number(value.segmentIndex));
    if (!Number.isFinite(segmentIndex) || segmentIndex < 0 || segmentIndex >= segmentCount) return null;
    const rawValue = String(value.value ?? '').trim();
    if (!rawValue) return null;
    const numberValue = Number(String(rawValue).replace(',', '.'));
    return {
      segmentIndex,
      value: Number.isFinite(numberValue) ? numberValue : rawValue.slice(0, 40),
      unit: String(value.unit || 'mm').trim() || 'mm',
      side: normalizeAutoTraceSide(value.side),
    };
  }

  function normalizeAutoTraceScaleMode(value) {
    const mode = String(value || 'auto').trim();
    if (mode === 'auto') return 'auto';
    return AUTO_TRACE_SCALE_OPTIONS.includes(Number(mode)) ? String(Number(mode)) : 'auto';
  }

  function normalizeAutoTraceScale(value) {
    const scale = Number(value);
    return Number.isFinite(scale) && scale > 0 ? scale : null;
  }

  function autoTraceDirectionFromPoints(p1, p2) {
    const dx = Number(p2 && p2.x) - Number(p1 && p1.x);
    const dy = Number(p2 && p2.y) - Number(p1 && p1.y);
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
    return dy >= 0 ? 'down' : 'up';
  }

  function normalizeAutoTraceDirection(value, p1, p2) {
    const direction = String(value || '').trim();
    if (['up', 'down', 'left', 'right'].includes(direction)) return direction;
    if (direction.startsWith('angle:')) {
      return `angle:${normalizeAngleDegrees(direction.slice(6))}`;
    }
    return autoTraceDirectionFromPoints(p1, p2);
  }

  function normalizeAngleDegrees(value) {
    const number = Number(String(value ?? '').replace(',', '.'));
    if (!Number.isFinite(number)) return 0;
    return ((number % 360) + 360) % 360;
  }

  function directionAngleDegrees(direction) {
    const value = String(direction || '').trim();
    if (value === 'right') return 0;
    if (value === 'up') return 90;
    if (value === 'left') return 180;
    if (value === 'down') return 270;
    if (value.startsWith('angle:')) return normalizeAngleDegrees(value.slice(6));
    return 0;
  }

  function directionFromAngle(angle) {
    return `angle:${normalizeAngleDegrees(angle)}`;
  }

  function normalizeAutoTraceAngleDimension(value, segmentCount) {
    if (!value || typeof value !== 'object') return null;
    const refTraceId = String(value.refTraceId || '').trim();
    const refSegmentIndex = Math.floor(Number(value.refSegmentIndex));
    const segmentA = refTraceId ? -1 : Math.floor(Number(value.segmentA));
    const segmentB = Math.floor(Number(value.segmentB));
    if (!Number.isFinite(segmentB) || segmentB < 0 || segmentB >= segmentCount) return null;
    if (refTraceId) {
      if (!Number.isFinite(refSegmentIndex) || refSegmentIndex < 0) return null;
    } else if (!Number.isFinite(segmentA) || segmentA < 0 || segmentA >= segmentCount || segmentA === segmentB) {
      return null;
    }
    return {
      id: String(value.id || makeAutoTraceId()).trim(),
      segmentA,
      segmentB,
      refTraceId,
      refSegmentIndex: refTraceId ? refSegmentIndex : null,
      inverted: Boolean(value.inverted),
      auto: Boolean(value.auto),
      hidden: Boolean(value.hidden),
      radius: Math.max(20, Math.min(120, Number(value.radius || 42))),
    };
  }

  function makeAutoTraceId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return `trace-${window.crypto.randomUUID()}`;
    }
    return `trace-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function normalizeAutoTraceId(value) {
    const id = String(value || '').trim();
    return id || makeAutoTraceId();
  }

  function normalizeAutoTraceAnchor(value) {
    if (!value || typeof value !== 'object') return null;
    const traceId = String(value.traceId || '').trim();
    const pointIndex = Math.floor(Number(value.pointIndex));
    if (!traceId || !Number.isFinite(pointIndex) || pointIndex < 0) return null;
    return { traceId, pointIndex };
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
    if (type === 'auto_trace') {
      const points = (Array.isArray(annotation.points) ? annotation.points : [])
        .map((point) => ({
          x: normalizeUnit(point && point.x),
          y: normalizeUnit(point && point.y),
        }))
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
      const directions = points.slice(0, -1).map((point, index) => normalizeAutoTraceDirection(
        Array.isArray(annotation.directions) ? annotation.directions[index] : '',
        point,
        points[index + 1]
      ));
      return {
        ...base,
        id: normalizeAutoTraceId(annotation.id),
        points,
        directions,
        anchor: normalizeAutoTraceAnchor(annotation.anchor),
        scaleMode: normalizeAutoTraceScaleMode(annotation.scaleMode),
        scale: normalizeAutoTraceScale(annotation.scale),
        dimensions: (Array.isArray(annotation.dimensions) ? annotation.dimensions : [])
          .map((dimension) => normalizeAutoTraceDimension(dimension, Math.max(0, points.length - 1)))
          .filter(Boolean),
        angleDimensions: (Array.isArray(annotation.angleDimensions) ? annotation.angleDimensions : [])
          .map((dimension) => normalizeAutoTraceAngleDimension(dimension, Math.max(0, points.length - 1)))
          .filter(Boolean),
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
    const annotations = (Array.isArray(value) ? value : [])
      .map(normalizeSketchAnnotation)
      .filter(Boolean);
    const traces = new Map();
    annotations.forEach((annotation) => {
      if (annotation.type === 'auto_trace') traces.set(annotation.id, annotation);
    });
    annotations.forEach((annotation) => {
      if (annotation.type !== 'auto_trace' || !annotation.anchor) return;
      const parent = traces.get(annotation.anchor.traceId);
      if (!parent || !parent.points[annotation.anchor.pointIndex]) annotation.anchor = null;
    });
    annotations.forEach((annotation) => {
      if (annotation.type === 'auto_trace') ensureAutoAngleDimensions(annotation, traces);
    });
    return annotations;
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

  function formatSketchDimensionValue(dimension) {
    const value = dimension && dimension.value;
    const unit = String((dimension && dimension.unit) || 'mm').trim() || 'mm';
    const number = Number(value);
    const label = Number.isFinite(number)
      ? number.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
      : String(value || '').trim();
    return label ? `${label} ${unit}` : '';
  }

  function autoTraceDefaultSide(p1, p2) {
    return Math.abs(p2.x - p1.x) >= Math.abs(p2.y - p1.y) ? 'top' : 'right';
  }

  function autoTraceToggleSide(p1, p2, currentSide) {
    const horizontal = Math.abs(p2.x - p1.x) >= Math.abs(p2.y - p1.y);
    if (horizontal) return currentSide === 'bottom' ? 'top' : 'bottom';
    return currentSide === 'left' ? 'right' : 'left';
  }

  function dimensionSideLabel(side) {
    if (side === 'top') return 'au-dessus';
    if (side === 'bottom') return 'en dessous';
    if (side === 'left') return 'à gauche';
    return 'à droite';
  }

  function drawDimensionArrow(ctx, from, to, size) {
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - size * Math.cos(angle - Math.PI / 6), to.y - size * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - size * Math.cos(angle + Math.PI / 6), to.y - size * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  }

  function autoTraceDimensionGeometry(p1, p2, side, width) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const horizontal = Math.abs(dy) < 0.5;
    const vertical = Math.abs(dx) < 0.5;
    const offset = Math.max(18, width * 7);
    const attach = Math.max(9, width * 4);
    if (!horizontal && !vertical) {
      const length = Math.max(1, Math.hypot(dx, dy));
      const nx = -dy / length;
      const ny = dx / length;
      const sign = side === 'bottom' || side === 'right' ? 1 : -1;
      const ox = nx * offset * sign;
      const oy = ny * offset * sign;
      return {
        horizontal: false,
        a: { x: p1.x + ox, y: p1.y + oy },
        b: { x: p2.x + ox, y: p2.y + oy },
        ext1a: { x: p1.x, y: p1.y },
        ext1b: { x: p1.x + ox + nx * attach * sign, y: p1.y + oy + ny * attach * sign },
        ext2a: { x: p2.x, y: p2.y },
        ext2b: { x: p2.x + ox + nx * attach * sign, y: p2.y + oy + ny * attach * sign },
        text: { x: (p1.x + p2.x) / 2 + ox, y: (p1.y + p2.y) / 2 + oy - 4, baseline: 'bottom', align: 'center' },
      };
    }
    const sign = horizontal
      ? (side === 'bottom' ? 1 : -1)
      : (side === 'left' ? -1 : 1);
    if (horizontal) {
      const y = p1.y + sign * offset;
      return {
        horizontal,
        a: { x: p1.x, y },
        b: { x: p2.x, y },
        ext1a: { x: p1.x, y: p1.y },
        ext1b: { x: p1.x, y: y + sign * attach },
        ext2a: { x: p2.x, y: p2.y },
        ext2b: { x: p2.x, y: y + sign * attach },
        text: { x: (p1.x + p2.x) / 2, y: y + sign * -4, baseline: sign < 0 ? 'bottom' : 'top' },
      };
    }
    const x = p1.x + sign * offset;
    return {
      horizontal,
      a: { x, y: p1.y },
      b: { x, y: p2.y },
      ext1a: { x: p1.x, y: p1.y },
      ext1b: { x: x + sign * attach, y: p1.y },
      ext2a: { x: p2.x, y: p2.y },
      ext2b: { x: x + sign * attach, y: p2.y },
      text: { x: x + sign * 8, y: (p1.y + p2.y) / 2, baseline: 'middle', align: sign < 0 ? 'right' : 'left' },
    };
  }

  function drawAutoTraceDimension(ctx, p1, p2, dimension, color, width) {
    const side = normalizeAutoTraceSide(dimension.side, autoTraceDefaultSide(p1, p2));
    const geometry = autoTraceDimensionGeometry(p1, p2, side, width);
    const arrow = Math.max(7, width * 3);
    const label = formatSketchDimensionValue(dimension);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(1, width * 0.65);
    ctx.beginPath();
    ctx.moveTo(geometry.ext1a.x, geometry.ext1a.y);
    ctx.lineTo(geometry.ext1b.x, geometry.ext1b.y);
    ctx.moveTo(geometry.ext2a.x, geometry.ext2a.y);
    ctx.lineTo(geometry.ext2b.x, geometry.ext2b.y);
    ctx.moveTo(geometry.a.x, geometry.a.y);
    ctx.lineTo(geometry.b.x, geometry.b.y);
    ctx.stroke();
    drawDimensionArrow(ctx, geometry.b, geometry.a, arrow);
    drawDimensionArrow(ctx, geometry.a, geometry.b, arrow);
    if (label) {
      ctx.font = `700 ${Math.max(14, width * 4 + 9)}px Arial, sans-serif`;
      ctx.textAlign = geometry.text.align || 'center';
      ctx.textBaseline = geometry.text.baseline || 'bottom';
      ctx.fillText(label, geometry.text.x, geometry.text.y);
    }
    ctx.restore();
  }

  function commonVertexForSegments(canvasPoints, segmentA, segmentB) {
    const a1 = canvasPoints[segmentA];
    const a2 = canvasPoints[segmentA + 1];
    const b1 = canvasPoints[segmentB];
    const b2 = canvasPoints[segmentB + 1];
    if (!a1 || !a2 || !b1 || !b2) return null;
    if (segmentA + 1 === segmentB) return { vertex: a2, pA: a1, pB: b2 };
    if (segmentB + 1 === segmentA) return { vertex: a1, pA: a2, pB: b1 };
    return null;
  }

  function commonVertexForAngleDimension(canvasPoints, angleDimension) {
    if (angleDimension.refTraceId) {
      const found = findAutoTraceById(angleDimension.refTraceId);
      if (!found || !found.item) return null;
      const parentPoints = autoTraceCanvasPointsForItem(found.item);
      const parentA = parentPoints[angleDimension.refSegmentIndex];
      const parentB = parentPoints[angleDimension.refSegmentIndex + 1];
      const branchA = canvasPoints[angleDimension.segmentB];
      const branchB = canvasPoints[angleDimension.segmentB + 1];
      if (!parentA || !parentB || !branchA || !branchB) return null;
      const anchorPoint = branchA;
      const pA = Math.hypot(parentA.x - anchorPoint.x, parentA.y - anchorPoint.y) <= Math.hypot(parentB.x - anchorPoint.x, parentB.y - anchorPoint.y)
        ? parentB
        : parentA;
      return { vertex: anchorPoint, pA, pB: branchB };
    }
    return commonVertexForSegments(canvasPoints, angleDimension.segmentA, angleDimension.segmentB);
  }

  function angleBetweenVectors(v1, v2) {
    const len1 = Math.max(1, Math.hypot(v1.x, v1.y));
    const len2 = Math.max(1, Math.hypot(v2.x, v2.y));
    const dot = (v1.x * v2.x + v1.y * v2.y) / (len1 * len2);
    return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
  }

  function isStraightAngle(value) {
    const angle = Math.abs(normalizeAngleDegrees(value));
    return angle < 0.5 || Math.abs(angle - 180) < 0.5 || Math.abs(angle - 360) < 0.5;
  }

  function formatAngleValue(value) {
    const rounded = Math.round(Number(value) * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}°`;
  }

  function angleDimensionKey(traceId, segmentA, segmentB) {
    return `${String(traceId || 'trace')}-angle-${Math.min(segmentA, segmentB)}-${Math.max(segmentA, segmentB)}`;
  }

  function parentSegmentIndexForAnchor(anchor, traceMap) {
    const parent = traceMap && anchor ? traceMap.get(anchor.traceId) : ((anchor && anchor.traceId ? findAutoTraceById(anchor.traceId) : null) || {}).item;
    if (!parent || parent.type !== 'auto_trace') return null;
    const pointIndex = Number(anchor.pointIndex);
    const candidates = [];
    if (pointIndex > 0) candidates.push(pointIndex - 1);
    if (pointIndex < parent.points.length - 1) candidates.push(pointIndex);
    return candidates.length === 1 ? candidates[0] : null;
  }

  function ensureAutoAngleDimensions(annotation, traceMap) {
    if (!annotation || annotation.type !== 'auto_trace') return annotation;
    const segmentCount = Math.max(0, (annotation.points || []).length - 1);
    if (segmentCount < 1) return annotation;
    const list = Array.isArray(annotation.angleDimensions) ? [...annotation.angleDimensions] : [];
    if (annotation.anchor && segmentCount >= 1) {
      const parentSegmentIndex = parentSegmentIndexForAnchor(annotation.anchor, traceMap);
      const exists = list.some((dimension) => dimension.refTraceId === annotation.anchor.traceId && Number(dimension.refSegmentIndex) === Number(parentSegmentIndex) && Number(dimension.segmentB) === 0);
      if (parentSegmentIndex !== null && !exists) {
        list.push({
          id: `${annotation.id}-angle-parent-${annotation.anchor.traceId}-${parentSegmentIndex}-0`,
          refTraceId: annotation.anchor.traceId,
          refSegmentIndex: parentSegmentIndex,
          segmentA: -1,
          segmentB: 0,
          inverted: false,
          auto: true,
          hidden: false,
          radius: 42,
        });
      }
    }
    if (segmentCount < 2) {
      annotation.angleDimensions = list;
      return annotation;
    }
    for (let index = 1; index < segmentCount; index += 1) {
      const segmentA = index - 1;
      const segmentB = index;
      if (existingAngleDimension(list, segmentA, segmentB)) continue;
      const a = directionAngleDegrees((annotation.directions || [])[segmentA]) + 180;
      const b = directionAngleDegrees((annotation.directions || [])[segmentB]);
      let delta = Math.abs(normalizeAngleDegrees(b - a));
      if (delta > 180) delta = 360 - delta;
      if (isStraightAngle(delta)) continue;
      list.push({
        id: angleDimensionKey(annotation.id, segmentA, segmentB),
      segmentA,
      segmentB,
      inverted: false,
      auto: true,
      hidden: false,
      radius: 42,
    });
    }
    annotation.angleDimensions = list;
    return annotation;
  }

  function drawAutoTraceAngleDimension(ctx, canvasPoints, angleDimension, color, width) {
    const common = commonVertexForAngleDimension(canvasPoints, angleDimension);
    if (!common) return;
    const radius = Math.max(22, Number(angleDimension.radius || 42));
    const v1 = { x: common.pA.x - common.vertex.x, y: common.pA.y - common.vertex.y };
    const v2 = { x: common.pB.x - common.vertex.x, y: common.pB.y - common.vertex.y };
    let a1 = Math.atan2(v1.y, v1.x);
    let a2 = Math.atan2(v2.y, v2.x);
    let delta = a2 - a1;
    while (delta <= -Math.PI) delta += Math.PI * 2;
    while (delta > Math.PI) delta -= Math.PI * 2;
    if (angleDimension.inverted) {
      if (delta > 0) delta -= Math.PI * 2;
      else delta += Math.PI * 2;
    }
    const mid = a1 + delta / 2;
    const labelAngle = angleDimension.inverted ? 360 - angleBetweenVectors(v1, v2) : angleBetweenVectors(v1, v2);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(1, width * 0.6);
    ctx.beginPath();
    ctx.arc(common.vertex.x, common.vertex.y, radius, a1, a1 + delta, delta < 0);
    ctx.stroke();
    const t1 = { x: common.vertex.x + Math.cos(a1) * radius, y: common.vertex.y + Math.sin(a1) * radius };
    const t2 = { x: common.vertex.x + Math.cos(a1 + delta) * radius, y: common.vertex.y + Math.sin(a1 + delta) * radius };
    ctx.beginPath();
    ctx.arc(t1.x, t1.y, 2.5, 0, Math.PI * 2);
    ctx.arc(t2.x, t2.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `700 ${Math.max(13, width * 4 + 8)}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(formatAngleValue(labelAngle), common.vertex.x + Math.cos(mid) * (radius + 18), common.vertex.y + Math.sin(mid) * (radius + 18));
    ctx.restore();
  }

  function angleDimensionHitInfo(canvasPoints, angleDimension) {
    const common = commonVertexForAngleDimension(canvasPoints, angleDimension);
    if (!common) return null;
    const radius = Math.max(22, Number(angleDimension.radius || 42));
    const v1 = { x: common.pA.x - common.vertex.x, y: common.pA.y - common.vertex.y };
    const v2 = { x: common.pB.x - common.vertex.x, y: common.pB.y - common.vertex.y };
    let a1 = Math.atan2(v1.y, v1.x);
    let a2 = Math.atan2(v2.y, v2.x);
    let delta = a2 - a1;
    while (delta <= -Math.PI) delta += Math.PI * 2;
    while (delta > Math.PI) delta -= Math.PI * 2;
    if (angleDimension.inverted) {
      if (delta > 0) delta -= Math.PI * 2;
      else delta += Math.PI * 2;
    }
    const mid = a1 + delta / 2;
    return {
      vertex: common.vertex,
      radius,
      label: {
        x: common.vertex.x + Math.cos(mid) * (radius + 18),
        y: common.vertex.y + Math.sin(mid) * (radius + 18),
      },
    };
  }

  function findAutoTraceAngleAtPoint(canvasPoint) {
    const tolerance = 22 / Math.max(0.5, sketchViewport.scale);
    const inspect = (source, item, annotationIndex) => {
      const canvasPoints = autoTraceCanvasPointsForItem(item);
      for (const dimension of (item.angleDimensions || [])) {
        if (dimension.hidden) continue;
        const hit = angleDimensionHitInfo(canvasPoints, dimension);
        if (!hit) continue;
        const radialDistance = Math.abs(Math.hypot(canvasPoint.x - hit.vertex.x, canvasPoint.y - hit.vertex.y) - hit.radius);
        const labelDistance = Math.hypot(canvasPoint.x - hit.label.x, canvasPoint.y - hit.label.y);
        if (radialDistance <= tolerance || labelDistance <= tolerance + 8) {
          return {
            source,
            annotationIndex,
            segmentIndex: dimension.segmentB,
            dimension,
          };
        }
      }
      return null;
    };
    if (sketchAutoTracePoints.length > 1) {
      const draft = makeAutoTraceAnnotation(sketchAutoTracePoints, sketchAutoTraceDimensions, {
        id: sketchAutoTraceId,
        anchor: sketchAutoTraceAnchor,
        directions: sketchAutoTraceDirections,
        angleDimensions: sketchAutoTraceAngleDimensions,
        scaleMode: sketchAutoTraceScaleMode,
        scale: sketchAutoTraceScale,
      });
      const hit = inspect('draft', draft, -1);
      if (hit) return hit;
    }
    for (let index = sketchAnnotations.length - 1; index >= 0; index -= 1) {
      const item = normalizeSketchAnnotation(sketchAnnotations[index]);
      if (!item || item.type !== 'auto_trace') continue;
      const hit = inspect('annotation', item, index);
      if (hit) return hit;
    }
    return null;
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

    if (item.type === 'auto_trace') {
      const points = Array.isArray(item.points) ? item.points : [];
      if (!points.length) {
        ctx.restore();
        return;
      }
      const canvasPoints = autoTraceCanvasPointsForItem(item);
      if (canvasPoints.length > 1) {
        ctx.beginPath();
        ctx.moveTo(canvasPoints[0].x, canvasPoints[0].y);
        canvasPoints.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
        ctx.stroke();
      }
      if (
        sketchSelectedAutoTraceSegment &&
        ((sketchSelectedAutoTraceSegment.source === 'annotation' && sketchSelectedAutoTraceSegment.annotationIndex === index) ||
          (sketchSelectedAutoTraceSegment.source === 'draft' && !Number.isInteger(index))) &&
        canvasPoints[sketchSelectedAutoTraceSegment.segmentIndex] &&
        canvasPoints[sketchSelectedAutoTraceSegment.segmentIndex + 1]
      ) {
        const a = canvasPoints[sketchSelectedAutoTraceSegment.segmentIndex];
        const b = canvasPoints[sketchSelectedAutoTraceSegment.segmentIndex + 1];
        ctx.save();
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = Math.max(width + 4, 6);
        ctx.globalAlpha = 0.78;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.restore();
      }
      (item.dimensions || []).forEach((dimension) => {
        const a = canvasPoints[dimension.segmentIndex];
        const b = canvasPoints[dimension.segmentIndex + 1];
        if (a && b) drawAutoTraceDimension(ctx, a, b, dimension, color, width);
      });
      (item.angleDimensions || []).forEach((dimension) => {
        if (dimension.hidden) return;
        drawAutoTraceAngleDimension(ctx, canvasPoints, dimension, color, width);
      });
      canvasPoints.forEach((point) => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, Math.max(4, width * 1.6), 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1, width * 0.45);
        ctx.stroke();
        ctx.restore();
      });
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

    sketchCtx.save();
    sketchCtx.translate(sketchViewport.offsetX, sketchViewport.offsetY);
    sketchCtx.scale(sketchViewport.scale, sketchViewport.scale);

    if (sketchBackgroundImage) {
      sketchCtx.drawImage(sketchBackgroundImage, 0, 0, size.cssWidth, size.cssHeight);
    }

    sketchCtx.drawImage(sketchInkCanvas, 0, 0, size.cssWidth, size.cssHeight);
    if (includeAnnotations) {
      sketchAnnotations.forEach((annotation, index) => drawSketchAnnotation(sketchCtx, annotation, index));
      if (sketchDraftAnnotation) drawSketchAnnotation(sketchCtx, sketchDraftAnnotation);
      drawAutoTraceAnchorHalo(sketchCtx);
    }
    sketchCtx.restore();
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
    sketchAutoTracePoints = [];
    sketchAutoTraceId = '';
    sketchAutoTracePreviewPoint = null;
    sketchAutoTraceDirections = [];
    sketchAutoTraceDimensions = [];
    sketchAutoTraceAngleDimensions = [];
    sketchAutoTraceScaleMode = 'auto';
    sketchAutoTraceScale = null;
    sketchAutoTraceAnchor = null;
    sketchAutoTraceHoverAnchor = null;
    sketchSelectedAutoTraceSegment = null;
    updateAutoTraceControls();
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

  function sketchScreenPoint(event) {
    const rect = sketchCanvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function sketchCanvasPoint(event) {
    return sketchScreenToDrawingPoint(sketchScreenPoint(event));
  }

  function activeTouchPointers() {
    return [...sketchPointers.values()].filter((pointer) => pointer.pointerType === 'touch');
  }

  function startSketchPinchGesture() {
    const touches = activeTouchPointers();
    if (touches.length < 2) return;
    const a = touches[0];
    const b = touches[1];
    const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    sketchGesture = {
      type: 'pinch',
      startDistance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
      startCenter: center,
      startScale: sketchViewport.scale,
      startOffsetX: sketchViewport.offsetX,
      startOffsetY: sketchViewport.offsetY,
      drawingCenter: sketchScreenToDrawingPoint(center),
    };
    sketchDrawing = false;
    sketchActivePointerId = null;
    sketchMoveState = null;
    sketchDraftAnnotation = null;
    sketchAutoTracePreviewPoint = null;
  }

  function updateSketchPinchGesture() {
    if (!sketchGesture || sketchGesture.type !== 'pinch') return false;
    const touches = activeTouchPointers();
    if (touches.length < 2) return false;
    const a = touches[0];
    const b = touches[1];
    const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const distance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
    const nextScale = Math.max(0.5, Math.min(5, sketchGesture.startScale * (distance / sketchGesture.startDistance)));
    setSketchViewport({
      scale: nextScale,
      offsetX: center.x - sketchGesture.drawingCenter.x * nextScale,
      offsetY: center.y - sketchGesture.drawingCenter.y * nextScale,
    });
    return true;
  }

  function startSketchPanGesture(screenPoint, pointerId) {
    sketchGesture = {
      type: 'pan',
      pointerId,
      startX: screenPoint.x,
      startY: screenPoint.y,
      startOffsetX: sketchViewport.offsetX,
      startOffsetY: sketchViewport.offsetY,
    };
  }

  function updateSketchPanGesture(screenPoint) {
    if (!sketchGesture || sketchGesture.type !== 'pan') return false;
    setSketchViewport({
      scale: sketchViewport.scale,
      offsetX: sketchGesture.startOffsetX + screenPoint.x - sketchGesture.startX,
      offsetY: sketchGesture.startOffsetY + screenPoint.y - sketchGesture.startY,
    });
    return true;
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

  function autoTraceDirectionsFromPoints(points) {
    return (Array.isArray(points) ? points : []).slice(0, -1)
      .map((point, index) => autoTraceDirectionFromPoints(point, points[index + 1]));
  }

  function makeAutoTraceAnnotation(points, dimensions, options = {}) {
    const cleanPoints = Array.isArray(points) ? points : [];
    return ensureAutoAngleDimensions(normalizeSketchAnnotation({
      type: 'auto_trace',
      id: options.id || makeAutoTraceId(),
      points: cleanPoints,
      directions: Array.isArray(options.directions) ? options.directions : autoTraceDirectionsFromPoints(cleanPoints),
      anchor: options.anchor || null,
      dimensions: Array.isArray(dimensions) ? dimensions : [],
      angleDimensions: Array.isArray(options.angleDimensions) ? options.angleDimensions : [],
      scaleMode: options.scaleMode || 'auto',
      scale: options.scale || null,
      color: sketchColor,
      width: Math.max(1, sketchSize * 2),
    }));
  }

  function autoTraceDimensionValueMm(dimension) {
    const value = Number(String(dimension && dimension.value).replace(',', '.'));
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function validateAutoTraceDimensions(points, dimensions) {
    const segmentCount = Math.max(0, (Array.isArray(points) ? points.length : 0) - 1);
    for (let index = 0; index < segmentCount; index += 1) {
      const dimension = dimensionForSegment(dimensions, index);
      if (!dimension || autoTraceDimensionValueMm(dimension) === null) {
        return { ok: false, message: `Cote manquante sur le segment ${index + 1}` };
      }
    }
    return { ok: segmentCount > 0, message: segmentCount > 0 ? '' : 'Tracez au moins un segment' };
  }

  function autoTraceBuildCanvasPoints(points, dimensions, directions, scale) {
    const start = sketchUnitToCanvasPoint(points[0].x, points[0].y);
    const canvasPoints = [{ x: start.x, y: start.y }];
    for (let index = 0; index < points.length - 1; index += 1) {
      const previous = canvasPoints[canvasPoints.length - 1];
      const lengthMm = autoTraceDimensionValueMm(dimensionForSegment(dimensions, index));
      if (lengthMm === null) return null;
      const pixelLength = (lengthMm / scale) * CSS_PIXELS_PER_MILLIMETER;
      const direction = normalizeAutoTraceDirection(
        Array.isArray(directions) ? directions[index] : '',
        points[index],
        points[index + 1]
      );
      if (direction === 'up') canvasPoints.push({ x: previous.x, y: previous.y - pixelLength });
      if (direction === 'down') canvasPoints.push({ x: previous.x, y: previous.y + pixelLength });
      if (direction === 'left') canvasPoints.push({ x: previous.x - pixelLength, y: previous.y });
      if (direction === 'right') canvasPoints.push({ x: previous.x + pixelLength, y: previous.y });
      if (String(direction).startsWith('angle:')) {
        const angle = normalizeAngleDegrees(String(direction).slice(6));
        const radians = (angle * Math.PI) / 180;
        canvasPoints.push({
          x: previous.x + pixelLength * Math.cos(radians),
          y: previous.y - pixelLength * Math.sin(radians),
        });
      }
    }
    return canvasPoints;
  }

  function autoTraceBounds(canvasPoints) {
    return canvasPoints.reduce((bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
    }), {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    });
  }

  function autoTraceFitsCanvas(canvasPoints, margin) {
    const size = sketchCssSize();
    const bounds = autoTraceBounds(canvasPoints);
    return (
      bounds.maxX - bounds.minX <= Math.max(1, size.cssWidth - margin * 2) &&
      bounds.maxY - bounds.minY <= Math.max(1, size.cssHeight - margin * 2)
    );
  }

  function autoTraceCenterCanvasPoints(canvasPoints, margin) {
    const size = sketchCssSize();
    const bounds = autoTraceBounds(canvasPoints);
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    const offsetX = Math.max(margin, (size.cssWidth - width) / 2) - bounds.minX;
    const offsetY = Math.max(margin, (size.cssHeight - height) / 2) - bounds.minY;
    return canvasPoints.map((point) => ({
      x: point.x + offsetX,
      y: point.y + offsetY,
    }));
  }

  function autoTraceCanvasPointsToUnit(canvasPoints) {
    const size = sketchCssSize();
    return canvasPoints.map((point) => ({
      x: normalizeUnit(point.x / size.cssWidth),
      y: normalizeUnit(point.y / size.cssHeight),
    }));
  }

  function rebuildAutoTracePointsFromDirections(points, dimensions, directions, scale) {
    if (!Array.isArray(points) || points.length < 2) return points || [];
    const currentCanvasPoints = points.map((point) => sketchUnitToCanvasPoint(point.x, point.y));
    const nextCanvasPoints = [currentCanvasPoints[0]];
    for (let index = 0; index < points.length - 1; index += 1) {
      const previous = nextCanvasPoints[nextCanvasPoints.length - 1];
      const dimension = dimensionForSegment(dimensions, index);
      const realLength = scale ? autoTraceDimensionValueMm(dimension) : null;
      const currentLength = Math.max(1, Math.hypot(
        currentCanvasPoints[index + 1].x - currentCanvasPoints[index].x,
        currentCanvasPoints[index + 1].y - currentCanvasPoints[index].y
      ));
      const pixelLength = realLength !== null ? (realLength / scale) * CSS_PIXELS_PER_MILLIMETER : currentLength;
      const angle = directionAngleDegrees((directions || [])[index]);
      const radians = (angle * Math.PI) / 180;
      nextCanvasPoints.push({
        x: previous.x + pixelLength * Math.cos(radians),
        y: previous.y - pixelLength * Math.sin(radians),
      });
    }
    return autoTraceCanvasPointsToUnit(nextCanvasPoints);
  }

  function resolveAutoTraceScale(points, dimensions, directions, mode) {
    const margin = 52;
    const cleanMode = normalizeAutoTraceScaleMode(mode);
    if (cleanMode !== 'auto') {
      const manualScale = Number(cleanMode);
      const canvasPoints = autoTraceBuildCanvasPoints(points, dimensions, directions, manualScale);
      if (!canvasPoints) return { ok: false, message: 'Cote invalide' };
      if (!autoTraceFitsCanvas(canvasPoints, margin)) {
        return {
          ok: false,
          message: `Échelle 1:${manualScale} trop grande pour la zone. Utilisez Automatique.`,
          scale: manualScale,
        };
      }
      return { ok: true, scale: manualScale, mode: cleanMode, canvasPoints: autoTraceCenterCanvasPoints(canvasPoints, margin) };
    }

    for (const scale of AUTO_TRACE_SCALE_OPTIONS) {
      const canvasPoints = autoTraceBuildCanvasPoints(points, dimensions, directions, scale);
      if (canvasPoints && autoTraceFitsCanvas(canvasPoints, margin)) {
        return { ok: true, scale, mode: 'auto', canvasPoints: autoTraceCenterCanvasPoints(canvasPoints, margin) };
      }
    }

    const size = sketchCssSize();
    const roughPoints = autoTraceBuildCanvasPoints(points, dimensions, directions, 1);
    if (!roughPoints) return { ok: false, message: 'Cote invalide' };
    const bounds = autoTraceBounds(roughPoints);
    const requiredX = (bounds.maxX - bounds.minX) / Math.max(1, size.cssWidth - margin * 2);
    const requiredY = (bounds.maxY - bounds.minY) / Math.max(1, size.cssHeight - margin * 2);
    const scale = Math.max(1, Math.ceil(Math.max(requiredX, requiredY) / 5) * 5);
    const canvasPoints = autoTraceBuildCanvasPoints(points, dimensions, directions, scale);
    return { ok: true, scale, mode: 'auto', canvasPoints: autoTraceCenterCanvasPoints(canvasPoints, margin) };
  }

  function scaleLabelText(mode, scale) {
    if (!scale) return 'Échelle visuelle : non appliquée';
    return mode === 'auto' ? `Échelle automatique : 1:${scale}` : `Échelle visuelle : 1:${scale}`;
  }

  function findAutoTraceById(traceId) {
    const id = String(traceId || '').trim();
    if (!id) return null;
    for (let index = 0; index < sketchAnnotations.length; index += 1) {
      const item = normalizeSketchAnnotation(sketchAnnotations[index]);
      if (item && item.type === 'auto_trace' && item.id === id) return { item, index };
    }
    const draft = sketchDraftAnnotation ? normalizeSketchAnnotation(sketchDraftAnnotation) : null;
    if (draft && draft.type === 'auto_trace' && draft.id === id) return { item: draft, index: -1 };
    return null;
  }

  function resolveAutoTraceAnchorCanvasPoint(anchor, visited = new Set()) {
    const cleanAnchor = normalizeAutoTraceAnchor(anchor);
    if (!cleanAnchor || visited.has(cleanAnchor.traceId)) return null;
    const found = findAutoTraceById(cleanAnchor.traceId);
    if (!found || !found.item) return null;
    visited.add(cleanAnchor.traceId);
    const points = autoTraceCanvasPointsForItem(found.item, visited);
    return points[cleanAnchor.pointIndex] || null;
  }

  function autoTraceCanvasPointsForItem(item, visited = new Set()) {
    const fallback = (item.points || []).map((point) => sketchUnitToCanvasPoint(point.x, point.y));
    const withAnchor = (canvasPoints) => {
      const anchorPoint = item && item.anchor ? resolveAutoTraceAnchorCanvasPoint(item.anchor, new Set(visited)) : null;
      if (!anchorPoint || !canvasPoints.length) return canvasPoints;
      const dx = anchorPoint.x - canvasPoints[0].x;
      const dy = anchorPoint.y - canvasPoints[0].y;
      return canvasPoints.map((point) => ({ x: point.x + dx, y: point.y + dy }));
    };
    if (!item || item.type !== 'auto_trace' || !item.scale) return withAnchor(fallback);
    const validation = validateAutoTraceDimensions(item.points, item.dimensions || []);
    if (!validation.ok) return withAnchor(fallback);
    const canvasPoints = autoTraceBuildCanvasPoints(
      item.points,
      item.dimensions || [],
      item.directions || autoTraceDirectionsFromPoints(item.points),
      item.scale
    );
    return withAnchor(canvasPoints ? autoTraceCenterCanvasPoints(canvasPoints, 52) : fallback);
  }

  function correctedAutoTracePoint(lastPoint, rawPoint) {
    const dx = Number(rawPoint.x || 0) - Number(lastPoint.x || 0);
    const dy = Number(rawPoint.y || 0) - Number(lastPoint.y || 0);
    if (Math.abs(dy) >= Math.abs(dx)) {
      return { x: normalizeUnit(lastPoint.x), y: normalizeUnit(rawPoint.y) };
    }
    return { x: normalizeUnit(rawPoint.x), y: normalizeUnit(lastPoint.y) };
  }

  function updateAutoTraceControls() {
    const selectedFinal = sketchSelectedAutoTraceSegment && sketchSelectedAutoTraceSegment.source === 'annotation';
    const active = (['auto_trace', 'auto_dimension', 'inclined_trace', 'angle_dimension'].includes(sketchTool) && sketchAutoTracePoints.length > 0) || selectedFinal;
    const target = getAutoTraceScaleTarget();
    const validation = target ? validateAutoTraceDimensions(target.points, target.dimensions) : { ok: false, message: '' };
    if (sketchAutoTraceControls) {
      sketchAutoTraceControls.hidden = !active;
      sketchAutoTraceControls.setAttribute('aria-hidden', active ? 'false' : 'true');
    }
    if (autoTraceScaleSelect && target) autoTraceScaleSelect.value = normalizeAutoTraceScaleMode(target.scaleMode);
    if (scaleAutoTraceBtn) scaleAutoTraceBtn.disabled = !validation.ok;
    if (autoTraceScaleLabel) {
      autoTraceScaleLabel.textContent = validation.ok
        ? scaleLabelText(target && target.scaleMode, target && target.scale)
        : (validation.message || 'Échelle visuelle : sélectionnez un tracé');
    }
    if (finishAutoTraceBtn) finishAutoTraceBtn.disabled = sketchAutoTracePoints.length < 2;
    if (undoAutoTraceBtn) undoAutoTraceBtn.disabled = sketchAutoTracePoints.length < 2;
    if (cancelAutoTraceBtn) cancelAutoTraceBtn.disabled = sketchAutoTracePoints.length < 1;
  }

  function renderAutoTraceDraft() {
    if (!sketchAutoTracePoints.length) {
      sketchDraftAnnotation = null;
    } else {
      const points = sketchAutoTracePreviewPoint
        ? [...sketchAutoTracePoints, sketchAutoTracePreviewPoint]
        : sketchAutoTracePoints;
      if (!sketchAutoTracePreviewPoint && points.length > 2) {
        const draftWithAngles = ensureAutoAngleDimensions(makeAutoTraceAnnotation(points, sketchAutoTraceDimensions, {
          id: sketchAutoTraceId,
          anchor: sketchAutoTraceAnchor,
          directions: sketchAutoTraceDirections,
          angleDimensions: sketchAutoTraceAngleDimensions,
          scaleMode: sketchAutoTraceScaleMode,
          scale: sketchAutoTraceScale,
        }));
        sketchAutoTraceAngleDimensions = draftWithAngles.angleDimensions || [];
      }
      sketchDraftAnnotation = makeAutoTraceAnnotation(points, sketchAutoTraceDimensions, {
        id: sketchAutoTraceId,
        anchor: sketchAutoTraceAnchor,
        directions: sketchAutoTracePreviewPoint
          ? [...sketchAutoTraceDirections, autoTraceDirectionFromPoints(sketchAutoTracePoints[sketchAutoTracePoints.length - 1], sketchAutoTracePreviewPoint)]
          : sketchAutoTraceDirections,
        angleDimensions: sketchAutoTraceAngleDimensions,
        scaleMode: sketchAutoTraceScaleMode,
        scale: sketchAutoTraceScale,
      });
    }
    updateAutoTraceControls();
    sketchRenderComposite();
  }

  function handleAutoTraceTap(point, canvasPoint) {
    if (!sketchAutoTracePoints.length) {
      const anchorHit = canvasPoint ? findAutoTraceVertexAtPoint(canvasPoint) : null;
      sketchAutoTraceId = makeAutoTraceId();
      if (anchorHit) {
        sketchAutoTracePoints = [{ x: anchorHit.point.x, y: anchorHit.point.y }];
        sketchAutoTraceAnchor = {
          traceId: anchorHit.traceId,
          pointIndex: anchorHit.pointIndex,
        };
        sketchAutoTraceScaleMode = anchorHit.scaleMode || 'auto';
        sketchAutoTraceScale = anchorHit.scale || null;
        sketchAutoTraceHoverAnchor = anchorHit;
        setSketchStatus('Départ accroché au point');
      } else {
        sketchAutoTracePoints = [{ x: normalizeUnit(point.x), y: normalizeUnit(point.y) }];
        sketchAutoTraceAnchor = null;
        sketchAutoTraceScaleMode = 'auto';
        sketchAutoTraceScale = null;
        sketchAutoTraceHoverAnchor = null;
        setSketchStatus('Point de depart place');
      }
      sketchAutoTracePreviewPoint = null;
      renderAutoTraceDraft();
      return;
    }
    const last = sketchAutoTracePoints[sketchAutoTracePoints.length - 1];
    const nextPoint = correctedAutoTracePoint(last, point);
    const dx = Math.abs(nextPoint.x - last.x);
    const dy = Math.abs(nextPoint.y - last.y);
    if (dx < 0.002 && dy < 0.002) {
      setSketchStatus('Point trop proche du precedent', true);
      renderAutoTraceDraft();
      return;
    }
    sketchAutoTracePoints.push(nextPoint);
    sketchAutoTraceDirections.push(autoTraceDirectionFromPoints(last, nextPoint));
    sketchAutoTracePreviewPoint = null;
    sketchAutoTraceHoverAnchor = null;
    dirty = true;
    setSketchStatus(`${sketchAutoTracePoints.length - 1} segment${sketchAutoTracePoints.length > 2 ? 's' : ''}`);
    renderAutoTraceDraft();
  }

  function updateAutoTracePreview(point) {
    if (sketchTool !== 'auto_trace' || !sketchAutoTracePoints.length) return;
    const last = sketchAutoTracePoints[sketchAutoTracePoints.length - 1];
    sketchAutoTracePreviewPoint = correctedAutoTracePoint(last, point);
    renderAutoTraceDraft();
  }

  function angleFromPoints(start, end) {
    const dx = Number(end.x || 0) - Number(start.x || 0);
    const dy = Number(start.y || 0) - Number(end.y || 0);
    return normalizeAngleDegrees((Math.atan2(dy, dx) * 180) / Math.PI);
  }

  function currentAutoTraceDrawingScale() {
    if (sketchAutoTraceScale) return sketchAutoTraceScale;
    const selected = autoTraceScaleSelect ? normalizeAutoTraceScaleMode(autoTraceScaleSelect.value) : 'auto';
    if (selected !== 'auto') return Number(selected);
    return 20;
  }

  function openInclinedTraceDialog(approxPoint) {
    if (!sketchInclinedDialog || !sketchInclinedAngleInput || !sketchInclinedLengthInput || !sketchAutoTracePoints.length) return;
    const last = sketchAutoTracePoints[sketchAutoTracePoints.length - 1];
    const angle = angleFromPoints(last, approxPoint);
    sketchInclinedRequest = { start: last, approxPoint };
    sketchInclinedAngleInput.value = String(Math.round(angle * 10) / 10);
    sketchInclinedLengthInput.value = '';
    sketchInclinedDialog.hidden = false;
    sketchInclinedDialog.setAttribute('aria-hidden', 'false');
    window.setTimeout(() => sketchInclinedAngleInput.focus(), 30);
  }

  function closeInclinedTraceDialog() {
    if (!sketchInclinedDialog) return;
    sketchInclinedDialog.hidden = true;
    sketchInclinedDialog.setAttribute('aria-hidden', 'true');
    if (sketchInclinedAngleInput) sketchInclinedAngleInput.value = '';
    if (sketchInclinedLengthInput) sketchInclinedLengthInput.value = '';
    sketchInclinedRequest = null;
  }

  function handleInclinedTraceTap(point, canvasPoint) {
    if (!sketchAutoTracePoints.length) {
      handleAutoTraceTap(point, canvasPoint);
      setSketchStatus(sketchAutoTraceAnchor ? 'Départ incliné accroché au point' : 'Point de départ incliné placé');
      return;
    }
    openInclinedTraceDialog(point);
  }

  function saveInclinedTraceSegment() {
    if (!sketchInclinedRequest || !sketchInclinedAngleInput || !sketchInclinedLengthInput || !sketchAutoTracePoints.length) return;
    const angle = normalizeAngleDegrees(sketchInclinedAngleInput.value);
    const lengthMm = Number(String(sketchInclinedLengthInput.value || '').replace(',', '.'));
    if (!Number.isFinite(lengthMm) || lengthMm <= 0) {
      setSketchStatus('Saisissez une longueur en mm', true);
      return;
    }
    const scale = currentAutoTraceDrawingScale();
    const pixelLength = (lengthMm / scale) * CSS_PIXELS_PER_MILLIMETER;
    const size = sketchCssSize();
    const startCanvas = sketchUnitToCanvasPoint(sketchAutoTracePoints[sketchAutoTracePoints.length - 1].x, sketchAutoTracePoints[sketchAutoTracePoints.length - 1].y);
    const radians = (angle * Math.PI) / 180;
    const endCanvas = {
      x: startCanvas.x + pixelLength * Math.cos(radians),
      y: startCanvas.y - pixelLength * Math.sin(radians),
    };
    const nextPoint = {
      x: normalizeUnit(endCanvas.x / size.cssWidth),
      y: normalizeUnit(endCanvas.y / size.cssHeight),
    };
    const segmentIndex = sketchAutoTracePoints.length - 1;
    sketchAutoTracePoints.push(nextPoint);
    sketchAutoTraceDirections.push(directionFromAngle(angle));
    sketchAutoTraceDimensions = upsertDimension(sketchAutoTraceDimensions, {
      segmentIndex,
      value: lengthMm,
      unit: 'mm',
      side: 'top',
    });
    if (!sketchAutoTraceScale) sketchAutoTraceScale = scale;
    dirty = true;
    closeInclinedTraceDialog();
    setSketchStatus(`Trait incliné ${formatAngleValue(angle)} ajouté`);
    renderAutoTraceDraft();
  }

  function finishAutoTrace() {
    if (sketchAutoTracePoints.length < 2) {
      setSketchStatus('Ajoutez au moins deux points pour terminer le trace', true);
      return false;
    }
    const annotation = makeAutoTraceAnnotation(sketchAutoTracePoints, sketchAutoTraceDimensions, {
      id: sketchAutoTraceId,
      anchor: sketchAutoTraceAnchor,
      directions: sketchAutoTraceDirections,
      angleDimensions: sketchAutoTraceAngleDimensions,
      scaleMode: sketchAutoTraceScaleMode,
      scale: sketchAutoTraceScale,
    });
    if (annotation && annotation.points.length >= 2) {
      sketchAnnotations.push(annotation);
      dirty = true;
      sketchPushHistory();
      setSketchStatus('Trace automatique ajoute');
    }
    sketchAutoTracePoints = [];
    sketchAutoTraceId = '';
    sketchAutoTracePreviewPoint = null;
    sketchAutoTraceDirections = [];
    sketchAutoTraceDimensions = [];
    sketchAutoTraceAngleDimensions = [];
    sketchAutoTraceAngleDimensions = [];
    sketchAutoTraceScaleMode = 'auto';
    sketchAutoTraceScale = null;
    sketchAutoTraceAnchor = null;
    sketchAutoTraceHoverAnchor = null;
    sketchSelectedAutoTraceSegment = null;
    sketchDraftAnnotation = null;
    updateAutoTraceControls();
    sketchRenderComposite();
    return true;
  }

  function undoAutoTraceSegment() {
    if (sketchAutoTracePoints.length <= 1) return;
    sketchAutoTracePoints.pop();
    sketchAutoTraceDirections.pop();
    const segmentCount = Math.max(0, sketchAutoTracePoints.length - 1);
    sketchAutoTraceDimensions = sketchAutoTraceDimensions.filter((dimension) => Number(dimension.segmentIndex) < segmentCount);
    sketchAutoTraceAngleDimensions = sketchAutoTraceAngleDimensions.filter((dimension) => Number(dimension.segmentA) < segmentCount && Number(dimension.segmentB) < segmentCount);
    sketchAutoTraceScale = null;
    sketchAutoTracePreviewPoint = null;
    sketchSelectedAutoTraceSegment = null;
    setSketchStatus('Dernier segment annule');
    renderAutoTraceDraft();
  }

  function cancelAutoTrace() {
    sketchAutoTracePoints = [];
    sketchAutoTraceId = '';
    sketchAutoTracePreviewPoint = null;
    sketchAutoTraceDirections = [];
    sketchAutoTraceDimensions = [];
    sketchAutoTraceAngleDimensions = [];
    sketchAutoTraceAngleDimensions = [];
    sketchAutoTraceScaleMode = 'auto';
    sketchAutoTraceScale = null;
    sketchAutoTraceAnchor = null;
    sketchAutoTraceHoverAnchor = null;
    sketchSelectedAutoTraceSegment = null;
    sketchDraftAnnotation = null;
    updateAutoTraceControls();
    sketchRenderComposite();
    setSketchStatus('Trace automatique annule');
  }

  function confirmAutoTraceBeforeToolChange() {
    if (!sketchAutoTracePoints.length || !['auto_trace', 'auto_dimension', 'inclined_trace', 'angle_dimension'].includes(sketchTool)) return true;
    if (sketchAutoTracePoints.length >= 2) {
      const shouldFinish = window.confirm('Terminer le trace automatique en cours avant de changer d outil ?');
      if (shouldFinish) return finishAutoTrace();
      return false;
    }
    const shouldCancel = window.confirm('Annuler le point de depart du trace automatique ?');
    if (shouldCancel) {
      cancelAutoTrace();
      return true;
    }
    return false;
  }

  function distanceToCanvasSegment(point, a, b) {
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const wx = point.x - a.x;
    const wy = point.y - a.y;
    const lenSq = vx * vx + vy * vy;
    const t = lenSq > 0 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / lenSq)) : 0;
    const px = a.x + t * vx;
    const py = a.y + t * vy;
    return Math.hypot(point.x - px, point.y - py);
  }

  function findAutoTraceVertexAtPoint(canvasPoint) {
    const tolerance = 22 / Math.max(0.5, sketchViewport.scale);
    let best = null;
    sketchAnnotations.forEach((annotation, annotationIndex) => {
      const item = normalizeSketchAnnotation(annotation);
      if (!item || item.type !== 'auto_trace' || !Array.isArray(item.points) || !item.points.length) return;
      const canvasPoints = autoTraceCanvasPointsForItem(item);
      canvasPoints.forEach((point, pointIndex) => {
        const distance = Math.hypot(canvasPoint.x - point.x, canvasPoint.y - point.y);
        if (distance <= tolerance && (!best || distance < best.distance)) {
          best = {
            annotationIndex,
            traceId: item.id,
            pointIndex,
            point: {
              x: normalizeUnit(point.x / sketchCssSize().cssWidth),
              y: normalizeUnit(point.y / sketchCssSize().cssHeight),
            },
            canvasPoint: point,
            scaleMode: item.scaleMode || 'auto',
            scale: item.scale || null,
            distance,
          };
        }
      });
    });
    return best;
  }

  function drawAutoTraceAnchorHalo(ctx) {
    if (!sketchAutoTraceHoverAnchor || !sketchAutoTraceHoverAnchor.canvasPoint) return;
    const point = sketchAutoTraceHoverAnchor.canvasPoint;
    ctx.save();
    ctx.strokeStyle = '#f97316';
    ctx.fillStyle = 'rgba(249, 115, 22, 0.16)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function dimensionForSegment(dimensions, segmentIndex) {
    return (Array.isArray(dimensions) ? dimensions : []).find((dimension) => Number(dimension.segmentIndex) === Number(segmentIndex)) || null;
  }

  function upsertDimension(dimensions, nextDimension) {
    const list = (Array.isArray(dimensions) ? dimensions : []).filter((dimension) => Number(dimension.segmentIndex) !== Number(nextDimension.segmentIndex));
    list.push(nextDimension);
    return list.sort((a, b) => Number(a.segmentIndex) - Number(b.segmentIndex));
  }

  function removeDimension(dimensions, segmentIndex) {
    return (Array.isArray(dimensions) ? dimensions : []).filter((dimension) => Number(dimension.segmentIndex) !== Number(segmentIndex));
  }

  function findAutoTraceSegmentAtPoint(canvasPoint) {
    const tolerance = 18 / Math.max(0.5, sketchViewport.scale);
    let best = null;
    const inspect = (source, item, annotationIndex) => {
      const dimensions = item.dimensions || [];
      const canvasPoints = autoTraceCanvasPointsForItem(item);
      for (let index = 0; index < canvasPoints.length - 1; index += 1) {
        const distance = distanceToCanvasSegment(canvasPoint, canvasPoints[index], canvasPoints[index + 1]);
        const dimension = dimensionForSegment(dimensions, index);
        let dimensionDistance = Infinity;
        if (dimension) {
          const side = normalizeAutoTraceSide(dimension.side, autoTraceDefaultSide(canvasPoints[index], canvasPoints[index + 1]));
          const geometry = autoTraceDimensionGeometry(canvasPoints[index], canvasPoints[index + 1], side, 2);
          dimensionDistance = distanceToCanvasSegment(canvasPoint, geometry.a, geometry.b);
        }
        const score = Math.min(distance, dimensionDistance);
        if (score <= tolerance && (!best || score < best.distance)) {
          best = { source, annotationIndex, segmentIndex: index, distance: score };
        }
      }
    };

    if (sketchAutoTracePoints.length > 1) {
      inspect('draft', makeAutoTraceAnnotation(sketchAutoTracePoints, sketchAutoTraceDimensions, {
        id: sketchAutoTraceId,
        anchor: sketchAutoTraceAnchor,
        directions: sketchAutoTraceDirections,
        angleDimensions: sketchAutoTraceAngleDimensions,
        scaleMode: sketchAutoTraceScaleMode,
        scale: sketchAutoTraceScale,
      }), -1);
    }
    sketchAnnotations.forEach((annotation, annotationIndex) => {
      const item = normalizeSketchAnnotation(annotation);
      if (!item || item.type !== 'auto_trace' || !Array.isArray(item.points) || item.points.length < 2) return;
      inspect('annotation', item, annotationIndex);
    });
    return best;
  }

  function getAutoTraceDimensionTarget(target) {
    if (!target) return null;
    if (target.source === 'draft') {
      const p1 = sketchAutoTracePoints[target.segmentIndex];
      const p2 = sketchAutoTracePoints[target.segmentIndex + 1];
      if (!p1 || !p2) return null;
      return {
        points: sketchAutoTracePoints,
        dimensions: sketchAutoTraceDimensions,
        dimension: dimensionForSegment(sketchAutoTraceDimensions, target.segmentIndex),
        p1,
        p2,
      };
    }
    const annotation = sketchAnnotations[target.annotationIndex];
    const item = normalizeSketchAnnotation(annotation);
    if (!item || item.type !== 'auto_trace') return null;
    const p1 = item.points[target.segmentIndex];
    const p2 = item.points[target.segmentIndex + 1];
    if (!p1 || !p2) return null;
    return {
      annotation,
      item,
      points: item.points,
      dimensions: item.dimensions || [],
      dimension: dimensionForSegment(item.dimensions || [], target.segmentIndex),
      p1,
      p2,
    };
  }

  function sameTraceTarget(a, b) {
    if (!a || !b || a.source !== b.source) return false;
    if (a.source === 'draft') return true;
    return Number(a.annotationIndex) === Number(b.annotationIndex);
  }

  function connectedSegmentPair(a, b) {
    if (!sameTraceTarget(a, b)) return false;
    return Math.abs(Number(a.segmentIndex) - Number(b.segmentIndex)) === 1;
  }

  function existingAngleDimension(dimensions, a, b) {
    return (Array.isArray(dimensions) ? dimensions : []).find((dimension) => (
      (Number(dimension.segmentA) === Number(a) && Number(dimension.segmentB) === Number(b)) ||
      (Number(dimension.segmentA) === Number(b) && Number(dimension.segmentB) === Number(a))
    )) || null;
  }

  function upsertAngleDimension(dimensions, nextDimension) {
    const list = (Array.isArray(dimensions) ? dimensions : []).filter((dimension) => String(dimension.id) !== String(nextDimension.id));
    list.push(nextDimension);
    return list.sort((a, b) => Math.min(a.segmentA, a.segmentB) - Math.min(b.segmentA, b.segmentB));
  }

  function removeAngleDimension(dimensions, dimensionId) {
    return (Array.isArray(dimensions) ? dimensions : []).filter((dimension) => String(dimension.id) !== String(dimensionId));
  }

  function getAngleDimensionsForTarget(target) {
    if (!target) return [];
    if (target.source === 'draft') return sketchAutoTraceAngleDimensions;
    const annotation = sketchAnnotations[target.annotationIndex];
    const item = normalizeSketchAnnotation(annotation);
    return item && item.type === 'auto_trace' ? (item.angleDimensions || []) : [];
  }

  function setAngleDimensionsForTarget(target, dimensions) {
    if (!target) return;
    if (target.source === 'draft') {
      sketchAutoTraceAngleDimensions = dimensions;
      renderAutoTraceDraft();
      return;
    }
    const annotation = sketchAnnotations[target.annotationIndex];
    annotation.angleDimensions = dimensions;
    sketchAnnotations[target.annotationIndex] = normalizeSketchAnnotation(annotation);
    dirty = true;
    sketchPushHistory();
    sketchRenderComposite();
  }

  function openAngleDimensionDialog(target, dimension) {
    if (!sketchAngleDialog || !sketchAngleDialogValue || !sketchAngleInput) return;
    sketchAngleRequest = { ...target, dimensionId: dimension.id };
    const item = target.source === 'draft'
      ? makeAutoTraceAnnotation(sketchAutoTracePoints, sketchAutoTraceDimensions, {
        id: sketchAutoTraceId,
        anchor: sketchAutoTraceAnchor,
        directions: sketchAutoTraceDirections,
        angleDimensions: sketchAutoTraceAngleDimensions,
        scaleMode: sketchAutoTraceScaleMode,
        scale: sketchAutoTraceScale,
      })
      : normalizeSketchAnnotation(sketchAnnotations[target.annotationIndex]);
    const canvasPoints = autoTraceCanvasPointsForItem(item);
    const common = commonVertexForAngleDimension(canvasPoints, dimension);
    const angle = common
      ? angleBetweenVectors(
        { x: common.pA.x - common.vertex.x, y: common.pA.y - common.vertex.y },
        { x: common.pB.x - common.vertex.x, y: common.pB.y - common.vertex.y }
      )
      : 0;
    const shownAngle = dimension.inverted ? 360 - angle : angle;
    sketchAngleDialogValue.textContent = `Angle : ${formatAngleValue(shownAngle)}`;
    sketchAngleInput.value = String(Math.round(shownAngle * 10) / 10);
    sketchAngleDialog.hidden = false;
    sketchAngleDialog.setAttribute('aria-hidden', 'false');
  }

  function closeAngleDimensionDialog() {
    if (!sketchAngleDialog) return;
    sketchAngleDialog.hidden = true;
    sketchAngleDialog.setAttribute('aria-hidden', 'true');
    sketchAngleRequest = null;
  }

  function handleAngleDimensionTap(target) {
    if (!target) {
      setSketchStatus('Touchez un segment', true);
      return;
    }
    if (!sketchAngleFirstSegment) {
      sketchAngleFirstSegment = target;
      sketchSelectedAutoTraceSegment = { ...target };
      setSketchStatus('Premier segment sélectionné');
      sketchRenderComposite();
      return;
    }
    if (!connectedSegmentPair(sketchAngleFirstSegment, target)) {
      sketchAngleFirstSegment = target;
      sketchSelectedAutoTraceSegment = { ...target };
      setSketchStatus('Choisissez un segment relié au premier', true);
      sketchRenderComposite();
      return;
    }
    const segmentA = Math.min(sketchAngleFirstSegment.segmentIndex, target.segmentIndex);
    const segmentB = Math.max(sketchAngleFirstSegment.segmentIndex, target.segmentIndex);
    const current = existingAngleDimension(getAngleDimensionsForTarget(target), segmentA, segmentB);
    const dimension = current ? { ...current, hidden: false, auto: false } : {
      id: makeAutoTraceId(),
      segmentA,
      segmentB,
      inverted: false,
      auto: false,
      hidden: false,
      radius: 42,
    };
    setAngleDimensionsForTarget(target, upsertAngleDimension(getAngleDimensionsForTarget(target), dimension));
    sketchAngleFirstSegment = null;
    sketchSelectedAutoTraceSegment = { ...target, segmentIndex: segmentB };
    setSketchStatus('Cotation d’angle ajoutée');
    openAngleDimensionDialog(target, dimension);
  }

  function invertCurrentAngleDimension() {
    if (!sketchAngleRequest) return;
    const dimensions = getAngleDimensionsForTarget(sketchAngleRequest);
    const current = dimensions.find((dimension) => String(dimension.id) === String(sketchAngleRequest.dimensionId));
    if (!current) return;
    current.inverted = !current.inverted;
    setAngleDimensionsForTarget(sketchAngleRequest, upsertAngleDimension(dimensions, current));
    openAngleDimensionDialog(sketchAngleRequest, current);
  }

  function deleteCurrentAngleDimension() {
    if (!sketchAngleRequest) return;
    const dimensions = getAngleDimensionsForTarget(sketchAngleRequest);
    const current = dimensions.find((dimension) => String(dimension.id) === String(sketchAngleRequest.dimensionId));
    if (current && current.auto) {
      current.hidden = true;
      setAngleDimensionsForTarget(sketchAngleRequest, upsertAngleDimension(dimensions, current));
    } else {
      setAngleDimensionsForTarget(sketchAngleRequest, removeAngleDimension(dimensions, sketchAngleRequest.dimensionId));
    }
    setSketchStatus('Cote d’angle supprimée');
    closeAngleDimensionDialog();
  }

  function applyCurrentAngleValue() {
    if (!sketchAngleRequest || !sketchAngleInput) return;
    const rawAngle = String(sketchAngleInput.value || '').trim().replace(',', '.');
    const parsedAngle = Number(rawAngle);
    if (!Number.isFinite(parsedAngle)) {
      setSketchStatus('Saisissez un angle valide', true);
      return;
    }
    const angle = normalizeAngleDegrees(parsedAngle);
    if (sketchAngleRequest.source === 'draft') {
      const dim = getAngleDimensionsForTarget(sketchAngleRequest).find((dimension) => String(dimension.id) === String(sketchAngleRequest.dimensionId));
      if (!dim) return;
      const draftItem = makeAutoTraceAnnotation(sketchAutoTracePoints, sketchAutoTraceDimensions, {
        id: sketchAutoTraceId,
        anchor: sketchAutoTraceAnchor,
        directions: sketchAutoTraceDirections,
        angleDimensions: sketchAutoTraceAngleDimensions,
        scaleMode: sketchAutoTraceScaleMode,
        scale: sketchAutoTraceScale,
      });
      const common = commonVertexForAngleDimension(autoTraceCanvasPointsForItem(draftItem), dim);
      const firstHeading = common
        ? normalizeAngleDegrees((Math.atan2(common.vertex.y - common.pA.y, common.pA.x - common.vertex.x) * 180) / Math.PI)
        : directionAngleDegrees(sketchAutoTraceDirections[dim.segmentA]) + 180;
      sketchAutoTraceDirections[dim.segmentB] = directionFromAngle(firstHeading + (dim.inverted ? -angle : angle));
      sketchAutoTracePoints = rebuildAutoTracePointsFromDirections(
        sketchAutoTracePoints,
        sketchAutoTraceDimensions,
        sketchAutoTraceDirections,
        sketchAutoTraceScale
      );
      dirty = true;
      renderAutoTraceDraft();
      openAngleDimensionDialog(sketchAngleRequest, dim);
      return;
    }
    const annotation = sketchAnnotations[sketchAngleRequest.annotationIndex];
    const item = normalizeSketchAnnotation(annotation);
    const dim = (item.angleDimensions || []).find((dimension) => String(dimension.id) === String(sketchAngleRequest.dimensionId));
    if (!item || !dim) return;
    const directions = [...item.directions];
    const common = commonVertexForAngleDimension(autoTraceCanvasPointsForItem(item), dim);
    const firstHeading = common
      ? normalizeAngleDegrees((Math.atan2(common.vertex.y - common.pA.y, common.pA.x - common.vertex.x) * 180) / Math.PI)
      : directionAngleDegrees(directions[dim.segmentA]) + 180;
    directions[dim.segmentB] = directionFromAngle(firstHeading + (dim.inverted ? -angle : angle));
    annotation.directions = directions;
    annotation.points = rebuildAutoTracePointsFromDirections(item.points, item.dimensions || [], directions, item.scale);
    sketchAnnotations[sketchAngleRequest.annotationIndex] = normalizeSketchAnnotation(annotation);
    sketchSelectedAutoTraceSegment = { source: 'annotation', annotationIndex: sketchAngleRequest.annotationIndex, segmentIndex: dim.segmentB };
    dirty = true;
    sketchPushHistory();
    sketchRenderComposite();
    openAngleDimensionDialog(sketchAngleRequest, dim);
  }

  function getAutoTraceScaleTarget() {
    if (sketchAutoTracePoints.length > 1) {
      const anchorCanvasPoint = sketchAutoTraceAnchor ? resolveAutoTraceAnchorCanvasPoint(sketchAutoTraceAnchor) : null;
      const startPoint = anchorCanvasPoint
        ? { x: normalizeUnit(anchorCanvasPoint.x / sketchCssSize().cssWidth), y: normalizeUnit(anchorCanvasPoint.y / sketchCssSize().cssHeight) }
        : sketchAutoTracePoints[0];
      const points = [startPoint, ...sketchAutoTracePoints.slice(1)];
      return {
        source: 'draft',
        points,
        dimensions: sketchAutoTraceDimensions,
        directions: sketchAutoTraceDirections,
        anchor: sketchAutoTraceAnchor,
        scaleMode: sketchAutoTraceScaleMode,
        scale: sketchAutoTraceScale,
      };
    }
    if (sketchSelectedAutoTraceSegment && sketchSelectedAutoTraceSegment.source === 'annotation') {
      const annotation = sketchAnnotations[sketchSelectedAutoTraceSegment.annotationIndex];
      const item = normalizeSketchAnnotation(annotation);
      if (!item || item.type !== 'auto_trace' || item.points.length < 2) return null;
      return {
        source: 'annotation',
        annotationIndex: sketchSelectedAutoTraceSegment.annotationIndex,
        annotation,
        item,
        points: item.points,
        dimensions: item.dimensions || [],
        directions: item.directions || autoTraceDirectionsFromPoints(item.points),
        anchor: item.anchor || null,
        scaleMode: item.scaleMode || 'auto',
        scale: item.scale || null,
      };
    }
    return null;
  }

  function applyAutoTraceScale() {
    const target = getAutoTraceScaleTarget();
    if (!target) {
      setSketchStatus('Sélectionnez un tracé automatique', true);
      updateAutoTraceControls();
      return false;
    }
    const validation = validateAutoTraceDimensions(target.points, target.dimensions);
    if (!validation.ok) {
      setSketchStatus(validation.message, true);
      updateAutoTraceControls();
      return false;
    }
    const mode = autoTraceScaleSelect ? autoTraceScaleSelect.value : target.scaleMode;
    const result = resolveAutoTraceScale(target.points, target.dimensions, target.directions, mode);
    if (!result.ok) {
      setSketchStatus(result.message || 'Échelle impossible', true);
      updateAutoTraceControls();
      return false;
    }
    const nextPoints = autoTraceCanvasPointsToUnit(result.canvasPoints);
    if (target.source === 'draft') {
      sketchAutoTracePoints = nextPoints;
      sketchAutoTracePreviewPoint = null;
      sketchAutoTraceScaleMode = result.mode;
      sketchAutoTraceScale = result.scale;
      dirty = true;
      setSketchStatus(scaleLabelText(result.mode, result.scale));
      renderAutoTraceDraft();
      return true;
    }

    const annotation = sketchAnnotations[target.annotationIndex];
    annotation.points = nextPoints;
    annotation.directions = target.directions;
    annotation.dimensions = target.dimensions;
    annotation.scaleMode = result.mode;
    annotation.scale = result.scale;
    sketchAnnotations[target.annotationIndex] = normalizeSketchAnnotation(annotation);
    dirty = true;
    sketchPushHistory();
    setSketchStatus(scaleLabelText(result.mode, result.scale));
    updateAutoTraceControls();
    sketchRenderComposite();
    return true;
  }

  function recalcAutoTraceIfScaled(request) {
    if (!request) return false;
    if (request.source === 'draft') {
      if (!sketchAutoTraceScale) return false;
      applyAutoTraceScale();
      return true;
    }
    const annotation = sketchAnnotations[request.annotationIndex];
    const item = normalizeSketchAnnotation(annotation);
    if (!item || item.type !== 'auto_trace' || !item.scale) return false;
    sketchSelectedAutoTraceSegment = {
      source: 'annotation',
      annotationIndex: request.annotationIndex,
      segmentIndex: request.segmentIndex,
    };
    applyAutoTraceScale();
    return true;
  }

  function updateDimensionSideLabel(side) {
    if (sketchDimensionSideLabel) sketchDimensionSideLabel.textContent = `Côté : ${dimensionSideLabel(side)}`;
  }

  function openAutoTraceDimensionDialog(target) {
    if (!sketchDimensionDialog || !sketchDimensionInput) return;
    const detail = getAutoTraceDimensionTarget(target);
    if (!detail) {
      setSketchStatus('Touchez un segment de trace automatique', true);
      return;
    }
    const existing = detail.dimension;
    const defaultSide = autoTraceDefaultSide(sketchUnitToCanvasPoint(detail.p1.x, detail.p1.y), sketchUnitToCanvasPoint(detail.p2.x, detail.p2.y));
    sketchDimensionRequest = {
      ...target,
      side: normalizeAutoTraceSide(existing && existing.side, defaultSide),
    };
    sketchSelectedAutoTraceSegment = { ...target };
    sketchDimensionInput.value = existing ? String(existing.value) : '';
    updateDimensionSideLabel(sketchDimensionRequest.side);
    if (sketchDimensionDeleteBtn) sketchDimensionDeleteBtn.disabled = !existing;
    sketchDimensionDialog.hidden = false;
    sketchDimensionDialog.setAttribute('aria-hidden', 'false');
    updateAutoTraceControls();
    sketchRenderComposite();
    window.setTimeout(() => sketchDimensionInput.focus(), 30);
  }

  function closeAutoTraceDimensionDialog() {
    if (!sketchDimensionDialog || !sketchDimensionInput) return;
    sketchDimensionDialog.hidden = true;
    sketchDimensionDialog.setAttribute('aria-hidden', 'true');
    sketchDimensionInput.value = '';
    sketchDimensionRequest = null;
    updateAutoTraceControls();
    sketchRenderComposite();
  }

  function saveAutoTraceDimension() {
    if (!sketchDimensionRequest || !sketchDimensionInput) return;
    const activeRequest = { ...sketchDimensionRequest };
    const detail = getAutoTraceDimensionTarget(sketchDimensionRequest);
    if (!detail) return;
    const raw = String(sketchDimensionInput.value || '').trim().replace(',', '.');
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      setSketchStatus('Saisissez une cote en mm', true);
      return;
    }
    const nextDimension = {
      segmentIndex: sketchDimensionRequest.segmentIndex,
      value,
      unit: 'mm',
      side: normalizeAutoTraceSide(sketchDimensionRequest.side, autoTraceDefaultSide(
        sketchUnitToCanvasPoint(detail.p1.x, detail.p1.y),
        sketchUnitToCanvasPoint(detail.p2.x, detail.p2.y)
      )),
    };
    if (sketchDimensionRequest.source === 'draft') {
      sketchAutoTraceDimensions = upsertDimension(sketchAutoTraceDimensions, nextDimension);
      if (!recalcAutoTraceIfScaled(activeRequest)) renderAutoTraceDraft();
    } else {
      const annotation = sketchAnnotations[sketchDimensionRequest.annotationIndex];
      annotation.dimensions = upsertDimension(detail.dimensions, nextDimension);
      sketchAnnotations[sketchDimensionRequest.annotationIndex] = normalizeSketchAnnotation(annotation);
      if (!recalcAutoTraceIfScaled(activeRequest)) {
        dirty = true;
        sketchPushHistory();
        sketchRenderComposite();
      }
    }
    dirty = true;
    setSketchStatus('Cote enregistree');
    closeAutoTraceDimensionDialog();
  }

  function changeAutoTraceDimensionSide() {
    if (!sketchDimensionRequest) return;
    const detail = getAutoTraceDimensionTarget(sketchDimensionRequest);
    if (!detail) return;
    const p1 = sketchUnitToCanvasPoint(detail.p1.x, detail.p1.y);
    const p2 = sketchUnitToCanvasPoint(detail.p2.x, detail.p2.y);
    sketchDimensionRequest.side = autoTraceToggleSide(p1, p2, sketchDimensionRequest.side);
    updateDimensionSideLabel(sketchDimensionRequest.side);
    sketchSelectedAutoTraceSegment = { ...sketchDimensionRequest };
    sketchRenderComposite();
  }

  function deleteAutoTraceDimension() {
    if (!sketchDimensionRequest) return;
    const detail = getAutoTraceDimensionTarget(sketchDimensionRequest);
    if (!detail) return;
    if (sketchDimensionRequest.source === 'draft') {
      sketchAutoTraceDimensions = removeDimension(sketchAutoTraceDimensions, sketchDimensionRequest.segmentIndex);
      renderAutoTraceDraft();
    } else {
      const annotation = sketchAnnotations[sketchDimensionRequest.annotationIndex];
      annotation.dimensions = removeDimension(detail.dimensions, sketchDimensionRequest.segmentIndex);
      sketchAnnotations[sketchDimensionRequest.annotationIndex] = normalizeSketchAnnotation(annotation);
      dirty = true;
      sketchPushHistory();
      sketchRenderComposite();
    }
    dirty = true;
    setSketchStatus('Cote supprimee');
    closeAutoTraceDimensionDialog();
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
    const tolerance = 10 / Math.max(0.5, sketchViewport.scale);
    for (let i = sketchAnnotations.length - 1; i >= 0; i -= 1) {
      const bounds = symbolBounds(sketchAnnotations[i]);
      if (!bounds) continue;
      if (
        point.x >= bounds.left - tolerance &&
        point.x <= bounds.right + tolerance &&
        point.y >= bounds.top - tolerance &&
        point.y <= bounds.bottom + tolerance
      ) {
        const onResize = point.x >= bounds.right - tolerance && point.y >= bounds.bottom - tolerance;
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
    const screenPoint = sketchScreenPoint(event);
    sketchPointers.set(event.pointerId, {
      x: screenPoint.x,
      y: screenPoint.y,
      pointerType: event.pointerType || 'mouse',
    });
    try {
      sketchCanvas.setPointerCapture(event.pointerId);
    } catch {}
    if (event.pointerType === 'touch' && activeTouchPointers().length >= 2) {
      startSketchPinchGesture();
      return;
    }

    if (sketchDrawing && event.pointerType === 'touch') return;

    if (sketchTool === 'pan') {
      sketchActivePointerId = event.pointerId;
      startSketchPanGesture(screenPoint, event.pointerId);
      return;
    }
    const canvasPoint = sketchCanvasPoint(event);
    const point = sketchCanvasPointToUnit(canvasPoint);

    const angleHit = findAutoTraceAngleAtPoint(canvasPoint);
    if (angleHit) {
      sketchSelectedAutoTraceSegment = {
        source: angleHit.source,
        annotationIndex: angleHit.annotationIndex,
        segmentIndex: angleHit.segmentIndex,
      };
      openAngleDimensionDialog(angleHit, angleHit.dimension);
      sketchRenderComposite();
      return;
    }

    if (sketchTool === 'auto_trace') {
      handleAutoTraceTap(point, canvasPoint);
      return;
    }

    if (sketchTool === 'inclined_trace') {
      handleInclinedTraceTap(point, canvasPoint);
      return;
    }

    if (sketchTool === 'auto_dimension') {
      const target = findAutoTraceSegmentAtPoint(canvasPoint);
      if (target) {
        openAutoTraceDimensionDialog(target);
      } else {
        setSketchStatus('Touchez un segment de trace automatique', true);
      }
      return;
    }

    if (sketchTool === 'angle_dimension') {
      handleAngleDimensionTap(findAutoTraceSegmentAtPoint(canvasPoint));
      return;
    }

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
      sketchActivePointerId = event.pointerId;
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
    sketchActivePointerId = event.pointerId;
    if (ANNOTATION_TOOLS.has(sketchTool)) {
      sketchDraftAnnotation = makeSketchAnnotationFromDrag(sketchTool, point, point);
    } else {
      sketchApplyBrush();
      const drawPoint = sketchCanvasPoint(event);
      sketchInkCtx.beginPath();
      sketchInkCtx.moveTo(drawPoint.x, drawPoint.y);
    }
  }

  function sketchDraw(event) {
    const screenPoint = sketchScreenPoint(event);
    if (sketchPointers.has(event.pointerId)) {
      const pointer = sketchPointers.get(event.pointerId);
      pointer.x = screenPoint.x;
      pointer.y = screenPoint.y;
      pointer.pointerType = event.pointerType || pointer.pointerType;
    }
    if (activeTouchPointers().length >= 2) {
      event.preventDefault();
      updateSketchPinchGesture();
      return;
    }
    if (sketchGesture && sketchGesture.type === 'pan') {
      if (sketchGesture.pointerId !== event.pointerId) return;
      event.preventDefault();
      updateSketchPanGesture(screenPoint);
      return;
    }
    if (sketchActivePointerId !== null && sketchActivePointerId !== event.pointerId) return;
    if (sketchTool === 'auto_trace' && sketchAutoTracePoints.length) {
      event.preventDefault();
      updateAutoTracePreview(sketchCanvasPointToUnit(sketchCanvasPoint(event)));
      return;
    }
    if (sketchTool === 'auto_trace' && !sketchAutoTracePoints.length) {
      const nextHover = findAutoTraceVertexAtPoint(sketchCanvasPoint(event));
      const changed =
        (!nextHover && sketchAutoTraceHoverAnchor) ||
        (nextHover && (!sketchAutoTraceHoverAnchor ||
          nextHover.traceId !== sketchAutoTraceHoverAnchor.traceId ||
          nextHover.pointIndex !== sketchAutoTraceHoverAnchor.pointIndex));
      sketchAutoTraceHoverAnchor = nextHover;
      if (changed) sketchRenderComposite();
    }
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
    sketchPointers.delete(event.pointerId);
    if (sketchGesture && sketchGesture.type === 'pinch') {
      if (activeTouchPointers().length < 2) sketchGesture = null;
      try {
        sketchCanvas.releasePointerCapture(event.pointerId);
      } catch {}
      return;
    }
    if (sketchGesture && sketchGesture.type === 'pan') {
      if (sketchGesture.pointerId === event.pointerId) {
        sketchGesture = null;
        sketchActivePointerId = null;
      }
      try {
        sketchCanvas.releasePointerCapture(event.pointerId);
      } catch {}
      return;
    }
    if (sketchActivePointerId !== null && sketchActivePointerId !== event.pointerId) {
      try {
        sketchCanvas.releasePointerCapture(event.pointerId);
      } catch {}
      return;
    }
    if (!sketchDrawing || !sketchCanvas) return;
    sketchDrawing = false;
    sketchActivePointerId = null;
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
    clampSketchViewport();
    updateSketchZoomLabel();
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
    sketchCanvas.addEventListener('pointerleave', sketchStopDrawing);
    sketchCanvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.12 : 0.89;
      zoomSketchAt(sketchScreenPoint(event), sketchViewport.scale * factor);
    }, { passive: false });
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
    sketchPointers.clear();
    sketchGesture = null;
    sketchActivePointerId = null;
    setSketchViewport({ scale: 1, offsetX: 0, offsetY: 0 });
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
    sketchPointers.clear();
    sketchGesture = null;
    sketchActivePointerId = null;
    closeSketchPhotoPicker();
    closeSketchSymbolPicker();
    closeSketchTextDialog();
    closeAutoTraceDimensionDialog();
    closeInclinedTraceDialog();
    closeAngleDimensionDialog();
    sketchDraftAnnotation = null;
    sketchAutoTracePoints = [];
    sketchAutoTraceId = '';
    sketchAutoTracePreviewPoint = null;
    sketchAutoTraceDirections = [];
    sketchAutoTraceDimensions = [];
    sketchAutoTraceAngleDimensions = [];
    sketchAutoTraceScaleMode = 'auto';
    sketchAutoTraceScale = null;
    sketchAutoTraceAnchor = null;
    sketchAutoTraceHoverAnchor = null;
    sketchSelectedAutoTraceSegment = null;
    updateAutoTraceControls();
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
    const normalizedTool = nextTool === 'eraser' || SKETCH_TOOLS.has(nextTool) ? nextTool : 'pen';
    const keepAutoTraceDraftForDimension =
      sketchTool === 'auto_trace' &&
      ['auto_dimension', 'inclined_trace', 'angle_dimension'].includes(normalizedTool) &&
      sketchAutoTracePoints.length >= 2;
    if (normalizedTool !== sketchTool && !keepAutoTraceDraftForDimension && !confirmAutoTraceBeforeToolChange()) return;
    sketchTool = normalizedTool;
    if (!keepAutoTraceDraftForDimension) sketchDraftAnnotation = null;
    if (sketchTool !== 'auto_trace' && !keepAutoTraceDraftForDimension) {
      sketchAutoTracePoints = [];
      sketchAutoTraceId = '';
      sketchAutoTracePreviewPoint = null;
      sketchAutoTraceDirections = [];
      sketchAutoTraceDimensions = [];
      sketchAutoTraceAngleDimensions = [];
      sketchAutoTraceScaleMode = 'auto';
      sketchAutoTraceScale = null;
      sketchAutoTraceAnchor = null;
      sketchAutoTraceHoverAnchor = null;
    }
    if (sketchTool !== 'auto_dimension') {
      sketchSelectedAutoTraceSegment = null;
    }
    if (sketchTool !== 'angle_dimension') {
      sketchAngleFirstSegment = null;
    }
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
    updateAutoTraceControls();
    sketchApplyBrush();
    if (sketchTool === 'auto_trace' && sketchAutoTracePoints.length) {
      renderAutoTraceDraft();
      return;
    }
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
    sketchAutoTracePoints = [];
    sketchAutoTraceId = '';
    sketchAutoTracePreviewPoint = null;
    sketchAutoTraceDirections = [];
    sketchAutoTraceDimensions = [];
    sketchAutoTraceAngleDimensions = [];
    sketchAutoTraceScaleMode = 'auto';
    sketchAutoTraceScale = null;
    sketchAutoTraceAnchor = null;
    sketchAutoTraceHoverAnchor = null;
    sketchSelectedAutoTraceSegment = null;
    sketchMarkerCounter = 0;
    updateAutoTraceControls();
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
    const previousViewport = { ...sketchViewport };
    try {
      sketchViewport = { scale: 1, offsetX: 0, offsetY: 0 };
      sketchRenderComposite(false);
      const response = await fetch(`/api/measurements/${recordId}/sketch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: sketchCanvas.toDataURL('image/png') }),
      });
      sketchViewport = previousViewport;
      updateSketchZoomLabel();
      if (!response.ok) throw new Error('save-sketch-failed');

      sketchUpdatedAt = new Date().toISOString();
      dirty = true;
      await saveRecord();
      sketchRenderComposite();
      setSketchStatus('Enregistre');
    } catch {
      sketchViewport = previousViewport;
      updateSketchZoomLabel();
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
      openPhotosPanelForError();
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
      openPhotosPanelForError();
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
      openPhotosPanelForError();
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
      openPhotosPanelForError();
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
      openPhotosPanelForError();
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
    sketchAutoTracePoints = [];
    sketchAutoTraceId = '';
    sketchAutoTracePreviewPoint = null;
    sketchAutoTraceDirections = [];
    sketchAutoTraceDimensions = [];
    sketchAutoTraceAngleDimensions = [];
    sketchAutoTraceScaleMode = 'auto';
    sketchAutoTraceScale = null;
    sketchAutoTraceAnchor = null;
    sketchAutoTraceHoverAnchor = null;
    sketchSelectedAutoTraceSegment = null;
    updateAutoTraceControls();
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
    sketchAutoTracePoints = [];
    sketchAutoTraceId = '';
    sketchAutoTracePreviewPoint = null;
    sketchAutoTraceDirections = [];
    sketchAutoTraceDimensions = [];
    sketchAutoTraceAngleDimensions = [];
    sketchAutoTraceScaleMode = 'auto';
    sketchAutoTraceScale = null;
    sketchAutoTraceAnchor = null;
    sketchAutoTraceHoverAnchor = null;
    sketchSelectedAutoTraceSegment = null;
    updateAutoTraceControls();
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
    measurementsV2Fields.addEventListener('focusin', (event) => {
      const target = event.target;
      if (!target || !target.getAttribute) return;
      const key = target.getAttribute('data-measure-key');
      if (!key) return;
      selectMeasurementKey(key, { focus: false });
    });

    measurementsV2Fields.addEventListener('input', (event) => {
      const target = event.target;
      if (!target || !target.getAttribute) return;
      const key = target.getAttribute('data-measure-key');
      if (!key) return;
      if (!measurementsV2State) {
        measurementsV2State = createMeasurementsV2State(normalizeStairTypeKey(getValue('type_escalier')));
      }
      measurementsV2State.values[key] = String(target.value || '');
      activeMeasurementKey = key;
      renderMeasurementsV2Schema();
      renderMeasurementsV2Checks();
      updateActiveMeasurementUi();
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
      updateActiveMeasurementUi();
      dirty = true;
    });
  }

  if (measurementsV2Schema) {
    measurementsV2Schema.addEventListener('click', (event) => {
      const target = event.target && event.target.closest ? event.target.closest('[data-measure-key]') : null;
      if (!target) return;
      selectMeasurementKey(target.getAttribute('data-measure-key'), { focus: true, scroll: true });
    });

    measurementsV2Schema.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const target = event.target && event.target.closest ? event.target.closest('[data-measure-key]') : null;
      if (!target) return;
      event.preventDefault();
      selectMeasurementKey(target.getAttribute('data-measure-key'), { focus: true, scroll: true });
    });
  }

  if (measurementsV2Checks) {
    measurementsV2Checks.addEventListener('click', (event) => {
      const target = event.target && event.target.closest ? event.target.closest('[data-measure-key]') : null;
      if (!target) return;
      selectMeasurementKey(target.getAttribute('data-measure-key'), { focus: true, scroll: true });
    });

    measurementsV2Checks.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const target = event.target && event.target.closest ? event.target.closest('[data-measure-key]') : null;
      if (!target) return;
      event.preventDefault();
      selectMeasurementKey(target.getAttribute('data-measure-key'), { focus: true, scroll: true });
    });
  }

  if (photosToggleBtn) {
    photosToggleBtn.addEventListener('click', () => {
      setPhotosPanelOpen(!photosPanelOpen);
    });
  }
  setPhotosPanelOpen(false);

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

  if (sketchZoomOutBtn) {
    sketchZoomOutBtn.addEventListener('click', () => zoomSketchBy(0.85));
  }

  if (sketchZoomInBtn) {
    sketchZoomInBtn.addEventListener('click', () => zoomSketchBy(1.18));
  }

  if (sketchFitBtn) {
    sketchFitBtn.addEventListener('click', fitSketchViewport);
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

  if (finishAutoTraceBtn) {
    finishAutoTraceBtn.addEventListener('click', finishAutoTrace);
  }

  if (undoAutoTraceBtn) {
    undoAutoTraceBtn.addEventListener('click', undoAutoTraceSegment);
  }

  if (cancelAutoTraceBtn) {
    cancelAutoTraceBtn.addEventListener('click', cancelAutoTrace);
  }

  if (scaleAutoTraceBtn) {
    scaleAutoTraceBtn.addEventListener('click', applyAutoTraceScale);
  }

  if (autoTraceScaleSelect) {
    autoTraceScaleSelect.addEventListener('change', () => {
      const target = getAutoTraceScaleTarget();
      if (target && target.source === 'draft') {
        sketchAutoTraceScaleMode = normalizeAutoTraceScaleMode(autoTraceScaleSelect.value);
        sketchAutoTraceScale = null;
      }
      updateAutoTraceControls();
    });
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

  if (sketchDimensionSaveBtn) {
    sketchDimensionSaveBtn.addEventListener('click', saveAutoTraceDimension);
  }

  if (sketchDimensionSideBtn) {
    sketchDimensionSideBtn.addEventListener('click', changeAutoTraceDimensionSide);
  }

  if (sketchDimensionDeleteBtn) {
    sketchDimensionDeleteBtn.addEventListener('click', deleteAutoTraceDimension);
  }

  if (sketchDimensionCancelBtn) {
    sketchDimensionCancelBtn.addEventListener('click', closeAutoTraceDimensionDialog);
  }

  if (sketchDimensionInput) {
    sketchDimensionInput.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') saveAutoTraceDimension();
    });
  }

  if (sketchInclinedSaveBtn) {
    sketchInclinedSaveBtn.addEventListener('click', saveInclinedTraceSegment);
  }

  if (sketchInclinedCancelBtn) {
    sketchInclinedCancelBtn.addEventListener('click', closeInclinedTraceDialog);
  }

  if (sketchAngleInvertBtn) {
    sketchAngleInvertBtn.addEventListener('click', invertCurrentAngleDimension);
  }

  if (sketchAngleApplyBtn) {
    sketchAngleApplyBtn.addEventListener('click', applyCurrentAngleValue);
  }

  if (sketchAngleDeleteBtn) {
    sketchAngleDeleteBtn.addEventListener('click', deleteCurrentAngleDimension);
  }

  if (sketchAngleCloseBtn) {
    sketchAngleCloseBtn.addEventListener('click', closeAngleDimensionDialog);
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
      if (sketchDimensionDialog && !sketchDimensionDialog.hidden) {
        closeAutoTraceDimensionDialog();
        return;
      }
      if (sketchInclinedDialog && !sketchInclinedDialog.hidden) {
        closeInclinedTraceDialog();
        return;
      }
      if (sketchAngleDialog && !sketchAngleDialog.hidden) {
        closeAngleDimensionDialog();
        return;
      }
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
