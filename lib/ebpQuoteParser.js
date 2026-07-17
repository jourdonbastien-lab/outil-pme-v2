'use strict';

function normalizeText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[\u00A0\u202F]/g, ' ');
}

function normalizeLine(line) {
  return normalizeText(line)
    .replace(/[|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeToken(value) {
  return normalizeLine(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function extractPrimaryPageText(text) {
  const raw = normalizeText(text);
  const pageBreakIndex = raw.indexOf('\f');
  let primary = pageBreakIndex >= 0 ? raw.slice(0, pageBreakIndex) : raw;

  const secondPageMatch = primary.match(/\n\s*2\s+sur\s+\d+\s*\n/i);
  if (secondPageMatch && typeof secondPageMatch.index === 'number') {
    primary = primary.slice(0, secondPageMatch.index);
  }

  const boundaryMatchers = [
    /\n\s*conditions gÃ©nÃ©rales\b/i,
    /\n\s*bon pour accord\b/i,
    /\n\s*signature\b/i,
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

function splitNormalizedLines(text) {
  return normalizeText(text)
    .split(/\n/)
    .map((line) => normalizeLine(line));
}

function splitPrimaryNormalizedLines(text) {
  return extractPrimaryPageText(text)
    .split(/\n/)
    .map((line) => normalizeLine(line));
}

function findLineIndex(lines, regex, startIndex) {
  const from = Number.isFinite(startIndex) ? startIndex : 0;
  for (let i = from; i < lines.length; i += 1) {
    if (regex.test(lines[i] || '')) return i;
  }
  return -1;
}

function isIssuerOrNoiseLine(line) {
  const value = normalizeLine(line);
  const token = normalizeToken(value);
  if (!value) return true;
  if (/^(?:sarl\s+a2\s+metal|a2\s+metal)$/i.test(value)) return true;
  if (/(?:siret|tel|telephone|mail|@|www\.)/i.test(value)) return true;
  if (/(?:bon\s+pour|accord|signature|conditions\s+generales|conditions\s+gÃ©nÃ©rales)/i.test(value)) return true;
  if (/^(?:devis|numero|date|datedevalidite|modedereglementcodeclient|modedereglement|codeclient)$/.test(token)) return true;
  return false;
}

function parseMoney(value) {
  const normalized = normalizeText(value)
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, '')
    .replace(/[€]/g, '')
    .replace(/,/g, '.');
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const amount = Number(match[0]);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null;
}

function isBadInvoiceAmountContext(line) {
  const value = normalizeLine(line);
  if (!value) return true;
  if (/%/.test(value)) return true;
  if (/\b(?:siret|siren|rcs|tva\s+intra|intracommunautaire|iban|rib|bic|banque|capital|ape|naf|tel|telephone|mail|www)\b/i.test(value)) return true;
  if (/^\d+\s+sur\s+\d+$/i.test(value)) return true;
  return false;
}

function extractMoneyCandidates(line) {
  if (isBadInvoiceAmountContext(line)) return [];
  const value = normalizeLine(line);
  const moneyRegex = /-?\d{1,3}(?:[ .\u00A0\u202F]\d{3})*(?:[,.]\d{2})(?:\s*€)?|-?\d+(?:[,.]\d{2})(?:\s*€)?/g;
  const matches = value.match(moneyRegex) || [];
  return matches
    .map((candidate) => parseMoney(candidate))
    .filter((amount) => amount !== null);
}

function extractFirstMoney(snippet) {
  const moneyRegex = /\d{1,3}(?:[ .\u00A0\u202F]\d{3})*(?:[,.]\d{2})?|\d+(?:[,.]\d{2})?/g;
  const matches = String(snippet || '').match(moneyRegex) || [];
  for (const candidate of matches) {
    const amount = parseMoney(candidate);
    if (amount !== null) return amount;
  }
  return null;
}

function extractClientName(lines) {
  const pageMarkerIndex = findLineIndex(lines, /^\d+\s+sur\s+\d+$/i, 0);
  if (pageMarkerIndex >= 0) {
    for (let i = pageMarkerIndex + 1; i < Math.min(lines.length, pageMarkerIndex + 8); i += 1) {
      const line = normalizeLine(lines[i]);
      if (!line) continue;
      if (isIssuerOrNoiseLine(line)) continue;
      if (/^\d{5}\b/.test(line)) continue;
      return line;
    }
  }

  const markerIndex = findLineIndex(lines, /mode\s+de\s+reglement\s*code\s+client|code\s+client\s*mode\s+de\s+reglement/i, 0);
  if (markerIndex < 0) return '';

  const candidateBlock = lines.slice(Math.max(0, markerIndex - 8), markerIndex).filter(Boolean);
  const filtered = candidateBlock.filter((line) => {
    if (isIssuerOrNoiseLine(line)) return false;
    if (/^\d{5}\b/.test(line)) return false;
    if (/\b(?:rue|avenue|boulevard|route|za|zi|zac)\b/i.test(line)) return false;
    return /[A-Za-zÀ-ÿ]/.test(line);
  });

  return filtered[0] || '';
}

function extractQuoteNumber(primaryText) {
  const lines = String(primaryText || '').split(/\n/).map((line) => normalizeLine(line));
  const numeroIndex = findLineIndex(lines, /^numero$/i, 0);
  if (numeroIndex >= 0) {
    for (let i = numeroIndex + 1; i < Math.min(lines.length, numeroIndex + 6); i += 1) {
      const line = normalizeLine(lines[i]);
      if (!line) continue;
      if (/^DE\d+$/i.test(line)) return line.toUpperCase();
    }
  }

  const match = String(primaryText || '').match(/\bDE\d+\b/i);
  return match ? String(match[0]).toUpperCase() : '';
}

function extractInvoiceNumber(primaryText) {
  const lines = String(primaryText || '').split(/\n/).map((line) => normalizeLine(line));
  const numeroIndex = findLineIndex(lines, /^numero$/i, 0);
  if (numeroIndex >= 0) {
    for (let i = numeroIndex + 1; i < Math.min(lines.length, numeroIndex + 8); i += 1) {
      const line = normalizeLine(lines[i]);
      if (!line) continue;
      if (/^(?:FA|FC|FACT)[A-Z0-9\-_/]*\d+$/i.test(line)) return line.toUpperCase();
    }
  }

  const labeled = String(primaryText || '').match(/\b(?:facture|avoir)\s*(?:n[Â°o]|numero|num)?\s*[:#\-â€“â€”]?\s*([A-Z]{1,6}[A-Z0-9\-_/]*\d+)\b/i);
  if (labeled) return String(labeled[1]).toUpperCase();

  const match = String(primaryText || '').match(/\b(?:FA|FC|FACT)[A-Z0-9\-_/]*\d+\b/i);
  return match ? String(match[0]).toUpperCase() : '';
}

function extractQuoteDate(lines) {
  const dateIndex = findLineIndex(lines, /^date$/i, 0);
  if (dateIndex >= 0) {
    for (let i = dateIndex + 1; i < Math.min(lines.length, dateIndex + 6); i += 1) {
      const line = normalizeLine(lines[i]);
      if (!line) continue;
      if (/^date\s+de\s+validite$/i.test(normalizeToken(line))) continue;
      const match = line.match(/\b(\d{2}[\/\-.]\d{2}[\/\-.]\d{4})\b/);
      if (match) return match[1].replace(/-/g, '/').replace(/\./g, '/');
    }
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = normalizeLine(lines[i]);
    if (!line) continue;
    if (/date\s+de\s+validite|date\s+de\s+validitÃ©/i.test(line)) continue;
    const match = line.match(/\b(\d{2}[\/\-.]\d{2}[\/\-.]\d{4})\b/);
    if (match) return match[1].replace(/-/g, '/').replace(/\./g, '/');
  }

  return '';
}

function extractTitle(lines) {
  const headerIndex = lines.findIndex((line) => {
    const token = normalizeToken(line);
    return token.includes('tva')
      && token.includes('montantht')
      && token.includes('puht')
      && token.includes('qte')
      && token.includes('description');
  });
  if (headerIndex < 0) return '';

  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const line = normalizeLine(lines[i]);
    if (!line) continue;
    if (/^(devis gratuit|acompte|total\s+ht|total\s+ttc|conditions gÃ©nÃ©rales|bon pour accord|signature|net Ã  payer|net a payer)/i.test(line)) break;
    if (/^[-+0-9.,\sâ‚¬%]+$/.test(line)) continue;
    if (!/[A-Za-zÀ-ÿ]{3,}/.test(line)) continue;
    if (/^(description|qt[Ã©e]|qte|p\.u\.|montant|tva|total)/i.test(line)) continue;
    return line;
  }

  return '';
}

function extractTotalsSequence(lines) {
  const labels = ['totalhtnet', 'totaltva', 'totalttc', 'netapayer'];
  for (let i = 0; i < lines.length; i += 1) {
    const l1 = normalizeToken(lines[i]);
    const l2 = normalizeToken(lines[i + 1]);
    const l3 = normalizeToken(lines[i + 2]);
    const l4 = normalizeToken(lines[i + 3]);
    if (l1 === labels[0] && l2 === labels[1] && l3 === labels[2] && l4 === labels[3]) {
      const values = [];
      for (let j = i + 4; j < lines.length && values.length < 4; j += 1) {
        const amount = extractFirstMoney(lines[j]);
        if (amount !== null) values.push(amount);
      }
      return {
        amountHT: values.length >= 1 ? values[0] : null,
        amountTTC: values.length >= 3 ? values[2] : null,
      };
    }
  }
  return { amountHT: null, amountTTC: null };
}

function findInvoiceTotalLabelIndex(lines, token, startIndex = 0) {
  for (let i = startIndex; i < lines.length; i += 1) {
    const lineToken = normalizeToken(lines[i]);
    if (lineToken.includes(token)) return i;
  }
  return -1;
}

function firstAmountOnOrAfterLabel(lines, index, nextLabelIndex) {
  if (index < 0) return null;
  const sameLineAmounts = extractMoneyCandidates(lines[index]);
  if (sameLineAmounts.length) return sameLineAmounts[sameLineAmounts.length - 1];

  const limit = nextLabelIndex >= 0 ? Math.min(nextLabelIndex, index + 3) : Math.min(lines.length, index + 3);
  for (let i = index + 1; i < limit; i += 1) {
    const token = normalizeToken(lines[i]);
    if (/^totalhtnet$|^totaltva$|^totalttc$|^netapayer$/.test(token)) break;
    const amounts = extractMoneyCandidates(lines[i]);
    if (amounts.length) return amounts[0];
  }
  return null;
}

function extractInvoiceTotalsFromLines(lines) {
  const htIndex = findInvoiceTotalLabelIndex(lines, 'totalhtnet');
  const vatIndex = findInvoiceTotalLabelIndex(lines, 'totaltva');
  const ttcIndex = findInvoiceTotalLabelIndex(lines, 'totalttc');
  const netIndex = findInvoiceTotalLabelIndex(lines, 'netapayer');

  if (htIndex < 0 && vatIndex < 0 && ttcIndex < 0 && netIndex < 0) {
    return { amountHT: null, vatAmount: null, amountTTC: null };
  }

  let amountHT = firstAmountOnOrAfterLabel(lines, htIndex, vatIndex);
  let vatAmount = firstAmountOnOrAfterLabel(lines, vatIndex, ttcIndex);
  let amountTTC = firstAmountOnOrAfterLabel(lines, ttcIndex, netIndex);
  const netLineAmounts = netIndex >= 0 ? extractMoneyCandidates(lines[netIndex]) : [];
  const netAmount = netLineAmounts.length ? netLineAmounts[netLineAmounts.length - 1] : null;

  if (amountHT === null || vatAmount === null || amountTTC === null) {
    const labelIndexes = [htIndex, vatIndex, ttcIndex, netIndex].filter((idx) => idx >= 0).sort((a, b) => a - b);
    const lastLabelIndex = labelIndexes.length ? labelIndexes[labelIndexes.length - 1] : -1;
    const values = [];
    for (let i = lastLabelIndex + 1; i < lines.length && values.length < 4 && i <= lastLabelIndex + 12; i += 1) {
      const token = normalizeToken(lines[i]);
      if (!lines[i]) continue;
      if (/^(?:mode|reglement|echeance|page|conditions|signature|bonpouraccord)/i.test(token)) break;
      const amounts = extractMoneyCandidates(lines[i]);
      for (const amount of amounts) {
        values.push(amount);
        if (values.length >= 4) break;
      }
    }
    if (values.length >= 1 && amountHT === null) amountHT = values[0];
    if (values.length >= 2 && vatAmount === null) vatAmount = values[1];
    if (values.length >= 3 && amountTTC === null) amountTTC = values[2];
    if (amountTTC === null && values.length >= 4) amountTTC = values[3];
  }

  if (amountTTC === null && netAmount !== null) amountTTC = netAmount;

  if (amountTTC === null && amountHT !== null && vatAmount !== null) {
    amountTTC = Math.round((amountHT + vatAmount) * 100) / 100;
  }
  if (vatAmount === null && amountHT !== null && amountTTC !== null) {
    vatAmount = Math.round((amountTTC - amountHT) * 100) / 100;
  }

  return { amountHT, vatAmount, amountTTC };
}

function extractInvoiceTotals(text) {
  const pages = normalizeText(text).split('\f');
  const scoredPages = pages.map((page, index) => {
    const pageLines = page.split(/\n/).map((line) => normalizeLine(line));
    const tokens = pageLines.map((line) => normalizeToken(line)).join(' ');
    const score = ['totalhtnet', 'totaltva', 'totalttc', 'netapayer']
      .reduce((sum, token) => sum + (tokens.includes(token) ? 1 : 0), 0);
    return { index, score, pageLines };
  }).sort((a, b) => b.score - a.score || a.index - b.index);

  for (const page of scoredPages) {
    if (page.score <= 0) continue;
    const totals = extractInvoiceTotalsFromLines(page.pageLines);
    if (totals.amountHT !== null || totals.vatAmount !== null || totals.amountTTC !== null) return totals;
  }

  return extractInvoiceTotalsFromLines(splitNormalizedLines(text));
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
  const primaryLines = splitPrimaryNormalizedLines(text);
  const lines = splitNormalizedLines(text);
  const pageCount = normalizeText(text).split('\f').length;

  const clientName = extractClientName(primaryLines);
  const quoteNumber = extractQuoteNumber(primaryText);
  const quoteDate = extractQuoteDate(primaryLines);
  const title = extractTitle(lines);
  const totals = extractTotalsSequence(lines);
  const amountHT = totals.amountHT !== null ? totals.amountHT : extractAmountAfterLabel(lines, /total\s+ht\s+net/i);
  const amountTTC = totals.amountTTC !== null ? totals.amountTTC : extractAmountAfterLabel(lines, /total\s+ttc/i);

  const markerChecks = [
    { key: 'clientBlock', ok: findLineIndex(lines, /mode\s+de\s+reglement\s*code\s+client|code\s+client\s*mode\s+de\s+reglement/i) >= 0 },
    { key: 'dateValidite', ok: findLineIndex(lines, /date\s+de\s+validite|date\s+de\s+validitÃ©/i) >= 0 },
    { key: 'numero', ok: findLineIndex(lines, /^numero$/i) >= 0 },
    { key: 'devis', ok: findLineIndex(lines, /^devis$/i) >= 0 },
    { key: 'quoteNumberDE', ok: Boolean(quoteNumber) },
    {
      key: 'tableHeader',
      ok: lines.some((line) => {
        const token = normalizeToken(line);
        return token.includes('tva')
          && token.includes('montantht')
          && token.includes('puht')
          && token.includes('qte')
          && token.includes('description');
      }),
    },
    { key: 'totalHTNet', ok: findLineIndex(lines, /total\s+ht\s+net/i) >= 0 },
    { key: 'totalTTC', ok: findLineIndex(lines, /total\s+ttc/i) >= 0 },
  ];
  const markersFound = markerChecks.filter((m) => m.ok).map((m) => m.key);
  const markersMissing = markerChecks.filter((m) => !m.ok).map((m) => m.key);
  const ebpLike = markersFound.length >= 4;

  const recognized = Boolean(
    ebpLike &&
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
    if (!ebpLike) {
      reason = `Marqueurs EBP insuffisants (${markersFound.length}/7)`;
    } else {
      reason = `Champs manquants: ${missingFields.join(', ')}`;
    }
  }

  const analysisUsed = recognized ? 'Parser EBP' : 'Analyse gÃ©nÃ©rique';

  return {
    matched: recognized,
    recognized,
    reason,
    markersFound,
    markersMissing,
    inputLength: String(text || '').length,
    primaryTextLength: primaryText.length,
    pageCount,
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
      pageCount,
    },
  };
}

function parseEbpInvoiceText(text) {
  const primaryText = extractPrimaryPageText(text);
  const primaryLines = splitPrimaryNormalizedLines(text);
  const lines = splitNormalizedLines(text);
  const pageCount = normalizeText(text).split('\f').length;

  const clientName = extractClientName(primaryLines);
  const invoiceNumber = extractInvoiceNumber(primaryText);
  const invoiceDate = extractQuoteDate(primaryLines) || extractQuoteDate(lines);
  const totals = extractInvoiceTotals(text);
  const amountHT = totals.amountHT !== null ? totals.amountHT : extractAmountAfterLabel(lines, /total\s+ht\s+net/i);
  const amountTTC = totals.amountTTC !== null ? totals.amountTTC : extractAmountAfterLabel(lines, /total\s+ttc|net\s+a\s+payer|net\s+à\s+payer/i);
  const vatAmount = totals.vatAmount !== null
    ? totals.vatAmount
    : (amountHT !== null && amountTTC !== null ? Math.round((amountTTC - amountHT) * 100) / 100 : extractAmountAfterLabel(lines, /total\s+tva/i));

  const markerChecks = [
    { key: 'facture', ok: lines.some((line) => /^facture$/i.test(line) || /\bfacture\b/i.test(line)) },
    { key: 'invoiceNumber', ok: Boolean(invoiceNumber) },
    { key: 'invoiceDate', ok: Boolean(invoiceDate) },
    { key: 'clientName', ok: Boolean(clientName) },
    { key: 'totalHT', ok: amountHT !== null },
    { key: 'totalTTC', ok: amountTTC !== null },
  ];
  const markersFound = markerChecks.filter((m) => m.ok).map((m) => m.key);
  const markersMissing = markerChecks.filter((m) => !m.ok).map((m) => m.key);

  const recognized = Boolean(invoiceNumber && invoiceDate && amountHT !== null && amountTTC !== null);
  const missingFields = [];
  if (!invoiceNumber) missingFields.push('invoice_number');
  if (!invoiceDate) missingFields.push('invoice_date');
  if (amountHT === null) missingFields.push('amount_ht');
  if (amountTTC === null) missingFields.push('amount_ttc');

  return {
    matched: recognized,
    recognized,
    reason: recognized ? '' : `Champs facture manquants: ${missingFields.join(', ')}`,
    markersFound,
    markersMissing,
    inputLength: String(text || '').length,
    primaryTextLength: primaryText.length,
    pageCount,
    analysisUsed: recognized ? 'Parser facture EBP' : 'Analyse facture generique',
    parserName: recognized ? 'Parser facture EBP' : 'Analyse facture generique',
    client_name: clientName,
    client: clientName,
    invoice_number: invoiceNumber,
    invoiceNumber,
    invoice_date: invoiceDate,
    date: invoiceDate,
    amount_ht: amountHT,
    amountHT,
    vat_amount: vatAmount,
    vatAmount,
    amount_ttc: amountTTC,
    amountTTC,
    primary_text: primaryText,
    diagnostic: {
      matched: recognized,
      reason: recognized ? '' : `Champs facture manquants: ${missingFields.join(', ')}`,
      markersFound,
      markersMissing,
      inputLength: String(text || '').length,
      primaryTextLength: primaryText.length,
      pageCount,
    },
  };
}

module.exports = {
  parseEbpQuoteText,
  parseEbpInvoiceText,
};
