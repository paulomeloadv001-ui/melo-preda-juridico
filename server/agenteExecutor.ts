/**
 * AGENTE EXECUTOR — Melo & Preda Advogados
 * 
 * Loop de execução com tool_choice: o LLM recebe funções executáveis
 * e pode chamá-las para executar ações reais no sistema (banco de dados,
 * DataJud, geração de petições, merge de clientes, etc.)
 * 
 * O agente opera em ciclos:
 * 1. Recebe a mensagem do usuário + contexto
 * 2. Decide se precisa executar alguma tool
 * 3. Executa a tool e recebe o resultado
 * 4. Continua até ter uma resposta final para o usuário
 */

import { invokeLLM } from "./_core/llm";
import { ENV } from "./_core/env";
import type { Tool, Message, InvokeResult, ToolCall } from "./_core/llm";
import { getDb } from "./db";
import {
  clientes, processos, dadosFinanceiros, emprestimosConsignados,
  estrategias, partesProcessuais, movimentacoes, documentos,
  conhecimentos, cumprimentosSentenca, movimentacoesFinanceiras,
  prazosProcessuais, peticoesGeradas, templatesPeticao,
  agenteIaConfig, notificacoes, historicoCorrecoes
} from "../drizzle/schema";
import { eq, like, desc, asc, and, sql } from "drizzle-orm";
import { storagePut } from "./storage";
import { gerarPeticaoDocx } from "./docxGenerator";

// ==================== TOOL DEFINITIONS ====================
export const AGENT_TOOLS: Tool[] = [
  {
    type: "function",
    function: {
      name: "buscar_cliente",
      description: "Busca um cliente no banco de dados por nome, CPF ou ID. Retorna dados completos do cliente incluindo processos vinculados.",
      parameters: {
        type: "object",
        properties: {
          termo: { type: "string", description: "Nome, CPF ou parte do nome do cliente para buscar" },
          clienteId: { type: "number", description: "ID específico do cliente (se já conhecido)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "buscar_processo",
      description: "Busca um processo judicial por número CNJ, ID ou termo. Retorna dados completos incluindo partes, movimentações, estratégias e financeiro.",
      parameters: {
        type: "object",
        properties: {
          termo: { type: "string", description: "Número CNJ, tipo de ação ou parte do texto para buscar" },
          processoId: { type: "number", description: "ID específico do processo (se já conhecido)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "diagnosticar_banco",
      description: "Faz um diagnóstico completo do banco de dados: identifica clientes duplicados, processos sem movimentações, CPFs pendentes, dados incompletos, processos sem estratégia, etc.",
      parameters: {
        type: "object",
        properties: {
          foco: {
            type: "string",
            enum: ["completo", "duplicados", "incompletos", "movimentacoes", "financeiro", "cpf_pendente"],
            description: "Foco do diagnóstico. 'completo' faz tudo.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listar_duplicados",
      description: "Lista todos os clientes e processos duplicados no banco de dados, agrupados por CPF ou CNJ.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "merge_clientes",
      description: "Unifica dois registros de cliente duplicados. Mantém o registro principal (mais completo) e transfere todos os processos, documentos e dados do registro secundário para ele, depois remove o secundário.",
      parameters: {
        type: "object",
        properties: {
          clientePrincipalId: { type: "number", description: "ID do cliente que será mantido (o mais completo)" },
          clienteSecundarioId: { type: "number", description: "ID do cliente duplicado que será removido após merge" },
        },
        required: ["clientePrincipalId", "clienteSecundarioId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remover_registro",
      description: "Remove um registro específico do banco (cliente sem processos, processo duplicado, movimentação incorreta, etc.). Usa com cuidado.",
      parameters: {
        type: "object",
        properties: {
          tipo: {
            type: "string",
            enum: ["cliente", "processo", "movimentacao", "estrategia", "emprestimo", "dado_financeiro"],
            description: "Tipo do registro a remover",
          },
          id: { type: "number", description: "ID do registro a remover" },
          motivo: { type: "string", description: "Motivo da remoção (será registrado no histórico)" },
        },
        required: ["tipo", "id", "motivo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "completar_movimentacoes",
      description: "Consulta a API pública do DataJud (CNJ) para buscar movimentações processuais atualizadas de um processo específico e insere as novas no banco.",
      parameters: {
        type: "object",
        properties: {
          processoId: { type: "number", description: "ID do processo para completar movimentações" },
          numeroCnj: { type: "string", description: "Número CNJ do processo (alternativa ao ID)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analisar_processo_tecnico",
      description: "Realiza análise técnica aprofundada de um processo específico: teses aplicáveis, jurisprudência, pontos fortes/fracos, riscos, próximos passos. Salva a análise como estratégia no banco.",
      parameters: {
        type: "object",
        properties: {
          processoId: { type: "number", description: "ID do processo para analisar" },
          focoAnalise: { type: "string", description: "Foco específico da análise (ex: 'viabilidade recursal', 'cálculo de honorários', 'tese de abusividade')" },
        },
        required: ["processoId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "gerar_peticao",
      description: "Gera uma petição jurídica completa com timbrado do escritório Melo & Preda. Salva em Markdown e DOCX no S3 e registra no banco.",
      parameters: {
        type: "object",
        properties: {
          tipoPeticao: { type: "string", description: "Tipo da petição (ex: 'Cumprimento Provisório de Sentença', 'Agravo de Instrumento', 'Embargos de Declaração')" },
          clienteId: { type: "number", description: "ID do cliente" },
          processoId: { type: "number", description: "ID do processo" },
          instrucoes: { type: "string", description: "Instruções adicionais do advogado para a petição" },
        },
        required: ["tipoPeticao"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "atualizar_dados_cliente",
      description: "Atualiza dados cadastrais de um cliente (CPF, profissão, endereço, telefone, email, etc.)",
      parameters: {
        type: "object",
        properties: {
          clienteId: { type: "number", description: "ID do cliente a atualizar" },
          dados: {
            type: "object",
            description: "Dados a atualizar",
            properties: {
              cpfCnpj: { type: "string" },
              nomeCompleto: { type: "string" },
              rg: { type: "string" },
              profissao: { type: "string" },
              cargo: { type: "string" },
              orgaoEmpregador: { type: "string" },
              vinculoFuncional: { type: "string" },
              endereco: { type: "string" },
              cidade: { type: "string" },
              estado: { type: "string" },
              cep: { type: "string" },
              telefone: { type: "string" },
              email: { type: "string" },
            },
          },
        },
        required: ["clienteId", "dados"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "atualizar_dados_processo",
      description: "Atualiza dados de um processo (fase, status, valor, juiz, etc.)",
      parameters: {
        type: "object",
        properties: {
          processoId: { type: "number", description: "ID do processo a atualizar" },
          dados: {
            type: "object",
            description: "Dados a atualizar",
            properties: {
              faseAtual: { type: "string" },
              statusProcesso: { type: "string" },
              valorCausa: { type: "string" },
              juiz: { type: "string" },
              vara: { type: "string" },
              comarca: { type: "string" },
              tribunal: { type: "string" },
              tipoAcao: { type: "string" },
            },
          },
        },
        required: ["processoId", "dados"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_estatisticas",
      description: "Retorna estatísticas gerais do escritório: total de clientes, processos, valores, prazos, etc.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "editar_peticao",
      description: "Edita/refina uma petição já gerada. Pode alterar o texto, título ou regenerar o DOCX. Use quando o usuário pedir para corrigir, melhorar, alterar ou refinar uma petição existente.",
      parameters: {
        type: "object",
        properties: {
          peticaoId: { type: "number", description: "ID da petição a editar" },
          novoTexto: { type: "string", description: "Novo texto completo da petição (se for reescrita total)" },
          instrucoes: { type: "string", description: "Instruções de edição (ex: 'adicionar tese de prescrição', 'remover parágrafo sobre CDC', 'melhorar fundamentação')" },
        },
        required: ["peticaoId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listar_peticoes",
      description: "Lista todas as petições geradas no sistema, com filtros opcionais por cliente ou processo.",
      parameters: {
        type: "object",
        properties: {
          clienteId: { type: "number", description: "Filtrar por cliente" },
          processoId: { type: "number", description: "Filtrar por processo" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "buscar_conhecimento",
      description: "Busca na base de conhecimentos jurídicos do escritório: teses, jurisprudências, estratégias, legislações e modelos. Use para fundamentar petições e análises.",
      parameters: {
        type: "object",
        properties: {
          termo: { type: "string", description: "Termo de busca (ex: 'margem consignável', 'superendividamento', 'art. 523 CPC')" },
          categoria: { type: "string", description: "Filtrar por categoria: Tese, Jurisprudencia, Estrategia, Legislacao, Modelo" },
          tipoAcao: { type: "string", description: "Filtrar por tipo de ação (ex: 'cumprimento_provisorio', 'obrigacao_fazer')" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calcular_debito_judicial",
      description: "Calcula débito judicial com correção monetária e juros. Útil para cumprimentos de sentença, liquidação e execução.",
      parameters: {
        type: "object",
        properties: {
          valor_principal: { type: "number", description: "Valor principal do débito em reais" },
          indice_correcao: { type: "string", description: "Índice de correção: IPCA, INPC, IGP-M, SELIC, TR" },
          juros_mensais: { type: "number", description: "Taxa de juros mensais em percentual (ex: 1 para 1%)" },
          meses: { type: "number", description: "Quantidade de meses para cálculo" },
          data_inicio: { type: "string", description: "Data de início do cálculo (YYYY-MM-DD)" },
          multa_percentual: { type: "number", description: "Percentual de multa (ex: 10 para 10%)" },
          honorarios_percentual: { type: "number", description: "Percentual de honorários advocatícios (ex: 10 para 10%)" },
        },
        required: ["valor_principal"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_prazos",
      description: "Consulta prazos processuais pendentes, vencidos ou próximos do vencimento para um cliente ou processo específico.",
      parameters: {
        type: "object",
        properties: {
          clienteId: { type: "number", description: "Filtrar por cliente" },
          processoId: { type: "number", description: "Filtrar por processo" },
          status: { type: "string", description: "Filtrar por status: pendente, cumprido, vencido" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_cumprimento_sentenca",
      description: "Consulta dados de cumprimentos de sentença vinculados a um cliente ou processo.",
      parameters: {
        type: "object",
        properties: {
          clienteId: { type: "number", description: "Filtrar por cliente" },
          processoId: { type: "number", description: "Filtrar por processo" },
        },
        required: [],
      },
    },
  },
];

// ==================== TOOL EXECUTORS ====================

export async function executarTool(toolName: string, args: any): Promise<string> {
  try {
    switch (toolName) {
      case "buscar_cliente": return await toolBuscarCliente(args);
      case "buscar_processo": return await toolBuscarProcesso(args);
      case "diagnosticar_banco": return await toolDiagnosticarBanco(args);
      case "listar_duplicados": return await toolListarDuplicados(args);
      case "merge_clientes": return await toolMergeClientes(args);
      case "remover_registro": return await toolRemoverRegistro(args);
      case "completar_movimentacoes": return await toolCompletarMovimentacoes(args);
      case "analisar_processo_tecnico": return await toolAnalisarProcesso(args);
      case "gerar_peticao": return await toolGerarPeticao(args);
      case "atualizar_dados_cliente": return await toolAtualizarCliente(args);
      case "atualizar_dados_processo": return await toolAtualizarProcesso(args);
      case "consultar_estatisticas": return await toolConsultarEstatisticas(args);
      case "editar_peticao": return await toolEditarPeticao(args);
      case "listar_peticoes": return await toolListarPeticoes(args);
      case "buscar_conhecimento": return await toolBuscarConhecimento(args);
      case "calcular_debito_judicial": return await toolCalcularDebitoJudicial(args);
      case "consultar_prazos": return await toolConsultarPrazos(args);
      case "consultar_cumprimento_sentenca": return await toolConsultarCumprimentoSentenca(args);
      default: return JSON.stringify({ erro: `Tool desconhecida: ${toolName}` });
    }
  } catch (error: any) {
    return JSON.stringify({ erro: error.message || "Erro ao executar tool", detalhes: String(error) });
  }
}

// --- BUSCAR CLIENTE ---
async function toolBuscarCliente(args: any): Promise<string> {
  const db = await getDb();
  if (!db) return JSON.stringify({ erro: "Banco de dados indisponível" });

  let resultados: any[] = [];

  if (args.clienteId) {
    resultados = await db.select().from(clientes).where(eq(clientes.id, args.clienteId)).limit(1);
  } else if (args.termo) {
    const termo = args.termo.replace(/[.\-\/]/g, '');
    // Buscar por CPF exato
    if (/^\d{11,14}$/.test(termo)) {
      resultados = await db.select().from(clientes).where(eq(clientes.cpfCnpj, termo));
    }
    // Buscar por nome
    if (resultados.length === 0) {
      const todos = await db.select().from(clientes);
      const termoLower = args.termo.toLowerCase();
      resultados = todos.filter(c =>
        c.nomeCompleto.toLowerCase().includes(termoLower) ||
        c.cpfCnpj.includes(termo)
      );
    }
  } else {
    resultados = await db.select().from(clientes).orderBy(clientes.nomeCompleto).limit(50);
  }

  // Enriquecer com processos e financeiro
  const enriched = await Promise.all(resultados.slice(0, 10).map(async (c) => {
    const procs = await db.select().from(processos).where(eq(processos.clienteId, c.id));
    const fin = await db.select().from(dadosFinanceiros).where(eq(dadosFinanceiros.clienteId, c.id));
    const emps = await db.select().from(emprestimosConsignados).where(eq(emprestimosConsignados.clienteId, c.id));
    return {
      ...c,
      processos: procs.map(p => ({ id: p.id, numeroCnj: p.numeroCnj, tipoAcao: p.tipoAcao, faseAtual: p.faseAtual, statusProcesso: p.statusProcesso, valorCausa: p.valorCausa })),
      financeiro: fin.map(f => ({ remuneracaoBruta: f.remuneracaoBruta, remuneracaoLiquida: f.remuneracaoLiquida, margemConsignavelValor: f.margemConsignavelValor })),
      emprestimos: emps.map(e => ({ banco: e.banco, valorParcela: e.valorParcela, contrato: e.contrato })),
    };
  }));

  return JSON.stringify({ encontrados: enriched.length, clientes: enriched });
}

// --- BUSCAR PROCESSO ---
async function toolBuscarProcesso(args: any): Promise<string> {
  const db = await getDb();
  if (!db) return JSON.stringify({ erro: "Banco de dados indisponível" });

  let resultados: any[] = [];

  if (args.processoId) {
    resultados = await db.select().from(processos).where(eq(processos.id, args.processoId)).limit(1);
  } else if (args.termo) {
    const todos = await db.select().from(processos);
    const termoLower = args.termo.toLowerCase();
    resultados = todos.filter(p =>
      (p.numeroCnj && p.numeroCnj.toLowerCase().includes(termoLower)) ||
      (p.tipoAcao && p.tipoAcao.toLowerCase().includes(termoLower)) ||
      (p.poloAtivo && p.poloAtivo.toLowerCase().includes(termoLower)) ||
      (p.poloPassivo && p.poloPassivo.toLowerCase().includes(termoLower))
    );
  }

  // Enriquecer
  const enriched = await Promise.all(resultados.slice(0, 10).map(async (p) => {
    const estrats = await db.select().from(estrategias).where(eq(estrategias.processoId, p.id));
    const partes = await db.select().from(partesProcessuais).where(eq(partesProcessuais.processoId, p.id));
    const movs = await db.select().from(movimentacoes).where(eq(movimentacoes.processoId, p.id)).orderBy(desc(movimentacoes.createdAt)).limit(20);
    const movFin = await db.select().from(movimentacoesFinanceiras).where(eq(movimentacoesFinanceiras.processoId, p.id));
    const cumps = await db.select().from(cumprimentosSentenca).where(eq(cumprimentosSentenca.processoId, p.id));
    const [cliente] = p.clienteId ? await db.select().from(clientes).where(eq(clientes.id, p.clienteId)).limit(1) : [null];
    const { textoExtraido, ...procData } = p;
    return {
      ...procData,
      clienteNome: cliente?.nomeCompleto || 'N/A',
      clienteCpf: cliente?.cpfCnpj || 'N/A',
      estrategias: estrats,
      partes: partes.map(pt => ({ nome: pt.nome, tipo: pt.tipo, cpfCnpj: pt.cpfCnpj, categoria: pt.categoria })),
      movimentacoes: movs.map(m => ({ data: m.data, evento: m.evento, descricao: m.descricao })),
      movimentacoesFinanceiras: movFin,
      cumprimentos: cumps,
    };
  }));

  return JSON.stringify({ encontrados: enriched.length, processos: enriched });
}

// --- DIAGNOSTICAR BANCO ---
async function toolDiagnosticarBanco(args: any): Promise<string> {
  const db = await getDb();
  if (!db) return JSON.stringify({ erro: "Banco de dados indisponível" });

  const foco = args.foco || 'completo';
  const diagnostico: any = {};

  // Clientes duplicados por CPF
  if (foco === 'completo' || foco === 'duplicados') {
    const todosClientes = await db.select().from(clientes);
    const cpfMap = new Map<string, any[]>();
    for (const c of todosClientes) {
      if (c.cpfCnpj && !c.cpfCnpj.startsWith('PEND') && !c.cpfCnpj.startsWith('SEM_CPF')) {
        const arr = cpfMap.get(c.cpfCnpj) || [];
        arr.push({ id: c.id, nome: c.nomeCompleto, cpf: c.cpfCnpj });
        cpfMap.set(c.cpfCnpj, arr);
      }
    }
    diagnostico.clientesDuplicados = Array.from(cpfMap.entries())
      .filter(([_, arr]) => arr.length > 1)
      .map(([cpf, arr]) => ({ cpf, registros: arr, quantidade: arr.length }));

    // Processos duplicados por CNJ
    const todosProcessos = await db.select().from(processos);
    const cnjMap = new Map<string, any[]>();
    for (const p of todosProcessos) {
      if (p.numeroCnj && !p.numeroCnj.startsWith('SEM_')) {
        const arr = cnjMap.get(p.numeroCnj) || [];
        arr.push({ id: p.id, cnj: p.numeroCnj, tipoAcao: p.tipoAcao, clienteId: p.clienteId });
        cnjMap.set(p.numeroCnj, arr);
      }
    }
    diagnostico.processosDuplicados = Array.from(cnjMap.entries())
      .filter(([_, arr]) => arr.length > 1)
      .map(([cnj, arr]) => ({ cnj, registros: arr, quantidade: arr.length }));

    // Clientes com nomes muito similares
    const nomeMap = new Map<string, any[]>();
    for (const c of todosClientes) {
      const nomeNorm = c.nomeCompleto.trim().toUpperCase().replace(/\s+/g, ' ');
      const arr = nomeMap.get(nomeNorm) || [];
      arr.push({ id: c.id, nome: c.nomeCompleto, cpf: c.cpfCnpj });
      nomeMap.set(nomeNorm, arr);
    }
    diagnostico.clientesNomeDuplicado = Array.from(nomeMap.entries())
      .filter(([_, arr]) => arr.length > 1)
      .map(([nome, arr]) => ({ nome, registros: arr, quantidade: arr.length }));
  }

  // CPFs pendentes
  if (foco === 'completo' || foco === 'cpf_pendente') {
    const pendentes = await db.select({ id: clientes.id, nome: clientes.nomeCompleto, cpf: clientes.cpfCnpj })
      .from(clientes)
      .where(sql`${clientes.cpfCnpj} LIKE 'PEND%' OR ${clientes.cpfCnpj} LIKE 'SEM_CPF%' OR ${clientes.cpfCnpj} = ''`);
    diagnostico.cpfPendentes = pendentes;
  }

  // Processos incompletos
  if (foco === 'completo' || foco === 'incompletos') {
    const todosProcs = await db.select().from(processos);
    const semEstrategia: any[] = [];
    const semMovimentacao: any[] = [];
    const semPartes: any[] = [];

    for (const p of todosProcs) {
      const [estCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(estrategias).where(eq(estrategias.processoId, p.id));
      if (Number(estCount?.count || 0) === 0) semEstrategia.push({ id: p.id, cnj: p.numeroCnj, tipoAcao: p.tipoAcao });

      const [movCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(movimentacoes).where(eq(movimentacoes.processoId, p.id));
      if (Number(movCount?.count || 0) === 0) semMovimentacao.push({ id: p.id, cnj: p.numeroCnj, tipoAcao: p.tipoAcao });

      const [partCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(partesProcessuais).where(eq(partesProcessuais.processoId, p.id));
      if (Number(partCount?.count || 0) === 0) semPartes.push({ id: p.id, cnj: p.numeroCnj, tipoAcao: p.tipoAcao });
    }

    diagnostico.processosSemEstrategia = semEstrategia;
    diagnostico.processosSemMovimentacao = semMovimentacao;
    diagnostico.processosSemPartes = semPartes;
  }

  // Movimentações desatualizadas
  if (foco === 'completo' || foco === 'movimentacoes') {
    const todosProcs = await db.select({ id: processos.id, cnj: processos.numeroCnj, tipoAcao: processos.tipoAcao, statusProcesso: processos.statusProcesso })
      .from(processos)
      .where(sql`${processos.statusProcesso} != 'Arquivado'`);
    const desatualizados: any[] = [];
    for (const p of todosProcs) {
      const [ultimaMov] = await db.select({ data: movimentacoes.data })
        .from(movimentacoes)
        .where(eq(movimentacoes.processoId, p.id))
        .orderBy(desc(movimentacoes.data))
        .limit(1);
      if (!ultimaMov) {
        desatualizados.push({ ...p, ultimaMovimentacao: null, motivo: 'Sem movimentações' });
      } else {
        desatualizados.push({ ...p, ultimaMovimentacao: ultimaMov.data });
      }
    }
    diagnostico.movimentacoesStatus = desatualizados;
  }

  // Financeiro
  if (foco === 'completo' || foco === 'financeiro') {
    const todosClientes2 = await db.select({ id: clientes.id, nome: clientes.nomeCompleto }).from(clientes);
    const semFinanceiro: any[] = [];
    for (const c of todosClientes2) {
      const [finCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(dadosFinanceiros).where(eq(dadosFinanceiros.clienteId, c.id));
      if (Number(finCount?.count || 0) === 0) semFinanceiro.push(c);
    }
    diagnostico.clientesSemDadosFinanceiros = semFinanceiro;
  }

  return JSON.stringify(diagnostico);
}

// --- LISTAR DUPLICADOS ---
async function toolListarDuplicados(_args: any): Promise<string> {
  return await toolDiagnosticarBanco({ foco: 'duplicados' });
}

// --- MERGE CLIENTES ---
async function toolMergeClientes(args: any): Promise<string> {
  const db = await getDb();
  if (!db) return JSON.stringify({ erro: "Banco de dados indisponível" });

  const { clientePrincipalId, clienteSecundarioId } = args;
  if (clientePrincipalId === clienteSecundarioId) {
    return JSON.stringify({ erro: "IDs principal e secundário são iguais" });
  }

  const [principal] = await db.select().from(clientes).where(eq(clientes.id, clientePrincipalId)).limit(1);
  const [secundario] = await db.select().from(clientes).where(eq(clientes.id, clienteSecundarioId)).limit(1);

  if (!principal) return JSON.stringify({ erro: `Cliente principal ID ${clientePrincipalId} não encontrado` });
  if (!secundario) return JSON.stringify({ erro: `Cliente secundário ID ${clienteSecundarioId} não encontrado` });

  // Transferir processos
  const procsTransferidos = await db.update(processos)
    .set({ clienteId: clientePrincipalId })
    .where(eq(processos.clienteId, clienteSecundarioId));

  // Transferir dados financeiros
  await db.update(dadosFinanceiros)
    .set({ clienteId: clientePrincipalId })
    .where(eq(dadosFinanceiros.clienteId, clienteSecundarioId));

  // Transferir empréstimos
  await db.update(emprestimosConsignados)
    .set({ clienteId: clientePrincipalId })
    .where(eq(emprestimosConsignados.clienteId, clienteSecundarioId));

  // Transferir documentos
  await db.update(documentos)
    .set({ clienteId: clientePrincipalId })
    .where(eq(documentos.clienteId, clienteSecundarioId));

  // Transferir movimentações financeiras
  await db.update(movimentacoesFinanceiras)
    .set({ clienteId: clientePrincipalId })
    .where(eq(movimentacoesFinanceiras.clienteId, clienteSecundarioId));

  // Transferir prazos
  await db.update(prazosProcessuais)
    .set({ clienteId: clientePrincipalId })
    .where(eq(prazosProcessuais.clienteId, clienteSecundarioId));

  // Completar dados do principal com dados do secundário (se faltantes)
  const updateData: Record<string, any> = {};
  const campos = ['rg', 'profissao', 'cargo', 'orgaoEmpregador', 'vinculoFuncional', 'endereco', 'cidade', 'estado', 'cep', 'telefone', 'email', 'dataNascimento', 'estadoCivil', 'nacionalidade'] as const;
  for (const campo of campos) {
    if ((!principal[campo] || principal[campo] === '') && secundario[campo] && secundario[campo] !== '') {
      updateData[campo] = secundario[campo];
    }
  }
  // Se principal não tem CPF válido mas secundário tem
  if ((principal.cpfCnpj.startsWith('PEND') || principal.cpfCnpj === '') && !secundario.cpfCnpj.startsWith('PEND') && secundario.cpfCnpj !== '') {
    updateData.cpfCnpj = secundario.cpfCnpj;
  }
  if (Object.keys(updateData).length > 0) {
    await db.update(clientes).set(updateData).where(eq(clientes.id, clientePrincipalId));
  }

  // Remover cliente secundário
  await db.delete(clientes).where(eq(clientes.id, clienteSecundarioId));

  // Registrar no histórico
  await db.insert(historicoCorrecoes).values({
    tipo: 'merge_clientes',
    acao: `Merge: ${secundario.nomeCompleto} (ID:${clienteSecundarioId}) → ${principal.nomeCompleto} (ID:${clientePrincipalId})`,
    detalhes: JSON.stringify({ principal: clientePrincipalId, secundario: clienteSecundarioId, camposAtualizados: Object.keys(updateData) }),
    executadoPor: 'agente_ia',
  });

  // Notificar
  await db.insert(notificacoes).values({
    tipo: 'correcao_executada',
    prioridade: 'normal',
    titulo: `Merge de clientes executado`,
    mensagem: `${secundario.nomeCompleto} foi unificado com ${principal.nomeCompleto}. Processos e dados transferidos.`,
    clienteId: clientePrincipalId,
    icone: 'Users',
    cor: 'green',
  });

  return JSON.stringify({
    sucesso: true,
    mensagem: `Merge concluído: ${secundario.nomeCompleto} (ID:${clienteSecundarioId}) → ${principal.nomeCompleto} (ID:${clientePrincipalId})`,
    camposAtualizados: Object.keys(updateData),
  });
}

// --- REMOVER REGISTRO ---
async function toolRemoverRegistro(args: any): Promise<string> {
  const db = await getDb();
  if (!db) return JSON.stringify({ erro: "Banco de dados indisponível" });

  const { tipo, id, motivo } = args;
  let resultado = '';

  switch (tipo) {
    case 'cliente': {
      // Verificar se tem processos vinculados
      const procs = await db.select({ id: processos.id }).from(processos).where(eq(processos.clienteId, id));
      if (procs.length > 0) {
        return JSON.stringify({ erro: `Cliente ID ${id} tem ${procs.length} processos vinculados. Faça merge ou transfira os processos antes de remover.` });
      }
      await db.delete(dadosFinanceiros).where(eq(dadosFinanceiros.clienteId, id));
      await db.delete(emprestimosConsignados).where(eq(emprestimosConsignados.clienteId, id));
      await db.delete(clientes).where(eq(clientes.id, id));
      resultado = `Cliente ID ${id} removido`;
      break;
    }
    case 'processo': {
      await db.delete(estrategias).where(eq(estrategias.processoId, id));
      await db.delete(partesProcessuais).where(eq(partesProcessuais.processoId, id));
      await db.delete(movimentacoes).where(eq(movimentacoes.processoId, id));
      await db.delete(movimentacoesFinanceiras).where(eq(movimentacoesFinanceiras.processoId, id));
      await db.delete(cumprimentosSentenca).where(eq(cumprimentosSentenca.processoId, id));
      await db.delete(documentos).where(eq(documentos.processoId, id));
      await db.delete(processos).where(eq(processos.id, id));
      resultado = `Processo ID ${id} e todos os dados vinculados removidos`;
      break;
    }
    case 'movimentacao': {
      await db.delete(movimentacoes).where(eq(movimentacoes.id, id));
      resultado = `Movimentação ID ${id} removida`;
      break;
    }
    case 'estrategia': {
      await db.delete(estrategias).where(eq(estrategias.id, id));
      resultado = `Estratégia ID ${id} removida`;
      break;
    }
    case 'emprestimo': {
      await db.delete(emprestimosConsignados).where(eq(emprestimosConsignados.id, id));
      resultado = `Empréstimo ID ${id} removido`;
      break;
    }
    case 'dado_financeiro': {
      await db.delete(dadosFinanceiros).where(eq(dadosFinanceiros.id, id));
      resultado = `Dado financeiro ID ${id} removido`;
      break;
    }
    default:
      return JSON.stringify({ erro: `Tipo desconhecido: ${tipo}` });
  }

  // Registrar no histórico
  await db.insert(historicoCorrecoes).values({
    tipo: `remocao_${tipo}`,
    acao: `Removido ${tipo} ID ${id}: ${motivo}`,
    detalhes: JSON.stringify({ tipo, id, motivo }),
    executadoPor: 'agente_ia',
  });

  return JSON.stringify({ sucesso: true, resultado, motivo });
}

// --- COMPLETAR MOVIMENTAÇÕES VIA DATAJUD ---
async function toolCompletarMovimentacoes(args: any): Promise<string> {
  const db = await getDb();
  if (!db) return JSON.stringify({ erro: "Banco de dados indisponível" });

  let proc: any = null;
  if (args.processoId) {
    [proc] = await db.select().from(processos).where(eq(processos.id, args.processoId)).limit(1);
  } else if (args.numeroCnj) {
    [proc] = await db.select().from(processos).where(eq(processos.numeroCnj, args.numeroCnj)).limit(1);
  }

  if (!proc) return JSON.stringify({ erro: "Processo não encontrado" });
  if (!proc.numeroCnj || proc.numeroCnj.startsWith('SEM_')) {
    return JSON.stringify({ erro: "Processo sem número CNJ válido" });
  }

  const numLimpo = proc.numeroCnj.replace(/[^0-9]/g, '');
  const DATAJUD_API = 'https://api-publica.datajud.cnj.jus.br/api_publica_tjgo/_search';


  try {
    const resp = await fetch(DATAJUD_API, {
      method: 'POST',
      headers: { 'Authorization': `APIKey ${ENV.datajudApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: { match: { numeroProcesso: numLimpo } }, size: 1 }),
    });

    if (!resp.ok) {
      return JSON.stringify({ erro: `DataJud retornou status ${resp.status}`, detalhes: await resp.text() });
    }

    const data = await resp.json();
    const hits = data?.hits?.hits || [];
    if (hits.length === 0) {
      return JSON.stringify({ encontrado: false, mensagem: `Processo ${proc.numeroCnj} não encontrado no DataJud` });
    }

    const source = hits[0]._source;
    const movsDataJud = source.movimentos || [];

    // Buscar movimentações existentes
    const movsExistentes = await db.select().from(movimentacoes).where(eq(movimentacoes.processoId, proc.id));
    const eventosExistentes = new Set(movsExistentes.map((m: any) => `${m.data}_${m.descricao?.substring(0, 50)}`));

    let novas = 0;
    for (const mov of movsDataJud.slice(0, 30)) {
      const dataStr = mov.dataHora?.split('T')[0] || new Date().toISOString().split('T')[0];
      const desc = mov.nome || mov.complementosTabelados?.map((c: any) => c.descricao).join(', ') || 'Movimentação';
      const chave = `${dataStr}_${desc.substring(0, 50)}`;
      if (!eventosExistentes.has(chave)) {
        await db.insert(movimentacoes).values({
          processoId: proc.id,
          data: dataStr,
          evento: `DataJud-${mov.codigo || 'auto'}`,
          descricao: desc,
        });
        novas++;
      }
    }

    // Atualizar dados do processo com informações do DataJud
    const updateProc: Record<string, any> = {};
    if (source.classe?.nome && !proc.classeProcessual) updateProc.classeProcessual = source.classe.nome;
    if (source.assuntos?.[0]?.nome && !proc.assunto) updateProc.assunto = source.assuntos[0].nome;
    if (source.orgaoJulgador?.nome && !proc.vara) updateProc.vara = source.orgaoJulgador.nome;
    if (Object.keys(updateProc).length > 0) {
      await db.update(processos).set(updateProc).where(eq(processos.id, proc.id));
    }

    return JSON.stringify({
      sucesso: true,
      processo: proc.numeroCnj,
      movimentacoesExistentes: movsExistentes.length,
      novasMovimentacoes: novas,
      totalDataJud: movsDataJud.length,
      dadosAtualizados: Object.keys(updateProc),
      ultimaMovimentacao: movsDataJud[0] ? { data: movsDataJud[0].dataHora, descricao: movsDataJud[0].nome } : null,
    });
  } catch (error: any) {
    return JSON.stringify({ erro: `Falha ao consultar DataJud: ${error.message}` });
  }
}

// --- ANALISAR PROCESSO TÉCNICO ---
async function toolAnalisarProcesso(args: any): Promise<string> {
  const db = await getDb();
  if (!db) return JSON.stringify({ erro: "Banco de dados indisponível" });

  const [proc] = await db.select().from(processos).where(eq(processos.id, args.processoId)).limit(1);
  if (!proc) return JSON.stringify({ erro: `Processo ID ${args.processoId} não encontrado` });

  const estrats = await db.select().from(estrategias).where(eq(estrategias.processoId, proc.id));
  const partes = await db.select().from(partesProcessuais).where(eq(partesProcessuais.processoId, proc.id));
  const movs = await db.select().from(movimentacoes).where(eq(movimentacoes.processoId, proc.id)).orderBy(desc(movimentacoes.createdAt));
  const movFin = await db.select().from(movimentacoesFinanceiras).where(eq(movimentacoesFinanceiras.processoId, proc.id));
  const cumps = await db.select().from(cumprimentosSentenca).where(eq(cumprimentosSentenca.processoId, proc.id));
  const [cliente] = proc.clienteId ? await db.select().from(clientes).where(eq(clientes.id, proc.clienteId)).limit(1) : [null];
  const emps = proc.clienteId ? await db.select().from(emprestimosConsignados).where(eq(emprestimosConsignados.clienteId, proc.clienteId)) : [];
  const fins = proc.clienteId ? await db.select().from(dadosFinanceiros).where(eq(dadosFinanceiros.clienteId, proc.clienteId)) : [];

  // Buscar conhecimentos relevantes
  const conhecs = await db.select().from(conhecimentos);
  const relevantes = conhecs.filter(c =>
    (c.tipoAcao && proc.tipoAcao && c.tipoAcao.toLowerCase().includes(proc.tipoAcao.toLowerCase())) ||
    (c.processoOrigemId === proc.id)
  );

  const contexto = `PROCESSO: ${proc.numeroCnj}
Tipo: ${proc.tipoAcao} | Classe: ${proc.classeProcessual || 'N/A'} | Natureza: ${proc.natureza || 'N/A'}
Vara: ${proc.vara} | Comarca: ${proc.comarca} | Tribunal: ${proc.tribunal}
Valor: R$ ${proc.valorCausa} | Fase: ${proc.faseAtual} | Status: ${proc.statusProcesso}
Juiz: ${proc.juiz || 'N/A'}
Polo Ativo: ${proc.poloAtivo} | Polo Passivo: ${proc.poloPassivo}
Sentença: ${proc.resumoSentenca || 'N/A'}
Condenação: R$ ${proc.valorCondenacao || 'N/A'} | Honorários: ${proc.honorariosPerc || 'N/A'}%
Tutela: ${proc.tutelaTipo || 'N/A'} (${proc.tutelaStatus || 'N/A'})

CLIENTE: ${cliente?.nomeCompleto || 'N/A'} | CPF: ${cliente?.cpfCnpj || 'N/A'}
Profissão: ${cliente?.profissao || 'N/A'} | Órgão: ${cliente?.orgaoEmpregador || 'N/A'}
Financeiro: ${fins.map(f => `Bruto R$ ${f.remuneracaoBruta} | Líq R$ ${f.remuneracaoLiquida} | Margem R$ ${f.margemConsignavelValor}`).join('; ') || 'N/A'}
Empréstimos: ${emps.map(e => `${e.banco}: R$ ${e.valorParcela}/mês`).join('; ') || 'Nenhum'}

PARTES: ${partes.map(p => `${p.tipo}: ${p.nome} (${p.cpfCnpj || 'N/A'})`).join('; ')}

ESTRATÉGIAS EXISTENTES: ${estrats.map(e => `Tese: ${e.tesePrincipal}\nFund: ${e.fundamentacaoLegal}\nJurisp: ${e.jurisprudenciaCitada}`).join('\n---\n') || 'Nenhuma'}

MOVIMENTAÇÕES (${movs.length}): ${movs.slice(0, 20).map(m => `${m.data}: ${m.evento} — ${m.descricao}`).join('\n')}

FINANCEIRO PROCESSUAL: ${movFin.map(m => `${m.tipo}: R$ ${m.valor} (${m.status})`).join('; ') || 'N/A'}
CUMPRIMENTOS: ${cumps.map(c => `${c.tipo}: Exec R$ ${c.valorExecucao}`).join('; ') || 'Nenhum'}

CONHECIMENTOS RELEVANTES: ${relevantes.slice(0, 10).map(c => `[${c.categoria}] ${c.titulo}: ${c.conteudo?.substring(0, 300)}`).join('\n')}`;

  const result = await invokeLLM({
    messages: [
      {
        role: 'system',
        content: `Você é um advogado expert do escritório Melo & Preda. Realize uma ANÁLISE TÉCNICA APROFUNDADA e EXAUSTIVA do processo.
${args.focoAnalise ? `FOCO DA ANÁLISE: ${args.focoAnalise}` : ''}

Sua análise DEVE conter:
1. SÍNTESE DO CASO
2. TESES JURÍDICAS APLICÁVEIS (com artigos de lei e jurisprudência)
3. PONTOS FORTES DO CASO
4. RISCOS E PONTOS FRACOS
5. ESTRATÉGIA RECOMENDADA
6. PRÓXIMOS PASSOS PROCESSUAIS
7. CÁLCULOS (se aplicável)
8. JURISPRUDÊNCIA DE APOIO (TJ-GO e STJ preferencialmente)

Retorne em JSON com os campos: sintese, tesesAplicaveis, fundamentacaoLegal, jurisprudenciaCitada, pontosFortes, riscosIdentificados, estrategiaRecomendada, proximosPassos, calculos, observacoes`
      },
      { role: 'user', content: contexto }
    ],
    responseFormat: { type: 'json_object' },
  });

  const rawContent = result.choices?.[0]?.message?.content;
  const textContent = typeof rawContent === 'string' ? rawContent : '';
  let analise: any = {};
  try { analise = JSON.parse(textContent); } catch { analise = { sintese: textContent }; }

  // Salvar como nova estratégia
  await db.insert(estrategias).values({
    processoId: proc.id,
    tesePrincipal: analise.tesesAplicaveis || analise.sintese || 'Análise técnica',
    fundamentacaoLegal: analise.fundamentacaoLegal || '',
    jurisprudenciaCitada: analise.jurisprudenciaCitada || '',
    pontosFortes: analise.pontosFortes || '',
    riscosIdentificados: analise.riscosIdentificados || '',
    tesesRefutadas: analise.estrategiaRecomendada || '',
    observacoes: `${analise.proximosPassos || ''}\n${analise.calculos || ''}\n${analise.observacoes || ''}`.trim(),
    createdAt: new Date(),
  });

  return JSON.stringify({
    sucesso: true,
    processo: proc.numeroCnj,
    analise,
    salvaComoEstrategia: true,
  });
}

// --- GERAR PETIÇÃO ---
async function toolGerarPeticao(args: any): Promise<string> {
  const db = await getDb();
  if (!db) return JSON.stringify({ erro: "Banco de dados indisponível" });

  // Buscar contexto
  let contextoCliente = '';
  let contextoProcesso = '';
  let nomeCliente = 'Cliente';
  let numeroProcesso = '';

  if (args.clienteId) {
    const [cliente] = await db.select().from(clientes).where(eq(clientes.id, args.clienteId)).limit(1);
    if (cliente) {
      nomeCliente = cliente.nomeCompleto;
      const procs = await db.select().from(processos).where(eq(processos.clienteId, cliente.id));
      const emps = await db.select().from(emprestimosConsignados).where(eq(emprestimosConsignados.clienteId, cliente.id));
      const fins = await db.select().from(dadosFinanceiros).where(eq(dadosFinanceiros.clienteId, cliente.id));
      contextoCliente = `CLIENTE: ${cliente.nomeCompleto}, CPF: ${cliente.cpfCnpj}
Profissão: ${cliente.profissao || 'N/A'} | Órgão: ${cliente.orgaoEmpregador || 'N/A'}
Endereço: ${cliente.endereco || 'N/A'}, ${cliente.cidade || ''} - ${cliente.estado || ''}
Financeiro: ${fins.map(d => `Bruto: R$ ${d.remuneracaoBruta} | Líquido: R$ ${d.remuneracaoLiquida} | Margem: R$ ${d.margemConsignavelValor}`).join('; ')}
Empréstimos: ${emps.map(e => `${e.banco}: R$ ${e.valorParcela}/mês`).join('; ')}
Processos: ${procs.map(p => `${p.numeroCnj} (${p.tipoAcao} - ${p.statusProcesso})`).join('; ')}`;
    }
  }

  if (args.processoId) {
    const [proc] = await db.select().from(processos).where(eq(processos.id, args.processoId)).limit(1);
    if (proc) {
      numeroProcesso = proc.numeroCnj || '';
      const estrats = await db.select().from(estrategias).where(eq(estrategias.processoId, proc.id));
      const movs = await db.select().from(movimentacoes).where(eq(movimentacoes.processoId, proc.id)).orderBy(desc(movimentacoes.createdAt)).limit(15);
      const partes = await db.select().from(partesProcessuais).where(eq(partesProcessuais.processoId, proc.id));
      contextoProcesso = `PROCESSO: ${proc.numeroCnj}
Tipo: ${proc.tipoAcao} | Vara: ${proc.vara} | Comarca: ${proc.comarca} | Tribunal: ${proc.tribunal}
Valor: R$ ${proc.valorCausa} | Fase: ${proc.faseAtual} | Status: ${proc.statusProcesso}
Polo Ativo: ${proc.poloAtivo} | Polo Passivo: ${proc.poloPassivo}
Partes: ${partes.map(p => `${p.tipo}: ${p.nome}`).join('; ')}
Sentença: ${proc.resumoSentenca || 'N/A'}
Condenação: R$ ${proc.valorCondenacao || 'N/A'} | Honorários: ${proc.honorariosPerc || 'N/A'}%
Estratégias: ${estrats.map(e => `Tese: ${e.tesePrincipal}\nFund: ${e.fundamentacaoLegal}`).join('\n---\n')}
Movimentações: ${movs.map(m => `${m.data}: ${m.evento}`).join('\n')}`;
    }
  }

  // Buscar templates e conhecimentos com busca semântica
  const templates = await db.select().from(templatesPeticao).where(eq(templatesPeticao.ativo, 1));
  const conhecs = await db.select().from(conhecimentos);
  
  // Busca semântica por relevância ao tipo de petição
  const termosMap: Record<string, string[]> = {
    'obrigacao': ['obrigação', 'fazer', 'consignado', 'margem', 'tutela', 'CDC'],
    'declaratoria': ['inexistência', 'débito', 'desconto', 'indevido', 'restituição'],
    'cumprimento': ['cumprimento', 'sentença', 'execução', '523', 'multa'],
    'honorarios': ['honorários', 'sucumbência', 'autônomo', '85'],
    'agravo': ['agravo', 'instrumento', 'efeito suspensivo'],
    'contrarrazoes': ['contrarrazões', 'apelação', 'manutenção'],
    'querela': ['querela', 'nullitatis', 'nulidade', 'citação'],
    'embargos': ['embargos', 'declaração', 'omissão'],
    'repactuacao': ['superendividamento', 'repactuação', 'mínimo existencial'],
    'execucao': ['execução', 'título', 'penhora'],
    'impugnacao': ['impugnação', 'excesso', 'prescrição'],
  };
  const tipoKey = Object.keys(termosMap).find(k => args.tipoPeticao.toLowerCase().includes(k)) || '';
  const termos = termosMap[tipoKey] || [];
  
  function calcRelevancia(c: any): number {
    if (!termos.length) return 1;
    const txt = `${c.titulo || ''} ${c.conteudo || ''} ${c.tipoAcao || ''}`.toLowerCase();
    return termos.filter(t => txt.includes(t.toLowerCase())).length;
  }
  
  const ordenados = conhecs.map(c => ({ ...c, rel: calcRelevancia(c) })).sort((a, b) => b.rel - a.rel);
  const teses = ordenados.filter(c => c.categoria === 'Tese').slice(0, 25).map(t => `- ${t.titulo}: ${t.conteudo?.substring(0, 300)}`).join('\n');
  const jurisp = ordenados.filter(c => c.categoria === 'Jurisprudencia').slice(0, 20).map(j => `- ${j.titulo}: ${j.conteudo?.substring(0, 250)}`).join('\n');
  const estrats = ordenados.filter(c => c.categoria === 'Estrategia').slice(0, 10).map(e => `- ${e.titulo}: ${e.conteudo?.substring(0, 200)}`).join('\n');
  const legs = ordenados.filter(c => c.categoria === 'Legislacao').slice(0, 15).map(l => `- ${l.titulo}: ${l.conteudo?.substring(0, 200)}`).join('\n');

  const systemPrompt = `Você é o PETICIONADOR EXPERT do escritório Melo & Preda Advogados (OAB/GO 40.559).
Advogado: PAULO DA SILVA MELO FILHO

Gere a petição completa do tipo "${args.tipoPeticao}".

ESTILO DE REDAÇÃO OBRIGATÓRIO:
- Tom ASSERTIVO, COMBATIVO e TÉCNICO — sem hesitação ou condicional desnecessário
- Fundamentação ROBUSTA com artigos de lei, doutrina e jurisprudência
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
5. III — DOS PEDIDOS (numerados com letras: a), b), c)... — específicos e detalhados)
6. IV — DO VALOR DA CAUSA (com valor por extenso)
7. REQUERIMENTOS FINAIS
8. FECHO (Nestes termos, pede deferimento. [Cidade], [data]. PAULO DA SILVA MELO FILHO — OAB/GO 40.559)

ESTRATÉGIAS PROCESSUAIS RELEVANTES:
${estrats}

TESES DISPONÍVEIS (ordenadas por relevância):
${teses}

JURISPRUDÊNCIA APLICÁVEL (ordenada por relevância):
${jurisp}

LEGISLAÇÃO APLICÁVEL:
${legs}

TEMPLATES DISPONÍVEIS (escolha o mais adequado):
${templates.map(t => `[${t.nome}] ${t.tipo}: ${t.descricao}`).join('\n')}

${contextoCliente}
${contextoProcesso}

${args.instrucoes ? `INSTRUÇÕES DO ADVOGADO: ${args.instrucoes}` : ''}

Gere a petição COMPLETA, pronta para protocolo. Use formatação Markdown.`;

  const result = await invokeLLM({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Gere a petição de ${args.tipoPeticao} completa.` }
    ]
  });

  const rawContent = result.choices?.[0]?.message?.content;
  const peticaoTexto = typeof rawContent === 'string' ? rawContent : 'Erro ao gerar petição.';

  // Salvar no S3
  const timestamp = Date.now();
  const nomeArquivo = `peticoes/${args.tipoPeticao.replace(/\s+/g, '_')}_${nomeCliente.replace(/\s+/g, '_')}_${timestamp}.md`;
  const { url } = await storagePut(nomeArquivo, peticaoTexto, 'text/markdown');

  // Gerar DOCX
  let docxUrl = '';
  try {
    const docxBuffer = await gerarPeticaoDocx(peticaoTexto, `${args.tipoPeticao} — ${nomeCliente}`);
    const docxNome = `peticoes/${args.tipoPeticao.replace(/\s+/g, '_')}_${nomeCliente.replace(/\s+/g, '_')}_${timestamp}.docx`;
    const docxResult = await storagePut(docxNome, docxBuffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    docxUrl = docxResult.url;
  } catch (e: any) {
    console.error('Erro ao gerar DOCX:', e);
  }

  // Salvar no banco
  await db.insert(peticoesGeradas).values({
    processoId: args.processoId || null,
    clienteId: args.clienteId || null,
    tipo: args.tipoPeticao,
    titulo: `${args.tipoPeticao} — ${nomeCliente}`,
    conteudoJson: JSON.stringify({ texto: peticaoTexto, docxUrl }),
    conteudoTexto: peticaoTexto,
    status: 'rascunho',
    storageUrl: url,
    geradoPor: 'agente_ia',
  });

  return JSON.stringify({
    sucesso: true,
    tipoPeticao: args.tipoPeticao,
    cliente: nomeCliente,
    processo: numeroProcesso,
    markdownUrl: url,
    docxUrl,
    tamanho: peticaoTexto.length,
    resumo: peticaoTexto.substring(0, 500) + '...',
  });
}

// --- ATUALIZAR DADOS CLIENTE ---
async function toolAtualizarCliente(args: any): Promise<string> {
  const db = await getDb();
  if (!db) return JSON.stringify({ erro: "Banco de dados indisponível" });

  const [cliente] = await db.select().from(clientes).where(eq(clientes.id, args.clienteId)).limit(1);
  if (!cliente) return JSON.stringify({ erro: `Cliente ID ${args.clienteId} não encontrado` });

  const updateData: Record<string, any> = {};
  for (const [key, value] of Object.entries(args.dados || {})) {
    if (value !== undefined && value !== null && value !== '') {
      updateData[key] = value;
    }
  }

  if (Object.keys(updateData).length === 0) {
    return JSON.stringify({ erro: "Nenhum dado para atualizar" });
  }

  await db.update(clientes).set(updateData).where(eq(clientes.id, args.clienteId));

  return JSON.stringify({
    sucesso: true,
    cliente: cliente.nomeCompleto,
    camposAtualizados: Object.keys(updateData),
    valoresAnteriores: Object.keys(updateData).reduce((acc, k) => ({ ...acc, [k]: (cliente as any)[k] }), {}),
  });
}

// --- ATUALIZAR DADOS PROCESSO ---
async function toolAtualizarProcesso(args: any): Promise<string> {
  const db = await getDb();
  if (!db) return JSON.stringify({ erro: "Banco de dados indisponível" });

  const [proc] = await db.select().from(processos).where(eq(processos.id, args.processoId)).limit(1);
  if (!proc) return JSON.stringify({ erro: `Processo ID ${args.processoId} não encontrado` });

  const updateData: Record<string, any> = {};
  for (const [key, value] of Object.entries(args.dados || {})) {
    if (value !== undefined && value !== null && value !== '') {
      updateData[key] = value;
    }
  }

  if (Object.keys(updateData).length === 0) {
    return JSON.stringify({ erro: "Nenhum dado para atualizar" });
  }

  await db.update(processos).set(updateData).where(eq(processos.id, args.processoId));

  return JSON.stringify({
    sucesso: true,
    processo: proc.numeroCnj,
    camposAtualizados: Object.keys(updateData),
  });
}

// --- CONSULTAR ESTATÍSTICAS ---
async function toolConsultarEstatisticas(_args: any): Promise<string> {
  const db = await getDb();
  if (!db) return JSON.stringify({ erro: "Banco de dados indisponível" });

  const [totalClientes] = await db.select({ count: sql<number>`COUNT(*)` }).from(clientes);
  const [totalProcessos] = await db.select({ count: sql<number>`COUNT(*)` }).from(processos);
  const [totalConhecimentos] = await db.select({ count: sql<number>`COUNT(*)` }).from(conhecimentos);
  const [totalEstrategias] = await db.select({ count: sql<number>`COUNT(*)` }).from(estrategias);
  const [totalPeticoes] = await db.select({ count: sql<number>`COUNT(*)` }).from(peticoesGeradas);
  const [totalMovimentacoes] = await db.select({ count: sql<number>`COUNT(*)` }).from(movimentacoes);
  const [totalPrazos] = await db.select({ count: sql<number>`COUNT(*)` }).from(prazosProcessuais);

  const todosProcs = await db.select({ valorCausa: processos.valorCausa, statusProcesso: processos.statusProcesso, faseAtual: processos.faseAtual, tipoAcao: processos.tipoAcao }).from(processos);
  const totalValor = todosProcs.reduce((acc, p) => acc + Number(p.valorCausa || 0), 0);

  const porStatus: Record<string, number> = {};
  const porFase: Record<string, number> = {};
  const porTipo: Record<string, number> = {};
  todosProcs.forEach(p => {
    porStatus[p.statusProcesso || 'N/A'] = (porStatus[p.statusProcesso || 'N/A'] || 0) + 1;
    porFase[p.faseAtual || 'N/A'] = (porFase[p.faseAtual || 'N/A'] || 0) + 1;
    porTipo[p.tipoAcao || 'N/A'] = (porTipo[p.tipoAcao || 'N/A'] || 0) + 1;
  });

  return JSON.stringify({
    totalClientes: totalClientes.count,
    totalProcessos: totalProcessos.count,
    totalConhecimentos: totalConhecimentos.count,
    totalEstrategias: totalEstrategias.count,
    totalPeticoes: totalPeticoes.count,
    totalMovimentacoes: totalMovimentacoes.count,
    totalPrazos: totalPrazos.count,
    valorTotalCausas: totalValor,
    processosPorStatus: porStatus,
    processosPorFase: porFase,
    processosPorTipo: porTipo,
  });
}


// --- EDITAR PETIÇÃO ---
async function toolEditarPeticao(args: any): Promise<string> {
  const db = await getDb();
  if (!db) return JSON.stringify({ erro: "Banco de dados indisponível" });

  const [pet] = await db.select().from(peticoesGeradas).where(eq(peticoesGeradas.id, args.peticaoId)).limit(1);
  if (!pet) return JSON.stringify({ erro: `Petição ID ${args.peticaoId} não encontrada` });

  let novoTexto = args.novoTexto;

  // Se tem instruções de edição mas não texto novo, usar LLM para editar
  if (!novoTexto && args.instrucoes) {
    const editResult = await invokeLLM({
      messages: [
        { role: 'system', content: `Você é o PETICIONADOR EXPERT do escritório Melo & Preda Advogados (OAB/GO 40.559).
Edite a petição abaixo conforme as instruções do advogado. Mantenha o mesmo estilo, formatação e qualidade.
Retorne APENAS o texto completo da petição editada, sem comentários.` },
        { role: 'user', content: `PETIÇÃO ATUAL:\n${pet.conteudoTexto}\n\nINSTRUÇÕES DE EDIÇÃO: ${args.instrucoes}` }
      ]
    });
    const raw = editResult.choices?.[0]?.message?.content;
    novoTexto = typeof raw === 'string' ? raw : pet.conteudoTexto;
  }

  if (!novoTexto) return JSON.stringify({ erro: "Nenhum texto novo ou instruções fornecidas" });

  // Salvar no S3
  const timestamp = Date.now();
  const nomeArquivo = `peticoes/editada_${pet.id}_${timestamp}.md`;
  const { url } = await storagePut(nomeArquivo, novoTexto, 'text/markdown');

  // Gerar novo DOCX
  let docxUrl = '';
  try {
    const docxBuffer = await gerarPeticaoDocx(novoTexto, pet.titulo || 'Petição Editada');
    const docxNome = `peticoes/editada_${pet.id}_${timestamp}.docx`;
    const docxResult = await storagePut(docxNome, docxBuffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    docxUrl = docxResult.url;
  } catch (e: any) {
    console.error('Erro ao gerar DOCX editado:', e);
  }

  // Atualizar no banco
  await db.update(peticoesGeradas).set({
    conteudoTexto: novoTexto,
    conteudoJson: JSON.stringify({ texto: novoTexto, docxUrl }),
    storageUrl: url,
  }).where(eq(peticoesGeradas.id, args.peticaoId));

  return JSON.stringify({
    sucesso: true,
    peticaoId: args.peticaoId,
    titulo: pet.titulo,
    markdownUrl: url,
    docxUrl,
    tamanho: novoTexto.length,
    resumo: novoTexto.substring(0, 500) + '...',
  });
}

// --- LISTAR PETIÇÕES ---
async function toolListarPeticoes(args: any): Promise<string> {
  const db = await getDb();
  if (!db) return JSON.stringify({ erro: "Banco de dados indisponível" });

  let rows: any[];
  if (args.clienteId) {
    rows = await db.select({
      id: peticoesGeradas.id,
      tipo: peticoesGeradas.tipo,
      titulo: peticoesGeradas.titulo,
      status: peticoesGeradas.status,
      clienteId: peticoesGeradas.clienteId,
      processoId: peticoesGeradas.processoId,
      createdAt: peticoesGeradas.createdAt,
    }).from(peticoesGeradas).where(eq(peticoesGeradas.clienteId, args.clienteId)).orderBy(desc(peticoesGeradas.createdAt)).limit(50);
  } else if (args.processoId) {
    rows = await db.select({
      id: peticoesGeradas.id,
      tipo: peticoesGeradas.tipo,
      titulo: peticoesGeradas.titulo,
      status: peticoesGeradas.status,
      clienteId: peticoesGeradas.clienteId,
      processoId: peticoesGeradas.processoId,
      createdAt: peticoesGeradas.createdAt,
    }).from(peticoesGeradas).where(eq(peticoesGeradas.processoId, args.processoId)).orderBy(desc(peticoesGeradas.createdAt)).limit(50);
  } else {
    rows = await db.select({
      id: peticoesGeradas.id,
      tipo: peticoesGeradas.tipo,
      titulo: peticoesGeradas.titulo,
      status: peticoesGeradas.status,
      clienteId: peticoesGeradas.clienteId,
      processoId: peticoesGeradas.processoId,
      createdAt: peticoesGeradas.createdAt,
    }).from(peticoesGeradas).orderBy(desc(peticoesGeradas.createdAt)).limit(50);
  }

  return JSON.stringify({
    total: rows.length,
    peticoes: rows.map(r => ({
      id: r.id,
      tipo: r.tipo,
      titulo: r.titulo,
      status: r.status,
      clienteId: r.clienteId,
      processoId: r.processoId,
      criadoEm: r.createdAt,
    })),
  });
}

// ==================== AGENT EXECUTION LOOP ====================

export interface AgentExecutionResult {
  resposta: string;
  acoesExecutadas: {
    tool: string;
    args: any;
    resultado: string;
    sucesso: boolean;
  }[];
  totalTools: number;
}

export async function executarAgenteCompleto(params: {
  mensagem: string;
  historico: { role: 'user' | 'assistant'; content: string }[];
  clienteId?: number;
  processoId?: number;
  modo?: string;
  panoramaGlobal: string;
  baseConhecimento: string;
  configExpertise: string;
  contextoCliente: string;
  contextoProcesso: string;
}): Promise<AgentExecutionResult> {
  const acoesExecutadas: AgentExecutionResult['acoesExecutadas'] = [];
  const MAX_ITERATIONS = 5; // Máximo de ciclos de tool calling (otimizado para evitar timeout)

  // System prompt PROATIVO — sempre consulta o banco antes de responder
  const systemPrompt = `Você é o Agente Jurídico Expert EXECUTOR do escritório Melo & Preda Advogados.
Advogado: PAULO DA SILVA MELO FILHO — OAB/GO 40.559

## REGRA ABSOLUTA — NUNCA QUEBRE ESTAS REGRAS:
1. NUNCA peça documentos, PDFs ou arquivos ao usuário — TODOS os dados já estão no banco de dados
2. NUNCA diga "preciso de mais informações" ou "envie o documento" — USE AS TOOLS para buscar
3. SEMPRE execute tools ANTES de responder — busque dados reais do banco
4. NUNCA invente dados — use APENAS o que as tools retornarem
5. Se o usuário mencionar um cliente ou processo, USE buscar_cliente ou buscar_processo IMEDIATAMENTE
6. Se o usuário pedir petição, USE gerar_peticao IMEDIATAMENTE — os dados já estão no banco

## WORKFLOW DE PETICIONAMENTO AVANÇADO — 5 FASES OBRIGATÓRIAS:
### FASE 1: IMERSÃO E ANÁLISE ESTRATÉGICA
- Buscar TODOS os dados do processo e cliente com tools antes de qualquer ação
- Identificar: Sentença (dispositivo), Recursos (quem apelou), Acórdãos, Trânsito em Julgado
- Analisar preclusão lógica e trânsito em julgado parcial (litisconsórcio simples)
- Mapear cronologia processual completa

### FASE 2: DEFINIÇÃO DA TESE E ESTRUTURAÇÃO
- Cumprimento Provisório: recurso pendente sem efeito suspensivo
- Cumprimento Definitivo: trânsito em julgado total ou parcial
- Ação Autônoma: direito reconhecido com consequências não abarcadas
- Agravo de Instrumento: contra decisões interlocutórias com gravame
- Buscar jurisprudência atualizada na base de conhecimentos (TJ-GO e STJ)

### FASE 3: CÁLCULOS E PLANILHAS
- Extrair valores base do processo, aplicar INPC e juros 1% a.m.
- Multa e honorários art. 523 §1º CPC quando aplicável

### FASE 4: REDAÇÃO JURÍDICA
- Tom ASSERTIVO, TÉCNICO e COMBATIVO — sem hesitação
- Expressões: "flagrante ilegalidade", "abuso manifesto", "violação frontal"
- Fundamentação: Legislação → Jurisprudência → Doutrina
- Pedidos numerados, específicos, com valores exatos

### FASE 5: REVISÃO DE QUALIDADE
- Verificar consistência argumentativa e dados (nomes, valores, artigos)
- Conferir formatação padrão do escritório

## SEU COMPORTAMENTO OBRIGATÓRIO:
- Ao receber QUALQUER mensagem, sua PRIMEIRA ação deve ser usar uma tool para buscar dados relevantes
- Se há um cliente selecionado (clienteId), use buscar_cliente para ter dados completos
- Se há um processo selecionado (processoId), use buscar_processo para ter dados completos
- Após buscar, RESPONDA com base nos dados reais encontrados
- Se o usuário pedir análise → buscar_processo + analisar_processo_tecnico
- Se o usuário pedir petição → gerar_peticao (a tool já puxa todos os dados necessários)
- Se o usuário pedir correção → diagnosticar_banco + ação corretiva
- Se o usuário pedir estatísticas → consultar_estatisticas
- Se o usuário pedir para completar movimentações → completar_movimentacoes
- Se o usuário pedir para atualizar dados → atualizar_dados_cliente ou atualizar_dados_processo
- Se o usuário pedir para remover algo → remover_registro
- Se o usuário pedir merge de duplicados → merge_clientes

## INTEGRAÇÃO PROJUDI-GO:
Você tem acesso ao PROJUDI-GO (login: 03692215169). Quando o usuário perguntar sobre publicações, intimações ou status de processos no PROJUDI:
- Classifique publicações em Cat. 1 (ciência), Cat. 2 (alerta+análise), Cat. 3 (agenda)
- Prioridades: URGENTE (≤3 dias), ATENÇÃO (4-10 dias), NORMAL (+10 dias), INFORMATIVO
- Processos parados +30 dias = PARADO, +60 dias = PARADO CRÍTICO
- Prazos: Apelação/Agravo/Contestação = 15 dias úteis, ED = 5 dias úteis
- URL busca: https://projudi.tjgo.jus.br/BuscaProcesso?PaginaAtual=2&Paginacao=true&PosicaoPaginaAtual=0&PassoBusca=1

## CONTEXTO ATUAL:
${params.clienteId ? `CLIENTE SELECIONADO: ID ${params.clienteId} — Busque com buscar_cliente para dados completos` : 'Nenhum cliente selecionado'}
${params.processoId ? `PROCESSO SELECIONADO: ID ${params.processoId} — Busque com buscar_processo para dados completos` : 'Nenhum processo selecionado'}

## DADOS DO ESCRITÓRIO (já carregados do banco):
${params.panoramaGlobal}

${params.baseConhecimento}${params.configExpertise}${params.contextoCliente}${params.contextoProcesso}

Responda SEMPRE em português brasileiro. Seja direto, técnico e assertivo.`;

  // Build messages
  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    ...params.historico.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
    { role: 'user', content: params.mensagem },
  ];

  // Execution loop
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const result: InvokeResult = await invokeLLM({
      messages,
      tools: AGENT_TOOLS,
      toolChoice: iteration === 0 ? 'auto' : 'auto',
    });

    const choice = result.choices?.[0];
    if (!choice) break;

    const assistantMessage = choice.message;

    // Check if the model wants to call tools
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      // Add assistant message with tool calls to conversation
      messages.push({
        role: 'assistant',
        content: typeof assistantMessage.content === 'string' ? assistantMessage.content || '' : '',
        // @ts-ignore - tool_calls is part of the message
        tool_calls: assistantMessage.tool_calls,
      } as any);

      // Execute each tool call
      for (const toolCall of assistantMessage.tool_calls) {
        const toolName = toolCall.function.name;
        let toolArgs: any = {};
        try {
          toolArgs = JSON.parse(toolCall.function.arguments);
        } catch {
          toolArgs = {};
        }

        console.log(`[AgenteExecutor] Executando tool: ${toolName}`, JSON.stringify(toolArgs).substring(0, 200));
        const toolResult = await executarTool(toolName, toolArgs);
        console.log(`[AgenteExecutor] Resultado: ${toolResult.substring(0, 200)}`);

        let sucesso = true;
        try {
          const parsed = JSON.parse(toolResult);
          sucesso = !parsed.erro;
        } catch {}

        acoesExecutadas.push({
          tool: toolName,
          args: toolArgs,
          resultado: toolResult.substring(0, 2000),
          sucesso,
        });

        // Add tool result to conversation
        messages.push({
          role: 'tool',
          content: toolResult,
          tool_call_id: toolCall.id,
          name: toolName,
        } as any);
      }

      // Continue the loop to let the model process tool results
      continue;
    }

    // No tool calls — model is done, return the final response
    const rawContent = assistantMessage.content;
    const resposta = typeof rawContent === 'string' ? rawContent : 'Processamento concluído.';

    return {
      resposta,
      acoesExecutadas,
      totalTools: acoesExecutadas.length,
    };
  }

  // If we hit max iterations, return what we have
  return {
    resposta: 'Processamento concluído após múltiplas ações executadas. Verifique os resultados acima.',
    acoesExecutadas,
    totalTools: acoesExecutadas.length,
  };
}


// --- BUSCAR CONHECIMENTO ---
async function toolBuscarConhecimento(args: any): Promise<string> {
  const db = await getDb();
  if (!db) return JSON.stringify({ erro: "Banco de dados indisponível" });

  const { termo, categoria, tipoAcao } = args;
  let query = db.select().from(conhecimentos);
  const conditions: any[] = [];

  if (categoria) {
    conditions.push(eq(conhecimentos.categoria, categoria));
  }
  if (tipoAcao) {
    conditions.push(like(conhecimentos.tipoAcao, `%${tipoAcao}%`));
  }

  let results: any[];
  if (conditions.length > 0) {
    results = await query.where(and(...conditions)).orderBy(desc(conhecimentos.createdAt)).limit(30);
  } else {
    results = await query.orderBy(desc(conhecimentos.createdAt)).limit(30);
  }

  // Filtrar por termo se fornecido
  if (termo) {
    const termoLower = termo.toLowerCase();
    const termos = termoLower.split(/\s+/).filter((t: string) => t.length > 2);
    results = results.filter((c: any) => {
      const texto = `${c.titulo || ''} ${c.conteudo || ''} ${c.tags || ''} ${c.tipoAcao || ''}`.toLowerCase();
      return termos.some((t: string) => texto.includes(t));
    });
  }

  return JSON.stringify({
    encontrados: results.length,
    conhecimentos: results.slice(0, 20).map((c: any) => ({
      id: c.id,
      titulo: c.titulo,
      categoria: c.categoria,
      tipoAcao: c.tipoAcao,
      tags: c.tags,
      conteudo: typeof c.conteudo === 'string' && c.conteudo.length > 500 
        ? c.conteudo.substring(0, 500) + '...' 
        : c.conteudo,
    })),
  });
}

// --- CALCULAR DÉBITO JUDICIAL ---
async function toolCalcularDebitoJudicial(args: any): Promise<string> {
  const {
    valor_principal,
    indice_correcao = 'IPCA',
    juros_mensais = 1,
    meses = 12,
    data_inicio,
    multa_percentual = 0,
    honorarios_percentual = 0,
  } = args;

  if (!valor_principal || valor_principal <= 0) {
    return JSON.stringify({ erro: "Valor principal deve ser maior que zero" });
  }

  // Taxas mensais aproximadas dos índices de correção
  const taxasCorrecao: Record<string, number> = {
    'IPCA': 0.44,    // ~5.3% a.a.
    'INPC': 0.42,    // ~5.1% a.a.
    'IGP-M': 0.35,   // ~4.2% a.a.
    'SELIC': 0.87,   // ~10.5% a.a. (inclui juros)
    'TR': 0.08,      // ~1% a.a.
  };

  const taxaCorrecaoMensal = taxasCorrecao[indice_correcao] || 0.44;
  const taxaJurosMensal = juros_mensais / 100;

  // Cálculo mês a mês
  let valorCorrigido = valor_principal;
  let totalJuros = 0;
  let totalCorrecao = 0;

  for (let i = 0; i < meses; i++) {
    const correcaoMes = valorCorrigido * (taxaCorrecaoMensal / 100);
    totalCorrecao += correcaoMes;
    valorCorrigido += correcaoMes;
    
    const jurosMes = valorCorrigido * taxaJurosMensal;
    totalJuros += jurosMes;
  }

  const valorComJuros = valorCorrigido + totalJuros;
  const multa = multa_percentual > 0 ? valorComJuros * (multa_percentual / 100) : 0;
  const honorarios = honorarios_percentual > 0 ? valorComJuros * (honorarios_percentual / 100) : 0;
  const totalGeral = valorComJuros + multa + honorarios;

  return JSON.stringify({
    calculo: {
      valor_principal: valor_principal.toFixed(2),
      indice_correcao,
      taxa_correcao_mensal: `${taxaCorrecaoMensal}%`,
      juros_mensais: `${juros_mensais}%`,
      periodo_meses: meses,
      data_inicio: data_inicio || 'não informada',
      correcao_monetaria: totalCorrecao.toFixed(2),
      valor_corrigido: valorCorrigido.toFixed(2),
      juros_totais: totalJuros.toFixed(2),
      valor_com_juros: valorComJuros.toFixed(2),
      multa: multa.toFixed(2),
      multa_percentual: `${multa_percentual}%`,
      honorarios: honorarios.toFixed(2),
      honorarios_percentual: `${honorarios_percentual}%`,
      total_geral: totalGeral.toFixed(2),
    },
    observacao: `Cálculo aproximado usando taxa média do ${indice_correcao}. Para valores exatos, consulte a tabela oficial do tribunal.`,
  });
}

// --- CONSULTAR PRAZOS ---
async function toolConsultarPrazos(args: any): Promise<string> {
  const db = await getDb();
  if (!db) return JSON.stringify({ erro: "Banco de dados indisponível" });

  const { clienteId, processoId, status } = args;
  const conditions: any[] = [];

  if (processoId) conditions.push(eq(prazosProcessuais.processoId, processoId));
  if (status) conditions.push(eq(prazosProcessuais.status, status));

  let results: any[];
  if (conditions.length > 0) {
    results = await db.select().from(prazosProcessuais)
      .where(and(...conditions))
      .orderBy(prazosProcessuais.dataVencimento)
      .limit(50);
  } else {
    results = await db.select().from(prazosProcessuais)
      .orderBy(prazosProcessuais.dataVencimento)
      .limit(50);
  }

  // Se filtro por cliente, buscar processos do cliente primeiro
  if (clienteId && !processoId) {
    const processosCliente = await db.select({ id: processos.id })
      .from(processos).where(eq(processos.clienteId, clienteId));
    const idsProcessos = processosCliente.map(p => p.id);
    results = results.filter((p: any) => idsProcessos.includes(p.processoId));
  }

  const hoje = new Date();
  const pendentes = results.filter((p: any) => p.status === 'pendente');
  const vencidos = pendentes.filter((p: any) => new Date(p.dataVencimento) < hoje);
  const proximos = pendentes.filter((p: any) => {
    const venc = new Date(p.dataVencimento);
    const diff = (venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 7;
  });

  return JSON.stringify({
    total: results.length,
    pendentes: pendentes.length,
    vencidos: vencidos.length,
    proximos_7_dias: proximos.length,
    prazos: results.slice(0, 20).map((p: any) => ({
      id: p.id,
      tipo: p.tipo,
      descricao: p.descricao,
      dataVencimento: p.dataVencimento,
      status: p.status,
      processoId: p.processoId,
    })),
  });
}

// --- CONSULTAR CUMPRIMENTO DE SENTENÇA ---
async function toolConsultarCumprimentoSentenca(args: any): Promise<string> {
  const db = await getDb();
  if (!db) return JSON.stringify({ erro: "Banco de dados indisponível" });

  const { clienteId, processoId } = args;
  const conditions: any[] = [];

  if (processoId) conditions.push(eq(cumprimentosSentenca.processoId, processoId));

  let results: any[];
  if (conditions.length > 0) {
    results = await db.select().from(cumprimentosSentenca)
      .where(and(...conditions))
      .orderBy(desc(cumprimentosSentenca.createdAt))
      .limit(20);
  } else {
    results = await db.select().from(cumprimentosSentenca)
      .orderBy(desc(cumprimentosSentenca.createdAt))
      .limit(20);
  }

  // Se filtro por cliente, buscar processos do cliente primeiro
  if (clienteId && !processoId) {
    const processosCliente = await db.select({ id: processos.id })
      .from(processos).where(eq(processos.clienteId, clienteId));
    const idsProcessos = processosCliente.map(p => p.id);
    results = results.filter((c: any) => idsProcessos.includes(c.processoId));
  }

  return JSON.stringify({
    encontrados: results.length,
    cumprimentos: results.map((c: any) => ({
      id: c.id,
      processoId: c.processoId,
      tipo: c.tipo,
      status: c.status,
      valorPrincipal: c.valorPrincipal,
      valorAtualizado: c.valorAtualizado,
      valorHonorarios: c.valorHonorarios,
      dataTransitoJulgado: c.dataTransitoJulgado,
      observacoes: c.observacoes,
    })),
  });
}
