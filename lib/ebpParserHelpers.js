'use strict';

function createEbpParserHelpers({ normalizeSearchText, roundAmount }) {
function parseFrenchAmount(raw) {
  const cleaned = String(raw || '')
    .replace(/\s+/g, '')
    .replace(/€/g, '')
    .replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? roundAmount(n) : null;
}

function pickAmountWithLabel(text, labels) {
  const raw = String(text || '');
  for (const label of labels) {
    const re = new RegExp(`${label}[^0-9]{0,24}([0-9][0-9 .,'\\u00A0]*)`, 'i');
    const match = raw.match(re);
    if (!match) continue;
    const amount = parseFrenchAmount(match[1]);
    if (amount !== null) return amount;
  }
  return null;
}

function normalizeOcrLine(line) {
  return String(line || '')
    .replace(/[|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractLabeledValue(lines, labels) {
  for (let i = 0; i < lines.length; i += 1) {
    const line = normalizeOcrLine(lines[i]);
    if (!line) continue;
    const normalized = normalizeSearchText(line);
    for (const label of labels) {
      const normalizedLabel = normalizeSearchText(label);
      if (!normalizedLabel) continue;

      if (normalized.startsWith(normalizedLabel)) {
        const remainder = line.slice(label.length).replace(/^\s*[:\-–—]\s*/, '').trim();
        if (remainder) return remainder;
        if (lines[i + 1]) {
          const next = normalizeOcrLine(lines[i + 1]);
          if (next && !/^\d+[\s\S]*$/.test(next)) return next;
        }
      }

      const index = normalized.indexOf(normalizedLabel);
      if (index >= 0 && index < 14) {
        const after = line.slice(Math.min(line.length, label.length + index)).replace(/^.*?[:\-–—]\s*/, '').trim();
        if (after) return after;
      }
    }
  }
  return '';
}

function pickBestAmountFromText(text, labels) {
  const raw = String(text || '');
  const amountPattern = /([0-9]{1,3}(?:[ .\u00A0][0-9]{3})*(?:,[0-9]{1,2})?|[0-9]+(?:,[0-9]{1,2})?)/g;
  for (const label of labels) {
    const labelMatch = raw.match(new RegExp(`${label}`, 'i'));
    if (!labelMatch) continue;

    const snippetStart = Math.max(0, raw.toLowerCase().indexOf(labelMatch[0].toLowerCase()));
    const snippet = raw.slice(snippetStart, snippetStart + 140);
    const values = Array.from(snippet.matchAll(amountPattern)).map((m) => parseFrenchAmount(m[1])).filter((v) => v !== null);
    if (values.length) return values[0];
  }
  return null;
}

function isLikelyCompanyLine(line) {
  const normalized = normalizeSearchText(line);
  if (!normalized) return false;
  return /(sarl|sas|sa|eurl|entreprise|metallerie|métallerie|ferronnerie|batiment|bâtiment|construction|industrie|artisan)/i.test(line)
    || /^((\d{1,4}\s+)?(rue|avenue|bd|boulevard|route|zone|zi|zac)\b)/i.test(line)
    || /(tel|tél|telephone|mobile|mail|@)/i.test(line);
}

function guessClientFromLines(lines) {
  const labels = [
    'client',
    'nom du client',
    'client facture',
    'client facturation',
    'raison sociale',
    'destinataire',
    'adresse facturation',
    'adresse de facturation',
    'adresse livraison',
    'facture à',
    'commande pour',
    'devis pour',
  ];

  const labeled = extractLabeledValue(lines, labels);
  if (labeled && !isLikelyCompanyLine(labeled)) return labeled;

  for (const line of lines) {
    const normalized = normalizeOcrLine(line);
    if (!normalized) continue;
    if (/^client\b/i.test(normalized)) {
      const cleaned = normalized.replace(/^client\b[:\-–—]*/i, '').trim();
      if (cleaned && !isLikelyCompanyLine(cleaned)) return cleaned;
    }
  }

  const candidateLines = lines.filter((line) => {
    const normalized = normalizeOcrLine(line);
    if (!normalized) return false;
    if (isLikelyCompanyLine(normalized)) return false;
    if (/^(devis|facture|bon de commande|commande|offre|total|ht|ttc|date|objet|intitul|reference|référence)/i.test(normalized)) return false;
    return /[A-Za-zÀ-ÿ]{2,}/.test(normalized) && normalized.length <= 80;
  });

  return candidateLines[0] || '';
}

function guessTitleFromLines(lines) {
  const titleLabels = [
    'objet',
    'intitule',
    'intitulé',
    'désignation',
    'designation',
    'travaux',
    'prestation',
    'chantier',
  ];

  const labeled = extractLabeledValue(lines, titleLabels);
  if (labeled) return labeled;

  const useful = lines.filter((line) => {
    const normalized = normalizeOcrLine(line);
    if (!normalized) return false;
    if (/^(devis|client|facture|adresse|date|page|référence|reference|tel|tél|siret|sas|sarl|montant|total)/i.test(normalized)) return false;
    return /[A-Za-zÀ-ÿ]{3,}/.test(normalized);
  });

  return useful.find((line) => /(escalier|portail|garde-corps|garde corps|cloture|clôture|pergola|verriere|vérrière|terrasse|rampe|main courante)/i.test(line)) || useful[0] || '';
}

function extractGenericQuoteFields(text, parsedEbp) {
  if (parsedEbp.recognized) {
    return parsedEbp;
  }

  const raw = String(text || '');
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const clientName = guessClientFromLines(lines);

  let quoteNumber = '';
  const quotePatterns = [
    /devis\s*(?:n[°o]|numero|num|ref(?:erence)?|réf(?:érence)?)?\s*[:#\-–—]?\s*([A-Z0-9][A-Z0-9\-\/_]*)/i,
    /(?:ref(?:erence)?|réf(?:érence)?)\s*devis\s*[:#\-–—]?\s*([A-Z0-9][A-Z0-9\-\/_]*)/i,
  ];
  for (const pattern of quotePatterns) {
    const match = raw.match(pattern);
    if (match) {
      quoteNumber = match[1].trim();
      break;
    }
  }

  let quoteDate = '';
  const datePatterns = [
    /(?:date|du)\s*[:\-–—]?\s*(\d{2}[\/\-.]\d{2}[\/\-.]\d{2,4}|\d{4}[\-\/]\d{2}[\-\/]\d{2})/i,
    /(?:édité le|emis le|émis le|date de création)\s*[:\-–—]?\s*(\d{2}[\/\-.]\d{2}[\/\-.]\d{2,4}|\d{4}[\-\/]\d{2}[\-\/]\d{2})/i,
  ];
  for (const pattern of datePatterns) {
    const dateMatch = raw.match(pattern);
    if (!dateMatch) continue;
    const d = dateMatch[1].replace(/\./g, '/');
    const fr = d.match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);
    const iso = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (fr) {
      const year = fr[3].length === 2 ? `20${fr[3]}` : fr[3];
      quoteDate = `${year}-${fr[2]}-${fr[1]}`;
      break;
    }
    if (iso) {
      quoteDate = `${iso[1]}-${iso[2]}-${iso[3]}`;
      break;
    }
  }

  const title = guessTitleFromLines(lines) || '';

  const amountHt = pickBestAmountFromText(raw, ['total ht', 'montant ht', 'sous total ht', 'net ht', 'base ht', 'prix ht'])
    ?? pickAmountWithLabel(raw, ['total\s*ht', 'montant\s*ht', 'sous\s*total\s*ht', 'net\s*ht', 'base\s*ht', '\bht\b']);
  const amountTtc = pickBestAmountFromText(raw, ['total ttc', 'montant ttc', 'net a payer', 'net à payer', 'total general', 'total général'])
    ?? pickAmountWithLabel(raw, ['total\s*ttc', 'montant\s*ttc', 'net\s*a\s*payer', 'net\s*à\s*payer', 'total\s*g[ée]n[ée]ral', '\bttc\b']);

  return {
    recognized: false,
    matched: false,
    reason: parsedEbp.reason || 'Format EBP non reconnu',
    markersFound: parsedEbp.markersFound || [],
    markersMissing: parsedEbp.markersMissing || [],
    inputLength: parsedEbp.inputLength || String(text || '').length,
    primaryTextLength: parsedEbp.primaryTextLength || 0,
    diagnostic: parsedEbp.diagnostic || {
      matched: false,
      reason: parsedEbp.reason || 'Format EBP non reconnu',
      markersFound: parsedEbp.markersFound || [],
      markersMissing: parsedEbp.markersMissing || [],
      inputLength: parsedEbp.inputLength || String(text || '').length,
      primaryTextLength: parsedEbp.primaryTextLength || 0,
    },
    analysisUsed: 'Analyse générique',
    parserName: 'Analyse générique',
    client_name: clientName,
    amount_ht: amountHt,
    amount_ttc: amountTtc,
    quote_number: quoteNumber,
    quote_date: quoteDate,
    title: title,
  };
}

function applyInvoiceFallback(text, parsed) {
  const raw = String(text || '');

  let invoiceNumber = parsed.invoice_number || '';
  if (!invoiceNumber) {
    const match = raw.match(/\b(?:facture|avoir)\s*(?:n[Â°o]|numero|num)?\s*[:#\-â€“â€”]?\s*([A-Z0-9][A-Z0-9\-\/_]*)/i);
    if (match) invoiceNumber = match[1].trim().toUpperCase();
  }

  let invoiceDate = parsed.invoice_date || '';
  if (invoiceDate && /^\d{2}\/\d{2}\/\d{4}$/.test(invoiceDate)) {
    const [day, month, year] = invoiceDate.split('/');
    invoiceDate = `${year}-${month}-${day}`;
  }

  return {
    ...parsed,
    invoice_number: invoiceNumber,
    invoice_date: invoiceDate,
    client_name: parsed.client_name || guessClientFromLines(raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)),
    amount_ht: parsed.amount_ht,
    vat_amount: parsed.vat_amount,
    amount_ttc: parsed.amount_ttc,
  };
}

  return {
    parseFrenchAmount,
    extractGenericQuoteFields,
    applyInvoiceFallback
  };
}

module.exports = { createEbpParserHelpers };
