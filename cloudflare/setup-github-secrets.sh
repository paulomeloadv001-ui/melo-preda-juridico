#!/bin/bash
# ============================================================
# Script para configurar secrets no GitHub Actions
# Execute este script no seu terminal local com gh CLI instalado
# ============================================================

REPO="paulomeloadv001-ui/melo-preda-juridico"

echo "=== Configurando secrets no GitHub para deploy automático ==="
echo ""

# Cloudflare credentials
gh secret set CLOUDFLARE_API_TOKEN -R "$REPO" --body "cfut_yZ1grU2WYNiEw1Of3WeTaqvSoSkoAY6iDcq5MyOK1f425838"
gh secret set CLOUDFLARE_ACCOUNT_ID -R "$REPO" --body "f204e5687c7c0641060d10c89bb73771"
gh secret set CLOUDFLARE_EMAIL -R "$REPO" --body "paulomeloadv001@gmail.com"
gh secret set CLOUDFLARE_API_KEY -R "$REPO" --body "cfk_dSYoAyC1umyHk3dKxvOGkGJIRZVMfk083GpDMbdZ3eae8a25"
gh secret set D1_DATABASE_ID -R "$REPO" --body "127720ac-4b6b-4d3b-8750-de423e10f03a"

# VITE env vars (para build do frontend)
gh secret set VITE_APP_ID -R "$REPO" --body "4imSnKhwnzycXmSWcGeMqe"
gh secret set VITE_OAUTH_PORTAL_URL -R "$REPO" --body "https://manus.im"
gh secret set VITE_APP_TITLE -R "$REPO" --body "Melo & Preda - Sistema Jurídico Integrado"

echo ""
echo "=== Secrets configurados com sucesso! ==="
echo "O deploy automático será acionado no próximo push para main."
