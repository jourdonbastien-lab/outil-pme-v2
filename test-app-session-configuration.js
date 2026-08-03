'use strict';
const assert = require('assert');
const { configureMiddleware } = require('./app/configureMiddleware');
let captured;
configureMiddleware({ use() {} }, { express: { urlencoded() {}, json() {}, static() {} }, path: require('path'), projectRoot: '/project', session: (options) => { captured = options; }, sessionSecret: 'test-secret', sessionStore: null, trustProxy: false, sessionMaxAgeMs: 99, sessionCookieSecure: false, sessionCookieSameSite: 'strict' });
assert.deepStrictEqual(captured, { name: 'outil-pme.sid', secret: 'test-secret', store: undefined, proxy: false, resave: false, saveUninitialized: false, rolling: true, cookie: { maxAge: 99, secure: false, httpOnly: true, sameSite: 'strict' } });
console.log('OK - configuration session Express');
