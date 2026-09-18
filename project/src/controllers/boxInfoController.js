const pool = require('../db/pool');

// box_info é o equivalente ao mapa "code||material" -> valor usado pelo
// front (LS_BOX). Expostos como objeto simples { chave: valor } para bater
// exatamente com o formato já consumido pela UI (boxInfo[k]).

async function getAllBoxInfo(req, res, next) {
  try {
    const { rows } = await pool.query('SELECT material_key, box_value FROM box_info');
    const map = {};
    rows.forEach((r) => { map[r.material_key] = r.box_value; });
    res.json(map);
  } catch (err) {
    next(err);
  }
}

async function upsertBoxInfo(req, res, next) {
  try {
    const { key } = req.params;
    const { value } = req.body;
    if (value === undefined) return res.status(400).json({ error: 'value é obrigatório' });

    await pool.query(
      `INSERT INTO box_info (material_key, box_value, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (material_key) DO UPDATE SET box_value = EXCLUDED.box_value, updated_at = now()`,
      [key, String(value)]
    );
    res.json({ key, value: String(value) });
  } catch (err) {
    next(err);
  }
}

// Substitui o mapa inteiro de uma vez (usado pelo bootstrap de sincronização
// do front, que hoje grava boxInfo como objeto completo).
async function replaceAllBoxInfo(req, res, next) {
  const client = await pool.connect();
  try {
    const entries = Object.entries(req.body || {});
    await client.query('BEGIN');
    await client.query('DELETE FROM box_info');
    for (const [key, value] of entries) {
      await client.query(
        `INSERT INTO box_info (material_key, box_value) VALUES ($1, $2)`,
        [key, String(value)]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true, count: entries.length });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

async function deleteBoxInfo(req, res, next) {
  try {
    const { rowCount } = await pool.query('DELETE FROM box_info WHERE material_key = $1', [req.params.key]);
    if (!rowCount) return res.status(404).json({ error: 'Chave não encontrada' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { getAllBoxInfo, upsertBoxInfo, replaceAllBoxInfo, deleteBoxInfo };
