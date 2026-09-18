const pool = require('../db/pool');

const RETURNING = `id, material_id AS "materialId", material, ambiente, torre, pavimento, qty, date, reason, obs`;

async function listLosses(req, res, next) {
  try {
    const { rows } = await pool.query(`SELECT ${RETURNING} FROM losses ORDER BY id`);
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function createLoss(req, res, next) {
  try {
    const { materialId, material, ambiente, torre, pavimento, qty, date, reason, obs } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO losses (material_id, material, ambiente, torre, pavimento, qty, date, reason, obs)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING ${RETURNING}`,
      [materialId || null, material || null, ambiente || null, torre || null, pavimento || null,
       qty || null, date || null, reason || null, obs || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
}

async function updateLoss(req, res, next) {
  try {
    const { id } = req.params;
    const existing = await pool.query('SELECT id FROM losses WHERE id = $1', [id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Perda não encontrada' });

    const { qty, date, reason, obs } = req.body;
    const { rows } = await pool.query(
      `UPDATE losses SET
         qty = COALESCE($1, qty), date = COALESCE($2, date),
         reason = COALESCE($3, reason), obs = COALESCE($4, obs), updated_at = now()
       WHERE id = $5
       RETURNING ${RETURNING}`,
      [qty ?? null, date ?? null, reason ?? null, obs ?? null, id]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

async function deleteLoss(req, res, next) {
  try {
    const { rowCount } = await pool.query('DELETE FROM losses WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Perda não encontrada' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function replaceAllLosses(req, res, next) {
  const client = await pool.connect();
  try {
    const list = Array.isArray(req.body) ? req.body : [];
    await client.query('BEGIN');
    await client.query('DELETE FROM losses');
    for (const l of list) {
      await client.query(
        `INSERT INTO losses (material_id, material, ambiente, torre, pavimento, qty, date, reason, obs)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [l.id || null, l.material || null, l.ambiente || null, l.torre || null, l.pavimento || null,
         l.qty || null, l.date || null, l.reason || null, l.obs || null]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true, count: list.length });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

module.exports = { listLosses, createLoss, updateLoss, deleteLoss, replaceAllLosses };
