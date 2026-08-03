'use strict';

function renderPcFilePreviewView(data) {
  const { rawUrl, isPdf } = data;
  return `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">

<style>
html,body{
  margin:0;
  height:100%;
}

.topbar{
  position:fixed;
  top:15px;
  right:15px;
  z-index:99999;
}

.close-btn{
  min-width:96px;
  height:44px;
  padding:0 18px;
  border:none;
  border-radius:999px;
  background:#ff7a00;
  color:#fff;
  font-size:15px;
  font-weight:bold;
  box-shadow:0 4px 12px rgba(0,0,0,.25);
}

iframe{
  width:100%;
  height:100vh;
  border:none;
}
</style>
</head>

<body>

<div class="topbar">
  <button class="close-btn" onclick="history.back()">Retour</button>
</div>

${isPdf
  ? `
    <embed
      src="${rawUrl}"
      type="application/pdf"
      width="100%"
      height="100%">
  `
  : `
    <iframe
      src="${rawUrl}">
    </iframe>
  `
}

</body>
</html>
`;
}

module.exports = { renderPcFilePreviewView };
