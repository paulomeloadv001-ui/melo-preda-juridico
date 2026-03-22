/**
 * API REST Pública do Agente IA - Melo & Preda Advogados
 * 
 * Endpoints para consumo externo por outras plataformas, agentes e servidores.
 * Autenticação via API Key no header: Authorization: Bearer <JUSCONSIG_API_KEY>
 * 
 * Endpoints:
 * - POST /api/v1/agente/chat          → Chat com o agente IA
 * - POST /api/v1/agente/analise       → Análise técnica aprofundada de processo
 * - POST /api/v1/agente/peticao       → Gerar petição completa
 * - POST /api/v1/agente/peticao-docx  → Gerar petição em DOCX com timbrado
 * - GET  /api/v1/agente/conhecimentos → Buscar base de conhecimentos
 * - GET  /api/v1/agente/estrategias   → Buscar estratégias processuais
 * - GET  /api/v1/agente/templates     → Listar templates de petição
 * - GET  /api/v1/agente/clientes      → Listar clientes
 * - GET  /api/v1/agente/processos     → Listar processos
 * - GET  /api/v1/agente/status        → Status da API e estatísticas
 * - GET  /api/v1/docs                 → Documentação da API
 */

import { Router, Request, Response, NextFunction } from 'express';
import { getDb } from './db';
import {
  clientes, processos, dadosFinanceiros, emprestimosConsignados,
  estrategias, partesProcessuais, movimentacoes, conhecimentos,
  movimentacoesFinanceiras, cumprimentosSentenca,
  templatesPeticao, peticoesGeradas, agenteIaConfig
} from '../drizzle/schema';
import { eq, like, desc, sql } from 'drizzle-orm';
import { invokeLLM } from './_core/llm';
import { storagePut } from './storage';
import { gerarPeticaoDocx } from './docxGenerator';

const apiRouter = Router();

// Middleware de autenticação por API Key
function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const apiKey = process.env.JUSCONSIG_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'API Key não configurada no servidor', code: 'API_KEY_NOT_SET' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header obrigatório: Bearer <API_KEY>', code: 'UNAUTHORIZED' });
  }

  const token = authHeader.replace('Bearer ', '');
  if (token !== apiKey) {
    return res.status(403).json({ error: 'API Key inválida', code: 'FORBIDDEN' });
  }

  next();
}

// Rota pública de download DOCX (sem autenticação por API Key - usa sessão do usuário)
apiRouter.get('/download-docx/:peticaoId', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(503).json({ error: 'Banco de dados indisponível' });

    const peticaoId = parseInt(req.params.peticaoId);
    if (!peticaoId) return res.status(400).json({ error: 'ID da petição é obrigatório' });

    const [pet] = await db.select().from(peticoesGeradas).where(eq(peticoesGeradas.id, peticaoId));
    if (!pet) return res.status(404).json({ error: 'Petição não encontrada' });

    const json = typeof pet.conteudoJson === 'string' ? JSON.parse(pet.conteudoJson as string) : pet.conteudoJson;
    const docxUrl = (json as any)?.docxUrl;
    if (!docxUrl) return res.status(404).json({ error: 'DOCX não disponível para esta petição' });

    // Proxy download do S3
    const response = await fetch(encodeURI(docxUrl));
    if (!response.ok) return res.status(502).json({ error: 'Erro ao baixar DOCX do storage' });

    const buffer = Buffer.from(await response.arrayBuffer());
    const filename = `${(pet.titulo || 'peticao').replace(/[^a-zA-Z0-9\u00C0-\u00FF\s._-]/g, '_')}.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('Content-Length', buffer.length.toString());
    res.send(buffer);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Aplicar autenticação em todas as rotas abaixo
apiRouter.use(authMiddleware);

// ============================================================
// GET /api/v1/docs - Documentação da API
// ============================================================
apiRouter.get('/docs', (_req: Request, res: Response) => {
  res.json({
    titulo: 'API REST - Agente IA Melo & Preda Advogados',
    versao: '1.0.0',
    descricao: 'API para integração com o Agente Jurídico IA do escritório Melo & Preda Advogados. Permite consultas, análises técnicas, geração de petições e acesso à base de conhecimentos jurídicos.',
    autenticacao: {
      tipo: 'Bearer Token',
      header: 'Authorization: Bearer <JUSCONSIG_API_KEY>',
      descricao: 'Todas as requisições devem incluir o header Authorization com o token Bearer.',
    },
    endpoints: [
      {
        metodo: 'POST',
        path: '/api/v1/agente/chat',
        descricao: 'Chat com o agente IA jurídico',
        body: {
          mensagem: 'string (obrigatório) - Pergunta ou instrução',
          clienteId: 'number (opcional) - ID do cliente para contexto',
          processoId: 'number (opcional) - ID do processo para contexto',
          modo: 'string (opcional) - chat | analise | peticao | estrategia | calculo',
          sessaoId: 'string (opcional) - ID da sessão para manter histórico',
        },
        resposta: '{ resposta: string, sessaoId: string, modo: string }',
      },
      {
        metodo: 'POST',
        path: '/api/v1/agente/analise',
        descricao: 'Análise técnica aprofundada de um processo',
        body: {
          processoId: 'number (obrigatório) - ID do processo',
          foco: 'string (opcional) - Foco específico da análise',
        },
        resposta: '{ analise: string, processo: string, tipo: string }',
      },
      {
        metodo: 'POST',
        path: '/api/v1/agente/peticao',
        descricao: 'Gerar petição completa em Markdown',
        body: {
          tipoPeticao: 'string (obrigatório) - Tipo da petição',
          clienteId: 'number (opcional) - ID do cliente',
          processoId: 'number (opcional) - ID do processo',
          templateId: 'number (opcional) - ID do template',
          instrucoes: 'string (opcional) - Instruções adicionais',
        },
        resposta: '{ peticao: string, url: string, docxUrl: string, tipoPeticao: string, cliente: string, processo: string }',
      },
      {
        metodo: 'POST',
        path: '/api/v1/agente/peticao-docx',
        descricao: 'Gerar petição em DOCX com timbrado do escritório',
        body: {
          conteudo: 'string (obrigatório) - Conteúdo da petição em Markdown',
          titulo: 'string (opcional) - Título do documento',
        },
        resposta: '{ docxUrl: string, titulo: string }',
      },
      {
        metodo: 'GET',
        path: '/api/v1/agente/conhecimentos',
        descricao: 'Buscar base de conhecimentos jurídicos',
        query: {
          categoria: 'string (opcional) - Tese | Jurisprudencia | Legislacao | Estrategia | Modelo',
          busca: 'string (opcional) - Termo de busca',
          limit: 'number (opcional, default: 50)',
        },
        resposta: '{ total: number, conhecimentos: [...] }',
      },
      {
        metodo: 'GET',
        path: '/api/v1/agente/estrategias',
        descricao: 'Buscar estratégias processuais',
        query: {
          processoId: 'number (opcional)',
          busca: 'string (opcional)',
          limit: 'number (opcional, default: 50)',
        },
        resposta: '{ total: number, estrategias: [...] }',
      },
      {
        metodo: 'GET',
        path: '/api/v1/agente/templates',
        descricao: 'Listar templates de petição disponíveis',
        resposta: '{ templates: [...] }',
      },
      {
        metodo: 'GET',
        path: '/api/v1/agente/clientes',
        descricao: 'Listar clientes cadastrados',
        query: {
          busca: 'string (opcional) - Busca por nome',
          limit: 'number (opcional, default: 50)',
        },
        resposta: '{ total: number, clientes: [...] }',
      },
      {
        metodo: 'GET',
        path: '/api/v1/agente/processos',
        descricao: 'Listar processos judiciais',
        query: {
          clienteId: 'number (opcional)',
          busca: 'string (opcional) - Busca por CNJ',
          limit: 'number (opcional, default: 50)',
        },
        resposta: '{ total: number, processos: [...] }',
      },
      {
        metodo: 'GET',
        path: '/api/v1/agente/status',
        descricao: 'Status da API e estatísticas do banco',
        resposta: '{ status: string, versao: string, estatisticas: {...} }',
      },
    ],
    exemplos: {
      curl_chat: "curl -X POST https://SEU_DOMINIO/api/v1/agente/chat -H 'Authorization: Bearer SUA_API_KEY' -H 'Content-Type: application/json' -d '{\"mensagem\": \"Quais são as teses centrais do escritório?\"}'",
      curl_peticao: "curl -X POST https://SEU_DOMINIO/api/v1/agente/peticao -H 'Authorization: Bearer SUA_API_KEY' -H 'Content-Type: application/json' -d '{\"tipoPeticao\": \"Ação de Obrigação de Fazer\", \"clienteId\": 1}'",
      curl_conhecimentos: "curl https://SEU_DOMINIO/api/v1/agente/conhecimentos?categoria=Tese -H 'Authorization: Bearer SUA_API_KEY'",
    },
  });
});

// ============================================================
// GET /api/v1/agente/status - Status e estatísticas
// ============================================================
apiRouter.get('/agente/status', async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(503).json({ error: 'Banco de dados indisponível' });

    const [clientesCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(clientes);
    const [processosCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(processos);
    const [conhecimentosCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(conhecimentos);
    const [estrategiasCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(estrategias);
    const [templatesCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(templatesPeticao);
    const [peticoesCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(peticoesGeradas);

    res.json({
      status: 'online',
      versao: '1.0.0',
      escritorio: 'Melo & Preda Advogados',
      advogado: 'PAULO DA SILVA MELO FILHO - OAB/GO 40.559',
      estatisticas: {
        clientes: Number(clientesCount?.count || 0),
        processos: Number(processosCount?.count || 0),
        conhecimentos: Number(conhecimentosCount?.count || 0),
        estrategias: Number(estrategiasCount?.count || 0),
        templates: Number(templatesCount?.count || 0),
        peticoesGeradas: Number(peticoesCount?.count || 0),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// POST /api/v1/agente/chat - Chat com o agente IA
// ============================================================
apiRouter.post('/agente/chat', async (req: Request, res: Response) => {
  try {
    const { mensagem, clienteId, processoId, modo, sessaoId } = req.body;
    if (!mensagem) return res.status(400).json({ error: 'Campo "mensagem" é obrigatório' });

    const db = await getDb();
    if (!db) return res.status(503).json({ error: 'Banco de dados indisponível' });

    // Carregar configurações do agente
    const configRows = await db.select().from(agenteIaConfig).where(eq(agenteIaConfig.ativo, 1));
    const config: Record<string, string> = {};
    for (const row of configRows) config[row.chave] = row.valor;

    // Contexto do cliente
    let contexto = '';
    if (clienteId) {
      const [cliente] = await db.select().from(clientes).where(eq(clientes.id, clienteId));
      if (cliente) {
        const procs = await db.select().from(processos).where(eq(processos.clienteId, cliente.id));
        const emprestimos = await db.select().from(emprestimosConsignados).where(eq(emprestimosConsignados.clienteId, cliente.id));
        const dadosFin = await db.select().from(dadosFinanceiros).where(eq(dadosFinanceiros.clienteId, cliente.id));
        contexto += `\nCLIENTE: ${cliente.nomeCompleto}, CPF: ${cliente.cpfCnpj}\nProfissão: ${cliente.profissao || 'N/A'}\nProcessos: ${procs.map(p => `${p.numeroCnj} (${p.tipoAcao})`).join('; ')}\nEmpréstimos: ${emprestimos.map(e => `${e.banco}: R$ ${e.valorParcela}/mês`).join('; ')}\nFinanceiro: ${dadosFin.map(d => `Bruto: R$ ${d.remuneracaoBruta} | Líquido: R$ ${d.remuneracaoLiquida}`).join('; ')}`;
      }
    }

    if (processoId) {
      const [proc] = await db.select().from(processos).where(eq(processos.id, processoId));
      if (proc) {
        const estrats = await db.select().from(estrategias).where(eq(estrategias.processoId, proc.id));
        const movs = await db.select().from(movimentacoes).where(eq(movimentacoes.processoId, proc.id)).orderBy(desc(movimentacoes.createdAt)).limit(10);
        contexto += `\nPROCESSO: ${proc.numeroCnj}\nTipo: ${proc.tipoAcao} | Vara: ${proc.vara} | Comarca: ${proc.comarca}\nValor: R$ ${proc.valorCausa} | Fase: ${proc.faseAtual} | Status: ${proc.statusProcesso}\nEstratégias: ${estrats.map(e => e.tesePrincipal?.substring(0, 200)).join('\n')}\nMovimentações: ${movs.map(m => `${m.data}: ${m.evento}`).join('\n')}`;
      }
    }

    // Buscar conhecimentos relevantes
    const todosConhecimentos = await db.select().from(conhecimentos).limit(50);
    const tesesResumo = todosConhecimentos.filter(c => c.categoria === 'Tese').map(t => `- ${t.titulo}`).join('\n');

    const modoAtual = modo || 'chat';
    const systemPrompt = `${config['system_prompt'] || 'Você é o agente jurídico expert do escritório Melo & Preda Advogados (OAB/GO 40.559).'}\n\nModo: ${modoAtual}\nTeses disponíveis:\n${tesesResumo}\n${contexto}`;

    const result = await invokeLLM({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: mensagem }
      ]
    });

    const resposta = typeof result.choices?.[0]?.message?.content === 'string'
      ? result.choices[0].message.content
      : 'Erro ao processar resposta.';

    res.json({
      resposta,
      sessaoId: sessaoId || `api_${Date.now()}`,
      modo: modoAtual,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// POST /api/v1/agente/analise - Análise técnica aprofundada
// ============================================================
apiRouter.post('/agente/analise', async (req: Request, res: Response) => {
  try {
    const { processoId, foco } = req.body;
    if (!processoId) return res.status(400).json({ error: 'Campo "processoId" é obrigatório' });

    const db = await getDb();
    if (!db) return res.status(503).json({ error: 'Banco de dados indisponível' });

    const [proc] = await db.select().from(processos).where(eq(processos.id, processoId));
    if (!proc) return res.status(404).json({ error: 'Processo não encontrado' });

    // Buscar dados completos
    const estrats = await db.select().from(estrategias).where(eq(estrategias.processoId, proc.id));
    const movs = await db.select().from(movimentacoes).where(eq(movimentacoes.processoId, proc.id)).orderBy(desc(movimentacoes.createdAt));
    const partes = await db.select().from(partesProcessuais).where(eq(partesProcessuais.processoId, proc.id));
    const movFin = await db.select().from(movimentacoesFinanceiras).where(eq(movimentacoesFinanceiras.processoId, proc.id));
    const cumprimentos = await db.select().from(cumprimentosSentenca).where(eq(cumprimentosSentenca.processoId, proc.id));

    let contextoCliente = '';
    if (proc.clienteId) {
      const [cliente] = await db.select().from(clientes).where(eq(clientes.id, proc.clienteId));
      if (cliente) {
        const emprestimos = await db.select().from(emprestimosConsignados).where(eq(emprestimosConsignados.clienteId, cliente.id));
        const dadosFin = await db.select().from(dadosFinanceiros).where(eq(dadosFinanceiros.clienteId, cliente.id));
        contextoCliente = `\nCLIENTE: ${cliente.nomeCompleto}, CPF: ${cliente.cpfCnpj}\nProfissão: ${cliente.profissao || 'N/A'} | Órgão: ${cliente.orgaoEmpregador || 'N/A'}\nFinanceiro: ${dadosFin.map(d => `Bruto: R$ ${d.remuneracaoBruta} | Líquido: R$ ${d.remuneracaoLiquida} | Margem: R$ ${d.margemConsignavelValor}`).join('; ')}\nEmpréstimos: ${emprestimos.map(e => `${e.banco}: R$ ${e.valorParcela}/mês`).join('; ')}`;
      }
    }

    const todosConhecimentos = await db.select().from(conhecimentos);
    const tesesTxt = todosConhecimentos.filter(c => c.categoria === 'Tese').map(t => `- ${t.titulo}: ${t.conteudo?.substring(0, 200)}`).join('\n');

    const systemPrompt = `Você é o ANALISTA PROCESSUAL EXPERT do escritório Melo & Preda Advogados (OAB/GO 40.559).
Advogado: PAULO DA SILVA MELO FILHO

Realize uma ANÁLISE TÉCNICA APROFUNDADA seguindo o WORKFLOW DE 5 FASES:

FASE 1 — IMERSÃO: Leitura exaustiva dos autos, identificação de sentença, recursos, acórdãos, trânsito em julgado, preclusão lógica e trânsito parcial em litisconsórcio simples.
FASE 2 — TESES: Mapeamento de teses aplicáveis da base de conhecimentos (TJ-GO e STJ).
FASE 3 — ESTRATÉGIA: Definição do tipo de ação e táticas avançadas.
FASE 4 — CÁLCULOS: Valores com INPC + juros 1% a.m. + multa art. 523 CPC.
FASE 5 — REVISÃO: Consistência argumentativa, dados e formatação.

SEÇÕES OBRIGATÓRIAS DA ANÁLISE:
1. SÍNTESE PROCESSUAL (cronologia completa)
2. ANÁLISE DAS PARTES E LEGITIMIDADE (verificar individualmente em litisconsórcio)
3. ANÁLISE DA FUNDAMENTAÇÃO JURÍDICA (artigos específicos com §§ e incisos)
4. ANÁLISE DAS TESES APLICÁVEIS (buscar na base de conhecimentos)
5. ANÁLISE DA JURISPRUDÊNCIA RELEVANTE (TJ-GO e STJ com números completos)
6. ANÁLISE DOS RISCOS PROCESSUAIS (teses adversárias e mitigações)
7. ANÁLISE FINANCEIRA E PATRIMONIAL (cálculos detalhados)
8. ESTRATÉGIA PROCESSUAL RECOMENDADA (táticas avançadas: coisa julgada progressiva, cautelar antecedente, SISBAJUD)
9. PRÓXIMOS PASSOS CONCRETOS (com prazos)
10. DIAGNÓSTICO FINAL

PROCESSO: ${proc.numeroCnj}
Tipo: ${proc.tipoAcao} | Natureza: ${proc.natureza || 'N/A'}
Vara: ${proc.vara}, Comarca: ${proc.comarca}, Tribunal: ${proc.tribunal}
Valor: R$ ${proc.valorCausa} | Fase: ${proc.faseAtual} | Status: ${proc.statusProcesso}
Polo Ativo: ${proc.poloAtivo} | Polo Passivo: ${proc.poloPassivo}
Sentença: ${proc.resumoSentenca || 'N/A'}
Partes: ${partes.map(p => `${p.tipo}: ${p.nome}`).join('; ')}
Estratégias: ${estrats.map(e => `Tese: ${e.tesePrincipal}\nFund: ${e.fundamentacaoLegal}`).join('\n---\n')}
Movimentações (últimas 15): ${movs.slice(0, 15).map(m => `${m.data}: ${m.evento}`).join('\n')}
Financeiro: ${movFin.map(m => `${m.tipo}: R$ ${m.valor} (${m.status})`).join('; ')}
Cumprimentos: ${cumprimentos.map(c => `${c.tipo}: R$ ${c.valorExecucao}`).join('; ')}
${contextoCliente}

TESES DISPONÍVEIS:
${tesesTxt}

${foco ? `FOCO ESPECÍFICO DA ANÁLISE: ${foco}` : ''}`;

    const result = await invokeLLM({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Realize a análise técnica aprofundada completa do processo ${proc.numeroCnj}.` }
      ]
    });

    const analise = typeof result.choices?.[0]?.message?.content === 'string'
      ? result.choices[0].message.content
      : 'Erro ao gerar análise.';

    res.json({
      analise,
      processo: proc.numeroCnj || '',
      tipo: proc.tipoAcao || '',
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// POST /api/v1/agente/peticao - Gerar petição completa
// ============================================================
apiRouter.post('/agente/peticao', async (req: Request, res: Response) => {
  try {
    const { tipoPeticao, clienteId, processoId, templateId, instrucoes } = req.body;
    if (!tipoPeticao) return res.status(400).json({ error: 'Campo "tipoPeticao" é obrigatório' });

    const db = await getDb();
    if (!db) return res.status(503).json({ error: 'Banco de dados indisponível' });

    // Carregar config
    const configRows = await db.select().from(agenteIaConfig).where(eq(agenteIaConfig.ativo, 1));
    const config: Record<string, string> = {};
    for (const row of configRows) config[row.chave] = row.valor;

    // Template
    let templateInfo = '';
    if (templateId) {
      const [tmpl] = await db.select().from(templatesPeticao).where(eq(templatesPeticao.id, templateId));
      if (tmpl) {
        templateInfo = `\nTEMPLATE: ${tmpl.nome}\nTipo: ${tmpl.tipo}\nDescrição: ${tmpl.descricao}\nTeses: ${tmpl.tesesAplicaveis}\nFundamentação: ${tmpl.fundamentacaoPadrao}`;
      }
    }

    // Contexto cliente
    let contextoCliente = '';
    let nomeCliente = 'Cliente';
    if (clienteId) {
      const [cliente] = await db.select().from(clientes).where(eq(clientes.id, clienteId));
      if (cliente) {
        nomeCliente = cliente.nomeCompleto;
        const procs = await db.select().from(processos).where(eq(processos.clienteId, cliente.id));
        const emprestimos = await db.select().from(emprestimosConsignados).where(eq(emprestimosConsignados.clienteId, cliente.id));
        const dadosFin = await db.select().from(dadosFinanceiros).where(eq(dadosFinanceiros.clienteId, cliente.id));
        contextoCliente = `\nCLIENTE: ${cliente.nomeCompleto}, CPF: ${cliente.cpfCnpj}\nProfissão: ${cliente.profissao || 'N/A'} | Órgão: ${cliente.orgaoEmpregador || 'N/A'}\nEndereço: ${cliente.endereco || 'N/A'}, ${cliente.cidade || ''} - ${cliente.estado || ''}\nFinanceiro: ${dadosFin.map(d => `Bruto: R$ ${d.remuneracaoBruta} | Líquido: R$ ${d.remuneracaoLiquida} | Margem: R$ ${d.margemConsignavelValor}`).join('; ')}\nEmpréstimos: ${emprestimos.map(e => `${e.banco}: R$ ${e.valorParcela}/mês`).join('; ')}\nProcessos: ${procs.map(p => `${p.numeroCnj} (${p.tipoAcao})`).join('; ')}`;
      }
    }

    // Contexto processo
    let contextoProcesso = '';
    let numeroProcesso = '';
    if (processoId) {
      const [proc] = await db.select().from(processos).where(eq(processos.id, processoId));
      if (proc) {
        numeroProcesso = proc.numeroCnj || '';
        const estrats = await db.select().from(estrategias).where(eq(estrategias.processoId, proc.id));
        const partes = await db.select().from(partesProcessuais).where(eq(partesProcessuais.processoId, proc.id));
        contextoProcesso = `\nPROCESSO: ${proc.numeroCnj}\nTipo: ${proc.tipoAcao} | Vara: ${proc.vara}, Comarca: ${proc.comarca}\nValor: R$ ${proc.valorCausa} | Fase: ${proc.faseAtual}\nPolo Ativo: ${proc.poloAtivo} | Polo Passivo: ${proc.poloPassivo}\nEstratégias: ${estrats.map(e => `${e.tesePrincipal}`).join('\n')}`;
      }
    }

    // Conhecimentos
    const todosConhecimentos = await db.select().from(conhecimentos);
    const tesesTxt = todosConhecimentos.filter(c => c.categoria === 'Tese').map(t => `- ${t.titulo}: ${t.conteudo?.substring(0, 250)}`).join('\n');
    const jurispTxt = todosConhecimentos.filter(c => c.categoria === 'Jurisprudencia').map(j => `- ${j.titulo}: ${j.conteudo?.substring(0, 200)}`).join('\n');
    const legTxt = todosConhecimentos.filter(c => c.categoria === 'Legislacao').map(l => `- ${l.titulo}: ${l.conteudo?.substring(0, 200)}`).join('\n');

    const systemPrompt = `Você é o PETICIONADOR EXPERT do escritório Melo & Preda Advogados (OAB/GO 40.559).
Advogado: PAULO DA SILVA MELO FILHO

Gere a petição completa do tipo "${tipoPeticao}" seguindo RIGOROSAMENTE o padrão do escritório.

ESTILO DE REDAÇÃO OBRIGATÓRIO:
- Tom ASSERTIVO, COMBATIVO e TÉCNICO — sem hesitação ou condicional desnecessário
- Fundamentação ROBUSTA com artigos de lei (artigo, parágrafo, inciso), doutrina e jurisprudência
- Expressões características: "flagrante ilegalidade", "abuso manifesto e inescusável", "violação frontal ao ordenamento jurídico"
- Para urgência: "o periculum in mora é evidente", "a tutela de urgência se impõe com absoluta necessidade"
- Para fundamentação: "consoante entendimento pacificado no STJ", "nos termos do artigo [X], que é cristalino ao dispor que"
- Parágrafos densos com argumentação encadeada e progressiva (máximo 5 linhas)
- Pedidos específicos, detalhados e numerados com letras (a, b, c...)
- Citações jurisprudenciais completas (tribunal, número, relator, câmara, data)
- NUNCA usar "etc.", arcaismos ("nobre advogado", "data venia" em excesso)
- Ordem de fundamentação: Legislação (específico → geral) → Jurisprudência (STJ/STF → TJ-GO) → Doutrina

ESTRUTURA OBRIGATÓRIA:
1. ENDEREÇAMENTO (EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(ÍZA) DE DIREITO DA [Nº] VARA CÍVEL DA COMARCA DE [CIDADE] — ESTADO DE GOIÁS)
2. QUALIFICAÇÃO DAS PARTES (completa com CPF, profissão, endereço)
3. I — DOS FATOS (narrativa processual cronológica e detalhada)
4. II — DO DIREITO (fundamentação legal, doutrinária e jurisprudencial — SEÇÃO MAIS IMPORTANTE)
5. III — DOS PEDIDOS (numerados com letras: a), b), c)... — específicos com valores exatos)
6. IV — DO VALOR DA CAUSA (com valor por extenso)
7. REQUERIMENTOS FINAIS
8. FECHO (Nestes termos, pede deferimento. [Cidade], [data]. PAULO DA SILVA MELO FILHO — OAB/GO 40.559)

TESES: ${tesesTxt}
JURISPRUDÊNCIA: ${jurispTxt}
LEGISLAÇÃO: ${legTxt}
${templateInfo}${contextoCliente}${contextoProcesso}
${instrucoes ? `INSTRUÇÕES: ${instrucoes}` : ''}`;

    const result = await invokeLLM({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Gere a petição de ${tipoPeticao} completa.` }
      ]
    });

    const peticaoTexto = typeof result.choices?.[0]?.message?.content === 'string'
      ? result.choices[0].message.content
      : 'Erro ao gerar petição.';

    // Salvar no S3
    const timestamp = Date.now();
    const nomeArquivo = `peticoes/api_${tipoPeticao.replace(/\s+/g, '_')}_${timestamp}.md`;
    const { url } = await storagePut(nomeArquivo, peticaoTexto, 'text/markdown');

    // Gerar DOCX
    let docxUrl = '';
    try {
      const docxBuffer = await gerarPeticaoDocx(peticaoTexto, `${tipoPeticao} — ${nomeCliente}`);
      const docxNome = `peticoes/api_${tipoPeticao.replace(/\s+/g, '_')}_${timestamp}.docx`;
      const docxResult = await storagePut(docxNome, docxBuffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      docxUrl = docxResult.url;
    } catch (_e) {}

    // Salvar no banco
    try {
      await db.insert(peticoesGeradas).values({
        templateId: templateId || null,
        processoId: processoId || null,
        clienteId: clienteId || null,
        tipo: tipoPeticao,
        titulo: `${tipoPeticao} — ${nomeCliente} (API)`,
        conteudoJson: JSON.stringify({ texto: peticaoTexto, docxUrl }),
        conteudoTexto: peticaoTexto,
        status: 'rascunho',
        storageUrl: url,
        geradoPor: 'api_rest',
      });
    } catch (_e) {}

    res.json({
      peticao: peticaoTexto,
      url,
      docxUrl,
      tipoPeticao,
      cliente: nomeCliente,
      processo: numeroProcesso,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// POST /api/v1/agente/peticao-docx - Gerar DOCX com timbrado
// ============================================================
apiRouter.post('/agente/peticao-docx', async (req: Request, res: Response) => {
  try {
    const { conteudo, titulo } = req.body;
    if (!conteudo) return res.status(400).json({ error: 'Campo "conteudo" é obrigatório' });

    const docxBuffer = await gerarPeticaoDocx(conteudo, titulo || 'Petição');
    const timestamp = Date.now();
    const nomeArquivo = `peticoes/api_docx_${timestamp}.docx`;
    const { url: docxUrl } = await storagePut(nomeArquivo, docxBuffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

    res.json({ docxUrl, titulo: titulo || 'Petição' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// GET /api/v1/agente/conhecimentos - Base de conhecimentos
// ============================================================
apiRouter.get('/agente/conhecimentos', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(503).json({ error: 'Banco de dados indisponível' });

    const categoria = req.query.categoria as string | undefined;
    const busca = req.query.busca as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;

    let query = db.select().from(conhecimentos).limit(limit);
    if (categoria) query = query.where(eq(conhecimentos.categoria, categoria as any)) as any;
    if (busca) query = query.where(like(conhecimentos.titulo, `%${busca}%`)) as any;

    const results = await query;
    res.json({ total: results.length, conhecimentos: results });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// GET /api/v1/agente/estrategias - Estratégias processuais
// ============================================================
apiRouter.get('/agente/estrategias', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(503).json({ error: 'Banco de dados indisponível' });

    const processoId = parseInt(req.query.processoId as string) || undefined;
    const busca = req.query.busca as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;

    let query = db.select().from(estrategias).limit(limit);
    if (processoId) query = query.where(eq(estrategias.processoId, processoId)) as any;
    if (busca) query = query.where(like(estrategias.tesePrincipal, `%${busca}%`)) as any;

    const results = await query;
    res.json({ total: results.length, estrategias: results });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// GET /api/v1/agente/templates - Templates de petição
// ============================================================
apiRouter.get('/agente/templates', async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(503).json({ error: 'Banco de dados indisponível' });

    const results = await db.select().from(templatesPeticao).where(eq(templatesPeticao.ativo, 1));
    res.json({ templates: results });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// GET /api/v1/agente/clientes - Listar clientes
// ============================================================
apiRouter.get('/agente/clientes', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(503).json({ error: 'Banco de dados indisponível' });

    const busca = req.query.busca as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;

    let query = db.select({
      id: clientes.id,
      nomeCompleto: clientes.nomeCompleto,
      cpfCnpj: clientes.cpfCnpj,
      profissao: clientes.profissao,
      orgaoEmpregador: clientes.orgaoEmpregador,
      cidade: clientes.cidade,
      estado: clientes.estado,
    }).from(clientes).orderBy(desc(clientes.id)).limit(limit);

    if (busca) query = query.where(like(clientes.nomeCompleto, `%${busca}%`)) as any;

    const results = await query;
    res.json({ total: results.length, clientes: results });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// GET /api/v1/agente/processos - Listar processos
// ============================================================
apiRouter.get('/agente/processos', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(503).json({ error: 'Banco de dados indisponível' });

    const clienteId = parseInt(req.query.clienteId as string) || undefined;
    const busca = req.query.busca as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;

    let query = db.select({
      id: processos.id,
      numeroCnj: processos.numeroCnj,
      tipoAcao: processos.tipoAcao,
      vara: processos.vara,
      comarca: processos.comarca,
      tribunal: processos.tribunal,
      valorCausa: processos.valorCausa,
      faseAtual: processos.faseAtual,
      statusProcesso: processos.statusProcesso,
      poloAtivo: processos.poloAtivo,
      poloPassivo: processos.poloPassivo,
      clienteId: processos.clienteId,
    }).from(processos).orderBy(desc(processos.id)).limit(limit);

    if (clienteId) query = query.where(eq(processos.clienteId, clienteId)) as any;
    if (busca) query = query.where(like(processos.numeroCnj, `%${busca}%`)) as any;

    const results = await query;
    res.json({ total: results.length, processos: results });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export { apiRouter };
