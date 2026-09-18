# NOVVO | Controle de Revestimentos — Marajoara (Full Stack)

Aplicação de controle de levantamento, retiradas, recebimentos e distribuição
de revestimentos da obra Novvo Marajoara. Este pacote transforma o dashboard
original (HTML/CSS/JS, 100% client-side com `localStorage`) em uma aplicação
Full Stack com back-end em Node.js/Express, banco PostgreSQL e Docker,
**preservando integralmente** a interface, o layout e as funcionalidades
existentes.

> ⚠️ **Status atual — leia antes de tudo:**
> - **Deploy realizado: NÃO.** O ambiente onde este projeto está sendo
>   preparado não tem acesso à internet (testado agora mesmo: `curl` para
>   `api.render.com` e `github.com` retornam `403 host_not_allowed` — é um
>   proxy de saída com allowlist, não uma falha passageira). Não existe
>   nenhuma URL pública real — nenhuma foi inventada.
> - **Projeto preparado para deploy: SIM.** Docker local, `render.yaml`,
>   script de migração de banco e guia passo a passo estão prontos nesta
>   entrega (seção 9). Falta apenas você executar a publicação a partir de
>   um ambiente com acesso ao GitHub/Render.
> - Sintaxe de todos os `.js` validada com `node --check`; estrutura do SQL
>   validada estaticamente (parênteses balanceados, 1000 linhas de seed).
>   `docker compose up` **não pôde** ser executado de ponta a ponta aqui,
>   pelo mesmo motivo de falta de rede.

---

## 1) O que foi encontrado no projeto original

O arquivo `NOVVO_Dashboard_Revestimentos_Marajoara_REV050_FINAL.html` era uma
página única com:

- **`DATA[]`** — levantamento quantitativo "master" de revestimentos: 1000
  linhas (`MAR-0001`…`MAR-1000`), com torre, pavimento, ambiente, código,
  material, dimensão, unidade, quantidade e tipo. É consultado, nunca editado
  pela interface.
- **`withdrawals`** (`localStorage` `novvo_marajoara_retiradas_v1`) — retiradas
  de material de obra, com CRUD completo (criar, corrigir).
- **`deliveryRows`** (`novvo_marajoara_entregas_v1`) — recebimentos/entregas
  (lote, medidas, tonalidade, nota fiscal etc.).
- **`lossRows`** (`novvo_marajoara_perdas_v1`) — estrutura de perdas, já
  declarada e persistida, mas sem tela ativa no momento (mantida por simetria).
- **`boxInfo`** (`novvo_marajoara_m2caixa_v1`) — mapa `código||material` →
  m²/caixa, usado no cálculo de quantidade de caixas.
- **`profiles`** (`novvo_marajoara_perfis_v1`) e **`auditLogs`**
  (`novvo_marajoara_auditoria_v1`) — usuários do sistema (login local) e
  trilha de auditoria de ações.
- **`comparativoLotes` / `sobrasLotes`** (chaves de `localStorage` sem
  prefixo `LS_`) — estrutura de distribuição de lotes entre torres/pavimentos,
  profundamente aninhada e gerada inteiramente em JavaScript.

Todas essas estruturas eram mantidas **apenas no navegador**. Este projeto
passa a persisti-las em PostgreSQL, mantendo o HTML/CSS/JS originais.

---

## 2) Arquitetura

```
Navegador
    ↓
HTML / CSS / JavaScript  (public/index.html — original, preservado)
    ↓
fetch()                  (camada de sincronização inserida no próprio HTML)
    ↓
API REST                 (Express)
    ↓
Node.js + Express        (server.js, src/routes, src/controllers)
    ↓
PostgreSQL                (database/init.sql)
```

### Estrutura de pastas

```
projeto/
├── public/
│   └── index.html        # front-end original + camada de sync com a API
│
├── src/
│   ├── routes/            # definição das rotas REST por recurso
│   ├── controllers/       # regra de acesso a dados (SQL parametrizado)
│   ├── db/pool.js         # pool de conexão pg
│   └── middleware/errorHandler.js
│
├── database/
│   ├── init.sql            # schema completo (executado 1x na criação do container)
│   └── seed_materials.sql  # seed dos 1000 materiais (idempotente: ON CONFLICT DO NOTHING)
│
├── scripts/
│   └── migrate.js          # aplica init.sql + seed contra DATABASE_URL (uso: Render)
│
├── server.js
├── package.json
├── Dockerfile
├── docker-compose.yml
├── render.yaml              # Blueprint do Render (Web Service + PostgreSQL)
├── .dockerignore
├── .gitignore
├── .env.example
└── README.md
```

---

## 3) Banco de dados

| Tabela        | Finalidade                                                             |
|---------------|--------------------------------------------------------------------------|
| `materials`   | Levantamento base (somente leitura pela API — dado de referência)       |
| `users`       | Perfis de login (equivalente a `profiles`)                              |
| `audit_logs`  | Trilha de auditoria (append-only)                                       |
| `withdrawals` | Retiradas de material, com FK para `materials`                          |
| `deliveries`  | Recebimentos/entregas de material                                        |
| `losses`      | Perdas de material (tabela simétrica a `withdrawals`, hoje sem uso na UI)|
| `box_info`    | Mapa chave→valor de m²/caixa por material                               |
| `app_state`   | JSONB para `comparativoLotes` e `sobrasLotes` (ver nota abaixo)         |

**Nota sobre `app_state`**: `comparativoLotes` e `sobrasLotes` são estruturas
de distribuição por lote (torre → pavimento → lote → cálculo) geradas e
consumidas inteiramente em JavaScript no front, sem um formato tabular fixo.
Modelá-las como tabelas relacionais normalizadas exigiria reescrever toda a
lógica de distribuição da aba correspondente — fora do escopo de "conectar o
sistema existente a um banco", e arriscando quebrar a funcionalidade (regra
19 do escopo). Por isso elas são persistidas como JSONB, com endpoints REST
próprios (`GET/PUT /api/state/comparativoLotes` e `.../sobrasLotes`).
Se no futuro essas telas forem reformuladas, é um bom candidato a normalizar.

Todos os valores monetários/numéricos usam `NUMERIC`, nunca `FLOAT`.
Relacionamentos reais usam chaves estrangeiras (`withdrawals.material_id`,
`losses.material_id` → `materials.id`).

---

## 4) API REST

Base: `/api`

| Recurso                | Métodos                                   |
|-------------------------|--------------------------------------------|
| `/api/materials`        | `GET /`, `GET /:id` (somente leitura)      |
| `/api/withdrawals`      | `GET /`, `POST /`, `GET /:id`, `PUT /:id`, `DELETE /:id`, `PUT /` (substitui a lista inteira) |
| `/api/deliveries`       | idem `withdrawals`                          |
| `/api/losses`           | `GET /`, `POST /`, `PUT /:id`, `DELETE /:id`, `PUT /` |
| `/api/box-info`         | `GET /` (objeto completo), `PUT /:key`, `DELETE /:key`, `PUT /` (substitui tudo) |
| `/api/users`            | `GET /`, `POST /`, `PUT /:id`, `DELETE /:id`, `PUT /` |
| `/api/audit-logs`       | `GET /`, `POST /`, `PUT /` |
| `/api/state`            | `GET /` — estado agregado para hidratar o front |
| `/api/state/comparativoLotes` | `GET`, `PUT` |
| `/api/state/sobrasLotes`      | `GET`, `PUT` |
| `/api/auth/login`       | `POST /` — valida usuário/senha no servidor (bcrypt), nunca devolve senha |
| `/api/auth/me`          | `GET /` — confirma sessão via cookie (infraestrutura pronta; não usada pelo front hoje — ver seção 10) |
| `/api/auth/logout`      | `POST /` — limpa o cookie de sessão |
| `/api/health`           | `GET /` — `{ status, database }` |

Todas as consultas usam `pool.query('... WHERE id = $1', [id])` — nunca
concatenação de strings vindas do usuário. **Nenhum endpoint devolve senha
ou hash de senha** — `/api/users`, `/api/state` e `/api/auth/login` retornam
apenas `{ id, username/user, name, role, admin, active }`.

### Exemplos

```bash
curl http://localhost:3000/api/health
# {"status":"ok","database":"connected"}

curl http://localhost:3000/api/materials?torre=Torre%20A1&limit=5

curl -X POST http://localhost:3000/api/withdrawals \
  -H "Content-Type: application/json" \
  -d '{"materialId":"MAR-0001","material":"Cerâmica Ecocement","ambiente":"Banheiro","torre":"Torre A1","pavimento":"02º ao 09º Pav","qty":10,"date":"2026-09-17","by":"Gabriel"}'

curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"teste","password":"1234"}'
# {"ok":true,"user":{"id":3,"user":"teste","name":"Usuário de teste","role":"Teste","admin":false}}
```

### Como o front usa a API (`public/index.html`)

O HTML/CSS/JS **não foi reescrito**. Foi inserido um pequeno bloco logo após
as constantes `LS_*` (chaves do `localStorage`) que faz duas coisas, sem
alterar nenhuma outra função existente:

1. Busca síncrona `GET /api/state` para popular `SAVED_STATE` **antes** do
   restante do script rodar — o próprio código original já sabia interpretar
   `SAVED_STATE` (era o mecanismo de "importar estado salvo em arquivo").
2. Substitui `localStorage.setItem` por uma versão que grava normalmente no
   `localStorage` (cache local) **e** também envia o valor via `fetch` para o
   endpoint correspondente (`PUT /api/withdrawals`, `/api/box-info`, etc.).

Assim, toda vez que o app original chama `localStorage.setItem(LS_RET, ...)`
(como já fazia), a retirada é automaticamente persistida no PostgreSQL.

---

## 5) Integração com o JavaScript existente

Resumo das trocas equivalentes às pedidas no escopo original — já eram feitas
pelo mecanismo de interceptação, então nenhuma função de renderização foi
tocada:

| Antes (só localStorage)                          | Agora                                                        |
|----------------------------------------------------|----------------------------------------------------------------|
| `localStorage.setItem(LS_RET, JSON.stringify(withdrawals))` | mesmo código + `PUT /api/withdrawals` com o array completo |
| `localStorage.setItem(LS_DELIVERIES, ...)`          | mesmo código + `PUT /api/deliveries`                          |
| `localStorage.setItem(LS_BOX, ...)`                 | mesmo código + `PUT /api/box-info`                            |
| `localStorage.setItem(LS_PROFILES, ...)`            | mesmo código + `PUT /api/users`                                |
| `localStorage.setItem(LS_AUDIT, ...)`               | mesmo código + `PUT /api/audit-logs`                           |
| `localStorage.setItem('comparativoLotes', ...)`     | mesmo código + `PUT /api/state/comparativoLotes`               |
| `localStorage.setItem('sobrasLotes', ...)`          | mesmo código + `PUT /api/state/sobrasLotes`                    |

## 6) Fotos

O front-end original **não possui** nenhum campo, upload ou referência de
imagem (nenhum `<img src=...>` nem `url(...)` para arquivo externo — só CSS
inline/SVG). Por isso não foi necessário `multer` nem tabela de imagens. A
pasta `public/images/` foi criada e o `Dockerfile`/`server.js` já servem
arquivos estáticos de `public/`, então basta adicionar arquivos ali e
referenciá-los pelo caminho relativo se essa funcionalidade for incluída no
futuro — sem necessidade de mudanças estruturais.

---

## 7) Instalação e execução

### Pré-requisitos
- Docker e Docker Compose

### Variáveis de ambiente
Copie `.env.example` para `.env` (o `docker-compose.yml` já define as
variáveis para os containers; o `.env` é útil para rodar `node server.js`
localmente, fora do Docker).

### Subir com Docker

```bash
docker compose up --build
```

- App: http://localhost:3000
- Healthcheck: http://localhost:3000/api/health
- Logs: `docker compose logs -f`
- Parar: `docker compose down`
- Parar removendo os dados: `docker compose down -v` (⚠️ apaga o volume
  `postgres_data` — os dados do banco são perdidos)

O Postgres inicializa `database/init.sql` (que por sua vez roda
`database/seed_materials.sql` via `\i`) automaticamente **apenas na primeira
vez** que o volume `postgres_data` é criado. Se precisar re-popular do zero,
rode `docker compose down -v && docker compose up --build`.

### Rodar localmente sem Docker (banco já disponível)

```bash
npm install
cp .env.example .env   # ajuste DB_HOST=localhost se o Postgres for local
npm run migrate        # aplica database/init.sql + seed via scripts/migrate.js
                        # (alternativa equivalente: psql -h localhost -U postgres -d app_db -f database/init.sql)
npm start
```

---

## 8) Teste funcional (execute no seu ambiente)

```bash
docker compose up --build
curl http://localhost:3000/api/health        # {"status":"ok","database":"connected"}
open http://localhost:3000                    # abrir no navegador
docker compose logs -f
docker compose down
```

Checklist de validação:

**Front-end**
- [ ] `index.html` abre e carrega (login com `teste` / `1234`)
- [ ] CSS funciona (layout, cores, responsividade)
- [ ] JavaScript funciona (sem erros no console)
- [ ] Dashboard, menus, botões, formulários e filtros funcionam
- [ ] Dados são carregados da API (`GET /api/state` no carregamento)

**API**
- [ ] `GET /api/state` retorna o estado agregado
- [ ] `GET /api/health` retorna `{"status":"ok","database":"connected"}`
- [ ] `GET` dos recursos (`/api/materials`, `/api/withdrawals`, etc.)
- [ ] `POST` (ex.: registrar retirada) funciona
- [ ] `PUT` (ex.: corrigir retirada) funciona
- [ ] `DELETE` (ex.: remover retirada) funciona

**Banco**
- [ ] PostgreSQL conectado (`database: "connected"` no `/api/health`)
- [ ] Tabelas criadas (`materials`, `users`, `audit_logs`, `withdrawals`,
      `deliveries`, `losses`, `box_info`, `app_state`)
- [ ] INSERT/SELECT/UPDATE/DELETE funcionando (via CRUD acima)
- [ ] Persistência configurada (`docker compose down` sem `-v` mantém os
      dados; `postgres_data` é volume nomeado)

**Produção**
- [ ] `PORT` configurada via `process.env.PORT` (nunca fixa)
- [ ] `DATABASE_URL` configurada (Render preenche via `render.yaml`)
- [ ] HTTPS (fornecido automaticamente pelo Render em toda URL `.onrender.com`)
- [ ] Deploy realizado
- [ ] URL pública acessível
- [ ] API pública acessível (`/api/health`)
- [ ] Banco de produção conectado

> Este checklist não pôde ser executado neste ambiente de geração (sem
> Docker/rede disponíveis aqui) — apenas a sintaxe de todos os `.js` foi
> validada com `node --check` e a estrutura do SQL foi verificada. As
> últimas quatro linhas ("Produção") só podem ser marcadas após o deploy
> real no Render, feito por você a partir da seção 9.

---

## 9) Guia de publicação no Render (passo a passo)

Pré-requisito: uma conta no GitHub com este projeto em um repositório (pode
ser privado — nesse caso, conecte a conta GitHub à conta Render em
**Account Settings → GitHub → Connect account**, autorizando o acesso ao
repositório antes do Passo 4).

> No seu caso específico, o Postgres `novvo-postgres` **já existe** — siga
> direto o caminho manual abaixo (Passos 1, 2, 4 a 10). **Não use "New +ˋ→
> Blueprint"** com o `render.yaml` deste projeto enquanto o banco já
> existir: Blueprints do Render só conseguem linkar automaticamente um
> banco que o próprio Blueprint cria: apontar para um banco pré-existente
> pelo nome não é suportado, e tentar isso criaria um `novvo-postgres`
> duplicado.

### Passo 1 — Criar conta no Render
Acesse https://render.com e crie uma conta (dá para entrar direto com sua
conta do GitHub).

### Passo 2 — Colocar o projeto em um repositório GitHub
No GitHub, crie um repositório novo (ex.: `novvo-revestimentos`) e suba
todos os arquivos deste projeto (o ZIP completo, seção 15) **na raiz do
repositório** — não deixe o `.zip` sentado dentro do repo sem extrair; o
Render precisa encontrar `package.json` direto na raiz. Não faça commit de
um arquivo `.env` real — só o `.env.example` deve ir para o repositório (o
`.gitignore` já cuida disso).

### Passo 3 — Criar o PostgreSQL no Render (pule se já existir)
"New +" → "PostgreSQL". Nome: `novvo-postgres`. Database: `app_db`. Região:
Oregon (ou a mesma do Web Service). Plano: Free (ou o que preferir).

### Passo 4 — Criar o Web Service
"New +" → "Web Service" → conecte o repositório GitHub.
- **Name**: `novvo-revestimentos`
- **Language/Runtime**: `Node`
- **Region**: **a mesma do banco** (Oregon) — obrigatório para poder usar a
  Internal Database URL
- **Branch**: `main`
- **Root Directory**: deixe em branco (o projeto está na raiz do repositório)

### Passo 5 — Copiar a connection string do banco
Abra a página do `novvo-postgres` no painel do Render → aba **"Connect"** →
copie a **"Internal Database URL"** (começa com `postgres://...`). É esse
valor que vai no `DATABASE_URL` do passo 6 — o Render não expõe a senha do
banco por nenhuma outra via (nem para ferramentas conectadas por API/MCP),
então esse copiar-e-colar é manual mesmo.

### Passo 6 — Configurar as variáveis de ambiente
Na aba "Environment" do Web Service:
| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `10000` |
| `DATABASE_URL` | a Internal Database URL copiada no Passo 5 |
| `JWT_SECRET` | um valor aleatório seu — gere com `openssl rand -hex 32` |
| `DEFAULT_ADMIN_PASSWORD` | **obrigatória** — uma senha sua para os 2 perfis administradores criados no primeiro boot |
| `DEFAULT_TEST_PASSWORD` | **obrigatória** — uma senha sua para o perfil `teste` criado no primeiro boot |

Sem essas duas últimas, `npm run migrate` não cria usuário nenhum na
primeira vez (não há mais senha de fábrica embutida no código — ver seção
10) — você só ficaria sem conseguir logar até definir as duas e rodar
`npm run migrate` de novo (ou criar um usuário manualmente via `POST /api/users`).

### Passo 7 — Build Command
```
npm install && npm run migrate
```
Isso instala as dependências e já aplica `database/init.sql` + os seeds
(materiais e os 3 usuários padrão, com senha hasheada em bcrypt) a cada
deploy — é seguro rodar várias vezes (idempotente: só popula o que ainda
está vazio).

### Passo 8 — Start Command
```
npm start
```

### Passo 9 — Realizar o deploy
Clique em **"Create Web Service"**. Acompanhe o log de build/deploy na
própria tela do Render — o passo `npm run migrate` aparece no log de build;
se `DATABASE_URL` estiver certa, ele termina com
`[migrate] finalizado com sucesso.`.

### Passo 10 — Abrir a URL HTTPS e testar
O Render mostra a URL pública no topo da página do Web Service, no formato
`https://novvo-revestimentos-xxxx.onrender.com` (o sufixo `xxxx` é gerado
pelo Render — copie o valor real que aparecer no seu painel). Depois teste:
```
https://SEU-SERVICO.onrender.com/api/health
```
Deve responder `{"status":"ok","database":"connected"}`. Depois abra a raiz
(`https://SEU-SERVICO.onrender.com/`) para confirmar que o dashboard carrega
e que uma retirada de teste registrada na UI aparece em
`GET /api/withdrawals`.

---

## 10) Segurança

- SQL sempre parametrizado (`$1, $2, ...`), nunca concatenado.
- `.env` fora do controle de versão (`.gitignore`), com `.env.example` como
  referência — nenhuma credencial real está commitada neste projeto.
- `express.json({ limit: '5mb' })` limita o tamanho do corpo das requisições.
- Em produção (`NODE_ENV=production`), o middleware de erro não expõe stack
  traces nem detalhes internos — apenas "Erro interno do servidor".
- `/api/health` não expõe usuário/senha do banco.
- Nenhum `console.log`/`console.error` deste projeto imprime senha — os
  logs de erro (`src/middleware/errorHandler.js`) registram apenas o erro
  do driver `pg`/Express, nunca o corpo da requisição.

### ✅ Login validado no servidor (bcrypt) — sem exposição de senha na API
O login **não é mais validado no navegador**. O fluxo atual é:

1. O front envia `POST /api/auth/login` com `{ username, password }`
   (`src/controllers/authController.js`).
2. O servidor busca o usuário no Postgres e compara a senha digitada com o
   hash salvo (`bcrypt.compare`) — a senha em texto puro nunca é persistida:
   `scripts/migrate.js` cria os 3 usuários padrão com hash a partir de
   `DEFAULT_ADMIN_PASSWORD`/`DEFAULT_TEST_PASSWORD` (variáveis de ambiente
   **obrigatórias** — não há nenhuma senha de fábrica embutida no código;
   sem elas, a migração não cria usuário nenhum), e `usersController.js`
   hasheia (`bcrypt.hash`, 10 rounds) qualquer senha nova antes de gravar,
   seja criando um usuário (`POST /api/users`), editando
   (`PUT /api/users/:id`) ou trocando a senha pelo painel de administração
   (`PUT /api/users`, usado pela integração com o front).
3. Em caso de sucesso, o servidor assina um **JWT** e devolve num cookie
   **`httpOnly`** (`novvo_session`), além de `{ ok:true, user:{...} }` **sem
   nenhum campo de senha**. Em produção, o cookie também é `secure`
   (exige HTTPS — o Render já fornece).
4. `GET /api/users`, `GET /api/state` (que hidrata `profiles` no front) e
   `POST /api/auth/login` **nunca devolvem senha ou hash** — as únicas
   colunas retornadas são `id, username/user, name, role, admin, active`.
5. A segunda tela que pedia senha (confirmar identidade antes de liberar uma
   retirada, `validateWithdrawalPassword()`) também passou a chamar
   `POST /api/auth/login` no servidor, em vez de comparar localmente.
6. `JWT_SECRET` é obrigatória em **qualquer** ambiente, não só produção —
   sem valor de fallback embutido em lugar nenhum do código. O servidor
   **recusa subir** (`process.exit(1)`) se essa variável não estiver
   definida (ver `server.js`). No Render, `render.yaml` já gera uma chave
   aleatória sozinha (`generateValue: true`); em Docker local, está definida
   em `docker-compose.yml` (troque por uma sua se for além da sua máquina).

**O que ainda não foi feito, por escopo** (não pedido nesta rodada, e mudaria
mais o comportamento do sistema do que o solicitado): as demais rotas da API
(`/api/withdrawals`, `/api/deliveries`, etc.) continuam **sem exigir** o
cookie de sessão para aceitar requisições — ou seja, a *autenticação* do
login está no servidor e é segura, mas ainda não há *autorização* por rota
(qualquer requisição à API é aceita, autenticada ou não, como já era antes).
`GET /api/auth/me` já existe e está pronto para isso: o próximo passo natural
é um middleware que exige esse cookie válido nas rotas de escrita
(`POST`/`PUT`/`DELETE`) antes de um uso público mais amplo.

- CORS está aberto (`cors()`); como o front é servido pelo mesmo domínio da
  API, isso não é estritamente necessário — restrinja a origem se algum dia
  o front passar a ser servido de outro domínio.
- Ao testar localmente via `docker compose up --build` (HTTP, sem TLS), o
  cookie `novvo_session` é marcado `secure` (porque o container roda com
  `NODE_ENV=production`) e por isso o navegador não vai armazená-lo — isso
  **não afeta o login atual** (que hoje depende só da resposta JSON, não do
  cookie), mas vale saber caso/quando alguma rota passar a exigir o cookie.

---

## 11) Solução de problemas

| Sintoma | Causa provável | Solução |
|---|---|---|
| `/api/health` retorna `database: "disconnected"` | Postgres ainda subindo ou variáveis erradas | Aguarde o healthcheck do container `postgres`; confira `DB_HOST=postgres` (nunca `localhost`) dentro do Docker |
| Dashboard abre "zerado" (sem retiradas antigas) | Primeira execução (banco vazio) ou falha na chamada síncrona `/api/state` | Veja o console do navegador; a UI cai para o cache do `localStorage` automaticamente |
| Alterações na UI não aparecem via API | Bloqueio de rede do navegador para `/api/*` (proxy, CORS, etc.) | Verifique o console (erros de `fetch` são logados como aviso, não travam a UI) |
| `docker compose up` falha ao instalar dependências | Sem acesso à internet no ambiente de build | Garanta acesso ao registro npm durante o build da imagem |
| No Render, tabelas não existem após o deploy | `DATABASE_URL` errada/ausente no momento do build, ou o Build Command não inclui `npm run migrate` | Confira a variável (Passo 6) e o Build Command (Passo 7); rode `npm run migrate` manualmente uma vez via aba "Shell" do Web Service se precisar |
| Banco Free do Render parou de responder após ~30 dias | Bancos PostgreSQL gratuitos do Render expiram automaticamente após 30 dias de criação | Faça upgrade de plano antes do vencimento, ou recrie o banco e rode `npm run migrate` novamente |
| App do Render "dorme" e demora para responder no primeiro acesso | Plano Free de Web Service hiberna após período sem tráfego | Normal no plano gratuito; a primeira requisição após inatividade pode levar dezenas de segundos |
