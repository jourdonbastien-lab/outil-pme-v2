'use strict';

const { createApplication } = require('./app/createApplication');
const { startApplication } = require('./app/startApplication');

const runtime = createApplication();
startApplication(runtime);
