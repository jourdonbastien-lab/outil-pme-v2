'use strict';

const assert = require('assert');
const fs = require('fs');
const { createWorkshopToolsController } = require('./controllers/workshopToolsController');

const calls = [];
const pageTemplate = (req, title, body) => { calls.push(['template', req, title, body]); return `PAGE:${title}:${body}`; };
const view = (name) => (dependencies) => { calls.push(['view', name, dependencies]); return `BODY:${name}`; };
const viewDependencies = { clientPageIcon() {} };
const controller = createWorkshopToolsController({
  pageTemplate,
  renderLogibarreView: view('logibarre'),
  renderBarreaudageView: view('barreaudage'),
  renderLogitoleView: view('logitole'),
  viewDependencies
});
const req = { path: '/test' };
const sent = [];
const res = { send(value) { sent.push(value); } };

controller.showLogibarre(req, res);
controller.showBarreaudage(req, res);
controller.showLogitole(req, res);

assert.deepStrictEqual(calls.filter((call) => call[0] === 'view').map((call) => [call[1], call[2]]), [
  ['logibarre', viewDependencies], ['barreaudage', viewDependencies], ['logitole', viewDependencies]
]);
assert.deepStrictEqual(calls.filter((call) => call[0] === 'template').map((call) => [call[1], call[2], call[3]]), [
  [req, 'Logibarre', 'BODY:logibarre'],
  [req, 'Barreaudage', 'BODY:barreaudage'],
  [req, 'Logitôle', 'BODY:logitole']
]);
assert.deepStrictEqual(sent, ['PAGE:Logibarre:BODY:logibarre', 'PAGE:Barreaudage:BODY:barreaudage', 'PAGE:Logitôle:BODY:logitole']);

const source = fs.readFileSync('controllers/workshopToolsController.js', 'utf8');
assert(!/<(?:section|script|canvas|svg)\b/i.test(source));
assert(!/SELECT |INSERT INTO |UPDATE |DELETE FROM /.test(source));

console.log('OK - contrôleur outils atelier');
