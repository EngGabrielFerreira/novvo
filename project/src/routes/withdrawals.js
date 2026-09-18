const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/withdrawalsController');

router.get('/', ctrl.listWithdrawals);
router.put('/', ctrl.replaceAllWithdrawals); // substitui a lista inteira (sync do front)
router.get('/:id', ctrl.getWithdrawal);
router.post('/', ctrl.createWithdrawal);
router.put('/:id', ctrl.updateWithdrawal);
router.delete('/:id', ctrl.deleteWithdrawal);

module.exports = router;
