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
  const sketchCloseBtn = document.getElementById('sketchCloseBtn');
  const sketchSaveBtn = document.getElementById('sketchSaveBtn');
  const sketchStatus = document.getElementById('sketchStatus');
  const sketchCanvas = document.getElementById('sketchCanvas');
  const toolPenBtn = document.getElementById('toolPenBtn');
  const toolEraserBtn = document.getElementById('toolEraserBtn');
  const undoSketchBtn = document.getElementById('undoSketchBtn');
  const redoSketchBtn = document.getElementById('redoSketchBtn');
  const clearSketchBtn = document.getElementById('clearSketchBtn');
  const sketchColorPalette = document.getElementById('sketchColorPalette');
  const sketchSizePalette = document.getElementById('sketchSizePalette');
  const useSketchPhotoBtn = document.getElementById('useSketchPhotoBtn');
  const removeSketchPhotoBtn = document.getElementById('removeSketchPhotoBtn');
  const sketchBgLabel = document.getElementById('sketchBgLabel');
  const sketchPhotoPicker = document.getElementById('sketchPhotoPicker');
  const sketchPhotoPickerBackdrop = document.getElementById('sketchPhotoPickerBackdrop');
  const sketchPhotoPickerList = document.getElementById('sketchPhotoPickerList');
  const closeSketchPhotoPickerBtn = document.getElementById('closeSketchPhotoPickerBtn');

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

  function sketchRenderComposite() {
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
    const state = sketchCaptureState();
    sketchHistory = state ? [state] : [];
    sketchHistoryIndex = sketchHistory.length ? 0 : -1;
  }

  function sketchPushHistory() {
    if (!sketchCanvas || sketchLoadingState) return;
    const state = sketchCaptureState();
    if (!state) return;
    if (sketchHistoryIndex >= 0 && sketchHistory[sketchHistoryIndex] === state) return;

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
    sketchLoadingState = true;
    await sketchLoadDataUrl(sketchHistory[sketchHistoryIndex]);
    sketchLoadingState = false;
    setSketchStatus('Annulation');
  }

  async function sketchRedo() {
    if (sketchHistoryIndex < 0 || sketchHistoryIndex >= sketchHistory.length - 1) return;
    sketchHistoryIndex += 1;
    sketchLoadingState = true;
    await sketchLoadDataUrl(sketchHistory[sketchHistoryIndex]);
    sketchLoadingState = false;
    setSketchStatus('Refaire');
  }

  function sketchCanvasPoint(event) {
    const rect = sketchCanvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function sketchStartDrawing(event) {
    if (!sketchInkCtx || !sketchCanvas) return;
    event.preventDefault();
    sketchDrawing = true;
    sketchApplyBrush();
    const point = sketchCanvasPoint(event);
    sketchInkCtx.beginPath();
    sketchInkCtx.moveTo(point.x, point.y);
    try {
      sketchCanvas.setPointerCapture(event.pointerId);
    } catch {}
  }

  function sketchDraw(event) {
    if (!sketchDrawing || !sketchInkCtx) return;
    event.preventDefault();
    const point = sketchCanvasPoint(event);
    sketchInkCtx.lineTo(point.x, point.y);
    sketchInkCtx.stroke();
    sketchRenderComposite();
  }

  function sketchStopDrawing(event) {
    if (!sketchDrawing || !sketchCanvas) return;
    sketchDrawing = false;
    try {
      sketchCanvas.releasePointerCapture(event.pointerId);
    } catch {}
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
    document.body.classList.remove('sketch-open');
  }

  function setSketchTool(nextTool) {
    sketchTool = nextTool === 'eraser' ? 'eraser' : 'pen';
    if (toolPenBtn) toolPenBtn.classList.toggle('is-active', sketchTool === 'pen');
    if (toolEraserBtn) toolEraserBtn.classList.toggle('is-active', sketchTool === 'eraser');
    sketchApplyBrush();
  }

  function setSketchColor(nextColor) {
    if (!nextColor) return;
    sketchColor = nextColor;
    setSketchTool('pen');
    if (sketchColorPalette) {
      sketchColorPalette.querySelectorAll('[data-sketch-color]').forEach((button) => {
        button.classList.toggle('is-active', String(button.getAttribute('data-sketch-color')) === sketchColor);
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
        button.classList.toggle('is-active', Number(button.getAttribute('data-sketch-size')) === sketchSize);
      });
    }
    sketchApplyBrush();
  }

  async function clearSketchWithConfirm() {
    if (!window.confirm('Effacer uniquement les annotations ?')) return;
    sketchClearInk();
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
      sketchRenderComposite();
      const response = await fetch(`/api/measurements/${recordId}/sketch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: sketchCanvas.toDataURL('image/png') }),
      });
      if (!response.ok) throw new Error('save-sketch-failed');

      sketchUpdatedAt = new Date().toISOString();
      dirty = true;
      await saveRecord();
      setSketchStatus('Enregistre');
    } catch {
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
    sketchUpdatedAt = String(item.fields?.sketch_updated_at || '').trim();
    sketchBackgroundPhotoId = String(item.fields?.sketch_background_photo_id || '').trim();
    sketchBackgroundUrl = '';
    sketchBackgroundImage = null;
    setSketchBackgroundUi();
    setSketchStatus(sketchUpdatedAt ? 'Croquis existant' : 'Pret');
    photoSlots = normalizePhotoSlots(item.photoSlots || item.fields?.photo_slots || []);
    renderPhotoSlots();

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
    setSketchBackgroundUi();
    setSketchStatus('Pret');
    photoSlots = makeEmptyPhotoSlots();
    renderPhotoSlots();
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

  if (closeSketchPhotoPickerBtn) {
    closeSketchPhotoPickerBtn.addEventListener('click', closeSketchPhotoPicker);
  }

  if (sketchPhotoPickerBackdrop) {
    sketchPhotoPickerBackdrop.addEventListener('click', closeSketchPhotoPicker);
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
      if (sketchPhotoPicker && !sketchPhotoPicker.hidden) {
        closeSketchPhotoPicker();
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
  initBootstrap();
})();
