'use strict';

function createPcFileUpload({ multer, pcFilesService, safeSegment }) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      try {
        const context = pcFilesService.resolveUploadContext(req.params, { createDirectory: true });
        cb(null, context.directory);
      } catch (error) {
        cb(error);
      }
    },
    filename: (req, file, cb) => {
      const safeFileName = `${Date.now()}-${safeSegment(file.originalname || 'file')}`;
      cb(null, safeFileName);
    },
  });
  return multer({ storage });
}

module.exports = { createPcFileUpload };
