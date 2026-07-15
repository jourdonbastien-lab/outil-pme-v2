function createModuleSheet() {
  const form = document.getElementById('measurementForm');
  if (!form) return;

  const storageKey = form.dataset.storageKey || 'outil-pme.measurements.generic';
  const moduleLabel = form.dataset.moduleLabel || 'Module';

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
  let dirty = false;
  let photoViewer = null;

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
    img.src = photo.dataUrl;
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
    if (typeof sketchRoot.technicalSketchSetLegacyUrl === 'function') {
      sketchRoot.technicalSketchSetLegacyUrl(`/sketches/measurements/${currentServerId}.png`);
    }
  }

  function initHandwrittenSketch() {
    if (!window.initTechnicalSketchEditor || document.getElementById('measurementSketchpad')) return;

    const section = document.createElement('section');
    section.id = 'measurementSketchpad';
    section.className = 'block technical-sketch-card measurement-sketchpad-card';

    form.appendChild(section);
    sketchRoot = section;

    window.initTechnicalSketchEditor({
      root: sketchRoot,
      sheetType: moduleLabel,
      onChange: () => setDirty(true)
    });
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

    if (sketchRoot && typeof sketchRoot.technicalSketchSerialize === 'function') {
      fields.technical_sketches = sketchRoot.technicalSketchSerialize();
    }

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
    renderPhotos();
    updateSketchOwner();
    if (sketchRoot && typeof sketchRoot.technicalSketchLoad === 'function') {
      sketchRoot.technicalSketchLoad(fields.technical_sketches || []);
    }

    currentRecordName = record.recordName || '';
    saveStatus.textContent = record.updatedAt
      ? `Fiche chargée - dernière sauvegarde le ${new Date(record.updatedAt).toLocaleString('fr-FR')}`
      : 'Fiche chargée';
    setDirty(false);
    updateProgress();
    updateDeleteState();
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
      return currentServerId;
    } catch {
      saveStatus.textContent = `Enregistré localement - serveur indisponible`;
      setDirty(false);
      return currentServerId;
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
    currentRecordName = '';
    currentServerId = null;
    updateDeleteState();
    if (sketchRoot) {
      delete sketchRoot.dataset.sketchId;
      delete sketchRoot.dataset.sketchImageUrl;
      if (typeof sketchRoot.technicalSketchLoad === 'function') sketchRoot.technicalSketchLoad([]);
      if (typeof sketchRoot.technicalSketchSetLegacyUrl === 'function') sketchRoot.technicalSketchSetLegacyUrl('');
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
      node.querySelector('img').src = photo.dataUrl;
      node.querySelector('img').alt = photo.name || 'Photo chantier';
      node.querySelector('img').addEventListener('click', () => openPhotoViewer(photo));
      const captionInput = node.querySelector('.photo-caption');
      if (captionInput) {
        captionInput.value = photo.caption || '';
        captionInput.addEventListener('input', () => {
          photos[index].caption = captionInput.value;
          setDirty(true);
        });
      }
      node.querySelector('.photo-remove').addEventListener('click', () => {
        if (!window.confirm('Supprimer cette photo ?')) return;
        photos.splice(index, 1);
        renderPhotos();
        setDirty(true);
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

  if (photoInput) {
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
      setDirty(true);
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
    window.location.href = '/outils/prises-cotes';
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

  setDefaultValues();
  initServerLinks();
  initHandwrittenSketch();
  setupCollapsibleSections();
  updateProgress();
  updateDeleteState();
  saveStatus.textContent = getStoredRecords().length
    ? 'Des fiches locales sont disponibles'
    : 'Aucune sauvegarde chargée';
}

createModuleSheet();
