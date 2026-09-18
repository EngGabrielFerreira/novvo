FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 3000

# Roda a migração (schema + seed idempotentes, incluindo os usuários padrão
# já com senha hasheada em bcrypt) e então inicia o servidor. Isso faz
# `docker compose up --build` funcionar sozinho, sem passo manual.
CMD ["sh", "-c", "node scripts/migrate.js && node server.js"]
