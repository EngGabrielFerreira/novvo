const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/lossesController');

router.get('/', ctrl.listLosses);
router.put('/', ctrl.replaceAllLosses);
router.post('/', ctrl.createLoss);
router.put('/:id', ctrl.updateLoss);
router.delete('/:id', ctrl.deleteLoss);

module.exports = router;
