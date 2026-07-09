'use strict';

function normalizeLine(line) {
  return String(line || '')
    .replace(/[|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractPrimaryPageText(text) {
  const raw = String(text || '').replace(/\r\n/g, '\n');
  const pageBreakIndex = raw.indexOf('\f');
  let primary = pageBreakIndex >= 0 ? raw.slice(0, pageBreakIndex) : raw;

  const boundaryMatchers = [
    /\nconditions générales\b/i,
    /\nbon pour accord\b/i,
    /\nbon pour\b/i,
    /\nsignature\b/i,
  ];

  let boundaryIndex = primary.length;
  for (const matcher of boundaryMatchers) {
    const match = primary.match(matcher);
    if (match && typeof match.index === 'number' && match.index >= 0 && match.index < boundaryIndex) {
      boundaryIndex = match.index;
    }
  }

  return primary.slice(0, boundaryIndex).trim();
}

function splitLines(text) {
  return extractPrimaryPageText(text)
    .split(/\r?\n/)
    .map((line) => line.trim());
}

function findLineIndex(lines, regex, startIndex = 0) {
  for (let i = startIndex; i < lines.length; i += 1) {
    if (regex.test(lines[i] || '')) return i;
  }
  return -1;
}

function isNoiseLine(line) {
  return /^(?:sarL a2 metal|a2 metal|code client|mode de règlement|bon pour|accord|signature|conditions générales|total|ht|ttc|tva|date de validité|validité|devis gratuit|acompte)$/i.test(String(line || '').trim())
    || /(?:bon pour|accord|signature|conditions générales|conditions generale|conditions générales)/i.test(String(line || ''));
}

function parseMoney(value) {
  const normalized = String(value || '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, '')
    .replace(/€/g, '')
    .replace(/,/g, '.');
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const amount = Number(match[0]);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null;
}

function extractFirstMoney(snippet) {
  const moneyRegex = /\d{1,3}(?:[ .\u00A0]\d{3})*(?:[,.]\d{2})?|\d+(?:[,.]\d{2})?/g;
  const matches = String(snippet || '').match(moneyRegex) || [];
  for (const candidate of matches) {
    const amount = parseMoney(candidate);
    if (amount !== null) return amount;
  }
  return null;
}

function extractClientName(lines) {
  const markerIndex = findLineIndex(lines, /code client\s+mode de règlement/i);
  if (markerIndex < 0) return '';

  let end = markerIndex - 1;
  while (end >= 0 && !normalizeLine(lines[end])) end -= 1;
  if (end < 0) return '';

  let start = end;
  while (start >= 0 && normalizeLine(lines[start])) start -= 1;
  const block = lines.slice(start + 1, end + 1).map(normalizeLine).filter(Boolean);
  const candidate = block.find((line) => !isNoiseLine(line));
  return candidate || block[0] || '';
}

function extractQuoteNumber(primaryText) {
  const match = String(primaryText || '').match(/\bDE\d+\b/i);
  return match ? match[0].toUpperCase() : '';
}

function extractQuoteDate(lines) {
  const headerIndex = findLineIndex(lines, /description\s+qt[ée]\s+p\.u\.\s*ht\s+montant\s+ht\s+tva/i);
  const stopIndex = headerIndex > 0 ? headerIndex : lines.length;

  for (let i = 0; i < stopIndex; i += 1) {
    const line = normalizeLine(lines[i]);
    if (!line) continue;
    if (/validité|valable jusqu|échéance|echeance|expiration/i.test(line)) continue;
    const match = line.match(/\b(\d{2}[\/\-.]\d{2}[\/\-.]\d{4})\b/);
    if (match) return match[1].replace(/-/g, '/').replace(/\./g, '/');
  }

  return '';
}

function extractTitle(lines) {
  const headerIndex = findLineIndex(lines, /description\s+qt[ée]\s+p\.u\.\s*ht\s+montant\s+ht\s+tva/i);
  if (headerIndex < 0) return '';

  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const line = normalizeLine(lines[i]);
    if (!line) continue;
    if (/^(devis gratuit|acompte|total\s+ht|total\s+ttc|conditions générales|bon pour accord|signature)/i.test(line)) break;
    if (!/[A-Za-zÀ-ÿ]{3,}/.test(line)) continue;
    if (/^(description|qt[ée]|qte|p\.u\.|montant|tva|total)/i.test(line)) continue;
    return line;
  }

  return '';
}

function extractAmountAfterLabel(lines, labelRegex) {
  for (let i = 0; i < lines.length; i += 1) {
    const line = normalizeLine(lines[i]);
    if (!line || !labelRegex.test(line)) continue;
    const snippet = [line, lines[i + 1], lines[i + 2]].filter(Boolean).join(' ');
    const amount = extractFirstMoney(snippet);
    if (amount !== null) return amount;
  }
  return null;
}

function parseEbpQuoteText(text) {
  const primaryText = extractPrimaryPageText(text);
  const lines = primaryText.split(/\r?\n/).map((line) => line.trim());

  const clientName = extractClientName(lines);
  const quoteNumber = extractQuoteNumber(primaryText);
  const quoteDate = extractQuoteDate(lines);
  const title = extractTitle(lines);
  const amountHT = extractAmountAfterLabel(lines, /total\s+ht\s+net/i);
  const amountTTC = extractAmountAfterLabel(lines, /total\s+ttc/i);

  const markerChecks = [
    { key: 'clientBlock', ok: findLineIndex(lines, /code client\s+mode de règlement/i) >= 0 },
    { key: 'quoteNumberDE', ok: Boolean(quoteNumber) },
    { key: 'tableHeader', ok: findLineIndex(lines, /description\s+qt[ée]\s+p\.u\.\s*ht\s+montant\s+ht\s+tva/i) >= 0 },
    { key: 'totalHTNet', ok: findLineIndex(lines, /total\s+ht\s+net/i) >= 0 },
    { key: 'totalTTC', ok: findLineIndex(lines, /total\s+ttc/i) >= 0 },
  ];
  const markersFound = markerChecks.filter((m) => m.ok).map((m) => m.key);
  const markersMissing = markerChecks.filter((m) => !m.ok).map((m) => m.key);

  const recognized = Boolean(
    clientName &&
    quoteNumber &&
    quoteDate &&
    title &&
    amountHT !== null &&
    amountTTC !== null
  );

  let reason = '';
  if (!recognized) {
    const missingFields = [];
    if (!clientName) missingFields.push('client_name');
    if (!quoteNumber) missingFields.push('quote_number');
    if (!quoteDate) missingFields.push('quote_date');
    if (!title) missingFields.push('title');
    if (amountHT === null) missingFields.push('amount_ht');
    if (amountTTC === null) missingFields.push('amount_ttc');
    reason = `Champs manquants: ${missingFields.join(', ')}`;
  }

  const analysisUsed = recognized ? 'Parser EBP' : 'Analyse générique';

  return {
    matched: recognized,
    recognized,
    reason,
    markersFound,
    markersMissing,
    inputLength: String(text || '').length,
    primaryTextLength: primaryText.length,
    analysisUsed,
    parserName: analysisUsed,
    client_name: clientName,
    client: clientName,
    quote_number: quoteNumber,
    quoteNumber,
    quote_date: quoteDate,
    date: quoteDate,
    title,
    amount_ht: amountHT,
    amountHT,
    amount_ttc: amountTTC,
    amountTTC,
    primary_text: primaryText,
    diagnostic: {
      matched: recognized,
      reason,
      markersFound,
      markersMissing,
      inputLength: String(text || '').length,
      primaryTextLength: primaryText.length,
    },
  };
}

module.exports = {
  parseEbpQuoteText,
};