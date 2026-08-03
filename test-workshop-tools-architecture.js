'use strict';

const assert = require('assert');
const fs = require('fs');

const server = (fs.readFileSync('server.js', 'utf8') + fs.readFileSync('app/createApplication.js', 'utf8'));
const routes = fs.readFileSync('routes/workshopTools.js', 'utf8');
const controller = fs.readFileSync('controllers/workshopToolsController.js', 'utf8');
const viewFiles = ['views/logibarreView.js', 'views/barreaudageView.js', 'views/logitoleView.js'];
const views = viewFiles.map((file) => fs.readFileSync(file, 'utf8'));
const urls = ['/outils/logibarre', '/outils/barreaudage', '/outils/logitole'];

for (const url of urls) {
  assert.strictEqual((routes.match(new RegExp(url.replace(/\//g, '\\/'), 'g')) || []).length, 1, `${url}: route unique attendue`);
  assert(!server.includes(`app.get('${url}'`), `${url}: route encore inline`);
}
assert(routes.indexOf(urls[0]) < routes.indexOf(urls[1]));
assert(routes.indexOf(urls[1]) < routes.indexOf(urls[2]));
assert(server.indexOf('registerMaterialsRoutes(app') < server.indexOf('registerWorkshopToolsRoutes(app'));
assert(server.indexOf('registerWorkshopToolsRoutes(app') < server.indexOf('registerProcessErrorHandlers(process, console)'));
assert.strictEqual((server.match(/registerWorkshopToolsRoutes\(app/g) || []).length, 1);

for (const name of ['function addRow()', 'function calculateBars()', 'function printBars()', 'function getRailingNumber(', 'function calculateBarreaudage()', 'function addSheetRow()', 'function calculateSheets()', 'function drawSheets(', 'function printSheets()']) {
  assert(!server.includes(name), `${name}: fonction client encore dans server.js`);
}
for (const [index, source] of views.entries()) {
  assert(!/\breq\.|\bres\./.test(source), `${viewFiles[index]}: accès Express interdit`);
  assert(!/require\(['"]\.\.\/server/.test(source), `${viewFiles[index]}: import server.js interdit`);
  assert(!/\bfs\.|\bpath\./.test(source), `${viewFiles[index]}: accès fichier interdit`);
  assert(!/SELECT |INSERT INTO |UPDATE |DELETE FROM /.test(source), `${viewFiles[index]}: SQL interdit`);
}
assert(!/require\(['"]\.\.\/server/.test(routes + controller));
assert(!/SELECT |INSERT INTO |UPDATE |DELETE FROM /.test(routes + controller));
assert(controller.includes("pageTemplate(req, 'Logibarre'"));
assert(controller.includes("pageTemplate(req, 'Barreaudage'"));
assert(controller.includes("pageTemplate(req, 'Logitôle'"));

console.log('OK - architecture outils atelier');
