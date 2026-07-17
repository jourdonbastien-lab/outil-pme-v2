(function () {
  function byId(id) {
    return document.getElementById(id);
  }

  function bindClick(id, callback) {
    const element = byId(id);
    if (!element || typeof callback !== 'function') return;
    element.addEventListener('click', callback);
  }

  function bindKeyEnter(id, callback) {
    const element = byId(id);
    if (!element || typeof callback !== 'function') return;
    element.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') callback(event);
    });
  }

  function initTechnicalDrawingEditor(options) {
    if (options && options.container && !options.callbacks) {
      throw new Error('L’ancien éditeur autonome est désactivé. Utiliser initEscalierDrawingEngine avec le moteur Escalier V2.');
    }

    const callbacks = options && options.callbacks ? options.callbacks : {};
    const elements = {
      modal: byId('sketchModal'),
      modalContent: byId('sketchModal') ? byId('sketchModal').querySelector('.sketch-modal-content') : null,
      toolButtons: Array.from(document.querySelectorAll('[data-sketch-tool]')),
      colorPalette: byId('sketchColorPalette'),
      sizePalette: byId('sketchSizePalette'),
    };

    if (elements.modal) {
      elements.modal.hidden = true;
      elements.modal.setAttribute('aria-hidden', 'true');
      elements.modal.addEventListener('click', (event) => {
        if (event.target === elements.modal && typeof callbacks.close === 'function') callbacks.close();
      });
    }

    bindClick('openSketchBtn', callbacks.open);
    bindClick('sketchCloseBtn', callbacks.close);
    bindClick('sketchSaveBtn', callbacks.save);
    bindClick('sketchZoomOutBtn', () => callbacks.zoomBy && callbacks.zoomBy(0.85));
    bindClick('sketchZoomInBtn', () => callbacks.zoomBy && callbacks.zoomBy(1.18));
    bindClick('sketchFitBtn', callbacks.fit);
    bindClick('toolPenBtn', () => callbacks.setTool && callbacks.setTool('pen'));
    bindClick('toolEraserBtn', () => callbacks.setTool && callbacks.setTool('eraser'));
    bindClick('undoSketchBtn', callbacks.undo);
    bindClick('redoSketchBtn', callbacks.redo);
    bindClick('finishAutoTraceBtn', callbacks.finishAutoTrace);
    bindClick('undoAutoTraceBtn', callbacks.undoAutoTraceSegment);
    bindClick('cancelAutoTraceBtn', callbacks.cancelAutoTrace);
    bindClick('scaleAutoTraceBtn', callbacks.applyAutoTraceScale);
    bindClick('clearSketchBtn', callbacks.clear);
    bindClick('useSketchPhotoBtn', callbacks.openPhotoPicker);
    bindClick('removeSketchPhotoBtn', callbacks.removeBackground);
    bindClick('openSketchSymbolBtn', callbacks.openSymbolPicker);
    bindClick('closeSketchPhotoPickerBtn', callbacks.closePhotoPicker);
    bindClick('closeSketchSymbolPickerBtn', callbacks.closeSymbolPicker);
    bindClick('sketchPhotoPickerBackdrop', callbacks.closePhotoPicker);
    bindClick('sketchSymbolPickerBackdrop', callbacks.closeSymbolPicker);
    bindClick('sketchSymbolSmallerBtn', () => callbacks.resizeSymbol && callbacks.resizeSymbol(0.86));
    bindClick('sketchSymbolLargerBtn', () => callbacks.resizeSymbol && callbacks.resizeSymbol(1.16));
    bindClick('sketchSymbolDeleteBtn', callbacks.deleteSymbol);
    bindClick('sketchTextConfirmBtn', callbacks.confirmText);
    bindClick('sketchDimensionSaveBtn', callbacks.saveDimension);
    bindClick('sketchDimensionSideBtn', callbacks.changeDimensionSide);
    bindClick('sketchDimensionDeleteBtn', callbacks.deleteDimension);
    bindClick('sketchDimensionCancelBtn', callbacks.closeDimensionDialog);
    bindClick('sketchInclinedSaveBtn', callbacks.saveInclinedSegment);
    bindClick('sketchInclinedCancelBtn', callbacks.closeInclinedDialog);
    bindClick('sketchAngleInvertBtn', callbacks.invertAngle);
    bindClick('sketchAngleApplyBtn', callbacks.applyAngle);
    bindClick('sketchAngleDeleteBtn', callbacks.deleteAngle);
    bindClick('sketchAngleCloseBtn', callbacks.closeAngleDialog);

    bindClick('sketchTextCancelBtn', () => {
      if (typeof callbacks.cancelText === 'function') callbacks.cancelText();
    });

    const autoTraceScaleSelect = byId('autoTraceScaleSelect');
    if (autoTraceScaleSelect && typeof callbacks.changeAutoTraceScale === 'function') {
      autoTraceScaleSelect.addEventListener('change', callbacks.changeAutoTraceScale);
    }

    elements.toolButtons.forEach((button) => {
      button.addEventListener('click', () => {
        if (typeof callbacks.setTool === 'function') {
          callbacks.setTool(String(button.getAttribute('data-sketch-tool') || 'pen'));
        }
      });
    });

    if (elements.colorPalette && typeof callbacks.setColor === 'function') {
      elements.colorPalette.querySelectorAll('[data-sketch-color]').forEach((button) => {
        button.addEventListener('click', () => callbacks.setColor(String(button.getAttribute('data-sketch-color') || '')));
      });
    }

    if (elements.sizePalette && typeof callbacks.setSize === 'function') {
      elements.sizePalette.querySelectorAll('[data-sketch-size]').forEach((button) => {
        button.addEventListener('click', () => callbacks.setSize(button.getAttribute('data-sketch-size')));
      });
    }

    bindKeyEnter('sketchTextInput', callbacks.confirmText);
    bindKeyEnter('sketchDimensionInput', callbacks.saveDimension);

    bindClick('sketchToolbarToggle', () => {
      if (!elements.modalContent || typeof callbacks.setToolbarCollapsed !== 'function') return;
      callbacks.setToolbarCollapsed(elements.modalContent.classList.contains('sketch-tools-collapsed') === false);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (typeof callbacks.handleEscape === 'function') callbacks.handleEscape(event);
    });

    window.addEventListener('resize', () => {
      if (typeof callbacks.handleResize === 'function') callbacks.handleResize();
    });

    window.addEventListener('orientationchange', () => {
      if (typeof callbacks.handleResize === 'function') callbacks.handleResize();
    });

    return {
      elements,
      setInitialState() {
        if (typeof callbacks.setTool === 'function') callbacks.setTool('pen');
        if (typeof callbacks.setSize === 'function') callbacks.setSize(2);
        if (typeof callbacks.setBackgroundUi === 'function') callbacks.setBackgroundUi();
        if (typeof callbacks.closePhotoPicker === 'function') callbacks.closePhotoPicker();
        if (typeof callbacks.setStatus === 'function') callbacks.setStatus('Pret');
      },
    };
  }

  function uid(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function clone(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return null;
    }
  }

  function makeSketch(index = 0) {
    return {
      id: uid('sketch'),
      title: `Croquis ${index + 1}`,
      strokes: [],
      annotations: [],
      backgroundImage: '',
      updatedAt: new Date().toISOString(),
    };
  }

  function normalizeSketches(value) {
    const list = Array.isArray(value) ? value : [];
    const sketches = list.map((item, index) => ({
      id: item && item.id ? String(item.id) : uid('sketch'),
      title: item && item.title ? String(item.title) : `Croquis ${index + 1}`,
      strokes: Array.isArray(item && item.strokes) ? item.strokes : [],
      annotations: Array.isArray(item && item.annotations) ? item.annotations : [],
      backgroundImage: item && item.backgroundImage ? String(item.backgroundImage) : '',
      updatedAt: item && item.updatedAt ? String(item.updatedAt) : new Date().toISOString(),
    }));
    return sketches.length ? sketches : [makeSketch(0)];
  }

  function initStandaloneTechnicalDrawingEditor(options) {
    const container = options.container;
    const onSave = typeof options.onSave === 'function' ? options.onSave : null;
    const onDirtyChange = typeof options.onDirtyChange === 'function' ? options.onDirtyChange : null;
    container.innerHTML = window.getTechnicalDrawingTemplate
      ? window.getTechnicalDrawingTemplate({ title: options.title || 'Croquis techniques' })
      : '';

    const rootQuery = (selector) => container.querySelector(selector);
    const canvas = rootQuery('#sketchCanvas');
    const ctx = canvas ? canvas.getContext('2d') : null;
    const select = rootQuery('#technicalDrawingSketchSelect');
    const inlineStatus = rootQuery('#sketchStatusInline');
    const modal = rootQuery('#sketchModal');
    const modalContent = rootQuery('.sketch-modal-content');
    const symbolPicker = rootQuery('#sketchSymbolPicker');
    const symbolPickerBackdrop = rootQuery('#sketchSymbolPickerBackdrop');
    const symbolPickerList = rootQuery('#sketchSymbolPickerList');
    const photoPicker = rootQuery('#sketchPhotoPicker');
    const photoPickerBackdrop = rootQuery('#sketchPhotoPickerBackdrop');
    const photoPickerList = rootQuery('#sketchPhotoPickerList');
    const textDialog = rootQuery('#sketchTextDialog');
    const textInput = rootQuery('#sketchTextInput');
    const dimensionDialog = rootQuery('#sketchDimensionDialog');
    const dimensionInput = rootQuery('#sketchDimensionInput');
    const angleDialog = rootQuery('#sketchAngleDialog');
    const angleValue = rootQuery('#sketchAngleDialogValue');
    const inclinedDialog = rootQuery('#sketchInclinedDialog');
    const inclinedAngleInput = rootQuery('#sketchInclinedAngleInput');
    const inclinedLengthInput = rootQuery('#sketchInclinedLengthInput');
    const bgLabel = rootQuery('#sketchBgLabel');
    const zoomLabel = rootQuery('#sketchZoomLabel');
    const status = rootQuery('#sketchStatus');
    const autoTraceControls = rootQuery('#sketchAutoTraceControls');
    const autoTraceScaleLabel = rootQuery('#autoTraceScaleLabel');

    let sketches = normalizeSketches(options.initialData);
    let activeIndex = 0;
    let tool = 'pen';
    let color = '#111827';
    let size = 2;
    let viewport = { scale: 1, offsetX: 0, offsetY: 0 };
    let history = [];
    let historyIndex = -1;
    let drawing = null;
    let selected = null;
    let autoPoints = [];
    let autoPreview = null;
    let pendingTextPoint = null;
    let pendingDimension = null;
    let pendingInclinedPoint = null;

    function activeSketch() {
      return sketches[activeIndex] || sketches[0];
    }

    function setStatus(message) {
      const text = String(message || 'Prêt');
      if (status) status.textContent = text;
      if (inlineStatus) inlineStatus.textContent = text;
    }

    function markDirty() {
      activeSketch().updatedAt = new Date().toISOString();
      if (onDirtyChange) onDirtyChange(true);
      renderSketchTabs();
      render();
    }

    function pushHistory() {
      history = history.slice(0, historyIndex + 1);
      history.push(clone(activeSketch()));
      historyIndex = history.length - 1;
    }

    function restoreHistory(index) {
      const snapshot = clone(history[index]);
      if (!snapshot) return;
      sketches[activeIndex] = snapshot;
      historyIndex = index;
      selected = null;
      renderSketchTabs();
      render();
      if (onDirtyChange) onDirtyChange(true);
    }

    function renderSketchTabs() {
      if (!select) return;
      select.innerHTML = '';
      sketches.forEach((sketch, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = sketch.title;
        select.appendChild(option);
      });
      select.value = String(activeIndex);
    }

    function resizeCanvas() {
      if (!canvas || !ctx || !modal || modal.hidden) return;
      const wrap = canvas.parentElement;
      const rect = wrap.getBoundingClientRect();
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = Math.max(320, Math.round(rect.width * ratio));
      canvas.height = Math.max(260, Math.round(rect.height * ratio));
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      render();
    }

    function cssSize() {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      return {
        width: Math.max(1, canvas.width / ratio),
        height: Math.max(1, canvas.height / ratio),
      };
    }

    function screenPoint(event) {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    function drawingPointFromScreen(point) {
      return {
        x: (point.x - viewport.offsetX) / viewport.scale,
        y: (point.y - viewport.offsetY) / viewport.scale,
      };
    }

    function unitFromDrawing(point) {
      const bounds = cssSize();
      return {
        x: Math.max(0, Math.min(1, point.x / bounds.width)),
        y: Math.max(0, Math.min(1, point.y / bounds.height)),
      };
    }

    function drawingFromUnit(point) {
      const bounds = cssSize();
      return { x: Number(point.x || 0) * bounds.width, y: Number(point.y || 0) * bounds.height };
    }

    function canvasPoint(event) {
      return drawingPointFromScreen(screenPoint(event));
    }

    function setTool(nextTool) {
      tool = nextTool || 'pen';
      container.querySelectorAll('[data-sketch-tool], #toolPenBtn, #toolEraserBtn').forEach((button) => {
        const key = button.id === 'toolPenBtn' ? 'pen' : button.id === 'toolEraserBtn' ? 'eraser' : button.getAttribute('data-sketch-tool');
        const active = key === tool;
        button.classList.toggle('is-active', active);
        button.classList.toggle('annotation-active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      if (autoTraceControls) {
        autoTraceControls.hidden = tool !== 'auto_trace' && !autoPoints.length;
        autoTraceControls.setAttribute('aria-hidden', autoTraceControls.hidden ? 'true' : 'false');
      }
      render();
    }

    function setViewport(next) {
      viewport = {
        scale: Math.max(0.5, Math.min(5, Number(next.scale || 1))),
        offsetX: Number(next.offsetX || 0),
        offsetY: Number(next.offsetY || 0),
      };
      if (zoomLabel) zoomLabel.textContent = `${Math.round(viewport.scale * 100)} %`;
      render();
    }

    function zoomBy(factor) {
      const bounds = cssSize();
      const center = { x: bounds.width / 2, y: bounds.height / 2 };
      const before = drawingPointFromScreen(center);
      const nextScale = viewport.scale * factor;
      setViewport({
        scale: nextScale,
        offsetX: center.x - before.x * nextScale,
        offsetY: center.y - before.y * nextScale,
      });
    }

    function drawStroke(stroke) {
      if (!stroke.points || stroke.points.length < 2) return;
      ctx.save();
      ctx.strokeStyle = stroke.color || '#111827';
      ctx.lineWidth = stroke.width || 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      stroke.points.forEach((point, index) => {
        const p = drawingFromUnit(point);
        if (index) ctx.lineTo(p.x, p.y);
        else ctx.moveTo(p.x, p.y);
      });
      ctx.stroke();
      ctx.restore();
    }

    function drawArrow(from, to, strokeColor, strokeWidth) {
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const length = Math.max(10, strokeWidth * 5);
      ctx.beginPath();
      ctx.moveTo(to.x, to.y);
      ctx.lineTo(to.x - length * Math.cos(angle - Math.PI / 7), to.y - length * Math.sin(angle - Math.PI / 7));
      ctx.lineTo(to.x - length * Math.cos(angle + Math.PI / 7), to.y - length * Math.sin(angle + Math.PI / 7));
      ctx.closePath();
      ctx.fillStyle = strokeColor;
      ctx.fill();
    }

    function drawAnnotation(annotation) {
      ctx.save();
      ctx.strokeStyle = annotation.color || '#111827';
      ctx.fillStyle = annotation.color || '#111827';
      ctx.lineWidth = annotation.width || 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (annotation.type === 'text') {
        const p = drawingFromUnit(annotation);
        ctx.font = `800 ${annotation.fontSize || 22}px Arial, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        String(annotation.text || '').split('\n').forEach((line, index) => ctx.fillText(line, p.x, p.y + index * 26));
      } else if (annotation.type === 'symbol') {
        const p = drawingFromUnit(annotation);
        const w = (annotation.width || 0.12) * cssSize().width;
        const h = (annotation.height || 0.08) * cssSize().height;
        ctx.strokeRect(p.x - w / 2, p.y - h / 2, w, h);
        ctx.font = '900 18px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(annotation.label || annotation.symbol || 'Symbole', p.x, p.y);
      } else if (annotation.type === 'auto_trace') {
        const points = annotation.points || [];
        if (points.length > 1) {
          ctx.beginPath();
          points.forEach((point, index) => {
            const p = drawingFromUnit(point);
            if (index) ctx.lineTo(p.x, p.y);
            else ctx.moveTo(p.x, p.y);
          });
          ctx.stroke();
          points.forEach((point) => {
            const p = drawingFromUnit(point);
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            ctx.fill();
          });
        }
        (annotation.dimensions || []).forEach((dimension) => drawDimension(annotation, dimension));
      } else if (['line', 'arrow', 'dimension', 'inclined_trace'].includes(annotation.type)) {
        const a = drawingFromUnit({ x: annotation.x1, y: annotation.y1 });
        const b = drawingFromUnit({ x: annotation.x2, y: annotation.y2 });
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        if (annotation.type === 'arrow' || annotation.type === 'inclined_trace') drawArrow(a, b, annotation.color || '#111827', annotation.width || 2);
        if (annotation.text) {
          ctx.font = '800 16px Arial, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(annotation.text, (a.x + b.x) / 2, (a.y + b.y) / 2 - 10);
        }
      }
      ctx.restore();
    }

    function drawDimension(trace, dimension) {
      const a = drawingFromUnit(trace.points[dimension.segmentIndex]);
      const b = drawingFromUnit(trace.points[dimension.segmentIndex + 1]);
      if (!a || !b) return;
      const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
      const offset = 24;
      const y = horizontal ? a.y - offset : null;
      const x = horizontal ? null : a.x + offset;
      ctx.save();
      ctx.strokeStyle = trace.color || '#111827';
      ctx.fillStyle = trace.color || '#111827';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (horizontal) {
        ctx.moveTo(a.x, y);
        ctx.lineTo(b.x, y);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.x, y);
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x, y);
        ctx.textAlign = 'center';
        ctx.fillText(`${dimension.value} ${dimension.unit || 'mm'}`, (a.x + b.x) / 2, y - 6);
      } else {
        ctx.moveTo(x, a.y);
        ctx.lineTo(x, b.y);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(x, a.y);
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(x, b.y);
        ctx.textAlign = 'left';
        ctx.fillText(`${dimension.value} ${dimension.unit || 'mm'}`, x + 8, (a.y + b.y) / 2);
      }
      ctx.stroke();
      ctx.restore();
    }

    function render() {
      if (!ctx || !canvas) return;
      const bounds = cssSize();
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, bounds.width, bounds.height);
      ctx.save();
      ctx.translate(viewport.offsetX, viewport.offsetY);
      ctx.scale(viewport.scale, viewport.scale);
      const sketch = activeSketch();
      if (sketch.backgroundImage) {
        const img = new Image();
        img.onload = () => {
          ctx.save();
          ctx.translate(viewport.offsetX, viewport.offsetY);
          ctx.scale(viewport.scale, viewport.scale);
          ctx.drawImage(img, 0, 0, bounds.width, bounds.height);
          sketch.strokes.forEach(drawStroke);
          sketch.annotations.forEach(drawAnnotation);
          ctx.restore();
        };
        img.src = sketch.backgroundImage;
      }
      sketch.strokes.forEach(drawStroke);
      sketch.annotations.forEach(drawAnnotation);
      if (drawing && drawing.preview) drawAnnotation(drawing.preview);
      if (autoPoints.length) {
        drawAnnotation({ type: 'auto_trace', points: autoPreview ? autoPoints.concat([autoPreview]) : autoPoints, color, width: size });
      }
      ctx.restore();
    }

    function openModal() {
      modal.hidden = false;
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('sketch-open');
      window.setTimeout(resizeCanvas, 20);
      pushHistory();
      setStatus('Prêt');
    }

    function closeModal() {
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('sketch-open');
      autoPoints = [];
      autoPreview = null;
      drawing = null;
    }

    async function save() {
      const preview = canvas ? canvas.toDataURL('image/png') : '';
      if (onSave) await onSave(serialize(), preview);
      if (onDirtyChange) onDirtyChange(false);
      setStatus('Enregistré');
    }

    function serialize() {
      return clone(sketches) || [];
    }

    function load(data) {
      sketches = normalizeSketches(data);
      activeIndex = 0;
      renderSketchTabs();
      render();
    }

    function addCurrentAutoTrace() {
      if (autoPoints.length < 2) return;
      activeSketch().annotations.push({ id: uid('trace'), type: 'auto_trace', points: autoPoints.slice(), color, width: size, dimensions: [] });
      autoPoints = [];
      autoPreview = null;
      pushHistory();
      markDirty();
      setStatus('Tracé ajouté');
    }

    function addSymbol() {
      const symbols = window.TECHNICAL_DRAWING_SYMBOLS || [];
      const label = symbols.map((symbol, index) => `${index + 1}. ${symbol.label}`).join('\n');
      const chosen = window.prompt(`Symbole à ajouter :\n${label}`, 'IPN');
      if (!chosen) return;
      const found = symbols.find((symbol) => symbol.label.toLowerCase() === chosen.toLowerCase() || symbol.key === chosen);
      activeSketch().annotations.push({
        id: uid('symbol'),
        type: 'symbol',
        symbol: found ? found.key : 'obstacle',
        label: found ? found.label : chosen,
        x: 0.5,
        y: 0.5,
        width: 0.14,
        height: 0.08,
        color,
        widthStroke: size,
      });
      pushHistory();
      markDirty();
    }

    function handlePointerDown(event) {
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      const p = canvasPoint(event);
      const unit = unitFromDrawing(p);
      if (tool === 'pan') {
        drawing = { type: 'pan', pointerId: event.pointerId, start: screenPoint(event), viewport: { ...viewport } };
        return;
      }
      if (tool === 'text') {
        pendingTextPoint = unit;
        textInput.value = '';
        textDialog.hidden = false;
        textDialog.setAttribute('aria-hidden', 'false');
        textInput.focus();
        return;
      }
      if (tool === 'auto_trace') {
        if (!autoPoints.length) {
          autoPoints.push(unit);
        } else {
          const last = autoPoints[autoPoints.length - 1];
          const dx = unit.x - last.x;
          const dy = unit.y - last.y;
          autoPoints.push(Math.abs(dy) >= Math.abs(dx) ? { x: last.x, y: unit.y } : { x: unit.x, y: last.y });
        }
        markDirty();
        return;
      }
      if (tool === 'auto_dimension') {
        const trace = activeSketch().annotations.find((item) => item.type === 'auto_trace' && item.points && item.points.length > 1);
        if (!trace) {
          setStatus('Créez un tracé automatique avant la cotation');
          return;
        }
        pendingDimension = { trace };
        dimensionInput.value = '';
        dimensionDialog.hidden = false;
        dimensionDialog.setAttribute('aria-hidden', 'false');
        dimensionInput.focus();
        return;
      }
      if (tool === 'inclined_trace') {
        pendingInclinedPoint = unit;
        inclinedAngleInput.value = '';
        inclinedLengthInput.value = '';
        inclinedDialog.hidden = false;
        inclinedDialog.setAttribute('aria-hidden', 'false');
        inclinedAngleInput.focus();
        return;
      }
      if (tool === 'pen' || tool === 'eraser') {
        drawing = { type: 'stroke', stroke: { id: uid('stroke'), color: tool === 'eraser' ? '#ffffff' : color, width: tool === 'eraser' ? Math.max(10, size * 4) : size, points: [unit] } };
        activeSketch().strokes.push(drawing.stroke);
      }
    }

    function handlePointerMove(event) {
      if (!drawing && tool === 'auto_trace' && autoPoints.length) {
        const unit = unitFromDrawing(canvasPoint(event));
        const last = autoPoints[autoPoints.length - 1];
        const dx = unit.x - last.x;
        const dy = unit.y - last.y;
        autoPreview = Math.abs(dy) >= Math.abs(dx) ? { x: last.x, y: unit.y } : { x: unit.x, y: last.y };
        render();
        return;
      }
      if (!drawing) return;
      event.preventDefault();
      if (drawing.type === 'pan') {
        const now = screenPoint(event);
        setViewport({
          scale: drawing.viewport.scale,
          offsetX: drawing.viewport.offsetX + now.x - drawing.start.x,
          offsetY: drawing.viewport.offsetY + now.y - drawing.start.y,
        });
        return;
      }
      if (drawing.type === 'stroke') {
        drawing.stroke.points.push(unitFromDrawing(canvasPoint(event)));
        render();
      }
    }

    function handlePointerUp(event) {
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {}
      if (drawing && drawing.type === 'stroke') {
        pushHistory();
        markDirty();
      }
      drawing = null;
    }

    function saveText() {
      const value = String(textInput.value || '').trim();
      textDialog.hidden = true;
      textDialog.setAttribute('aria-hidden', 'true');
      if (!value || !pendingTextPoint) return;
      activeSketch().annotations.push({ id: uid('text'), type: 'text', x: pendingTextPoint.x, y: pendingTextPoint.y, text: value, color, width: size, fontSize: 22 });
      pendingTextPoint = null;
      pushHistory();
      markDirty();
    }

    function saveDimension() {
      const value = String(dimensionInput.value || '').trim();
      dimensionDialog.hidden = true;
      dimensionDialog.setAttribute('aria-hidden', 'true');
      if (!value || !pendingDimension || !pendingDimension.trace) return;
      pendingDimension.trace.dimensions = pendingDimension.trace.dimensions || [];
      pendingDimension.trace.dimensions.push({ segmentIndex: 0, value, unit: 'mm', side: 'top' });
      pendingDimension = null;
      pushHistory();
      markDirty();
    }

    function saveInclined() {
      const angle = Number(String(inclinedAngleInput.value || '').replace(',', '.'));
      const length = Number(String(inclinedLengthInput.value || '').replace(',', '.'));
      inclinedDialog.hidden = true;
      inclinedDialog.setAttribute('aria-hidden', 'true');
      if (!pendingInclinedPoint || !Number.isFinite(angle) || !Number.isFinite(length) || length <= 0) return;
      const radians = angle * Math.PI / 180;
      const pxLength = Math.min(360, Math.max(40, length / 10));
      const start = drawingFromUnit(pendingInclinedPoint);
      const end = { x: start.x + pxLength * Math.cos(radians), y: start.y - pxLength * Math.sin(radians) };
      const bounds = cssSize();
      activeSketch().annotations.push({
        id: uid('inclined'),
        type: 'inclined_trace',
        x1: pendingInclinedPoint.x,
        y1: pendingInclinedPoint.y,
        x2: Math.max(0, Math.min(1, end.x / bounds.width)),
        y2: Math.max(0, Math.min(1, end.y / bounds.height)),
        text: `${length} mm`,
        angle,
        realLength: length,
        color,
        width: size,
      });
      pendingInclinedPoint = null;
      pushHistory();
      markDirty();
    }

    function closeDialogs() {
      [textDialog, dimensionDialog, angleDialog, inclinedDialog, symbolPicker, symbolPickerBackdrop, photoPicker, photoPickerBackdrop].forEach((element) => {
        if (!element) return;
        element.hidden = true;
        element.setAttribute('aria-hidden', 'true');
      });
    }

    function openSymbols() {
      const symbols = window.TECHNICAL_DRAWING_SYMBOLS || [];
      symbolPickerList.innerHTML = '';
      symbols.forEach((symbol) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'sketch-symbol-choice';
        button.innerHTML = `<strong>${symbol.icon || ''}</strong><span></span>`;
        button.querySelector('span').textContent = symbol.label;
        button.addEventListener('click', () => {
          activeSketch().annotations.push({ id: uid('symbol'), type: 'symbol', symbol: symbol.key, label: symbol.label, x: 0.5, y: 0.5, width: 0.14, height: 0.08, color, widthStroke: size });
          closeDialogs();
          pushHistory();
          markDirty();
        });
        symbolPickerList.appendChild(button);
      });
      symbolPicker.hidden = false;
      symbolPickerBackdrop.hidden = false;
      symbolPicker.setAttribute('aria-hidden', 'false');
      symbolPickerBackdrop.setAttribute('aria-hidden', 'false');
    }

    function openPhotoPicker() {
      const photos = typeof options.getPhotos === 'function' ? options.getPhotos() : [];
      photoPickerList.innerHTML = '';
      if (!photos.length) {
        photoPickerList.innerHTML = '<div class="photo-empty">Aucune photo disponible.</div>';
      }
      photos.forEach((photo) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'sketch-photo-choice';
        button.innerHTML = `<img alt=""><span></span>`;
        button.querySelector('img').src = photo.dataUrl || photo.url || '';
        button.querySelector('span').textContent = photo.caption || photo.name || 'Photo';
        button.addEventListener('click', () => {
          activeSketch().backgroundImage = photo.dataUrl || photo.url || '';
          if (bgLabel) bgLabel.textContent = 'Fond: photo';
          closeDialogs();
          markDirty();
        });
        photoPickerList.appendChild(button);
      });
      photoPicker.hidden = false;
      photoPickerBackdrop.hidden = false;
      photoPicker.setAttribute('aria-hidden', 'false');
      photoPickerBackdrop.setAttribute('aria-hidden', 'false');
    }

    rootQuery('#openSketchBtn').addEventListener('click', openModal);
    rootQuery('#sketchCloseBtn').addEventListener('click', closeModal);
    rootQuery('#sketchSaveBtn').addEventListener('click', save);
    rootQuery('#sketchZoomOutBtn').addEventListener('click', () => zoomBy(0.85));
    rootQuery('#sketchZoomInBtn').addEventListener('click', () => zoomBy(1.18));
    rootQuery('#sketchFitBtn').addEventListener('click', () => setViewport({ scale: 1, offsetX: 0, offsetY: 0 }));
    rootQuery('#toolPenBtn').addEventListener('click', () => setTool('pen'));
    rootQuery('#toolEraserBtn').addEventListener('click', () => setTool('eraser'));
    rootQuery('#undoSketchBtn').addEventListener('click', () => historyIndex > 0 && restoreHistory(historyIndex - 1));
    rootQuery('#redoSketchBtn').addEventListener('click', () => historyIndex < history.length - 1 && restoreHistory(historyIndex + 1));
    rootQuery('#clearSketchBtn').addEventListener('click', () => {
      if (!window.confirm('Effacer le croquis ?')) return;
      activeSketch().strokes = [];
      activeSketch().annotations = [];
      pushHistory();
      markDirty();
    });
    rootQuery('#finishAutoTraceBtn').addEventListener('click', addCurrentAutoTrace);
    rootQuery('#undoAutoTraceBtn').addEventListener('click', () => {
      autoPoints.pop();
      autoPreview = null;
      render();
    });
    rootQuery('#cancelAutoTraceBtn').addEventListener('click', () => {
      autoPoints = [];
      autoPreview = null;
      render();
    });
    rootQuery('#scaleAutoTraceBtn').addEventListener('click', () => {
      if (autoTraceScaleLabel) autoTraceScaleLabel.textContent = 'Échelle visuelle : conservée';
    });
    rootQuery('#openSketchSymbolBtn').addEventListener('click', openSymbols);
    rootQuery('#useSketchPhotoBtn').addEventListener('click', openPhotoPicker);
    rootQuery('#removeSketchPhotoBtn').addEventListener('click', () => {
      activeSketch().backgroundImage = '';
      if (bgLabel) bgLabel.textContent = 'Fond: aucun';
      markDirty();
    });
    rootQuery('#sketchTextConfirmBtn').addEventListener('click', saveText);
    rootQuery('#sketchTextCancelBtn').addEventListener('click', closeDialogs);
    rootQuery('#sketchDimensionSaveBtn').addEventListener('click', saveDimension);
    rootQuery('#sketchDimensionCancelBtn').addEventListener('click', closeDialogs);
    rootQuery('#sketchInclinedSaveBtn').addEventListener('click', saveInclined);
    rootQuery('#sketchInclinedCancelBtn').addEventListener('click', closeDialogs);
    rootQuery('#sketchAngleCloseBtn').addEventListener('click', closeDialogs);
    rootQuery('#sketchAngleApplyBtn').addEventListener('click', closeDialogs);
    rootQuery('#sketchAngleInvertBtn').addEventListener('click', () => angleValue.textContent = 'Angle inversé');
    rootQuery('#sketchAngleDeleteBtn').addEventListener('click', closeDialogs);
    rootQuery('#closeSketchSymbolPickerBtn').addEventListener('click', closeDialogs);
    rootQuery('#closeSketchPhotoPickerBtn').addEventListener('click', closeDialogs);
    symbolPickerBackdrop.addEventListener('click', closeDialogs);
    photoPickerBackdrop.addEventListener('click', closeDialogs);
    rootQuery('#sketchToolbarToggle').addEventListener('click', () => {
      modalContent.classList.toggle('sketch-tools-collapsed');
    });
    container.querySelectorAll('[data-sketch-tool]').forEach((button) => button.addEventListener('click', () => setTool(button.getAttribute('data-sketch-tool'))));
    container.querySelectorAll('[data-sketch-color]').forEach((button) => button.addEventListener('click', () => {
      color = button.getAttribute('data-sketch-color') || color;
      setTool('pen');
    }));
    container.querySelectorAll('[data-sketch-size]').forEach((button) => button.addEventListener('click', () => {
      size = Number(button.getAttribute('data-sketch-size') || size);
    }));
    select.addEventListener('change', () => {
      activeIndex = Number(select.value || 0);
      pushHistory();
      render();
    });
    rootQuery('#technicalDrawingAddSketchBtn').addEventListener('click', () => {
      sketches.push(makeSketch(sketches.length));
      activeIndex = sketches.length - 1;
      renderSketchTabs();
      markDirty();
    });
    rootQuery('#technicalDrawingRenameSketchBtn').addEventListener('click', () => {
      const next = window.prompt('Nom du croquis', activeSketch().title);
      if (!next) return;
      activeSketch().title = next.trim();
      markDirty();
    });
    rootQuery('#technicalDrawingDeleteSketchBtn').addEventListener('click', () => {
      if (sketches.length <= 1 || !window.confirm('Supprimer ce croquis ?')) return;
      sketches.splice(activeIndex, 1);
      activeIndex = Math.max(0, activeIndex - 1);
      renderSketchTabs();
      markDirty();
    });
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);
    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      zoomBy(event.deltaY < 0 ? 1.12 : 0.89);
    }, { passive: false });
    window.addEventListener('resize', resizeCanvas);
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || modal.hidden) return;
      if (!textDialog.hidden || !dimensionDialog.hidden || !inclinedDialog.hidden || !angleDialog.hidden || !symbolPicker.hidden || !photoPicker.hidden) closeDialogs();
      else closeModal();
    });

    renderSketchTabs();
    pushHistory();
    setTool('pen');

    return { serialize, load, open: openModal, close: closeModal, render };
  }

  window.initTechnicalDrawingEditor = initTechnicalDrawingEditor;
})();
