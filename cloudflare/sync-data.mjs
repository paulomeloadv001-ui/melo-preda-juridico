#!/usr/bin/env node
/**
 * Sincronização TiDB → D1 (Cloudflare)
 * Executado no GitHub Actions após cada deploy
 * 
 * Env vars necessárias:
 * - DATABASE_URL: MySQL/TiDB connection string
 * - CF_EMAIL: Cloudflare email
 * - CF_API_KEY: Cloudflare Global API Key
 * - CF_ACCOUNT_ID: Cloudflare Account ID
 * - D1_DATABASE_ID: D1 Database ID
 */

import mysql from 'mysql2/promise';

const CF_EMAIL = process.env.CF_EMAIL || process.env.CLOUDFLARE_EMAIL;
const CF_API_KEY = process.env.CF_API_KEY || process.env.CLOUDFLARE_API_KEY;
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || 'f204e5687c7c0641060d10c89bb73771';
const D1_DATABASE_ID = process.env.D1_DATABASE_ID || '127720ac-4b6b-4d3b-8750-de423e10f03a';
const DATABASE_URL = process.env.DATABASE_URL;

const D1_API = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;

const TABLES = [
  'users', 'clientes', 'dados_financeiros', 'emprestimos_consignados',
  'processos', 'estrategias', 'partes_processuais', 'movimentacoes',
  'documentos', 'conhecimentos', 'cumprimentos_sentenca',
  'movimentacoes_financeiras', 'analise_geral', 'relatorios', 'jobs',
  'access_requests', 'user_profiles', 'historico_correcoes',
  'notificacoes', 'prazos_processuais', 'sync_log', 'templates_peticao',
  'peticoes_geradas', 'agente_ia_config', 'agente_ia_historico',
  'anexos_peticao', 'user_permissions', 'convites', 'audit_log',
  'publicacoes', 'monitoramento_config', 'peticao_versoes', 'perfis_acesso'
];

async function executeD1(sql) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(D1_API, {
        method: 'POST',
        headers: {
          'X-Auth-Email': CF_EMAIL,
          'X-Auth-Key': CF_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sql }),
      });
      const data = await resp.json();
      if (data.success) return data;
      const errMsg = data.errors?.[0]?.message || 'Unknown';
      if (errMsg.includes('UNIQUE constraint')) return null;
      if (attempt < 2) { await new Promise(r => setTimeout(r, 1000)); continue; }
      throw new Error(errMsg);
    } catch (e) {
      if (attempt < 2) { await new Promise(r => setTimeout(r, 2000)); continue; }
      throw e;
    }
  }
}

function escapeValue(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? '1' : '0';
  const s = String(v).replace(/'/g, "''");
  return `'${s}'`;
}

async function syncTable(conn, table) {
  console.log(`  Syncing ${table}...`);
  
  try {
    const [rows] = await conn.query(`SELECT * FROM \`${table}\``);
    if (!rows.length) {
      console.log(`    Empty, skipping`);
      return 0;
    }
    
    console.log(`    TiDB: ${rows.length} rows`);
    
    // Clear D1 table
    try { await executeD1(`DELETE FROM "${table}"`); } catch (e) { /* ignore */ }
    
    // Insert in batches
    let inserted = 0;
    let errors = 0;
    const columns = Object.keys(rows[0]);
    
    for (const row of rows) {
      const cols = columns.map(c => `"${c}"`).join(', ');
      const vals = columns.map(c => escapeValue(row[c])).join(', ');
      const sql = `INSERT OR IGNORE INTO "${table}" (${cols}) VALUES (${vals})`;
      
      try {
        const result = await executeD1(sql);
        if (result) inserted++;
      } catch (e) {
        errors++;
        if (errors <= 2) console.log(`    Error: ${String(e).substring(0, 80)}`);
      }
    }
    
    console.log(`    Inserted: ${inserted}, Errors: ${errors}`);
    return inserted;
  } catch (e) {
    console.log(`    FAILED: ${e.message}`);
    return 0;
  }
}

async function main() {
  console.log('=== Sincronização TiDB → D1 ===');
  
  if (!DATABASE_URL) {
    console.log('DATABASE_URL not set, skipping sync');
    process.exit(0);
  }
  
  if (!CF_EMAIL || !CF_API_KEY) {
    console.log('Cloudflare credentials not set, skipping sync');
    process.exit(0);
  }
  
  const conn = await mysql.createConnection(DATABASE_URL);
  let totalInserted = 0;
  
  for (const table of TABLES) {
    try {
      totalInserted += await syncTable(conn, table);
    } catch (e) {
      console.log(`  ${table}: SKIP - ${e.message}`);
    }
  }
  
  await conn.end();
  console.log(`\n=== Total: ${totalInserted} registros sincronizados ===`);
}

main().catch(e => {
  console.error('Sync failed:', e.message);
  process.exit(1);
});
