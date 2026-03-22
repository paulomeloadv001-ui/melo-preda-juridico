/**
 * Database Adapter Layer
 * 
 * Fornece uma interface unificada que funciona tanto com:
 * - MySQL/TiDB (via drizzle-orm/mysql2) no Manus
 * - D1/SQLite (via Cloudflare Workers D1 binding) no Cloudflare
 * 
 * O routers.ts usa drizzle-orm com mysql2 diretamente.
 * No Cloudflare, o db.ts é substituído por esta versão que usa D1.
 */

// Detecta se estamos rodando no Cloudflare Workers
export function isCloudflareWorker(): boolean {
  return process.env.CLOUDFLARE_WORKER === 'true' || typeof (globalThis as any).__CF_D1_DB !== 'undefined';
}

/**
 * Wrapper para D1 que emula a interface básica do drizzle
 * Permite que as queries SQL raw funcionem tanto no MySQL quanto no D1
 */
export class D1Adapter {
  private db: any; // D1Database binding

  constructor() {
    this.db = (globalThis as any).__CF_D1_DB;
    if (!this.db) {
      throw new Error('D1 database binding not found. Ensure DB is bound in wrangler.toml');
    }
  }

  /**
   * Execute a raw SQL query (SELECT)
   */
  async query(sql: string, params: any[] = []): Promise<any[]> {
    try {
      const stmt = this.db.prepare(sql);
      const bound = params.length > 0 ? stmt.bind(...params) : stmt;
      const result = await bound.all();
      return result.results || [];
    } catch (error) {
      console.error('[D1] Query error:', sql, error);
      throw error;
    }
  }

  /**
   * Execute a raw SQL statement (INSERT, UPDATE, DELETE)
   */
  async execute(sql: string, params: any[] = []): Promise<{ changes: number; lastRowId: number }> {
    try {
      const stmt = this.db.prepare(sql);
      const bound = params.length > 0 ? stmt.bind(...params) : stmt;
      const result = await bound.run();
      return {
        changes: result.meta?.changes || 0,
        lastRowId: result.meta?.last_row_id || 0,
      };
    } catch (error) {
      console.error('[D1] Execute error:', sql, error);
      throw error;
    }
  }

  /**
   * Execute multiple SQL statements in a batch
   */
  async batch(statements: Array<{ sql: string; params?: any[] }>): Promise<any[]> {
    const stmts = statements.map(s => {
      const stmt = this.db.prepare(s.sql);
      return s.params && s.params.length > 0 ? stmt.bind(...s.params) : stmt;
    });
    return this.db.batch(stmts);
  }

  /**
   * Get the raw D1 database binding
   */
  getRaw(): any {
    return this.db;
  }
}

// Singleton
let _d1Adapter: D1Adapter | null = null;

export function getD1Adapter(): D1Adapter {
  if (!_d1Adapter) {
    _d1Adapter = new D1Adapter();
  }
  return _d1Adapter;
}
