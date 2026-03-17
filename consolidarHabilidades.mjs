/**
 * CONSOLIDAR ANÁLISES NAS HABILIDADES DO AGENTE
 * Lê todos os conhecimentos de análise profunda e salva nas habilidades do agente
 */
import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);
  
  // Buscar todas as análises profundas do banco de conhecimentos
  const [analises] = await conn.query(
    `SELECT titulo, conteudo, tipoAcao, processoOrigemId FROM conhecimentos WHERE categoria = 'Estrategia' AND tags LIKE '%analise_profunda%' ORDER BY id`
  );
  
  console.log(`Total de análises profundas encontradas: ${analises.length}`);
  
  // Criar resumo consolidado (limitado a 60000 chars para caber no LONGTEXT)
  const consolidacao = analises.map(a => {
    const resumo = a.conteudo?.substring(0, 600) || 'N/A';
    return `• ${a.titulo?.substring(0, 150)}\n  ${resumo}`;
  }).join('\n\n');
  
  const valorEstudo = `ESTUDO PROFUNDO REALIZADO EM ${new Date().toISOString().split('T')[0]}\n${analises.length} processos analisados com análise profunda.\n\n${consolidacao}`;
  
  // Salvar nas habilidades do agente
  const chaveEstudo = 'estudo_profundo_processos';
  const [existeConfig] = await conn.query('SELECT id FROM agente_ia_config WHERE chave = ?', [chaveEstudo]);
  if (existeConfig.length > 0) {
    await conn.query('UPDATE agente_ia_config SET valor = ?, updatedAt = NOW() WHERE chave = ?', [valorEstudo, chaveEstudo]);
  } else {
    await conn.query(
      'INSERT INTO agente_ia_config (chave, valor, categoria, descricao) VALUES (?, ?, ?, ?)',
      [chaveEstudo, valorEstudo, 'expertise', 'Estudo profundo de todos os processos do escritório com análise detalhada de cada caso']
    );
  }
  console.log('✅ Estudo profundo salvo nas habilidades do agente');
  
  // Buscar teses do conhecimento
  const [teses] = await conn.query(
    `SELECT titulo, conteudo, tipoAcao FROM conhecimentos WHERE categoria = 'Tese' ORDER BY id`
  );
  
  const tesesMapa = teses.map(t => `• ${t.titulo?.substring(0, 200)}: ${(t.conteudo || '').substring(0, 300)}`).join('\n\n');
  const valorTeses = `MAPA DE TESES JURÍDICAS DO ESCRITÓRIO (${teses.length} teses)\nAtualizado em ${new Date().toISOString().split('T')[0]}\n\n${tesesMapa}`;
  
  const [existeTeses] = await conn.query('SELECT id FROM agente_ia_config WHERE chave = ?', ['mapa_teses_processos']);
  if (existeTeses.length > 0) {
    await conn.query('UPDATE agente_ia_config SET valor = ?, updatedAt = NOW() WHERE chave = ?', [valorTeses, 'mapa_teses_processos']);
  } else {
    await conn.query(
      'INSERT INTO agente_ia_config (chave, valor, categoria, descricao) VALUES (?, ?, ?, ?)',
      ['mapa_teses_processos', valorTeses, 'expertise', 'Mapa de teses jurídicas aplicadas em cada tipo de ação do escritório']
    );
  }
  console.log('✅ Mapa de teses salvo nas habilidades do agente');
  
  // Buscar jurisprudência
  const [jurisps] = await conn.query(
    `SELECT titulo, conteudo FROM conhecimentos WHERE categoria = 'Jurisprudencia' ORDER BY id`
  );
  
  const jurispMapa = jurisps.map(j => `• ${j.titulo?.substring(0, 200)}: ${(j.conteudo || '').substring(0, 300)}`).join('\n\n');
  const valorJurisp = `BANCO DE JURISPRUDÊNCIA DO ESCRITÓRIO (${jurisps.length} registros)\nAtualizado em ${new Date().toISOString().split('T')[0]}\n\n${jurispMapa}`;
  
  const [existeJurisp] = await conn.query('SELECT id FROM agente_ia_config WHERE chave = ?', ['banco_jurisprudencia']);
  if (existeJurisp.length > 0) {
    await conn.query('UPDATE agente_ia_config SET valor = ?, updatedAt = NOW() WHERE chave = ?', [valorJurisp, 'banco_jurisprudencia']);
  } else {
    await conn.query(
      'INSERT INTO agente_ia_config (chave, valor, categoria, descricao) VALUES (?, ?, ?, ?)',
      ['banco_jurisprudencia', valorJurisp, 'expertise', 'Banco de jurisprudência consolidada do escritório']
    );
  }
  console.log('✅ Banco de jurisprudência salvo nas habilidades do agente');
  
  // Estatísticas finais
  const [totalConhec] = await conn.query('SELECT COUNT(*) as total FROM conhecimentos');
  const [totalConfig] = await conn.query('SELECT COUNT(*) as total FROM agente_ia_config');
  const [totalEstrat] = await conn.query('SELECT COUNT(*) as total FROM estrategias');
  
  console.log(`\n========== RESULTADO FINAL ==========`);
  console.log(`Total conhecimentos no banco: ${totalConhec[0].total}`);
  console.log(`Total habilidades do agente: ${totalConfig[0].total}`);
  console.log(`Total estratégias: ${totalEstrat[0].total}`);
  console.log(`\n🏁 CONSOLIDAÇÃO CONCLUÍDA!`);
  
  await conn.end();
}

main().catch(console.error);
