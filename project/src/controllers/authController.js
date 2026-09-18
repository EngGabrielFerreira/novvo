const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

// server.js já garante, na subida do servidor, que JWT_SECRET está
// definida (em qualquer ambiente) — chegar até aqui sem ela já não deveria
// ser possível; não há nenhum valor de fallback aqui.
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '8h';
const COOKIE_NAME = 'novvo_session';
const COOKIE_MAX_AGE_MS = 8 * 60 * 60 * 1000;

// POST /api/auth/login
// A senha é validada aqui, no servidor, contra o hash bcrypt salvo em
// `users.password`. A resposta NUNCA inclui a senha/hash — apenas os campos
// que o front já usava para exibir o usuário logado (name, role, user, admin).
async function login(req, res, next) {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ ok: false, error: 'Informe usuário e senha.' });
    }

    const { rows } = await pool.query(
      `SELECT id, username, password, name, role, is_admin AS admin, active
         FROM users WHERE lower(username) = lower($1)`,
      [String(username).trim()]
    );
    const user = rows[0];

    // Mesma mensagem genérica tanto para "usuário não existe" quanto para
    // "senha errada" — evita que a API revele quais usuários existem.
    const invalidCredentials = () => res.status(401).json({ ok: false, error: 'Usuário ou senha inválidos.' });

    if (!user || user.active === false) return invalidCredentials();

    const match = await bcrypt.compare(String(password), user.password);
    if (!match) return invalidCredentials();

    const safeUser = { id: user.id, user: user.username, name: user.name, role: user.role, admin: user.admin };
    const token = jwt.sign(safeUser, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // exige HTTPS em produção (Render já fornece)
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE_MS,
    });

    res.json({ ok: true, user: safeUser });
  } catch (err) {
    next(err);
  }
}

// GET /api/auth/me — confirma se o cookie de sessão ainda é válido. Não é
// usado pelo front hoje (que continua controlando a tela de login via
// sessionStorage, como já fazia), mas fica pronto para quando as rotas da
// API passarem a exigir sessão (ver README, seção Segurança).
function me(req, res) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ ok: false });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    res.json({ ok: true, user: payload });
  } catch (e) {
    res.status(401).json({ ok: false });
  }
}

// POST /api/auth/logout
function logout(req, res) {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
}

module.exports = { login, me, logout, JWT_SECRET, COOKIE_NAME };
