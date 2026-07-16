(function () {
  window.getTechnicalDrawingTemplate = function getTechnicalDrawingTemplate(options = {}) {
    const title = String(options.title || 'Croquis technique');
    return `
      <section class="technical-drawing-card">
        <div class="technical-drawing-card-head">
          <div>
            <p class="technical-drawing-kicker">PRISE DE COTES</p>
            <h3>${title}</h3>
            <p>Dessin libre, tracé automatique, cotations, texte, symboles et fond photo.</p>
          </div>
          <div class="technical-drawing-actions">
            <select id="technicalDrawingSketchSelect" aria-label="Croquis"></select>
            <button type="button" id="technicalDrawingAddSketchBtn">Ajouter</button>
            <button type="button" id="technicalDrawingRenameSketchBtn">Renommer</button>
            <button type="button" id="technicalDrawingDeleteSketchBtn">Supprimer</button>
            <button type="button" id="openSketchBtn" class="primary">Ouvrir le croquis</button>
          </div>
        </div>
        <p id="sketchStatusInline" class="technical-drawing-inline-status">Prêt</p>
      </section>

      <div id="sketchModal" class="sketch-modal" hidden aria-hidden="true">
        <div class="sketch-modal-content" role="dialog" aria-modal="true" aria-label="Éditeur de croquis technique">
          <div class="sketch-top-actions">
            <button type="button" id="sketchToolbarToggle" class="sketch-toolbar-toggle" aria-expanded="true" aria-label="Masquer la barre d'outils" title="Masquer la barre d'outils">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <button type="button" id="undoSketchBtn" class="sketch-action-btn" aria-label="Annuler" title="Annuler">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14l-4-4 4-4" /><path d="M5 10h9a5 5 0 0 1 5 5v1" /></svg>
            </button>
            <button type="button" id="redoSketchBtn" class="sketch-action-btn" aria-label="Rétablir" title="Rétablir">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 14l4-4-4-4" /><path d="M19 10h-9a5 5 0 0 0-5 5v1" /></svg>
            </button>
            <button type="button" id="sketchSaveBtn" class="sketch-save-btn" aria-label="Enregistrer" title="Enregistrer">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l4 4L19 6" /></svg>
            </button>
            <button type="button" id="sketchCloseBtn" class="sketch-close-btn" aria-label="Fermer" title="Fermer">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6L6 18" /></svg>
            </button>
          </div>
          <div class="sketch-command-bar">
            <span id="sketchStatus" class="sketch-status">Prêt</span>
            <span id="sketchBgLabel" class="sketch-bg-label">Fond: aucun</span>
            <div class="sketch-viewport-controls" id="sketchViewportControls">
              <button type="button" id="sketchZoomOutBtn" aria-label="Dézoomer" title="Dézoomer">−</button>
              <span id="sketchZoomLabel">100 %</span>
              <button type="button" id="sketchZoomInBtn" aria-label="Zoomer" title="Zoomer">+</button>
              <button type="button" id="sketchFitBtn">Adapter</button>
            </div>
          </div>
          <div class="sketch-toolbar-left" id="sketchToolbarLeft">
            <button type="button" id="toolPenBtn" class="is-active sketch-icon-btn sketch-tool-wide" aria-label="Main libre" title="Main libre" aria-pressed="true">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20z" /><path d="M14 7l3 3" /></svg><span>Main libre</span>
            </button>
            <button type="button" class="sketch-icon-btn sketch-tool-wide" data-sketch-tool="pan" aria-label="Déplacer" title="Déplacer" aria-pressed="false">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18" /><path d="M3 12h18" /></svg><span>Déplacer</span>
            </button>
            <button type="button" id="toolEraserBtn" class="sketch-icon-btn sketch-tool-wide" aria-label="Gomme" title="Gomme" aria-pressed="false">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16l8-8 6 6-5 5H7l-3-3z" /><path d="M10 19h10" /></svg><span>Effacer</span>
            </button>
            <button type="button" class="sketch-icon-btn sketch-tool-wide" data-sketch-tool="auto_trace" aria-label="Tracé automatique" title="Tracé automatique" aria-pressed="false">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 18V7" /><path d="M5 7h10" /><path d="M15 7v10" /><path d="M15 17h4" /></svg><span>Tracé auto</span>
            </button>
            <button type="button" class="sketch-icon-btn sketch-tool-wide" data-sketch-tool="inclined_trace" aria-label="Trait incliné" title="Trait incliné" aria-pressed="false">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 18L19 6" /><path d="M6 6h12v12" /></svg><span>Trait incliné</span>
            </button>
            <button type="button" class="sketch-icon-btn sketch-tool-wide" data-sketch-tool="auto_dimension" aria-label="Cotation" title="Cotation" aria-pressed="false">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 17h14" /><path d="M7 14l-2 3 2 3" /><path d="M17 14l2 3-2 3" /></svg><span>Cotation</span>
            </button>
            <button type="button" class="sketch-icon-btn sketch-tool-wide" data-sketch-tool="angle_dimension" aria-label="Cotation d’angle" title="Cotation d’angle" aria-pressed="false">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 18V6" /><path d="M6 18h12" /><path d="M10 18a4 4 0 0 0-4-4" /></svg><span>Cotation angle</span>
            </button>
            <button type="button" class="sketch-icon-btn sketch-tool-wide" data-sketch-tool="text" aria-label="Texte" title="Texte" aria-pressed="false">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14" /><path d="M12 5v14" /><path d="M8 19h8" /></svg><span>Texte</span>
            </button>
            <button type="button" id="openSketchSymbolBtn" class="sketch-icon-btn sketch-tool-wide" aria-label="Symboles métier" title="Symboles métier">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h6v6H5z" /><path d="M13 5h6v6h-6z" /><path d="M5 13h6v6H5z" /><path d="M13 16h6" /><path d="M16 13v6" /></svg><span>Symboles</span>
            </button>
            <button type="button" id="useSketchPhotoBtn" class="sketch-icon-btn sketch-tool-wide" aria-label="Choisir une photo de fond" title="Choisir une photo de fond">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14v10H5z" /><path d="M8 14l2.5-3 2 2 1.5-2 2 3" /></svg><span>Photo</span>
            </button>
            <button type="button" id="removeSketchPhotoBtn" class="sketch-icon-btn sketch-tool-wide" aria-label="Retirer la photo de fond" title="Retirer la photo de fond">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14v10H5z" /><path d="M4 4l16 16" /></svg><span>Retirer</span>
            </button>
            <div class="sketch-toolbar-card">
              <span class="sketch-toolbar-label">Couleur</span>
              <div class="sketch-toolbar-palette" id="sketchColorPalette">
                <button type="button" data-sketch-color="#111827" class="is-active" aria-label="Noir" title="Noir" aria-pressed="true"></button>
                <button type="button" data-sketch-color="#dc2626" aria-label="Rouge" title="Rouge" aria-pressed="false"></button>
                <button type="button" data-sketch-color="#2563eb" aria-label="Bleu" title="Bleu" aria-pressed="false"></button>
                <button type="button" data-sketch-color="#059669" aria-label="Vert" title="Vert" aria-pressed="false"></button>
                <button type="button" data-sketch-color="#7c3aed" aria-label="Violet" title="Violet" aria-pressed="false"></button>
              </div>
            </div>
            <div class="sketch-toolbar-card">
              <span class="sketch-toolbar-label">Trait</span>
              <div class="sketch-toolbar-sizes" id="sketchSizePalette">
                <button type="button" data-sketch-size="2" class="is-active" aria-label="Epaisseur fine" title="Epaisseur fine" aria-pressed="true"><span></span></button>
                <button type="button" data-sketch-size="4" aria-label="Epaisseur moyenne" title="Epaisseur moyenne" aria-pressed="false"><span></span></button>
                <button type="button" data-sketch-size="7" aria-label="Epaisseur epaisse" title="Epaisseur epaisse" aria-pressed="false"><span></span></button>
                <button type="button" data-sketch-size="11" aria-label="Epaisseur XL" title="Epaisseur XL" aria-pressed="false"><span></span></button>
              </div>
            </div>
            <button type="button" id="clearSketchBtn" class="sketch-clear-btn sketch-icon-btn sketch-tool-wide" aria-label="Effacer le croquis" title="Effacer le croquis">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M6 7l1 14h10l1-14" /><path d="M9 7V4h6v3" /></svg><span>Tout effacer</span>
            </button>
          </div>
          <div id="sketchAutoTraceControls" class="sketch-auto-trace-controls" hidden aria-hidden="true">
            <label class="sketch-auto-scale-field"><span>Échelle visuelle</span><select id="autoTraceScaleSelect"><option value="auto">Automatique</option><option value="10">1:10</option><option value="20">1:20</option><option value="25">1:25</option><option value="50">1:50</option><option value="100">1:100</option></select></label>
            <button type="button" id="scaleAutoTraceBtn">Mettre à l’échelle</button>
            <span id="autoTraceScaleLabel" class="sketch-auto-scale-label">Échelle visuelle : non appliquée</span>
            <button type="button" id="finishAutoTraceBtn">✓ Terminer le tracé</button>
            <button type="button" id="undoAutoTraceBtn">Annuler le dernier segment</button>
            <button type="button" id="cancelAutoTraceBtn">Annuler le tracé</button>
          </div>
          <div id="sketchSymbolControls" class="sketch-symbol-controls" hidden aria-hidden="true">
            <button type="button" id="sketchSymbolSmallerBtn" aria-label="Réduire le symbole" title="Réduire le symbole">−</button>
            <button type="button" id="sketchSymbolLargerBtn" aria-label="Agrandir le symbole" title="Agrandir le symbole">+</button>
            <button type="button" id="sketchSymbolDeleteBtn" aria-label="Supprimer le symbole" title="Supprimer le symbole">Suppr.</button>
          </div>
          <div id="sketchPhotoPickerBackdrop" class="sketch-photo-picker-backdrop" hidden aria-hidden="true"></div>
          <div id="sketchPhotoPicker" class="sketch-photo-picker" hidden aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="sketchPhotoPickerTitle">
            <div class="sketch-photo-picker-head"><strong id="sketchPhotoPickerTitle">Choisir une photo de fond</strong><button type="button" id="closeSketchPhotoPickerBtn">Fermer</button></div>
            <div id="sketchPhotoPickerList" class="sketch-photo-picker-list"></div>
          </div>
          <div id="sketchSymbolPickerBackdrop" class="sketch-symbol-picker-backdrop" hidden aria-hidden="true"></div>
          <div id="sketchSymbolPicker" class="sketch-symbol-picker" hidden aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="sketchSymbolPickerTitle">
            <div class="sketch-symbol-picker-head"><strong id="sketchSymbolPickerTitle">Bibliothèque de symboles</strong><button type="button" id="closeSketchSymbolPickerBtn">Fermer</button></div>
            <div id="sketchSymbolPickerList" class="sketch-symbol-picker-list"></div>
          </div>
          <div class="sketch-canvas-wrap"><canvas id="sketchCanvas" aria-label="Zone de croquis technique"></canvas></div>
          <div id="sketchTextDialog" class="sketch-text-dialog" hidden aria-hidden="true" role="dialog" aria-modal="true"><div class="sketch-text-dialog-card"><strong id="sketchTextDialogTitle">Annotation</strong><textarea id="sketchTextInput" rows="3" placeholder="Saisir le texte"></textarea><div class="sketch-text-dialog-actions"><button type="button" id="sketchTextCancelBtn">Annuler</button><button type="button" id="sketchTextConfirmBtn">Valider</button></div></div></div>
          <div id="sketchDimensionDialog" class="sketch-text-dialog" hidden aria-hidden="true" role="dialog" aria-modal="true"><div class="sketch-text-dialog-card"><strong>Cote du trait</strong><label class="sketch-dimension-field"><span>Longueur réelle en mm</span><input id="sketchDimensionInput" type="number" inputmode="decimal" min="0" step="1" placeholder="1250" /></label><p id="sketchDimensionSideLabel" class="sketch-dimension-side-label">Côté : automatique</p><div class="sketch-text-dialog-actions sketch-dimension-actions"><button type="button" id="sketchDimensionSaveBtn">Enregistrer</button><button type="button" id="sketchDimensionSideBtn">Changer de côté</button><button type="button" id="sketchDimensionDeleteBtn">Supprimer</button><button type="button" id="sketchDimensionCancelBtn">Annuler</button></div></div></div>
          <div id="sketchInclinedDialog" class="sketch-text-dialog" hidden aria-hidden="true" role="dialog" aria-modal="true"><div class="sketch-text-dialog-card"><strong>Trait incliné</strong><label class="sketch-dimension-field"><span>Angle en degrés</span><input id="sketchInclinedAngleInput" type="number" inputmode="decimal" step="0.1" placeholder="32.5" /></label><label class="sketch-dimension-field"><span>Longueur réelle en mm</span><input id="sketchInclinedLengthInput" type="number" inputmode="decimal" min="0" step="1" placeholder="1250" /></label><div class="sketch-text-dialog-actions sketch-dimension-actions"><button type="button" id="sketchInclinedSaveBtn">Créer le trait</button><button type="button" id="sketchInclinedCancelBtn">Annuler</button></div></div></div>
          <div id="sketchAngleDialog" class="sketch-text-dialog" hidden aria-hidden="true" role="dialog" aria-modal="true"><div class="sketch-text-dialog-card"><strong>Cotation d’angle</strong><p id="sketchAngleDialogValue" class="sketch-dimension-side-label">Angle : --</p><label class="sketch-dimension-field"><span>Modifier l’angle en degrés</span><input id="sketchAngleInput" type="number" inputmode="decimal" min="0" max="360" step="0.1" placeholder="45" /></label><div class="sketch-text-dialog-actions sketch-dimension-actions"><button type="button" id="sketchAngleInvertBtn">Inverser l’angle</button><button type="button" id="sketchAngleApplyBtn">Appliquer</button><button type="button" id="sketchAngleDeleteBtn">Supprimer</button><button type="button" id="sketchAngleCloseBtn">Fermer</button></div></div></div>
        </div>
      </div>
    `;
  };
})();
