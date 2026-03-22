# Melo & Preda - Deploy no Cloudflare Workers

## Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│                    Cloudflare Edge                       │
│                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────┐ │
│  │   Workers     │    │   D1 (SQLite)│    │  Assets   │ │
│  │  Express +    │◄──►│  34 tabelas  │    │  React    │ │
│  │  tRPC Backend │    │  4817 regs   │    │  Frontend │ │
│  └──────────────┘    └──────────────┘    └───────────┘ │
│         │                                               │
│         ├── /api/trpc/*  (tRPC procedures)              │
│         ├── /api/v1/*    (REST API)                     │
│         ├── /api/upload/* (Chunked upload)              │
│         └── /*           (SPA fallback)                 │
└─────────────────────────────────────────────────────────┘
         │
         │ Sincronização
         ▼
┌─────────────────────────────────────────────────────────┐
│                    Manus Platform                        │
│                                                         │
│  ┌──────────────┐    ┌──────────────┐                   │
│  │   Express +   │    │  TiDB/MySQL  │                   │
│  │   tRPC Server │◄──►│  34 tabelas  │                   │
│  └──────────────┘    └──────────────┘                   │
│                                                         │
│  URL: https://melopreda-4imsnkhw.manus.space            │
└─────────────────────────────────────────────────────────┘
```

## Pré-requisitos

1. **Conta Cloudflare** com Workers Paid Plan ($5/mês)
2. **API Token** com permissões:
   - Account → Workers Scripts → Edit
   - Account → D1 → Edit
   - Account → Workers Routes → Edit
3. **Node.js 22+** e **pnpm** instalados

## Deploy Manual

### 1. Configurar token

```bash
export CLOUDFLARE_API_TOKEN="seu-token-aqui"
```

### 2. Criar banco D1

```bash
npx wrangler d1 create melo-preda-db
# Copie o database_id e atualize no wrangler.toml
```

### 3. Aplicar schema

```bash
npx wrangler d1 execute melo-preda-db --remote --file=cloudflare/schema.sql
```

### 4. Migrar dados do TiDB

```bash
# Gerar arquivo de migração (requer DATABASE_URL)
node cloudflare/migrate-data.mjs

# Importar no D1
npx wrangler d1 execute melo-preda-db --remote --file=cloudflare/seed-data.sql
```

### 5. Build e Deploy

```bash
# Build frontend
npx vite build
mkdir -p dist-cf && cp -r dist/public dist-cf/public

# Build worker
npx esbuild cloudflare/worker.ts \
  --platform=node --bundle --format=esm \
  --outfile=dist-cf/worker.js \
  --external:cloudflare:workers --external:cloudflare:node \
  --external:@aws-sdk/client-s3 --external:@aws-sdk/s3-request-presigner \
  --target=es2022 --minify

# Deploy
npx wrangler deploy
```

### 6. Configurar secrets

```bash
npx wrangler secret put JWT_SECRET
npx wrangler secret put DATAJUD_API_KEY
npx wrangler secret put JUSCONSIG_API_KEY
npx wrangler secret put BUILT_IN_FORGE_API_KEY
npx wrangler secret put BUILT_IN_FORGE_API_URL
npx wrangler secret put OAUTH_SERVER_URL
npx wrangler secret put OWNER_OPEN_ID
npx wrangler secret put OWNER_NAME
npx wrangler secret put VITE_APP_ID
npx wrangler secret put VITE_OAUTH_PORTAL_URL
npx wrangler secret put VITE_FRONTEND_FORGE_API_KEY
npx wrangler secret put VITE_FRONTEND_FORGE_API_URL
npx wrangler secret put VITE_APP_TITLE
npx wrangler secret put VITE_APP_LOGO
```

## Deploy Automático (CI/CD)

O arquivo `.github/workflows/deploy-cloudflare.yml` configura deploy automático via GitHub Actions.

### Configurar secrets no GitHub:

1. Vá em Settings → Secrets → Actions
2. Adicione:
   - `CLOUDFLARE_API_TOKEN`: seu token da API
   - `CLOUDFLARE_ACCOUNT_ID`: `f204e5687c7c0641060d10c89bb73771`

Cada push na branch `main` dispara deploy automático.

## URLs

- **Cloudflare**: `https://melo-preda-juridico.paulomeloadv001.workers.dev`
- **Manus**: `https://melopreda-4imsnkhw.manus.space`

## Sincronização de Dados

Para manter os dados sincronizados entre Manus (TiDB) e Cloudflare (D1):

```bash
# Re-exportar dados do TiDB
node cloudflare/migrate-data.mjs

# Re-importar no D1 (usa INSERT OR IGNORE para evitar duplicatas)
npx wrangler d1 execute melo-preda-db --remote --file=cloudflare/seed-data.sql
```

## Limitações do Cloudflare Workers

- **Bundle size**: máximo 10 MB (atual: 3.5 MB ✅)
- **CPU time**: 30s por request (Workers Paid)
- **D1 rows**: 10M rows por banco (free), 10B (paid)
- **D1 storage**: 5 GB (free), 50 GB (paid)
- **Subrequest limit**: 1000 por request
- **Memory**: 128 MB por Worker

## Estrutura de Arquivos

```
cloudflare/
├── worker.ts          # Entry point do Worker (Express adapter)
├── db-adapter.ts      # Camada de abstração D1/MySQL
├── schema.sql         # Schema SQLite para D1 (34 tabelas)
├── seed-data.sql      # Dados migrados do TiDB (gerado)
├── migrate-data.mjs   # Script de migração TiDB → D1
├── build.sh           # Script de build
├── deploy.sh          # Script de deploy completo
└── README.md          # Este arquivo
```
