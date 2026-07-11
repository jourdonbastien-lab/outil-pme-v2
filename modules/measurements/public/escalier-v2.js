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

  const params = new URLSearchParams(window.location.search);
  const initialOrderId = normalizeId(params.get('client_order_id'));
  const initialDraftId = normalizeId(params.get('id'));

  let currentId = null;
  let dirty = false;
  let linkOptionsLoaded = false;
  let orderLock = initialOrderId;
  let photoSlots = makeEmptyPhotoSlots();

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

  if (photoViewer) {
    photoViewer.addEventListener('click', (event) => {
      if (event.target === photoViewer) closeViewer();
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && photoViewer && !photoViewer.hidden) closeViewer();
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
  photoSlots = makeEmptyPhotoSlots();
  renderPhotoSlots();
  initBootstrap();
})();
