const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/authController');

router.post('/login', ctrl.login);
router.get('/me', ctrl.me);
router.post('/logout', ctrl.logout);

module.exports = router;
