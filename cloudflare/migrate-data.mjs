#!/usr/bin/env node
/**
 * Melo & Preda - Migração de Dados TiDB → D1
 * 
 * Este script exporta todos os dados do banco TiDB (MySQL) 
 * e gera um arquivo SQL para importar no D1 (SQLite)
 * 
 * Uso:
 *   node cloudflare/migrate-data.mjs
 * 
 * Requer:
 *   - DATABASE_URL configurado no .env
 *   - mysql2 instalado
 */

import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Tabelas na ordem correta (respeitando dependências)
const TABLES = [
  { mysql: 'users', d1: 'users' },
  { mysql: 'clientes', d1: 'clientes' },
  { mysql: 'dados_financeiros', d1: 'dados_financeiros' },
  { mysql: 'emprestimos_consignados', d1: 'emprestimos_consignados' },
  { mysql: 'processos', d1: 'processos' },
  { mysql: 'estrategias', d1: 'estrategias' },
  { mysql: 'partes_processuais', d1: 'partes_processuais' },
  { mysql: 'movimentacoes', d1: 'movimentacoes' },
  { mysql: 'documentos', d1: 'documentos' },
  { mysql: 'conhecimentos', d1: 'conhecimentos' },
  { mysql: 'cumprimentos_sentenca', d1: 'cumprimentos_sentenca' },
  { mysql: 'movimentacoes_financeiras', d1: 'movimentacoes_financeiras' },
  { mysql: 'analise_geral', d1: 'analise_geral' },
  { mysql: 'relatorios', d1: 'relatorios' },
  { mysql: 'jobs', d1: 'jobs' },
  { mysql: 'access_requests', d1: 'access_requests' },
  { mysql: 'user_profiles', d1: 'user_profiles' },
  { mysql: 'historico_correcoes', d1: 'historico_correcoes' },
  { mysql: 'notificacoes', d1: 'notificacoes' },
  { mysql: 'prazos_processuais', d1: 'prazos_processuais' },
  { mysql: 'sync_log', d1: 'sync_log' },
  { mysql: 'templates_peticao', d1: 'templates_peticao' },
  { mysql: 'peticoes_geradas', d1: 'peticoes_geradas' },
  { mysql: 'agente_ia_config', d1: 'agente_ia_config' },
  { mysql: 'agente_ia_historico', d1: 'agente_ia_historico' },
  { mysql: 'anexos_peticao', d1: 'anexos_peticao' },
  { mysql: 'user_permissions', d1: 'user_permissions' },
  { mysql: 'convites', d1: 'convites' },
  { mysql: 'audit_log', d1: 'audit_log' },
  { mysql: 'publicacoes', d1: 'publicacoes' },
  { mysql: 'monitoramento_config', d1: 'monitoramento_config' },
  { mysql: 'peticao_versoes', d1: 'peticao_versoes' },
  { mysql: 'perfis_acesso', d1: 'perfis_acesso' },
];

function escapeSQLiteValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (value instanceof Date) {
    return `'${value.toISOString().replace('T', ' ').replace('Z', '')}'`;
  }
  if (typeof value === 'object') {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  }
  // String - escape single quotes
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ DATABASE_URL não configurado. Configure no .env');
    process.exit(1);
  }

  console.log('🔌 Conectando ao TiDB...');
  const connection = await mysql.createConnection(dbUrl);
  
  const outputPath = path.join(__dirname, 'seed-data.sql');
  let sql = '';
  
  sql += '-- ============================================================\n';
  sql += '-- Melo & Preda - Dados migrados do TiDB\n';
  sql += `-- Gerado em: ${new Date().toISOString()}\n`;
  sql += '-- ============================================================\n\n';

  let totalRows = 0;

  for (const table of TABLES) {
    try {
      console.log(`📋 Exportando ${table.mysql}...`);
      const [rows] = await connection.query(`SELECT * FROM \`${table.mysql}\``);
      
      if (!rows || rows.length === 0) {
        console.log(`   ⏭️  ${table.mysql}: 0 registros (pulando)`);
        continue;
      }

      sql += `-- ==================== ${table.d1.toUpperCase()} (${rows.length} registros) ====================\n`;
      
      const columns = Object.keys(rows[0]);
      
      // Gerar INSERT em lotes de 50 para evitar problemas com SQLite
      const batchSize = 50;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        
        for (const row of batch) {
          const values = columns.map(col => escapeSQLiteValue(row[col]));
          sql += `INSERT OR IGNORE INTO ${table.d1} (${columns.join(', ')}) VALUES (${values.join(', ')});\n`;
        }
      }
      
      sql += '\n';
      totalRows += rows.length;
      console.log(`   ✅ ${table.mysql}: ${rows.length} registros exportados`);
      
    } catch (error) {
      console.log(`   ⚠️  ${table.mysql}: ${error.message} (tabela pode não existir)`);
    }
  }

  await connection.end();

  // Salvar arquivo
  fs.writeFileSync(outputPath, sql, 'utf-8');
  
  const fileSizeMB = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(2);
  
  console.log('\n============================================================');
  console.log(`✅ Migração concluída!`);
  console.log(`📊 Total: ${totalRows} registros de ${TABLES.length} tabelas`);
  console.log(`📁 Arquivo: ${outputPath} (${fileSizeMB} MB)`);
  console.log('\nPara importar no D1:');
  console.log('  1. Primeiro, execute o schema:');
  console.log('     npx wrangler d1 execute melo-preda-db --file=cloudflare/schema.sql');
  console.log('  2. Depois, importe os dados:');
  console.log('     npx wrangler d1 execute melo-preda-db --file=cloudflare/seed-data.sql');
  console.log('============================================================');
}

main().catch(err => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
