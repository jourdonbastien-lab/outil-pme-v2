(function () {
  const pathMatch = window.location.pathname.match(/\/outils\/prises-cotes\/(\d+)\/croquis\/([^/]+)$/);
  const measurementId = pathMatch ? Number(pathMatch[1]) : 0;
  const sketchId = pathMatch ? decodeURIComponent(pathMatch[2]) : '';
  const editorHost = document.getElementById('technicalSketchEditor');
  const contextLabel = document.getElementById('technicalSketchContext');
  const status = document.getElementById('technicalSketchStatus');
  const backLink = document.getElementById('technicalSketchBackLink');
  const saveTop = document.getElementById('technicalSketchSaveTop');
  let currentSketch = null;

  function setStatus(message, state) {
    if (!status) return;
    status.textContent = message;
    status.dataset.state = state || '';
  }

  function moduleRoute(moduleName) {
    const normalized = String(moduleName || '').toLowerCase();
    if (normalized.includes('clôture') || normalized.includes('cloture')) return '/outils/prises-cotes/cloture';
    if (normalized.includes('portail')) return '/outils/prises-cotes/portail';
    if (normalized.includes('garde')) return '/outils/prises-cotes/garde-corps';
    if (normalized.includes('pergola')) return '/outils/prises-cotes/pergola';
    if (normalized.includes('verrière') || normalized.includes('verriere')) return '/outils/prises-cotes/verriere';
    if (normalized.includes('autres')) return '/outils/prises-cotes/autres';
    if (normalized.includes('escalier v2')) return '/outils/prises-cotes/escalier-v2';
    return '/outils/prises-cotes/escalier';
  }

  function loadScriptOnce(src, globalName) {
    return new Promise((resolve, reject) => {
      if (globalName && typeof window[globalName] === 'function') {
        resolve();
        return;
      }
      const existing = document.querySelector(`script[data-engine-src="${src}"]`);
      if (existing) {
        existing.addEventListener('load', () => {
          if (globalName && typeof window[globalName] !== 'function') {
            reject(new Error(`Fichier chargé mais fonction absente: ${globalName}`));
            return;
          }
          resolve();
        }, { once: true });
        existing.addEventListener('error', () => reject(new Error(`Échec du chargement: ${src}`)), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.dataset.engineSrc = src;
      script.onload = () => {
        if (globalName && typeof window[globalName] !== 'function') {
          reject(new Error(`Fichier chargé mais fonction absente: ${globalName}`));
          return;
        }
        resolve();
      };
      script.onerror = () => reject(new Error(`Échec du chargement: ${src}`));
      document.head.appendChild(script);
    });
  }

  function assertEditorDomReady() {
    const requiredIds = [
      'openSketchBtn',
      'sketchModal',
      'sketchCanvas',
      'sketchSaveBtn',
      'sketchCloseBtn',
      'sketchToolbarLeft',
      'sketchPhotoPicker',
      'sketchSymbolPicker',
      'sketchTextDialog',
      'sketchDimensionDialog',
      'sketchInclinedDialog',
      'sketchAngleDialog',
    ];
    const missing = requiredIds.filter((id) => !document.getElementById(id));
    if (missing.length) {
      throw new Error(`Editeur incomplet, IDs manquants: ${missing.join(', ')}`);
    }
  }

  async function saveSketchFromEscalierEngine(sketchData, preview) {
    if (!currentSketch) return;
    setStatus('Enregistrement du croquis…', 'saving');
    const saveUrl = window.TECHNICAL_DRAWING_CONTEXT && window.TECHNICAL_DRAWING_CONTEXT.saveUrl
      ? window.TECHNICAL_DRAWING_CONTEXT.saveUrl
      : `/api/measurements/${measurementId}/croquis/${encodeURIComponent(sketchId)}`;
    const response = await fetch(saveUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: currentSketch.title,
        data: sketchData || {},
        preview: preview || '',
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || 'Erreur enregistrement croquis');
    currentSketch = result.sketch;
    setStatus('Croquis enregistré', 'saved');
  }

  async function init() {
    if (!measurementId || !sketchId || !editorHost) {
      setStatus('Croquis indisponible', 'error');
      return;
    }
    if (typeof window.createTechnicalDrawingCore !== 'function') {
      throw new Error('Dépendance absente: technical-drawing-core.js');
    }
    if (typeof window.getTechnicalDrawingTemplate !== 'function') {
      throw new Error('Dépendance absente: technical-drawing-template.js');
    }
    if (typeof window.initTechnicalDrawingEditor !== 'function') {
      throw new Error('Dépendance absente: technical-drawing-editor.js');
    }

    const response = await fetch(`/api/measurements/${measurementId}/croquis/${encodeURIComponent(sketchId)}`);
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) {
      setStatus(result.error || 'Croquis introuvable', 'error');
      return;
    }

    currentSketch = result.sketch;
    const measurement = result.measurement || {};
    if (contextLabel) {
      contextLabel.textContent = `${measurement.module || 'Prise de cotes'} · ${measurement.recordName || `Fiche #${measurementId}`} · ${currentSketch.title || 'Croquis'}`;
    }
    if (backLink) backLink.href = moduleRoute(measurement.module);
    editorHost.innerHTML = window.getTechnicalDrawingTemplate({ title: currentSketch.title || 'Croquis technique' });

    const saveUrl = `/api/measurements/${measurementId}/croquis/${encodeURIComponent(sketchId)}`;
    window.TECHNICAL_DRAWING_CONTEXT = {
      mode: 'croquis-technique',
      sheetId: measurementId,
      measurementId,
      sketchId,
      sketchName: currentSketch.title || 'Croquis technique',
      measurementType: measurement.module || 'Prise de cotes',
      returnUrl: backLink ? backLink.href : moduleRoute(measurement.module),
      saveUrl,
      drawingData: currentSketch.data || {},
      initialSketchData: currentSketch.data || {},
      photos: result.availablePhotos || [],
      availablePhotos: result.availablePhotos || [],
      saveCallback: saveSketchFromEscalierEngine,
      onDirtyChange(isDirty) {
        if (isDirty) setStatus('Modifications non enregistrées', 'dirty');
      },
      onStatus(message, state) {
        setStatus(message, state);
      },
    };

    assertEditorDomReady();
    await loadScriptOnce('/outils/prises-cotes/escalier-v2.js?v=20260717-1', 'initEscalierDrawingEngine');
    await window.initEscalierDrawingEngine({
      mode: 'croquis-technique',
      context: window.TECHNICAL_DRAWING_CONTEXT,
    });

    if (saveTop) saveTop.addEventListener('click', () => {
      if (window.TECHNICAL_DRAWING_API && typeof window.TECHNICAL_DRAWING_API.save === 'function') {
        window.TECHNICAL_DRAWING_API.save().catch((error) => setStatus(error.message || 'Erreur enregistrement', 'error'));
      }
    });
  }

  init().catch((error) => {
    const detail = error && error.message ? error.message : 'Erreur inconnue';
    setStatus(`Impossible de charger l’éditeur de croquis. Détail: ${detail}`, 'error');
  });
})();
