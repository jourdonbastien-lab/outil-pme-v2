'use strict';

const QUOTE_AI_RULES = Object.freeze({
  greenMarginRate: 30,
  orangeMarginRate: 20,
  hourlyCostDefault: 55,
  totalTolerance: 0.05
});

const RISK_WEIGHT = { green: 1, orange: 2, red: 3 };

function numberOrNull(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonNegative(value) {
  const number = numberOrNull(value);
  return number !== null && number >= 0 ? number : 0;
}

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function normalizedText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr-FR');
}

function quoteText(quote, lines) {
  return normalizedText([
    quote?.title,
    quote?.notes,
    ...(lines || []).flatMap((line) => [line.category, line.label])
  ].filter(Boolean).join(' '));
}

function includesAny(text, words) {
  return words.some((word) => text.includes(normalizedText(word)));
}

function calculateQuoteReview(quote, lines, rules = QUOTE_AI_RULES) {
  const safeLines = Array.isArray(lines) ? lines : [];
  const warnings = [];
  const positivePoints = [];
  const checks = [];
  let riskLevel = 'green';

  const raise = (level) => {
    if (RISK_WEIGHT[level] > RISK_WEIGHT[riskLevel]) riskLevel = level;
  };
  const warn = (level, code, message) => {
    raise(level);
    warnings.push(message);
    checks.push({ level, code, message });
  };
  const positive = (code, message) => {
    positivePoints.push(message);
    checks.push({ level: 'green', code, message });
  };
  const caution = (code, message) => {
    warnings.push(message);
    checks.push({ level: 'orange', code, message, vigilanceOnly: true });
  };

  let totalHT = 0;
  safeLines.forEach((line, index) => {
    const qty = numberOrNull(line.qty);
    const unitPrice = numberOrNull(line.unit_price);
    const storedTotal = numberOrNull(line.total);
    if ((qty !== null && qty < 0) || (unitPrice !== null && unitPrice < 0)) {
      warn('red', 'negative_line', `La ligne ${index + 1} contient une quantité ou un prix négatif.`);
    }
    const calculated = round2((qty || 0) * (unitPrice || 0));
    const effective = storedTotal === null ? calculated : storedTotal;
    totalHT += effective;
    if (storedTotal !== null && Math.abs(calculated - storedTotal) > rules.totalTolerance) {
      warn('red', 'line_total_mismatch', `Le total de la ligne ${index + 1} ne correspond pas à la quantité multipliée par le prix unitaire.`);
    }
  });
  totalHT = round2(totalHT);

  const hourlyCost = numberOrNull(quote.cout_horaire) ?? rules.hourlyCostDefault;
  const hoursStudy = nonNegative(quote.heures_etude);
  const hoursWorkshop = nonNegative(quote.heures_atelier);
  const hoursInstallation = nonNegative(quote.heures_pose);
  const hoursTransport = nonNegative(quote.heures_transport);
  const hoursSav = nonNegative(quote.heures_sav);
  const totalHours = round2(hoursStudy + hoursWorkshop + hoursInstallation + hoursTransport + hoursSav);
  const laborCost = round2(totalHours * hourlyCost);

  const breakdown = {
    material: nonNegative(quote.cout_matiere),
    laserCutting: nonNegative(quote.cout_decoupe_laser),
    subcontracting: nonNegative(quote.cout_sous_traitance),
    galvanizing: nonNegative(quote.cout_galvanisation),
    powderCoating: nonNegative(quote.cout_thermolaquage),
    motorization: nonNegative(quote.cout_motorisation),
    accessories: nonNegative(quote.cout_accessoires),
    transport: nonNegative(quote.cout_transport),
    consumables: nonNegative(quote.cout_consommables),
    rental: nonNegative(quote.cout_locations),
    other: nonNegative(quote.autres_couts),
    labor: laborCost
  };
  const detailedCost = round2(Object.values(breakdown).reduce((sum, value) => sum + value, 0));
  const existingCost = numberOrNull(quote.cout_revient);
  const costPrice = existingCost !== null && existingCost > 0 ? round2(existingCost) : detailedCost;
  const costSource = existingCost !== null && existingCost > 0 ? 'existing' : (detailedCost > 0 ? 'breakdown' : 'missing');
  const marginAmount = costPrice > 0 ? round2(totalHT - costPrice) : null;
  const marginOnCost = costPrice > 0 ? round2((marginAmount / costPrice) * 100) : null;
  const marginOnSale = totalHT > 0 && marginAmount !== null ? round2((marginAmount / totalHT) * 100) : null;
  const vatRate = numberOrNull(quote.vat_rate) ?? 20;
  const vatAmount = round2(totalHT * vatRate / 100);
  const totalTTC = round2(totalHT + vatAmount);

  if (!safeLines.length) warn('red', 'no_lines', 'Le devis ne contient aucune ligne chiffrée.');
  if (costSource === 'missing') warnings.push('Le chiffrage des coûts directs et de la main-d’œuvre n’est pas encore renseigné.');
  else positive('cost_price_present', 'Le coût de revient est renseigné.');

  if (marginOnSale !== null) {
    if (marginOnSale < rules.orangeMarginRate) warn('red', 'low_margin', `La marge sur prix de vente est de ${marginOnSale.toFixed(2)} %, sous le seuil de ${rules.orangeMarginRate} %.`);
    else if (marginOnSale < rules.greenMarginRate) warn('orange', 'medium_margin', `La marge sur prix de vente est de ${marginOnSale.toFixed(2)} %, entre ${rules.orangeMarginRate} et ${rules.greenMarginRate} %.`);
    else positive('healthy_margin', `La marge sur prix de vente est de ${marginOnSale.toFixed(2)} %, au-dessus du seuil de ${rules.greenMarginRate} %.`);
  }
  if (costPrice > totalHT && totalHT > 0) warn('red', 'cost_above_sale', 'Le coût de revient est supérieur au prix HT du devis.');

  const text = quoteText(quote, safeLines);
  const hasExteriorWork = includesAny(text, ['clôture', 'garde-corps', 'portail', 'portillon', 'pergola']);
  const mentionsMotorization = includesAny(text, ['portail motorisé', 'portail coulissant motorisé', 'motorisation']);
  const mentionsGalvanizing = includesAny(text, ['galvanisation', 'galvanisé', 'galva']);
  const mentionsPowderCoating = includesAny(text, ['thermolaquage', 'laquage', 'peinture poudre']);
  const isMetalWork = includesAny(text, ['clôture', 'garde-corps', 'portail', 'portillon', 'pergola', 'escalier', 'verrière']);

  if (mentionsMotorization) {
    if (!breakdown.motorization) warn('red', 'missing_motorization_cost', 'Une motorisation est mentionnée mais aucun coût de motorisation n’est renseigné.');
    if (!breakdown.accessories) warn('orange', 'motorization_accessories', 'La motorisation est mentionnée sans coût d’accessoires : vérifier la crémaillère, les cellules, le feu clignotant, les télécommandes et le câblage.');
  }
  if (mentionsGalvanizing) {
    if (!breakdown.galvanizing) warn('red', 'missing_galvanizing_cost', 'La galvanisation est mentionnée mais son coût est nul ou absent.');
    if (!breakdown.transport) warn('orange', 'galvanizing_transport', 'Vérifier que le transport aller-retour pour la galvanisation est inclus.');
    warn('orange', 'galvanizing_preparation', 'Vérifier la préparation, les perçages ou évents et les retouches après pose.');
  }
  if (mentionsPowderCoating) {
    if (!breakdown.powderCoating) warn('orange', 'missing_powder_cost', 'Vérifier le coût du thermolaquage ou de la peinture poudre.');
    if (!breakdown.transport) warn('orange', 'powder_transport', 'Vérifier le transport lié au thermolaquage.');
    warn('orange', 'powder_details', 'Vérifier la teinte RAL, la finition et les retouches éventuelles.');
  }
  if (breakdown.subcontracting > 0 && breakdown.transport <= 0) warn('orange', 'subcontracting_transport', 'Une sous-traitance est chiffrée sans transport associé.');
  if (isMetalWork) {
    caution('metalwork_scope', 'Vérifier la prise de cotes, l’étude, la fabrication, la finition, le transport, la pose, les fixations, les consommables, la manutention et les locations éventuelles.');
    if (!totalHours) warnings.push('La main-d’œuvre n’est pas encore chiffrée.');
    if (totalHours > 0 && totalHours < 4) warn('orange', 'very_low_hours', 'Le nombre total d’heures prévues paraît très faible pour un ouvrage de métallerie.');
    if (!hoursInstallation && includesAny(text, ['pose', 'installation'])) {
      warn('orange', 'missing_installation_hours', 'La pose semble prévue dans le devis mais aucune heure de pose n’est renseignée.');
    }
    if (!breakdown.transport) {
      if (costSource === 'breakdown') warn('orange', 'missing_transport', 'Vérifier que le transport est chiffré.');
      else caution('missing_transport', 'Vérifier que le transport est chiffré.');
    }
    if (costSource === 'breakdown' && !breakdown.consumables) warn('orange', 'missing_consumables', 'Vérifier que les consommables de fabrication et de pose sont chiffrés.');
    if (hasExteriorWork && !mentionsGalvanizing && !mentionsPowderCoating) warn('orange', 'exterior_finish', 'Vérifier le traitement de finition prévu pour cet ouvrage extérieur.');
  }

  const recommendation = riskLevel === 'red'
    ? 'Le devis présente un risque important. Corriger ou confirmer les alertes rouges avant envoi.'
    : riskLevel === 'orange'
      ? 'Le devis doit être vérifié avant envoi, notamment sur les postes et hypothèses signalés.'
      : 'Le devis semble cohérent et présente une marge satisfaisante, sous réserve de la validation finale.';

  return {
    riskLevel,
    summary: { totalHT, vatRate, vatAmount, totalTTC, costPrice, costSource, laborCost, totalHours, hourlyCost, marginAmount, marginOnCost, marginOnSale, breakdown },
    warnings: Array.from(new Set(warnings)),
    positivePoints: Array.from(new Set(positivePoints)),
    recommendation,
    checks
  };
}

function calculateAutomaticLineReview(analysis, quote = {}, lines = []) {
  const warnings = [];
  const positivePoints = [];
  const checks = [];
  const warn = (level, code, message) => { warnings.push(message); checks.push({ level, code, message }); };
  for (const line of analysis?.lines || []) {
    if (line.saleHT <= 0) warn('red', 'zero_sale', `${line.label || 'Une ligne'} possède un prix de vente nul.`);
    if (line.cost === null && line.saleHT > 0) warn(line.significant ? 'red' : 'orange', 'line_without_cost', `${line.label || 'Une ligne'} est vendue sans coût détectable.`);
    if (['matière acier', 'inox', 'aluminium', 'bois'].includes(line.category) && line.cost === null) warn('red', 'material_without_cost', `${line.label || 'Une matière'} ne possède aucun coût d’achat.`);
    if (line.category.startsWith('main-d’œuvre') && line.cost === null) warn('red', 'labor_without_internal_cost', `${line.label || 'Une ligne de main-d’œuvre'} est vendue sans heures ni coût interne identifiable.`);
    if (line.status === 'loss') warn('red', 'line_loss', `${line.label || 'Une ligne'} possède un coût supérieur à son prix de vente.`);
    const source = (lines || []).find((candidate) => Number(candidate.id) === Number(line.id));
    if (source && Math.abs(Number(source.total || 0) - Number(source.qty || 0) * Number(source.unit_price || 0)) > QUOTE_AI_RULES.totalTolerance) {
      warn('red', 'line_total_mismatch', `${line.label || 'Une ligne'} possède un total incohérent avec sa quantité et son prix unitaire.`);
    }
    if (source && (Number(source.qty) <= 0 || Number(source.unit_price) < 0)) warn('red', 'invalid_quantity_or_price', `${line.label || 'Une ligne'} possède une quantité ou un prix incohérent.`);
    const coefficient = Number(source?.cost_unit) > 0 ? Number(source.unit_price || 0) / Number(source.cost_unit) : null;
    if (coefficient !== null && coefficient > 0 && coefficient < 1.15) warn('orange', 'low_coefficient', `${line.label || 'Une ligne'} utilise un coefficient de vente inférieur à 1,15.`);
  }
  const text = quoteText(quote, lines);
  const hasCategory = (category) => (analysis?.lines || []).some((line) => line.category === category);
  if (includesAny(text, ['pose', 'installation']) && !hasCategory('main-d’œuvre pose')) warn('orange', 'possible_missing_pose', 'La pose est mentionnée mais aucune ligne de pose identifiable n’est présente.');
  if (includesAny(text, ['thermolaqu', 'peinture poudre']) && !hasCategory('thermolaquage')) warn('orange', 'possible_missing_powder', 'Un thermolaquage semble prévu mais aucune ligne correspondante n’est identifiable.');
  if (includesAny(text, ['galvan']) && !hasCategory('galvanisation')) warn('orange', 'possible_missing_galvanizing', 'Une galvanisation semble prévue mais aucune ligne correspondante n’est identifiable.');
  if (includesAny(text, ['motoris', 'portail automatique']) && !hasCategory('motorisation')) warn('red', 'possible_missing_motorization', 'Une motorisation semble prévue mais aucune ligne correspondante n’est identifiable.');
  if (includesAny(text, ['vitrage', 'verre', 'verrière']) && !hasCategory('vitrage')) warn('orange', 'possible_missing_glass', 'Du vitrage semble prévu mais aucune ligne correspondante n’est identifiable.');
  if (includesAny(text, ['motoris']) && !hasCategory('accessoires')) warn('orange', 'possible_missing_accessories', 'Vérifier les accessoires de motorisation : cellules, feu, télécommandes et crémaillère.');
  if (!warnings.length) positivePoints.push('Toutes les lignes vendues possèdent un coût identifiable et aucun contrôle déterministe bloquant n’a été relevé.');
  const riskLevel = analysis?.status || 'incomplete';
  const reliabilityLabel = { complete: 'Complet', partial: 'Partiel', incomplete: 'Incomplet' }[analysis?.reliability] || 'Incomplet';
  return {
    riskLevel,
    summary: { totalHT: analysis?.totalHT, costPrice: analysis?.margin === null ? null : analysis?.totalCost,
      marginAmount: analysis?.margin, marginOnCost: analysis?.marginOnCost, marginOnSale: analysis?.marginOnSale,
      reliability: analysis?.reliability, reliabilityLabel, counts: analysis?.counts, missingSaleHT: analysis?.missingSaleHT,
      materialCost: analysis?.materialCost, subcontractingCost: analysis?.subcontractingCost, laborCost: analysis?.laborCost,
      otherDetectedCost: analysis?.otherDetectedCost, detectedCost: analysis?.detectedCost, adjustmentsCost: analysis?.adjustmentsCost,
      breakdown: analysis?.categoryCosts, minimumPrice: analysis?.minimumPrice, targetPrice: analysis?.targetPrice,
      comfortablePrice: analysis?.comfortablePrice },
    warnings: Array.from(new Set(warnings)), positivePoints, checks,
    recommendation: riskLevel === 'incomplete' ? 'Compléter les coûts manquants dans les lignes du devis avant de valider la rentabilité.'
      : riskLevel === 'red' ? 'Corriger les lignes déficitaires avant envoi.'
        : riskLevel === 'orange' ? 'Vérifier les points signalés avant envoi.' : 'Le chiffrage des lignes est complet et la marge prévisionnelle est satisfaisante.'
  };
}

function sanitizeAiReview(value, fallbackRisk) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const aiRisk = ['green', 'orange', 'red'].includes(source.riskLevel) ? source.riskLevel : fallbackRisk;
  const riskLevel = RISK_WEIGHT[aiRisk] > RISK_WEIGHT[fallbackRisk] ? aiRisk : fallbackRisk;
  const cleanList = (list) => (Array.isArray(list) ? list : []).map((item) => String(item || '').trim()).filter(Boolean).slice(0, 30);
  return {
    riskLevel,
    warnings: cleanList(source.warnings),
    positivePoints: cleanList(source.positivePoints),
    recommendation: String(source.recommendation || '').trim().slice(0, 2000)
  };
}

function extractResponseText(response) {
  if (typeof response?.output_text === 'string') return response.output_text;
  for (const item of response?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') return content.text;
    }
  }
  return '';
}

async function requestOpenAiInterpretation({ apiKey, model, safePayload, deterministicRisk, fetchImpl = globalThis.fetch }) {
  if (!String(apiKey || '').trim()) return { used: false, message: 'Analyse automatique effectuée sans interprétation IA.' };
  if (typeof fetchImpl !== 'function') throw new Error('Client HTTP indisponible');
  const systemPrompt = [
    'Tu es un contrôleur de devis spécialisé en métallerie, serrurerie et ouvrages métalliques sur mesure.',
    'Tu analyses sans modifier les prix et sans inventer de coûts.',
    'Les calculs financiers fournis par l’application sont fiables.',
    'Distingue les faits certains des points à vérifier et ne présente jamais une supposition comme une certitude.',
    'Réponds exclusivement en JSON valide avec les clés riskLevel, warnings, positivePoints et recommendation.'
  ].join(' ');
  const response = await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${String(apiKey).trim()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      input: [
        { role: 'system', content: [{ type: 'input_text', text: systemPrompt }] },
        { role: 'user', content: [{ type: 'input_text', text: JSON.stringify(safePayload) }] }
      ]
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}: ${String(payload?.error?.message || 'erreur API').slice(0, 300)}`);
  const cleaned = extractResponseText(payload).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(cleaned);
  return { used: true, review: sanitizeAiReview(parsed, deterministicRisk), message: 'Interprétation IA effectuée.' };
}

module.exports = { QUOTE_AI_RULES, calculateQuoteReview, calculateAutomaticLineReview, sanitizeAiReview, extractResponseText, requestOpenAiInterpretation };
