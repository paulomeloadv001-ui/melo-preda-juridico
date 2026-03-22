/**
 * Melo & Preda - Cloudflare Worker
 * 
 * Estratégia: Worker como proxy inteligente com autenticação OAuth nativa
 * - Serve frontend estático via Workers Assets
 * - OAuth: login via Manus OAuth, mas callback e sessão gerenciados nativamente no Worker
 * - API requests são proxied para o Manus backend com cookie de sessão
 * - D1 serve como banco de dados de leitura local (cache)
 */

interface Env {
  DB: D1Database;
  MANUS_APP_URL: string;
  NODE_ENV: string;
  CLOUDFLARE_WORKER: string;
  JWT_SECRET: string;
  VITE_APP_ID: string;
  OAUTH_SERVER_URL: string;
  VITE_OAUTH_PORTAL_URL: string;
  OWNER_OPEN_ID: string;
  OWNER_NAME: string;
  BUILT_IN_FORGE_API_URL: string;
  BUILT_IN_FORGE_API_KEY: string;
  VITE_FRONTEND_FORGE_API_URL: string;
  VITE_FRONTEND_FORGE_API_KEY: string;
  DATAJUD_API_KEY: string;
  JUSCONSIG_API_KEY: string;
  DATABASE_URL: string;
  VITE_APP_TITLE: string;
  VITE_APP_LOGO: string;
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const MANUS_DOMAIN = 'https://melopreda-4imsnkhw.manus.space';
const COOKIE_NAME = 'app_session_id';
const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;

// ==================== JWT HELPERS (jose-compatible, Web Crypto API) ====================
async function createJWT(payload: Record<string, any>, secret: string, expiresInMs: number): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const exp = Math.floor((Date.now() + expiresInMs) / 1000);
  
  const fullPayload = { ...payload, exp, iat: now };
  
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(fullPayload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  const encodedSignature = base64url(signature);
  
  return `${signingInput}.${encodedSignature}`;
}

function base64url(input: string | ArrayBuffer): string {
  let str: string;
  if (typeof input === 'string') {
    str = btoa(input);
  } else {
    const bytes = new Uint8Array(input);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    str = btoa(binary);
  }
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const cfOrigin = url.origin;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie',
      'Access-Control-Allow-Credentials': 'true',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // ==================== HEALTH CHECK ====================
      if (path === '/api/health') {
        const dbCheck = await checkD1Health(env.DB);
        return jsonResponse({
          status: 'ok',
          platform: 'cloudflare-workers',
          timestamp: new Date().toISOString(),
          database: dbCheck,
          manus_url: env.MANUS_APP_URL || MANUS_DOMAIN,
          auth: {
            jwt_secret: env.JWT_SECRET ? 'configured' : 'missing',
            app_id: env.VITE_APP_ID ? 'configured' : 'missing',
            oauth_server: env.OAUTH_SERVER_URL ? 'configured' : 'missing',
            oauth_portal: env.VITE_OAUTH_PORTAL_URL ? 'configured' : 'missing',
            owner: env.OWNER_OPEN_ID ? 'configured' : 'missing',
          },
          apis: {
            forge: env.BUILT_IN_FORGE_API_KEY ? 'configured' : 'missing',
            datajud: env.DATAJUD_API_KEY ? 'configured' : 'missing',
            jusconsig: env.JUSCONSIG_API_KEY ? 'configured' : 'missing',
            database: env.DATABASE_URL ? 'configured' : 'missing',
          },
        }, corsHeaders);
      }

      // ==================== CONFIG ENDPOINT ====================
      if (path === '/api/config') {
        return jsonResponse({
          VITE_APP_ID: env.VITE_APP_ID,
          VITE_OAUTH_PORTAL_URL: env.VITE_OAUTH_PORTAL_URL,
          VITE_APP_TITLE: env.VITE_APP_TITLE || 'Melo & Preda - Sistema Jurídico Integrado',
          VITE_APP_LOGO: env.VITE_APP_LOGO || '',
          VITE_FRONTEND_FORGE_API_URL: env.VITE_FRONTEND_FORGE_API_URL,
          VITE_FRONTEND_FORGE_API_KEY: env.VITE_FRONTEND_FORGE_API_KEY,
        }, corsHeaders);
      }

      // ==================== OAUTH: LOGIN REDIRECT ====================
      // /api/cf-login → redireciona para Manus OAuth usando redirectUri do Manus (autorizado)
      // Após login no Manus, o callback inclui cf_return para voltar ao Cloudflare com o token
      if (path === '/api/cf-login') {
        // O redirectUri DEVE ser do domínio Manus (autorizado no OAuth)
        // Adicionamos cf_return como query param para o Manus saber redirecionar de volta
        const manusCallbackUrl = `${MANUS_DOMAIN}/api/oauth/callback?cf_return=${encodeURIComponent(cfOrigin)}`;
        const state = btoa(manusCallbackUrl);

        const oauthUrl = new URL(`${env.VITE_OAUTH_PORTAL_URL || 'https://manus.im'}/app-auth`);
        oauthUrl.searchParams.set('appId', env.VITE_APP_ID);
        oauthUrl.searchParams.set('redirectUri', manusCallbackUrl);
        oauthUrl.searchParams.set('state', state);
        oauthUrl.searchParams.set('type', 'signIn');

        return Response.redirect(oauthUrl.toString(), 302);
      }

      // ==================== OAUTH: AUTH RELAY FROM MANUS ====================
      // /api/cf-auth-relay?token=JWT → Recebe token do Manus e seta cookie local
      if (path === '/api/cf-auth-relay') {
        const token = url.searchParams.get('token');
        if (!token) {
          return jsonResponse({ error: 'Token is required' }, corsHeaders, 400);
        }

        // Setar cookie com o JWT recebido do Manus e redirecionar para home
        const headers = new Headers();
        headers.set('Location', '/');
        headers.set('Set-Cookie', 
          `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(ONE_YEAR_MS / 1000)}`
        );

        return new Response(null, { status: 302, headers });
      }

      // ==================== OAUTH: CALLBACK HANDLER (FALLBACK) ====================
      // /api/oauth/callback → Recebe code+state, troca por token, cria sessão JWT local
      // Este é o fallback caso o OAuth redirecione diretamente para o Cloudflare
      if (path === '/api/oauth/callback') {
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');

        if (!code || !state) {
          return jsonResponse({ error: 'code and state are required' }, corsHeaders, 400);
        }

        try {
          // 1. Trocar code por access token via Manus OAuth API
          const redirectUri = atob(state);
          const exchangeResp = await fetch(`${env.OAUTH_SERVER_URL}/webdev.v1.WebDevAuthPublicService/ExchangeToken`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              clientId: env.VITE_APP_ID,
              grantType: 'authorization_code',
              code,
              redirectUri,
            }),
          });

          if (!exchangeResp.ok) {
            const errText = await exchangeResp.text();
            console.error('ExchangeToken failed:', errText);
            return jsonResponse({ error: 'Token exchange failed', details: errText }, corsHeaders, 500);
          }

          const tokenData = await exchangeResp.json() as any;
          const accessToken = tokenData.accessToken;

          if (!accessToken) {
            return jsonResponse({ error: 'No access token received' }, corsHeaders, 500);
          }

          // 2. Obter informações do usuário
          const userInfoResp = await fetch(`${env.OAUTH_SERVER_URL}/webdev.v1.WebDevAuthPublicService/GetUserInfo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken }),
          });

          if (!userInfoResp.ok) {
            const errText = await userInfoResp.text();
            console.error('GetUserInfo failed:', errText);
            return jsonResponse({ error: 'User info fetch failed', details: errText }, corsHeaders, 500);
          }

          const userInfo = await userInfoResp.json() as any;
          const openId = userInfo.openId;
          const userName = userInfo.name || '';

          if (!openId) {
            return jsonResponse({ error: 'openId missing from user info' }, corsHeaders, 500);
          }

          // 3. Criar JWT de sessão (mesmo formato que o Manus usa)
          const sessionToken = await createJWT(
            {
              openId,
              appId: env.VITE_APP_ID,
              name: userName,
            },
            env.JWT_SECRET,
            ONE_YEAR_MS
          );

          // 4. Setar cookie e redirecionar para home
          const headers = new Headers();
          headers.set('Location', '/');
          headers.set('Set-Cookie', 
            `${COOKIE_NAME}=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(ONE_YEAR_MS / 1000)}`
          );

          return new Response(null, { status: 302, headers });

        } catch (error: any) {
          console.error('OAuth callback error:', error);
          return jsonResponse({
            error: 'OAuth callback failed',
            message: error.message,
          }, corsHeaders, 500);
        }
      }

      // ==================== D1 LOCAL READ API ====================
      if (path.startsWith('/api/d1/')) {
        return handleD1ReadAPI(path, url, env.DB, corsHeaders);
      }

      // ==================== PROXY API TO MANUS ====================
      if (path.startsWith('/api/')) {
        return proxyToManus(request, env, corsHeaders);
      }

      // ==================== STATIC ASSETS (FRONTEND) ====================
      try {
        const assetResponse = await env.ASSETS.fetch(request);
        if (assetResponse.status !== 404) {
          return assetResponse;
        }
      } catch (e) {
        // Asset not found
      }

      // SPA fallback
      const indexRequest = new Request(new URL('/', request.url).toString(), request);
      return env.ASSETS.fetch(indexRequest);

    } catch (error: any) {
      console.error('Worker error:', error);
      return jsonResponse({
        error: 'Internal Server Error',
        message: error.message,
        platform: 'cloudflare-workers',
      }, corsHeaders, 500);
    }
  },
};

// ==================== D1 LOCAL READ API ====================
async function handleD1ReadAPI(path: string, url: URL, db: D1Database, corsHeaders: Record<string, string>): Promise<Response> {
  const route = path.replace('/api/d1/', '');

  try {
    if (route === 'stats') {
      const [clientes, processos, conhecimentos, movFin] = await Promise.all([
        db.prepare('SELECT COUNT(*) as total FROM clientes').first(),
        db.prepare('SELECT COUNT(*) as total FROM processos').first(),
        db.prepare('SELECT COUNT(*) as total FROM conhecimentos').first(),
        db.prepare('SELECT COUNT(*) as total, SUM(valor) as totalValor FROM movimentacoes_financeiras').first(),
      ]);
      return jsonResponse({
        clientes: (clientes as any)?.total || 0,
        processos: (processos as any)?.total || 0,
        conhecimentos: (conhecimentos as any)?.total || 0,
        movimentacoesFinanceiras: (movFin as any)?.total || 0,
        valorTotalFinanceiro: (movFin as any)?.totalValor || 0,
      }, corsHeaders);
    }

    if (route === 'clientes') {
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const offset = parseInt(url.searchParams.get('offset') || '0');
      const search = url.searchParams.get('search') || '';
      let query = 'SELECT * FROM clientes';
      const params: any[] = [];
      if (search) {
        query += ' WHERE nomeCompleto LIKE ? OR cpfCnpj LIKE ?';
        params.push(`%${search}%`, `%${search}%`);
      }
      query += ' ORDER BY id DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);
      const result = await db.prepare(query).bind(...params).all();
      return jsonResponse(result.results || [], corsHeaders);
    }

    if (route.startsWith('clientes/')) {
      const id = route.replace('clientes/', '');
      const cliente = await db.prepare('SELECT * FROM clientes WHERE id = ?').bind(id).first();
      if (!cliente) return jsonResponse({ error: 'Cliente não encontrado' }, corsHeaders, 404);
      return jsonResponse(cliente, corsHeaders);
    }

    if (route === 'processos') {
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const offset = parseInt(url.searchParams.get('offset') || '0');
      const clienteId = url.searchParams.get('clienteId');
      let query = 'SELECT * FROM processos';
      const params: any[] = [];
      if (clienteId) {
        query += ' WHERE clienteId = ?';
        params.push(clienteId);
      }
      query += ' ORDER BY id DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);
      const result = await db.prepare(query).bind(...params).all();
      return jsonResponse(result.results || [], corsHeaders);
    }

    if (route.startsWith('processos/')) {
      const id = route.replace('processos/', '');
      const processo = await db.prepare('SELECT * FROM processos WHERE id = ?').bind(id).first();
      if (!processo) return jsonResponse({ error: 'Processo não encontrado' }, corsHeaders, 404);
      return jsonResponse(processo, corsHeaders);
    }

    if (route === 'conhecimentos') {
      const categoria = url.searchParams.get('categoria');
      let query = 'SELECT * FROM conhecimentos';
      const params: any[] = [];
      if (categoria) {
        query += ' WHERE categoria = ?';
        params.push(categoria);
      }
      query += ' ORDER BY id DESC LIMIT 100';
      const result = params.length > 0
        ? await db.prepare(query).bind(...params).all()
        : await db.prepare(query).all();
      return jsonResponse(result.results || [], corsHeaders);
    }

    if (route.startsWith('movimentacoes/')) {
      const processoId = route.replace('movimentacoes/', '');
      const result = await db.prepare('SELECT * FROM movimentacoes WHERE processoId = ? ORDER BY data DESC').bind(processoId).all();
      return jsonResponse(result.results || [], corsHeaders);
    }

    if (route.startsWith('financeiro/')) {
      const clienteId = route.replace('financeiro/', '');
      const [dados, movFin, emprestimos] = await Promise.all([
        db.prepare('SELECT * FROM dados_financeiros WHERE clienteId = ?').bind(clienteId).all(),
        db.prepare('SELECT * FROM movimentacoes_financeiras WHERE clienteId = ? ORDER BY dataMovimentacao DESC').bind(clienteId).all(),
        db.prepare('SELECT * FROM emprestimos_consignados WHERE clienteId = ?').bind(clienteId).all(),
      ]);
      return jsonResponse({
        dadosFinanceiros: dados.results || [],
        movimentacoesFinanceiras: movFin.results || [],
        emprestimosConsignados: emprestimos.results || [],
      }, corsHeaders);
    }

    if (route === 'prazos') {
      const status = url.searchParams.get('status') || 'pendente';
      const result = await db.prepare(
        'SELECT * FROM prazos_processuais WHERE statusPrazo = ? ORDER BY dataVencimento ASC LIMIT 50'
      ).bind(status).all();
      return jsonResponse(result.results || [], corsHeaders);
    }

    if (route === 'analise-geral') {
      const result = await db.prepare('SELECT * FROM analise_geral ORDER BY ordem ASC').all();
      return jsonResponse(result.results || [], corsHeaders);
    }

    if (route === 'tables') {
      const tables = await db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'"
      ).all();
      const counts: Record<string, number> = {};
      for (const table of (tables.results || [])) {
        const name = (table as any).name;
        try {
          const count = await db.prepare(`SELECT COUNT(*) as c FROM "${name}"`).first();
          counts[name] = (count as any)?.c || 0;
        } catch {
          counts[name] = -1;
        }
      }
      return jsonResponse(counts, corsHeaders);
    }

    return jsonResponse({ error: 'Rota D1 não encontrada', route }, corsHeaders, 404);
  } catch (error: any) {
    return jsonResponse({ error: 'D1 query error', message: error.message }, corsHeaders, 500);
  }
}

// ==================== PROXY TO MANUS ====================
async function proxyToManus(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const url = new URL(request.url);
  const manusUrl = env.MANUS_APP_URL || MANUS_DOMAIN;
  const targetUrl = `${manusUrl}${url.pathname}${url.search}`;

  try {
    const proxyHeaders = new Headers(request.headers);
    proxyHeaders.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') || '');
    proxyHeaders.set('X-Forwarded-Proto', 'https');
    proxyHeaders.set('X-Original-Host', url.hostname);
    proxyHeaders.delete('Host');

    const proxyRequest = new Request(targetUrl, {
      method: request.method,
      headers: proxyHeaders,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    });

    const response = await fetch(proxyRequest);

    const newHeaders = new Headers(response.headers);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      newHeaders.set(key, value);
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });

  } catch (error: any) {
    return jsonResponse({
      error: 'Proxy error',
      message: `Failed to reach Manus backend: ${error.message}`,
      target: targetUrl,
    }, corsHeaders, 502);
  }
}

// ==================== D1 HEALTH CHECK ====================
async function checkD1Health(db: D1Database): Promise<object> {
  try {
    const result = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' LIMIT 5").all();
    const tableCount = (result.results || []).length;
    return { status: 'ok', tables: tableCount };
  } catch (error: any) {
    return { status: 'error', message: error.message };
  }
}

// ==================== HELPERS ====================
function jsonResponse(data: any, corsHeaders: Record<string, string>, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}
