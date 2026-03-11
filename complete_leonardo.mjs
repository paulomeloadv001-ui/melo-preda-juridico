import mysql from 'mysql2/promise';
import fs from 'fs';

async function run() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const principalId = 30002;
  const cumprimentoId = 30003;
  const clienteId = 60002;

  // Upload PDFs to S3 via storage helper
  const { storagePut } = await import('./server/storage.ts');
  const folder = 'LEONARDO_ROSA_CORREIA_00581377184';

  const principalBuf = fs.readFileSync('/home/ubuntu/upload/PROCESSOPRINCIPALLEONARDOCORREA.pdf');
  const cumprimentoBuf = fs.readFileSync('/home/ubuntu/upload/CUMPRIMENTODESENTENÇALEONARDOCOMPLETO.pdf');

  const { key: kp, url: up } = await storagePut(`${folder}/processos_pdf/PROCESSOPRINCIPALLEONARDOCORREA.pdf`, principalBuf, 'application/pdf');
  const { key: kc, url: uc } = await storagePut(`${folder}/processos_pdf/CUMPRIMENTODESENTENCALEONARDOCOMPLETO.pdf`, cumprimentoBuf, 'application/pdf');
  console.log('PDFs uploaded to S3');

  // Update processos with PDF urls and texto
  const tp = fs.readFileSync('/home/ubuntu/leonardo_principal.txt', 'utf-8');
  const tc = fs.readFileSync('/home/ubuntu/leonardo_cumprimento.txt', 'utf-8');
  await conn.execute('UPDATE processos SET pdfStorageKey=?, pdfUrl=?, textoExtraido=? WHERE id=?', [kp, up, tp.substring(0,60000), principalId]);
  await conn.execute('UPDATE processos SET pdfStorageKey=?, pdfUrl=?, textoExtraido=? WHERE id=?', [kc, uc, tc.substring(0,60000), cumprimentoId]);
  console.log('Processos updated with PDF URLs');

  // Movimentações
  await conn.execute('INSERT INTO movimentacoes (processoId, data, evento, descricao) VALUES (?, ?, ?, ?)',
    [principalId, '16/05/2025', 'Petição Inicial', '[Ev.1] Ajuizamento da Ação de Obrigação de Fazer com pedido de Tutela Antecipada de Urgência, visando a readequação de empréstimos consignados para o limite de 35% da renda líquida do autor.']);
  await conn.execute('INSERT INTO movimentacoes (processoId, data, evento, descricao) VALUES (?, ?, ?, ?)',
    [cumprimentoId, '14/11/2025', 'Petição de Cumprimento Provisório', '[Ev.1] Protocolo do Cumprimento Provisório de Sentença por dependência ao processo nº 5380169-54.2025.8.09.0051, para execução de honorários advocatícios de sucumbência no valor de R$ 41.049,00.']);
  console.log('Movimentações inseridas');

  // Documentos
  await conn.execute('INSERT INTO documentos (processoId, clienteId, tipo, nomeArquivo, storageKey, storageUrl, tamanho, mimeType) VALUES (?,?,?,?,?,?,?,?)',
    [principalId, clienteId, 'Processo Completo', 'PROCESSOPRINCIPALLEONARDOCORREA.pdf', kp, up, principalBuf.length, 'application/pdf']);
  await conn.execute('INSERT INTO documentos (processoId, clienteId, tipo, nomeArquivo, storageKey, storageUrl, tamanho, mimeType) VALUES (?,?,?,?,?,?,?,?)',
    [cumprimentoId, clienteId, 'Cumprimento de Sentença', 'CUMPRIMENTODESENTENCALEONARDOCOMPLETO.pdf', kc, uc, cumprimentoBuf.length, 'application/pdf']);
  console.log('Documentos inseridos');

  // Estratégias
  await conn.execute('INSERT INTO estrategias (processoId, tesePrincipal, fundamentacaoLegal, jurisprudenciaCitada, pontosFortes, riscosIdentificados) VALUES (?,?,?,?,?,?)',
    [principalId,
     'Readequação dos empréstimos consignados para o limite de 35% dos proventos líquidos, conforme Lei Estadual 16.898/2010 e suas alterações (Leis Estaduais 21.063/2021 e 21.665/22).',
     'Art. 5º da Lei Estadual 16.898/2010; Arts. 14, 39 e 51 do CDC; Súmula 297 STJ; Súmula 60 TJ/GO; Art. 1º, III e Art. 7º, X da CF; Art. 421 CC; Art. 292, II e Art. 300 do CPC.',
     'TJ-GO - Apelação Cível: 5407476-85.2022.8.09.0051 GOIÂNIA, Relator: Des(a). DESEMBARGADORA NELMA BRANCO FERREIRA PERILO, 4ª Câmara Cível',
     'Comprovação do excesso de descontos via contracheques; legislação estadual clara sobre o limite de 35%; jurisprudência favorável do TJ/GO; natureza alimentar da verba.',
     'Necessidade de comprovar hipossuficiência para gratuidade de justiça e possível resistência dos bancos.']);
  await conn.execute('INSERT INTO estrategias (processoId, tesePrincipal, fundamentacaoLegal, jurisprudenciaCitada, pontosFortes, riscosIdentificados) VALUES (?,?,?,?,?,?)',
    [cumprimentoId,
     'Cumprimento provisório de sentença para cobrança dos honorários advocatícios de sucumbência fixados na decisão que deferiu a tutela antecipada nos autos principais, com base nos arts. 520 e seguintes do CPC.',
     'Arts. 520 e seguintes do CPC; Lei Estadual nº 22.615/2024; Art. 114, § 12 da Lei Estadual nº 11.651/1991; Art. 85, §14 do CPC.',
     'TJ-GO - Apelação Cível: 56377718720238090051 GOIÂNIA, Relator: Des(a). RODRIGO DE SILVEIRA, 10ª Câmara Cível',
     'Sentença favorável nos autos principais com tutela deferida; legitimidade concorrente do advogado; Lei Estadual 22.615/2024 permite custas ao final.',
     'Cumprimento provisório pode ser revertido se sentença for reformada em recurso.']);
  console.log('Estratégias inseridas');

  // Partes processuais
  const partes = [
    { nome: 'BANCO INTERMEDIUM S/A (BANCO INTER)', cpfCnpj: '00.416.968/0001-01', cat: 'Banco' },
    { nome: 'BANCO PAN S.A.', cpfCnpj: '59.285.411/0001-13', cat: 'Banco' },
    { nome: 'BANCO ITAÚ S.A.', cpfCnpj: '60.701.190/0001-04', cat: 'Banco' }
  ];
  for (const procId of [principalId, cumprimentoId]) {
    for (const p of partes) {
      await conn.execute('INSERT INTO partes_processuais (processoId, nome, cpfCnpj, tipo, categoria) VALUES (?,?,?,?,?)',
        [procId, p.nome, p.cpfCnpj, 'Reu', p.cat]);
    }
  }
  console.log('Partes processuais inseridas');

  // Dados financeiros
  await conn.execute('INSERT INTO dados_financeiros (clienteId, margemConsignavelValor, totalConsignacoes, valorExcedente, margemExcedida, fonteRenda) VALUES (?,?,?,?,?,?)',
    [clienteId, '2319.85', '6276.30', '3956.45', 1, 'Proventos Militares - PM/GO']);
  console.log('Dados financeiros inseridos');

  // Empréstimos
  for (const b of ['BANCO INTER S.A', 'BANCO PAN S.A.', 'ITAU UNIBANCO S.A.']) {
    await conn.execute('INSERT INTO emprestimos_consignados (clienteId, banco) VALUES (?,?)', [clienteId, b]);
  }
  console.log('Empréstimos inseridos');

  // Conhecimentos
  const conhecimentos = [
    ['Tese', 'Readequação de Empréstimos Consignados - Limite 35% (Leonardo)', 'Readequação dos empréstimos consignados para o limite de 35% dos proventos líquidos, conforme Lei Estadual 16.898/2010.', 'Processo 5380169-54.2025.8.09.0051', principalId],
    ['Jurisprudência', 'TJ-GO - Apelação Cível 5407476-85.2022.8.09.0051', 'TJ-GO - Apelação Cível: 5407476-85.2022.8.09.0051 GOIÂNIA, Relator: Des(a). DESEMBARGADORA NELMA BRANCO FERREIRA PERILO, 4ª Câmara Cível', 'TJ-GO 4ª Câmara Cível', principalId],
    ['Legislação', 'Lei Estadual 16.898/2010 e alterações (Leonardo)', 'Art. 5º da Lei Estadual 16.898/2010 - Limite de 35% para empréstimos consignados sobre proventos líquidos.', 'Legislação Estadual GO', principalId],
    ['Tese', 'Cumprimento Provisório - Honorários de Sucumbência (Leonardo)', 'Cumprimento provisório de sentença para cobrança dos honorários advocatícios de sucumbência.', 'Processo 5947078-21.2025.8.09.0051', cumprimentoId],
    ['Legislação', 'Lei Estadual 22.615/2024 - Custas ao final OAB/GO', 'Art. 114, § 12 da Lei Estadual nº 11.651/1991 - Custas processuais recolhidas ao final pela parte vencida para advogados OAB/GO.', 'Legislação Estadual GO', cumprimentoId],
  ];
  for (const [tipo, titulo, conteudo, fonte, procId] of conhecimentos) {
    await conn.execute('INSERT INTO conhecimentos (tipo, titulo, conteudo, fonte, processoId) VALUES (?,?,?,?,?)', [tipo, titulo, conteudo, fonte, procId]);
  }
  console.log('Conhecimentos inseridos');

  console.log('\n=== IMPORTAÇÃO LEONARDO COMPLETA ===');
  console.log('Cliente ID:', clienteId);
  console.log('Processo Principal ID:', principalId, '(5380169-54.2025.8.09.0051)');
  console.log('Cumprimento Provisório ID:', cumprimentoId, '(5947078-21.2025.8.09.0051) → vinculado ao', principalId);
  
  await conn.end();
}

run().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
