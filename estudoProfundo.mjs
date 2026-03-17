/**
 * ESTUDO PROFUNDO DE TODOS OS PROCESSOS
 * 
 * Este script:
 * 1. Consulta cada processo no DataJud para completar movimentações
 * 2. Corrige partes invertidas (banco no polo ativo quando deveria ser passivo)
 * 3. Remove clientes que são bancos e vincula ao cliente correto
 * 4. Gera análise profunda via LLM de cada processo
 * 5. Armazena análise no banco de CONHECIMENTOS e nas HABILIDADES do agente
 */

import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;
const FORGE_API_URL = process.env.BUILT_IN_FORGE_API_URL;
const FORGE_API_KEY = process.env.BUILT_IN_FORGE_API_KEY;
const DATAJUD_API = 'https://api-publica.datajud.cnj.jus.br/api_publica_tjgo/_search';
const DATAJUD_KEY = 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RZ0NhVlpFSQ==';

const BANCOS = ['BANCO', 'BRADESCO', 'ITAU', 'ITAÚ', 'CAIXA ECON', 'BMG', 'SANTANDER', 'SAFRA', 'PAN', 'VOTORANTIM', 'DAYCOVAL', 'BANCO DO BRASIL', 'BANCOOB', 'SICOOB', 'SICREDI', 'NUBANK', 'INTER', 'C6 BANK', 'ORIGINAL', 'BRB', 'BANRISUL', 'CETELEM', 'OLÉ CONSIGNADO', 'AGIBANK'];

let conn;
let totalCorrecoes = 0;
let totalAnalises = 0;
let totalMovimentacoes = 0;
let erros = [];

async function invokeLLM(messages) {
  try {
    const resp = await fetch(`${FORGE_API_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FORGE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'default',
        messages,
        max_tokens: 4000,
      }),
    });
    if (!resp.ok) {
      console.error(`LLM error: ${resp.status}`);
      return null;
    }
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (e) {
    console.error('LLM call failed:', e.message);
    return null;
  }
}

async function consultarDataJud(numeroCnj) {
  if (!numeroCnj || numeroCnj.startsWith('SEM_')) return null;
  const numLimpo = numeroCnj.replace(/[^0-9]/g, '');
  try {
    const resp = await fetch(DATAJUD_API, {
      method: 'POST',
      headers: { 'Authorization': `APIKey ${DATAJUD_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: { match: { numeroProcesso: numLimpo } }, size: 1 }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const hits = data?.hits?.hits || [];
    if (hits.length === 0) return null;
    return hits[0]._source;
  } catch (e) {
    return null;
  }
}

function ehBanco(nome) {
  if (!nome) return false;
  const upper = nome.toUpperCase();
  return BANCOS.some(b => upper.includes(b));
}

// ========== FASE 1: CORRIGIR CLIENTES QUE SÃO BANCOS ==========
async function corrigirClientesBancos() {
  console.log('\n========== FASE 1: CORRIGIR CLIENTES QUE SÃO BANCOS ==========');
  const [clientesBancos] = await conn.query(
    `SELECT id, nomeCompleto FROM clientes WHERE ${BANCOS.map(() => 'nomeCompleto LIKE ?').join(' OR ')}`,
    BANCOS.map(b => `%${b}%`)
  );
  
  for (const cb of clientesBancos) {
    console.log(`  ⚠️  Cliente banco encontrado: ${cb.nomeCompleto} (ID: ${cb.id})`);
    
    // Verificar processos vinculados
    const [procs] = await conn.query('SELECT id, numeroCnj, poloAtivo, poloPassivo FROM processos WHERE clienteId = ?', [cb.id]);
    
    if (procs.length === 0) {
      // Sem processos - remover
      await conn.query('DELETE FROM dados_financeiros WHERE clienteId = ?', [cb.id]);
      await conn.query('DELETE FROM emprestimos_consignados WHERE clienteId = ?', [cb.id]);
      await conn.query('DELETE FROM clientes WHERE id = ?', [cb.id]);
      console.log(`    ✅ Cliente banco ${cb.nomeCompleto} removido (sem processos)`);
      totalCorrecoes++;
    } else {
      // Tem processos - precisa encontrar o cliente real
      for (const proc of procs) {
        const clienteReal = ehBanco(proc.poloAtivo) ? proc.poloPassivo : proc.poloAtivo;
        console.log(`    📋 Processo ${proc.numeroCnj}: cliente real = ${clienteReal}`);
        
        // Buscar se já existe cliente com esse nome
        const [existente] = await conn.query('SELECT id FROM clientes WHERE nomeCompleto = ? AND id != ?', [clienteReal, cb.id]);
        
        if (existente.length > 0) {
          // Transferir processo para o cliente existente
          await conn.query('UPDATE processos SET clienteId = ? WHERE id = ?', [existente[0].id, proc.id]);
          console.log(`    ✅ Processo transferido para cliente existente ID ${existente[0].id}`);
        } else {
          // Renomear o cliente banco para o nome correto
          await conn.query('UPDATE clientes SET nomeCompleto = ? WHERE id = ?', [clienteReal, cb.id]);
          console.log(`    ✅ Cliente renomeado de "${cb.nomeCompleto}" para "${clienteReal}"`);
        }
        totalCorrecoes++;
      }
    }
  }
}

// ========== FASE 2: CORRIGIR POLOS INVERTIDOS ==========
async function corrigirPolosInvertidos() {
  console.log('\n========== FASE 2: CORRIGIR POLOS INVERTIDOS ==========');
  const [processosPoloErrado] = await conn.query(
    `SELECT p.id, p.numeroCnj, p.poloAtivo, p.poloPassivo, p.tipoAcao, c.nomeCompleto as clienteNome 
     FROM processos p LEFT JOIN clientes c ON p.clienteId = c.id`
  );
  
  for (const proc of processosPoloErrado) {
    // Se o polo ativo é banco e o tipo de ação indica que o cliente deveria ser autor
    const ativoEhBanco = ehBanco(proc.poloAtivo);
    const passivoEhBanco = ehBanco(proc.poloPassivo);
    
    // Verificar se o cliente do escritório está no polo correto
    if (proc.clienteNome && !ehBanco(proc.clienteNome)) {
      // O cliente real não é banco
      const clienteNoAtivo = proc.poloAtivo?.toUpperCase().includes(proc.clienteNome?.toUpperCase()?.substring(0, 10));
      const clienteNoPassivo = proc.poloPassivo?.toUpperCase().includes(proc.clienteNome?.toUpperCase()?.substring(0, 10));
      
      // Se o tipo de ação é revisional/obrigação de fazer/consignação e o banco está no polo ativo,
      // provavelmente o cliente deveria ser o autor
      const tiposClienteAutor = ['Revisional', 'Obrigação de Fazer', 'Consignação', 'Declaratória', 'Indenizatória', 'Danos Morais'];
      const tiposClienteReu = ['Execução de Título', 'Cobrança', 'Busca e Apreensão'];
      
      if (ativoEhBanco && !passivoEhBanco) {
        const tipoUpper = (proc.tipoAcao || '').toUpperCase();
        const clienteDeveSerAutor = tiposClienteAutor.some(t => tipoUpper.includes(t.toUpperCase()));
        
        if (clienteDeveSerAutor) {
          // Inverter polos
          await conn.query('UPDATE processos SET poloAtivo = ?, poloPassivo = ? WHERE id = ?', 
            [proc.poloPassivo, proc.poloAtivo, proc.id]);
          console.log(`  ✅ Polos invertidos no processo ${proc.numeroCnj}: ${proc.poloPassivo} → Ativo, ${proc.poloAtivo} → Passivo`);
          totalCorrecoes++;
        }
      }
    }
  }
}

// ========== FASE 3: COMPLETAR MOVIMENTAÇÕES VIA DATAJUD ==========
async function completarMovimentacoes() {
  console.log('\n========== FASE 3: COMPLETAR MOVIMENTAÇÕES VIA DATAJUD ==========');
  const [todosProcessos] = await conn.query(
    'SELECT id, numeroCnj, tipoAcao FROM processos WHERE numeroCnj IS NOT NULL AND numeroCnj NOT LIKE "SEM_%" ORDER BY id'
  );
  
  let consultados = 0;
  for (const proc of todosProcessos) {
    consultados++;
    if (consultados % 10 === 0) {
      console.log(`  📊 Progresso: ${consultados}/${todosProcessos.length} processos consultados no DataJud`);
    }
    
    const source = await consultarDataJud(proc.numeroCnj);
    if (!source) continue;
    
    const movsDataJud = source.movimentos || [];
    if (movsDataJud.length === 0) continue;
    
    // Buscar movimentações existentes
    const [movsExistentes] = await conn.query('SELECT data, descricao FROM movimentacoes WHERE processoId = ?', [proc.id]);
    const eventosExistentes = new Set(movsExistentes.map(m => `${m.data}_${(m.descricao || '').substring(0, 50)}`));
    
    let novas = 0;
    for (const mov of movsDataJud.slice(0, 30)) {
      const dataStr = mov.dataHora?.split('T')[0] || new Date().toISOString().split('T')[0];
      const desc = mov.nome || mov.complementosTabelados?.map(c => c.descricao).join(', ') || 'Movimentação';
      const chave = `${dataStr}_${desc.substring(0, 50)}`;
      if (!eventosExistentes.has(chave)) {
        await conn.query(
          'INSERT INTO movimentacoes (processoId, data, evento, descricao) VALUES (?, ?, ?, ?)',
          [proc.id, dataStr, `DataJud-${mov.codigo || 'auto'}`, desc]
        );
        novas++;
        totalMovimentacoes++;
      }
    }
    
    // Atualizar dados do processo com info do DataJud
    const updates = {};
    if (source.classe?.nome && (!proc.tipoAcao || proc.tipoAcao === 'Não identificado')) {
      updates.tipoAcao = source.classe.nome;
    }
    if (source.orgaoJulgador?.nome) {
      updates.vara = source.orgaoJulgador.nome;
    }
    if (source.dataAjuizamento) {
      updates.dataDistribuicao = source.dataAjuizamento.split('T')[0];
    }
    
    if (Object.keys(updates).length > 0) {
      const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      await conn.query(`UPDATE processos SET ${setClauses} WHERE id = ?`, [...Object.values(updates), proc.id]);
    }
    
    if (novas > 0) {
      console.log(`  ✅ ${proc.numeroCnj}: +${novas} movimentações novas`);
    }
    
    // Rate limit para DataJud
    await new Promise(r => setTimeout(r, 500));
  }
}

// ========== FASE 4: ANÁLISE PROFUNDA DE CADA PROCESSO ==========
async function analiseProfunda() {
  console.log('\n========== FASE 4: ANÁLISE PROFUNDA DE CADA PROCESSO ==========');
  const [todosProcessos] = await conn.query(`
    SELECT p.*, c.nomeCompleto as clienteNome, c.cpfCnpj, c.profissao, c.orgaoEmpregador
    FROM processos p 
    LEFT JOIN clientes c ON p.clienteId = c.id 
    ORDER BY p.id
  `);
  
  let analisados = 0;
  let todasAnalises = []; // Para consolidar nas habilidades do agente
  
  for (const proc of todosProcessos) {
    analisados++;
    console.log(`\n  📋 [${analisados}/${todosProcessos.length}] Analisando: ${proc.numeroCnj} — ${proc.tipoAcao}`);
    console.log(`     Cliente: ${proc.clienteNome || 'N/A'}`);
    
    // Buscar dados complementares
    const [movs] = await conn.query('SELECT data, evento, descricao FROM movimentacoes WHERE processoId = ? ORDER BY data DESC LIMIT 20', [proc.id]);
    const [estrats] = await conn.query('SELECT tesePrincipal, fundamentacaoLegal, jurisprudenciaCitada, pontosFortes, riscosIdentificados FROM estrategias WHERE processoId = ?', [proc.id]);
    const [partes] = await conn.query('SELECT tipo, nome, cpfCnpj, categoria FROM partes_processuais WHERE processoId = ?', [proc.id]);
    const [emprestimos] = await conn.query('SELECT banco, valorParcela, totalParcelas, valorTotal, contrato FROM emprestimos_consignados WHERE clienteId = ?', [proc.clienteId || 0]);
    const [dadosFin] = await conn.query('SELECT remuneracaoBruta, remuneracaoLiquida, margemConsignavelValor, margemConsignavelPerc FROM dados_financeiros WHERE clienteId = ?', [proc.clienteId || 0]);
    const [cumprimentos] = await conn.query('SELECT tipo, valorExecucao, valorPrincipal, valorJuros, valorHonorarios FROM cumprimentos_sentenca WHERE processoId = ?', [proc.id]);
    
    const contexto = `
PROCESSO: ${proc.numeroCnj}
TIPO: ${proc.tipoAcao} | CLASSE: ${proc.classeProcessual || 'N/A'}
POLO ATIVO: ${proc.poloAtivo} | POLO PASSIVO: ${proc.poloPassivo}
VARA: ${proc.vara || 'N/A'} | COMARCA: ${proc.comarca || 'N/A'} | TRIBUNAL: ${proc.tribunal || 'N/A'}
JUIZ: ${proc.juiz || 'N/A'}
VALOR DA CAUSA: R$ ${proc.valorCausa || 'N/A'}
FASE: ${proc.faseAtual || 'N/A'} | STATUS: ${proc.statusProcesso || 'N/A'}
SENTENÇA: ${proc.resumoSentenca || 'N/A'}
CONDENAÇÃO: R$ ${proc.valorCondenacao || 'N/A'} | DANOS MORAIS: R$ ${proc.danosMorais || 'N/A'}
HONORÁRIOS: ${proc.honorariosPerc || 'N/A'}% = R$ ${proc.honorariosValor || 'N/A'}
TUTELA: ${proc.tutelaTipo || 'N/A'} (${proc.tutelaStatus || 'N/A'})

CLIENTE: ${proc.clienteNome || 'N/A'} | CPF: ${proc.cpfCnpj || 'N/A'}
PROFISSÃO: ${proc.profissao || 'N/A'} | ÓRGÃO: ${proc.orgaoEmpregador || 'N/A'}

PARTES PROCESSUAIS: ${partes.map(p => `${p.tipo}: ${p.nome} (${p.cpfCnpj || 'N/A'}) Cat: ${p.categoria || 'N/A'}`).join('; ') || 'N/A'}

EMPRÉSTIMOS CONSIGNADOS (${emprestimos.length}):
${emprestimos.map(e => `- ${e.banco}: R$ ${e.valorParcela}/mês, ${e.totalParcelas || '?'} parcelas, Total: R$ ${e.valorTotal || 'N/A'}, Contrato: ${e.contrato || 'N/A'}`).join('\n') || 'Nenhum'}

DADOS FINANCEIROS:
${dadosFin.map(d => `- Bruto: R$ ${d.remuneracaoBruta || 'N/A'} | Líquido: R$ ${d.remuneracaoLiquida || 'N/A'} | Margem: R$ ${d.margemConsignavelValor || 'N/A'} (${d.margemConsignavelPerc || 'N/A'}%)`).join('\n') || 'N/A'}

CUMPRIMENTOS DE SENTENÇA:
${cumprimentos.map(c => `- ${c.tipo}: Execução R$ ${c.valorExecucao}, Principal R$ ${c.valorPrincipal}, Juros R$ ${c.valorJuros}, Honorários R$ ${c.valorHonorarios}`).join('\n') || 'Nenhum'}

ESTRATÉGIAS EXISTENTES:
${estrats.map(e => `- Tese: ${e.tesePrincipal}\n  Fund: ${e.fundamentacaoLegal || 'N/A'}\n  Jurisp: ${e.jurisprudenciaCitada || 'N/A'}\n  Fortes: ${e.pontosFortes || 'N/A'}\n  Riscos: ${e.riscosIdentificados || 'N/A'}`).join('\n') || 'Nenhuma'}

ÚLTIMAS MOVIMENTAÇÕES:
${movs.map(m => `- ${m.data}: ${m.evento} — ${m.descricao || ''}`).join('\n') || 'Nenhuma'}

TEXTO EXTRAÍDO DO PROCESSO (primeiros 3000 chars):
${(proc.textoExtraido || '').substring(0, 3000) || 'Não disponível'}`;

    const prompt = `Você é o Agente Jurídico Expert do escritório Melo & Preda Advogados (Dr. Paulo da Silva Melo Filho, OAB/GO 40.559).

ANALISE PROFUNDAMENTE o processo abaixo e retorne um JSON com a seguinte estrutura:

{
  "resumoExecutivo": "Resumo completo do caso em 3-5 parágrafos",
  "clienteIdentificado": "Nome do cliente real (a parte representada pelo Dr. Paulo Melo, NUNCA o banco)",
  "parteContraria": "Nome da parte contrária",
  "tipoAcaoCorrigido": "Tipo correto da ação se o atual estiver errado, ou null",
  "faseCorrigida": "Fase correta se a atual estiver errada, ou null",
  "statusCorrigido": "Status correto se o atual estiver errado, ou null",
  "tesePrincipal": "Tese jurídica principal do caso",
  "tesasSecundarias": ["Lista de teses secundárias aplicáveis"],
  "fundamentacaoLegal": "Artigos de lei, CDC, CC, CPC aplicáveis",
  "jurisprudenciaRelevante": "Jurisprudência TJ-GO e STJ relevante",
  "pontosFortes": "Pontos fortes do caso para o cliente",
  "pontosFracos": "Pontos fracos e riscos identificados",
  "proximosPassos": "Próximos passos processuais recomendados",
  "estrategiaRecomendada": "Estratégia processual detalhada",
  "valorEstimadoExito": "Estimativa de valor em caso de êxito",
  "probabilidadeExito": "Alta/Média/Baixa com justificativa",
  "observacoesCorrecao": "Dados incorretos que precisam ser corrigidos no cadastro"
}

DADOS DO PROCESSO:
${contexto}

IMPORTANTE:
- O cliente do escritório é SEMPRE a pessoa física/jurídica representada pelo Dr. Paulo Melo, NUNCA o banco
- Identifique corretamente quem é o cliente e quem é a parte contrária
- Se houver dados incorretos, indique nas observações
- Fundamente com artigos de lei específicos
- Cite jurisprudência real do TJ-GO e STJ`;

    const analise = await invokeLLM([
      { role: 'system', content: 'Você é um advogado expert. Responda APENAS em JSON válido, sem markdown.' },
      { role: 'user', content: prompt }
    ]);
    
    if (!analise) {
      console.log(`     ❌ Falha na análise LLM`);
      erros.push(`Processo ${proc.numeroCnj}: Falha na análise LLM`);
      continue;
    }
    
    let parsed;
    try {
      // Limpar possíveis marcadores de código
      let clean = analise.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(clean);
    } catch (e) {
      console.log(`     ❌ Erro ao parsear JSON da análise`);
      erros.push(`Processo ${proc.numeroCnj}: JSON inválido`);
      continue;
    }
    
    // ---- SALVAR NO BANCO DE CONHECIMENTOS ----
    try {
    const tituloConhec = `Análise Profunda — ${proc.numeroCnj} — ${proc.clienteNome || 'Cliente'} — ${proc.tipoAcao}`.substring(0, 490);
    const conteudoConhec = `RESUMO EXECUTIVO:\n${parsed.resumoExecutivo || 'N/A'}\n\nTESE PRINCIPAL:\n${parsed.tesePrincipal || 'N/A'}\n\nTESES SECUNDÁRIAS:\n${(parsed.tesasSecundarias || []).join('\n')}\n\nFUNDAMENTAÇÃO LEGAL:\n${parsed.fundamentacaoLegal || 'N/A'}\n\nJURISPRUDÊNCIA:\n${parsed.jurisprudenciaRelevante || 'N/A'}\n\nPONTOS FORTES:\n${parsed.pontosFortes || 'N/A'}\n\nPONTOS FRACOS:\n${parsed.pontosFracos || 'N/A'}\n\nESTRATÉGIA RECOMENDADA:\n${parsed.estrategiaRecomendada || 'N/A'}\n\nPRÓXIMOS PASSOS:\n${parsed.proximosPassos || 'N/A'}\n\nPROBABILIDADE DE ÊXITO: ${parsed.probabilidadeExito || 'N/A'}\nVALOR ESTIMADO: ${parsed.valorEstimadoExito || 'N/A'}`;
    
    // Verificar se já existe conhecimento para este processo
    const [existeConhec] = await conn.query('SELECT id FROM conhecimentos WHERE processoOrigemId = ? AND categoria = "Estrategia"', [proc.id]);
    
    if (existeConhec.length > 0) {
      await conn.query('UPDATE conhecimentos SET titulo = ?, conteudo = ?, tags = ? WHERE id = ?', 
        [tituloConhec, conteudoConhec, `analise_profunda,${proc.tipoAcao},${proc.clienteNome}`, existeConhec[0].id]);
    } else {
      await conn.query(
        'INSERT INTO conhecimentos (categoria, titulo, conteudo, tribunal, tipoAcao, tags, processoOrigemId) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['Estrategia', tituloConhec, conteudoConhec, proc.tribunal || 'TJ-GO', proc.tipoAcao, `analise_profunda,${proc.tipoAcao},${proc.clienteNome}`, proc.id]
      );
    }
    
    // ---- SALVAR TESE NO CONHECIMENTO ----
    if (parsed.tesePrincipal) {
      const [existeTese] = await conn.query('SELECT id FROM conhecimentos WHERE processoOrigemId = ? AND categoria = "Tese"', [proc.id]);
      if (existeTese.length === 0) {
        await conn.query(
          'INSERT INTO conhecimentos (categoria, titulo, conteudo, tribunal, tipoAcao, tags, processoOrigemId) VALUES (?, ?, ?, ?, ?, ?, ?)',
          ['Tese', `Tese: ${parsed.tesePrincipal.substring(0, 200)}`, 
           `${parsed.tesePrincipal}\n\nFundamentação: ${parsed.fundamentacaoLegal || 'N/A'}\n\nJurisprudência: ${parsed.jurisprudenciaRelevante || 'N/A'}`,
           proc.tribunal || 'TJ-GO', proc.tipoAcao, `tese,${proc.tipoAcao}`, proc.id]
        );
      }
    }
    
    // ---- SALVAR JURISPRUDÊNCIA NO CONHECIMENTO ----
    if (parsed.jurisprudenciaRelevante && parsed.jurisprudenciaRelevante.length > 20) {
      const [existeJurisp] = await conn.query('SELECT id FROM conhecimentos WHERE processoOrigemId = ? AND categoria = "Jurisprudencia"', [proc.id]);
      if (existeJurisp.length === 0) {
        await conn.query(
          'INSERT INTO conhecimentos (categoria, titulo, conteudo, tribunal, tipoAcao, tags, processoOrigemId) VALUES (?, ?, ?, ?, ?, ?, ?)',
          ['Jurisprudencia', `Jurisprudência — ${proc.tipoAcao} — ${proc.numeroCnj}`, 
           parsed.jurisprudenciaRelevante,
           proc.tribunal || 'TJ-GO', proc.tipoAcao, `jurisprudencia,${proc.tipoAcao}`, proc.id]
        );
      }
    }
    
    } catch (saveErr) {
      console.log(`     ⚠️ Erro ao salvar conhecimentos: ${saveErr.message?.substring(0, 100)}`);
    }

    // ---- APLICAR CORREÇÕES NO PROCESSO ----
    try {
      const updateFields = {};
      if (parsed.tipoAcaoCorrigido && typeof parsed.tipoAcaoCorrigido === 'string' && parsed.tipoAcaoCorrigido.length < 200) {
        updateFields.tipoAcao = parsed.tipoAcaoCorrigido.substring(0, 200);
      }
      if (parsed.faseCorrigida && typeof parsed.faseCorrigida === 'string' && parsed.faseCorrigida.length < 200) {
        updateFields.faseAtual = parsed.faseCorrigida.substring(0, 200);
      }
      if (parsed.statusCorrigido && typeof parsed.statusCorrigido === 'string' && parsed.statusCorrigido.length < 200) {
        updateFields.statusProcesso = parsed.statusCorrigido.substring(0, 200);
      }
      
      if (Object.keys(updateFields).length > 0) {
        const setClauses = Object.keys(updateFields).map(k => `${k} = ?`).join(', ');
        await conn.query(`UPDATE processos SET ${setClauses} WHERE id = ?`, [...Object.values(updateFields), proc.id]);
        console.log(`     🔧 Correções aplicadas: ${Object.keys(updateFields).join(', ')}`);
        totalCorrecoes++;
      }
    } catch (updateErr) {
      console.log(`     ⚠️ Erro ao aplicar correções: ${updateErr.message?.substring(0, 100)}`);
    }
    
    // Guardar para consolidação nas habilidades
    todasAnalises.push({
      processo: proc.numeroCnj,
      cliente: proc.clienteNome,
      tipo: proc.tipoAcao,
      tese: parsed.tesePrincipal,
      estrategia: parsed.estrategiaRecomendada,
      probabilidade: parsed.probabilidadeExito,
    });
    
    totalAnalises++;
    console.log(`     ✅ Análise profunda salva no banco de conhecimentos`);
    
    // Rate limit para LLM
    await new Promise(r => setTimeout(r, 1000));
  }
  
  // ========== CONSOLIDAR NAS HABILIDADES DO AGENTE ==========
  console.log('\n========== FASE 5: CONSOLIDAR NAS HABILIDADES DO AGENTE ==========');
  
  const consolidacao = todasAnalises.map(a => 
    `• ${a.processo} (${a.cliente}): ${a.tipo}\n  Tese: ${a.tese || 'N/A'}\n  Estratégia: ${(a.estrategia || 'N/A').substring(0, 200)}\n  Probabilidade: ${a.probabilidade || 'N/A'}`
  ).join('\n\n');
  
  // Salvar nas habilidades do agente (agenteIaConfig)
  const chaveEstudo = 'estudo_profundo_processos';
  const valorEstudo = `ESTUDO PROFUNDO REALIZADO EM ${new Date().toISOString().split('T')[0]}\n\n${todasAnalises.length} processos analisados:\n\n${consolidacao}`;
  
  const [existeConfig] = await conn.query('SELECT id FROM agente_ia_config WHERE chave = ?', [chaveEstudo]);
  if (existeConfig.length > 0) {
    await conn.query('UPDATE agente_ia_config SET valor = ?, updatedAt = NOW() WHERE chave = ?', [valorEstudo, chaveEstudo]);
  } else {
    await conn.query(
      'INSERT INTO agente_ia_config (chave, valor, categoria, descricao) VALUES (?, ?, ?, ?)',
      [chaveEstudo, valorEstudo, 'expertise', 'Estudo profundo de todos os processos do escritório com análise detalhada de cada caso']
    );
  }
  
  // Salvar mapa de teses nas habilidades
  const tesesMapa = todasAnalises.filter(a => a.tese).map(a => `• ${a.tipo}: ${a.tese}`).join('\n');
  const [existeTeses] = await conn.query('SELECT id FROM agente_ia_config WHERE chave = ?', ['mapa_teses_processos']);
  if (existeTeses.length > 0) {
    await conn.query('UPDATE agente_ia_config SET valor = ?, updatedAt = NOW() WHERE chave = ?', [tesesMapa, 'mapa_teses_processos']);
  } else {
    await conn.query(
      'INSERT INTO agente_ia_config (chave, valor, categoria, descricao) VALUES (?, ?, ?, ?)',
      ['mapa_teses_processos', tesesMapa, 'expertise', 'Mapa de teses jurídicas aplicadas em cada tipo de ação do escritório']
    );
  }
  
  console.log(`  ✅ Habilidades do agente atualizadas com estudo profundo`);
}

// ========== MAIN ==========
async function main() {
  console.log('🚀 INICIANDO ESTUDO PROFUNDO DE TODOS OS PROCESSOS DO ESCRITÓRIO MELO & PREDA');
  console.log(`   Data: ${new Date().toISOString()}`);
  
  conn = await mysql.createConnection(DATABASE_URL);
  
  try {
    await corrigirClientesBancos();
    await corrigirPolosInvertidos();
    await completarMovimentacoes();
    await analiseProfunda();
    
    console.log('\n\n========== RESULTADO FINAL ==========');
    console.log(`✅ Total de correções aplicadas: ${totalCorrecoes}`);
    console.log(`✅ Total de análises profundas: ${totalAnalises}`);
    console.log(`✅ Total de novas movimentações: ${totalMovimentacoes}`);
    console.log(`❌ Erros: ${erros.length}`);
    if (erros.length > 0) {
      console.log('Erros detalhados:');
      erros.forEach(e => console.log(`  - ${e}`));
    }
    console.log('\n🏁 ESTUDO PROFUNDO CONCLUÍDO!');
  } catch (e) {
    console.error('ERRO FATAL:', e);
  } finally {
    await conn.end();
  }
}

main();
