'use strict';

function createMaterialsController({ materialsService, renderMaterialsListView, renderMaterialDetailView, pageTemplate, formatDateLabel, viewDependencies } = {}) {
  function validId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
  }
  function showMaterials(req, res) {
    const data = materialsService.listMaterials(req.query.q);
    const html = renderMaterialsListView({
      ...data,
      isAdmin: req.session?.user?.role !== 'atelier',
      seeded: req.query.seeded === '1',
      saved: req.query.saved === '1',
      added: Number(req.query.added || 0)
    }, viewDependencies);
    return res.send(pageTemplate(req, 'Bibliothèque matière', html));
  }
  function createMaterial(req, res) {
    materialsService.createMaterial(req.body);
    return res.redirect('/materials');
  }
  function updateMaterialFromBody(req, res) {
    const id = validId(req.body.id);
    if (!id) return res.status(400).send('ID matière invalide');
    materialsService.updateMaterial(id, req.body);
    return res.redirect('/materials/' + id + '?saved=1');
  }
  function seedMaterials(req, res) {
    const inserted = materialsService.seedStandardMaterials();
    return res.redirect('/materials?seeded=1&added=' + inserted);
  }
  function deleteMaterial(req, res) {
    materialsService.deleteMaterial(req.body.id);
    return res.redirect('/materials');
  }
  function showMaterial(req, res) {
    const id = validId(req.params.id);
    if (!id) return res.status(400).send('ID matière invalide');
    const material = materialsService.getMaterialById(id);
    if (!material) return res.status(404).send('Matière introuvable');
    const html = renderMaterialDetailView({
      material, id, saved: req.query.saved === '1',
      createdLabel: material.created_at ? formatDateLabel(material.created_at) : '—'
    }, viewDependencies);
    return res.send(pageTemplate(req, material.name || 'Matière', html));
  }
  function updateMaterial(req, res) {
    const id = validId(req.params.id);
    if (!id) return res.status(400).send('ID matière invalide');
    if (!materialsService.materialExists(id)) return res.status(404).send('Matière introuvable');
    materialsService.updateMaterial(id, req.body);
    return res.redirect('/materials/' + id + '?saved=1');
  }
  return { showMaterials, createMaterial, updateMaterialFromBody, seedMaterials, deleteMaterial, showMaterial, updateMaterial };
}

module.exports = { createMaterialsController };
