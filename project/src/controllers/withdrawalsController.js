const pool = require('../db/pool');

async function listWithdrawals(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT id, material_id AS "materialId", material, ambiente, torre,
              pavimento, qty, date, time, by_name AS "by", company, obs
         FROM withdrawals
         ORDER BY id`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function getWithdrawal(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT id, material_id AS "materialId", material, ambiente, torre,
              pavimento, qty, date, time, by_name AS "by", company, obs
         FROM withdrawals WHERE id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Retirada não encontrada' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

async function createWithdrawal(req, res, next) {
  try {
    const { materialId, material, ambiente, torre, pavimento, qty, date, time, by, company, obs } = req.body;
    if (!materialId || !qty || Number(qty) <= 0) {
      return res.status(400).json({ error: 'materialId e qty (> 0) são obrigatórios' });
    }

    const mat = await pool.query('SELECT id, qty, unit FROM materials WHERE id = $1', [materialId]);
    if (!mat.rows.length) return res.status(400).json({ error: 'materialId inexistente' });

    const totalQty = Number(mat.rows[0].qty);
    const already = await pool.query(
      'SELECT COALESCE(SUM(qty),0) AS total FROM withdrawals WHERE material_id = $1',
      [materialId]
    );
    const withdrawn = Number(already.rows[0].total);
    const available = totalQty - withdrawn;
    if (Number(qty) > available + 1e-9) {
      return res.status(409).json({ error: 'Quantidade maior que o saldo disponível', available });
    }

    const { rows } = await pool.query(
      `INSERT INTO withdrawals (material_id, material, ambiente, torre, pavimento, qty, date, time, by_name, company, obs)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id, material_id AS "materialId", material, ambiente, torre, pavimento, qty, date, time, by_name AS "by", company, obs`,
      [materialId, material, ambiente, torre, pavimento, qty, date || null, time || null, by || null, company || null, obs || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
}

async function updateWithdrawal(req, res, next) {
  try {
    const { id } = req.params;
    const existing = await pool.query('SELECT * FROM withdrawals WHERE id = $1', [id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Retirada não encontrada' });

    const { qty, date, time, by, company, obs } = req.body;
    const materialId = existing.rows[0].material_id;

    if (qty !== undefined) {
      const mat = await pool.query('SELECT qty FROM materials WHERE id = $1', [materialId]);
      const totalQty = Number(mat.rows[0].qty);
      const others = await pool.query(
        'SELECT COALESCE(SUM(qty),0) AS total FROM withdrawals WHERE material_id = $1 AND id <> $2',
        [materialId, id]
      );
      const available = totalQty - Number(others.rows[0].total);
      if (Number(qty) > available + 1e-9) {
        return res.status(409).json({ error: 'Quantidade corrigida maior que o saldo disponível', available });
      }
    }

    const { rows } = await pool.query(
      `UPDATE withdrawals SET
         qty = COALESCE($1, qty),
         date = COALESCE($2, date),
         time = COALESCE($3, time),
         by_name = COALESCE($4, by_name),
         company = COALESCE($5, company),
         obs = COALESCE($6, obs),
         updated_at = now()
       WHERE id = $7
       RETURNING id, material_id AS "materialId", material, ambiente, torre, pavimento, qty, date, time, by_name AS "by", company, obs`,
      [qty ?? null, date ?? null, time ?? null, by ?? null, company ?? null, obs ?? null, id]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

async function deleteWithdrawal(req, res, next) {
  try {
    const { rowCount } = await pool.query('DELETE FROM withdrawals WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Retirada não encontrada' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// Substitui a lista inteira de retiradas de uma vez. Usado pela camada de
// sincronização do front (ver public/js/apiSync.js), que hoje persiste o
// array `withdrawals` por completo a cada alteração feita na UI.
async function replaceAllWithdrawals(req, res, next) {
  const client = await pool.connect();
  try {
    const list = Array.isArray(req.body) ? req.body : [];
    await client.query('BEGIN');
    await client.query('DELETE FROM withdrawals');
    for (const w of list) {
      await client.query(
        `INSERT INTO withdrawals (material_id, material, ambiente, torre, pavimento, qty, date, time, by_name, company, obs)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [w.id, w.material || null, w.ambiente || null, w.torre || null, w.pavimento || null,
         w.qty || 0, w.date || null, w.time || null, w.by || null, w.company || null, w.obs || null]
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

module.exports = {
  listWithdrawals, getWithdrawal, createWithdrawal, updateWithdrawal, deleteWithdrawal,
  replaceAllWithdrawals,
};
