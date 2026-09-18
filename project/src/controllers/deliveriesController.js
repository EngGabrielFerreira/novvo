const pool = require('../db/pool');

const RETURNING = `
  id, lote, medida1, medida2, reserva_pct AS "reservaPct",
  manutencao_pct AS "manutencaoPct", invoice, tonality, description,
  qty, delivery, date, legacy_m2 AS "legacyM2"
`;

async function listDeliveries(req, res, next) {
  try {
    const { rows } = await pool.query(`SELECT ${RETURNING} FROM deliveries ORDER BY id`);
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function getDelivery(req, res, next) {
  try {
    const { rows } = await pool.query(`SELECT ${RETURNING} FROM deliveries WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Entrega não encontrada' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

async function createDelivery(req, res, next) {
  try {
    const {
      lote, medida1, medida2, reservaPct, manutencaoPct, invoice,
      tonality, description, qty, delivery, date, legacyM2,
    } = req.body;

    const { rows } = await pool.query(
      `INSERT INTO deliveries
        (lote, medida1, medida2, reserva_pct, manutencao_pct, invoice, tonality, description, qty, delivery, date, legacy_m2)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING ${RETURNING}`,
      [
        lote || null, medida1 || null, medida2 || null, reservaPct || 0, manutencaoPct || 0,
        invoice || null, tonality || null, description || null, qty || null, delivery || null,
        date || null, legacyM2 || null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
}

async function updateDelivery(req, res, next) {
  try {
    const { id } = req.params;
    const existing = await pool.query('SELECT id FROM deliveries WHERE id = $1', [id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Entrega não encontrada' });

    const {
      lote, medida1, medida2, reservaPct, manutencaoPct, invoice,
      tonality, description, qty, delivery, date, legacyM2,
    } = req.body;

    const { rows } = await pool.query(
      `UPDATE deliveries SET
         lote = COALESCE($1, lote),
         medida1 = COALESCE($2, medida1),
         medida2 = COALESCE($3, medida2),
         reserva_pct = COALESCE($4, reserva_pct),
         manutencao_pct = COALESCE($5, manutencao_pct),
         invoice = COALESCE($6, invoice),
         tonality = COALESCE($7, tonality),
         description = COALESCE($8, description),
         qty = COALESCE($9, qty),
         delivery = COALESCE($10, delivery),
         date = COALESCE($11, date),
         legacy_m2 = COALESCE($12, legacy_m2),
         updated_at = now()
       WHERE id = $13
       RETURNING ${RETURNING}`,
      [
        lote ?? null, medida1 ?? null, medida2 ?? null, reservaPct ?? null, manutencaoPct ?? null,
        invoice ?? null, tonality ?? null, description ?? null, qty ?? null, delivery ?? null,
        date ?? null, legacyM2 ?? null, id,
      ]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

async function deleteDelivery(req, res, next) {
  try {
    const { rowCount } = await pool.query('DELETE FROM deliveries WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Entrega não encontrada' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function replaceAllDeliveries(req, res, next) {
  const client = await pool.connect();
  try {
    const list = Array.isArray(req.body) ? req.body : [];
    await client.query('BEGIN');
    await client.query('DELETE FROM deliveries');
    for (const d of list) {
      await client.query(
        `INSERT INTO deliveries
          (lote, medida1, medida2, reserva_pct, manutencao_pct, invoice, tonality, description, qty, delivery, date, legacy_m2)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [d.lote || null, d.medida1 || null, d.medida2 || null, d.reservaPct || 0, d.manutencaoPct || 0,
         d.invoice || null, d.tonality || null, d.description || null, d.qty || null, d.delivery || null,
         d.date || null, d._legacyM2 || d.legacyM2 || null]
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
  listDeliveries, getDelivery, createDelivery, updateDelivery, deleteDelivery,
  replaceAllDeliveries,
};
