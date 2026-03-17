import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Check if Edinalva already exists
const [existing] = await conn.execute('SELECT id FROM clientes WHERE nomeCompleto LIKE "%EDINALVA%"');
let clienteId;
if (existing.length > 0) {
  clienteId = existing[0].id;
  console.log('Edinalva já existe, ID:', clienteId);
} else {
  const [r] = await conn.execute(
    'INSERT INTO clientes (nomeCompleto, cpfCnpj, tipoPessoa, telefone, email, cidade, estado, observacoes, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())',
    ['EDINALVA SOARES CAMPOS', '', 'PF', '', '', 'Senador Canedo', 'GO', 'Cliente do escritório - processo de honorários advocatícios sucumbenciais contra 4 bancos (Bradesco, CEF, Pan, Itaú)']
  );
  clienteId = r.insertId;
  console.log('Edinalva inserida, ID:', clienteId);
}

// Check if processes exist
const [existingProc] = await conn.execute('SELECT id, numeroCnj FROM processos WHERE numeroCnj IN (?, ?)', ['5445397-29.2024.8.09.0174', '5565616-37.2025.8.09.0174']);
console.log('Processos existentes:', existingProc.map(p => p.numeroCnj));

const hasPrincipal = existingProc.find(p => p.numeroCnj === '5445397-29.2024.8.09.0174');
const hasCumprimento = existingProc.find(p => p.numeroCnj === '5565616-37.2025.8.09.0174');

let procPrincipalId, procCumprimentoId;

if (!hasPrincipal) {
  const [r] = await conn.execute(
    `INSERT INTO processos (clienteId, numeroCnj, tipoAcao, faseAtual, statusProcesso, vara, comarca, tribunal, valorCausa, valorCondenacao, 
     poloAtivo, poloPassivo, advogadoAutor, juiz, resumoSentenca, estrategia, honorariosPerc, honorariosValor, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [clienteId, '5445397-29.2024.8.09.0174', 'Ação Revisional de Contrato Bancário', 'Recurso de Apelação', 'em_andamento',
     '2ª Vara Cível', 'Senador Canedo', 'TJGO', 339150.38, 33915.04,
     'EDINALVA SOARES CAMPOS', 'BANCO PAN S.A., ITAÚ UNIBANCO S.A., CAIXA ECONÔMICA FEDERAL, BANCO BRADESCO S.A.',
     'Paulo da Silva Melo Filho - OAB/GO 40.559', 'Juiz da 2ª Vara Cível de Senador Canedo',
     'Sentença parcialmente procedente. Acórdão da 8ª Câmara Cível do TJGO reformou parcialmente, fixando honorários sucumbenciais de 10% sobre o valor da causa (R$ 339.150,38) divididos entre os 4 réus.',
     'Execução dos honorários sucumbenciais de R$ 33.915,04 (10% de R$ 339.150,38) divididos entre Bradesco, CEF, Pan e Itaú.',
     10.00, 33915.04]
  );
  procPrincipalId = r.insertId;
  console.log('Processo principal inserido, ID:', procPrincipalId);
} else {
  procPrincipalId = hasPrincipal.id;
  console.log('Processo principal já existe, ID:', procPrincipalId);
}

if (!hasCumprimento) {
  const [r] = await conn.execute(
    `INSERT INTO processos (clienteId, numeroCnj, tipoAcao, faseAtual, statusProcesso, vara, comarca, tribunal, valorCausa, valorCondenacao,
     poloAtivo, poloPassivo, advogadoAutor, juiz, resumoSentenca, processoOrigemId, tipoVinculo, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [clienteId, '5565616-37.2025.8.09.0174', 'Cumprimento Definitivo de Sentença - Honorários', 'Embargos de Declaração', 'em_andamento',
     '2ª Vara Cível', 'Senador Canedo', 'TJGO', 45090.96, 45090.96,
     'PAULO DA SILVA MELO FILHO (Advogado - OAB/GO 40.559)', 'BANCO PAN S.A., ITAÚ UNIBANCO S.A., CAIXA ECONÔMICA FEDERAL, BANCO BRADESCO S.A.',
     'Paulo da Silva Melo Filho - OAB/GO 40.559', 'Juiz da 2ª Vara Cível de Senador Canedo',
     'Cumprimento definitivo para cobrança de honorários. Bradesco, CEF e Pan PAGARAM. ITAÚ NÃO PAGOU (apenas pré-cadastros). Juiz extinguiu por quitação (art. 924, II, CPC) - DECISÃO CONTRADITÓRIA. Embargos de Declaração com efeitos infringentes opostos.',
     procPrincipalId, 'cumprimento_definitivo']
  );
  procCumprimentoId = r.insertId;
  console.log('Processo cumprimento inserido, ID:', procCumprimentoId);
} else {
  procCumprimentoId = hasCumprimento.id;
  console.log('Processo cumprimento já existe, ID:', procCumprimentoId);
}

// Insert partes processuais for cumprimento
const partes = [
  [procCumprimentoId, 'PAULO DA SILVA MELO FILHO', '036.922.151-69', 'Autor'],
  [procCumprimentoId, 'BANCO PAN S.A.', '', 'Reu'],
  [procCumprimentoId, 'ITAÚ UNIBANCO S.A.', '', 'Reu'],
  [procCumprimentoId, 'CAIXA ECONÔMICA FEDERAL', '', 'Reu'],
  [procCumprimentoId, 'BANCO BRADESCO S.A.', '', 'Reu'],
];
for (const [pid, nome, cpf, tipo] of partes) {
  try {
    await conn.execute('INSERT INTO partes_processuais (processoId, nome, cpfCnpj, tipo, createdAt) VALUES (?, ?, ?, ?, NOW())', [pid, nome, cpf, tipo]);
  } catch(e) { console.log('Parte erro:', e.message.substring(0,80)); }
}
console.log('Partes inseridas');

// Insert movimentações
const movs = [
  [procCumprimentoId, '2025-06-10', 'Petição Inicial', 'Distribuição do cumprimento definitivo de sentença para cobrança de honorários advocatícios sucumbenciais'],
  [procCumprimentoId, '2025-07-15', 'Intimação dos Executados', 'Intimação dos 4 bancos para pagamento em 15 dias sob pena de multa de 10% e honorários de 10% (art. 523, §1º, CPC)'],
  [procCumprimentoId, '2025-09-20', 'Depósito Judicial CEF', 'Caixa Econômica Federal efetuou depósito judicial de R$ 11.762,86 - QUITADO'],
  [procCumprimentoId, '2025-10-05', 'Alvará Expedido CEF', 'Alvará expedido para levantamento do valor depositado pela CEF - R$ 11.762,86'],
  [procCumprimentoId, '2025-10-15', 'Bloqueio SISBAJUD Pan', 'Bloqueio via SISBAJUD de R$ 11.762,86 em conta do Banco Pan S.A. - QUITADO'],
  [procCumprimentoId, '2026-02-24', 'Decisão de Extinção', 'Juiz julgou extinto o feito nos termos do art. 924, II, CPC. CONTRADITÓRIA: reconhece que Itaú não pagou mas extingue por quitação integral. R$ 11.762,86 do Itaú PENDENTE.'],
];
for (const [pid, data, evento, desc] of movs) {
  try {
    await conn.execute('INSERT INTO movimentacoes (processoId, data, evento, descricao, createdAt) VALUES (?, ?, ?, ?, NOW())', [pid, data, evento, desc]);
  } catch(e) { console.log('Mov erro:', e.message.substring(0,80)); }
}
console.log('Movimentações inseridas');

// Insert conhecimento - análise cruzada
try {
  await conn.execute(
    'INSERT INTO conhecimentos (categoria, titulo, conteudo, tribunal, tipoAcao, tags, processoOrigemId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
    ['Estrategia', 'Análise Cruzada - Edinalva/Paulo Melo - Honorários vs Cumprimento Definitivo',
    `CRUZAMENTO DE DADOS ENTRE PROCESSOS:
Processo Principal: 5445397-29.2024.8.09.0174 (Ação Revisional)
Cumprimento Definitivo: 5565616-37.2025.8.09.0174 (Honorários Advocatícios)

HONORÁRIOS FIXADOS: 10% sobre R$ 339.150,38 = R$ 33.915,04 divididos entre 4 bancos
Cada banco deve: R$ 8.478,76 + multa 10% + honorários 10% (art. 523, §1º) = R$ 11.762,86

PAGAMENTOS REALIZADOS:
- Banco Bradesco S.A.: PAGOU R$ 8.933,36 nos autos principais (Mov. 153) - QUITADO
- Caixa Econômica Federal: PAGOU R$ 11.762,86 via depósito judicial (Mov. 34) - Alvará expedido (Mov. 42) - QUITADO
- Banco Pan S.A.: PAGOU R$ 11.762,86 via bloqueio SISBAJUD (Mov. 46) - QUITADO
- Itaú Unibanco S.A.: NÃO PAGOU - Apenas "pré-cadastros" sem transferência efetiva - R$ 11.762,86 PENDENTE

DECISÃO DE EXTINÇÃO (Mov. 134, 24/02/2026):
Juiz extinguiu por quitação integral (art. 924, II, CPC) - CONTRADITÓRIA
A própria decisão reconhece que o Itaú não transferiu valores efetivamente

ESTRATÉGIA: Embargos de Declaração com Efeitos Infringentes
- Contradição: reconhece ausência de pagamento pelo Itaú mas extingue por quitação
- Omissão: não analisou crédito pendente de R$ 11.762,86
- Pedido: reforma para prosseguir execução contra Itaú com nova ordem SISBAJUD`,
    'TJGO', 'Cumprimento Definitivo de Sentença - Honorários',
    'edinalva,honorarios,cumprimento,itau,contradição,embargos,cruzamento,SISBAJUD',
    procCumprimentoId]
  );
  console.log('Conhecimento inserido');
} catch(e) { console.log('Conhecimento erro:', e.message.substring(0,100)); }

// Insert petition record
try {
  await conn.execute(
    'INSERT INTO peticoes_geradas (processoId, clienteId, tipo, titulo, conteudo_texto, status, geradoPor, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
    [procCumprimentoId, clienteId, 'Embargos de Declaração', 'Embargos de Declaração com Efeitos Infringentes - Cumprimento Honorários',
    'Embargos de Declaração com Efeitos Infringentes contra decisão de extinção do cumprimento de sentença. Contradição: juiz reconhece que Itaú não pagou mas extingue por quitação integral. Omissão: não analisou crédito pendente de R$ 11.762,86. Pedidos: reforma da decisão, prosseguimento da execução contra Itaú, nova ordem SISBAJUD.',
    'gerada', 'Sistema Melo & Preda']
  );
  console.log('Petição registrada no banco');
} catch(e) { console.log('Petição erro:', e.message.substring(0,100)); }

await conn.end();
console.log('=== CONCLUÍDO - Edinalva inserida com sucesso ===');
