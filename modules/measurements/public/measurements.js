const STORAGE_KEY = 'outil-pme.escalier.measurements';
(function () {
  const form = document.getElementById('measurementForm');
  const photoInput = document.getElementById('photoInput');
  const photoGallery = document.getElementById('photoGallery');
  const saveBtn = document.getElementById('saveBtn');
  const loadBtn = document.getElementById('loadBtn');
  const resetBtn = document.getElementById('resetBtn');
  const printBtn = document.getElementById('printBtn');
  const proposalBtn = document.getElementById('proposalBtn');
  const proposalResult = document.getElementById('proposalResult');
  const configuratorFields = Array.from(document.querySelectorAll('[data-sync-field]'));
  const configType = document.getElementById('configType');
  const configComfort = document.getElementById('configComfort');
  const saveStatus = document.getElementById('saveStatus');
  const recordNameField = document.getElementById('recordName');
  const photoTemplate = document.getElementById('photoItemTemplate');
  const sideViewSvg = document.getElementById('sideViewSvg');
  const topViewSvg = document.getElementById('topViewSvg');
  const tremieGroups = Array.from(document.querySelectorAll('[data-tremie-group]'));

  let photos = [];
  let currentRecordName = '';
  let currentServerId = null;
  let activeMeasure = '';
  let svgMarkerPrefix = 'plan';
  let currentSolutions = [];
  let currentSelectedSolution = null;

  function setDefaultValues() {
    const dateField = form.elements.date;
    if (dateField && !dateField.value) {
      dateField.value = new Date().toISOString().slice(0, 10);
    }
    const directionField = form.elements.sensMontee;
    if (directionField && !directionField.value) {
      directionField.value = 'Droite';
    }
  }

  function getSelectedStairType() {
    const selected = getCheckboxValues('typeEscalier');
    if (selected.includes('Deux quarts tournants')) return 'double-quarter';
    if (selected.includes('Quart tournant')) return 'quarter';
    return 'straight';
  }

  function getTremieType() {
    const tremieTypeField = form.elements.tremieType;
    return tremieTypeField ? tremieTypeField.value : 'rectangle';
  }

  function getStairDirection() {
    const directionField = form.elements.sensMontee;
    return directionField && directionField.value === 'Gauche' ? 'Gauche' : 'Droite';
  }

  function syncConfiguratorFromForm() {
    configuratorFields.forEach((field) => {
      const linkedName = field.dataset.syncField;
      const linked = field.id === 'configTremieLongueur' && getTremieType() === 'l'
        ? form.elements.tremieLGrandeLongueur
        : field.id === 'configTremieLargeur' && getTremieType() === 'l'
          ? form.elements.tremieLGrandeLargeur
          : form.elements[linkedName];
      if (linked) field.value = linked.value || '';
    });
  }

  function syncFormFromConfigurator(field) {
    const linkedName = field.dataset.syncField;
    const linked = form.elements[linkedName];
    if (!linked) return;
    linked.value = field.value;
    if (field.id === 'configTremieLongueur' && form.elements.tremieLGrandeLongueur) {
      form.elements.tremieLGrandeLongueur.value = field.value;
    }
    if (field.id === 'configTremieLargeur' && form.elements.tremieLGrandeLargeur) {
      form.elements.tremieLGrandeLargeur.value = field.value;
    }
    linked.dispatchEvent(new Event('input', { bubbles: true }));
    linked.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function syncTremieGroups() {
    const tremieType = getTremieType();
    tremieGroups.forEach((group) => {
      group.hidden = group.dataset.tremieGroup !== tremieType;
    });
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function isActive(keys) {
    return [].concat(keys || []).includes(activeMeasure);
  }

  function readMeasure(name, fallback) {
    const field = form.elements[name];
    const rawValue = field ? String(field.value || '').replace(',', '.').trim() : '';
    const numeric = Number(rawValue);
    const hasValue = rawValue !== '' && Number.isFinite(numeric) && numeric > 0;
    return {
      value: hasValue ? numeric : null,
      geom: hasValue ? numeric : fallback
    };
  }

  function formatMeasure(measure, suffix = 'mm') {
    if (!measure || measure.value === null) return '—';
    const rounded = Math.round(measure.value * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded.toFixed(0) : String(rounded).replace('.', ',')} ${suffix}`;
  }

  function escSvgText(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function mirrorPlanForDirection(content, values, drawingWidth) {
    if (values.direction !== 'Gauche') return content;
    return `<g transform="translate(${drawingWidth} 0) scale(-1 1)">${content}</g>`;
  }

  function mirrorRectX(x, width, values, drawingWidth) {
    return values.direction === 'Gauche' ? drawingWidth - x - width : x;
  }

  function getTremieSize(values) {
    if (values.tremieType === 'l') {
      return {
        length: values.tremieLGrandeLongueur.geom,
        width: values.tremieLGrandeLargeur.geom,
        returnLength: values.tremieLRetourLongueur.geom,
        returnWidth: values.tremieLRetourLargeur.geom
      };
    }
    return {
      length: values.tremieLongueur.geom,
      width: values.tremieLargeur.geom,
      returnLength: 0,
      returnWidth: 0
    };
  }

  function createPlanScale(values, options = {}) {
    const availableWidth = options.availableWidth || 520;
    const availableHeight = options.availableHeight || 310;
    const tremie = getTremieSize(values);
    const planLength = Math.max(values.longueur.geom, values.reculement.geom, tremie.length, 1);
    const planWidth = Math.max(values.largeur.geom, tremie.width, 1);
    const pxPerMm = Math.min(availableWidth / planLength, availableHeight / planWidth);
    return {
      pxPerMm,
      mmToPx: (mm) => mm * pxPerMm,
      planLength,
      planWidth,
      tremie
    };
  }

  function roundTo(value, precision = 1) {
    const factor = 10 ** precision;
    return Math.round(value * factor) / factor;
  }

  function getTypeLabel(type) {
    if (type === 'quarter') return '1/4 tournant';
    if (type === 'double-quarter') return '2/4 tournants';
    return 'Droit';
  }

  function getDesiredTypes() {
    const requested = configType ? configType.value : 'auto';
    if (requested === 'straight') return ['straight'];
    if (requested === 'quarter') return ['quarter'];
    if (requested === 'double-quarter') return ['double-quarter'];
    return ['straight', 'quarter', 'double-quarter'];
  }

  function getComfortProfile() {
    const mode = configComfort ? configComfort.value : 'standard';
    if (mode === 'comfort') {
      return { targetRiser: 175, targetGoing: 270, targetBlondel: 620, minGoing: 250, maxGoing: 300, label: 'Confort' };
    }
    if (mode === 'compact') {
      return { targetRiser: 188, targetGoing: 240, targetBlondel: 615, minGoing: 220, maxGoing: 265, label: 'Gain de place' };
    }
    return { targetRiser: 180, targetGoing: 260, targetBlondel: 620, minGoing: 235, maxGoing: 285, label: 'Standard' };
  }

  function getConfiguratorValue(id, fallbackName) {
    const field = document.getElementById(id);
    const rawValue = field && field.value ? String(field.value).replace(',', '.').trim() : '';
    const numeric = Number(rawValue);
    if (rawValue !== '' && Number.isFinite(numeric) && numeric > 0) return numeric;
    const fallback = fallbackName ? readMeasure(fallbackName, 0).value : null;
    return fallback || null;
  }

  function getConfiguratorInputs() {
    const preview = currentSelectedSolution;
    currentSelectedSolution = null;
    const values = getPlanValues();
    currentSelectedSolution = preview;
    return {
      values,
      height: getConfiguratorValue('configHauteur', 'hauteur') || values.hauteur.value,
      width: getConfiguratorValue('configLargeur', 'largeur') || values.largeur.value || values.largeur.geom,
      tremieLength: getConfiguratorValue('configTremieLongueur', values.tremieType === 'l' ? 'tremieLGrandeLongueur' : 'tremieLongueur') || getTremieSize(values).length,
      tremieWidth: getConfiguratorValue('configTremieLargeur', values.tremieType === 'l' ? 'tremieLGrandeLargeur' : 'tremieLargeur') || getTremieSize(values).width,
      direction: values.direction,
      desiredTypes: getDesiredTypes(),
      comfort: getComfortProfile(),
      echappee: values.echappee.value
    };
  }

  function getStairFootprint(type, run, width, steps) {
    if (type === 'straight') {
      return {
        length: run,
        reculement: run,
        turns: 0,
        distribution: `${steps} marches en volée droite`
      };
    }
    if (type === 'quarter') {
      const turnSteps = clamp(Math.round(steps * 0.24), 3, 5);
      const firstFlight = Math.max(2, Math.floor((steps - turnSteps) * 0.55));
      const secondFlight = Math.max(2, steps - turnSteps - firstFlight);
      return {
        length: Math.max(width * 1.9, run * 0.62),
        reculement: Math.max(width * 1.35, run * 0.46),
        turns: 1,
        distribution: `${firstFlight} + ${turnSteps} balancées + ${secondFlight}`
      };
    }
    const turnSteps = clamp(Math.round(steps * 0.18), 3, 5);
    const middleFlight = Math.max(2, Math.round(steps * 0.28));
    const endFlights = Math.max(2, Math.floor((steps - middleFlight - turnSteps * 2) / 2));
    return {
      length: Math.max(width * 2.15, run * 0.52),
      reculement: Math.max(width * 2.05, run * 0.56),
      turns: 2,
      distribution: `${endFlights} + ${turnSteps} balancées + ${middleFlight} + ${turnSteps} balancées + ${endFlights}`
    };
  }

  function scoreStairSolution(solution) {
    const profile = solution.profile;
    const heightPenalty = Math.abs(solution.riser - profile.targetRiser) * 1.15;
    const goingPenalty = Math.abs(solution.going - profile.targetGoing) * 1.05;
    const blondelPenalty = Math.abs(solution.blondel - profile.targetBlondel) * 0.9;
    const slopePenalty = solution.slope < 30
      ? (30 - solution.slope) * 7
      : solution.slope > 40
        ? (solution.slope - 40) * 7
        : 0;
    const fitPenalty = solution.fitsTremie ? 0 : 160 + solution.overflow * 0.08;
    const headroomPenalty = solution.headroomStatus === 'À vérifier' ? 35 : 0;
    const typePenalty = solution.type === 'straight' ? 0 : solution.type === 'quarter' ? 12 : 24;
    const compactBonus = solution.profile.label === 'Gain de place' ? -Math.min(35, solution.compactness * 0.015) : 0;
    return heightPenalty + goingPenalty + blondelPenalty + slopePenalty + fitPenalty + headroomPenalty + typePenalty + compactBonus;
  }

  function classifyStairSolution(solution, index) {
    if (index === 0 && solution.fitsTremie && solution.comfortScore >= 70) return 'Recommandé';
    if (solution.fitsTremie && solution.comfortScore >= 55) return 'Possible';
    if (solution.fitsTremie || solution.comfortScore >= 35) return 'Serré';
    return 'Déconseillé';
  }

  function buildSolutionExplanation(solution) {
    if (!solution.fitsTremie) {
      return `Encombrement supérieur à la trémie disponible de ${Math.round(solution.overflow)} mm environ.`;
    }
    if (solution.status === 'Recommandé') {
      return `Bon compromis Blondel, pente et encombrement dans la trémie. Répartition : ${solution.distribution}.`;
    }
    if (solution.status === 'Serré') {
      return `Solution compacte à vérifier sur chantier, surtout échappée et confort. Répartition : ${solution.distribution}.`;
    }
    return `Solution exploitable dans les dimensions saisies. Répartition : ${solution.distribution}.`;
  }

  function generateStairSolutions() {
    const inputs = getConfiguratorInputs();
    if (!inputs.height) {
      return { error: 'Renseignez au minimum la hauteur sol à sol pour générer les solutions.' };
    }

    const candidates = [];
    const goingCandidates = [];
    for (let going = inputs.comfort.minGoing; going <= inputs.comfort.maxGoing; going += 5) {
      goingCandidates.push(going);
    }

    for (let steps = 8; steps <= 22; steps += 1) {
      const riser = inputs.height / steps;
      if (riser < 145 || riser > 220) continue;

      goingCandidates.forEach((going) => {
        const blondel = 2 * riser + going;
        if (blondel < 560 || blondel > 680) return;
        const run = going * steps;
        const slope = Math.atan(inputs.height / Math.max(run, 1)) * 180 / Math.PI;

        inputs.desiredTypes.forEach((type) => {
          const footprint = getStairFootprint(type, run, inputs.width, steps);
          const overflowLength = Math.max(0, footprint.length - inputs.tremieLength);
          const overflowWidth = Math.max(0, Math.max(footprint.reculement, inputs.width) - inputs.tremieWidth);
          const overflow = overflowLength + overflowWidth;
          const fitsTremie = overflow === 0;
          const headroomStatus = inputs.echappee && inputs.echappee < 1900 ? 'À vérifier' : 'OK';
          const compactness = Math.max(0, inputs.tremieLength * inputs.tremieWidth - footprint.length * Math.max(inputs.width, footprint.reculement));
          const solution = {
            id: `solution-${candidates.length}`,
            type,
            typeLabel: getTypeLabel(type),
            direction: inputs.direction,
            steps,
            riser,
            going,
            blondel,
            run,
            slope,
            footprintLength: footprint.length,
            footprintReculement: footprint.reculement,
            width: inputs.width,
            tremieLength: inputs.tremieLength,
            tremieWidth: inputs.tremieWidth,
            fitsTremie,
            overflow,
            overflowLength,
            overflowWidth,
            headroomStatus,
            compactness,
            distribution: footprint.distribution,
            profile: inputs.comfort
          };
          solution.score = scoreStairSolution(solution);
          candidates.push(solution);
        });
      });
    }

    if (!candidates.length) {
      return { error: 'Aucune solution cohérente trouvée. Vérifiez la hauteur ou élargissez les plages de dimensions.' };
    }

    const unique = [];
    const seen = new Set();
    candidates
      .sort((a, b) => a.score - b.score)
      .forEach((solution) => {
        const key = `${solution.type}-${solution.steps}-${Math.round(solution.going)}`;
        if (seen.has(key)) return;
        seen.add(key);
        unique.push(solution);
      });

    const solutions = unique.slice(0, 8).map((solution, index) => {
      const normalized = Object.assign({}, solution, {
        rawScore: solution.score,
        comfortScore: Math.max(0, Math.round(100 - solution.score / 2)),
        riser: roundTo(solution.riser, 1),
        going: roundTo(solution.going, 1),
        blondel: roundTo(solution.blondel, 1),
        slope: roundTo(solution.slope, 1),
        footprintLength: Math.round(solution.footprintLength),
        footprintReculement: Math.round(solution.footprintReculement),
        width: Math.round(solution.width),
        tremieLength: Math.round(solution.tremieLength),
        tremieWidth: Math.round(solution.tremieWidth)
      });
      normalized.status = classifyStairSolution(normalized, index);
      normalized.explanation = buildSolutionExplanation(normalized);
      return normalized;
    });

    return { solutions };
  }

  function renderSolutionCard(solution, index) {
    const statusClass = solution.status === 'Recommandé'
      ? 'recommended'
      : solution.status === 'Possible'
        ? 'possible'
        : solution.status === 'Serré'
          ? 'tight'
          : 'discouraged';
    const title = index === 0 ? 'Solution recommandée' : 'Solution alternative';
    return `<article class="solution-card ${statusClass}" data-solution-id="${solution.id}">
      <div class="solution-card-head">
        <div>
          <span class="solution-label">${title}</span>
          <h5>${escSvgText(solution.typeLabel)} - ${escSvgText(solution.direction)}</h5>
        </div>
        <span class="solution-status">${escSvgText(solution.status)}</span>
      </div>
      <div class="solution-metrics">
        <span><b>${solution.steps}</b> marches</span>
        <span><b>${solution.riser}</b> mm h.</span>
        <span><b>${solution.going}</b> mm giron</span>
        <span><b>${solution.slope}</b>° pente</span>
        <span><b>${solution.footprintReculement}</b> mm rec.</span>
        <span><b>${solution.footprintLength}</b> mm long.</span>
        <span><b>${solution.comfortScore}</b>/100 confort</span>
        <span><b>${solution.width}</b> mm largeur</span>
      </div>
      <p>${escSvgText(solution.explanation)}</p>
      <div class="solution-actions">
        <button type="button" data-apply-solution="${solution.id}" class="primary">Appliquer cette solution</button>
        <button type="button" data-view-solution="${solution.id}">Voir le plan</button>
      </div>
    </article>`;
  }

  function renderStairSolutions(result) {
    if (!proposalResult) return;
    if (result.error) {
      proposalResult.textContent = result.error;
      currentSolutions = [];
      currentSelectedSolution = null;
      return;
    }
    currentSolutions = result.solutions;
    currentSelectedSolution = currentSolutions[0] || null;
    proposalResult.innerHTML = `
      <div class="solutions-layout">
        ${currentSolutions.map(renderSolutionCard).join('')}
      </div>
      <p class="proposal-note">Pré-dimensionnement indicatif à valider selon contraintes chantier et normes applicables.</p>
    `;
    renderPlans();
  }

  function setStairTypeFromProposal(type) {
    const labelsByType = {
      straight: 'Droit',
      quarter: 'Quart tournant',
      'double-quarter': 'Deux quarts tournants'
    };
    const selectedLabel = labelsByType[type] || 'Droit';
    form.querySelectorAll('input[name="typeEscalier"]').forEach((input) => {
      input.checked = input.value === selectedLabel;
    });
  }

  function applyStairSolution(solution) {
    if (!solution) return;
    setStairTypeFromProposal(solution.type);
    if (form.elements.sensMontee) form.elements.sensMontee.value = solution.direction;
    if (form.elements.marchesNombre) form.elements.marchesNombre.value = solution.steps;
    if (form.elements.largeur) form.elements.largeur.value = solution.width;
    if (form.elements.reculement) form.elements.reculement.value = solution.footprintReculement;
    if (form.elements.longueur) form.elements.longueur.value = solution.footprintLength;
    if (form.elements.hauteurMarche) form.elements.hauteurMarche.value = solution.riser;
    if (form.elements.giron) form.elements.giron.value = solution.going;
    if (form.elements.pente) form.elements.pente.value = solution.slope;
    if (form.elements.tremieLongueur && solution.tremieLength) form.elements.tremieLongueur.value = solution.tremieLength;
    if (form.elements.tremieLargeur && solution.tremieWidth) form.elements.tremieLargeur.value = solution.tremieWidth;
    if (form.elements.tremieLGrandeLongueur && solution.tremieLength) form.elements.tremieLGrandeLongueur.value = solution.tremieLength;
    if (form.elements.tremieLGrandeLargeur && solution.tremieWidth) form.elements.tremieLGrandeLargeur.value = solution.tremieWidth;
    syncConfiguratorFromForm();
    renderSelectedStairPlan(solution);
  }

  function renderSelectedStairPlan(solution) {
    currentSelectedSolution = solution || currentSelectedSolution;
    renderPlans();
  }

  function getPlanValues() {
    const hauteur = readMeasure('hauteur', 2800);
    const longueur = readMeasure('longueur', 3200);
    const largeur = readMeasure('largeur', 900);
    const tremie = readMeasure('tremie', 1200);
    const reculement = readMeasure('reculement', longueur.geom);
    const echappee = readMeasure('echappee', 2000);
    const marchesNombre = readMeasure('marchesNombre', Math.max(10, Math.round(hauteur.geom / 175)));
    const marchesGeom = clamp(Math.round(marchesNombre.geom), 3, 22);
    const savedGiron = readMeasure('giron', longueur.geom / Math.max(1, marchesGeom));
    const savedHauteurMarche = readMeasure('hauteurMarche', hauteur.geom / Math.max(1, marchesGeom));
    const savedPente = readMeasure('pente', 0);
    const computedGiron = longueur.value !== null && marchesNombre.value !== null
      ? longueur.value / Math.max(1, marchesNombre.value)
      : longueur.geom / Math.max(1, marchesGeom);
    const computedHauteurMarche = hauteur.value !== null && marchesNombre.value !== null
      ? hauteur.value / Math.max(1, marchesNombre.value)
      : hauteur.geom / Math.max(1, marchesGeom);
    const giron = savedGiron.value !== null
      ? savedGiron
      : { value: longueur.value !== null && marchesNombre.value !== null ? computedGiron : null, geom: computedGiron };
    const hauteurMarche = savedHauteurMarche.value !== null
      ? savedHauteurMarche
      : { value: hauteur.value !== null && marchesNombre.value !== null ? computedHauteurMarche : null, geom: computedHauteurMarche };
    const planValues = {
      stairType: getSelectedStairType(),
      stairTypeLabel: getSelectedStairType() === 'double-quarter'
        ? 'Deux quarts tournants'
        : getSelectedStairType() === 'quarter'
          ? 'Quart tournant'
          : 'Droit',
      direction: getStairDirection(),
      tremieType: getTremieType(),
      client: form.elements.client ? form.elements.client.value.trim() : '',
      chantier: form.elements.chantier ? form.elements.chantier.value.trim() : '',
      date: form.elements.date ? form.elements.date.value : '',
      hauteur,
      longueur,
      largeur,
      tremie,
      reculement,
      echappee,
      marchesNombre,
      marchesGeom,
      giron,
      hauteurMarche,
      pente: savedPente,
      tremieLongueur: readMeasure('tremieLongueur', tremie.geom),
      tremieLargeur: readMeasure('tremieLargeur', Math.max(900, Math.round(tremie.geom * 0.72))),
      tremieLGrandeLongueur: readMeasure('tremieLGrandeLongueur', tremie.geom),
      tremieLGrandeLargeur: readMeasure('tremieLGrandeLargeur', Math.max(950, Math.round(tremie.geom * 0.78))),
      tremieLRetourLongueur: readMeasure('tremieLRetourLongueur', Math.max(700, Math.round(tremie.geom * 0.46))),
      tremieLRetourLargeur: readMeasure('tremieLRetourLargeur', Math.max(700, Math.round(tremie.geom * 0.46)))
    };

    if (currentSelectedSolution) {
      const measure = (value) => ({ value, geom: value });
      planValues.stairType = currentSelectedSolution.type;
      planValues.stairTypeLabel = currentSelectedSolution.typeLabel;
      planValues.direction = currentSelectedSolution.direction;
      planValues.longueur = measure(currentSelectedSolution.footprintLength);
      planValues.reculement = measure(currentSelectedSolution.footprintReculement);
      planValues.largeur = measure(currentSelectedSolution.width);
      planValues.marchesNombre = measure(currentSelectedSolution.steps);
      planValues.marchesGeom = clamp(Math.round(currentSelectedSolution.steps), 3, 22);
      planValues.giron = measure(currentSelectedSolution.going);
      planValues.hauteurMarche = measure(currentSelectedSolution.riser);
      planValues.pente = measure(currentSelectedSolution.slope);
    }

    return planValues;
  }

  function renderDimensionLine(options) {
    const { x1, y1, x2, y2, label, key, orientation = 'h', textSide = 'left', offset = 10 } = options;
    const active = isActive(key) ? ' active' : '';
    if (orientation === 'v') {
      const textX = textSide === 'right' ? x1 + 15 : x1 - 15;
      const anchor = textSide === 'right' ? 'start' : 'end';
      return `<g class="dim-group${active}">
        <line class="dim-line" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>
        <line class="dim-line" x1="${x1 - 10}" y1="${y1 - 6}" x2="${x1 + 10}" y2="${y1 + 6}"/>
        <line class="dim-line" x1="${x2 - 10}" y1="${y2 - 6}" x2="${x2 + 10}" y2="${y2 + 6}"/>
        <text class="dim-label" x="${textX}" y="${(y1 + y2) / 2 + 4}" text-anchor="${anchor}">${label}</text>
      </g>`;
    }

    const textY = y1 - offset;
    return `<g class="dim-group${active}">
      <line class="dim-line" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>
      <line class="dim-line" x1="${x1 - 6}" y1="${y1 + 10}" x2="${x1 + 6}" y2="${y1 - 10}"/>
      <line class="dim-line" x1="${x2 - 6}" y1="${y2 + 10}" x2="${x2 + 6}" y2="${y2 - 10}"/>
      <text class="dim-label" x="${(x1 + x2) / 2}" y="${textY}" text-anchor="middle">${label}</text>
    </g>`;
  }

  function dimH(x1, y, x2, label, key, offset = 10) {
    return renderDimensionLine({ x1, y1: y, x2, y2: y, label, key, orientation: 'h', offset });
  }

  function dimV(x, y1, y2, label, key, textSide = 'left') {
    return renderDimensionLine({ x1: x, y1, x2: x, y2, label, key, orientation: 'v', textSide });
  }

  function arrowPolyline(points) {
    return `<polyline class="thin-line" points="${points.map((point) => point.join(',')).join(' ')}" marker-end="url(#${svgMarkerPrefix}TravelArrow)"/>`;
  }

  function renderTitleBlock(values, x, y, width) {
    const project = values.chantier || '—';
    const client = values.client || '—';
    const date = values.date || '—';
    const colA = 148;
    const colB = 322;
    const colC = 462;
    const row = 24;
    const height = 120;
    return `<g>
      <rect class="schedule-box" x="${x}" y="${y}" width="${width}" height="${height}"/>
      <line class="schedule-line" x1="${x + colA}" y1="${y}" x2="${x + colA}" y2="${y + height}"/>
      <line class="schedule-line" x1="${x + colB}" y1="${y}" x2="${x + colB}" y2="${y + height}"/>
      <line class="schedule-line" x1="${x + colC}" y1="${y}" x2="${x + colC}" y2="${y + height}"/>
      ${[1, 2, 3, 4].map((index) => `<line class="schedule-line" x1="${x}" y1="${y + index * row}" x2="${x + width}" y2="${y + index * row}"/>`).join('')}
      <text class="brand-title" x="${x + 16}" y="${y + 32}">A2 MÉTAL</text>
      <text class="schedule-label" x="${x + 16}" y="${y + 62}">Unité</text>
      <text class="schedule-value" x="${x + 92}" y="${y + 62}" text-anchor="end">mm</text>
      <text class="schedule-label" x="${x + 16}" y="${y + 86}">Révision</text>
      <text class="schedule-value" x="${x + 92}" y="${y + 86}" text-anchor="end">0</text>
      <text class="schedule-label" x="${x + colA + 10}" y="${y + 16}">Projet / chantier</text>
      <text class="schedule-value" x="${x + colB - 10}" y="${y + 16}" text-anchor="end">${escSvgText(project)}</text>
      <text class="schedule-label" x="${x + colA + 10}" y="${y + 40}">Client</text>
      <text class="schedule-value" x="${x + colB - 10}" y="${y + 40}" text-anchor="end">${escSvgText(client)}</text>
      <text class="schedule-label" x="${x + colA + 10}" y="${y + 64}">Type escalier</text>
      <text class="schedule-value" x="${x + colB - 10}" y="${y + 64}" text-anchor="end">${escSvgText(values.stairTypeLabel)}</text>
      <text class="schedule-label" x="${x + colA + 10}" y="${y + 88}">Sens de montée</text>
      <text class="schedule-value" x="${x + colB - 10}" y="${y + 88}" text-anchor="end">${escSvgText(values.direction)}</text>
      <text class="schedule-label" x="${x + colB + 10}" y="${y + 16}">Page</text>
      <text class="schedule-value" x="${x + colC - 10}" y="${y + 16}" text-anchor="end">Prise de cotes escalier</text>
      <text class="schedule-label" x="${x + colB + 10}" y="${y + 40}">Date</text>
      <text class="schedule-value" x="${x + colC - 10}" y="${y + 40}" text-anchor="end">${escSvgText(date)}</text>
      <text class="schedule-label" x="${x + colB + 10}" y="${y + 64}">Longueur / largeur</text>
      <text class="schedule-value" x="${x + colC - 10}" y="${y + 64}" text-anchor="end">${escSvgText(formatMeasure(values.longueur))} / ${escSvgText(formatMeasure(values.largeur))}</text>
      <text class="schedule-label" x="${x + colB + 10}" y="${y + 88}">Hauteur / reculement</text>
      <text class="schedule-value" x="${x + colC - 10}" y="${y + 88}" text-anchor="end">${escSvgText(formatMeasure(values.hauteur))} / ${escSvgText(formatMeasure(values.reculement))}</text>
      <text class="schedule-label" x="${x + colC + 10}" y="${y + 16}">Trémie L/l</text>
      <text class="schedule-value" x="${x + width - 10}" y="${y + 16}" text-anchor="end">${escSvgText(formatMeasure(values.tremieType === 'l' ? values.tremieLGrandeLongueur : values.tremieLongueur))} / ${escSvgText(formatMeasure(values.tremieType === 'l' ? values.tremieLGrandeLargeur : values.tremieLargeur))}</text>
      <text class="schedule-label" x="${x + colC + 10}" y="${y + 40}">Marches</text>
      <text class="schedule-value" x="${x + width - 10}" y="${y + 40}" text-anchor="end">${escSvgText(formatMeasure(values.marchesNombre, 'marches'))}</text>
      <text class="schedule-label" x="${x + colC + 10}" y="${y + 64}">H. marche / giron</text>
      <text class="schedule-value" x="${x + width - 10}" y="${y + 64}" text-anchor="end">${escSvgText(formatMeasure(values.hauteurMarche))} / ${escSvgText(formatMeasure(values.giron))}</text>
      <text class="schedule-label" x="${x + colC + 10}" y="${y + 88}">Échappée</text>
      <text class="schedule-value" x="${x + width - 10}" y="${y + 88}" text-anchor="end">${escSvgText(formatMeasure(values.echappee))}</text>
    </g>`;
  }

  function renderSheetFrame(width, height, title, titleBlockY) {
    return `<rect class="sheet-frame" x="18" y="18" width="${width - 36}" height="${height - 36}"/>
      <rect class="view-frame" x="42" y="48" width="${width - 84}" height="${titleBlockY - 62}"/>
      <text class="view-title" x="54" y="38">${title}</text>
      <text class="small-note" x="${width - 54}" y="38" text-anchor="end">Échelle visuelle - contrôle chantier</text>`;
  }

  function renderSectionMarkers(x1, y1, x2, y2, label) {
    return `<line class="thin-line" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>
      <text class="section-marker" x="${x1 - 12}" y="${y1 - 5}" text-anchor="end">${label}</text>
      <text class="section-marker" x="${x2 + 12}" y="${y2 - 5}">${label}</text>`;
  }

  function renderScaleBar(x, y, scale = null) {
    const segmentMm = 500;
    const segmentPx = scale ? Math.max(20, scale.mmToPx(segmentMm)) : 55;
    const totalPx = segmentPx * 2;
    return `<g>
      <line class="thin-line" x1="${x}" y1="${y}" x2="${x + totalPx}" y2="${y}"/>
      <line class="thin-line" x1="${x}" y1="${y - 5}" x2="${x}" y2="${y + 5}"/>
      <line class="thin-line" x1="${x + segmentPx}" y1="${y - 5}" x2="${x + segmentPx}" y2="${y + 5}"/>
      <line class="thin-line" x1="${x + totalPx}" y1="${y - 5}" x2="${x + totalPx}" y2="${y + 5}"/>
      <text class="small-note" x="${x}" y="${y + 18}">0</text>
      <text class="small-note" x="${x + segmentPx}" y="${y + 18}" text-anchor="middle">500</text>
      <text class="small-note" x="${x + totalPx}" y="${y + 18}" text-anchor="end">1000 mm</text>
    </g>`;
  }

  function renderPlanDirectionArrow(x, y, label = 'Sens montée') {
    return `<g>
      <line class="walking-line" x1="${x}" y1="${y}" x2="${x + 56}" y2="${y}" marker-end="url(#${svgMarkerPrefix}TravelArrow)"/>
      <text class="small-note" x="${x}" y="${y - 8}">${label}</text>
    </g>`;
  }

  function renderStepNumbers(points, values, drawingWidth) {
    return points.map(({ x, y, label }) => {
      const pointX = values.direction === 'Gauche' ? drawingWidth - x : x;
      return `<text class="step-number" x="${pointX}" y="${y}" text-anchor="middle">${label}</text>`;
    }).join('');
  }

  function renderStepLines(options) {
    const { x, y, width, height, count, orientation = 'h' } = options;
    const lines = [];
    const risers = clamp(Math.round(count), 3, 22);
    for (let index = 1; index < risers; index += 1) {
      if (orientation === 'v') {
        const stepY = y + (height / risers) * index;
        lines.push(`<line class="step-line" x1="${x + 9}" y1="${stepY}" x2="${x + width - 9}" y2="${stepY}"/>`);
      } else {
        const stepX = x + (width / risers) * index;
        lines.push(`<line class="step-line" x1="${stepX}" y1="${y + 9}" x2="${stepX}" y2="${y + height - 9}"/>`);
      }
    }
    return lines.join('');
  }

  function renderWinderLines(x, y, size, mode) {
    const lines = [];
    for (let index = 1; index <= 5; index += 1) {
      const ratio = index / 6;
      if (mode === 'left-up') {
        lines.push(`<line class="winder-line" x1="${x + 8 + ratio * (size - 16)}" y1="${y + size - 8}" x2="${x + 8}" y2="${y + size - 8 - ratio * (size - 16)}"/>`);
      } else {
        lines.push(`<line class="winder-line" x1="${x + size - 8}" y1="${y + 8 + ratio * (size - 16)}" x2="${x + size - 8 - ratio * (size - 16)}" y2="${y + size - 8}"/>`);
      }
    }
    return lines.join('');
  }

  function stepLinesHorizontal(x, y, width, height, count) {
    return renderStepLines({ x, y, width, height, count, orientation: 'h' });
  }

  function stepLinesVertical(x, y, width, height, count) {
    return renderStepLines({ x, y, width, height, count, orientation: 'v' });
  }

  function svgShell(width, height, body) {
    return `<svg viewBox="0 0 ${width} ${height}" role="img" preserveAspectRatio="xMidYMid meet">
      <defs>
        <pattern id="slabHatch" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
          <rect width="8" height="8" fill="#f7f8f9"/>
          <line x1="0" y1="0" x2="0" y2="8" stroke="#9aa4b2" stroke-width="0.8"/>
        </pattern>
        <pattern id="tremieHatch" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
          <rect width="8" height="8" fill="#ffffff"/>
          <line x1="0" y1="0" x2="0" y2="8" stroke="#d9480f" stroke-width="0.7"/>
        </pattern>
        <marker id="${svgMarkerPrefix}TravelArrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto" markerUnits="strokeWidth">
          <path d="M 0 0 L 7 3.5 L 0 7 z" fill="#374957"/>
        </marker>
      </defs>
      <rect class="sheet-bg" x="0" y="0" width="${width}" height="${height}"/>
      ${body}
    </svg>`;
  }

  function renderSidePlan(values) {
    svgMarkerPrefix = 'sidePlan';
    const width = 760;
    const height = 620;
    const titleBlockY = 470;
    const left = 116;
    const right = 632;
    const top = 78;
    const bottom = 282;
    const run = right - left;
    const steps = values.marchesGeom;
    let stairPath = `M ${left} ${bottom}`;
    for (let index = 1; index <= steps; index += 1) {
      const x = left + (run / steps) * index;
      const y = bottom - ((bottom - top) / steps) * index;
      const prevY = bottom - ((bottom - top) / steps) * (index - 1);
      stairPath += ` L ${x} ${prevY} L ${x} ${y}`;
    }

    const body = `
      ${renderSheetFrame(width, height, 'Vue de côté', titleBlockY)}
      <line class="cut-line" x1="72" y1="${bottom}" x2="696" y2="${bottom}"/>
      <text class="caption" x="74" y="${bottom + 23}">Sol bas / départ</text>
      <rect class="slab-fill" x="${right - 8}" y="${top - 13}" width="86" height="22"/>
      <line class="cut-line" x1="${right - 22}" y1="${top}" x2="${right + 96}" y2="${top}"/>
      <text class="caption" x="${right - 8}" y="${top - 24}">Sol haut / dalle</text>
      <path class="outline-line" d="${stairPath}"/>
      <line class="thin-line" x1="${left}" y1="${bottom}" x2="${right}" y2="${top}"/>
      ${arrowPolyline([[left + 38, bottom - 22], [right - 72, top + 26]])}
      <text class="caption" x="${left + 314}" y="${top + 52}" text-anchor="middle">Sens de montée</text>
      ${dimV(76, top, bottom, `Hauteur ${formatMeasure(values.hauteur)}`, 'hauteur')}
      ${dimH(left, 326, right, `Reculement ${formatMeasure(values.reculement)}`, 'reculement')}
      ${dimH(left, 360, right, `Longueur ${formatMeasure(values.longueur)}`, 'longueur')}
      ${dimV(right + 58, top + 12, top + 112, `Échappée ${formatMeasure(values.echappee)}`, 'echappee', 'right')}
      ${renderSectionMarkers(left + 80, bottom - 32, left + 220, bottom - 88, 'B-B')}
      ${renderScaleBar(560, 416)}
      ${renderTitleBlock(values, 76, titleBlockY, 608)}
    `;
    sideViewSvg.innerHTML = svgShell(width, height, body);
  }

  function renderTremie(values, x, y, width, height, scale = null) {
    if (values.tremieType !== 'l') {
      return `<rect class="tremie-fill" x="${x}" y="${y}" width="${width}" height="${height}"/>
        <text class="caption" x="${x + width / 2}" y="${y + height / 2 + 4}" text-anchor="middle">Trémie</text>
        ${dimH(x, y - 20, x + width, `Trémie L ${formatMeasure(values.tremieLongueur)}`, 'tremieLongueur')}
        ${dimV(x + width + 24, y, y + height, `l ${formatMeasure(values.tremieLargeur)}`, 'tremieLargeur', 'right')}`;
    }

    const notchW = scale
      ? Math.min(width - 12, Math.max(12, scale.mmToPx(values.tremieLRetourLongueur.geom)))
      : clamp(width * (values.tremieLRetourLongueur.geom / Math.max(values.tremieLGrandeLongueur.geom, 1)), 42, width - 28);
    const notchH = scale
      ? Math.min(height - 12, Math.max(12, scale.mmToPx(values.tremieLRetourLargeur.geom)))
      : clamp(height * (values.tremieLRetourLargeur.geom / Math.max(values.tremieLGrandeLargeur.geom, 1)), 36, height - 28);
    const path = `M ${x} ${y} H ${x + width} V ${y + notchH} H ${x + notchW} V ${y + height} H ${x} Z`;
    return `<path class="tremie-fill" d="${path}"/>
      <text class="caption" x="${x + width / 2}" y="${y + 18}" text-anchor="middle">Trémie en L</text>
      ${dimH(x, y - 20, x + width, `A ${formatMeasure(values.tremieLGrandeLongueur)}`, 'tremieLGrandeLongueur')}
      ${dimV(x + width + 24, y, y + height, `B ${formatMeasure(values.tremieLGrandeLargeur)}`, 'tremieLGrandeLargeur', 'right')}
      ${dimH(x, y + height + 28, x + notchW, `C ${formatMeasure(values.tremieLRetourLongueur)}`, 'tremieLRetourLongueur', 8)}
      ${dimV(x - 24, y + notchH, y + height, `D ${formatMeasure(values.tremieLRetourLargeur)}`, 'tremieLRetourLargeur')}`;
  }

  function renderCornerMarkers(points) {
    return points.map(([x, y]) => `<rect class="corner-marker" x="${x - 4}" y="${y - 4}" width="8" height="8"/>`).join('');
  }

  function renderStairOutline(path) {
    return `<path class="stair-fill" d="${path}"/><path class="stringer-line" d="${path}"/>`;
  }

  function renderStraightPlan(values) {
    const titleBlockY = 530;
    const scale = createPlanScale(values, { availableWidth: 520, availableHeight: 240 });
    const stairWidth = Math.max(34, scale.mmToPx(values.longueur.geom));
    const stairDepth = Math.max(28, scale.mmToPx(values.largeur.geom));
    const x = 110;
    const y = 190;
    const outline = `M ${x} ${y} H ${x + stairWidth} V ${y + stairDepth} H ${x} Z`;
    const tremieWidth = Math.max(18, scale.mmToPx(values.tremieType === 'l' ? values.tremieLGrandeLongueur.geom : values.tremieLongueur.geom));
    const tremieHeight = Math.max(18, scale.mmToPx(values.tremieType === 'l' ? values.tremieLGrandeLargeur.geom : values.tremieLargeur.geom));
    const tremie = {
      x: x + Math.max(0, (stairWidth - tremieWidth) / 2),
      y: y + Math.max(0, (stairDepth - tremieHeight) / 2),
      width: tremieWidth,
      height: tremieHeight
    };
    const tremieX = mirrorRectX(tremie.x, tremie.width, values, 760);
    const geometry = `
      ${renderStairOutline(outline)}
      ${renderStepLines({ x, y, width: stairWidth, height: stairDepth, count: values.marchesGeom, orientation: 'h' })}
      <line class="walking-line" x1="${x + 22}" y1="${y + stairDepth / 2}" x2="${x + stairWidth - 34}" y2="${y + stairDepth / 2}" marker-end="url(#${svgMarkerPrefix}TravelArrow)"/>
      ${renderCornerMarkers([[x, y], [x + stairWidth, y], [x + stairWidth, y + stairDepth], [x, y + stairDepth]])}
    `;
    return `
      ${renderSheetFrame(760, 680, 'Vue en plan', titleBlockY)}
      ${mirrorPlanForDirection(geometry, values, 760)}
      ${renderTremie(values, tremieX, tremie.y, tremie.width, tremie.height, scale)}
      ${renderStepNumbers([
        { x: x + Math.min(60, stairWidth * 0.2), y: y + stairDepth / 2 + 4, label: '1' },
        { x: x + stairWidth / 2, y: y + stairDepth / 2 + 4, label: `${Math.ceil(values.marchesGeom / 2)}` },
        { x: x + stairWidth - Math.min(60, stairWidth * 0.2), y: y + stairDepth / 2 + 4, label: `${values.marchesGeom}` },
      ], values, 760)}
      <text class="caption" x="${x}" y="${y - 22}">Départ</text>
      <text class="caption" x="${x + stairWidth - 54}" y="${y - 22}">Arrivée</text>
      ${dimH(x, y + stairDepth + 54, x + stairWidth, `Longueur ${formatMeasure(values.longueur)}`, 'longueur')}
      ${dimV(x - 38, y, y + stairDepth, `Largeur ${formatMeasure(values.largeur)}`, 'largeur')}
      ${renderSectionMarkers(x + Math.min(120, stairWidth * 0.35), y - 34, x + Math.min(120, stairWidth * 0.35), y + stairDepth + 34, 'A-A')}
      ${renderPlanDirectionArrow(520, 82)}
      ${renderScaleBar(548, 476, scale)}
      ${renderTitleBlock(values, 76, titleBlockY, 608)}
    `;
  }

  function renderQuarterTurnPlan(values) {
    const titleBlockY = 530;
    const scale = createPlanScale(values, { availableWidth: 440, availableHeight: 310 });
    const x = 116;
    const y = 72;
    const flight = Math.max(34, scale.mmToPx(values.largeur.geom));
    const horizontal = Math.max(flight * 1.8, scale.mmToPx(values.longueur.geom));
    const vertical = Math.max(flight * 1.8, scale.mmToPx(values.reculement.geom));
    const cornerX = x + horizontal - flight;
    const cornerY = y + vertical - flight;
    const outline = `M ${cornerX} ${y} H ${cornerX + flight} V ${y + vertical} H ${x} V ${cornerY} H ${cornerX} Z`;
    const lowerRun = Math.max(3, Math.round(values.marchesGeom * 0.42));
    const upperRun = Math.max(3, Math.round(values.marchesGeom * 0.36));
    const tremieWidth = Math.max(18, scale.mmToPx(values.tremieType === 'l' ? values.tremieLGrandeLongueur.geom : values.tremieLongueur.geom));
    const tremieHeight = Math.max(18, scale.mmToPx(values.tremieType === 'l' ? values.tremieLGrandeLargeur.geom : values.tremieLargeur.geom));
    const tremie = {
      x: x + Math.max(0, (horizontal - tremieWidth) / 2),
      y: y + Math.max(0, (vertical - tremieHeight) / 2),
      width: tremieWidth,
      height: tremieHeight
    };
    const tremieX = mirrorRectX(tremie.x, tremie.width, values, 760);
    const geometry = `
      ${renderStairOutline(outline)}
      ${renderStepLines({ x, y: cornerY, width: horizontal - flight, height: flight, count: lowerRun, orientation: 'h' })}
      ${renderStepLines({ x: cornerX, y, width: flight, height: vertical - flight, count: upperRun, orientation: 'v' })}
      ${renderWinderLines(cornerX, cornerY, flight, 'left-up')}
      <path class="walking-line" d="M ${x + 26} ${cornerY + flight / 2} H ${cornerX + flight / 2} V ${y + 30}" marker-end="url(#${svgMarkerPrefix}TravelArrow)"/>
      ${renderCornerMarkers([[x, cornerY], [cornerX, cornerY], [cornerX, y], [cornerX + flight, y], [cornerX + flight, y + vertical], [x, y + vertical]])}
    `;
    const startLabelX = values.direction === 'Gauche' ? 760 - x - 42 : x;
    const endLabelX = values.direction === 'Gauche' ? 760 - (cornerX + flight + 82) : cornerX + flight + 20;
    return `
      ${renderSheetFrame(760, 680, 'Vue en plan', titleBlockY)}
      ${mirrorPlanForDirection(geometry, values, 760)}
      ${renderTremie(values, tremieX, tremie.y, tremie.width, tremie.height, scale)}
      ${renderStepNumbers([
        { x: x + 52, y: cornerY + flight / 2 + 4, label: '1' },
        { x: cornerX + flight / 2, y: cornerY + flight / 2 + 4, label: `${Math.ceil(values.marchesGeom / 2)}` },
        { x: cornerX + flight / 2, y: y + 52, label: `${values.marchesGeom}` },
      ], values, 760)}
      <text class="caption" x="${startLabelX}" y="${cornerY - 22}">Départ</text>
      <text class="caption" x="${endLabelX}" y="${y + 36}">Arrivée</text>
      ${dimH(x, y + vertical + 42, x + horizontal, `Longueur ${formatMeasure(values.longueur)}`, 'longueur')}
      ${dimV(x + horizontal + 42, y, y + vertical, `Reculement ${formatMeasure(values.reculement)}`, 'reculement', 'right')}
      ${dimV(x - 38, cornerY, cornerY + flight, `Largeur ${formatMeasure(values.largeur)}`, 'largeur')}
      ${renderSectionMarkers(x + 84, cornerY - 34, x + 84, cornerY + flight + 34, 'A-A')}
      ${renderSectionMarkers(cornerX - 34, y + 84, cornerX + flight + 34, y + 84, 'B-B')}
      ${renderPlanDirectionArrow(542, 92)}
      ${renderScaleBar(548, 486, scale)}
      ${renderTitleBlock(values, 76, titleBlockY, 608)}
    `;
  }

  function renderDoubleQuarterTurnPlan(values) {
    const titleBlockY = 530;
    const scale = createPlanScale(values, { availableWidth: 440, availableHeight: 310 });
    const x = 116;
    const y = 70;
    const flight = Math.max(34, scale.mmToPx(values.largeur.geom));
    const horizontal = Math.max(flight * 2.1, scale.mmToPx(values.longueur.geom));
    const vertical = Math.max(flight * 2.2, scale.mmToPx(values.reculement.geom));
    const cornerX = x + horizontal - flight;
    const bottomY = y + vertical - flight;
    const outline = `M ${x} ${y} H ${x + horizontal} V ${y + vertical} H ${x} V ${bottomY} H ${cornerX} V ${y + flight} H ${x} Z`;
    const runSteps = Math.max(3, Math.round(values.marchesGeom * 0.28));
    const middleSteps = Math.max(3, Math.round(values.marchesGeom * 0.30));
    const tremieWidth = Math.max(18, scale.mmToPx(values.tremieType === 'l' ? values.tremieLGrandeLongueur.geom : values.tremieLongueur.geom));
    const tremieHeight = Math.max(18, scale.mmToPx(values.tremieType === 'l' ? values.tremieLGrandeLargeur.geom : values.tremieLargeur.geom));
    const tremie = {
      x: x + Math.max(0, (horizontal - tremieWidth) / 2),
      y: y + Math.max(0, (vertical - tremieHeight) / 2),
      width: tremieWidth,
      height: tremieHeight
    };
    const tremieX = mirrorRectX(tremie.x, tremie.width, values, 760);
    const geometry = `
      ${renderStairOutline(outline)}
      ${renderStepLines({ x, y, width: horizontal - flight, height: flight, count: runSteps, orientation: 'h' })}
      ${renderStepLines({ x: cornerX, y: y + flight, width: flight, height: vertical - flight * 2, count: middleSteps, orientation: 'v' })}
      ${renderStepLines({ x, y: bottomY, width: horizontal - flight, height: flight, count: runSteps, orientation: 'h' })}
      ${renderWinderLines(cornerX, y, flight, 'down-left')}
      ${renderWinderLines(cornerX, bottomY, flight, 'left-up')}
      <path class="walking-line" d="M ${x + 28} ${bottomY + flight / 2} H ${cornerX + flight / 2} V ${y + flight / 2} H ${x + 34}" marker-end="url(#${svgMarkerPrefix}TravelArrow)"/>
      ${renderCornerMarkers([[x, y], [x + horizontal, y], [x + horizontal, y + vertical], [x, y + vertical], [cornerX, y + flight], [cornerX, bottomY]])}
    `;
    const labelX = values.direction === 'Gauche' ? 760 - x - 42 : x;
    return `
      ${renderSheetFrame(760, 680, 'Vue en plan', titleBlockY)}
      ${mirrorPlanForDirection(geometry, values, 760)}
      ${renderTremie(values, tremieX, tremie.y, tremie.width, tremie.height, scale)}
      ${renderStepNumbers([
        { x: x + 54, y: bottomY + flight / 2 + 4, label: '1' },
        { x: cornerX + flight / 2, y: y + vertical / 2 + 4, label: `${Math.ceil(values.marchesGeom / 2)}` },
        { x: x + 54, y: y + flight / 2 + 4, label: `${values.marchesGeom}` },
      ], values, 760)}
      <text class="caption" x="${labelX}" y="${bottomY - 22}">Départ</text>
      <text class="caption" x="${labelX}" y="${y - 22}">Arrivée</text>
      ${dimH(x, y + vertical + 42, x + horizontal, `Longueur ${formatMeasure(values.longueur)}`, 'longueur')}
      ${dimV(x + horizontal + 42, y, y + vertical, `Reculement ${formatMeasure(values.reculement)}`, 'reculement', 'right')}
      ${dimV(x - 38, y, y + flight, `Largeur ${formatMeasure(values.largeur)}`, 'largeur')}
      ${renderSectionMarkers(x + 76, bottomY - 34, x + 76, bottomY + flight + 34, 'A-A')}
      ${renderSectionMarkers(cornerX - 34, y + vertical / 2, cornerX + flight + 34, y + vertical / 2, 'B-B')}
      ${renderPlanDirectionArrow(542, 92)}
      ${renderScaleBar(548, 486, scale)}
      ${renderTitleBlock(values, 76, titleBlockY, 608)}
    `;
  }

  function renderTopPlan(values) {
    svgMarkerPrefix = 'topPlan';
    const width = 760;
    const height = 680;
    let body = '';
    if (values.stairType === 'straight') {
      body = renderStraightPlan(values);
    } else if (values.stairType === 'quarter') {
      body = renderQuarterTurnPlan(values);
    } else {
      body = renderDoubleQuarterTurnPlan(values);
    }
    topViewSvg.innerHTML = svgShell(width, height, body);
  }

  function renderPlans() {
    const values = getPlanValues();
    if (sideViewSvg) renderSidePlan(values);
    if (topViewSvg) renderTopPlan(values);
  }

  function renderPhotos() {
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
    return {
      server_id: currentServerId,
      module: 'Escalier',
      recordName: recordNameField.value.trim(),
      fields,
      quote_id: fields.quote_id || '',
      client_order_id: fields.quote_id ? '' : (fields.client_order_id || ''),
      typeEscalier: getCheckboxValues('typeEscalier'),
      structure: getCheckboxValues('structure'),
      finitions: getCheckboxValues('finitions'),
      pose: getCheckboxValues('pose'),
      observations: form.elements.observations.value,
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
    setCheckboxValues('typeEscalier', record.typeEscalier);
    setCheckboxValues('structure', record.structure);
    setCheckboxValues('finitions', record.finitions);
    setCheckboxValues('pose', record.pose);
    form.elements.observations.value = record.observations || '';
    photos = Array.isArray(record.photos) ? record.photos.slice() : [];
    renderPhotos();
    syncTremieGroups();
    syncConfiguratorFromForm();
    renderPlans();
    currentRecordName = record.recordName || '';
    saveStatus.textContent = record.updatedAt
      ? `Fiche chargée - dernière sauvegarde le ${new Date(record.updatedAt).toLocaleString('fr-FR')}`
      : 'Fiche chargée';
  }

  function getStoredRecords() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  }

  function saveStoredRecords(records) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
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

  async function saveRecord() {
    const payload = collectFormData();
    const recordName = payload.recordName || `Fiche escalier ${new Date().toLocaleDateString('fr-FR')}`;
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
      payload.server_id = currentServerId;
      const refreshed = getStoredRecords();
      const refreshedIndex = refreshed.findIndex((entry) => entry.recordName === recordName);
      if (refreshedIndex >= 0) refreshed[refreshedIndex] = payload;
      saveStoredRecords(refreshed);
      saveStatus.textContent = `Enregistré - ${new Date(payload.updatedAt).toLocaleString('fr-FR')}`;
    } catch {
      saveStatus.textContent = 'Enregistré localement - serveur indisponible';
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
    currentSolutions = [];
    currentSelectedSolution = null;
    photos = [];
    renderPhotos();
    syncTremieGroups();
    renderPlans();
    if (proposalResult) {
      proposalResult.textContent = 'Renseignez la trémie, la hauteur, la largeur et le sens de montée, puis calculez les solutions.';
    }
    currentRecordName = '';
    currentServerId = null;
    saveStatus.textContent = 'Nouvelle fiche prête';
    setDefaultValues();
    syncConfiguratorFromForm();
  }

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

  saveBtn.addEventListener('click', saveRecord);
  loadBtn.addEventListener('click', loadRecord);
  resetBtn.addEventListener('click', resetForm);
  printBtn.addEventListener('click', () => window.print());
  if (proposalBtn) {
    proposalBtn.addEventListener('click', () => {
      configuratorFields.forEach(syncFormFromConfigurator);
      renderStairSolutions(generateStairSolutions());
    });
  }
  if (proposalResult) {
    proposalResult.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const applyButton = target.closest('[data-apply-solution]');
      const viewButton = target.closest('[data-view-solution]');
      const solutionId = applyButton ? applyButton.dataset.applySolution : viewButton ? viewButton.dataset.viewSolution : '';
      if (!solutionId) return;
      const solution = currentSolutions.find((entry) => entry.id === solutionId);
      if (!solution) return;
      if (applyButton) {
        applyStairSolution(solution);
      } else {
        renderSelectedStairPlan(solution);
      }
    });
  }

  const planFieldNames = [
    'typeEscalier',
    'sensMontee',
    'client',
    'chantier',
    'date',
    'hauteur',
    'longueur',
    'largeur',
    'tremie',
    'reculement',
    'echappee',
    'hauteurMarche',
    'giron',
    'pente',
    'marchesNombre',
    'tremieType',
    'tremieLongueur',
    'tremieLargeur',
    'tremieLGrandeLongueur',
    'tremieLGrandeLargeur',
    'tremieLRetourLongueur',
    'tremieLRetourLargeur',
  ];
  const planSelector = planFieldNames.map((name) => `[name="${name}"]`).join(', ');

  form.querySelectorAll(planSelector).forEach((input) => {
    const updateActivePlan = () => {
      activeMeasure = input.name;
      currentSelectedSolution = null;
      renderPlans();
    };
    input.addEventListener('focus', updateActivePlan);
    input.addEventListener('input', updateActivePlan);
    input.addEventListener('change', updateActivePlan);
    input.addEventListener('blur', () => {
      window.setTimeout(() => {
        if (!form.contains(document.activeElement) || !planFieldNames.includes(document.activeElement.name)) {
          activeMeasure = '';
          renderPlans();
        }
      }, 80);
    });
  });

  const tremieTypeControl = form.elements.tremieType;
  if (tremieTypeControl) {
    tremieTypeControl.addEventListener('change', () => {
      syncTremieGroups();
      renderPlans();
    });
  }

  window.addEventListener('resize', () => {
    renderPlans();
  });

  configuratorFields.forEach((field) => {
    field.addEventListener('input', () => syncFormFromConfigurator(field));
    field.addEventListener('change', () => syncFormFromConfigurator(field));
  });

  setDefaultValues();
  syncConfiguratorFromForm();
  initServerLinks();
  syncTremieGroups();
  renderPlans();
  saveStatus.textContent = getStoredRecords().length
    ? 'Des fiches locales sont disponibles'
    : 'Aucune sauvegarde chargée';
})();
