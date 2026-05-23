/**
 * ROTAS DE WEBHOOKS — Melo Advogados
 * 
 * Endpoints HTTP públicos para receber notificações de sistemas externos.
 * Cada endpoint valida a origem e processa o evento.
 * 
 * Base URL: /api/webhooks/
 * 
 * Endpoints:
 * POST /api/webhooks/neoconsig  — Margem consignável alterada
 * POST /api/webhooks/datajud    — Nova movimentação processual
 * POST /api/webhooks/banco      — Depósito judicial / Alvará
 * POST /api/webhooks/intimacao  — Intimação eletrônica
 * POST /api/webhooks/generico   — Webhook genérico (qualquer tipo)
 * GET  /api/webhooks/status     — Status e tipos suportados
 */
import { Router, Request, Response } from "express";
import { processarWebhook, getWebhookTypes, WebhookEvent } from "./webhookHandler";

export const webhookRouter = Router();

// ==================== MIDDLEWARE DE LOG ====================
webhookRouter.use((req: Request, _res: Response, next) => {
  console.log(`[WEBHOOK] ${req.method} ${req.path} - Origem: ${req.headers['x-webhook-origin'] || 'desconhecida'}`);
  next();
});

// ==================== STATUS ====================
webhookRouter.get("/status", (_req: Request, res: Response) => {
  res.json({
    ativo: true,
    versao: "1.0.0",
    tiposSuportados: getWebhookTypes(),
    endpoints: [
      "POST /api/webhooks/neoconsig",
      "POST /api/webhooks/datajud",
      "POST /api/webhooks/banco",
      "POST /api/webhooks/intimacao",
      "POST /api/webhooks/generico",
    ],
  });
});

// ==================== NEOCONSIG ====================
webhookRouter.post("/neoconsig", async (req: Request, res: Response) => {
  try {
    const event: WebhookEvent = {
      tipo: "margem_alterada",
      origem: "neoconsig",
      timestamp: new Date().toISOString(),
      payload: req.body,
      assinatura: req.headers['x-webhook-signature'] as string,
    };

    const resultado = await processarWebhook(event);
    res.status(resultado.processado ? 200 : 400).json(resultado);
  } catch (error: any) {
    console.error("[WEBHOOK] Erro neoconsig:", error);
    res.status(500).json({ processado: false, mensagem: error.message });
  }
});

// ==================== DATAJUD ====================
webhookRouter.post("/datajud", async (req: Request, res: Response) => {
  try {
    const event: WebhookEvent = {
      tipo: "nova_movimentacao",
      origem: "datajud",
      timestamp: new Date().toISOString(),
      payload: req.body,
      assinatura: req.headers['x-webhook-signature'] as string,
    };

    const resultado = await processarWebhook(event);
    res.status(resultado.processado ? 200 : 400).json(resultado);
  } catch (error: any) {
    console.error("[WEBHOOK] Erro datajud:", error);
    res.status(500).json({ processado: false, mensagem: error.message });
  }
});

// ==================== BANCO (Depósito Judicial) ====================
webhookRouter.post("/banco", async (req: Request, res: Response) => {
  try {
    const event: WebhookEvent = {
      tipo: req.body.tipo === "levantamento" ? "alvara_levantado" : "deposito_judicial",
      origem: "banco",
      timestamp: new Date().toISOString(),
      payload: req.body,
      assinatura: req.headers['x-webhook-signature'] as string,
    };

    const resultado = await processarWebhook(event);
    res.status(resultado.processado ? 200 : 400).json(resultado);
  } catch (error: any) {
    console.error("[WEBHOOK] Erro banco:", error);
    res.status(500).json({ processado: false, mensagem: error.message });
  }
});

// ==================== INTIMAÇÃO ====================
webhookRouter.post("/intimacao", async (req: Request, res: Response) => {
  try {
    const event: WebhookEvent = {
      tipo: "intimacao",
      origem: "pje",
      timestamp: new Date().toISOString(),
      payload: req.body,
      assinatura: req.headers['x-webhook-signature'] as string,
    };

    const resultado = await processarWebhook(event);
    res.status(resultado.processado ? 200 : 400).json(resultado);
  } catch (error: any) {
    console.error("[WEBHOOK] Erro intimação:", error);
    res.status(500).json({ processado: false, mensagem: error.message });
  }
});

// ==================== GENÉRICO ====================
webhookRouter.post("/generico", async (req: Request, res: Response) => {
  try {
    const event: WebhookEvent = {
      tipo: req.body.tipo || "desconhecido",
      origem: req.body.origem || req.headers['x-webhook-origin'] as string || "desconhecida",
      timestamp: new Date().toISOString(),
      payload: req.body.payload || req.body,
      assinatura: req.headers['x-webhook-signature'] as string,
    };

    const resultado = await processarWebhook(event);
    res.status(resultado.processado ? 200 : 400).json(resultado);
  } catch (error: any) {
    console.error("[WEBHOOK] Erro genérico:", error);
    res.status(500).json({ processado: false, mensagem: error.message });
  }
});
