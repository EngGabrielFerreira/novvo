// Middleware central de tratamento de erros. Em produção (NODE_ENV=production)
// evita expor stack traces ou detalhes internos do banco.
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  console.error('[erro]', err);

  const isProd = process.env.NODE_ENV === 'production';
  const status = err.status || 500;

  res.status(status).json({
    error: isProd ? 'Erro interno do servidor' : (err.message || 'Erro interno do servidor'),
  });
}

module.exports = errorHandler;
