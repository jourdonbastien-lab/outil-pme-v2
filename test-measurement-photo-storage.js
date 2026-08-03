'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const photoFiles = require('./lib/measurementPhotoFiles');

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'outil-pme-measurement-photos-'));

function fakePhoto(name, mimetype, size = 4) {
  return { originalname: name, mimetype, size };
}

function writePhoto(measurementId, name, contents) {
  const descriptor = fakePhoto(name, 'image/jpeg', Buffer.byteLength(contents));
  const directory = photoFiles.measurementPhotoDir(temporaryRoot, measurementId);
  fs.mkdirSync(directory, { recursive: true });
  const storedName = photoFiles.generatedStoredName(descriptor);
  const filePath = photoFiles.photoFilePath(temporaryRoot, measurementId, storedName);
  fs.writeFileSync(filePath, contents);
  return {
    measurementId,
    storedName,
    originalName: name,
    hash: photoFiles.fileSha256(filePath),
    filePath
  };
}

try {
  const first = writePhoto(9, 'portail.jpg', 'photo-portail-1');
  assert(fs.existsSync(first.filePath), 'la photo ajoutee doit exister');
  assert.strictEqual(fs.readFileSync(first.filePath, 'utf8'), 'photo-portail-1', 'la photo doit etre rechargeable');

  const second = writePhoto(9, 'detail.jpeg', 'photo-portail-2');
  assert.notStrictEqual(first.storedName, second.storedName, 'plusieurs photos ont des noms serveur distincts');
  assert.strictEqual(path.dirname(first.filePath), path.dirname(second.filePath), 'les photos partagent le dossier de leur fiche');

  const metadataFromNewSession = JSON.parse(JSON.stringify([first, second]));
  assert(metadataFromNewSession.every((photo) => fs.existsSync(
    photoFiles.photoFilePath(temporaryRoot, photo.measurementId, photo.storedName)
  )), 'une nouvelle session retrouve les fichiers depuis les metadonnees');

  assert.throws(() => photoFiles.measurementPhotoDir(temporaryRoot, null), /ID fiche invalide/, 'une fiche sans id ne peut pas recevoir de fichier');

  const duplicate = writePhoto(9, 'copie.jpg', 'photo-portail-1');
  assert.strictEqual(duplicate.hash, first.hash, 'le SHA-256 permet de detecter un doublon');
  fs.unlinkSync(duplicate.filePath);

  const otherMeasurement = writePhoto(10, 'portail.jpg', 'photo-autre-fiche');
  assert.notStrictEqual(path.dirname(first.filePath), path.dirname(otherMeasurement.filePath), 'deux fiches sont isolees');
  assert.throws(
    () => photoFiles.photoFilePath(temporaryRoot, 9, '../' + otherMeasurement.storedName),
    /Nom de fichier photo invalide/,
    'une sortie de dossier est refusee'
  );

  photoFiles.removeOwnedFile(temporaryRoot, 9, second.storedName);
  assert(!fs.existsSync(second.filePath), 'la suppression retire le fichier demande');
  assert(fs.existsSync(otherMeasurement.filePath), 'la suppression ne touche pas une autre fiche');

  assert.throws(() => photoFiles.validatePhotoFile(fakePhoto('virus.exe', 'image/jpeg')), /Format photo invalide/);
  assert.throws(() => photoFiles.validatePhotoFile(fakePhoto('photo.png', 'image/jpeg')), /extension incoherente/);
  assert.throws(
    () => photoFiles.validatePhotoFile(fakePhoto('lourde.jpg', 'image/jpeg', photoFiles.MAX_FILE_SIZE + 1)),
    /trop volumineuse/
  );

  const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const databaseSchema = fs.readFileSync(path.join(__dirname, 'database/schema.js'), 'utf8');
  const photoRoutes = fs.readFileSync(path.join(__dirname, 'routes/measurementPhotos.js'), 'utf8');
  const moduleSheet = fs.readFileSync(path.join(__dirname, 'modules/measurements/public/module-sheet.js'), 'utf8');
  const classicStair = fs.readFileSync(path.join(__dirname, 'modules/measurements/public/measurements.js'), 'utf8');
  assert(databaseSchema.includes('CREATE TABLE IF NOT EXISTS measurement_photo_files'), 'la migration doit etre non destructive');
  assert(databaseSchema.includes('UNIQUE(measurement_id, sha256)'), 'la base doit renforcer l anti-doublon');
  assert(photoRoutes.includes("app.get('/api/measurements/:id/photos'"), 'la route de liste doit exister');
  assert(photoRoutes.includes("app.post('/api/measurements/:id/photos'"), 'la route d ajout doit exister');
  assert(photoRoutes.includes("app.patch('/api/measurements/:id/photos/:photoId'"), 'la route de legende doit exister');
  assert(photoRoutes.includes("app.delete('/api/measurements/:id/photos/:photoId'"), 'la route de suppression doit exister');
  assert(moduleSheet.includes('legacyPhotos.concat(serverPhotos)'), 'photos: [] ne doit pas ecraser les photos serveur');
  assert(classicStair.includes("fetch(`/api/measurements/${currentServerId}/photos`)"), 'Escalier classique recharge les photos du serveur');
  assert(!moduleSheet.includes('reader.readAsDataURL(file)'), 'les nouvelles photos classiques ne doivent plus devenir des dataUrl');
  assert(!classicStair.includes('reader.readAsDataURL(file)'), 'les nouvelles photos Escalier classique ne doivent plus devenir des dataUrl');

  console.log('OK - stockage permanent des photos de prises de cotes');
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
