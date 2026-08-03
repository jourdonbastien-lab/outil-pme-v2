'use strict';

function createAuthService({ userService } = {}) {
  function authenticateUser(username, password) {
    return userService.findUserByCredentials(username, password) || null;
  }

  function buildPendingMfaUser(user) {
    return { id: user.id, username: user.username, role: user.role };
  }

  function buildAuthenticatedSession(pendingUser) {
    return { id: pendingUser.id, username: pendingUser.username, role: pendingUser.role };
  }

  return { authenticateUser, buildPendingMfaUser, buildAuthenticatedSession };
}

module.exports = { createAuthService };
