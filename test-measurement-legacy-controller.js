'use strict';
const assert = require('assert');
const { createMeasurementLegacyController } = require('./controllers/measurementLegacyController');
let sketchResult = { filePath: '/sketch.png' }, savedResult = { filePath: '/saved.png' };
const controller = createMeasurementLegacyController({
  sketchService: { getMeasurementSketch: () => sketchResult, saveMeasurementSketch: () => savedResult },
  assetsService: { resolveModulePage: (v) => v === 'portail' ? '/portail.html' : null, resolveMeasurementAsset: (v) => v === 'a.js' ? '/a.js' : null, resolveTechnicalDrawingAsset: (v) => v === 't.js' ? '/technical/t.js' : null },
  recoveryService: { getRecoveryAccessContext: ({ id, role }) => ({ ok: true, allowed: id === '9' && role === 'admin' }) },
  renderRecoveryView: () => 'RECOVERY', pageTemplate: (_req, title, html) => `${title}:${html}`
});
const response = () => ({ code: 200, status(v){this.code=v;return this}, send(v){this.body=v;return this}, json(v){this.data=v;return this}, sendFile(v){this.file=v;return this} });
let res=response();controller.getLegacySketch({params:{id:'9'}},res);assert.strictEqual(res.file,'/sketch.png');
sketchResult={error:'measurement-not-found'};res=response();controller.getLegacySketch({params:{}},res);assert.deepStrictEqual([res.code,res.body],[404,'Prise de cote introuvable']);
sketchResult={error:'sketch-not-found'};res=response();controller.getLegacySketch({params:{}},res);assert.deepStrictEqual([res.code,res.body],[404,'Croquis introuvable']);
res=response();controller.saveLegacySketch({params:{},body:{}},res);assert.deepStrictEqual(res.data,{ok:true,path:'/saved.png'});
savedResult={error:'measurement-not-found'};res=response();controller.saveLegacySketch({params:{},body:{}},res);assert.deepStrictEqual([res.code,res.data],[404,{ok:false,error:'Prise de cote introuvable'}]);
for(const [method,param,file] of [['showModulePage','portail','/portail.html'],['serveMeasurementAsset','a.js','/a.js'],['serveTechnicalDrawingAsset','t.js','/technical/t.js']]){res=response();controller[method]({params:{module:param,asset:param}},res,()=>{res.next=true});assert.strictEqual(res.file,file)}
res=response();controller.showModulePage({params:{module:'x'}},res,()=>{res.next=true});assert.strictEqual(res.next,true);
res=response();controller.getPhotoRecoveryAccess({query:{id:'9'},session:{user:{role:'admin'}}},res);assert.deepStrictEqual(res.data,{ok:true,allowed:true});
res=response();controller.showPhotoRecoveryPage({},res);assert.strictEqual(res.body,'Récupération photos Portail:RECOVERY');
console.log('OK - contrôleur résidus prises de cotes');
