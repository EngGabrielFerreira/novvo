const bcrypt = require('bcryptjs');
const pool = require('../db/pool');

const BCRYPT_ROUNDS = 10;

// IMPORTANTE: esta lista de colunas NUNCA inclui `password`. Nenhuma rota
// deste controller deve devolver a senha (nem em hash) ao front-end.
const SAFE_COLUMNS = `id, username, name, role, is_admin AS admin, active`;

async function listUsers(req, res, next) {
  try {
    const { rows } = await pool.query(`SELECT ${SAFE_COLUMNS} FROM users ORDER BY id`);
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

// Substitui a lista inteira de perfis de uma vez (equivalente ao antigo
// "profiles" salvo por completo a cada alteração no painel de administração
// de usuários — adicionar, remover ou trocar senha de um usuário).
//
// Ponto crítico de segurança: como /api/users e /api/state não devolvem
// mais `password`, o array `profiles` que o front reenvia aqui NÃO traz
// mais a senha de usuários existentes (só de um usuário recém-criado ou que
// acabou de ter a senha trocada, onde o front tem o valor digitado em
// memória). Por isso este endpoint faz um "upsert" que preserva o hash já
// salvo quando o item recebido não traz senha — nunca um DELETE+INSERT
// (que apagaria a senha de todo mundo a cada clique no painel de admin).
async function replaceAllUsers(req, res, next) {
  const client = await pool.connect();
  try {
    const list = Array.isArray(req.body) ? req.body : [];
    const usernames = list.map((u) => u.user || u.username).filter(Boolean);

    await client.query('BEGIN');

    // remove do banco os usuários que não estão mais na lista (ex.: clique
    // em "Remover" no painel de administração)
    if (usernames.length) {
      await client.query('DELETE FROM users WHERE username <> ALL($1::text[])', [usernames]);
    } else {
      await client.query('DELETE FROM users');
    }

    for (const u of list) {
      const username = u.user || u.username;
      if (!username) continue;
      const plainPassword = u.pass || u.password;

      if (plainPassword) {
        const hash = await bcrypt.hash(String(plainPassword), BCRYPT_ROUNDS);
        await client.query(
          `INSERT INTO users (username, password, name, role, is_admin, active)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (username) DO UPDATE SET
             password = EXCLUDED.password, name = EXCLUDED.name, role = EXCLUDED.role,
             is_admin = EXCLUDED.is_admin, active = EXCLUDED.active, updated_at = now()`,
          [username, hash, u.name, u.role || null, !!u.admin, u.active !== false]
        );
      } else {
        // Sem senha no payload: atualiza os demais campos e preserva o
        // hash já salvo. Se o usuário ainda não existir (caso não deveria
        // acontecer pela UI, que exige senha para criar um perfil novo),
        // não há como criar a linha sem senha — registra e ignora.
        const { rowCount } = await client.query(
          `UPDATE users SET name = $2, role = $3, is_admin = $4, active = $5, updated_at = now()
           WHERE username = $1`,
          [username, u.name, u.role || null, !!u.admin, u.active !== false]
        );
        if (!rowCount) {
          console.warn('[users] ignorando usuário novo sem senha informada:', username);
        }
      }
    }

    await client.query('COMMIT');
    const { rows } = await pool.query(`SELECT ${SAFE_COLUMNS} FROM users ORDER BY id`);
    res.json(rows);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

async function createUser(req, res, next) {
  try {
    const { username, password, name, role, admin, active } = req.body;
    if (!username || !password || !name) {
      return res.status(400).json({ error: 'username, password e name são obrigatórios' });
    }
    const hash = await bcrypt.hash(String(password), BCRYPT_ROUNDS);
    const { rows } = await pool.query(
      `INSERT INTO users (username, password, name, role, is_admin, active)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${SAFE_COLUMNS}`,
      [username, hash, name, role || null, !!admin, active !== false]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'username já cadastrado' });
    next(err);
  }
}

async function updateUser(req, res, next) {
  try {
    const { id } = req.params;
    const { password, name, role, admin, active } = req.body;
    const hash = password ? await bcrypt.hash(String(password), BCRYPT_ROUNDS) : null;

    const { rows } = await pool.query(
      `UPDATE users SET
         password = COALESCE($1, password),
         name = COALESCE($2, name),
         role = COALESCE($3, role),
         is_admin = COALESCE($4, is_admin),
         active = COALESCE($5, active),
         updated_at = now()
       WHERE id = $6
       RETURNING ${SAFE_COLUMNS}`,
      [hash, name ?? null, role ?? null, admin ?? null, active ?? null, id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

async function deleteUser(req, res, next) {
  try {
    const { rowCount } = await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { listUsers, replaceAllUsers, createUser, updateUser, deleteUser };
