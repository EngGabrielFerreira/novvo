const pool = require('../db/pool');

const ALLOWED_KEYS = new Set(['comparativoLotes', 'sobrasLotes']);

async function getState(req, res, next) {
  try {
    const { key } = req.params;
    if (!ALLOWED_KEYS.has(key)) return res.status(404).json({ error: 'Chave inválida' });
    const { rows } = await pool.query('SELECT value FROM app_state WHERE state_key = $1', [key]);
    res.json(rows.length ? rows[0].value : {});
  } catch (err) {
    next(err);
  }
}

async function putState(req, res, next) {
  try {
    const { key } = req.params;
    if (!ALLOWED_KEYS.has(key)) return res.status(404).json({ error: 'Chave inválida' });
    await pool.query(
      `INSERT INTO app_state (state_key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (state_key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [key, JSON.stringify(req.body || {})]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { getState, putState };
