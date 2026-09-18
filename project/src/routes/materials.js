const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/materialsController');

router.get('/', ctrl.listMaterials);
router.get('/:id', ctrl.getMaterial);

module.exports = router;
