(function () {
  const FALLBACK_SYMBOL_LIBRARY = [
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

  function normalizeAngleDegrees(value) {
    const number = Number(String(value ?? '').replace(',', '.'));
    if (!Number.isFinite(number)) return 0;
    return ((number % 360) + 360) % 360;
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

  function angleBetweenVectors(v1, v2) {
    const len1 = Math.max(1, Math.hypot(v1.x, v1.y));
    const len2 = Math.max(1, Math.hypot(v2.x, v2.y));
    const dot = (v1.x * v2.x + v1.y * v2.y) / (len1 * len2);
    return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
  }

  function angleDimensionKey(traceId, segmentA, segmentB) {
    return `${String(traceId || 'trace')}-angle-${Math.min(segmentA, segmentB)}-${Math.max(segmentA, segmentB)}`;
  }

  window.createTechnicalDrawingCore = function createTechnicalDrawingCore() {
    const AUTO_TRACE_SCALE_OPTIONS = [10, 20, 25, 50, 100];

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

    return {
      ANNOTATION_TOOLS: new Set(['line', 'arrow', 'rect', 'ellipse', 'text', 'marker', 'dimension', 'symbol', 'auto_trace']),
      SKETCH_TOOLS: new Set(['line', 'arrow', 'rect', 'ellipse', 'text', 'marker', 'dimension', 'symbol', 'auto_trace', 'auto_dimension', 'inclined_trace', 'angle_dimension', 'pan']),
      AUTO_TRACE_SCALE_OPTIONS,
      CSS_PIXELS_PER_MILLIMETER: 96 / 25.4,
      SYMBOL_LIBRARY: window.TECHNICAL_DRAWING_SYMBOLS || FALLBACK_SYMBOL_LIBRARY,
      cloneSketchAnnotations,
      normalizeUnit,
      normalizeAutoTraceSide,
      normalizeAutoTraceDimension,
      normalizeAutoTraceScaleMode,
      normalizeAutoTraceScale,
      autoTraceDirectionFromPoints,
      normalizeAutoTraceDirection,
      normalizeAngleDegrees,
      directionAngleDegrees,
      directionFromAngle,
      normalizeAutoTraceAngleDimension,
      makeAutoTraceId,
      normalizeAutoTraceId,
      normalizeAutoTraceAnchor,
      angleBetweenVectors,
      angleDimensionKey,
    };
  };
})();
