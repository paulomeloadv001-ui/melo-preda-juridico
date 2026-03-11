import fs from 'fs';
import mysql from 'mysql2/promise';
import { storagePut } from './server/storage.ts';

// Dados extraídos manualmente dos PDFs do Leonardo
const PRINCIPAL = {
  cliente: {
    cpfCnpj: "00581377184",
    nomeCompleto: "LEONARDO ROSA CORREIA",
    tipoPessoa: "PF",
    rg: "34.592 PM/GO",
    profissao: "Militar",
    cargo: "Militar Estadual",
    orgaoEmpregador: "Estado de Goiás - Polícia Militar",
    vinculoFuncional: "143433",
    endereco: "Rua Alcobaca, Qd. 2, Lt. 26, S/N, Jardim Leblon",
    cidade: "Goiânia",
    estado: "Goiás",
    cep: "74455367",
    nacionalidade: "Brasileiro"
  },
  processo: {
    numeroCnj: "5380169-54.2025.8.09.0051",
    tribunal: "TJGO",
    comarca: "Goiânia",
    vara: "5ª UPJ Varas Cíveis: 12ª, 20ª, 21ª, 22ª, 23ª e 25ª",
    tipoAcao: "Ação de Obrigação de Fazer com Pedido de Tutela Antecipada de Urgência",
    natureza: "Consumerista",
    classeProcessual: "Procedimento Comum Cível",
    assunto: "Readequação de empréstimos consignados ao limite de 35% dos proventos líquidos",
    faseAtual: "Conhecimento",
    statusProcesso: "Ativo",
    valorCausa: "405886.42",
    dataDistribuicao: "16/05/2025",
    prioridade: "Normal",
    segredoJustica: 0,
    poloAtivo: "LEONARDO ROSA CORREIA",
    poloPassivo: "BANCO INTER S.A; BANCO PAN S.A.; ITAU UNIBANCO S.A.",
    advogadoAutor: "PAULO DA SILVA MELO FILHO"
  },
  financeiro: {
    remuneracaoLiquida: null,
    margemConsignavelValor: "2319.85",
    totalConsignacoes: "6276.30",
    valorExcedente: "3956.45",
    margemExcedida: 1,
    fonteRenda: "Proventos Militares - PM/GO"
  },
  emprestimos: [
    { banco: "BANCO INTER S.A", contrato: null, valorParcela: null, valorTotal: null },
    { banco: "BANCO PAN S.A.", contrato: null, valorParcela: null, valorTotal: null },
    { banco: "ITAU UNIBANCO S.A.", contrato: null, valorParcela: null, valorTotal: null }
  ],
  estrategia: {
    tesePrincipal: "Readequação dos empréstimos consignados para o limite de 35% dos proventos líquidos, conforme Lei Estadual 16.898/2010 e suas alterações (Leis Estaduais 21.063/2021 e 21.665/22), devido ao comprometimento excessivo da verba alimentar do Autor.",
    fundamentacaoLegal: "Art. 5º da Lei Estadual 16.898/2010 (alterada pelas Leis Estaduais 21.063/2021 e 21.665/22); Arts. 14, 39 e 51 do CDC; Súmula 297 STJ; Súmula 60 TJ/GO; Art. 1º, III e Art. 7º, X da CF; Art. 421 CC; Art. 292, II e Art. 300 do CPC.",
    jurisprudenciaCitada: "TJ-GO - Apelação Cível: 5407476-85.2022.8.09.0051 GOIÂNIA, Relator: Des(a). DESEMBARGADORA NELMA BRANCO FERREIRA PERILO, 4ª Câmara Cível",
    pontosFortes: "Comprovação do excesso de descontos via contracheques; legislação estadual clara sobre o limite de 35%; jurisprudência favorável do TJ/GO; natureza alimentar da verba; vulnerabilidade do consumidor.",
    riscosIdentificados: "Necessidade de comprovar a hipossuficiência para gratuidade de justiça e a possível resistência dos bancos."
  },
  partesPassivas: [
    { nome: "BANCO INTERMEDIUM S/A (BANCO INTER)", cpfCnpj: "00.416.968/0001-01", categoria: "Banco" },
    { nome: "BANCO PAN S.A.", cpfCnpj: "59.285.411/0001-13", categoria: "Banco" },
    { nome: "BANCO ITAÚ S.A.", cpfCnpj: "60.701.190/0001-04", categoria: "Banco" }
  ],
  movimentacoes: [
    { data: "16/05/2025", evento: "Petição Inicial", descricao: "[Ev.1] Ajuizamento da Ação de Obrigação de Fazer com pedido de Tutela Antecipada de Urgência, visando a readequação de empréstimos consignados para o limite de 35% da renda líquida do autor.", numero_evento: "1" }
  ]
};

const CUMPRIMENTO = {
  processo: {
    numeroCnj: "5947078-21.2025.8.09.0051",
    tribunal: "TJGO",
    comarca: "Goiânia",
    vara: "5ª UPJ Varas Cíveis: 12ª, 20ª, 21ª, 22ª, 23ª e 25ª",
    tipoAcao: "Cumprimento Provisório de Sentença - Honorários Advocatícios de Sucumbência",
    natureza: "Execução",
    classeProcessual: "Cumprimento Provisório de Sentença",
    assunto: "Execução de honorários advocatícios de sucumbência fixados nos autos principais",
    faseAtual: "Execução",
    statusProcesso: "Ativo",
    valorCausa: "41049.00",
    dataDistribuicao: "14/11/2025",
    prioridade: "Prioridade Prevista em Lei",
    segredoJustica: 0,
    poloAtivo: "PAULO DA SILVA MELO FILHO (advogado, legitimidade concorrente com LEONARDO ROSA CORREIA)",
    poloPassivo: "BANCO INTER S.A; BANCO PAN S.A.; ITAU UNIBANCO S.A.",
    advogadoAutor: "PAULO DA SILVA MELO FILHO",
    processoOrigemCnj: "5380169-54.2025.8.09.0051",
    tipoVinculo: "Cumprimento Provisório de Sentença"
  },
  estrategia: {
    tesePrincipal: "Cumprimento provisório de sentença para cobrança dos honorários advocatícios de sucumbência fixados na decisão que deferiu a tutela antecipada nos autos principais, com base nos arts. 520 e seguintes do CPC.",
    fundamentacaoLegal: "Arts. 520 e seguintes do CPC; Lei Estadual nº 22.615/2024 (alterou Lei nº 11.651/1991 - Código Tributário de Goiás); Art. 114, § 12 da Lei Estadual nº 11.651/1991; Art. 85, §14 do CPC.",
    jurisprudenciaCitada: "TJ-GO - Apelação Cível: 56377718720238090051 GOIÂNIA, Relator: Des(a). RODRIGO DE SILVEIRA, 10ª Câmara Cível",
    pontosFortes: "Sentença favorável nos autos principais com tutela deferida; legitimidade concorrente do advogado para executar honorários; Lei Estadual 22.615/2024 permite custas ao final para advogados da OAB/GO.",
    riscosIdentificados: "Cumprimento provisório pode ser revertido se sentença for reformada em recurso; necessidade de caução em caso de levantamento de valores."
  },
  partesPassivas: [
    { nome: "BANCO INTERMEDIUM S/A (BANCO INTER)", cpfCnpj: "00.416.968/0001-01", categoria: "Banco" },
    { nome: "BANCO PAN S.A.", cpfCnpj: "59.285.411/0001-13", categoria: "Banco" },
    { nome: "BANCO ITAÚ S.A.", cpfCnpj: "60.701.190/0001-04", categoria: "Banco" }
  ],
  movimentacoes: [
    { data: "14/11/2025", evento: "Petição de Cumprimento Provisório", descricao: "[Ev.1] Protocolo do Cumprimento Provisório de Sentença por dependência ao processo nº 5380169-54.2025.8.09.0051, para execução de honorários advocatícios de sucumbência no valor de R$ 41.049,00.", numero_evento: "1" }
  ]
};

async function run() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  try {
    // 1. Criar cliente Leonardo
    const [existingClient] = await conn.execute(
      'SELECT id FROM clientes WHERE cpfCnpj = ?', [PRINCIPAL.cliente.cpfCnpj]
    );
    
    let clienteId;
    if (existingClient.length > 0) {
      clienteId = existingClient[0].id;
      console.log(`Cliente Leonardo já existe (ID: ${clienteId})`);
    } else {
      const c = PRINCIPAL.cliente;
      const [result] = await conn.execute(
        `INSERT INTO clientes (cpfCnpj, nomeCompleto, tipoPessoa, rg, profissao, cargo, orgaoEmpregador, vinculoFuncional, endereco, cidade, estado, cep, nacionalidade) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [c.cpfCnpj, c.nomeCompleto, c.tipoPessoa, c.rg, c.profissao, c.cargo, c.orgaoEmpregador, c.vinculoFuncional, c.endereco, c.cidade, c.estado, c.cep, c.nacionalidade]
      );
      clienteId = result.insertId;
      console.log(`Cliente Leonardo criado (ID: ${clienteId})`);
    }

    // 2. Upload PDFs para S3
    const principalBuf = fs.readFileSync('/home/ubuntu/upload/PROCESSOPRINCIPALLEONARDOCORREA.pdf');
    const cumprimentoBuf = fs.readFileSync('/home/ubuntu/upload/CUMPRIMENTODESENTENÇALEONARDOCOMPLETO.pdf');
    
    const folder = `LEONARDO_ROSA_CORREIA_${PRINCIPAL.cliente.cpfCnpj}`;
    
    const { key: keyPrincipal, url: urlPrincipal } = await storagePut(
      `${folder}/processos_pdf/PROCESSOPRINCIPALLEONARDOCORREA.pdf`, principalBuf, 'application/pdf'
    );
    console.log('PDF principal uploaded:', urlPrincipal.substring(0, 80) + '...');
    
    const { key: keyCumprimento, url: urlCumprimento } = await storagePut(
      `${folder}/processos_pdf/CUMPRIMENTODESENTENCALEONARDOCOMPLETO.pdf`, cumprimentoBuf, 'application/pdf'
    );
    console.log('PDF cumprimento uploaded:', urlCumprimento.substring(0, 80) + '...');

    // 3. Texto extraído
    const textoPrincipal = fs.readFileSync('/home/ubuntu/leonardo_principal.txt', 'utf-8');
    const textoCumprimento = fs.readFileSync('/home/ubuntu/leonardo_cumprimento.txt', 'utf-8');

    // 4. Inserir processo PRINCIPAL
    const p = PRINCIPAL.processo;
    const [existingPrincipal] = await conn.execute('SELECT id FROM processos WHERE numeroCnj = ?', [p.numeroCnj]);
    let principalId;
    
    if (existingPrincipal.length > 0) {
      principalId = existingPrincipal[0].id;
      console.log(`Processo principal já existe (ID: ${principalId})`);
    } else {
      const [resPrincipal] = await conn.execute(
        `INSERT INTO processos (clienteId, numeroCnj, tribunal, comarca, vara, tipoAcao, natureza, classeProcessual, assunto, faseAtual, statusProcesso, valorCausa, dataDistribuicao, prioridade, segredoJustica, poloAtivo, poloPassivo, advogadoAutor, pdfStorageKey, pdfUrl, textoExtraido) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [clienteId, p.numeroCnj, p.tribunal, p.comarca, p.vara, p.tipoAcao, p.natureza, p.classeProcessual, p.assunto, p.faseAtual, p.statusProcesso, p.valorCausa, p.dataDistribuicao, p.prioridade, p.segredoJustica, p.poloAtivo, p.poloPassivo, p.advogadoAutor, keyPrincipal, urlPrincipal, textoPrincipal.substring(0, 60000)]
      );
      principalId = resPrincipal.insertId;
      console.log(`Processo PRINCIPAL inserido (ID: ${principalId})`);
    }

    // 5. Inserir processo CUMPRIMENTO (vinculado ao principal)
    const cp = CUMPRIMENTO.processo;
    const [existingCumprimento] = await conn.execute('SELECT id FROM processos WHERE numeroCnj = ?', [cp.numeroCnj]);
    let cumprimentoId;
    
    if (existingCumprimento.length > 0) {
      cumprimentoId = existingCumprimento[0].id;
      console.log(`Processo cumprimento já existe (ID: ${cumprimentoId})`);
    } else {
      const [resCumprimento] = await conn.execute(
        `INSERT INTO processos (clienteId, numeroCnj, tribunal, comarca, vara, tipoAcao, natureza, classeProcessual, assunto, faseAtual, statusProcesso, valorCausa, dataDistribuicao, prioridade, segredoJustica, poloAtivo, poloPassivo, advogadoAutor, processoOrigemId, tipoVinculo, pdfStorageKey, pdfUrl, textoExtraido) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [clienteId, cp.numeroCnj, cp.tribunal, cp.comarca, cp.vara, cp.tipoAcao, cp.natureza, cp.classeProcessual, cp.assunto, cp.faseAtual, cp.statusProcesso, cp.valorCausa, cp.dataDistribuicao, cp.prioridade, cp.segredoJustica, cp.poloAtivo, cp.poloPassivo, cp.advogadoAutor, principalId, cp.tipoVinculo, keyCumprimento, urlCumprimento, textoCumprimento.substring(0, 60000)]
      );
      cumprimentoId = resCumprimento.insertId;
      console.log(`Processo CUMPRIMENTO inserido (ID: ${cumprimentoId}) - VINCULADO ao principal (ID: ${principalId})`);
    }

    // 6. Inserir dados financeiros
    const fin = PRINCIPAL.financeiro;
    await conn.execute(
      `INSERT INTO dados_financeiros (clienteId, margemConsignavelValor, totalConsignacoes, valorExcedente, margemExcedida, fonteRenda) VALUES (?, ?, ?, ?, ?, ?)`,
      [clienteId, fin.margemConsignavelValor, fin.totalConsignacoes, fin.valorExcedente, fin.margemExcedida, fin.fonteRenda]
    );
    console.log('Dados financeiros inseridos');

    // 7. Inserir empréstimos
    for (const emp of PRINCIPAL.emprestimos) {
      await conn.execute(
        `INSERT INTO emprestimos_consignados (clienteId, banco) VALUES (?, ?)`,
        [clienteId, emp.banco]
      );
    }
    console.log(`${PRINCIPAL.emprestimos.length} empréstimos inseridos`);

    // 8. Inserir estratégias para ambos os processos
    for (const [procId, est] of [[principalId, PRINCIPAL.estrategia], [cumprimentoId, CUMPRIMENTO.estrategia]]) {
      await conn.execute(
        `INSERT INTO estrategias (processoId, tesePrincipal, fundamentacaoLegal, jurisprudenciaCitada, pontosFortes, riscosIdentificados) VALUES (?, ?, ?, ?, ?, ?)`,
        [procId, est.tesePrincipal, est.fundamentacaoLegal, est.jurisprudenciaCitada, est.pontosFortes, est.riscosIdentificados]
      );
    }
    console.log('Estratégias inseridas para ambos os processos');

    // 9. Inserir partes passivas para ambos os processos
    for (const procId of [principalId, cumprimentoId]) {
      for (const parte of PRINCIPAL.partesPassivas) {
        await conn.execute(
          `INSERT INTO partes_processuais (processoId, nome, cpfCnpj, tipo, categoria) VALUES (?, ?, ?, 'Reu', ?)`,
          [procId, parte.nome, parte.cpfCnpj, parte.categoria]
        );
      }
    }
    console.log('Partes processuais inseridas para ambos os processos');

    // 10. Inserir movimentações
    for (const mov of PRINCIPAL.movimentacoes) {
      await conn.execute(
        `INSERT INTO movimentacoes (processoId, dataMovimentacao, evento, descricao) VALUES (?, ?, ?, ?)`,
        [principalId, mov.data, mov.evento, mov.descricao]
      );
    }
    for (const mov of CUMPRIMENTO.movimentacoes) {
      await conn.execute(
        `INSERT INTO movimentacoes (processoId, dataMovimentacao, evento, descricao) VALUES (?, ?, ?, ?)`,
        [cumprimentoId, mov.data, mov.evento, mov.descricao]
      );
    }
    console.log('Movimentações inseridas para ambos os processos');

    // 11. Inserir documentos
    await conn.execute(
      `INSERT INTO documentos (processoId, tipoDocumento, nomeArquivo, storageKey, url, tamanhoBytes) VALUES (?, ?, ?, ?, ?, ?)`,
      [principalId, 'Processo Completo', 'PROCESSOPRINCIPALLEONARDOCORREA.pdf', keyPrincipal, urlPrincipal, principalBuf.length]
    );
    await conn.execute(
      `INSERT INTO documentos (processoId, tipoDocumento, nomeArquivo, storageKey, url, tamanhoBytes) VALUES (?, ?, ?, ?, ?, ?)`,
      [cumprimentoId, 'Cumprimento de Sentença', 'CUMPRIMENTODESENTENCALEONARDOCOMPLETO.pdf', keyCumprimento, urlCumprimento, cumprimentoBuf.length]
    );
    console.log('Documentos inseridos para ambos os processos');

    // 12. Inserir conhecimentos jurídicos
    const conhecimentos = [
      { tipo: 'Tese', titulo: 'Readequação de Empréstimos Consignados - Limite 35%', conteudo: PRINCIPAL.estrategia.tesePrincipal, fonte: `Processo ${PRINCIPAL.processo.numeroCnj}`, processoId: principalId },
      { tipo: 'Jurisprudência', titulo: 'TJ-GO - Apelação Cível 5407476-85.2022.8.09.0051', conteudo: PRINCIPAL.estrategia.jurisprudenciaCitada, fonte: 'TJ-GO 4ª Câmara Cível', processoId: principalId },
      { tipo: 'Legislação', titulo: 'Lei Estadual 16.898/2010 e alterações', conteudo: 'Art. 5º da Lei Estadual 16.898/2010 (alterada pelas Leis Estaduais 21.063/2021 e 21.665/22) - Limite de 35% para empréstimos consignados sobre proventos líquidos.', fonte: 'Legislação Estadual GO', processoId: principalId },
      { tipo: 'Tese', titulo: 'Cumprimento Provisório de Sentença - Honorários de Sucumbência', conteudo: CUMPRIMENTO.estrategia.tesePrincipal, fonte: `Processo ${CUMPRIMENTO.processo.numeroCnj}`, processoId: cumprimentoId },
      { tipo: 'Legislação', titulo: 'Lei Estadual 22.615/2024 - Custas ao final para advogados OAB/GO', conteudo: 'Art. 114, § 12 da Lei Estadual nº 11.651/1991 (alterada pela Lei nº 22.615/2024) - Nas ações ajuizadas por advogados da OAB/GO visando honorários, custas processuais recolhidas ao final pela parte vencida.', fonte: 'Legislação Estadual GO', processoId: cumprimentoId },
    ];
    
    for (const c of conhecimentos) {
      await conn.execute(
        `INSERT INTO conhecimentos (tipo, titulo, conteudo, fonte, processoId) VALUES (?, ?, ?, ?, ?)`,
        [c.tipo, c.titulo, c.conteudo, c.fonte, c.processoId]
      );
    }
    console.log(`${conhecimentos.length} conhecimentos jurídicos inseridos`);

    console.log('\n=== RESUMO DA IMPORTAÇÃO ===');
    console.log(`Cliente: LEONARDO ROSA CORREIA (ID: ${clienteId})`);
    console.log(`Processo Principal: ${PRINCIPAL.processo.numeroCnj} (ID: ${principalId})`);
    console.log(`Cumprimento Provisório: ${CUMPRIMENTO.processo.numeroCnj} (ID: ${cumprimentoId})`);
    console.log(`Vinculação: Cumprimento (ID: ${cumprimentoId}) → Principal (ID: ${principalId})`);
    console.log('=== IMPORTAÇÃO COMPLETA ===');
    
  } finally {
    await conn.end();
  }
}

run().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
