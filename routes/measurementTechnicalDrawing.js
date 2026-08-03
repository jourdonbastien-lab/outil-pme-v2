'use strict';
function registerMeasurementTechnicalDrawingApiRoutes(app,{requireLogin,c}){app.get('/api/measurements/:id/croquis',requireLogin,c.list);app.post('/api/measurements/:id/croquis',requireLogin,c.create);app.get('/api/measurements/:id/croquis/:sketchId',requireLogin,c.get);app.post('/api/measurements/:id/croquis/:sketchId',requireLogin,c.update);app.delete('/api/measurements/:id/croquis/:sketchId',requireLogin,c.remove)}
function registerMeasurementTechnicalDrawingPageRoute(app,{requireLogin,c}){app.get('/outils/prises-cotes/:measurementId/croquis/:sketchId',requireLogin,c.page)}
module.exports={registerMeasurementTechnicalDrawingApiRoutes,registerMeasurementTechnicalDrawingPageRoute};
