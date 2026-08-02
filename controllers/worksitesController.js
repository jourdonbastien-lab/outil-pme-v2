'use strict';

function createWorksitesController() {
  function redirectToClientOrders(req, res) {
    return res.redirect('/orders/clients');
  }
  return {
    showWorksites: redirectToClientOrders,
    createWorksite: redirectToClientOrders,
    showWorksite: redirectToClientOrders,
    updateWorksite: redirectToClientOrders
  };
}

module.exports = { createWorksitesController };
