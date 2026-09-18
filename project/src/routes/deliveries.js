const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/deliveriesController');

router.get('/', ctrl.listDeliveries);
router.put('/', ctrl.replaceAllDeliveries);
router.get('/:id', ctrl.getDelivery);
router.post('/', ctrl.createDelivery);
router.put('/:id', ctrl.updateDelivery);
router.delete('/:id', ctrl.deleteDelivery);

module.exports = router;
