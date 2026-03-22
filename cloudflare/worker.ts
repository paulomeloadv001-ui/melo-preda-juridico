/**
 * Melo & Preda - Cloudflare Worker
 * 
 * Estratégia: Worker como proxy inteligente
 * - Serve frontend estático via Workers Assets
 * - API requests são proxied para o Manus backend
 * - D1 serve como banco de dados de leitura local (cache)
 * - Health check e status via Worker direto
 */

interface Env {
  DB: D1Database;
  MANUS_APP_URL: string;
  NODE_ENV: string;
  CLOUDFLARE_WORKER: string;
  JWT_SECRET?: string;
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie',
      'Access-Control-Allow-Credentials': 'true',
    };

    // Handle CORS preflight
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
          manus_url: env.MANUS_APP_URL || 'https://melopreda-4imsnkhw.manus.space',
        }, corsHeaders);
      }

      // ==================== D1 LOCAL READ API ====================
      // Serve dados locais do D1 para leitura rápida (sem latência do Manus)
      if (path.startsWith('/api/d1/')) {
        return handleD1ReadAPI(path, url, env.DB, corsHeaders);
      }

      // ==================== PROXY API TO MANUS ====================
      // Todas as chamadas /api/* são proxied para o Manus backend
      if (path.startsWith('/api/')) {
        return proxyToManus(request, env.MANUS_APP_URL || 'https://melopreda-4imsnkhw.manus.space', corsHeaders);
      }

      // ==================== STATIC ASSETS (FRONTEND) ====================
      // Serve o frontend React via Workers Assets
      try {
        const assetResponse = await env.ASSETS.fetch(request);
        if (assetResponse.status !== 404) {
          return assetResponse;
        }
      } catch (e) {
        // Asset not found, fall through to SPA
      }

      // SPA fallback - serve index.html
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
    // GET /api/d1/stats - Estatísticas gerais
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

    // GET /api/d1/clientes - Lista de clientes
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

    // GET /api/d1/clientes/:id - Cliente por ID
    if (route.startsWith('clientes/')) {
      const id = route.replace('clientes/', '');
      const cliente = await db.prepare('SELECT * FROM clientes WHERE id = ?').bind(id).first();
      if (!cliente) return jsonResponse({ error: 'Cliente não encontrado' }, corsHeaders, 404);
      return jsonResponse(cliente, corsHeaders);
    }

    // GET /api/d1/processos - Lista de processos
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

    // GET /api/d1/processos/:id - Processo por ID
    if (route.startsWith('processos/')) {
      const id = route.replace('processos/', '');
      const processo = await db.prepare('SELECT * FROM processos WHERE id = ?').bind(id).first();
      if (!processo) return jsonResponse({ error: 'Processo não encontrado' }, corsHeaders, 404);
      return jsonResponse(processo, corsHeaders);
    }

    // GET /api/d1/conhecimentos - Banco de conhecimentos
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

    // GET /api/d1/movimentacoes/:processoId - Movimentações de um processo
    if (route.startsWith('movimentacoes/')) {
      const processoId = route.replace('movimentacoes/', '');
      const result = await db.prepare('SELECT * FROM movimentacoes WHERE processoId = ? ORDER BY data DESC').bind(processoId).all();
      return jsonResponse(result.results || [], corsHeaders);
    }

    // GET /api/d1/financeiro/:clienteId - Dados financeiros de um cliente
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

    // GET /api/d1/prazos - Prazos processuais
    if (route === 'prazos') {
      const status = url.searchParams.get('status') || 'pendente';
      const result = await db.prepare(
        'SELECT * FROM prazos_processuais WHERE statusPrazo = ? ORDER BY dataVencimento ASC LIMIT 50'
      ).bind(status).all();
      return jsonResponse(result.results || [], corsHeaders);
    }

    // GET /api/d1/analise-geral - Análise geral do escritório
    if (route === 'analise-geral') {
      const result = await db.prepare('SELECT * FROM analise_geral ORDER BY ordem ASC').all();
      return jsonResponse(result.results || [], corsHeaders);
    }

    // GET /api/d1/tables - Lista de tabelas e contagem
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
async function proxyToManus(request: Request, manusUrl: string, corsHeaders: Record<string, string>): Promise<Response> {
  const url = new URL(request.url);
  const targetUrl = `${manusUrl}${url.pathname}${url.search}`;

  try {
    const proxyHeaders = new Headers(request.headers);
    proxyHeaders.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') || '');
    proxyHeaders.set('X-Forwarded-Proto', 'https');
    proxyHeaders.set('X-Original-Host', url.hostname);

    const proxyRequest = new Request(targetUrl, {
      method: request.method,
      headers: proxyHeaders,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    });

    const response = await fetch(proxyRequest);

    // Clone response and add CORS headers
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
