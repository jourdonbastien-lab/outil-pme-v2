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

  let photos = [];
  let currentRecordName = '';
  let currentServerId = null;
  let sketchRoot = null;

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

  function initHandwrittenSketch() {
    if (!window.initSketchPad || document.getElementById('measurementSketchpad')) return;

    const section = document.createElement('section');
    section.id = 'measurementSketchpad';
    section.className = 'block sketchpad-card measurement-sketchpad-card';
    section.dataset.sketchpad = '';
    section.dataset.sketchScope = 'measurements';
    section.innerHTML = [
      '<div class="block-title">',
      '<h3>Croquis / notes manuscrites</h3>',
      '<p>Dessinez au doigt, au stylet ou à la souris.</p>',
      '</div>',
      '<div class="sketchpad-surface">',
      '<canvas class="sketchpad-canvas" width="1100" height="420" aria-label="Zone de dessin manuscrit"></canvas>',
      '</div>',
      '<div class="sketchpad-actions">',
      '<button type="button" class="secondary" data-sketch-clear>Effacer</button>',
      '<button type="button" class="primary" data-sketch-save>Enregistrer</button>',
      '<span class="sketchpad-status" data-sketch-status></span>',
      '</div>'
    ].join('');

    form.appendChild(section);
    sketchRoot = section;

    window.initSketchPad({
      root: sketchRoot,
      beforeSave: async function () {
        if (!currentServerId) await saveRecord();
        updateSketchOwner();
        if (!currentServerId) throw new Error('Fiche non enregistrée');
      },
      getSaveUrl: function () {
        updateSketchOwner();
        return currentServerId ? `/api/measurements/${currentServerId}/sketch` : '';
      },
      getImageUrl: function () {
        updateSketchOwner();
        return currentServerId ? `/sketches/measurements/${currentServerId}.png` : '';
      }
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
    if (sketchRoot && typeof sketchRoot.sketchpadLoad === 'function') sketchRoot.sketchpadLoad();

    currentRecordName = record.recordName || '';
    saveStatus.textContent = record.updatedAt
      ? `Fiche chargée - dernière sauvegarde le ${new Date(record.updatedAt).toLocaleString('fr-FR')}`
      : 'Fiche chargée';
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
    saveStatus.textContent = `Enregistré localement - ${new Date(payload.updatedAt).toLocaleString('fr-FR')}`;

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
      return currentServerId;
    } catch {
      saveStatus.textContent = `Enregistré localement - serveur indisponible`;
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
    if (sketchRoot) {
      delete sketchRoot.dataset.sketchId;
      delete sketchRoot.dataset.sketchImageUrl;
      if (typeof sketchRoot.sketchpadClear === 'function') sketchRoot.sketchpadClear();
    }
    saveStatus.textContent = 'Nouvelle fiche prête';
    setDefaultValues();
  }

  function renderPhotos() {
    if (!photoGallery || !photoTemplate) return;
    photoGallery.innerHTML = '';

    photos.forEach((photo, index) => {
      const node = photoTemplate.content.firstElementChild.cloneNode(true);
      node.querySelector('img').src = photo.dataUrl;
      node.querySelector('img').alt = photo.name || 'Photo chantier';
      node.querySelector('.photo-remove').addEventListener('click', () => {
        photos.splice(index, 1);
        renderPhotos();
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
    });
  }

  saveBtn.addEventListener('click', saveRecord);
  loadBtn.addEventListener('click', loadRecord);
  resetBtn.addEventListener('click', resetForm);
  printBtn.addEventListener('click', () => window.print());

  setDefaultValues();
  initServerLinks();
  initHandwrittenSketch();
  saveStatus.textContent = getStoredRecords().length
    ? 'Des fiches locales sont disponibles'
    : 'Aucune sauvegarde chargée';
}

createModuleSheet();
