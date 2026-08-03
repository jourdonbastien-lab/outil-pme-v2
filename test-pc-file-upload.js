'use strict';

const assert = require('assert');
const { createPcFileUpload } = require('./middleware/pcFileUpload');

let storageConfig;
let multerConfig;
const multer = (config) => { multerConfig = config; return { single: (field) => field }; };
multer.diskStorage = (config) => { storageConfig = config; return config; };
let requested;
const pcFilesService = {
  resolveUploadContext(params, options) {
    requested = { params, options };
    return { directory: '/clients/A/B/Plans' };
  }
};
const upload = createPcFileUpload({ multer, pcFilesService, safeSegment: (name) => name.replace(/ /g, '_') });
assert.strictEqual(upload.single('file'), 'file');
assert.deepStrictEqual(Object.keys(multerConfig), ['storage']);
storageConfig.destination({ params: { client: 'A', order: 'B', type: 'Plans' } }, {}, (error, directory) => {
  assert.ifError(error);
  assert.strictEqual(directory, '/clients/A/B/Plans');
});
assert.deepStrictEqual(requested.options, { createDirectory: true });
const originalNow = Date.now;
Date.now = () => 1234;
storageConfig.filename({}, { originalname: 'mon plan.pdf' }, (error, name) => {
  assert.ifError(error);
  assert.strictEqual(name, '1234-mon_plan.pdf');
});
Date.now = originalNow;
console.log('OK - middleware upload fichier PC');
