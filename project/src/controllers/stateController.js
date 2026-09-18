const pool = require('../db/pool');

// Monta o objeto SAVED_STATE consumido pelo front (public/js/apiSync.js)
// no formato exato que o script original já sabia interpretar (mesma forma
// do antigo "importar estado salvo em arquivo"), agora vindo do Postgres.
async function getFullState(req, res, next) {
  try {
    const [withdrawals, deliveries, losses, boxInfoRows, profiles, auditLogs, comparativo, sobras] =
      await Promise.all([
        pool.query('SELECT material_id AS id, material, ambiente, torre, pavimento, qty, date, time, by_name AS "by", company, obs FROM withdrawals ORDER BY withdrawals.id'),
        pool.query('SELECT lote, medida1, medida2, reserva_pct AS "reservaPct", manutencao_pct AS "manutencaoPct", invoice, tonality, description, qty, delivery, date, legacy_m2 AS "_legacyM2" FROM deliveries ORDER BY id'),
        pool.query('SELECT material_id AS id, material, ambiente, torre, pavimento, qty, date, reason, obs FROM losses ORDER BY losses.id'),
        pool.query('SELECT material_key, box_value FROM box_info'),
        pool.query('SELECT username AS user, name, role, is_admin AS admin, active FROM users ORDER BY id'),
        pool.query('SELECT username AS user, name, role, login_at AS "loginAt", saved_at AS "savedAt", at, duration_ms AS "durationMs", action, revision FROM audit_logs ORDER BY id'),
        pool.query("SELECT value FROM app_state WHERE state_key = 'comparativoLotes'"),
        pool.query("SELECT value FROM app_state WHERE state_key = 'sobrasLotes'"),
      ]);

    const boxInfo = {};
    boxInfoRows.rows.forEach((r) => { boxInfo[r.material_key] = r.box_value; });

    res.json({
      version: 1,
      withdrawals: withdrawals.rows,
      deliveryRows: deliveries.rows,
      lossRows: losses.rows,
      boxInfo,
      profiles: profiles.rows,
      auditLogs: auditLogs.rows,
      comparativoLotes: comparativo.rows[0] ? comparativo.rows[0].value : {},
      sobrasLotes: sobras.rows[0] ? sobras.rows[0].value : {},
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getFullState };
