'use strict';
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const current = fs.readFileSync('app/createApplication.js', 'utf8');
const routeNames = (source) => [...source.matchAll(/register[A-Za-z0-9_]+\(app/g)].map((match) => match[0]).filter((name) => name !== 'registerExpressErrorHandler(app');
const names = routeNames(current);
assert.strictEqual(names.length, 46);
assert.strictEqual(crypto.createHash('sha256').update(JSON.stringify(names)).digest('hex'), 'e51300f6e269c1ca5eb97dd152333df0dc7b9b47969e2715c2eb003377906fd4');
for (const marker of ["app.get('/test'", "app.get('/healthz'", "SELECT COUNT(*) AS c FROM tasks WHERE status != 'Terminée'", 'registerAuthRoutes(app', 'registerClientOrderRoutes(app']) {
  assert(current.includes(marker));
}
for (const marker of ["name: 'outil-pme.sid'", "limit: '15mb'", "express.urlencoded({ extended: true })", "express.static(path.join(projectRoot, 'public'))"]) {
  assert((current + fs.readFileSync('app/configureMiddleware.js', 'utf8')).includes(marker));
}
console.log('OK - compatibilité composition serveur');
