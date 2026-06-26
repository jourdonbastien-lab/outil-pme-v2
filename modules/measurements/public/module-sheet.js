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
      recordName: recordNameField.value.trim(),
      fields,
      checkboxGroups,
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

    const checkboxGroups = record.checkboxGroups || {};
    Object.keys(checkboxGroups).forEach((name) => {
      setCheckboxValues(name, checkboxGroups[name]);
    });

    photos = Array.isArray(record.photos) ? record.photos.slice() : [];
    renderPhotos();

    currentRecordName = record.recordName || '';
    saveStatus.textContent = record.updatedAt
      ? `Fiche chargée - dernière sauvegarde le ${new Date(record.updatedAt).toLocaleString('fr-FR')}`
      : 'Fiche chargée';
  }

  function saveRecord() {
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
  saveStatus.textContent = getStoredRecords().length
    ? 'Des fiches locales sont disponibles'
    : 'Aucune sauvegarde chargée';
}

createModuleSheet();
