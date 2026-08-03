'use strict';
function registerMeasurementPhotoRoutes(app,{requireLogin,c}){app.get('/api/measurements/:id/photos',requireLogin,c.list);app.post('/api/measurements/:id/photos',requireLogin,c.add);app.patch('/api/measurements/:id/photos/:photoId',requireLogin,c.caption);app.delete('/api/measurements/:id/photos/:photoId',requireLogin,c.remove);app.get('/api/measurements/:id/photos/:photoId/file',requireLogin,c.file);}
module.exports={registerMeasurementPhotoRoutes};
