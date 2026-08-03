'use strict';

function configureTrustProxy(app, trustProxy) {
  if (trustProxy) app.set('trust proxy', 1);
}

function configureMiddleware(app, dependencies = {}) {
  const {
    express, path, projectRoot, session, sessionSecret, sessionStore, trustProxy,
    sessionMaxAgeMs, sessionCookieSecure, sessionCookieSameSite
  } = dependencies;
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json({ limit: '15mb' }));
  app.use(express.static(path.join(projectRoot, 'public')));
  app.use(session({
    name: 'outil-pme.sid',
    secret: sessionSecret,
    store: sessionStore || undefined,
    proxy: trustProxy,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      maxAge: sessionMaxAgeMs,
      secure: sessionCookieSecure,
      httpOnly: true,
      sameSite: sessionCookieSameSite
    }
  }));
}

module.exports = { configureTrustProxy, configureMiddleware };
