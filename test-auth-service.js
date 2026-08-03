'use strict';
const assert = require('assert');
const { createAuthService } = require('./services/authService');
const users = [{ id: 1, username: 'AdminTest', password: 'secret-test', role: 'admin' }, { id: 2, username: 'AtelierTest', password: 'atelier-test', role: 'atelier' }];
const service = createAuthService({ userService: { findUserByCredentials: (username, password) => users.find((u) => u.username === username && u.password === password) } });
assert.strictEqual(service.authenticateUser('Absent', 'x'), null);
assert.strictEqual(service.authenticateUser('AdminTest', 'incorrect'), null);
for (const user of users) {
  assert.strictEqual(service.authenticateUser(user.username, user.password), user);
  assert.deepStrictEqual(service.buildPendingMfaUser(user), { id: user.id, username: user.username, role: user.role });
  assert.deepStrictEqual(service.buildAuthenticatedSession(user), { id: user.id, username: user.username, role: user.role });
}
console.log('OK - service authentification');
