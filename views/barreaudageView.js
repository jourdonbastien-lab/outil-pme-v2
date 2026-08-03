'use strict';

function renderBarreaudageView({ clientPageIcon }) {
  return `
      <section class="panel workshop-calc-panel barreaudage-page">
        <div class="panel-header app-dark-tool-head">
          ${clientPageIcon('barreaudage', 'clients-title-icon')}
          <div>
            <h2>Calcul barreaudage</h2>
            <span>Espacement et positions</span>
          </div>
        </div>

        <div class="barreaudage-calc">
          <div class="workshop-param-grid barreaudage-param-grid">
            <div class="workshop-field">
              <label>Longueur totale entre poteaux (mm)</label>
              <input id="railing-total-length" type="number" min="1" step="1" value="1500">
            </div>

            <div class="workshop-field">
              <label>Largeur d'un barreau (mm)</label>
              <input id="railing-bar-width" type="number" min="1" step="1" value="20">
            </div>

            <div class="workshop-field">
              <label>Espacement maximum autorisé (mm)</label>
              <input id="railing-max-space" type="number" min="1" step="1" value="110">
            </div>

            <div class="workshop-field">
              <label>Nombre de barreaux optionnel</label>
              <input id="railing-bar-count" type="number" min="1" step="1" placeholder="Auto">
            </div>
          </div>

          <div class="workshop-actions barreaudage-actions">
            <button type="button" class="btn primary workshop-calc-btn" onclick="calculateBarreaudage()">Calculer</button>
            <button type="button" class="btn secondary workshop-print-btn" onclick="resetBarreaudage()">Réinitialiser</button>
          </div>

          <div id="railing-result" class="workshop-result barreaudage-result"></div>
        </div>
      </section>

<script>
function getRailingNumber(id) {
  var value = String(document.getElementById(id).value || '').replace(',', '.');
  return Number(value);
}

function formatRailingMm(value) {
  if (!isFinite(value)) return '-';
  return Math.round(value * 10) / 10 + ' mm';
}

function findMinimumBars(totalLength, barWidth, maxSpace) {
  for (var count = 1; count <= 500; count++) {
    var spacing = (totalLength - count * barWidth) / (count + 1);
    if (spacing < 0) return count;
    if (spacing <= maxSpace) return count;
  }
  return 500;
}

function buildRailingDiagram(totalLength, barWidth, barCount, spacing, maxSpace) {
  var svgWidth = 760;
  var svgHeight = 220;
  var startX = 52;
  var baseY = 76;
  var visualWidth = 656;
  var railHeight = 96;
  var scale = totalLength > 0 ? visualWidth / totalLength : 1;
  var postWidth = 14;
  var barPx = Math.max(2, barWidth * scale);
  var gapPx = Math.max(0, spacing * scale);
  var html = '';

  html += '<svg class="barreaudage-svg" viewBox="0 0 ' + svgWidth + ' ' + svgHeight + '" role="img" aria-label="Schéma barreaudage">';
  html += '<rect x="0" y="0" width="' + svgWidth + '" height="' + svgHeight + '" rx="18" fill="#ffffff"/>';
  html += '<line x1="' + startX + '" y1="' + (baseY + 16) + '" x2="' + (startX + visualWidth) + '" y2="' + (baseY + 16) + '" stroke="#d1d5db" stroke-width="2"/>';
  html += '<line x1="' + startX + '" y1="' + (baseY + railHeight - 16) + '" x2="' + (startX + visualWidth) + '" y2="' + (baseY + railHeight - 16) + '" stroke="#d1d5db" stroke-width="2"/>';
  html += '<rect x="' + (startX - postWidth) + '" y="' + baseY + '" width="' + postWidth + '" height="' + railHeight + '" rx="3" fill="#111827"/>';
  html += '<rect x="' + (startX + visualWidth) + '" y="' + baseY + '" width="' + postWidth + '" height="' + railHeight + '" rx="3" fill="#111827"/>';

  var x = startX + gapPx;
  for (var i = 0; i < barCount; i++) {
    html += '<rect x="' + x + '" y="' + (baseY + 8) + '" width="' + barPx + '" height="' + (railHeight - 16) + '" rx="3" fill="#f97316"/>';
    x += barPx + gapPx;
  }

  html += '<line x1="' + startX + '" y1="190" x2="' + (startX + visualWidth) + '" y2="190" stroke="#f97316" stroke-width="1.5"/>';
  html += '<path d="M' + startX + ' 190 l8 -5 v10z" fill="#f97316"/>';
  html += '<path d="M' + (startX + visualWidth) + ' 190 l-8 -5 v10z" fill="#f97316"/>';
  html += '<text x="' + (startX + visualWidth / 2) + '" y="184" text-anchor="middle" fill="#111827" font-size="18" font-family="Arial, Helvetica, sans-serif">' + Math.round(totalLength) + ' mm entre poteaux</text>';
  html += '<text x="' + (startX + visualWidth / 2) + '" y="36" text-anchor="middle" fill="#475467" font-size="15" font-family="Arial, Helvetica, sans-serif">Espacement réel : ' + formatRailingMm(spacing) + ' / max ' + formatRailingMm(maxSpace) + '</text>';
  html += '</svg>';
  return html;
}

function buildRailingPositions(barCount, barWidth, spacing) {
  var positions = [];
  var centerDistance = barWidth + spacing;

  for (var i = 1; i <= barCount; i++) {
    var start = spacing + (i - 1) * centerDistance;
    var axis = start + barWidth / 2;
    var end = start + barWidth;

    positions.push({
      index: i,
      start: start,
      axis: axis,
      end: end
    });
  }

  return positions;
}

function buildRailingPositionsHtml(positions) {
  var rows = positions.map(function(pos) {
    return '<tr>' +
      '<td>Barreau ' + pos.index + '</td>' +
      '<td>' + formatRailingMm(pos.start) + '</td>' +
      '<td>' + formatRailingMm(pos.axis) + '</td>' +
      '<td>' + formatRailingMm(pos.end) + '</td>' +
    '</tr>';
  }).join('');

  var cards = positions.map(function(pos) {
    return '<article class="barreaudage-position-card">' +
      '<strong>Barreau ' + pos.index + '</strong>' +
      '<div><span>Début depuis poteau</span><b>' + formatRailingMm(pos.start) + '</b></div>' +
      '<div><span>Axe / entraxe</span><b>' + formatRailingMm(pos.axis) + '</b></div>' +
      '<div><span>Fin depuis poteau</span><b>' + formatRailingMm(pos.end) + '</b></div>' +
    '</article>';
  }).join('');

  return '<div class="barreaudage-positions">' +
    '<h3>Positions des barreaux</h3>' +
    '<div class="barreaudage-table-wrap">' +
      '<table class="barreaudage-positions-table">' +
        '<thead><tr><th>Barreau n°</th><th>Début depuis poteau</th><th>Axe / entraxe</th><th>Fin depuis poteau</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>' +
    '</div>' +
    '<div class="barreaudage-position-cards">' + cards + '</div>' +
  '</div>';
}

function calculateBarreaudage() {
  var totalLength = getRailingNumber('railing-total-length');
  var barWidth = getRailingNumber('railing-bar-width');
  var maxSpace = getRailingNumber('railing-max-space');
  var manualCountRaw = String(document.getElementById('railing-bar-count').value || '').trim();
  var manualCount = manualCountRaw ? Number(manualCountRaw.replace(',', '.')) : 0;

  if (!totalLength || totalLength <= 0 || !barWidth || barWidth <= 0 || !maxSpace || maxSpace <= 0) {
    alert('Renseigne une longueur, une largeur de barreau et un espacement maximum valides.');
    return;
  }

  var barCount = manualCount > 0 ? Math.floor(manualCount) : findMinimumBars(totalLength, barWidth, maxSpace);
  var spaces = barCount + 1;
  var occupied = barCount * barWidth;
  var spacing = (totalLength - occupied) / spaces;
  var centerDistance = barWidth + spacing;
  var positions = buildRailingPositions(barCount, barWidth, spacing);
  var isValid = spacing >= 0 && spacing <= maxSpace;
  var result = document.getElementById('railing-result');
  var statusClass = isValid ? 'ok' : 'warning';
  var statusText = isValid ? 'OK' : 'Attention';
  var detail = isValid
    ? 'L\\'espacement réel ne dépasse pas le maximum autorisé.'
    : 'L\\'espacement dépasse la limite ou les barreaux sont trop larges pour la longueur saisie.';

  result.innerHTML =
    '<div class="barreaudage-summary">' +
      '<div class="barreaudage-status ' + statusClass + '">' + statusText + '</div>' +
      '<div><span>Nombre de barreaux</span><strong>' + barCount + '</strong></div>' +
      '<div><span>Nombre d\\'espaces</span><strong>' + spaces + '</strong></div>' +
      '<div><span>Espacement réel</span><strong>' + formatRailingMm(spacing) + '</strong></div>' +
      '<div><span>Entraxe barreaux</span><strong>' + formatRailingMm(centerDistance) + '</strong></div>' +
      '<div><span>Longueur occupée</span><strong>' + formatRailingMm(occupied) + '</strong></div>' +
    '</div>' +
    '<p class="barreaudage-note">' + detail + '</p>' +
    '<div class="barreaudage-diagram">' + buildRailingDiagram(totalLength, barWidth, barCount, spacing, maxSpace) + '</div>' +
    buildRailingPositionsHtml(positions);
}

function resetBarreaudage() {
  document.getElementById('railing-total-length').value = 1500;
  document.getElementById('railing-bar-width').value = 20;
  document.getElementById('railing-max-space').value = 110;
  document.getElementById('railing-bar-count').value = '';
  document.getElementById('railing-result').innerHTML = '';
}
</script>
  `;
}

module.exports = { renderBarreaudageView };

