const pool = require('../db/pool');

const RETURNING = `
  id, username, name, role, login_at AS "loginAt", saved_at AS "savedAt",
  at, duration_ms AS "durationMs", action, revision
`;

async function listAuditLogs(req, res, next) {
  try {
    const { rows } = await pool.query(`SELECT ${RETURNING} FROM audit_logs ORDER BY id`);
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function createAuditLog(req, res, next) {
  try {
    const { user: username, name, role, loginAt, savedAt, at, durationMs, action, revision } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO audit_logs (username, name, role, login_at, saved_at, at, duration_ms, action, revision)
       VALUES ($1,$2,$3,$4,$5,COALESCE($6, now()),$7,$8,$9)
       RETURNING ${RETURNING}`,
      [username || null, name || null, role || null, loginAt || null, savedAt || null,
       at || null, durationMs || null, action || null, revision || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// Substitui a lista inteira (usado pelo bootstrap de sincronização, que
// hoje grava auditLogs como array completo a cada ação registrada).
async function replaceAllAuditLogs(req, res, next) {
  const client = await pool.connect();
  try {
    const list = Array.isArray(req.body) ? req.body : [];
    await client.query('BEGIN');
    await client.query('DELETE FROM audit_logs');
    for (const l of list) {
      await client.query(
        `INSERT INTO audit_logs (username, name, role, login_at, saved_at, at, duration_ms, action, revision)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [l.user || null, l.name || null, l.role || null, l.loginAt || null, l.savedAt || null,
         l.at || null, l.durationMs || null, l.action || null, l.revision || null]
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

module.exports = { listAuditLogs, createAuditLog, replaceAllAuditLogs };
