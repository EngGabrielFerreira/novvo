const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/boxInfoController');

router.get('/', ctrl.getAllBoxInfo);
router.put('/', ctrl.replaceAllBoxInfo); // substitui o mapa inteiro (sync do front)
router.put('/:key', ctrl.upsertBoxInfo);
router.delete('/:key', ctrl.deleteBoxInfo);

module.exports = router;
