(function () {
  function setStatus(root, message) {
    const status = root && root.querySelector('[data-sketch-status]');
    if (status) status.textContent = message || '';
  }

  function initSketchPad(options) {
    const root = options && options.root;
    if (!root) return;

    const canvas = root.querySelector('.sketchpad-canvas');
    const clearBtn = root.querySelector('[data-sketch-clear]');
    const saveBtn = root.querySelector('[data-sketch-save]');
    if (!canvas || !clearBtn || !saveBtn) return;

    const ctx = canvas.getContext('2d');
    let drawing = false;
    let currentImage = null;

    function paintWhite() {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }

    function resizeCanvas() {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const width = Math.max(320, Math.round(rect.width * ratio));
      const height = Math.max(220, Math.round(rect.height * ratio));
      const previous = canvas.toDataURL('image/png');

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        paintWhite();
        const image = new Image();
        image.onload = function () {
          ctx.drawImage(image, 0, 0, rect.width, rect.height);
        };
        image.src = previous;
      } else {
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      }

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 2.4;
    }

    function canvasPoint(event) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
    }

    function startDrawing(event) {
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      drawing = true;
      const point = canvasPoint(event);
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      document.body.classList.add('sketchpad-drawing');
    }

    function draw(event) {
      if (!drawing) return;
      event.preventDefault();
      const point = canvasPoint(event);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }

    function stopDrawing(event) {
      if (!drawing) return;
      drawing = false;
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {}
      document.body.classList.remove('sketchpad-drawing');
    }

    function clearCanvas() {
      paintWhite();
      setStatus(root, 'Croquis effacé. Pensez à enregistrer.');
    }

    function loadExistingSketch() {
      const imageUrl = options.getImageUrl ? options.getImageUrl(root) : root.dataset.sketchImageUrl;
      if (!imageUrl) {
        paintWhite();
        return;
      }

      const image = new Image();
      image.onload = function () {
        currentImage = image;
        paintWhite();
        const rect = canvas.getBoundingClientRect();
        ctx.drawImage(currentImage, 0, 0, rect.width, rect.height);
      };
      image.onerror = function () {
        paintWhite();
      };
      image.src = imageUrl + (imageUrl.includes('?') ? '&' : '?') + 't=' + Date.now();
    }

    async function saveSketch() {
      try {
        if (options.beforeSave) await options.beforeSave(root);
        const saveUrl = options.getSaveUrl ? options.getSaveUrl(root) : root.dataset.sketchSaveUrl;
        if (!saveUrl) throw new Error('URL de sauvegarde absente');

        setStatus(root, 'Enregistrement...');
        const response = await fetch(saveUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: canvas.toDataURL('image/png') })
        });
        if (!response.ok) throw new Error('Erreur serveur');
        setStatus(root, 'Croquis enregistré.');
      } catch (error) {
        setStatus(root, 'Impossible d’enregistrer le croquis.');
      }
    }

    resizeCanvas();
    loadExistingSketch();

    canvas.addEventListener('pointerdown', startDrawing);
    canvas.addEventListener('pointermove', draw);
    canvas.addEventListener('pointerup', stopDrawing);
    canvas.addEventListener('pointercancel', stopDrawing);
    clearBtn.addEventListener('click', clearCanvas);
    saveBtn.addEventListener('click', saveSketch);
    window.addEventListener('resize', resizeCanvas);

    root.sketchpadLoad = loadExistingSketch;
    root.sketchpadClear = clearCanvas;
  }

  window.initSketchPad = initSketchPad;
})();
