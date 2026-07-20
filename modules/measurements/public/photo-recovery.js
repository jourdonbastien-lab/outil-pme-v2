(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MeasurementPhotoRecovery = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const KNOWN_KEYS = [
    'outil-pme.portail.measurements',
    'outil-pme.cloture.measurements',
    'outil-pme.garde-corps.measurements',
    'outil-pme.pergola.measurements',
    'outil-pme.verriere.measurements',
    'outil-pme.autres.measurements',
    'outil-pme.escalier.measurements',
    'outil-pme.measurements.generic'
  ];

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function normalizeModule(value) {
    return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function moduleFromKey(key) {
    const match = text(key).match(/^outil-pme\.([^.]+)\.measurements$/);
    return match ? match[1].replace(/-/g, ' ') : '';
  }

  function photoReference(photo, index) {
    if (!photo || typeof photo !== 'object') return null;
    const dataUrl = text(photo.dataUrl);
    if (!/^data:image\/[a-z0-9.+-]+[;,]/i.test(dataUrl)) return null;
    return {
      dataUrl,
      name: text(photo.name) || `photo-${index + 1}`,
      caption: text(photo.caption)
    };
  }

  function describeRecord(record, key) {
    const fields = record && typeof record.fields === 'object' && record.fields ? record.fields : {};
    return {
      key,
      id: text(record?.server_id || record?.id),
      module: text(record?.module) || moduleFromKey(key),
      quoteId: text(record?.quote_id || fields.quote_id),
      date: text(fields.date || record?.date),
      recordName: text(record?.recordName),
      photos: Array.isArray(record?.photos)
        ? record.photos.map(photoReference).filter(Boolean)
        : []
    };
  }

  function isTargetRecord(record, target) {
    if (normalizeModule(record.module) !== normalizeModule(target.module || 'Portail')) return false;
    if (record.id) return record.id === text(target.id);
    const quoteMatch = record.quoteId && record.quoteId === text(target.quoteId);
    const targetDate = text(target.date);
    const dateMatch = !targetDate || record.date === targetDate;
    return Boolean(quoteMatch && dateMatch);
  }

  function scanLocalStorage(storage, target = { id: 9, module: 'Portail', quoteId: 6, date: '2026-07-20' }) {
    const availableKeys = [];
    for (let index = 0; index < Number(storage?.length || 0); index += 1) {
      const key = storage.key(index);
      if (key) availableKeys.push(String(key));
    }
    const candidateKeys = Array.from(new Set(KNOWN_KEYS.concat(
      availableKeys.filter((key) => /^outil-pme\..*measurements$/i.test(key))
    )));
    const foundKeys = [];
    const invalidKeys = [];
    const records = [];

    for (const key of candidateKeys) {
      const raw = storage.getItem(key);
      if (raw == null) continue;
      foundKeys.push(key);
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        invalidKeys.push(key);
        continue;
      }
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      entries.filter((entry) => entry && typeof entry === 'object').forEach((entry) => {
        const record = describeRecord(entry, key);
        if (isTargetRecord(record, target)) records.push(record);
      });
    }

    return {
      foundKeys,
      invalidKeys,
      records,
      photoCount: records.reduce((sum, record) => sum + record.photos.length, 0)
    };
  }

  return { KNOWN_KEYS, photoReference, describeRecord, scanLocalStorage };
});
