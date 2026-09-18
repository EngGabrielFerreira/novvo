// scripts/migrate.js
//
// Aplica database/init.sql e database/seed_materials.sql contra o banco
// definido em DATABASE_URL (ou DB_*). Necessário porque o mecanismo
// automático de inicialização do Postgres em Docker
// (docker-entrypoint-initdb.d, que processa `\i` via psql) NÃO existe em
// bancos gerenciados como o Render PostgreSQL — lá é preciso rodar o schema
// manualmente (ou via um passo de deploy) usando um client de verdade.
//
// Idempotente: pode ser executado múltiplas vezes sem duplicar dados.
//   - init.sql usa CREATE TABLE IF NOT EXISTS e ON CONFLICT DO NOTHING.
//   - o seed de materials só roda se a tabela estiver vazia.
//
// Uso:
//   node scripts/migrate.js
//   (lê DATABASE_URL do ambiente; ou DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD)

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const pool = require('../src/db/pool');

// Usuários padrão equivalentes ao antigo DEFAULT_PROFILES do front. As
// senhas NÃO têm mais nenhum valor de fábrica embutido no código — vêm
// obrigatoriamente de DEFAULT_ADMIN_PASSWORD / DEFAULT_TEST_PASSWORD. Se
// essas variáveis não estiverem definidas quando a tabela `users` estiver
// vazia, este script NÃO cria os usuários padrão (ver o aviso logo abaixo,
// em run()) — não existe fallback em texto puro em lugar nenhum. De um
// jeito ou de outro, a senha é hasheada com bcrypt antes do INSERT; nunca
// fica em texto puro no banco.
const DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || null;
const DEFAULT_TEST_PASSWORD = process.env.DEFAULT_TEST_PASSWORD || null;

const DEFAULT_USERS = [
  { username: 'gabriel.ferreira@lavvi.com.br', password: DEFAULT_ADMIN_PASSWORD, name: 'Assistente - Gabriel Ferreira', role: 'Assistente', admin: true },
  { username: 'larissa.oliveira@lavvi.com.br', password: DEFAULT_ADMIN_PASSWORD, name: 'Gerente - Larissa de Oliveira', role: 'Gerente', admin: true },
  { username: 'teste', password: DEFAULT_TEST_PASSWORD, name: 'Usuário de teste', role: 'Teste', admin: false },
];

async function run() {
  const initSqlPath = path.join(__dirname, '..', 'database', 'init.sql');
  const seedSqlPath = path.join(__dirname, '..', 'database', 'seed_materials.sql');

  let initSql = fs.readFileSync(initSqlPath, 'utf-8');
  initSql = initSql.replace(/^\\i .*seed_materials\.sql.*$/m, '-- seed executado separadamente por scripts/migrate.js');

  console.log('[migrate] aplicando database/init.sql ...');
  await pool.query(initSql);
  console.log('[migrate] schema OK.');

  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM materials');
  if (rows[0].count > 0) {
    console.log(`[migrate] tabela materials já populada (${rows[0].count} registros) — seed ignorado.`);
  } else {
    console.log('[migrate] populando materials a partir de database/seed_materials.sql ...');
    const seedSql = fs.readFileSync(seedSqlPath, 'utf-8');
    await pool.query(seedSql);
    console.log('[migrate] seed de materials concluído.');
  }

  const usersCount = await pool.query('SELECT COUNT(*)::int AS count FROM users');
  const shouldReset = process.env.RESET_DEFAULT_PASSWORDS === 'true';

  if (usersCount.rows[0].count > 0 && !shouldReset) {
    console.log(`[migrate] tabela users já populada (${usersCount.rows[0].count} usuários) — seed padrão ignorado.`);
  } else if (!DEFAULT_ADMIN_PASSWORD || !DEFAULT_TEST_PASSWORD) {
    console.warn(
      '[migrate] AVISO: DEFAULT_ADMIN_PASSWORD e/ou DEFAULT_TEST_PASSWORD não estão ' +
      'definidas — nenhum usuário padrão foi criado/atualizado (não existe senha de ' +
      'fábrica no código). Defina essas duas variáveis de ambiente e rode ' +
      '"npm run migrate" novamente, ou crie/edite usuários manualmente via ' +
      'POST/PUT /api/users.'
    );
  } else if (shouldReset && usersCount.rows[0].count > 0) {
    console.log('[migrate] RESET_DEFAULT_PASSWORDS=true — atualizando senha dos usuários padrão ...');
    for (const u of DEFAULT_USERS) {
      const hash = await bcrypt.hash(u.password, 10);
      await pool.query(
        `UPDATE users SET password = $2, active = true, updated_at = now() WHERE username = $1`,
        [u.username, hash]
      );
    }
    console.log(`[migrate] senha de ${DEFAULT_USERS.length} usuários padrão redefinida.`);
  } else {
    console.log('[migrate] criando usuários padrão (senha hasheada com bcrypt) ...');
    for (const u of DEFAULT_USERS) {
      const hash = await bcrypt.hash(u.password, 10);
      await pool.query(
        `INSERT INTO users (username, password, name, role, is_admin, active)
         VALUES ($1,$2,$3,$4,$5,true)
         ON CONFLICT (username) DO NOTHING`,
        [u.username, hash, u.name, u.role, u.admin]
      );
    }
    console.log(`[migrate] ${DEFAULT_USERS.length} usuários padrão criados.`);
  }

  console.log('[migrate] finalizado com sucesso.');
  await pool.end();
}

run().catch((err) => {
  console.error('[migrate] falhou:', err);
  process.exit(1);
});
