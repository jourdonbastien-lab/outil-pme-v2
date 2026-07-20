function createModuleSheet() {
  const form = document.getElementById('measurementForm');
  if (!form) return;

  const storageKey = form.dataset.storageKey || 'outil-pme.measurements.generic';
  const moduleLabel = form.dataset.moduleLabel || 'Module';
  const pageParams = new URLSearchParams(window.location.search);
  const initialServerId = Number(pageParams.get('id')) || null;
  const initialQuoteId = Number(pageParams.get('quote_id')) || null;
  const fromQuoteId = Number(pageParams.get('from_quote')) || null;
  const returnUrl = fromQuoteId ? `/devis/${fromQuoteId}#quote-section-measurements` : '/outils/prises-cotes';

  const photoInput = document.getElementById('photoInput');
  const photoGallery = document.getElementById('photoGallery');
  const saveBtn = document.getElementById('saveBtn');
  const loadBtn = document.getElementById('loadBtn');
  const resetBtn = document.getElementById('resetBtn');
  const printBtn = document.getElementById('printBtn');
  const saveStatus = document.getElementById('saveStatus');
  const recordNameField = document.getElementById('recordName');
  const photoTemplate = document.getElementById('photoItemTemplate');
  const closeBtn = document.getElementById('closeBtn');
  const deleteBtn = document.getElementById('deleteSheetBtn');
  const progressText = document.getElementById('sheetProgressText');

  let photos = [];
  let currentRecordName = '';
  let currentServerId = null;
  let sketchRoot = null;
  let technicalSketches = [];
  let dirty = false;
  let photoViewer = null;

  const backLink = document.querySelector('.back-link');
  if (backLink) {
    backLink.href = returnUrl;
    backLink.textContent = fromQuoteId ? `← Retour au devis #${fromQuoteId}` : '← Retour modules';
  }

  function ensurePhotoViewer() {
    if (photoViewer) return photoViewer;
    photoViewer = document.createElement('div');
    photoViewer.className = 'measurement-photo-viewer';
    photoViewer.hidden = true;
    photoViewer.setAttribute('aria-hidden', 'true');
    photoViewer.innerHTML = [
      '<button type="button" class="measurement-photo-viewer-close" aria-label="Fermer">Fermer</button>',
      '<img alt="Photo chantier en plein écran" />',
      '<p></p>',
    ].join('');
    document.body.appendChild(photoViewer);
    photoViewer.addEventListener('click', (event) => {
      if (event.target === photoViewer || event.target.classList.contains('measurement-photo-viewer-close')) {
        closePhotoViewer();
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && photoViewer && !photoViewer.hidden) closePhotoViewer();
    });
    return photoViewer;
  }

  function openPhotoViewer(photo) {
    const viewer = ensurePhotoViewer();
    const img = viewer.querySelector('img');
    const caption = viewer.querySelector('p');
    img.src = photo.url || photo.dataUrl;
    img.alt = photo.caption || photo.name || 'Photo chantier';
    caption.textContent = photo.caption || photo.name || '';
    viewer.hidden = false;
    viewer.setAttribute('aria-hidden', 'false');
  }

  function closePhotoViewer() {
    if (!photoViewer) return;
    photoViewer.hidden = true;
    photoViewer.setAttribute('aria-hidden', 'true');
  }

  function setDirty(nextDirty = true) {
    dirty = Boolean(nextDirty);
    if (!saveStatus) return;
    if (dirty) saveStatus.textContent = 'Modifications non enregistrées';
  }

  function updateDeleteState() {
    if (!deleteBtn) return;
    deleteBtn.disabled = !currentServerId;
    deleteBtn.title = currentServerId
      ? 'Supprimer définitivement cette fiche'
      : 'Enregistrez la fiche avant de pouvoir la supprimer';
  }

  function updateProgress() {
    if (!progressText) return;
    const required = Array.from(form.querySelectorAll('[data-required-field]'));
    const completed = required.filter((field) => {
      if (field.type === 'checkbox' || field.type === 'radio') {
        return Boolean(form.querySelector(`[name="${field.name}"]:checked`));
      }
      return String(field.value || '').trim() !== '';
    });
    progressText.textContent = `${completed.length} champs obligatoires sur ${required.length} renseignés`;
  }

  function setupCollapsibleSections() {
    form.querySelectorAll('.block').forEach((section, index) => {
      if (section.classList.contains('sheet-header') || section.dataset.collapsibleReady === 'true') return;
      const title = Array.from(section.children).find((child) => child.classList && child.classList.contains('block-title'));
      if (!title) return;

      const panelId = `${form.id || 'measurementForm'}-section-${index}`;
      const panel = document.createElement('div');
      panel.className = 'block-panel';
      panel.id = panelId;
      while (title.nextSibling) panel.appendChild(title.nextSibling);
      section.appendChild(panel);

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'block-toggle';
      button.setAttribute('aria-expanded', index < 2 ? 'true' : 'false');
      button.setAttribute('aria-controls', panelId);
      button.innerHTML = `${title.innerHTML}<span class="block-chevron" aria-hidden="true">⌄</span>`;

      title.replaceWith(button);
      section.dataset.collapsibleReady = 'true';

      const setOpen = (open) => {
        panel.hidden = !open;
        button.setAttribute('aria-expanded', open ? 'true' : 'false');
        section.classList.toggle('is-open', open);
      };

      setOpen(index < 2);
      button.addEventListener('click', () => {
        setOpen(button.getAttribute('aria-expanded') !== 'true');
      });
    });
  }

  function setDefaultValues() {
    const dateField = form.elements.date;
    if (dateField && !dateField.value) {
      dateField.value = new Date().toISOString().slice(0, 10);
    }
  }

  function getStoredRecords() {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || '[]');
    } catch {
      return [];
    }
  }

  function saveStoredRecords(records) {
    localStorage.setItem(storageKey, JSON.stringify(records));
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

  function updateSketchOwner() {
    if (!sketchRoot || !currentServerId) return;
    sketchRoot.dataset.sketchId = String(currentServerId);
    sketchRoot.dataset.sketchImageUrl = `/sketches/measurements/${currentServerId}.png`;
  }

  function renderTechnicalSketches() {
    if (!sketchRoot) return;
    const list = sketchRoot.querySelector('[data-technical-sketch-list]');
    const legacy = sketchRoot.querySelector('[data-legacy-sketch]');
    if (legacy) {
      legacy.hidden = !currentServerId;
      if (currentServerId) {
        const img = legacy.querySelector('img');
        if (img) {
          legacy.hidden = false;
          img.onload = () => { legacy.hidden = false; };
          img.onerror = () => { legacy.hidden = true; };
          img.src = `/sketches/measurements/${currentServerId}.png?t=${Date.now()}`;
        }
      }
    }
    if (!list) return;
    if (!technicalSketches.length) {
      list.innerHTML = '<p class="technical-sketch-empty">Aucun croquis technique pour cette fiche.</p>';
      return;
    }
    list.innerHTML = technicalSketches.map((sketch, index) => {
      const title = String(sketch.title || `Croquis ${index + 1}`);
      const updated = sketch.updatedAt ? new Date(sketch.updatedAt).toLocaleString('fr-FR') : 'Non enregistré';
      return `
        <article class="technical-sketch-row">
          <div>
            <strong>${title.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]))}</strong>
            <span>Mis à jour : ${updated}</span>
          </div>
          <button type="button" data-open-technical-sketch="${sketch.id}">Ouvrir</button>
        </article>
      `;
    }).join('');
    list.querySelectorAll('[data-open-technical-sketch]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!currentServerId) await saveRecord();
        const sketchId = String(button.getAttribute('data-open-technical-sketch') || '').trim();
        if (currentServerId && sketchId) {
          window.location.href = `/outils/prises-cotes/${currentServerId}/croquis/${encodeURIComponent(sketchId)}`;
        }
      });
    });
  }

  async function refreshTechnicalSketchesFromServer() {
    if (!currentServerId) {
      renderTechnicalSketches();
      return;
    }
    try {
      const response = await fetch(`/api/measurements/${currentServerId}/croquis`);
      if (!response.ok) return;
      const data = await response.json();
      technicalSketches = Array.isArray(data.sketches) ? data.sketches : technicalSketches;
      renderTechnicalSketches();
    } catch {}
  }

  function initHandwrittenSketch() {
    if (document.getElementById('measurementSketchpad')) return;

    const section = document.createElement('section');
    section.id = 'measurementSketchpad';
    section.className = 'block measurement-sketchpad-card technical-sketch-card';
    section.innerHTML = [
      '<div class="block-title">',
      '<h3>Croquis techniques</h3>',
      '<p>Créez plusieurs croquis avancés avec texte, symboles, cotations et photo de fond.</p>',
      '</div>',
      '<div class="technical-sketch-actions">',
      '<button type="button" class="primary" data-new-technical-sketch>Nouveau croquis</button>',
      '<span class="technical-sketch-hint">La fiche est enregistrée avant ouverture du croquis.</span>',
      '</div>',
      '<div data-technical-sketch-list class="technical-sketch-list"></div>',
      '<figure data-legacy-sketch class="legacy-sketch-preview" hidden>',
      '<figcaption>Ancien croquis PNG conservé</figcaption>',
      '<img alt="Ancien croquis enregistré" />',
      '</figure>'
    ].join('');

    form.appendChild(section);
    sketchRoot = section;
    section.querySelector('[data-new-technical-sketch]').addEventListener('click', async () => {
      const id = await saveRecord();
      if (!id) {
        saveStatus.textContent = 'Impossible d’enregistrer la fiche avant le croquis';
        return;
      }
      const response = await fetch(`/api/measurements/${id}/croquis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `Croquis ${technicalSketches.length + 1}` }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok || !data.url) {
        saveStatus.textContent = data.error || 'Impossible de créer le croquis';
        return;
      }
      window.location.href = data.url;
    });
    renderTechnicalSketches();
  }

  function getCheckboxGroupNames() {
    return Array.from(new Set(Array.from(form.querySelectorAll('input[type="checkbox"][name]')).map((input) => input.name)));
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

    const checkboxGroups = {};
    getCheckboxGroupNames().forEach((name) => {
      checkboxGroups[name] = getCheckboxValues(name);
    });

    return {
      server_id: currentServerId,
      module: moduleLabel,
      recordName: recordNameField.value.trim(),
      fields,
      checkboxGroups,
      quote_id: fields.quote_id || '',
      client_order_id: fields.quote_id ? '' : (fields.client_order_id || ''),
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

    const checkboxGroups = record.checkboxGroups || {};
    Object.keys(checkboxGroups).forEach((name) => {
      setCheckboxValues(name, checkboxGroups[name]);
    });

    photos = Array.isArray(record.photos) ? record.photos.slice() : [];
    technicalSketches = Array.isArray(fields.technical_drawing_sketches) ? fields.technical_drawing_sketches.slice() : [];
    renderPhotos();
    updateSketchOwner();
    renderTechnicalSketches();
    refreshTechnicalSketchesFromServer();

    currentRecordName = record.recordName || '';
    saveStatus.textContent = record.updatedAt
      ? `Fiche chargée - dernière sauvegarde le ${new Date(record.updatedAt).toLocaleString('fr-FR')}`
      : 'Fiche chargée';
    setDirty(false);
    updateProgress();
    updateDeleteState();
  }

  async function loadServerRecord(id) {
    const localRecord = getStoredRecords().find((record) => String(record.server_id || record.id || '') === String(id));
    const response = await fetch(`/api/measurements/${id}`);
    if (!response.ok) throw new Error('Fiche serveur introuvable');
    const data = await response.json();
    applyFormData(data.measurement || {});
    const legacyPhotos = Array.isArray(localRecord?.photos)
      ? localRecord.photos.filter((photo) => photo && photo.dataUrl)
      : [];
    if (legacyPhotos.length) photos = legacyPhotos;
    await loadServerPhotos();
  }

  async function loadServerPhotos() {
    if (!currentServerId) return;
    const response = await fetch(`/api/measurements/${currentServerId}/photos`);
    if (!response.ok) return;
    const data = await response.json();
    const legacyPhotos = photos.filter((photo) => photo && photo.dataUrl && !photo.url);
    const serverPhotos = Array.isArray(data.photos) ? data.photos : [];
    photos = legacyPhotos.concat(serverPhotos);
    renderPhotos();
  }

  async function uploadServerPhotos(files) {
    if (!files.length) return;
    if (!currentServerId) await saveRecord();
    if (!currentServerId) throw new Error('Enregistrez la fiche avant les photos');
    const body = new FormData();
    files.forEach((file) => body.append('photos', file, file.name));
    const response = await fetch(`/api/measurements/${currentServerId}/photos`, { method: 'POST', body });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || 'Upload photo impossible');
    const legacyPhotos = photos.filter((photo) => photo && photo.dataUrl && !photo.url);
    photos = legacyPhotos.concat(Array.isArray(data.photos) ? data.photos : []);
    renderPhotos();
  }

  async function prefillFromQuote(quoteId) {
    const response = await fetch(`/api/measurements/context?quote_id=${encodeURIComponent(quoteId)}`);
    if (!response.ok) return;
    const data = await response.json();
    const quote = data.quote || {};
    if (form.elements.client && !form.elements.client.value) form.elements.client.value = quote.client || '';
    if (form.elements.chantier && !form.elements.chantier.value) form.elements.chantier.value = quote.chantier || '';
    if (form.elements.quote_id) form.elements.quote_id.value = String(quote.id || quoteId);
  }

  async function addPhotoRecoveryAccess() {
    if (moduleLabel !== 'Portail' || initialServerId !== 9) return;
    try {
      const response = await fetch('/api/measurements/photo-recovery-access?id=9', {
        method: 'GET',
        credentials: 'same-origin'
      });
      if (!response.ok) return;
      const access = await response.json();
      if (!access.allowed || document.getElementById('photoRecoveryLink')) return;
      const link = document.createElement('a');
      link.id = 'photoRecoveryLink';
      link.className = 'btn btn-primary';
      link.href = '/outils/prises-cotes/recuperation-photos';
      link.textContent = 'Récupérer les anciennes photos';
      const host = document.querySelector('.hero-actions') || form.querySelector('.sheet-actions') || form.querySelector('.sheet-header') || form;
      host.appendChild(link);
    } catch {}
  }

  async function saveRecord() {
    const payload = collectFormData();
    const recordName = payload.recordName || `Fiche ${moduleLabel.toLowerCase()} ${new Date().toLocaleDateString('fr-FR')}`;
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
    saveStatus.textContent = 'Enregistrement…';

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
      updateSketchOwner();
      payload.server_id = currentServerId;
      const refreshed = getStoredRecords();
      const refreshedIndex = refreshed.findIndex((entry) => entry.recordName === recordName);
      if (refreshedIndex >= 0) refreshed[refreshedIndex] = payload;
      saveStoredRecords(refreshed);
      saveStatus.textContent = `Enregistré - ${new Date(payload.updatedAt).toLocaleString('fr-FR')}`;
      setDirty(false);
      updateDeleteState();
      refreshTechnicalSketchesFromServer();
      return currentServerId;
    } catch {
      saveStatus.textContent = `Enregistré localement - serveur indisponible`;
      setDirty(false);
      return currentServerId;
    }
  }

  async function loadRecord() {
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
    if (currentServerId) await loadServerPhotos();
  }

  function resetForm() {
    form.reset();
    photos = [];
    renderPhotos();
    currentRecordName = '';
    currentServerId = null;
    updateDeleteState();
    if (sketchRoot) {
      delete sketchRoot.dataset.sketchId;
      delete sketchRoot.dataset.sketchImageUrl;
      technicalSketches = [];
      renderTechnicalSketches();
    }
    saveStatus.textContent = 'Nouvelle fiche prête';
    setDefaultValues();
    setDirty(false);
    updateProgress();
  }

  function renderPhotos() {
    if (!photoGallery || !photoTemplate) return;
    photoGallery.innerHTML = '';

    photos.forEach((photo, index) => {
      const node = photoTemplate.content.firstElementChild.cloneNode(true);
      node.querySelector('img').src = photo.url || photo.dataUrl;
      node.querySelector('img').alt = photo.name || 'Photo chantier';
      node.querySelector('img').addEventListener('click', () => openPhotoViewer(photo));
      const captionInput = node.querySelector('.photo-caption');
      if (captionInput) {
        captionInput.value = photo.caption || '';
        captionInput.addEventListener('change', async () => {
          photos[index].caption = captionInput.value;
          if (photo.id && photo.url && currentServerId) {
            const response = await fetch(`/api/measurements/${currentServerId}/photos/${encodeURIComponent(photo.id)}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ caption: captionInput.value })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.ok) saveStatus.textContent = data.error || 'Erreur légende photo';
          } else {
            setDirty(true);
          }
        });
      }
      node.querySelector('.photo-remove').addEventListener('click', () => {
        if (!window.confirm('Supprimer cette photo ?')) return;
        if (photo.id && photo.url && currentServerId) {
          fetch(`/api/measurements/${currentServerId}/photos/${encodeURIComponent(photo.id)}`, { method: 'DELETE' })
            .then((response) => response.json().then((data) => ({ response, data })))
            .then(({ response, data }) => {
              if (!response.ok || !data.ok) throw new Error(data.error || 'Suppression impossible');
              const legacyPhotos = photos.filter((item) => item && item.dataUrl && !item.url);
              photos = legacyPhotos.concat(Array.isArray(data.photos) ? data.photos : []);
              renderPhotos();
            })
            .catch((error) => { saveStatus.textContent = error.message || 'Suppression photo impossible'; });
        } else {
          photos.splice(index, 1);
          renderPhotos();
          setDirty(true);
        }
      });
      photoGallery.appendChild(node);
    });
  }

  if (photoInput) {
    photoInput.addEventListener('change', async (event) => {
      const files = Array.from(event.target.files || []);
      photoInput.value = '';
      try {
        saveStatus.textContent = 'Envoi des photos…';
        await uploadServerPhotos(files);
        saveStatus.textContent = 'Photos enregistrées sur le serveur';
      } catch (error) {
        saveStatus.textContent = error.message || 'Upload photo impossible';
      }
      updateProgress();
    });
  }

  async function deleteSheet() {
    if (!currentServerId) {
      saveStatus.textContent = 'Enregistrez la fiche avant suppression';
      updateDeleteState();
      return;
    }
    if (!window.confirm('Supprimer définitivement cette prise de cotes ? Cette action est irréversible.')) return;

    if (deleteBtn) deleteBtn.disabled = true;
    saveStatus.textContent = 'Suppression…';
    try {
      const response = await fetch(`/api/measurements/${currentServerId}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || 'delete-failed');

      const records = getStoredRecords().filter((entry) => {
        const entryId = entry.server_id || entry.id || null;
        return String(entryId) !== String(currentServerId) && entry.recordName !== currentRecordName;
      });
      saveStoredRecords(records);
      resetForm();
      saveStatus.textContent = 'Fiche supprimée';
    } catch (error) {
      updateDeleteState();
      saveStatus.textContent = error.message && error.message !== 'delete-failed' ? error.message : 'Erreur suppression fiche';
    }
  }

  function closeSheet() {
    if (dirty && !window.confirm('Fermer la fiche sans enregistrer les modifications ?')) return;
    window.location.href = returnUrl;
  }

  saveBtn.addEventListener('click', saveRecord);
  loadBtn.addEventListener('click', loadRecord);
  resetBtn.addEventListener('click', resetForm);
  printBtn.addEventListener('click', () => window.print());
  if (closeBtn) closeBtn.addEventListener('click', closeSheet);
  if (deleteBtn) deleteBtn.addEventListener('click', deleteSheet);
  form.addEventListener('input', () => {
    setDirty(true);
    updateProgress();
  });
  form.addEventListener('change', () => {
    setDirty(true);
    updateProgress();
  });
  window.addEventListener('beforeunload', (event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });

  async function initializeSheet() {
    setDefaultValues();
    await initServerLinks();
    initHandwrittenSketch();
    setupCollapsibleSections();
    updateProgress();
    updateDeleteState();
    saveStatus.textContent = getStoredRecords().length
      ? 'Des fiches locales sont disponibles'
      : 'Aucune sauvegarde chargée';
    try {
      if (initialServerId) await loadServerRecord(initialServerId);
      else if (initialQuoteId) await prefillFromQuote(initialQuoteId);
      await addPhotoRecoveryAccess();
    } catch (error) {
      saveStatus.textContent = error.message || 'Impossible de charger la fiche';
    }
  }

  initializeSheet();
}

createModuleSheet();
