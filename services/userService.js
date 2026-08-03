'use strict';

function createUserService({ db } = {}) {
  function findUserByCredentials(username, password) {
    return db.prepare('SELECT * FROM users WHERE username = ? AND password = ?').get(username, password);
  }

  return { findUserByCredentials };
}

module.exports = { createUserService };
