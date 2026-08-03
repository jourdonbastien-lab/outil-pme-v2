'use strict';
function createMeasurementStairV2PhotosService({db,fs,path,crypto,parseMeasurementData,normalizeCategory,normalizeSlots,buildPublicSlots,photoBaseDir,safeResolveInside,ensureDir,now=()=>new Date().toISOString()}={}){
 function fields(row){const payload=parseMeasurementData(row.data),value=payload.fields&&typeof payload.fields==='object'?payload.fields:{};return{payload,fields:value,slots:normalizeSlots(value.photo_slots)}}
 function save(id,payload,fieldsValue,slots){payload.fields={...fieldsValue,photo_slots:slots};db.prepare('UPDATE measurements SET data = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(payload),now(),id)}
 function update(row,updater){const d=fields(row),slots=normalizeSlots(updater(d.slots)||d.slots);save(row.id,d.payload,d.fields,slots);return slots}
 function add(row,category,files){return update(row,slots=>{const next=normalizeSlots(slots),target=next.find(s=>s.category===normalizeCategory(category));if(target)files.forEach(file=>target.photos.push({id:crypto.randomUUID(),fileName:path.basename(file.filename),caption:'',size:Number(file.size||0),mimeType:String(file.mimetype||''),createdAt:now()}));return next})}
 function caption(row,photoId,value){return update(row,slots=>{const next=normalizeSlots(slots);next.forEach(s=>s.photos.forEach(p=>{if(p.id===photoId)p.caption=value}));return next})}
 function remove(row,photoId){const d=fields(row);let name=null;d.slots.forEach(s=>{s.photos=s.photos.filter(p=>{if(p.id!==photoId)return true;name=p.fileName;return false})});if(!name)return null;const dir=photoBaseDir(row);ensureDir(dir);const file=safeResolveInside(dir,path.basename(name));if(fs.existsSync(file))fs.unlinkSync(file);save(row.id,d.payload,d.fields,d.slots);return d.slots}
 function resolve(row,photoId){const d=fields(row);let name=null;d.slots.forEach(s=>s.photos.forEach(p=>{if(p.id===photoId)name=p.fileName}));return name?safeResolveInside(photoBaseDir(row),path.basename(name)):null}
 return{list:row=>{const d=fields(row);return buildPublicSlots(row.id,d.slots)},add,caption,remove,resolve,publicSlots:(id,slots)=>buildPublicSlots(id,slots)};}
module.exports={createMeasurementStairV2PhotosService};
