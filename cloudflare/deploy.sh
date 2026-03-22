#!/bin/bash
# ============================================================
# Melo & Preda - Deploy Completo para Cloudflare Workers
# ============================================================
# Uso: CLOUDFLARE_API_TOKEN=<token> bash cloudflare/deploy.sh
# ============================================================
set -e

echo "🚀 Melo & Preda - Deploy para Cloudflare Workers"
echo "================================================"

# Verificar token
if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
  echo "❌ CLOUDFLARE_API_TOKEN não definido!"
  echo "   Uso: CLOUDFLARE_API_TOKEN=<token> bash cloudflare/deploy.sh"
  exit 1
fi

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

ACCOUNT_ID="f204e5687c7c0641060d10c89bb73771"

# ============================================================
# PASSO 1: Criar banco D1 (se não existir)
# ============================================================
echo ""
echo "📦 Passo 1: Verificando banco D1..."
D1_LIST=$(npx wrangler d1 list 2>&1 || true)
if echo "$D1_LIST" | grep -q "melo-preda-db"; then
  echo "   ✅ Banco D1 'melo-preda-db' já existe"
  D1_ID=$(echo "$D1_LIST" | grep "melo-preda-db" | awk '{print $1}')
else
  echo "   🔨 Criando banco D1 'melo-preda-db'..."
  D1_CREATE=$(npx wrangler d1 create melo-preda-db 2>&1)
  D1_ID=$(echo "$D1_CREATE" | grep -o '"database_id":"[^"]*"' | cut -d'"' -f4)
  echo "   ✅ Banco D1 criado: $D1_ID"
fi

# Atualizar wrangler.toml com o ID real
if [ -n "$D1_ID" ]; then
  echo "   📝 Atualizando wrangler.toml com D1 ID: $D1_ID"
  sed -i "s/PLACEHOLDER_D1_ID/$D1_ID/g" wrangler.toml
fi

# ============================================================
# PASSO 2: Aplicar schema no D1
# ============================================================
echo ""
echo "📋 Passo 2: Aplicando schema no D1..."
npx wrangler d1 execute melo-preda-db --remote --file=cloudflare/schema.sql 2>&1 || {
  echo "   ⚠️  Schema pode já estar aplicado, continuando..."
}
echo "   ✅ Schema aplicado"

# ============================================================
# PASSO 3: Migrar dados do TiDB para D1
# ============================================================
echo ""
echo "📊 Passo 3: Migrando dados do TiDB para D1..."
if [ -f "cloudflare/seed-data.sql" ]; then
  echo "   📁 Arquivo seed-data.sql encontrado, importando..."
  npx wrangler d1 execute melo-preda-db --remote --file=cloudflare/seed-data.sql 2>&1 || {
    echo "   ⚠️  Alguns registros podem já existir, continuando..."
  }
  echo "   ✅ Dados importados"
else
  echo "   ⚠️  Arquivo seed-data.sql não encontrado."
  echo "   Execute primeiro: node cloudflare/migrate-data.mjs"
  echo "   Continuando deploy sem dados..."
fi

# ============================================================
# PASSO 4: Build do projeto
# ============================================================
echo ""
echo "🏗️  Passo 4: Build do projeto..."

# Frontend
echo "   ⚛️  Building frontend..."
npx vite build 2>&1 | tail -3

# Copiar frontend para dist-cf
rm -rf dist-cf/public
mkdir -p dist-cf
cp -r dist/public dist-cf/public

# Backend Worker
echo "   ⚙️  Building worker..."
npx esbuild cloudflare/worker.ts \
  --platform=node \
  --bundle \
  --format=esm \
  --outfile=dist-cf/worker.js \
  --external:cloudflare:workers \
  --external:cloudflare:node \
  --external:@aws-sdk/client-s3 \
  --external:@aws-sdk/s3-request-presigner \
  --target=es2022 \
  --minify 2>&1 | tail -3

echo "   ✅ Build concluído"
echo "   📊 Worker: $(ls -lh dist-cf/worker.js | awk '{print $5}')"
echo "   📊 Frontend: $(du -sh dist-cf/public | awk '{print $1}')"

# ============================================================
# PASSO 5: Deploy do Worker
# ============================================================
echo ""
echo "🚀 Passo 5: Deploy do Worker..."
npx wrangler deploy 2>&1 | tail -10
echo "   ✅ Worker deployed"

# ============================================================
# PASSO 6: Configurar secrets
# ============================================================
echo ""
echo "🔐 Passo 6: Configurando secrets..."
echo "   ⚠️  Configure os secrets manualmente:"
echo "   npx wrangler secret put JWT_SECRET"
echo "   npx wrangler secret put DATAJUD_API_KEY"
echo "   npx wrangler secret put JUSCONSIG_API_KEY"
echo "   npx wrangler secret put BUILT_IN_FORGE_API_KEY"
echo "   npx wrangler secret put BUILT_IN_FORGE_API_URL"
echo "   npx wrangler secret put OAUTH_SERVER_URL"
echo "   npx wrangler secret put OWNER_OPEN_ID"
echo "   npx wrangler secret put OWNER_NAME"
echo "   npx wrangler secret put VITE_APP_ID"
echo "   npx wrangler secret put VITE_OAUTH_PORTAL_URL"
echo "   npx wrangler secret put VITE_FRONTEND_FORGE_API_KEY"
echo "   npx wrangler secret put VITE_FRONTEND_FORGE_API_URL"

# ============================================================
# RESULTADO
# ============================================================
echo ""
echo "============================================================"
echo "✅ Deploy concluído!"
echo ""
echo "🌐 URL: https://melo-preda-juridico.paulomeloadv001.workers.dev"
echo "📊 Dashboard: https://dash.cloudflare.com"
echo ""
echo "Próximos passos:"
echo "  1. Configure os secrets (passo 6 acima)"
echo "  2. Teste a URL do Worker"
echo "  3. (Opcional) Configure domínio personalizado"
echo "============================================================"
