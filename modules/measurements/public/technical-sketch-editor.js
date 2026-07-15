(function () {
  const LOGICAL_WIDTH = 1200;
  const LOGICAL_HEIGHT = 760;
  const DEFAULT_COLOR = '#111827';

  const SYMBOLS = [
    ['outlet', 'Prise électrique'],
    ['switch', 'Interrupteur'],
    ['radiator', 'Radiateur'],
    ['beam', 'Poutre'],
    ['ipn', 'IPN'],
    ['post', 'Poteau'],
    ['window', 'Fenêtre'],
    ['door', 'Porte'],
    ['concrete-wall', 'Mur béton'],
    ['stone-wall', 'Mur pierre'],
    ['partition', 'Cloison'],
    ['level', 'Niveau'],
    ['up', 'Sens de montée'],
    ['start', 'Départ'],
    ['arrival', 'Arrivée'],
    ['obstacle', 'Obstacle'],
    ['duct', 'Gaine technique'],
    ['opening', 'Trémie'],
    ['slab', 'Dalle'],
    ['fixing', 'Point de fixation'],
  ];

  function uid(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalizeSketch(raw, index) {
    const sketch = raw && typeof raw === 'object' ? raw : {};
    return {
      id: sketch.id || uid('sketch'),
      title: sketch.title || `Croquis ${index + 1}`,
      strokes: Array.isArray(sketch.strokes) ? sketch.strokes : [],
      objects: Array.isArray(sketch.objects) ? sketch.objects : [],
      updatedAt: sketch.updatedAt || new Date().toISOString(),
    };
  }

  function initTechnicalSketchEditor(options) {
    const root = options && options.root;
    if (!root) return null;

    let sketches = [normalizeSketch({ title: 'Croquis 1' }, 0)];
    let activeIndex = 0;
    let activeTool = 'pen';
    let selectedId = null;
    let drawingStroke = null;
    let draggingObject = null;
    let legacyUrl = '';

    root.innerHTML = [
      '<div class="technical-sketch-shell">',
      '<div class="technical-sketch-head">',
      '<div><h3>Croquis techniques</h3><p>Dessin libre, textes et symboles métier. Plusieurs croquis peuvent être enregistrés dans cette fiche.</p></div>',
      '<span class="technical-sketch-count" data-sketch-count>1 croquis</span>',
      '</div>',
      '<div class="technical-sketch-layout">',
      '<aside class="technical-sketch-list">',
      '<div class="technical-sketch-list-items" data-sketch-list></div>',
      '<button type="button" class="primary" data-sketch-add>Ajouter un croquis</button>',
      '<button type="button" data-sketch-rename>Renommer</button>',
      '<button type="button" class="danger" data-sketch-delete>Supprimer le croquis</button>',
      '</aside>',
      '<div class="technical-sketch-stage">',
      '<div class="technical-sketch-toolbar" role="toolbar" aria-label="Outils de croquis">',
      '<button type="button" class="technical-sketch-tool" data-tool="pen">Main libre</button>',
      '<button type="button" class="technical-sketch-tool" data-tool="select">Déplacer</button>',
      '<button type="button" class="technical-sketch-tool" data-tool="text">Texte</button>',
      '<button type="button" data-add-symbol>Symbole</button>',
      '<select data-symbol-select aria-label="Symbole métier"></select>',
      '</div>',
      '<div class="technical-sketch-objectbar">',
      '<label>Couleur <input type="color" data-color value="#111827"></label>',
      '<label>Taille <select data-font-size><option value="16">Petite</option><option value="22" selected>Moyenne</option><option value="30">Grande</option></select></label>',
      '<label>Rotation <select data-rotation><option value="0">0°</option><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option></select></label>',
      '<button type="button" data-edit-object>Modifier sélection</button>',
      '<button type="button" class="danger" data-delete-object>Supprimer sélection</button>',
      '</div>',
      '<div class="technical-sketch-canvas-wrap"><canvas class="technical-sketch-canvas" width="1200" height="760" aria-label="Zone de croquis technique"></canvas></div>',
      '<div class="technical-sketch-actions">',
      '<button type="button" data-clear-sketch>Effacer ce croquis</button>',
      '<span class="technical-sketch-status" data-sketch-status></span>',
      '</div>',
      '<div class="technical-sketch-legacy" data-legacy-sketch><p>Ancien croquis PNG conservé pour cette fiche.</p><img alt="Ancien croquis enregistré" /></div>',
      '</div>',
      '</div>',
      '</div>',
    ].join('');

    const canvas = root.querySelector('.technical-sketch-canvas');
    const ctx = canvas.getContext('2d');
    const list = root.querySelector('[data-sketch-list]');
    const count = root.querySelector('[data-sketch-count]');
    const status = root.querySelector('[data-sketch-status]');
    const colorInput = root.querySelector('[data-color]');
    const fontSizeSelect = root.querySelector('[data-font-size]');
    const rotationSelect = root.querySelector('[data-rotation]');
    const symbolSelect = root.querySelector('[data-symbol-select]');
    const legacyBlock = root.querySelector('[data-legacy-sketch]');
    const legacyImage = legacyBlock.querySelector('img');

    SYMBOLS.forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      symbolSelect.appendChild(option);
    });

    function activeSketch() {
      return sketches[activeIndex] || sketches[0];
    }

    function setStatus(message) {
      status.textContent = message || '';
    }

    function markChanged() {
      activeSketch().updatedAt = new Date().toISOString();
      if (options.onChange) options.onChange();
      renderList();
      render();
    }

    function selectTool(tool) {
      activeTool = tool;
      root.querySelectorAll('[data-tool]').forEach((button) => {
        button.classList.toggle('is-active', button.dataset.tool === tool);
      });
      canvas.classList.toggle('is-moving', tool === 'select');
    }

    function renderList() {
      list.innerHTML = '';
      sketches.forEach((sketch, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `technical-sketch-tab${index === activeIndex ? ' is-active' : ''}`;
        button.innerHTML = `<span></span><small>${(sketch.objects.length + sketch.strokes.length)} élément(s)</small>`;
        button.querySelector('span').textContent = sketch.title || `Croquis ${index + 1}`;
        button.addEventListener('click', () => {
          activeIndex = index;
          selectedId = null;
          renderList();
          render();
        });
        list.appendChild(button);
      });
      count.textContent = `${sketches.length} croquis`;
    }

    function pointFromEvent(event) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: clamp(((event.clientX - rect.left) / rect.width) * LOGICAL_WIDTH, 0, LOGICAL_WIDTH),
        y: clamp(((event.clientY - rect.top) / rect.height) * LOGICAL_HEIGHT, 0, LOGICAL_HEIGHT),
      };
    }

    function objectBounds(object) {
      const width = object.width || 120;
      const height = object.height || 70;
      return {
        x1: object.x - width / 2,
        y1: object.y - height / 2,
        x2: object.x + width / 2,
        y2: object.y + height / 2,
      };
    }

    function hitObject(point) {
      const objects = activeSketch().objects;
      for (let index = objects.length - 1; index >= 0; index -= 1) {
        const object = objects[index];
        const bounds = objectBounds(object);
        if (point.x >= bounds.x1 - 12 && point.x <= bounds.x2 + 12 && point.y >= bounds.y1 - 12 && point.y <= bounds.y2 + 12) {
          return object;
        }
      }
      return null;
    }

    function drawGrid() {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.06)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= LOGICAL_WIDTH; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, LOGICAL_HEIGHT);
        ctx.stroke();
      }
      for (let y = 0; y <= LOGICAL_HEIGHT; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(LOGICAL_WIDTH, y);
        ctx.stroke();
      }
    }

    function drawStroke(stroke) {
      if (!stroke.points || stroke.points.length < 2) return;
      ctx.save();
      ctx.strokeStyle = stroke.color || DEFAULT_COLOR;
      ctx.lineWidth = stroke.width || 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      stroke.points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
      ctx.stroke();
      ctx.restore();
    }

    function drawSymbol(object) {
      const width = object.width || 120;
      const height = object.height || 70;
      const x = object.x - width / 2;
      const y = object.y - height / 2;
      ctx.save();
      ctx.translate(object.x, object.y);
      ctx.rotate(((object.rotation || 0) * Math.PI) / 180);
      ctx.translate(-object.x, -object.y);
      ctx.strokeStyle = object.color || DEFAULT_COLOR;
      ctx.fillStyle = object.color || DEFAULT_COLOR;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (object.symbol === 'ipn' || object.symbol === 'beam') {
        ctx.strokeRect(x, y + height * 0.18, width, height * 0.64);
        ctx.beginPath();
        ctx.moveTo(x + width * 0.18, y + height * 0.18);
        ctx.lineTo(x + width * 0.18, y + height * 0.82);
        ctx.moveTo(x + width * 0.82, y + height * 0.18);
        ctx.lineTo(x + width * 0.82, y + height * 0.82);
        ctx.stroke();
      } else if (object.symbol === 'door') {
        ctx.beginPath();
        ctx.moveTo(x + 12, y + height - 8);
        ctx.lineTo(x + 12, y + 8);
        ctx.lineTo(x + width - 14, y + 8);
        ctx.arc(x + 12, y + height - 8, width - 26, -Math.PI / 2, 0);
        ctx.stroke();
      } else if (object.symbol === 'window') {
        ctx.strokeRect(x + 8, y + 12, width - 16, height - 24);
        ctx.beginPath();
        ctx.moveTo(object.x, y + 12);
        ctx.lineTo(object.x, y + height - 12);
        ctx.moveTo(x + 8, object.y);
        ctx.lineTo(x + width - 8, object.y);
        ctx.stroke();
      } else if (object.symbol === 'radiator') {
        for (let i = 0; i < 5; i += 1) {
          const rx = x + 14 + i * ((width - 28) / 4);
          ctx.strokeRect(rx - 5, y + 12, 10, height - 24);
        }
      } else if (object.symbol === 'up') {
        ctx.beginPath();
        ctx.moveTo(x + 12, y + height - 12);
        ctx.lineTo(x + width - 12, y + 12);
        ctx.lineTo(x + width - 40, y + 12);
        ctx.moveTo(x + width - 12, y + 12);
        ctx.lineTo(x + width - 12, y + 40);
        ctx.stroke();
      } else if (object.symbol === 'fixing') {
        ctx.beginPath();
        ctx.arc(object.x, object.y, Math.min(width, height) / 3, 0, Math.PI * 2);
        ctx.moveTo(object.x - width / 2.8, object.y);
        ctx.lineTo(object.x + width / 2.8, object.y);
        ctx.moveTo(object.x, object.y - height / 2.8);
        ctx.lineTo(object.x, object.y + height / 2.8);
        ctx.stroke();
      } else {
        ctx.strokeRect(x + 8, y + 8, width - 16, height - 16);
        ctx.beginPath();
        ctx.moveTo(x + 18, y + height - 18);
        ctx.lineTo(x + width - 18, y + 18);
        ctx.stroke();
      }

      const label = object.label || SYMBOLS.find(([key]) => key === object.symbol)?.[1] || 'Symbole';
      ctx.font = '700 18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(label, object.x, y + height + 8);
      ctx.restore();
    }

    function drawText(object) {
      ctx.save();
      ctx.translate(object.x, object.y);
      ctx.rotate(((object.rotation || 0) * Math.PI) / 180);
      ctx.fillStyle = object.color || DEFAULT_COLOR;
      ctx.font = `700 ${object.fontSize || 22}px system-ui, sans-serif`;
      ctx.textAlign = object.align || 'left';
      ctx.textBaseline = 'middle';
      String(object.value || '').split('\n').forEach((line, index) => {
        ctx.fillText(line, 0, index * ((object.fontSize || 22) + 6));
      });
      ctx.restore();
    }

    function drawSelection(object) {
      const bounds = objectBounds(object);
      ctx.save();
      ctx.strokeStyle = '#ef6e3b';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(bounds.x1, bounds.y1, bounds.x2 - bounds.x1, bounds.y2 - bounds.y1);
      ctx.restore();
    }

    function render() {
      drawGrid();
      const sketch = activeSketch();
      sketch.strokes.forEach(drawStroke);
      sketch.objects.forEach((object) => {
        if (object.type === 'text') drawText(object);
        if (object.type === 'symbol') drawSymbol(object);
        if (object.id === selectedId) drawSelection(object);
      });
    }

    function addText(point, existing) {
      const initial = existing ? existing.value : '';
      const value = window.prompt('Texte à placer sur le croquis', initial);
      if (value === null) return;
      const object = existing || {
        id: uid('text'),
        type: 'text',
        x: point.x,
        y: point.y,
      };
      object.value = value.trim();
      if (!object.value) return;
      object.fontSize = Number(fontSizeSelect.value) || object.fontSize || 22;
      object.rotation = Number(rotationSelect.value) || object.rotation || 0;
      object.color = colorInput.value || object.color || DEFAULT_COLOR;
      object.width = Math.max(90, object.value.length * (object.fontSize || 22) * 0.55);
      object.height = (object.fontSize || 22) + 18;
      if (!existing) activeSketch().objects.push(object);
      selectedId = object.id;
      markChanged();
    }

    function addSymbol() {
      const key = symbolSelect.value || 'ipn';
      const label = SYMBOLS.find(([symbolKey]) => symbolKey === key)?.[1] || 'Symbole';
      const object = {
        id: uid('symbol'),
        type: 'symbol',
        symbol: key,
        x: LOGICAL_WIDTH / 2,
        y: LOGICAL_HEIGHT / 2,
        width: 120,
        height: 72,
        rotation: Number(rotationSelect.value) || 0,
        color: colorInput.value || DEFAULT_COLOR,
        label,
      };
      activeSketch().objects.push(object);
      selectedId = object.id;
      selectTool('select');
      markChanged();
    }

    function selectedObject() {
      return activeSketch().objects.find((object) => object.id === selectedId) || null;
    }

    canvas.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      const point = pointFromEvent(event);

      if (activeTool === 'pen') {
        drawingStroke = {
          id: uid('stroke'),
          color: colorInput.value || DEFAULT_COLOR,
          width: 4,
          points: [point],
        };
        activeSketch().strokes.push(drawingStroke);
        return;
      }

      if (activeTool === 'text') {
        addText(point);
        return;
      }

      const hit = hitObject(point);
      if (hit) {
        selectedId = hit.id;
        draggingObject = { id: hit.id, offsetX: point.x - hit.x, offsetY: point.y - hit.y };
        render();
      } else {
        selectedId = null;
        render();
      }
    });

    canvas.addEventListener('pointermove', (event) => {
      const point = pointFromEvent(event);
      if (drawingStroke) {
        event.preventDefault();
        drawingStroke.points.push(point);
        render();
      } else if (draggingObject) {
        event.preventDefault();
        const object = selectedObject();
        if (!object) return;
        object.x = point.x - draggingObject.offsetX;
        object.y = point.y - draggingObject.offsetY;
        render();
      }
    });

    function stopPointer(event) {
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {}
      if (drawingStroke) {
        drawingStroke = null;
        markChanged();
      }
      if (draggingObject) {
        draggingObject = null;
        markChanged();
      }
    }

    canvas.addEventListener('pointerup', stopPointer);
    canvas.addEventListener('pointercancel', stopPointer);

    root.querySelectorAll('[data-tool]').forEach((button) => {
      button.addEventListener('click', () => selectTool(button.dataset.tool));
    });

    root.querySelector('[data-sketch-add]').addEventListener('click', () => {
      sketches.push(normalizeSketch({ title: `Croquis ${sketches.length + 1}` }, sketches.length));
      activeIndex = sketches.length - 1;
      selectedId = null;
      markChanged();
    });

    root.querySelector('[data-sketch-rename]').addEventListener('click', () => {
      const sketch = activeSketch();
      const title = window.prompt('Nom du croquis', sketch.title);
      if (!title) return;
      sketch.title = title.trim();
      markChanged();
    });

    root.querySelector('[data-sketch-delete]').addEventListener('click', () => {
      if (sketches.length <= 1) {
        setStatus('Gardez au moins un croquis dans la fiche.');
        return;
      }
      if (!window.confirm('Supprimer ce croquis ?')) return;
      sketches.splice(activeIndex, 1);
      activeIndex = Math.max(0, activeIndex - 1);
      selectedId = null;
      markChanged();
    });

    root.querySelector('[data-clear-sketch]').addEventListener('click', () => {
      if (!window.confirm('Effacer le contenu de ce croquis ?')) return;
      activeSketch().strokes = [];
      activeSketch().objects = [];
      selectedId = null;
      markChanged();
    });

    root.querySelector('[data-add-symbol]').addEventListener('click', addSymbol);

    root.querySelector('[data-edit-object]').addEventListener('click', () => {
      const object = selectedObject();
      if (!object) {
        setStatus('Sélectionnez un texte ou un symbole.');
        return;
      }
      if (object.type === 'text') {
        addText({ x: object.x, y: object.y }, object);
        return;
      }
      const label = window.prompt('Libellé du symbole', object.label || '');
      if (label === null) return;
      object.label = label.trim();
      object.color = colorInput.value || object.color || DEFAULT_COLOR;
      object.rotation = Number(rotationSelect.value) || object.rotation || 0;
      markChanged();
    });

    root.querySelector('[data-delete-object]').addEventListener('click', () => {
      if (!selectedId) return;
      activeSketch().objects = activeSketch().objects.filter((object) => object.id !== selectedId);
      selectedId = null;
      markChanged();
    });

    [colorInput, fontSizeSelect, rotationSelect].forEach((control) => {
      control.addEventListener('change', () => {
        const object = selectedObject();
        if (!object) return;
        object.color = colorInput.value || object.color || DEFAULT_COLOR;
        object.fontSize = Number(fontSizeSelect.value) || object.fontSize;
        object.rotation = Number(rotationSelect.value) || object.rotation || 0;
        if (object.type === 'text') {
          object.width = Math.max(90, String(object.value || '').length * (object.fontSize || 22) * 0.55);
          object.height = (object.fontSize || 22) + 18;
        }
        markChanged();
      });
    });

    root.technicalSketchSerialize = function () {
      return sketches.map((sketch) => ({
        id: sketch.id,
        title: sketch.title,
        strokes: sketch.strokes,
        objects: sketch.objects,
        updatedAt: sketch.updatedAt,
      }));
    };

    root.technicalSketchLoad = function (data) {
      const nextSketches = Array.isArray(data) ? data : [];
      sketches = nextSketches.length ? nextSketches.map(normalizeSketch) : [normalizeSketch({ title: 'Croquis 1' }, 0)];
      activeIndex = 0;
      selectedId = null;
      renderList();
      render();
      setStatus('');
    };

    root.technicalSketchSetLegacyUrl = function (url) {
      legacyUrl = url || '';
      legacyBlock.classList.remove('is-visible');
      if (!legacyUrl) return;
      legacyImage.onload = () => legacyBlock.classList.add('is-visible');
      legacyImage.onerror = () => legacyBlock.classList.remove('is-visible');
      legacyImage.src = `${legacyUrl}${legacyUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
    };

    selectTool('pen');
    renderList();
    render();

    return root;
  }

  window.initTechnicalSketchEditor = initTechnicalSketchEditor;
})();
