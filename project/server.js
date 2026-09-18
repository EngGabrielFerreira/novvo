require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const pool = require('./src/db/pool');
const errorHandler = require('./src/middleware/errorHandler');

const materialsRoutes = require('./src/routes/materials');
const withdrawalsRoutes = require('./src/routes/withdrawals');
const deliveriesRoutes = require('./src/routes/deliveries');
const lossesRoutes = require('./src/routes/losses');
const boxInfoRoutes = require('./src/routes/boxInfo');
const usersRoutes = require('./src/routes/users');
const auditRoutes = require('./src/routes/audit');
const stateRoutes = require('./src/routes/state');
const authRoutes = require('./src/routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Nenhum segredo tem valor de fallback embutido no código (nem em
// desenvolvimento) — sem JWT_SECRET definida, as sessões de login seriam
// assinadas com um valor previsível/ausente. O servidor recusa subir sem
// essa variável, em qualquer ambiente (ver .env.example / docker-compose.yml
// para uso local, e render.yaml, que já gera uma chave aleatória sozinha
// no Render).
if (!process.env.JWT_SECRET) {
  console.error('[server] JWT_SECRET não configurada. Defina essa variável de ambiente antes de subir o servidor (ver .env.example).');
  process.exit(1);
}

app.use(cors());
app.use(cookieParser());
app.use(express.json({ limit: '5mb' }));

// -----------------------------------------------------------------------
// Front-end estático (HTML/CSS/JS existentes, preservados como estavam)
// -----------------------------------------------------------------------
// O index.html NUNCA pode ficar em cache do navegador: se ficar, um
// aparelho pode rodar uma cópia antiga do JS por horas, com os dados de
// retiradas/entregas congelados no que era verdade quando a página
// carregou — e ao salvar qualquer coisa depois, a sincronização
// (PUT /api/withdrawals etc., que substitui a lista inteira) manda esses
// dados velhos de volta, apagando o que outro usuário fez nesse meio
// tempo. Por isso index.html sempre revalida no servidor a cada acesso.
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  },
}));

// As respostas da API também nunca devem ficar em cache do navegador —
// mesmo motivo acima.
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// -----------------------------------------------------------------------
// Healthcheck — verifica servidor + PostgreSQL, sem expor dados sensíveis
// -----------------------------------------------------------------------
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'error', database: 'disconnected' });
  }
});

// -----------------------------------------------------------------------
// Rotas da API
// -----------------------------------------------------------------------
app.use('/api/materials', materialsRoutes);
app.use('/api/withdrawals', withdrawalsRoutes);
app.use('/api/deliveries', deliveriesRoutes);
app.use('/api/losses', lossesRoutes);
app.use('/api/box-info', boxInfoRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/state', stateRoutes);
app.use('/api/auth', authRoutes);

// Qualquer rota não-API cai no index.html (SPA simples de uma página)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(errorHandler);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] NOVVO Revestimentos rodando em http://0.0.0.0:${PORT}`);
});
