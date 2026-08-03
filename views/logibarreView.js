'use strict';

function renderLogibarreView({ clientPageIcon }) {
  return `
     <section class="panel workshop-calc-panel logibarre-page">
  <div class="panel-header app-dark-tool-head">
    ${clientPageIcon('logibarre', 'clients-title-icon')}
    <div>
      <h2>Calculateur de barres</h2>
      <span>Optimisation des coupes</span>
    </div>
  </div>

  <div class="bar-calc">

    <div class="workshop-param-grid">
    <div class="bar-row workshop-field">
      <label>Longueur barre standard</label>
      <input id="bar-length" type="number" value="6000">
    </div>

    <div class="bar-row workshop-field">
      <label>Perte par coupe</label>
      <input id="bar-loss" type="number" value="3">
    </div>
    </div>

    <h4 class="workshop-section-title">Pièces à couper</h4>

    <table class="workshop-pieces-table logibarre-pieces-table">
      <thead>
        <tr>
          <th>Longueur (mm)</th>
          <th>Qté</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="cuts-body">
        <tr>
          <td data-label="Longueur"><input type="number" value="1200"></td>
          <td data-label="Qté"><input type="number" value="1"></td>
          <td data-label=""><button type="button" class="workshop-delete-btn" aria-label="Supprimer la coupe" onclick="removeRow(this)">×</button></td>
        </tr>
      </tbody>
    </table>

    <div class="workshop-actions">
      <button type="button" class="btn workshop-add-btn" onclick="addRow()">+ Ajouter une coupe</button>
      <button type="button" class="btn primary workshop-calc-btn" onclick="calculateBars()">Calculer</button>
      <button type="button" class="btn secondary workshop-print-btn" onclick="printBars()">Imprimer</button>
    </div>

    <div id="bar-result" class="workshop-result bar-result"></div>

  </div>
</section>

<script>
/* ======================
   AJOUT / SUPPRESSION
====================== */
function addRow() {
  var tr = document.createElement('tr');
  tr.innerHTML =
    '<td data-label="Longueur"><input type="number" value="1000"></td>' +
    '<td data-label="Qté"><input type="number" value="1"></td>' +
    '<td data-label=""><button type="button" class="workshop-delete-btn" aria-label="Supprimer la coupe" onclick="removeRow(this)">×</button></td>';
  document.getElementById('cuts-body').appendChild(tr);
}

function removeRow(btn) {
  btn.closest('tr').remove();
}

/* ======================
   CALCUL DES BARRES
====================== */
function calculateBars() {
  var barLength = Number(document.getElementById('bar-length').value);
  var loss = Number(document.getElementById('bar-loss').value);

  if (!barLength || barLength <= 0) {
    alert('Longueur de barre invalide');
    return;
  }

  var cuts = [];

  document.querySelectorAll('#cuts-body tr').forEach(function(tr) {
    var len = Number(tr.children[0].querySelector('input').value);
    var qty = Number(tr.children[1].querySelector('input').value);

    for (var i = 0; i < qty; i++) {
      cuts.push(len + loss);
    }
  });

  if (cuts.length === 0) {
    alert('Aucune coupe');
    return;
  }

  cuts.sort(function(a, b) {
    return b - a;
  });

  var bars = [];

  cuts.forEach(function(cut) {
    var placed = false;

    bars.forEach(function(bar) {
      if (!placed && bar.remaining >= cut) {
        bar.remaining -= cut;
        bar.cuts.push(cut);
        placed = true;
      }
    });

    if (!placed) {
      bars.push({
        remaining: barLength - cut,
        cuts: [cut]
      });
    }
  });

  var html = '<h4>' + bars.length + ' barre(s) nécessaire(s)</h4>';

  bars.forEach(function(bar, i) {
    html += '<div class="bar-box">';
    html += '<strong>Barre ' + (i + 1) + '</strong><br>';
    html += 'Coupes : ' + bar.cuts.map(function(c) {
      return c - loss;
    }).join(' + ');
    html += '<br>Reste : ' + bar.remaining + ' mm';
    html += '</div>';
  });

  document.getElementById('bar-result').innerHTML = html;
}

/* ======================
   IMPRESSION
====================== */
function printBars() {
  var content = document.getElementById('bar-result').innerHTML;
  if (!content) {
    alert('Rien à imprimer');
    return;
  }

  var win = window.open('', '', 'width=900,height=650');
  if (!win) {
    alert('Impossible d\\'ouvrir la fenêtre d\\'impression.');
    return;
  }

  var printHtml =
    '<!doctype html>' +
    '<html lang="fr">' +
      '<head>' +
        '<meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width, initial-scale=1">' +
        '<title>Plan de coupe barres</title>' +
        '<style>' +
          'body{font-family:Arial,sans-serif;padding:20px;}' +
          'h2{text-align:center;margin-bottom:15px;}' +
          '.bar-box{border:1px solid #000;padding:10px;margin-bottom:8px;}' +
          '.print-toolbar{display:flex;gap:10px;align-items:center;justify-content:space-between;margin-bottom:12px;}' +
          '.print-toolbar a,.print-toolbar button{display:inline-flex;align-items:center;justify-content:center;padding:10px 14px;border:1px solid #999;border-radius:999px;background:#fff;color:#111;text-decoration:none;font:600 14px Arial,sans-serif;cursor:pointer;}' +
          '.print-toolbar button{background:#f3f4f6;}' +
          '@media print{.print-toolbar{display:none !important;}}' +
        '</style>' +
      '</head>' +
      '<body>' +
        '<div class="print-toolbar">' +
          '<a href="/outils/logibarre">← Retour à LogiBarre</a>' +
          '<button type="button" onclick="window.print()">Imprimer</button>' +
        '</div>' +
        '<h2>Plan de coupe barres</h2>' +
        content +
      '</body>' +
    '</html>';

  win.document.open();
  win.document.write(printHtml);
  win.document.close();
  win.focus();
}
</script>
  `;
}

module.exports = { renderLogibarreView };

