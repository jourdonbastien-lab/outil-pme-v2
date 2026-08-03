'use strict';

function renderLogitoleView({ clientPageIcon }) {
  return `
      <section class="panel workshop-calc-panel logitole-page">
  <div class="panel-header app-dark-tool-head">
    ${clientPageIcon('logitole', 'clients-title-icon')}
    <div>
      <h2>Calculateur de tôles</h2>
      <span>Optimisation de découpe</span>
    </div>
  </div>

  <div class="sheet-calc">

    <div class="workshop-param-grid sheet-param-grid">
    <div class="sheet-row workshop-field">
      <label>Largeur tôle</label>
      <input id="sheet-width" type="number" value="3000">
    </div>

    <div class="sheet-row workshop-field">
      <label>Hauteur tôle</label>
      <input id="sheet-height" type="number" value="1500">
    </div>

    <div class="sheet-row workshop-field">
      <label>Jeu / perte</label>
      <input id="sheet-gap" type="number" value="3">
    </div>
    </div>

    <h4 class="workshop-section-title">Pièces à découper</h4>

    <table class="workshop-pieces-table logitole-pieces-table">
      <thead>
        <tr>
          <th>Largeur</th>
          <th>Hauteur</th>
          <th>Qté</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="sheet-cuts-body">
        <tr>
          <td data-label="Largeur"><input type="number" value="500"></td>
          <td data-label="Hauteur"><input type="number" value="300"></td>
          <td data-label="Qté"><input type="number" value="1"></td>
          <td data-label=""><button type="button" class="workshop-delete-btn" aria-label="Supprimer la pièce" onclick="removeSheetRow(this)">×</button></td>
        </tr>
      </tbody>
    </table>

    <div class="workshop-actions">
      <button type="button" class="btn workshop-add-btn" onclick="addSheetRow()">+ Ajouter une pièce</button>
      <button type="button" class="btn primary workshop-calc-btn" onclick="calculateSheets()">Calculer</button>
      <button type="button" class="btn secondary workshop-print-btn" onclick="printSheets()">Imprimer</button>
    </div>

    <div id="sheet-result" class="workshop-result sheet-result"></div>

    <canvas id="sheet-canvas" class="workshop-sheet-canvas" width="900" height="500"
      style="border:1px solid #ccc; margin-top:12px;"></canvas>

  </div>
</section>

<script>
/* ======================
   AJOUT / SUPPRESSION
====================== */
function addSheetRow() {
  var tr = document.createElement('tr');
  tr.innerHTML =
    '<td data-label="Largeur"><input type="number" value="100"></td>' +
    '<td data-label="Hauteur"><input type="number" value="100"></td>' +
    '<td data-label="Qté"><input type="number" value="1"></td>' +
    '<td data-label=""><button type="button" class="workshop-delete-btn" aria-label="Supprimer la pièce" onclick="removeSheetRow(this)">×</button></td>';
  document.getElementById('sheet-cuts-body').appendChild(tr);
}

function removeSheetRow(btn) {
  btn.closest('tr').remove();
}

/* ======================
   CALCUL DES TÔLES
====================== */
function calculateSheets() {
  var W = Number(document.getElementById('sheet-width').value);
  var H = Number(document.getElementById('sheet-height').value);
  var gap = Number(document.getElementById('sheet-gap').value);

  var pieces = [];

  document.querySelectorAll('#sheet-cuts-body tr').forEach(function(tr) {
    var w = Number(tr.children[0].querySelector('input').value);
    var h = Number(tr.children[1].querySelector('input').value);
    var q = Number(tr.children[2].querySelector('input').value);

    for (var i = 0; i < q; i++) {
      pieces.push({ w: w + gap, h: h + gap });
    }
  });

  if (pieces.length === 0) {
    alert('Aucune pièce');
    return;
  }

  pieces.sort(function(a, b) {
    return Math.max(b.w, b.h) - Math.max(a.w, a.h);
  });

  var sheets = [];

  pieces.forEach(function(p) {
    var placed = false;

    sheets.forEach(function(sheet) {
      sheet.rows.forEach(function(row) {
        if (!placed && row.remaining >= p.w) {
          row.items.push(p);
          row.remaining -= p.w;
          placed = true;
        }
      });

      if (!placed && sheet.remaining >= p.h) {
        sheet.rows.push({
          remaining: W - p.w,
          items: [p],
          height: p.h
        });
        sheet.remaining -= p.h;
        placed = true;
      }
    });

    if (!placed) {
      sheets.push({
        remaining: H - p.h,
        rows: [{
          remaining: W - p.w,
          items: [p],
          height: p.h
        }]
      });
    }
  });

  var html = '<h4>' + sheets.length + ' tôle(s) nécessaire(s)</h4>';

  sheets.forEach(function(sheet, i) {
    html += '<div class="sheet-box"><strong>Tôle ' + (i + 1) + '</strong><br>';
    sheet.rows.forEach(function(row, j) {
      html += 'Bande ' + (j + 1) + ' : ';
      html += row.items.map(function(p) {
        return (p.w - gap) + '×' + (p.h - gap);
      }).join(' | ');
      html += '<br>';
    });
    html += '</div>';
  });

  document.getElementById('sheet-result').innerHTML = html;
  drawSheets(sheets, W, H, gap);
}

/* ======================
   DESSIN DES TÔLES
====================== */
function drawSheets(sheets, W, H, gap) {
  var canvas = document.getElementById('sheet-canvas');
  var ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  var margin = 20;
  var scale = Math.min(
    (canvas.width - margin * 2) / W,
    (canvas.height - margin * 2) / (H * sheets.length)
  );

  var offsetY = margin;

  sheets.forEach(function(sheet, i) {
    ctx.strokeRect(margin, offsetY, W * scale, H * scale);
    ctx.fillText('Tôle ' + (i + 1), margin, offsetY - 5);

    var y = offsetY;

    sheet.rows.forEach(function(row) {
      var x = margin;
      row.items.forEach(function(p) {
        var pw = (p.w - gap) * scale;
        var ph = (p.h - gap) * scale;

        ctx.fillStyle = '#cfe8ff';
        ctx.fillRect(x, y, pw, ph);
        ctx.strokeRect(x, y, pw, ph);

        ctx.fillStyle = '#000';
        ctx.fillText((p.w - gap) + '×' + (p.h - gap), x + 3, y + 12);

        x += pw;
      });
      y += row.height * scale;
    });

    offsetY += H * scale + margin;
  });
}

/* ======================
   IMPRESSION
====================== */
function printSheets() {
  var content = document.getElementById('sheet-result').innerHTML;
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
        '<title>Plan de découpe tôles</title>' +
        '<style>' +
          'body{font-family:Arial,sans-serif;padding:20px;}' +
          'h2{text-align:center;margin-bottom:15px;}' +
          '.sheet-box{border:1px solid #000;padding:10px;margin-bottom:8px;}' +
          '.print-toolbar{display:flex;gap:10px;align-items:center;justify-content:space-between;margin-bottom:12px;}' +
          '.print-toolbar a,.print-toolbar button{display:inline-flex;align-items:center;justify-content:center;padding:10px 14px;border:1px solid #999;border-radius:999px;background:#fff;color:#111;text-decoration:none;font:600 14px Arial,sans-serif;cursor:pointer;}' +
          '.print-toolbar button{background:#f3f4f6;}' +
          '@media print{.print-toolbar{display:none !important;}}' +
        '</style>' +
      '</head>' +
      '<body>' +
        '<div class="print-toolbar">' +
          '<a href="/outils/logitole">← Retour à LogiTôle</a>' +
          '<button type="button" onclick="window.print()">Imprimer</button>' +
        '</div>' +
        '<h2>Plan de découpe tôles</h2>' +
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

module.exports = { renderLogitoleView };

