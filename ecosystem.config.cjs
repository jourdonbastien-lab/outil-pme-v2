module.exports = {
  apps: [
    {
      name: 'outil-pme',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: 3000,
        TRUST_PROXY: 'true',
        SESSION_COOKIE_SECURE: 'true',
        SESSION_COOKIE_SAMESITE: 'lax',
        SESSION_MAX_AGE_DAYS: '30',
        SESSION_STORE_CLEAR_INTERVAL_MINUTES: '15',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
