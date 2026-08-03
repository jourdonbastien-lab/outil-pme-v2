'use strict';
function createMeasurementTechnicalDrawingController({service,path,publicDir}={}){
 const missing=(res)=>res.status(404).json({ok:false,error:'Prise de cote introuvable'});
 function list(req,res){const e=service.getContext(req.params.id);if(!e)return missing(res);return res.json({ok:true,measurement:{id:e.row.id,module:e.row.module,recordName:e.row.record_name},sketches:service.list(e)})}
 function create(req,res){const e=service.getContext(req.params.id);if(!e)return missing(res);const sketch=service.create(e,req.body?.title);return res.json({ok:true,sketch,url:`/outils/prises-cotes/${e.id}/croquis/${encodeURIComponent(sketch.id)}`})}
 function get(req,res){const e=service.getContext(req.params.id);if(!e)return missing(res);const id=String(req.params.sketchId||'').trim(),sketch=e.sketches.find(x=>x.id===id);if(!sketch)return res.status(404).json({ok:false,error:'Croquis introuvable'});return res.json({ok:true,measurement:{id:e.row.id,module:e.row.module,recordName:e.row.record_name},sketch,availablePhotos:service.photos(e),returnUrl:`/outils/prises-cotes/${String(e.row.module||'').toLowerCase().replace(/\s+/g,'-')}`})}
 function update(req,res){const e=service.getContext(req.params.id);if(!e)return missing(res);const sketch=service.update(e,String(req.params.sketchId||'').trim(),req.body);if(!sketch)return res.status(404).json({ok:false,error:'Croquis introuvable'});return res.json({ok:true,sketch})}
 function remove(req,res){const e=service.getContext(req.params.id);if(!e)return missing(res);const id=String(req.params.sketchId||'').trim();if(!service.remove(e,id))return res.status(404).json({ok:false,error:'Croquis introuvable'});return res.json({ok:true,deletedId:id})}
 function page(req,res,next){const id=Number(req.params.measurementId||0),sketchId=String(req.params.sketchId||'').trim();if(!Number.isInteger(id)||id<=0||!sketchId)return next();return res.sendFile(path.join(publicDir,'croquis-technique.html'))}
 return{list,create,get,update,remove,page};}
module.exports={createMeasurementTechnicalDrawingController};
