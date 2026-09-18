const express = require('express');
const router = express.Router();
const stateCtrl = require('../controllers/stateController');
const appStateCtrl = require('../controllers/appStateController');

// GET /api/state -> hidrata o front inteiro de uma vez (equivalente ao
// antigo SAVED_STATE importado de arquivo), agora vindo do Postgres.
router.get('/', stateCtrl.getFullState);

// comparativoLotes / sobrasLotes (distribuição por lote entre torres)
router.get('/:key(comparativoLotes|sobrasLotes)', appStateCtrl.getState);
router.put('/:key(comparativoLotes|sobrasLotes)', appStateCtrl.putState);

module.exports = router;
