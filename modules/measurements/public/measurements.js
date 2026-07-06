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

  function svgShell(width, height, body) {
    return `<svg viewBox="0 0 ${width} ${height}" role="img" preserveAspectRatio="xMidYMid meet">
      <defs>
        <marker id="${svgMarkerPrefix}TravelArrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M 0 0 L 6 3 L 0 6 z" fill="#4f6475"/>
        </marker>
      </defs>
      <rect class="sheet-bg" x="0" y="0" width="${width}" height="${height}"/>
      ${body}
    </svg>`;
  }

  function renderEmptyPlan(target, title) {
    const width = 760;
    const height = 420;
    target.innerHTML = svgShell(width, height, `
      <rect class="sheet-frame" x="24" y="24" width="${width - 48}" height="${height - 48}"/>
      <text class="view-title" x="46" y="58">${title}</text>
      <text class="empty-plan-message" x="${width / 2}" y="${height / 2}" text-anchor="middle">Sélectionnez une solution pour générer le schéma.</text>
    `);
  }

  function renderSimpleDimension(x1, y1, x2, y2, label, orientation = 'h') {
    if (orientation === 'v') {
      return `<g>
        <line class="dim-line" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>
        <line class="dim-line" x1="${x1 - 6}" y1="${y1}" x2="${x1 + 6}" y2="${y1}"/>
        <line class="dim-line" x1="${x2 - 6}" y1="${y2}" x2="${x2 + 6}" y2="${y2}"/>
        <text class="dim-label" x="${x1 - 12}" y="${(y1 + y2) / 2 + 4}" text-anchor="end">${escSvgText(label)}</text>
      </g>`;
    }
    return `<g>
      <line class="dim-line" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>
      <line class="dim-line" x1="${x1}" y1="${y1 - 6}" x2="${x1}" y2="${y1 + 6}"/>
      <line class="dim-line" x1="${x2}" y1="${y2 - 6}" x2="${x2}" y2="${y2 + 6}"/>
      <text class="dim-label" x="${(x1 + x2) / 2}" y="${y1 - 9}" text-anchor="middle">${escSvgText(label)}</text>
    </g>`;
  }

  function renderStairTitleBlock(values, x, y, width) {
    const tremieLength = values.tremieType === 'l' ? values.tremieLGrandeLongueur : values.tremieLongueur;
    const tremieWidth = values.tremieType === 'l' ? values.tremieLGrandeLargeur : values.tremieLargeur;
    const rows = [
      ['Type escalier', values.stairTypeLabel],
      ['Sens montée', values.direction],
      ['Hauteur', formatMeasure(values.hauteur)],
      ['Largeur', formatMeasure(values.largeur)],
      ['Nombre marches', formatMeasure(values.marchesNombre, 'marches')],
      ['Hauteur marche', formatMeasure(values.hauteurMarche)],
      ['Giron', formatMeasure(values.giron)],
      ['Pente', formatMeasure(values.pente, '°')],
      ['Reculement', formatMeasure(values.reculement)],
      ['Trémie L/l', `${formatMeasure(tremieLength)} / ${formatMeasure(tremieWidth)}`]
    ];
    const colW = width / 2;
    const rowH = 24;
    const bodyRows = rows.map(([label, value], index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const cellX = x + col * colW;
      const cellY = y + 30 + row * rowH;
      return `<line class="schedule-line" x1="${cellX}" y1="${cellY}" x2="${cellX + colW}" y2="${cellY}"/>
        <text class="schedule-label" x="${cellX + 10}" y="${cellY + 17}">${escSvgText(label)}</text>
        <text class="schedule-value" x="${cellX + colW - 10}" y="${cellY + 17}" text-anchor="end">${escSvgText(value)}</text>`;
    }).join('');
    return `<g>
      <rect class="schedule-box" x="${x}" y="${y}" width="${width}" height="154"/>
      <line class="schedule-line" x1="${x}" y1="${y + 30}" x2="${x + width}" y2="${y + 30}"/>
      <line class="schedule-line" x1="${x + colW}" y1="${y + 30}" x2="${x + colW}" y2="${y + 154}"/>
      <text class="brand-title" x="${x + 10}" y="${y + 21}">A2 MÉTAL</text>
      <text class="schedule-title" x="${x + width - 10}" y="${y + 21}" text-anchor="end">Cartouche technique escalier</text>
      ${bodyRows}
    </g>`;
  }

  function getSimpleScale(maxMmX, maxMmY, maxPxX, maxPxY) {
    return Math.min(maxPxX / Math.max(maxMmX, 1), maxPxY / Math.max(maxMmY, 1));
  }

  function renderSimpleStepLines(x, y, width, height, count, orientation = 'h') {
    const lines = [];
    const steps = clamp(Math.round(count), 3, 22);
    for (let index = 1; index < steps; index += 1) {
      if (orientation === 'v') {
        const py = y + (height / steps) * index;
        lines.push(`<line class="step-line" x1="${x}" y1="${py}" x2="${x + width}" y2="${py}"/>`);
      } else {
        const px = x + (width / steps) * index;
        lines.push(`<line class="step-line" x1="${px}" y1="${y}" x2="${px}" y2="${y + height}"/>`);
      }
    }
    return lines.join('');
  }

  function renderSimpleTopPlan(values) {
    svgMarkerPrefix = 'topPlan';
    if (!currentSelectedSolution) {
      renderEmptyPlan(topViewSvg, 'Vue de dessus');
      return;
    }
    const width = 760;
    const height = 560;
    const tremieLength = values.tremieType === 'l' ? values.tremieLGrandeLongueur.geom : values.tremieLongueur.geom;
    const tremieWidth = values.tremieType === 'l' ? values.tremieLGrandeLargeur.geom : values.tremieLargeur.geom;
    const scale = getSimpleScale(Math.max(values.longueur.geom, tremieLength), Math.max(values.reculement.geom, tremieWidth, values.largeur.geom), 500, 230);
    const stairW = Math.max(40, values.longueur.geom * scale);
    const stairH = Math.max(30, values.largeur.geom * scale);
    const recH = Math.max(stairH, values.reculement.geom * scale);
    const tremieW = Math.max(40, tremieLength * scale);
    const tremieH = Math.max(30, tremieWidth * scale);
    const x = 120;
    const y = 96;
    const tremieX = x + Math.max(0, (stairW - tremieW) / 2);
    const tremieY = y + Math.max(0, (recH - tremieH) / 2);
    let stairShape = '';
    let stepLines = '';
    let travel = '';

    if (values.stairType === 'straight') {
      stairShape = `<rect class="stair-fill" x="${x}" y="${y + (recH - stairH) / 2}" width="${stairW}" height="${stairH}"/>`;
      stepLines = renderSimpleStepLines(x, y + (recH - stairH) / 2, stairW, stairH, values.marchesGeom, 'h');
      travel = `<line class="walking-line" x1="${x + 18}" y1="${y + recH / 2}" x2="${x + stairW - 18}" y2="${y + recH / 2}" marker-end="url(#${svgMarkerPrefix}TravelArrow)"/>`;
    } else if (values.stairType === 'quarter') {
      const flight = Math.max(34, stairH);
      const hLen = Math.max(flight * 2, stairW);
      const vLen = Math.max(flight * 2, recH);
      const cornerX = x + hLen - flight;
      const cornerY = y + vLen - flight;
      stairShape = `<path class="stair-fill" d="M ${x} ${cornerY} H ${cornerX + flight} V ${y} H ${cornerX} V ${cornerY + flight} H ${x} Z"/>`;
      stepLines = `${renderSimpleStepLines(x, cornerY, hLen, flight, Math.ceil(values.marchesGeom * 0.55), 'h')}
        ${renderSimpleStepLines(cornerX, y, flight, vLen, Math.ceil(values.marchesGeom * 0.45), 'v')}`;
      travel = `<path class="walking-line" d="M ${x + 18} ${cornerY + flight / 2} H ${cornerX + flight / 2} V ${y + 18}" marker-end="url(#${svgMarkerPrefix}TravelArrow)"/>`;
    } else {
      const flight = Math.max(34, stairH);
      const hLen = Math.max(flight * 2.2, stairW);
      const vLen = Math.max(flight * 2.3, recH);
      const rightX = x + hLen - flight;
      const bottomY = y + vLen - flight;
      stairShape = `<path class="stair-fill" d="M ${x} ${y} H ${x + hLen} V ${y + vLen} H ${x} V ${bottomY} H ${rightX} V ${y + flight} H ${x} Z"/>`;
      stepLines = `${renderSimpleStepLines(x, y, hLen, flight, Math.ceil(values.marchesGeom * 0.35), 'h')}
        ${renderSimpleStepLines(rightX, y + flight, flight, vLen - flight * 2, Math.ceil(values.marchesGeom * 0.3), 'v')}
        ${renderSimpleStepLines(x, bottomY, hLen, flight, Math.ceil(values.marchesGeom * 0.35), 'h')}`;
      travel = `<path class="walking-line" d="M ${x + 20} ${bottomY + flight / 2} H ${rightX + flight / 2} V ${y + flight / 2} H ${x + 24}" marker-end="url(#${svgMarkerPrefix}TravelArrow)"/>`;
    }

    const mirrored = values.direction === 'Gauche'
      ? `<g transform="translate(${width} 0) scale(-1 1)">${stairShape}${stepLines}${travel}</g>`
      : `${stairShape}${stepLines}${travel}`;
    const body = `
      <rect class="sheet-frame" x="24" y="24" width="${width - 48}" height="${height - 48}"/>
      <text class="view-title" x="46" y="58">Vue de dessus</text>
      <rect class="tremie-fill" x="${tremieX}" y="${tremieY}" width="${tremieW}" height="${tremieH}"/>
      ${mirrored}
      ${renderSimpleDimension(x, y + recH + 34, x + stairW, y + recH + 34, `Longueur ${formatMeasure(values.longueur)}`)}
      ${renderSimpleDimension(x - 34, y, x - 34, y + recH, `Reculement ${formatMeasure(values.reculement)}`, 'v')}
      <text class="caption" x="${x}" y="${y - 16}">Départ</text>
      <text class="caption" x="${x + stairW - 54}" y="${y - 16}">Arrivée</text>
      <text class="caption" x="${tremieX + tremieW / 2}" y="${tremieY + tremieH / 2 + 4}" text-anchor="middle">Trémie</text>
      ${renderStairTitleBlock(values, 56, 374, 648)}
    `;
    topViewSvg.innerHTML = svgShell(width, height, body);
  }

  function renderSimpleSidePlan(values) {
    svgMarkerPrefix = 'sidePlan';
    if (!currentSelectedSolution) {
      renderEmptyPlan(sideViewSvg, 'Vue de côté');
      return;
    }
    const width = 760;
    const height = 520;
    const left = 110;
    const bottom = 286;
    const scale = getSimpleScale(values.reculement.geom, values.hauteur.geom, 500, 210);
    const run = Math.max(80, values.reculement.geom * scale);
    const rise = Math.max(60, values.hauteur.geom * scale);
    const steps = values.marchesGeom;
    let path = `M ${left} ${bottom}`;
    for (let index = 1; index <= steps; index += 1) {
      const stepX = left + (run / steps) * index;
      const stepY = bottom - (rise / steps) * index;
      const prevY = bottom - (rise / steps) * (index - 1);
      path += ` H ${stepX} V ${stepY}`;
      if (index < steps) path += ` V ${stepY}`;
      if (index === steps) path += ` H ${left + run}`;
    }
    const body = `
      <rect class="sheet-frame" x="24" y="24" width="${width - 48}" height="${height - 48}"/>
      <text class="view-title" x="46" y="58">Vue de côté</text>
      <line class="cut-line" x1="74" y1="${bottom}" x2="680" y2="${bottom}"/>
      <line class="cut-line" x1="${left + run - 20}" y1="${bottom - rise}" x2="${left + run + 90}" y2="${bottom - rise}"/>
      <path class="outline-line" d="${path}"/>
      <line class="thin-line" x1="${left}" y1="${bottom}" x2="${left + run}" y2="${bottom - rise}"/>
      <line class="walking-line" x1="${left + 28}" y1="${bottom - 24}" x2="${left + run - 28}" y2="${bottom - rise + 24}" marker-end="url(#${svgMarkerPrefix}TravelArrow)"/>
      ${renderSimpleDimension(74, bottom - rise, 74, bottom, `Hauteur ${formatMeasure(values.hauteur)}`, 'v')}
      ${renderSimpleDimension(left, bottom + 38, left + run, bottom + 38, `Reculement ${formatMeasure(values.reculement)}`)}
      <text class="caption" x="78" y="${bottom + 22}">Sol bas</text>
      <text class="caption" x="${left + run - 18}" y="${bottom - rise - 14}">Sol haut</text>
      ${renderStairTitleBlock(values, 56, 346, 648)}
    `;
    sideViewSvg.innerHTML = svgShell(width, height, body);
  }

  function renderTopPlan(values) {
    renderSimpleTopPlan(values);
  }

  function renderSidePlan(values) {
    renderSimpleSidePlan(values);
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
