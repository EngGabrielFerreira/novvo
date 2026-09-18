const pool = require('../db/pool');

// materials é o levantamento quantitativo (dado-base). A UI hoje apenas
// consulta esses dados (as "retiradas" é que são editáveis) — por isso só
// há endpoints de leitura aqui, conforme item 6 do prompt do projeto.

async function listMaterials(req, res, next) {
  try {
    const { torre, pavimento, code, q, limit } = req.query;
    const clauses = [];
    const params = [];

    if (torre) {
      params.push(torre);
      clauses.push(`torre = $${params.length}`);
    }
    if (pavimento) {
      params.push(pavimento);
      clauses.push(`pavimento = $${params.length}`);
    }
    if (code) {
      params.push(code);
      clauses.push(`code = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      clauses.push(`material ILIKE $${params.length}`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const lim = Math.min(Number(limit) || 2000, 5000);

    const { rows } = await pool.query(
      `SELECT id, source, project, fase, torre, pavimento, ambiente,
              base_ambiente AS "baseAmbiente", code, material, dimension,
              unit, qty, type, perimetro
         FROM materials
         ${where}
         ORDER BY id
         LIMIT ${lim}`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function getMaterial(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT id, source, project, fase, torre, pavimento, ambiente,
              base_ambiente AS "baseAmbiente", code, material, dimension,
              unit, qty, type, perimetro
         FROM materials WHERE id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Material não encontrado' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

module.exports = { listMaterials, getMaterial };
