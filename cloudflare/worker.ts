/**
 * Cloudflare Worker Entry Point
 * Melo & Preda - Sistema Jurídico Integrado
 * 
 * Usa httpServerHandler para rodar Express.js no Cloudflare Workers
 * com D1 como banco de dados SQLite
 */
import { httpServerHandler } from 'cloudflare:node';
import { env } from 'cloudflare:workers';
import express from 'express';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from '../server/routers';
import { createContext } from '../server/_core/context';
import { apiRouter } from '../server/apiRest';
import { uploadChunkedRouter } from '../server/uploadChunked';
import path from 'node:path';
import fs from 'node:fs';

// Inject Cloudflare env into process.env for compatibility
function injectEnv() {
  // D1 binding is available as env.DB
  // Secrets are available as env.SECRET_NAME
  const cfEnv = env as any;
  
  // Map Cloudflare secrets to process.env
  const secretMappings = [
    'DATABASE_URL',
    'JWT_SECRET', 
    'DATAJUD_API_KEY',
    'JUSCONSIG_API_KEY',
    'BUILT_IN_FORGE_API_KEY',
    'BUILT_IN_FORGE_API_URL',
    'OAUTH_SERVER_URL',
    'OWNER_OPEN_ID',
    'OWNER_NAME',
    'VITE_APP_ID',
    'VITE_OAUTH_PORTAL_URL',
    'VITE_FRONTEND_FORGE_API_KEY',
    'VITE_FRONTEND_FORGE_API_URL',
    'VITE_APP_TITLE',
    'VITE_APP_LOGO',
    'VITE_ANALYTICS_ENDPOINT',
    'VITE_ANALYTICS_WEBSITE_ID',
  ];

  for (const key of secretMappings) {
    if (cfEnv[key] && !process.env[key]) {
      process.env[key] = cfEnv[key];
    }
  }

  // Mark as Cloudflare environment
  process.env.CLOUDFLARE_WORKER = 'true';
  process.env.NODE_ENV = 'production';
  
  // Store D1 binding globally for database access
  if (cfEnv.DB) {
    (globalThis as any).__CF_D1_DB = cfEnv.DB;
  }
}

injectEnv();

const app = express();

// Configure body parser
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ 
    status: 'ok', 
    platform: 'cloudflare-workers',
    timestamp: new Date().toISOString(),
    version: '5.4'
  });
});

// OAuth callback - simplified for Cloudflare
app.get('/api/oauth/callback', (req, res) => {
  // Redirect to Manus OAuth since Cloudflare doesn't have the full OAuth flow
  const manusUrl = process.env.MANUS_APP_URL || 'https://melopreda-4imsnkhw.manus.space';
  res.redirect(`${manusUrl}/api/oauth/callback?${new URLSearchParams(req.query as any).toString()}`);
});

// API REST pública do Agente IA
app.use('/api/v1', apiRouter);

// Upload chunked
app.use('/api/upload', uploadChunkedRouter);

// tRPC API
app.use(
  '/api/trpc',
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

// Serve static files (frontend)
app.use(express.static('public'));

// SPA fallback - serve index.html for all non-API routes
app.get('*', (_req, res) => {
  res.sendFile('index.html', { root: 'public' });
});

app.listen(8080);

export default httpServerHandler({ port: 8080 });
