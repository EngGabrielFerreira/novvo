const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/auditController');

router.get('/', ctrl.listAuditLogs);
router.put('/', ctrl.replaceAllAuditLogs); // substitui a lista inteira (sync do front)
router.post('/', ctrl.createAuditLog);

module.exports = router;
