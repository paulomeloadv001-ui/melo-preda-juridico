#!/bin/bash
# ============================================================
# Melo & Preda - Build para Cloudflare Workers
# ============================================================
set -e

echo "🏗️  Melo & Preda - Build para Cloudflare Workers"
echo "================================================"

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

# Limpar build anterior
echo "🧹 Limpando build anterior..."
rm -rf dist-cf
mkdir -p dist-cf

# 1. Build do Frontend (Vite)
echo "⚛️  Building frontend (Vite)..."
npx vite build 2>&1 | tail -5
cp -r dist/public dist-cf/public
echo "   ✅ Frontend: $(du -sh dist-cf/public | awk '{print $1}')"

# 2. Build do Worker (esbuild)
echo "⚙️  Building worker (esbuild)..."
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
echo "   ✅ Worker: $(ls -lh dist-cf/worker.js | awk '{print $5}')"

# 3. Verificar tamanho
echo ""
BUNDLE_SIZE=$(stat -c%s dist-cf/worker.js 2>/dev/null || stat -f%z dist-cf/worker.js 2>/dev/null)
BUNDLE_KB=$((BUNDLE_SIZE / 1024))
if [ "$BUNDLE_KB" -gt 10240 ]; then
  echo "⚠️  AVISO: Bundle maior que 10MB. Workers tem limite de 10MB."
else
  echo "✅ Bundle dentro do limite (${BUNDLE_KB}KB < 10240KB)"
fi

echo ""
echo "✅ Build concluído com sucesso!"
echo "   Para deploy: CLOUDFLARE_API_TOKEN=<token> npx wrangler deploy"
