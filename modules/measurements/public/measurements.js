const STORAGE_KEY = 'outil-pme.escalier.measurements';
(function () {
  const form = document.getElementById('measurementForm');
  const photoInput = document.getElementById('photoInput');
  const photoGallery = document.getElementById('photoGallery');
  const saveBtn = document.getElementById('saveBtn');
  const loadBtn = document.getElementById('loadBtn');
  const resetBtn = document.getElementById('resetBtn');
  const printBtn = document.getElementById('printBtn');
  const exportClientPdfBtn = document.getElementById('exportClientPdfBtn');
  const proposalBtn = document.getElementById('proposalBtn');
  const proposalResult = document.getElementById('proposalResult');
  const configuratorFields = Array.from(document.querySelectorAll('[data-sync-field]'));
  const configType = document.getElementById('configType');
  const configComfort = document.getElementById('configComfort');
  const saveStatus = document.getElementById('saveStatus');
  const recordNameField = document.getElementById('recordName');
  const photoTemplate = document.getElementById('photoItemTemplate');
  const topViewSvg = document.getElementById('topViewSvg');
  const tremieGroups = Array.from(document.querySelectorAll('[data-tremie-group]'));

  let photos = [];
  let currentRecordName = '';
  let currentServerId = null;
  let activeMeasure = '';
  let svgMarkerPrefix = 'plan';
  let currentSolutions = [];
  let currentSelectedSolution = null;
  let sketchRoot = null;
  let technicalSketches = [];

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
        <marker id="${svgMarkerPrefix}Arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
          <path d="M 0 0 L 8 4 L 0 8 z" fill="#1f2933"/>
        </marker>
        <marker id="${svgMarkerPrefix}DimArrow" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto-start-reverse" markerUnits="strokeWidth">
          <path d="M 0 0 L 7 3.5 L 0 7" fill="none" stroke="#666666" stroke-width="1.1"/>
        </marker>
      </defs>
      <rect class="sheet-bg" x="0" y="0" width="${width}" height="${height}"/>
      ${body}
    </svg>`;
  }

  function renderEmptyPlan(target) {
    const width = 2970;
    const height = 2100;
    target.innerHTML = svgShell(width, height, `
      <rect class="cad-sheet-frame" x="55" y="55" width="${width - 110}" height="${height - 110}"/>
      <text class="cad-sheet-heading" x="90" y="100">PLAN TECHNIQUE ESCALIER - PRÉ-DIMENSIONNEMENT</text>
      <text class="empty-plan-message" x="${width / 2}" y="${height / 2}" text-anchor="middle">Sélectionnez une solution pour générer le schéma.</text>
    `);
  }

  function cadScale(maxMmX, maxMmY, maxPxX, maxPxY) {
    return Math.min(maxPxX / Math.max(maxMmX, 1), maxPxY / Math.max(maxMmY, 1));
  }

  function cadDim(x1, y1, x2, y2, label, orientation = 'h') {
    if (orientation === 'v') {
      const side = x1 <= x2 ? -1 : 1;
      return `<g class="cad-dimension">
        <line class="dim-extension" x1="${x1}" y1="${y1}" x2="${x1 + side * 18}" y2="${y1}"/>
        <line class="dim-extension" x1="${x2}" y1="${y2}" x2="${x2 + side * 18}" y2="${y2}"/>
        <line class="dim-line" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-start="url(#${svgMarkerPrefix}DimArrow)" marker-end="url(#${svgMarkerPrefix}DimArrow)"/>
        <text class="dim-label" x="${x1 - 13}" y="${(y1 + y2) / 2 + 4}" text-anchor="end">${escSvgText(label)}</text>
      </g>`;
    }
    return `<g class="cad-dimension">
      <line class="dim-extension" x1="${x1}" y1="${y1}" x2="${x1}" y2="${y1 + 18}"/>
      <line class="dim-extension" x1="${x2}" y1="${y2}" x2="${x2}" y2="${y2 + 18}"/>
      <line class="dim-line" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-start="url(#${svgMarkerPrefix}DimArrow)" marker-end="url(#${svgMarkerPrefix}DimArrow)"/>
      <text class="dim-label" x="${(x1 + x2) / 2}" y="${y1 - 10}" text-anchor="middle">${escSvgText(label)}</text>
    </g>`;
  }

  function buildStairModel(solution, inputs) {
    const stepCount = clamp(Math.round(solution.steps || inputs.marchesGeom || 0), 1, 64);
    const width = Number(solution.width || inputs.largeur.geom || 900);
    const totalHeight = Number(inputs.hauteur.geom || solution.riser * stepCount || 2800);
    const riser = totalHeight / stepCount;
    const going = Number(solution.going || inputs.giron.geom || 260);
    const setback = Number(solution.footprintReculement || going * stepCount);
    const direction = solution.direction || inputs.direction;
    const turnDirection = direction === 'Gauche' ? 'left' : 'right';
    const type = solution.type === 'quarter'
      ? 'quarter_turn'
      : solution.type === 'double-quarter'
        ? 'double_quarter_turn'
        : 'straight';
    const stringerType = getSelectedStringerType();
    let steps = [];
    let outline = [];
    let flight1Steps = 0;
    let turnSteps = 0;
    let flight2Steps = 0;
    let turn1Steps = 0;
    let turn2Steps = 0;
    let flight3Steps = 0;
    let turnPositions = [];

    if (type === 'quarter_turn') {
      // Quart tournant simple : volée basse droite, 3 marches tournantes dans un carré,
      // puis volée haute à 90°. Les marches tournantes sont de vrais polygones en plan.
      turnSteps = Math.min(3, Math.max(0, stepCount - 2));
      turn1Steps = turnSteps;
      flight1Steps = Math.max(1, Math.floor((stepCount - turnSteps) * 0.55));
      flight2Steps = Math.max(1, stepCount - turnSteps - flight1Steps);
      if (flight1Steps + turnSteps + flight2Steps > stepCount) {
        flight2Steps = Math.max(0, stepCount - turnSteps - flight1Steps);
      }

      const dir = turnDirection === 'left' ? -1 : 1;
      const cornerX = flight1Steps * going;
      const mirrorY = (points) => points.map((point) => ({ x: point.x, y: point.y * dir }));
      let index = 1;

      for (let flightIndex = 0; flightIndex < flight1Steps; flightIndex += 1) {
        const x1 = flightIndex * going;
        const x2 = (flightIndex + 1) * going;
        steps.push({
          index,
          zone: 'flight_1',
          z: roundTo(index * riser, 1),
          topView: mirrorY([
            { x: x1, y: 0 },
            { x: x2, y: 0 },
            { x: x2, y: width },
            { x: x1, y: width }
          ])
        });
        index += 1;
      }

      const winderPolygons = [
        [
          { x: cornerX, y: 0 },
          { x: cornerX + width, y: 0 },
          { x: cornerX + width, y: width * 0.22 },
          { x: cornerX, y: width * 0.45 }
        ],
        [
          { x: cornerX, y: width * 0.45 },
          { x: cornerX + width, y: width * 0.22 },
          { x: cornerX + width, y: width * 0.62 },
          { x: cornerX + width * 0.38, y: width }
        ],
        [
          { x: cornerX + width * 0.38, y: width },
          { x: cornerX + width, y: width * 0.62 },
          { x: cornerX + width, y: width },
          { x: cornerX, y: width }
        ]
      ];

      winderPolygons.slice(0, turnSteps).forEach((polygon) => {
        steps.push({
          index,
          zone: 'turn_1',
          z: roundTo(index * riser, 1),
          topView: mirrorY(polygon)
        });
        index += 1;
      });

      for (let flightIndex = 0; flightIndex < flight2Steps; flightIndex += 1) {
        const y1 = width + flightIndex * going;
        const y2 = width + (flightIndex + 1) * going;
        steps.push({
          index,
          zone: 'flight_2',
          z: roundTo(index * riser, 1),
          topView: mirrorY([
            { x: cornerX, y: y1 },
            { x: cornerX + width, y: y1 },
            { x: cornerX + width, y: y2 },
            { x: cornerX, y: y2 }
          ])
        });
        index += 1;
      }

      outline = mirrorY([
        { x: 0, y: 0 },
        { x: cornerX + width, y: 0 },
        { x: cornerX + width, y: width + flight2Steps * going },
        { x: cornerX, y: width + flight2Steps * going },
        { x: cornerX, y: width },
        { x: 0, y: width }
      ]);
      turnPositions = [
        Object.assign({ label: 'V1' }, mirrorY([{ x: cornerX + width * 0.5, y: width * 0.5 }])[0])
      ];
    } else if (type === 'double_quarter_turn') {
      // Double quart tournant : première volée droite, premier virage 90°,
      // volée intermédiaire, deuxième virage 90°, puis troisième volée parallèle
      // en retour. Chaque virage utilise 3 marches polygonales indépendantes.
      turn1Steps = Math.min(3, Math.max(0, Math.floor((stepCount - 3) / 2)));
      turn2Steps = Math.min(3, Math.max(0, stepCount - turn1Steps - 3));
      const straightSteps = Math.max(0, stepCount - turn1Steps - turn2Steps);
      flight1Steps = straightSteps > 0 ? Math.max(1, Math.floor(straightSteps * 0.34)) : 0;
      flight2Steps = straightSteps - flight1Steps > 0 ? Math.max(1, Math.floor(straightSteps * 0.32)) : 0;
      flight3Steps = Math.max(0, straightSteps - flight1Steps - flight2Steps);

      const dir = turnDirection === 'left' ? -1 : 1;
      const mirrorY = (points) => points.map((point) => ({ x: point.x, y: point.y * dir }));
      const firstCornerX = flight1Steps * going;
      const middleStartY = width;
      const middleEndY = width + flight2Steps * going;
      let index = 1;

      for (let flightIndex = 0; flightIndex < flight1Steps; flightIndex += 1) {
        const x1 = flightIndex * going;
        const x2 = (flightIndex + 1) * going;
        steps.push({
          index,
          zone: 'flight_1',
          z: roundTo(index * riser, 1),
          topView: mirrorY([
            { x: x1, y: 0 },
            { x: x2, y: 0 },
            { x: x2, y: width },
            { x: x1, y: width }
          ])
        });
        index += 1;
      }

      const firstTurnPolygons = [
        [
          { x: firstCornerX, y: 0 },
          { x: firstCornerX + width, y: 0 },
          { x: firstCornerX + width, y: width * 0.22 },
          { x: firstCornerX, y: width * 0.45 }
        ],
        [
          { x: firstCornerX, y: width * 0.45 },
          { x: firstCornerX + width, y: width * 0.22 },
          { x: firstCornerX + width, y: width * 0.62 },
          { x: firstCornerX + width * 0.38, y: width }
        ],
        [
          { x: firstCornerX + width * 0.38, y: width },
          { x: firstCornerX + width, y: width * 0.62 },
          { x: firstCornerX + width, y: width },
          { x: firstCornerX, y: width }
        ]
      ];

      firstTurnPolygons.slice(0, turn1Steps).forEach((polygon) => {
        steps.push({
          index,
          zone: 'turn_1',
          z: roundTo(index * riser, 1),
          topView: mirrorY(polygon)
        });
        index += 1;
      });

      for (let flightIndex = 0; flightIndex < flight2Steps; flightIndex += 1) {
        const y1 = middleStartY + flightIndex * going;
        const y2 = middleStartY + (flightIndex + 1) * going;
        steps.push({
          index,
          zone: 'flight_2',
          z: roundTo(index * riser, 1),
          topView: mirrorY([
            { x: firstCornerX, y: y1 },
            { x: firstCornerX + width, y: y1 },
            { x: firstCornerX + width, y: y2 },
            { x: firstCornerX, y: y2 }
          ])
        });
        index += 1;
      }

      const secondTurnPolygons = [
        [
          { x: firstCornerX, y: middleEndY },
          { x: firstCornerX + width, y: middleEndY },
          { x: firstCornerX + width, y: middleEndY + width * 0.28 },
          { x: firstCornerX, y: middleEndY + width * 0.52 }
        ],
        [
          { x: firstCornerX, y: middleEndY + width * 0.52 },
          { x: firstCornerX + width, y: middleEndY + width * 0.28 },
          { x: firstCornerX + width, y: middleEndY + width * 0.68 },
          { x: firstCornerX + width * 0.42, y: middleEndY + width }
        ],
        [
          { x: firstCornerX + width * 0.42, y: middleEndY + width },
          { x: firstCornerX + width, y: middleEndY + width * 0.68 },
          { x: firstCornerX + width, y: middleEndY + width },
          { x: firstCornerX, y: middleEndY + width }
        ]
      ];

      secondTurnPolygons.slice(0, turn2Steps).forEach((polygon) => {
        steps.push({
          index,
          zone: 'turn_2',
          z: roundTo(index * riser, 1),
          topView: mirrorY(polygon)
        });
        index += 1;
      });

      for (let flightIndex = 0; flightIndex < flight3Steps; flightIndex += 1) {
        const x1 = firstCornerX - (flightIndex + 1) * going;
        const x2 = firstCornerX - flightIndex * going;
        steps.push({
          index,
          zone: 'flight_3',
          z: roundTo(index * riser, 1),
          topView: mirrorY([
            { x: x1, y: middleEndY },
            { x: x2, y: middleEndY },
            { x: x2, y: middleEndY + width },
            { x: x1, y: middleEndY + width }
          ])
        });
        index += 1;
      }

      outline = mirrorY([
        { x: 0, y: 0 },
        { x: firstCornerX + width, y: 0 },
        { x: firstCornerX + width, y: middleEndY + width },
        { x: firstCornerX - flight3Steps * going, y: middleEndY + width },
        { x: firstCornerX - flight3Steps * going, y: middleEndY },
        { x: firstCornerX, y: middleEndY },
        { x: firstCornerX, y: width },
        { x: 0, y: width }
      ]);
      turnPositions = [
        Object.assign({ label: 'V1' }, mirrorY([{ x: firstCornerX + width * 0.5, y: width * 0.5 }])[0]),
        Object.assign({ label: 'V2' }, mirrorY([{ x: firstCornerX + width * 0.5, y: middleEndY + width * 0.5 }])[0])
      ];
    } else {
      flight1Steps = stepCount;
      for (let index = 0; index < stepCount; index += 1) {
        const x1 = index * going;
        const x2 = (index + 1) * going;
        steps.push({
          index: index + 1,
          z: roundTo((index + 1) * riser, 1),
          topView: [
            { x: x1, y: 0 },
            { x: x2, y: 0 },
            { x: x2, y: width },
            { x: x1, y: width }
          ]
        });
      }
      outline = [
        { x: 0, y: 0 },
        { x: going * stepCount, y: 0 },
        { x: going * stepCount, y: width },
        { x: 0, y: width }
      ];
    }

    const allPoints = steps.flatMap((step) => step.topView).concat(outline);
    const minX = Math.min(...allPoints.map((point) => point.x), 0);
    const maxX = Math.max(...allPoints.map((point) => point.x), 1);
    const minY = Math.min(...allPoints.map((point) => point.y), 0);
    const maxY = Math.max(...allPoints.map((point) => point.y), 1);

    const model = {
      type,
      direction,
      turnDirection,
      turn1Direction: type === 'double_quarter_turn' ? turnDirection : null,
      turn2Direction: type === 'double_quarter_turn' ? turnDirection : null,
      flight1Steps,
      turnSteps,
      turn1Steps,
      flight2Steps,
      turn2Steps,
      flight3Steps,
      width,
      stringerType,
      totalHeight,
      setback,
      developedLength: going * stepCount,
      going,
      riser,
      slope: solution.slope || inputs.pente.value,
      stepCount,
      steps,
      outline,
      turnPositions,
      dimensions: {
        minX,
        maxX,
        minY,
        maxY,
        footprintX: maxX - minX,
        footprintY: maxY - minY,
        stairWidth: width,
        setback,
        totalHeight,
        riser,
        going,
        slope: solution.slope || inputs.pente.value,
        turnPositions
      },
      tremie: {
        length: inputs.tremieType === 'l' ? inputs.tremieLGrandeLongueur.geom : inputs.tremieLongueur.geom,
        width: inputs.tremieType === 'l' ? inputs.tremieLGrandeLargeur.geom : inputs.tremieLargeur.geom
      }
    };
    model.stringers = buildStringersFromModel(model);
    return model;
  }

  function getSelectedStringerType() {
    const structures = getCheckboxValues('structure');
    if (structures.includes('Limon central')) return 'central';
    if (structures.includes('Double limon')) return 'side';
    return 'none';
  }

  function modelBounds(model) {
    const points = model.steps.flatMap((step) => step.topView).concat(model.outline || []);
    return {
      minX: Math.min(...points.map((point) => point.x), 0),
      maxX: Math.max(...points.map((point) => point.x), 1),
      minY: Math.min(...points.map((point) => point.y), 0),
      maxY: Math.max(...points.map((point) => point.y), 1)
    };
  }

  function mapModelPoint(point, origin, scale) {
    return {
      x: origin.x + point.x * scale,
      y: origin.y + point.y * scale
    };
  }

  function polygonPoints(points, origin, scale) {
    return points.map((point) => {
      const mapped = mapModelPoint(point, origin, scale);
      return `${mapped.x},${mapped.y}`;
    }).join(' ');
  }

  function polygonCenter(points, origin, scale) {
    const center = points.reduce((acc, point) => ({
      x: acc.x + point.x / points.length,
      y: acc.y + point.y / points.length
    }), { x: 0, y: 0 });
    return mapModelPoint(center, origin, scale);
  }

  function polygonModelCenter(points) {
    return points.reduce((acc, point) => ({
      x: acc.x + point.x / points.length,
      y: acc.y + point.y / points.length
    }), { x: 0, y: 0 });
  }

  function edgeMidpoint(pointA, pointB) {
    return {
      x: (pointA.x + pointB.x) / 2,
      y: (pointA.y + pointB.y) / 2
    };
  }

  function buildStringersFromModel(model) {
    if (!model || model.stringerType === 'none' || !model.steps || model.steps.length < 1) {
      return { type: 'none', lines: [] };
    }

    if (model.stringerType === 'central') {
      return {
        type: 'central',
        lines: [{
          kind: 'central',
          points: model.steps.map((step) => polygonModelCenter(step.topView))
        }]
      };
    }

    if (model.stringerType === 'side') {
      // Les limons latéraux suivent les deux familles de bords de chaque marche.
      // Pour les marches tournantes, les milieux d'arêtes gardent une ligne lisible
      // sans recalculer une enveloppe complexe.
      const firstSide = model.steps.map((step) => edgeMidpoint(step.topView[0], step.topView[1]));
      const secondSide = model.steps.map((step) => edgeMidpoint(step.topView[3], step.topView[2]));
      return {
        type: 'side',
        lines: [
          { kind: 'side', points: firstSide },
          { kind: 'side', points: secondSide }
        ]
      };
    }

    return { type: 'none', lines: [] };
  }

  function renderStringersFromModel(model, origin, scale) {
    if (!model.stringers || !model.stringers.lines.length) return '';
    return model.stringers.lines.map((line) => {
      const className = line.kind === 'central' ? 'central-stringer-line' : 'side-stringer-line';
      const points = line.points
        .map((point) => mapModelPoint(point, origin, scale))
        .map((point) => `${point.x},${point.y}`)
        .join(' ');
      return `<polyline class="${className}" points="${points}"/>`;
    }).join('');
  }

  function renderStepNosingLines(model, origin, scale) {
    return model.steps.map((step) => {
      const pointA = mapModelPoint(step.topView[1], origin, scale);
      const pointB = mapModelPoint(step.topView[2], origin, scale);
      return `<line class="nosing-line" x1="${pointA.x}" y1="${pointA.y}" x2="${pointB.x}" y2="${pointB.y}"/>`;
    }).join('');
  }

  function renderTurnPositionDimensions(model, origin, scale, bounds, extentY1) {
    if (!model.turnPositions || !model.turnPositions.length) return '';
    const baselineStart = origin.x + bounds.minX * scale;
    return model.turnPositions.map((turn, index) => {
      const point = mapModelPoint(turn, origin, scale);
      const dimY = extentY1 - 28 - index * 22;
      return `<g>
        <line class="turn-marker-line" x1="${point.x}" y1="${extentY1}" x2="${point.x}" y2="${point.y}"/>
        <circle class="turn-marker-dot" cx="${point.x}" cy="${point.y}" r="4"/>
        ${cadDim(baselineStart, dimY, point.x, dimY, `${turn.label} ${Math.round(turn.x - bounds.minX)} mm`)}
      </g>`;
    }).join('');
  }

  function renderTopViewFromModel(model, box) {
    const bounds = modelBounds(model);
    const modelWidth = Math.max(bounds.maxX - bounds.minX, model.tremie.length, 1);
    const modelDepth = Math.max(bounds.maxY - bounds.minY, model.tremie.width, 1);
    const scale = cadScale(modelWidth, modelDepth, box.width - 150, box.height - 132);
    const drawingWidth = modelWidth * scale;
    const drawingDepth = modelDepth * scale;
    const origin = {
      x: box.x + (box.width - drawingWidth) / 2 - bounds.minX * scale,
      y: box.y + 74 + (box.height - 132 - drawingDepth) / 2 - bounds.minY * scale
    };
    const modelCenter = {
      x: bounds.minX + (bounds.maxX - bounds.minX) / 2,
      y: bounds.minY + (bounds.maxY - bounds.minY) / 2
    };
    const tremie = {
      x: origin.x + (modelCenter.x - model.tremie.length / 2) * scale,
      y: origin.y + (modelCenter.y - model.tremie.width / 2) * scale,
      width: Math.max(1, model.tremie.length * scale),
      height: Math.max(1, model.tremie.width * scale)
    };
    const stepPolygons = model.steps.map((step) => `<polygon class="stair-step-fill" points="${polygonPoints(step.topView, origin, scale)}"/>`).join('');
    const nosingLines = renderStepNosingLines(model, origin, scale);
    const stepNumbers = model.steps.map((step) => {
      const center = polygonCenter(step.topView, origin, scale);
      return `<text class="step-number" x="${center.x}" y="${center.y + 3.5}" text-anchor="middle">${step.index}</text>`;
    }).join('');
    const outline = model.outline && model.outline.length
      ? `<polygon class="stringer-shadow" points="${polygonPoints(model.outline, origin, scale)}"/>`
      : '';
    const stringers = renderStringersFromModel(model, origin, scale);
    const stepCenters = model.steps.map((step) => polygonCenter(step.topView, origin, scale));
    const firstCenter = stepCenters[0];
    const lastCenter = stepCenters[stepCenters.length - 1];
    const midCenter = stepCenters[Math.max(0, Math.floor(stepCenters.length * 0.55) - 1)];
    const travel = `<polyline class="walking-line" points="${stepCenters.map((point) => `${point.x},${point.y}`).join(' ')}" marker-end="url(#${svgMarkerPrefix}Arrow)"/>`;
    const extentX1 = origin.x + bounds.minX * scale;
    const extentX2 = origin.x + bounds.maxX * scale;
    const extentY1 = origin.y + bounds.minY * scale;
    const extentY2 = origin.y + bounds.maxY * scale;
    const turnDimensions = renderTurnPositionDimensions(model, origin, scale, bounds, extentY1);

    return `<g>
      <rect class="view-frame" x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}"/>
      <text class="view-title" x="${box.x + 14}" y="${box.y + 24}">VUE EN PLAN</text>
      <rect class="tremie-fill" x="${tremie.x}" y="${tremie.y}" width="${tremie.width}" height="${tremie.height}"/>
      ${stepPolygons}${nosingLines}${outline}${stringers}${stepNumbers}${travel}
      ${cadDim(extentX1, extentY2 + 42, extentX2, extentY2 + 42, `Emprise X ${Math.round(model.dimensions.footprintX)} mm`)}
      ${cadDim(extentX1 - 42, extentY1, extentX1 - 42, extentY2, `Emprise Y ${Math.round(model.dimensions.footprintY)} mm`, 'v')}
      ${cadDim(extentX2 + 32, extentY1, extentX2 + 32, extentY1 + model.width * scale, `Largeur ${Math.round(model.width)} mm`, 'v')}
      ${cadDim(tremie.x, tremie.y - 18, tremie.x + tremie.width, tremie.y - 18, `Trémie L ${Math.round(model.tremie.length)} mm`)}
      ${cadDim(tremie.x + tremie.width + 24, tremie.y, tremie.x + tremie.width + 24, tremie.y + tremie.height, `Trémie l ${Math.round(model.tremie.width)} mm`, 'v')}
      ${turnDimensions}
      <text class="caption" x="${tremie.x + tremie.width / 2}" y="${tremie.y - 8}" text-anchor="middle">Trémie</text>
      <text class="cad-tag" x="${midCenter.x + 12}" y="${midCenter.y - 12}">Montée</text>
    </g>`;
  }

  function renderSideViewFromModel(model, box) {
    const scale = cadScale(model.developedLength, model.totalHeight, box.width - 98, box.height - 96);
    const origin = {
      x: box.x + 74,
      y: box.y + box.height - 50
    };
    const stairPath = model.steps.reduce((path, step) => {
      const x = origin.x + step.index * model.going * scale;
      const y = origin.y - step.z * scale;
      return `${path} H ${x} V ${y}`;
    }, `M ${origin.x} ${origin.y}`);
    const runPx = model.developedLength * scale;
    const risePx = model.totalHeight * scale;

    return `<g>
      <rect class="view-frame" x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}"/>
      <text class="view-title" x="${box.x + 14}" y="${box.y + 24}">VUE DE CÔTÉ</text>
      <line class="cut-line" x1="${box.x + 36}" y1="${origin.y}" x2="${box.x + box.width - 34}" y2="${origin.y}"/>
      <rect class="slab-plate" x="${origin.x + runPx - 36}" y="${origin.y - risePx - 10}" width="128" height="12"/>
      <line class="cut-line" x1="${origin.x + runPx - 30}" y1="${origin.y - risePx}" x2="${origin.x + runPx + 92}" y2="${origin.y - risePx}"/>
      <path class="outline-line" d="${stairPath}"/>
      <line class="slope-line" x1="${origin.x}" y1="${origin.y}" x2="${origin.x + runPx}" y2="${origin.y - risePx}"/>
      ${cadDim(box.x + 44, origin.y - risePx, box.x + 44, origin.y, `Hauteur ${Math.round(model.totalHeight)} mm`, 'v')}
      ${cadDim(origin.x, origin.y + 28, origin.x + runPx, origin.y + 28, `Développé ${Math.round(model.developedLength)} mm`)}
      ${cadDim(origin.x, origin.y + 52, origin.x + model.going * scale, origin.y + 52, `Giron ${roundTo(model.going, 1)} mm`)}
      ${cadDim(origin.x + model.going * scale + 18, origin.y - model.riser * scale, origin.x + model.going * scale + 18, origin.y, `H ${roundTo(model.riser, 1)} mm`, 'v')}
      <text class="caption" x="${box.x + 40}" y="${origin.y + 22}">Sol bas</text>
      <text class="caption" x="${origin.x + runPx - 20}" y="${origin.y - risePx - 12}">Sol haut</text>
      <text class="cad-callout" x="${origin.x + runPx - 2}" y="${origin.y - risePx + 28}" text-anchor="end">Pente ${model.slope ? roundTo(model.slope, 1) : '—'}°</text>
    </g>`;
  }

  function renderDimensionsFromModel(model, values, x, y, width, height) {
    const typeLabel = model.type === 'quarter_turn'
      ? '1/4 tournant'
      : model.type === 'double_quarter_turn'
        ? '2/4 tournants'
        : 'Droit';
    const stringerLabel = model.stringerType === 'central'
      ? 'Central'
      : model.stringerType === 'side'
        ? 'Deux latéraux'
        : 'Aucun';
    const rows = [
      ['TYPE', typeLabel],
      ['MONTÉE', model.direction],
      ['LIMON', stringerLabel],
      ['MARCHES', `${model.stepCount}`],
      ['HAUTEUR TOTALE', `${Math.round(model.totalHeight)} mm`],
      ['H. MARCHE', `${roundTo(model.riser, 1)} mm`],
      ['GIRON', `${roundTo(model.going, 1)} mm`],
      ['PENTE', model.slope ? `${roundTo(model.slope, 1)} °` : formatMeasure(values.pente, '°')],
      ['LARGEUR', `${Math.round(model.width)} mm`],
      ['EMPRISE X', `${Math.round(model.dimensions.footprintX)} mm`],
      ['EMPRISE Y', `${Math.round(model.dimensions.footprintY)} mm`],
      ['TRÉMIE', `${Math.round(model.tremie.length)} x ${Math.round(model.tremie.width)} mm`]
    ];
    const rowH = (height - 74) / rows.length;
    return `<g>
      <rect class="schedule-box" x="${x}" y="${y}" width="${width}" height="${height}"/>
      <line class="schedule-line strong" x1="${x}" y1="${y + 42}" x2="${x + width}" y2="${y + 42}"/>
      <line class="schedule-line" x1="${x}" y1="${y + 66}" x2="${x + width}" y2="${y + 66}"/>
      <text class="brand-title" x="${x + 14}" y="${y + 28}">A2 MÉTAL</text>
      <text class="schedule-title" x="${x + width - 14}" y="${y + 25}" text-anchor="end">PLAN ESCALIER</text>
      <text class="schedule-label" x="${x + 14}" y="${y + 58}">Client</text>
      <text class="schedule-value" x="${x + width - 14}" y="${y + 58}" text-anchor="end">${escSvgText(values.client || '—')}</text>
      ${rows.map(([label, value], index) => {
        const rowY = y + 66 + index * rowH;
        return `<line class="schedule-line" x1="${x}" y1="${rowY}" x2="${x + width}" y2="${rowY}"/>
          <text class="schedule-label" x="${x + 12}" y="${rowY + rowH * 0.68}">${escSvgText(label)}</text>
          <text class="schedule-value" x="${x + width - 12}" y="${rowY + rowH * 0.68}" text-anchor="end">${escSvgText(value)}</text>`;
      }).join('')}
    </g>`;
  }

  function createViewTransform(bounds, box, marginRatio = 0.1) {
    const boundsWidth = Math.max(bounds.maxX - bounds.minX, 1);
    const boundsHeight = Math.max(bounds.maxY - bounds.minY, 1);
    const marginX = box.width * marginRatio;
    const marginY = box.height * marginRatio;
    const drawableWidth = Math.max(1, box.width - marginX * 2);
    const drawableHeight = Math.max(1, box.height - marginY * 2);
    const scale = Math.min(drawableWidth / boundsWidth, drawableHeight / boundsHeight);
    const drawnWidth = boundsWidth * scale;
    const drawnHeight = boundsHeight * scale;
    const offsetX = box.x + marginX + (drawableWidth - drawnWidth) / 2 - bounds.minX * scale;
    const offsetY = box.y + marginY + (drawableHeight - drawnHeight) / 2 - bounds.minY * scale;
    return {
      scale,
      map(point) {
        return {
          x: offsetX + point.x * scale,
          y: offsetY + point.y * scale
        };
      }
    };
  }

  function pointList(points, transform) {
    return points.map((point) => {
      const mapped = transform.map(point);
      return `${roundTo(mapped.x, 2)},${roundTo(mapped.y, 2)}`;
    }).join(' ');
  }

  function centerOfPoints(points) {
    return points.reduce((acc, point) => ({
      x: acc.x + point.x / points.length,
      y: acc.y + point.y / points.length
    }), { x: 0, y: 0 });
  }

  function renderCadDimension(x1, y1, x2, y2, label, orientation = 'h') {
    const tick = 12;
    if (orientation === 'v') {
      const textX = x1 - 14;
      return `<g class="cad-dim">
        <line class="cad-dim-ext" x1="${x1}" y1="${y1}" x2="${x1 - 26}" y2="${y1}"/>
        <line class="cad-dim-ext" x1="${x2}" y1="${y2}" x2="${x2 - 26}" y2="${y2}"/>
        <line class="cad-dim-line" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>
        <line class="cad-dim-line" x1="${x1 - tick / 2}" y1="${y1 + tick / 2}" x2="${x1 + tick / 2}" y2="${y1 - tick / 2}"/>
        <line class="cad-dim-line" x1="${x2 - tick / 2}" y1="${y2 + tick / 2}" x2="${x2 + tick / 2}" y2="${y2 - tick / 2}"/>
        <text class="cad-dim-text" x="${textX}" y="${(y1 + y2) / 2}" text-anchor="end">${escSvgText(label)}</text>
      </g>`;
    }
    return `<g class="cad-dim">
      <line class="cad-dim-ext" x1="${x1}" y1="${y1}" x2="${x1}" y2="${y1 + 26}"/>
      <line class="cad-dim-ext" x1="${x2}" y1="${y2}" x2="${x2}" y2="${y2 + 26}"/>
      <line class="cad-dim-line" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>
      <line class="cad-dim-line" x1="${x1 - tick / 2}" y1="${y1 + tick / 2}" x2="${x1 + tick / 2}" y2="${y1 - tick / 2}"/>
      <line class="cad-dim-line" x1="${x2 - tick / 2}" y1="${y2 + tick / 2}" x2="${x2 + tick / 2}" y2="${y2 - tick / 2}"/>
      <text class="cad-dim-text" x="${(x1 + x2) / 2}" y="${y1 - 10}" text-anchor="middle">${escSvgText(label)}</text>
    </g>`;
  }

  function renderCadViewFrame(box, title) {
    return `<rect class="cad-view-frame" x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}"/>
      <text class="cad-view-title" x="${box.x + 18}" y="${box.y + 34}">${escSvgText(title)}</text>`;
  }

  function renderPlanView(model, box, title = 'VUE EN PLAN') {
    const bounds = modelBounds(model);
    const modelCenter = {
      x: bounds.minX + (bounds.maxX - bounds.minX) / 2,
      y: bounds.minY + (bounds.maxY - bounds.minY) / 2
    };
    const planBounds = {
      minX: Math.min(bounds.minX, modelCenter.x - model.tremie.length / 2),
      maxX: Math.max(bounds.maxX, modelCenter.x + model.tremie.length / 2),
      minY: Math.min(bounds.minY, modelCenter.y - model.tremie.width / 2),
      maxY: Math.max(bounds.maxY, modelCenter.y + model.tremie.width / 2)
    };
    const transform = createViewTransform(planBounds, box, 0.16);
    const outline = model.outline && model.outline.length
      ? `<polygon class="cad-main-outline" points="${pointList(model.outline, transform)}"/>`
      : '';
    const steps = model.steps.map((step) => `<polygon class="cad-step" points="${pointList(step.topView, transform)}"/>`).join('');
    const nosings = model.steps.map((step) => {
      const a = transform.map(step.topView[1]);
      const b = transform.map(step.topView[2]);
      return `<line class="cad-nosing" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
    }).join('');
    const stepNumbers = model.steps.map((step, index) => {
      if (model.steps.length > 18 && index % 2 !== 0) return '';
      const center = transform.map(centerOfPoints(step.topView));
      return `<text class="cad-step-number" x="${center.x}" y="${center.y + 4}" text-anchor="middle">${step.index}</text>`;
    }).join('');
    const walkingPoints = model.steps.map((step) => transform.map(centerOfPoints(step.topView)));
    const walkingLine = `<polyline class="cad-walking-line" points="${walkingPoints.map((point) => `${point.x},${point.y}`).join(' ')}" marker-end="url(#${svgMarkerPrefix}Arrow)"/>`;
    const tremieTopLeft = transform.map({ x: modelCenter.x - model.tremie.length / 2, y: modelCenter.y - model.tremie.width / 2 });
    const tremieBottomRight = transform.map({ x: modelCenter.x + model.tremie.length / 2, y: modelCenter.y + model.tremie.width / 2 });
    const x1 = transform.map({ x: bounds.minX, y: bounds.minY }).x;
    const x2 = transform.map({ x: bounds.maxX, y: bounds.minY }).x;
    const y1 = transform.map({ x: bounds.minX, y: bounds.minY }).y;
    const y2 = transform.map({ x: bounds.minX, y: bounds.maxY }).y;
    const dimBottom = y2 + 46;
    const dimLeft = x1 - 46;
    const dimTop = Math.min(tremieTopLeft.y - 28, y1 - 30);
    const dimRight = tremieBottomRight.x + 34;

    return `<g>
      ${renderCadViewFrame(box, title)}
      <rect class="cad-hidden" x="${tremieTopLeft.x}" y="${tremieTopLeft.y}" width="${tremieBottomRight.x - tremieTopLeft.x}" height="${tremieBottomRight.y - tremieTopLeft.y}"/>
      ${steps}${nosings}${outline}${renderStringersFromModel(model, { x: transform.map({ x: 0, y: 0 }).x, y: transform.map({ x: 0, y: 0 }).y }, transform.scale)}${walkingLine}${stepNumbers}
      ${renderCadDimension(x1, dimBottom, x2, dimBottom, `${Math.round(model.dimensions.footprintX)} mm`)}
      ${renderCadDimension(dimLeft, y1, dimLeft, y2, `${Math.round(model.dimensions.footprintY)} mm`, 'v')}
      ${renderCadDimension(tremieTopLeft.x, dimTop, tremieBottomRight.x, dimTop, `Trémie ${Math.round(model.tremie.length)} mm`)}
      ${renderCadDimension(dimRight, tremieTopLeft.y, dimRight, tremieBottomRight.y, `${Math.round(model.tremie.width)} mm`, 'v')}
    </g>`;
  }

  function renderSideElevation(model, box, title = 'ÉLÉVATION PRINCIPALE') {
    const bounds = { minX: 0, maxX: model.developedLength, minY: -model.totalHeight, maxY: 0 };
    const transform = createViewTransform(bounds, box, 0.16);
    const baseStart = transform.map({ x: 0, y: 0 });
    const baseEnd = transform.map({ x: model.developedLength, y: 0 });
    const topStart = transform.map({ x: model.developedLength - 420, y: -model.totalHeight });
    const topEnd = transform.map({ x: model.developedLength + 360, y: -model.totalHeight });
    const stairPath = model.steps.reduce((path, step) => {
      const point = transform.map({ x: step.index * model.going, y: -step.z });
      return `${path} H ${point.x} V ${point.y}`;
    }, `M ${baseStart.x} ${baseStart.y}`);
    const slopeA = transform.map({ x: 0, y: 0 });
    const slopeB = transform.map({ x: model.developedLength, y: -model.totalHeight });
    const dimBottom = baseStart.y + 46;
    const dimLeft = baseStart.x - 46;
    const goingA = transform.map({ x: 0, y: 0 });
    const goingB = transform.map({ x: model.going, y: 0 });
    const riserTop = transform.map({ x: model.going, y: -model.riser });
    const riserBottom = transform.map({ x: model.going, y: 0 });

    return `<g>
      ${renderCadViewFrame(box, title)}
      <line class="cad-main-line" x1="${baseStart.x - 26}" y1="${baseStart.y}" x2="${baseEnd.x + 36}" y2="${baseEnd.y}"/>
      <line class="cad-main-line" x1="${topStart.x}" y1="${topStart.y}" x2="${topEnd.x}" y2="${topEnd.y}"/>
      <path class="cad-main-outline" d="${stairPath}"/>
      <line class="cad-secondary-line" x1="${slopeA.x}" y1="${slopeA.y}" x2="${slopeB.x}" y2="${slopeB.y}"/>
      ${renderCadDimension(dimLeft, slopeB.y, dimLeft, baseStart.y, `${Math.round(model.totalHeight)} mm`, 'v')}
      ${renderCadDimension(baseStart.x, dimBottom, baseEnd.x, dimBottom, `${Math.round(model.developedLength)} mm`)}
      ${renderCadDimension(goingA.x, dimBottom + 42, goingB.x, dimBottom + 42, `Giron ${roundTo(model.going, 1)} mm`)}
      ${renderCadDimension(riserBottom.x + 42, riserTop.y, riserBottom.x + 42, riserBottom.y, `H ${roundTo(model.riser, 1)} mm`, 'v')}
    </g>`;
  }

  function renderFrontElevation(model, box) {
    const bounds = { minX: 0, maxX: model.width, minY: -model.totalHeight, maxY: 0 };
    const transform = createViewTransform(bounds, box, 0.18);
    const leftBase = transform.map({ x: 0, y: 0 });
    const rightBase = transform.map({ x: model.width, y: 0 });
    const leftTop = transform.map({ x: 0, y: -model.totalHeight });
    const rightTop = transform.map({ x: model.width, y: -model.totalHeight });
    const dimBottom = leftBase.y + 42;
    const dimLeft = leftBase.x - 42;
    const riserLines = Array.from({ length: Math.min(model.stepCount, 14) }, (_, index) => {
      const ratio = (index + 1) / Math.min(model.stepCount, 14);
      const y = leftBase.y + (leftTop.y - leftBase.y) * ratio;
      return `<line class="cad-secondary-line" x1="${leftTop.x}" y1="${y}" x2="${rightTop.x}" y2="${y}"/>`;
    }).join('');
    return `<g>
      ${renderCadViewFrame(box, 'ÉLÉVATION DE FACE')}
      <rect class="cad-main-outline" x="${leftTop.x}" y="${leftTop.y}" width="${rightTop.x - leftTop.x}" height="${leftBase.y - leftTop.y}"/>
      ${riserLines}
      ${renderCadDimension(leftBase.x, dimBottom, rightBase.x, dimBottom, `Largeur ${Math.round(model.width)} mm`)}
      ${renderCadDimension(dimLeft, leftTop.y, dimLeft, leftBase.y, `${Math.round(model.totalHeight)} mm`, 'v')}
    </g>`;
  }

  function renderSecondaryView(model, box) {
    return renderPlanView(model, box, 'VUE COMPLÉMENTAIRE');
  }

  function renderTitleBlock(model, values, x, y, width, height) {
    const typeLabel = model.type === 'quarter_turn' ? '1/4 tournant' : model.type === 'double_quarter_turn' ? '2/4 tournants' : 'Droit';
    const stringerLabel = model.stringerType === 'central' ? 'Central' : model.stringerType === 'side' ? 'Latéraux' : 'Aucun';
    const rows = [
      ['Client', values.client || '—'],
      ['Chantier', values.chantier || '—'],
      ['Type', typeLabel],
      ['Marches', `${model.stepCount}`],
      ['Hauteur', `${Math.round(model.totalHeight)} mm`],
      ['H. marche', `${roundTo(model.riser, 1)} mm`],
      ['Giron', `${roundTo(model.going, 1)} mm`],
      ['Pente', model.slope ? `${roundTo(model.slope, 1)}°` : '—'],
      ['Largeur', `${Math.round(model.width)} mm`],
      ['Limon', stringerLabel]
    ];
    const headerH = 58;
    const rowH = (height - headerH) / rows.length;
    return `<g>
      <rect class="cad-title-block" x="${x}" y="${y}" width="${width}" height="${height}"/>
      <line class="cad-title-line" x1="${x}" y1="${y + headerH}" x2="${x + width}" y2="${y + headerH}"/>
      <text class="cad-title-brand" x="${x + 18}" y="${y + 35}">A2 MÉTAL</text>
      <text class="cad-title-small" x="${x + width - 18}" y="${y + 32}" text-anchor="end">PLAN ESCALIER</text>
      ${rows.map(([label, value], index) => {
        const rowY = y + headerH + index * rowH;
        return `<line class="cad-title-line" x1="${x}" y1="${rowY}" x2="${x + width}" y2="${rowY}"/>
          <text class="cad-title-label" x="${x + 14}" y="${rowY + rowH * 0.68}">${escSvgText(label)}</text>
          <text class="cad-title-value" x="${x + width - 14}" y="${rowY + rowH * 0.68}" text-anchor="end">${escSvgText(value)}</text>`;
      }).join('')}
    </g>`;
  }

  function renderCadSheet(model, values) {
    const width = 2970;
    const height = 2100;
    const topLeft = { x: 90, y: 130, width: 1300, height: 760 };
    const topRight = { x: 1510, y: 130, width: 1370, height: 760 };
    const bottomLeft = { x: 90, y: 1010, width: 1300, height: 760 };
    const bottomRight = { x: 1510, y: 1010, width: 900, height: 760 };
    return svgShell(width, height, `
      <rect class="cad-sheet-frame" x="55" y="55" width="${width - 110}" height="${height - 110}"/>
      <text class="cad-sheet-heading" x="90" y="100">PLAN TECHNIQUE ESCALIER - PRÉ-DIMENSIONNEMENT</text>
      ${renderSideElevation(model, topLeft)}
      ${renderPlanView(model, topRight)}
      ${renderFrontElevation(model, bottomLeft)}
      ${renderSecondaryView(model, bottomRight)}
      ${renderTitleBlock(model, values, 2440, 1010, 440, 760)}
    `);
  }

  function renderProfessionalStairPlan(values) {
    svgMarkerPrefix = 'cadPlan';
    if (!currentSelectedSolution) {
      renderEmptyPlan(topViewSvg);
      return;
    }
    const model = buildStairModel(currentSelectedSolution, values);
    topViewSvg.innerHTML = renderCadSheet(model, values);
  }

  function getCurrentPlanModel() {
    if (!currentSelectedSolution) {
      window.alert('Sélectionnez une solution puis cliquez sur "Voir le plan" avant d’exporter le PDF.');
      return null;
    }
    const values = getPlanValues();
    return {
      values,
      model: buildStairModel(currentSelectedSolution, values)
    };
  }

  function renderPdfPlanSvg(model, values, variant) {
    svgMarkerPrefix = 'pdfClient';
    return renderCadSheet(model, values);
  }

  function buildPdfDocument(model, values, variant) {
    const projectTitle = values.chantier || values.client || recordNameField.value.trim() || 'Projet escalier';
    const typeLabel = model.type === 'quarter_turn'
      ? '1/4 tournant'
      : model.type === 'double_quarter_turn'
        ? '2/4 tournants'
        : 'Droit';
    const stringerLabel = model.stringerType === 'central'
      ? 'Limon central'
      : model.stringerType === 'side'
        ? 'Deux limons latéraux'
        : 'Aucun limon sélectionné';
    const metaRows = [
      ['Client', values.client || '—'],
      ['Chantier', values.chantier || '—'],
      ['Date', values.date || '—'],
      ['Type escalier', typeLabel],
      ['Limon', stringerLabel],
      ['Dimensions', `H ${Math.round(model.totalHeight)} mm · Larg. ${Math.round(model.width)} mm`],
      ['Marches', `${model.stepCount} · H ${roundTo(model.riser, 1)} mm · Giron ${roundTo(model.going, 1)} mm`],
      ['Trémie', `${Math.round(model.tremie.length)} x ${Math.round(model.tremie.width)} mm`]
    ];
    const metaTable = `<table class="pdf-meta-table"><tbody>${metaRows.map(([label, value]) => `
      <tr>
        <th>${escSvgText(label)}</th>
        <td>${escSvgText(value)}</td>
      </tr>
    `).join('')}</tbody></table>`;
    return `<!doctype html>
      <html lang="fr">
      <head>
        <meta charset="utf-8">
        <title>PDF client escalier</title>
        <link rel="stylesheet" href="measurements.css">
        <style>
          @page { size: A4 landscape; margin: 8mm; }
          * { box-sizing: border-box; }
          html, body { margin: 0; padding: 0; background: #eef2f5; }
          body { color: #1f2933; font-family: "Segoe UI", Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .pdf-document { width: 100%; }
          .pdf-sheet {
            width: 281mm;
            min-height: 194mm;
            margin: 0 auto 12px;
            padding: 7mm;
            background: #fff;
            border: 1px solid #d8dee4;
          }
          .pdf-header {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 118mm;
            gap: 8mm;
            align-items: stretch;
            margin: 0 0 5mm;
          }
          .pdf-title-block {
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            min-height: 28mm;
            padding: 4mm 0;
            border-top: 2px solid #1f2933;
            border-bottom: 1px solid #1f2933;
          }
          .pdf-title-block p { margin: 0; color: #64727d; font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
          .pdf-title-block h1 { margin: 2mm 0 0; font-size: 18pt; line-height: 1.05; letter-spacing: -0.02em; }
          .pdf-version { color: #222222; font-size: 10pt; font-weight: 900; text-transform: uppercase; }
          .pdf-meta-table {
            width: 100%;
            height: 100%;
            border-collapse: collapse;
            border: 1px solid #1f2933;
            font-size: 8.2pt;
          }
          .pdf-meta-table th,
          .pdf-meta-table td {
            padding: 1.4mm 2mm;
            border: 1px solid #d8dee4;
            text-align: left;
            vertical-align: middle;
          }
          .pdf-meta-table th {
            width: 33%;
            color: #64727d;
            background: #f3f6f8;
            font-size: 7.3pt;
            text-transform: uppercase;
            letter-spacing: 0.04em;
          }
          .pdf-svg {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            height: 154mm;
            border: 1px solid #1f2933;
            overflow: hidden;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .pdf-svg svg {
            display: block;
            width: 100%;
            height: 100%;
            min-width: 0;
          }
          @media print {
            html, body { background: #fff; }
            .pdf-sheet { margin: 0; border: 0; box-shadow: none; page-break-after: always; }
            .pdf-sheet:last-child { page-break-after: auto; }
          }
        </style>
      </head>
      <body>
        <main class="pdf-document">
          <section class="pdf-sheet">
            <header class="pdf-header">
              <div class="pdf-title-block">
                <div>
                  <p>A2 MÉTAL · Plan client</p>
                  <h1>${escSvgText(projectTitle)}</h1>
                </div>
                <div class="pdf-version">Version client</div>
              </div>
              ${metaTable}
            </header>
            <div class="pdf-svg">${renderPdfPlanSvg(model, values, variant)}</div>
          </section>
        </main>
        <script>
          window.addEventListener('load', () => {
            window.setTimeout(() => window.print(), 250);
          });
        </script>
      </body>
      </html>`;
  }

  function exportStairPdf(variant) {
    const current = getCurrentPlanModel();
    if (!current) return;
    const popup = window.open('', '_blank');
    if (!popup) {
      window.alert('Le navigateur a bloqué la fenêtre d’export PDF.');
      return;
    }
    popup.document.open();
    popup.document.write(buildPdfDocument(current.model, current.values, variant));
    popup.document.close();
  }

  function renderTopPlan(values) {
    renderProfessionalStairPlan(values);
  }

  function renderPlans() {
    const values = getPlanValues();
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
    technicalSketches = Array.isArray(fields.technical_drawing_sketches) ? fields.technical_drawing_sketches.slice() : [];
    renderPhotos();
    syncTremieGroups();
    syncConfiguratorFromForm();
    renderPlans();
    updateSketchOwner();
    renderTechnicalSketches();
    refreshTechnicalSketchesFromServer();
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

  function updateSketchOwner() {
    if (!sketchRoot || !currentServerId) return;
    sketchRoot.dataset.sketchId = String(currentServerId);
    sketchRoot.dataset.sketchImageUrl = `/sketches/measurements/${currentServerId}.png`;
  }

  function escapeText(value) {
    return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  }

  function renderTechnicalSketches() {
    if (!sketchRoot) return;
    const list = sketchRoot.querySelector('[data-technical-sketch-list]');
    const legacy = sketchRoot.querySelector('[data-legacy-sketch]');
    if (legacy) {
      legacy.hidden = !currentServerId;
      if (currentServerId) {
        const img = legacy.querySelector('img');
        if (img) {
          legacy.hidden = false;
          img.onload = () => { legacy.hidden = false; };
          img.onerror = () => { legacy.hidden = true; };
          img.src = `/sketches/measurements/${currentServerId}.png?t=${Date.now()}`;
        }
      }
    }
    if (!list) return;
    if (!technicalSketches.length) {
      list.innerHTML = '<p class="technical-sketch-empty">Aucun croquis technique pour cette fiche.</p>';
      return;
    }
    list.innerHTML = technicalSketches.map((sketch, index) => {
      const title = sketch.title || `Croquis ${index + 1}`;
      const updated = sketch.updatedAt ? new Date(sketch.updatedAt).toLocaleString('fr-FR') : 'Non enregistré';
      return `
        <article class="technical-sketch-row">
          <div>
            <strong>${escapeText(title)}</strong>
            <span>Mis à jour : ${escapeText(updated)}</span>
          </div>
          <button type="button" data-open-technical-sketch="${escapeText(sketch.id)}">Ouvrir</button>
        </article>
      `;
    }).join('');
    list.querySelectorAll('[data-open-technical-sketch]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!currentServerId) await saveRecord();
        const sketchId = String(button.getAttribute('data-open-technical-sketch') || '').trim();
        if (currentServerId && sketchId) window.location.href = `/outils/prises-cotes/${currentServerId}/croquis/${encodeURIComponent(sketchId)}`;
      });
    });
  }

  async function refreshTechnicalSketchesFromServer() {
    if (!currentServerId) {
      renderTechnicalSketches();
      return;
    }
    try {
      const response = await fetch(`/api/measurements/${currentServerId}/croquis`);
      if (!response.ok) return;
      const data = await response.json();
      technicalSketches = Array.isArray(data.sketches) ? data.sketches : technicalSketches;
      renderTechnicalSketches();
    } catch {}
  }

  function initHandwrittenSketch() {
    if (document.getElementById('measurementSketchpad')) return;

    const section = document.createElement('section');
    section.id = 'measurementSketchpad';
    section.className = 'block measurement-sketchpad-card technical-sketch-card';
    section.innerHTML = [
      '<div class="block-title">',
      '<h3>Croquis techniques</h3>',
      '<p>Créez plusieurs croquis avancés avec texte, symboles, cotations et photo de fond.</p>',
      '</div>',
      '<div class="technical-sketch-actions">',
      '<button type="button" class="primary" data-new-technical-sketch>Nouveau croquis</button>',
      '<span class="technical-sketch-hint">La fiche est enregistrée avant ouverture du croquis.</span>',
      '</div>',
      '<div data-technical-sketch-list class="technical-sketch-list"></div>',
      '<figure data-legacy-sketch class="legacy-sketch-preview" hidden>',
      '<figcaption>Ancien croquis PNG conservé</figcaption>',
      '<img alt="Ancien croquis enregistré" />',
      '</figure>'
    ].join('');

    form.appendChild(section);
    sketchRoot = section;
    section.querySelector('[data-new-technical-sketch]').addEventListener('click', async () => {
      const id = await saveRecord();
      if (!id) {
        saveStatus.textContent = 'Impossible d’enregistrer la fiche avant le croquis';
        return;
      }
      const response = await fetch(`/api/measurements/${id}/croquis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `Croquis ${technicalSketches.length + 1}` }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok || !data.url) {
        saveStatus.textContent = data.error || 'Impossible de créer le croquis';
        return;
      }
      window.location.href = data.url;
    });
    renderTechnicalSketches();
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
      updateSketchOwner();
      payload.server_id = currentServerId;
      const refreshed = getStoredRecords();
      const refreshedIndex = refreshed.findIndex((entry) => entry.recordName === recordName);
      if (refreshedIndex >= 0) refreshed[refreshedIndex] = payload;
      saveStoredRecords(refreshed);
      saveStatus.textContent = `Enregistré - ${new Date(payload.updatedAt).toLocaleString('fr-FR')}`;
      refreshTechnicalSketchesFromServer();
      return currentServerId;
    } catch {
      saveStatus.textContent = 'Enregistré localement - serveur indisponible';
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
    if (sketchRoot) {
      delete sketchRoot.dataset.sketchId;
      delete sketchRoot.dataset.sketchImageUrl;
      technicalSketches = [];
      renderTechnicalSketches();
    }
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
  if (exportClientPdfBtn) {
    exportClientPdfBtn.addEventListener('click', () => exportStairPdf('client'));
  }
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

  form.querySelectorAll('input[name="structure"]').forEach((input) => {
    input.addEventListener('input', renderPlans);
    input.addEventListener('change', renderPlans);
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
  initHandwrittenSketch();
  syncTremieGroups();
  renderPlans();
  saveStatus.textContent = getStoredRecords().length
    ? 'Des fiches locales sont disponibles'
    : 'Aucune sauvegarde chargée';
})();
