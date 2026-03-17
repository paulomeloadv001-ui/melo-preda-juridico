import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

async function run() {
  console.log('=== INSERINDO VERANEIDE NO BANCO DE DADOS ===');

  // 1. Inserir/atualizar cliente
  const [existingCliente] = await conn.query(
    "SELECT id FROM clientes WHERE cpfCnpj = '364.888.521-91' OR nomeCompleto LIKE '%VERANEIDE%' LIMIT 1"
  );
  
  let clienteId;
  if (existingCliente.length > 0) {
    clienteId = existingCliente[0].id;
    console.log(`Cliente já existe: ID ${clienteId}`);
    await conn.query(`UPDATE clientes SET 
      nomeCompleto = 'VERANEIDE SOARES CAMPOS LUCY',
      cpfCnpj = '364.888.521-91',
      tipoPessoa = 'PF',
      profissao = 'Técnico Fazendário Estadual III',
      orgaoEmpregador = 'Estado de Goiás',
      endereco = 'Rua 11, Nº 213, Qd. 30, Lt. 04, Centro',
      cidade = 'Rianápolis',
      estado = 'GO',
      cep = '76315-000'
    WHERE id = ?`, [clienteId]);
  } else {
    const [result] = await conn.query(`INSERT INTO clientes (
      nomeCompleto, cpfCnpj, tipoPessoa, profissao, orgaoEmpregador, endereco, cidade, estado, cep
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      'VERANEIDE SOARES CAMPOS LUCY', '364.888.521-91', 'PF',
      'Técnico Fazendário Estadual III', 'Estado de Goiás',
      'Rua 11, Nº 213, Qd. 30, Lt. 04, Centro', 'Rianápolis', 'GO', '76315-000'
    ]);
    clienteId = result.insertId;
    console.log(`Cliente inserido: ID ${clienteId}`);
  }

  // 2. Inserir processo principal (origem)
  const [existingOrigem] = await conn.query(
    "SELECT id FROM processos WHERE numeroCnj = '5277803-07.2024.8.09.0136' LIMIT 1"
  );
  
  let processoOrigemId;
  if (existingOrigem.length > 0) {
    processoOrigemId = existingOrigem[0].id;
    console.log(`Processo origem já existe: ID ${processoOrigemId}`);
    await conn.query(`UPDATE processos SET 
      clienteId = ?,
      tribunal = 'TJGO',
      comarca = 'Rialma',
      vara = 'Vara Cível',
      tipoAcao = 'Obrigação de Fazer c/ Tutela Antecipada de Urgência',
      natureza = 'Cível',
      classeProcessual = 'Procedimento Comum Cível',
      assunto = 'DIREITO DO CONSUMIDOR - Contratos de Consumo - Bancários - Empréstimo consignado',
      faseAtual = 'Recurso',
      statusProcesso = 'Ativo',
      valorCausa = 519616.75,
      dataDistribuicao = '2024-04-11',
      dataSentenca = '2025-11-17',
      juiz = 'FILIPE AUGUSTO CAETANO SANCHO',
      segredoJustica = 1,
      poloAtivo = 'VERANEIDE SOARES CAMPOS LUCY',
      poloPassivo = 'BANCO SANTANDER (BRASIL) S.A., BANCO SAFRA S/A, BANCO DO BRASIL S.A.',
      advogadoAutor = 'PAULO DA SILVA MELO FILHO (OAB/GO 40.559)',
      resumoSentenca = 'Julgou PARCIALMENTE PROCEDENTES os pedidos iniciais, CONFIRMANDO INTEGRALMENTE A TUTELA DE URGÊNCIA anteriormente deferida, para determinar que as requeridas procedessem à redução dos descontos mensais, a fim de que a soma das consignações facultativas não ultrapassasse 35% da remuneração líquida da autora. Honorários fixados em 10% sobre valor atualizado da causa (após embargos de declaração acolhidos em parte com efeitos infringentes).',
      valorCondenacao = 545597.59,
      honorariosPerc = 10.00,
      honorariosValor = 54559.76,
      tutelaTipo = 'Antecipada de Urgência',
      tutelaStatus = 'Deferida e Confirmada na Sentença',
      tutelaDescricao = 'Limitação dos descontos consignados a 35% da remuneração líquida da autora'
    WHERE id = ?`, [clienteId, processoOrigemId]);
  } else {
    const [result] = await conn.query(`INSERT INTO processos (
      clienteId, numeroCnj, tribunal, comarca, vara, tipoAcao, natureza, classeProcessual, assunto,
      faseAtual, statusProcesso, valorCausa, dataDistribuicao, dataSentenca, juiz, segredoJustica,
      poloAtivo, poloPassivo, advogadoAutor, resumoSentenca, valorCondenacao,
      honorariosPerc, honorariosValor, tutelaTipo, tutelaStatus, tutelaDescricao
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      clienteId, '5277803-07.2024.8.09.0136', 'TJGO', 'Rialma', 'Vara Cível',
      'Obrigação de Fazer c/ Tutela Antecipada de Urgência', 'Cível', 'Procedimento Comum Cível',
      'DIREITO DO CONSUMIDOR - Contratos de Consumo - Bancários - Empréstimo consignado',
      'Recurso', 'Ativo', 519616.75, '2024-04-11', '2025-11-17',
      'FILIPE AUGUSTO CAETANO SANCHO', 1,
      'VERANEIDE SOARES CAMPOS LUCY',
      'BANCO SANTANDER (BRASIL) S.A., BANCO SAFRA S/A, BANCO DO BRASIL S.A.',
      'PAULO DA SILVA MELO FILHO (OAB/GO 40.559)',
      'Julgou PARCIALMENTE PROCEDENTES os pedidos iniciais, CONFIRMANDO INTEGRALMENTE A TUTELA DE URGÊNCIA anteriormente deferida, para determinar que as requeridas procedessem à redução dos descontos mensais, a fim de que a soma das consignações facultativas não ultrapassasse 35% da remuneração líquida da autora. Honorários fixados em 10% sobre valor atualizado da causa (após embargos de declaração acolhidos em parte com efeitos infringentes).',
      545597.59, 10.00, 54559.76,
      'Antecipada de Urgência', 'Deferida e Confirmada na Sentença',
      'Limitação dos descontos consignados a 35% da remuneração líquida da autora'
    ]);
    processoOrigemId = result.insertId;
    console.log(`Processo origem inserido: ID ${processoOrigemId}`);
  }

  // 3. Inserir processo de cumprimento provisório
  const [existingCumpr] = await conn.query(
    "SELECT id FROM processos WHERE numeroCnj = '5171353-69.2026.8.09.0136' LIMIT 1"
  );
  
  let processoCumprimentoId;
  if (existingCumpr.length > 0) {
    processoCumprimentoId = existingCumpr[0].id;
    console.log(`Processo cumprimento já existe: ID ${processoCumprimentoId}`);
    await conn.query(`UPDATE processos SET
      clienteId = ?,
      tribunal = 'TJGO',
      comarca = 'Rialma',
      vara = 'Vara Cível',
      tipoAcao = 'Cumprimento Provisório de Sentença',
      natureza = 'Cível',
      classeProcessual = 'Cumprimento de Sentença/Decisão',
      assunto = 'DIREITO DO CONSUMIDOR - Contratos de Consumo - Bancários - Empréstimo consignado - Honorários Advocatícios Sucumbenciais',
      faseAtual = 'Cumprimento de Sentença',
      statusProcesso = 'Ativo',
      valorCausa = 54559.76,
      dataDistribuicao = '2026-02-27',
      juiz = 'FILIPE AUGUSTO CAETANO SANCHO',
      segredoJustica = 1,
      poloAtivo = 'PAULO DA SILVA MELO FILHO (OAB/GO 40.559)',
      poloPassivo = 'BANCO SANTANDER (BRASIL) S.A., BANCO SAFRA S/A, BANCO DO BRASIL S.A.',
      advogadoAutor = 'PAULO DA SILVA MELO FILHO (OAB/GO 40.559)',
      resumoSentenca = 'Cumprimento provisório para recebimento de honorários advocatícios sucumbenciais (10% sobre valor atualizado da causa). DECISÃO DO JUIZ (02/03/2026): INDEFERIU o cumprimento provisório - determinou aguardar recebimento dos recursos de apelação. NECESSÁRIO: Petição de reconsideração.',
      valorCondenacao = 54559.76,
      honorariosPerc = 10.00,
      honorariosValor = 54559.76,
      processoOrigemId = ?,
      tipoVinculo = 'Cumprimento Provisório'
    WHERE id = ?`, [clienteId, processoOrigemId, processoCumprimentoId]);
  } else {
    const [result] = await conn.query(`INSERT INTO processos (
      clienteId, numeroCnj, tribunal, comarca, vara, tipoAcao, natureza, classeProcessual, assunto,
      faseAtual, statusProcesso, valorCausa, dataDistribuicao, juiz, segredoJustica,
      poloAtivo, poloPassivo, advogadoAutor, resumoSentenca, valorCondenacao,
      honorariosPerc, honorariosValor, processoOrigemId, tipoVinculo
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      clienteId, '5171353-69.2026.8.09.0136', 'TJGO', 'Rialma', 'Vara Cível',
      'Cumprimento Provisório de Sentença', 'Cível', 'Cumprimento de Sentença/Decisão',
      'DIREITO DO CONSUMIDOR - Contratos de Consumo - Bancários - Empréstimo consignado - Honorários Advocatícios Sucumbenciais',
      'Cumprimento de Sentença', 'Ativo', 54559.76, '2026-02-27',
      'FILIPE AUGUSTO CAETANO SANCHO', 1,
      'PAULO DA SILVA MELO FILHO (OAB/GO 40.559)',
      'BANCO SANTANDER (BRASIL) S.A., BANCO SAFRA S/A, BANCO DO BRASIL S.A.',
      'PAULO DA SILVA MELO FILHO (OAB/GO 40.559)',
      'Cumprimento provisório para recebimento de honorários advocatícios sucumbenciais (10% sobre valor atualizado da causa). DECISÃO DO JUIZ (02/03/2026): INDEFERIU o cumprimento provisório - determinou aguardar recebimento dos recursos de apelação. NECESSÁRIO: Petição de reconsideração.',
      54559.76, 10.00, 54559.76, processoOrigemId, 'Cumprimento Provisório'
    ]);
    processoCumprimentoId = result.insertId;
    console.log(`Processo cumprimento inserido: ID ${processoCumprimentoId}`);
  }

  // 4. Inserir partes processuais do cumprimento
  const partes = [
    { nome: 'PAULO DA SILVA MELO FILHO', tipo: 'Autor', cpfCnpj: '036.922.151-69', cat: 'Exequente' },
    { nome: 'BANCO SANTANDER (BRASIL) S.A.', tipo: 'Reu', cpfCnpj: '90.400.888/0001-42', cat: 'Executado' },
    { nome: 'BANCO SAFRA S/A', tipo: 'Reu', cpfCnpj: '58.160.789/0001-28', cat: 'Executado' },
    { nome: 'BANCO DO BRASIL S.A.', tipo: 'Reu', cpfCnpj: '00.000.000/0001-91', cat: 'Executado' },
  ];

  for (const p of partes) {
    const [existing] = await conn.query(
      'SELECT id FROM partes_processuais WHERE processoId = ? AND nome = ? LIMIT 1',
      [processoCumprimentoId, p.nome]
    );
    if (existing.length === 0) {
      await conn.query(`INSERT INTO partes_processuais (processoId, nome, cpfCnpj, tipo, categoria) VALUES (?, ?, ?, ?, ?)`,
        [processoCumprimentoId, p.nome, p.cpfCnpj, p.tipo, p.cat]);
      console.log(`Parte inserida: ${p.nome} (${p.cat})`);
    } else {
      console.log(`Parte já existe: ${p.nome}`);
    }
  }

  // Partes do processo de origem também
  const partesOrigem = [
    { nome: 'VERANEIDE SOARES CAMPOS LUCY', tipo: 'Autor', cpfCnpj: '364.888.521-91', cat: 'Autora' },
    { nome: 'BANCO SANTANDER (BRASIL) S.A.', tipo: 'Reu', cpfCnpj: '90.400.888/0001-42', cat: 'Réu' },
    { nome: 'BANCO SAFRA S/A', tipo: 'Reu', cpfCnpj: '58.160.789/0001-28', cat: 'Réu' },
    { nome: 'BANCO DO BRASIL S.A.', tipo: 'Reu', cpfCnpj: '00.000.000/0001-91', cat: 'Réu' },
  ];

  for (const p of partesOrigem) {
    const [existing] = await conn.query(
      'SELECT id FROM partes_processuais WHERE processoId = ? AND nome = ? LIMIT 1',
      [processoOrigemId, p.nome]
    );
    if (existing.length === 0) {
      await conn.query(`INSERT INTO partes_processuais (processoId, nome, cpfCnpj, tipo, categoria) VALUES (?, ?, ?, ?, ?)`,
        [processoOrigemId, p.nome, p.cpfCnpj, p.tipo, p.cat]);
      console.log(`Parte origem inserida: ${p.nome}`);
    } else {
      console.log(`Parte origem já existe: ${p.nome}`);
    }
  }

  // 5. Inserir movimentações do cumprimento
  const movs = [
    { data: '2026-02-27', evento: 'Petição Enviada', desc: 'Petição inicial do cumprimento provisório de sentença com planilha de atualização de débito. Honorários sucumbenciais de 10% sobre valor atualizado da causa (R$ 54.559,76).' },
    { data: '2026-02-27', evento: 'Processo Distribuído', desc: 'Distribuído para FILIPE AUGUSTO CAETANO SANCHO - Vara Cível da Comarca de Rialma (Dependente do processo 5277803-07.2024.8.09.0136).' },
    { data: '2026-02-27', evento: 'Autos Conclusos', desc: 'Autos conclusos ao juiz FILIPE AUGUSTO CAETANO SANCHO.' },
    { data: '2026-03-02', evento: 'Juntada -> Petição (Emenda à Inicial)', desc: 'Emenda à petição inicial: correção do valor da causa de R$ 545.597,59 para R$ 54.559,76 (valor correto dos honorários). Pedido de dispensa de custas processuais conforme Lei 15.109/2025 e art. 82, §3º, CPC. Pedido de intimação solidária dos executados para pagamento em 15 dias sob pena de multa e honorários de 10% (art. 523, §1º, CPC).' },
    { data: '2026-03-02', evento: 'Decisão -> Outras Decisões (INDEFERIMENTO)', desc: 'DECISÃO DO JUIZ FILIPE AUGUSTO CAETANO SANCHO: INDEFERIDO o cumprimento provisório de sentença neste momento. Fundamentação: as executadas interpuseram recursos de apelação (mov. 116, 132 e 135) e NÃO HÁ INFORMAÇÕES do recebimento dos recursos até o presente momento. Entendeu que o recebimento formal é requisito para o cumprimento provisório (art. 520 CPC). Determinou: aguardar em cartório o recebimento do recurso. Após: conclusos para análise. Deferiu retificação do valor da causa conforme mov. 4.' },
    { data: '2026-03-02', evento: 'Intimação Expedida', desc: 'Intimação via DJEN para Paulo Da Silva Melo Filho - Polo Ativo. Referente à Mov. Decisão -> Outras Decisões (CNJ:12164).' },
  ];

  for (const m of movs) {
    const [existing] = await conn.query(
      'SELECT id FROM movimentacoes WHERE processoId = ? AND evento = ? AND data = ? LIMIT 1',
      [processoCumprimentoId, m.evento, m.data]
    );
    if (existing.length === 0) {
      await conn.query(`INSERT INTO movimentacoes (processoId, data, evento, descricao) VALUES (?, ?, ?, ?)`,
        [processoCumprimentoId, m.data, m.evento, m.desc]);
      console.log(`Movimentação inserida: ${m.data} - ${m.evento}`);
    } else {
      console.log(`Movimentação já existe: ${m.evento}`);
    }
  }

  // 6. Inserir dados financeiros
  const [existingFin] = await conn.query(
    'SELECT id FROM dados_financeiros WHERE clienteId = ? LIMIT 1', [clienteId]
  );
  if (existingFin.length === 0) {
    await conn.query(`INSERT INTO dados_financeiros (
      clienteId, remuneracaoBruta, remuneracaoLiquida, margemConsignavelPerc, margemConsignavelValor,
      totalConsignacoes, margemExcedida, valorExcedente, fonteRenda, dataReferencia
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      clienteId, 28391.33, 5172.49, 35.00, 4998.75, 23218.84, 1, 5737.15,
      'Servidor Público Estadual - Estado de Goiás', '2024-04-11'
    ]);
    console.log('Dados financeiros inseridos');
  } else {
    console.log('Dados financeiros já existem');
  }

  // 7. Inserir empréstimos consignados
  const emprestimos = [
    { banco: 'BANCO SANTANDER (BRASIL) S.A.', cnpj: '90.400.888/0001-42', parcela: 3578.63 },
    { banco: 'BANCO SAFRA S/A', cnpj: '58.160.789/0001-28', parcela: 3578.63 },
    { banco: 'BANCO DO BRASIL S.A.', cnpj: '00.000.000/0001-91', parcela: 3578.64 },
  ];

  for (const e of emprestimos) {
    const [existing] = await conn.query(
      'SELECT id FROM emprestimos_consignados WHERE clienteId = ? AND banco = ? LIMIT 1',
      [clienteId, e.banco]
    );
    if (existing.length === 0) {
      await conn.query(`INSERT INTO emprestimos_consignados (
        clienteId, banco, valorParcela, status
      ) VALUES (?, ?, ?, 'Ativo')`, [clienteId, e.banco, e.parcela]);
      console.log(`Empréstimo inserido: ${e.banco}`);
    } else {
      console.log(`Empréstimo já existe: ${e.banco}`);
    }
  }

  // 8. Inserir estratégia processual
  const [existingEst] = await conn.query(
    'SELECT id FROM estrategias WHERE processoId = ? LIMIT 1', [processoCumprimentoId]
  );
  if (existingEst.length === 0) {
    await conn.query(`INSERT INTO estrategias (
      processoId, tesePrincipal, fundamentacaoLegal, jurisprudenciaCitada, pontosFortes, riscosIdentificados, observacoes
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
      processoCumprimentoId,
      'A decisão que indeferiu o cumprimento provisório está equivocada. O art. 1.012, §1º, V, CPC é claro: a apelação contra sentença que confirma tutela provisória NÃO tem efeito suspensivo. A mera interposição da apelação (já ocorrida nos mov. 116, 132 e 135) é suficiente para autorizar o cumprimento provisório. O juiz confundiu "recebimento" com "interposição" — não se exige recebimento formal para o cumprimento provisório.',
      'Art. 1.012, §1º, V, CPC (sentença que confirma tutela provisória não tem efeito suspensivo); Art. 520, CPC (cumprimento provisório quando recurso desprovido de efeito suspensivo); Art. 1.012, §2º, CPC (início da eficácia da sentença após publicação); Art. 82, §3º, CPC (dispensa de custas para honorários); Súmula Vinculante 47/STF (natureza alimentar dos honorários); Lei 15.109/2025.',
      'STJ, AgRg no AREsp. 469.551/SP; TJDFT, Acórdão 1779008; Enunciado 144 da II Jornada de Direito Processual Civil do CJF: "A interposição de recurso sem efeito suspensivo contra sentença que confirma, concede ou revoga tutela provisória autoriza o cumprimento provisório da sentença, nos termos do art. 520 do CPC".',
      '1) Sentença CONFIRMOU tutela de urgência - apelação sem efeito suspensivo por força de lei; 2) Apelações já foram interpostas (mov. 116, 132, 135) - requisito cumprido; 3) Crédito tem natureza alimentar (SV 47/STF) - dispensa caução; 4) Enunciado 144 CJF é expresso sobre a questão; 5) Valor correto já retificado (R$ 54.559,76).',
      '1) Juiz pode manter a decisão e exigir agravo de instrumento; 2) Possibilidade de os bancos requererem efeito suspensivo ao tribunal.',
      'Petição de Reconsideração nos próprios autos é a via mais rápida. Subsidiariamente, Agravo de Instrumento contra a decisão interlocutória. Prazo: 15 dias úteis da intimação (02/03/2026).'
    ]);
    console.log('Estratégia inserida');
  } else {
    console.log('Estratégia já existe');
  }

  // 9. Inserir conhecimento sobre o caso
  const [existingConhec] = await conn.query(
    "SELECT id FROM conhecimentos WHERE titulo LIKE '%Veraneide%Cumprimento%' LIMIT 1"
  );
  if (existingConhec.length === 0) {
    await conn.query(`INSERT INTO conhecimentos (
      categoria, titulo, conteudo, tribunal, tipoAcao, tags
    ) VALUES (?, ?, ?, ?, ?, ?)`, [
      'Estrategia',
      'Caso Veraneide - Cumprimento Provisório Indeferido - Estratégia de Reconsideração',
      `CASO: Veraneide Soares Campos Lucy vs Bancos (Santander, Safra, BB)
CUMPRIMENTO: 5171353-69.2026.8.09.0136 | ORIGEM: 5277803-07.2024.8.09.0136
JUIZ: FILIPE AUGUSTO CAETANO SANCHO - Vara Cível de Rialma/GO

SITUAÇÃO: Juiz indeferiu cumprimento provisório de honorários (R$ 54.559,76) porque apelações dos bancos "não foram recebidas".

EQUÍVOCO: Confundiu "recebimento" com "interposição". Art. 520 CPC exige recurso "desprovido de efeito suspensivo", não "recebido". Apelação contra sentença que confirma tutela NÃO tem efeito suspensivo (art. 1.012, §1º, V, CPC).

TESE: Petição de Reconsideração demonstrando:
1. Art. 1.012, §1º, V, CPC: apelação sem efeito suspensivo
2. Mera interposição (já ocorrida) é suficiente
3. Art. 520 CPC: cumprimento provisório cabível
4. SV 47/STF: natureza alimentar dispensa caução
5. Enunciado 144 CJF: expresso sobre a questão`,
      'TJGO',
      'Cumprimento Provisório de Sentença',
      'cumprimento_provisorio,reconsideracao,honorarios,veraneide,art_1012_cpc,efeito_suspensivo'
    ]);
    console.log('Conhecimento inserido');
  } else {
    console.log('Conhecimento já existe');
  }

  // 10. Inserir cumprimento de sentença
  const [existingCS] = await conn.query(
    'SELECT id FROM cumprimentos_sentenca WHERE processoId = ? LIMIT 1', [processoCumprimentoId]
  );
  if (existingCS.length === 0) {
    await conn.query(`INSERT INTO cumprimentos_sentenca (
      processoId, tipo, valorExecucao, indiceCorrecao, dataCalculo,
      valorPrincipal, valorHonorarios, valorTotal
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
      processoCumprimentoId, 'Provisorio', 54559.76, 'INPC/IBGE', '2026-02-27',
      54559.76, 5455.98, 65471.72
    ]);
    console.log('Cumprimento de sentença inserido');
  } else {
    console.log('Cumprimento de sentença já existe');
  }

  console.log('\n=== DADOS INSERIDOS COM SUCESSO ===');
  console.log(`Cliente ID: ${clienteId}`);
  console.log(`Processo Origem ID: ${processoOrigemId}`);
  console.log(`Processo Cumprimento ID: ${processoCumprimentoId}`);

  await conn.end();
}

run().catch(e => { console.error('ERRO:', e); process.exit(1); });
