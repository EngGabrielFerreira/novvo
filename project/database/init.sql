-- ============================================================================
-- NOVVO | Controle de Revestimentos — Marajoara
-- Script de inicialização do banco PostgreSQL
-- Executado automaticamente pelo container postgres (docker-entrypoint-initdb.d)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) materials
-- Levantamento quantitativo de revestimentos (dado-base do projeto).
-- É uma tabela de REFERÊNCIA: alimentada uma vez pela planilha original
-- (seed_materials.sql) e consultada (não editada) pela interface — por isso
-- a API expõe apenas endpoints de LEITURA para este recurso (ver 18).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS materials (
  id            TEXT PRIMARY KEY,            -- ex.: MAR-0001
  source        TEXT,                        -- "Piso / Laje", "Parede / Rodapé" ...
  project       TEXT,                        -- código do projeto/prancha
  fase          TEXT,
  torre         TEXT,
  pavimento     TEXT,
  ambiente      TEXT,
  base_ambiente TEXT,
  code          TEXT,                        -- código do item de memorial (ex.: 1.3)
  material      TEXT NOT NULL,
  dimension     TEXT,
  unit          TEXT,
  qty           NUMERIC(14,4) NOT NULL DEFAULT 0,
  type          TEXT,
  perimetro     NUMERIC(14,4),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_materials_code_material ON materials (code, material);
CREATE INDEX IF NOT EXISTS idx_materials_torre_pav ON materials (torre, pavimento);

-- ----------------------------------------------------------------------------
-- 2) users (perfis de acesso ao dashboard — substitui LS_PROFILES)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id         SERIAL PRIMARY KEY,
  username   TEXT UNIQUE NOT NULL,
  password   TEXT NOT NULL,        -- hash bcrypt (nunca texto puro; gerado por
                                    -- src/controllers/usersController.js e por
                                    -- scripts/migrate.js no seed inicial)
  name       TEXT NOT NULL,
  role       TEXT,
  is_admin   BOOLEAN NOT NULL DEFAULT false,
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 3) audit_logs (trilha de auditoria — substitui LS_AUDIT). Somente
--    leitura/gravação (append-only); não há edição/remoção pela UI.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id          SERIAL PRIMARY KEY,
  username    TEXT,
  name        TEXT,
  role        TEXT,
  login_at    TIMESTAMPTZ,
  saved_at    TIMESTAMPTZ,
  at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_ms BIGINT,
  action      TEXT,
  revision    TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_at ON audit_logs (at DESC);

-- ----------------------------------------------------------------------------
-- 4) withdrawals (retiradas de material de obra — substitui LS_RET)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS withdrawals (
  id          SERIAL PRIMARY KEY,
  material_id TEXT NOT NULL,   -- referencia materials.id "em espírito" — sem FK
                                -- de propósito: o front usa variações do id
                                -- base (ex.: "MAR-0001-P02" por unidade/pavimento)
                                -- que nunca existiram como linha própria em
                                -- materials, igual já era no localStorage original.
  material    TEXT NOT NULL,   -- desnormalizado propositalmente (snapshot do
                                -- nome no momento da retirada, como no front)
  ambiente    TEXT,
  torre       TEXT,
  pavimento   TEXT,
  qty         NUMERIC(14,4) NOT NULL CHECK (qty > 0),
  date        DATE,
  time        TEXT,
  by_name     TEXT,   -- "by" no front (retirado por)
  company     TEXT,
  obs         TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_withdrawals_material_id ON withdrawals (material_id);

-- ----------------------------------------------------------------------------
-- 5) deliveries (recebimentos/entregas de material — substitui LS_DELIVERIES)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deliveries (
  id               SERIAL PRIMARY KEY,
  lote             TEXT,
  medida1          TEXT,
  medida2          TEXT,
  reserva_pct      NUMERIC(6,2) DEFAULT 0,
  manutencao_pct   NUMERIC(6,2) DEFAULT 0,
  invoice          TEXT,
  tonality         TEXT,
  description      TEXT,
  qty              NUMERIC(14,4),
  delivery         TEXT,
  date             DATE,
  legacy_m2        NUMERIC(14,4),  -- campo antigo (_legacyM2) preservado p/ migração
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 6) losses (perdas de material — substitui LS_LOSS; recurso hoje sem uso
--    ativo na UI, mas mantido para simetria/uso futuro)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS losses (
  id          SERIAL PRIMARY KEY,
  material_id TEXT,   -- sem FK, mesmo motivo do withdrawals.material_id acima
  material    TEXT,
  ambiente    TEXT,
  torre       TEXT,
  pavimento   TEXT,
  qty         NUMERIC(14,4),
  date        DATE,
  reason      TEXT,
  obs         TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 7) box_info (m²/caixa por material — substitui LS_BOX, que era um mapa
--    "code||material" -> valor). Chave textual preservada para bater 1:1
--    com a lógica já existente no front (renderMaterials/boxInput).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS box_info (
  material_key TEXT PRIMARY KEY,   -- "<code>||<material>"
  box_value    TEXT NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 8) app_state — estado agregado (JSONB) para as duas estruturas de
--    distribuição por lote (comparativoLotes / sobrasLotes). São mapas
--    profundamente aninhados (torre → pavimento → lote → ...) gerados e
--    consumidos inteiramente pelo front; persisti-los como JSONB evita
--    remodelar uma árvore de dados que já é 100% administrada em JS,
--    mantendo a app funcional sem reescrever a lógica de distribuição.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_state (
  state_key  TEXT PRIMARY KEY,     -- 'comparativoLotes' | 'sobrasLotes'
  value      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO app_state (state_key, value) VALUES
  ('comparativoLotes', '{}'::jsonb),
  ('sobrasLotes', '{}'::jsonb)
ON CONFLICT (state_key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Observação sobre o seed de usuários: NÃO é feito aqui.
-- Senhas precisam ser hasheadas com bcrypt antes de ir para o banco, e SQL
-- puro não faz hash. O seed dos 3 usuários padrão (com senha já hasheada)
-- é feito por scripts/migrate.js, que roda com Node/bcryptjs disponível —
-- via `npm run migrate` (local), automaticamente no boot do container
-- Docker (ver Dockerfile) e no preDeployCommand do Render (ver render.yaml).
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- Seed do levantamento de materiais (1000 registros extraídos do front
-- original). Ver seed_materials.sql.
-- ----------------------------------------------------------------------------
\i /docker-entrypoint-initdb.d/seed_materials.sql
