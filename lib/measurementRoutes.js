'use strict';

const MODULE_ROUTES = new Map([
  ['escalier', 'escalier'], ['escalier v2', 'escalier-v2'], ['portail', 'portail'],
  ['cloture', 'cloture'], ['garde-corps', 'garde-corps'], ['garde corps', 'garde-corps'],
  ['pergola', 'pergola'], ['verriere', 'verriere'], ['autres', 'autres'], ['autre', 'autres']
]);

function normalizeModuleName(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
    .toLocaleLowerCase('fr-FR').replace(/[_–—]+/g, '-').replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ');
}

function measurementModuleSlug(value) {
  return MODULE_ROUTES.get(normalizeModuleName(value)) || '';
}

function positiveId(value) {
  const id = Number(value || 0);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function canonicalMeasurementUrl(row, options = {}) {
  const id = positiveId(row?.id);
  const slug = measurementModuleSlug(row?.module);
  if (!id || !slug) return '';
  const params = new URLSearchParams({ id: String(id) });
  const fromQuoteId = positiveId(options.fromQuoteId);
  if (fromQuoteId) params.set('from_quote', String(fromQuoteId));
  return `/outils/prises-cotes/${slug}?${params.toString()}`;
}

function newMeasurementUrl(moduleName, quoteId) {
  const slug = measurementModuleSlug(moduleName);
  const id = positiveId(quoteId);
  return slug && id ? `/outils/prises-cotes/${slug}?quote_id=${id}&from_quote=${id}` : '';
}

function parsePayload(data) {
  try {
    const parsed = JSON.parse(String(data || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function buildMeasurementEditorPayload(row, quote) {
  const payload = parsePayload(row?.data);
  const fields = payload.fields && typeof payload.fields === 'object' && !Array.isArray(payload.fields)
    ? { ...payload.fields }
    : {};
  const storedClient = String(fields.client || row?.client || '').trim();
  const storedChantier = String(fields.chantier || row?.chantier || '').trim();
  if (!storedClient && quote) fields.client = String(quote.client_name || '').trim();
  else if (storedClient) fields.client = storedClient;
  if (!storedChantier && quote) fields.chantier = String(quote.title || '').trim();
  else if (storedChantier) fields.chantier = storedChantier;
  if (!fields.quote_id && positiveId(row?.quote_id)) fields.quote_id = String(row.quote_id);

  return {
    ...payload,
    id: positiveId(row?.id), server_id: positiveId(row?.id),
    module: String(row?.module || payload.module || '').trim(),
    recordName: String(row?.record_name || payload.recordName || '').trim(),
    fields,
    quote_id: positiveId(row?.quote_id), client_order_id: positiveId(row?.client_order_id),
    updatedAt: row?.updated_at || payload.updatedAt || null
  };
}

module.exports = { measurementModuleSlug, canonicalMeasurementUrl, newMeasurementUrl, buildMeasurementEditorPayload };
