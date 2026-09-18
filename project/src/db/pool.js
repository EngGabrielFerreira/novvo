const { Pool } = require('pg');

// Se DATABASE_URL estiver definida (ex.: Render PostgreSQL em produção),
// ela tem prioridade sobre as variáveis DB_* individuais (uso local/Docker).
// Em produção, bancos gerenciados (Render, Railway, etc.) normalmente
// exigem SSL; localmente (Docker Compose / DB_HOST) não usamos SSL.
const useSsl = !!process.env.DATABASE_URL && process.env.NODE_ENV === 'production';

const connectionConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: useSsl ? { rejectUnauthorized: false } : false,
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'app_db',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    };

const pool = new Pool(connectionConfig);

pool.on('error', (err) => {
  console.error('[db] erro inesperado no pool de conexões', err);
});

module.exports = pool;
