const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  // 1. TABELAS
  const [tables] = await conn.execute("SHOW TABLES");
  console.log("=== TABELAS NO BANCO ===");
  tables.forEach(t => console.log("  " + Object.values(t)[0]));
  
  // 2. CONTAGEM
  const tabelas = ['clientes','processos','dados_financeiros','emprestimos_consignados','partes_processuais','movimentacoes','documentos','conhecimentos','relatorios'];
  console.log("\n=== CONTAGEM DE REGISTROS ===");
  for (const t of tabelas) {
    const [rows] = await conn.execute('SELECT COUNT(*) as total FROM ' + t);
    console.log("  " + t + ": " + rows[0].total);
  }
  
  // 3. COLUNAS DOCUMENTOS
  const [docCols] = await conn.execute("SHOW COLUMNS FROM documentos");
  console.log("\n=== COLUNAS DOCUMENTOS ===");
  docCols.forEach(c => console.log("  " + c.Field + " (" + c.Type + ")"));
  
  // 4. AMOSTRA DOCUMENTOS
  const [docs] = await conn.execute("SELECT * FROM documentos LIMIT 3");
  console.log("\n=== AMOSTRA DOCUMENTOS ===");
  docs.forEach(d => console.log("  " + JSON.stringify(d).substring(0, 250)));
  
  // 5. DADOS FINANCEIROS
  const [fin] = await conn.execute("SELECT df.*, c.nomeCompleto FROM dados_financeiros df LEFT JOIN clientes c ON df.clienteId = c.id");
  console.log("\n=== DADOS FINANCEIROS (" + fin.length + ") ===");
  fin.forEach(f => {
    console.log("  " + (f.nomeCompleto || "SEM NOME") + " | Bruta: " + (f.remuneracaoBruta || "-") + " | Liquida: " + (f.remuneracaoLiquida || "-") + " | Fonte: " + (f.fonteRenda || "-"));
  });
  
  // 6. EMPRESTIMOS POR CLIENTE
  const [emp] = await conn.execute("SELECT c.nomeCompleto, COUNT(e.id) as total FROM emprestimos_consignados e LEFT JOIN clientes c ON e.clienteId = c.id GROUP BY c.nomeCompleto ORDER BY total DESC");
  console.log("\n=== EMPRESTIMOS POR CLIENTE ===");
  emp.forEach(e => console.log("  " + e.nomeCompleto + ": " + e.total));
  
  // 7. PARTES PROCESSUAIS
  const [partes] = await conn.execute("SELECT pp.nomeCompleto, pp.tipoParte, pp.polo, p.numeroCnj FROM partes_processuais pp LEFT JOIN processos p ON pp.processoId = p.id");
  console.log("\n=== PARTES PROCESSUAIS (" + partes.length + ") ===");
  partes.forEach(p => console.log("  " + p.numeroCnj + " | " + p.nomeCompleto + " | " + p.tipoParte + " | " + p.polo));
  
  // 8. INTEGRIDADE REFERENCIAL
  console.log("\n=== INTEGRIDADE REFERENCIAL ===");
  const checks = [
    ["Empréstimos sem cliente", "SELECT COUNT(*) as t FROM emprestimos_consignados WHERE clienteId NOT IN (SELECT id FROM clientes)"],
    ["Dados financeiros sem cliente", "SELECT COUNT(*) as t FROM dados_financeiros WHERE clienteId NOT IN (SELECT id FROM clientes)"],
    ["Partes sem processo", "SELECT COUNT(*) as t FROM partes_processuais WHERE processoId NOT IN (SELECT id FROM processos)"],
    ["Documentos sem processo", "SELECT COUNT(*) as t FROM documentos WHERE processoId NOT IN (SELECT id FROM processos)"],
    ["Processos sem cliente", "SELECT COUNT(*) as t FROM processos WHERE clienteId NOT IN (SELECT id FROM clientes)"],
    ["Conhecimentos sem processo", "SELECT COUNT(*) as t FROM conhecimentos WHERE processoOrigemId IS NOT NULL AND processoOrigemId NOT IN (SELECT id FROM processos)"],
  ];
  for (const [label, sql] of checks) {
    const [r] = await conn.execute(sql);
    const status = r[0].t === 0 ? "OK" : "ERRO (" + r[0].t + " registros)";
    console.log("  " + label + ": " + status);
  }
  
  // 9. CLIENTES COM CPF PENDENTE
  const [pendentes] = await conn.execute("SELECT id, nomeCompleto, cpfCnpj FROM clientes WHERE cpfCnpj LIKE 'PENDENTE%'");
  console.log("\n=== CLIENTES COM CPF PENDENTE ===");
  if (pendentes.length === 0) console.log("  Nenhum");
  pendentes.forEach(p => console.log("  ID " + p.id + ": " + p.nomeCompleto + " | CPF: " + p.cpfCnpj));
  
  // 10. PROCESSOS COM CNJ INVALIDO
  const [cnjInvalid] = await conn.execute("SELECT id, numeroCnj, clienteId FROM processos WHERE numeroCnj LIKE 'SEM%' OR numeroCnj IS NULL");
  console.log("\n=== PROCESSOS COM CNJ INVALIDO ===");
  if (cnjInvalid.length === 0) console.log("  Nenhum");
  cnjInvalid.forEach(p => console.log("  ID " + p.id + ": " + p.numeroCnj));
  
  // 11. CLIENTES PF SEM DADOS FINANCEIROS
  const [pfSemFin] = await conn.execute("SELECT c.id, c.nomeCompleto FROM clientes c WHERE c.tipoPessoa = 'PF' AND c.id NOT IN (SELECT clienteId FROM dados_financeiros) AND c.cpfCnpj NOT LIKE 'PENDENTE%'");
  console.log("\n=== CLIENTES PF SEM DADOS FINANCEIROS ===");
  if (pfSemFin.length === 0) console.log("  Nenhum");
  pfSemFin.forEach(p => console.log("  ID " + p.id + ": " + p.nomeCompleto));
  
  // 12. CLIENTES PF SEM EMPRESTIMOS
  const [pfSemEmp] = await conn.execute("SELECT c.id, c.nomeCompleto FROM clientes c WHERE c.tipoPessoa = 'PF' AND c.id NOT IN (SELECT clienteId FROM emprestimos_consignados) AND c.cpfCnpj NOT LIKE 'PENDENTE%' AND c.cpfCnpj NOT LIKE 'P%'");
  console.log("\n=== CLIENTES PF SEM EMPRESTIMOS ===");
  if (pfSemEmp.length === 0) console.log("  Nenhum");
  pfSemEmp.forEach(p => console.log("  ID " + p.id + ": " + p.nomeCompleto));
  
  // 13. CONHECIMENTOS POR CATEGORIA
  const [knowCats] = await conn.execute("SELECT categoria, COUNT(*) as total FROM conhecimentos GROUP BY categoria ORDER BY total DESC");
  console.log("\n=== CONHECIMENTOS POR CATEGORIA ===");
  knowCats.forEach(k => console.log("  " + k.categoria + ": " + k.total));
  
  await conn.end();
}
main().catch(e => console.error(e));
