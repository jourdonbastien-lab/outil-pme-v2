'use strict';
function registerMeasurementsListRoutes(app,{requireLogin,c}){app.get('/outils/prises-cotes',requireLogin,c.list);app.get('/api/measurements/link-options',requireLogin,c.options);}
function registerMeasurementContextRoute(app,{requireLogin,c}){app.get('/api/measurements/context',requireLogin,c.context);}
function registerMeasurementPersistenceRoutes(app,{requireLogin,c}){app.post('/api/measurements',requireLogin,c.save);app.get('/api/measurements/:id',requireLogin,c.get);app.delete('/api/measurements/:id',requireLogin,c.remove);}
function registerMeasurementDetailRoute(app,{requireLogin,c}){app.get('/outils/prises-cotes/fiche/:id',requireLogin,c.detail);}
module.exports={registerMeasurementsListRoutes,registerMeasurementContextRoute,registerMeasurementPersistenceRoutes,registerMeasurementDetailRoute};
