/**
 * INTEGRAÇÃO — DataJud CNJ (API Pública)
 * 
 * Objetivo: Consultar automaticamente movimentações processuais
 * e manter os processos atualizados sem intervenção manual.
 * 
 * API: https://datajud-wiki.cnj.jus.br/api-publica/
 * Autenticação: API Key (header Authorization)
 * Limite: 5 req/min (respeitar rate limiting)
 */
import { getDb } from "../db";
import { processos, movimentacoes } from "../../drizzle/schema";
import { eq, desc, sql, and } from "drizzle-orm";

// ==================== CONFIGURAÇÃO ====================
const DATAJUD_BASE_URL = "https://api-publica.datajud.cnj.jus.br";
const DATAJUD_API_KEY = process.env.DATAJUD_API_KEY || "";

// Tribunais de Goiás
const TRIBUNAIS = {
  TJGO: "api_publica_tjgo",
  TRT18: "api_publica_trt18",
  TRF1: "api_publica_trf1",
};

// ==================== INTERFACES ====================
export interface MovimentacaoDataJud {
  dataHora: string;
  nome: string;
  codigo: number;
  complemento?: string;
}

export interface ProcessoDataJud {
  numeroProcesso: string;
  classe: { nome: string; codigo: number };
  orgaoJulgador: { nome: string; codigo: number };
  assuntos: Array<{ nome: string; codigo: number }>;
  movimentos: MovimentacaoDataJud[];
  dataAjuizamento: string;
  grau: string;
  nivelSigilo: number;
}

export interface ResultadoConsultaDataJud {
  encontrado: boolean;
  processo?: ProcessoDataJud;
  novasMovimentacoes: number;
  fonte: string;
  dataConsulta: string;
}

// ==================== FUNÇÕES PRINCIPAIS ====================

/**
 * Consultar processo no DataJud por número CNJ
 */
export async function consultarProcessoDataJud(
  numeroCNJ: string,
  tribunal?: string
): Promise<ResultadoConsultaDataJud> {
  if (!DATAJUD_API_KEY) {
    return {
      encontrado: false,
      novasMovimentacoes: 0,
      fonte: "DataJud - API Key não configurada (DATAJUD_API_KEY)",
      dataConsulta: new Date().toISOString(),
    };
  }

  // Determinar tribunal pelo número do processo
  const tribunalEndpoint = tribunal || identificarTribunal(numeroCNJ);

  try {
    const response = await fetch(`${DATAJUD_BASE_URL}/${tribunalEndpoint}/_search`, {
      method: "POST",
      headers: {
        "Authorization": `APIKey ${DATAJUD_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: {
          match: {
            numeroProcesso: numeroCNJ.replace(/[.\-\/]/g, ""),
          },
        },
        size: 1,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        encontrado: false,
        novasMovimentacoes: 0,
        fonte: `DataJud - Erro HTTP ${response.status}: ${errorText.substring(0, 200)}`,
        dataConsulta: new Date().toISOString(),
      };
    }

    const data = await response.json();
    const hits = data.hits?.hits || [];

    if (hits.length === 0) {
      return {
        encontrado: false,
        novasMovimentacoes: 0,
        fonte: `DataJud - Processo não encontrado no ${tribunalEndpoint}`,
        dataConsulta: new Date().toISOString(),
      };
    }

    const processo = hits[0]._source as ProcessoDataJud;

    return {
      encontrado: true,
      processo,
      novasMovimentacoes: processo.movimentos?.length || 0,
      fonte: `DataJud - ${tribunalEndpoint}`,
      dataConsulta: new Date().toISOString(),
    };

  } catch (error: any) {
    return {
      encontrado: false,
      novasMovimentacoes: 0,
      fonte: `DataJud - Erro: ${error.message}`,
      dataConsulta: new Date().toISOString(),
    };
  }
}

/**
 * Identificar tribunal pelo número CNJ do processo
 * Formato: NNNNNNN-DD.AAAA.J.TR.OOOO
 * J = Justiça (5=Trabalho, 8=Estadual)
 * TR = Tribunal (09=GO para estadual, 18=GO para trabalho)
 */
function identificarTribunal(numeroCNJ: string): string {
  const numLimpo = numeroCNJ.replace(/[.\-\/]/g, "");
  // Posição 13-14: Justiça (8=Estadual, 5=Trabalho, 4=Federal)
  // Posição 15-16: Tribunal
  if (numLimpo.length >= 16) {
    const justica = numLimpo.substring(13, 14);
    const tribunal = numLimpo.substring(14, 16);
    
    if (justica === "8" && tribunal === "09") return TRIBUNAIS.TJGO;
    if (justica === "5" && tribunal === "18") return TRIBUNAIS.TRT18;
    if (justica === "4") return TRIBUNAIS.TRF1;
  }
  // Default: TJGO
  return TRIBUNAIS.TJGO;
}

/**
 * Atualizar movimentações de um processo específico no banco de dados
 */
export async function atualizarMovimentacoesProcesso(processoId: number): Promise<{
  atualizado: boolean;
  novasMovimentacoes: number;
  mensagem: string;
}> {
  const db = await getDb();
  if (!db) return { atualizado: false, novasMovimentacoes: 0, mensagem: "DB indisponível" };

  // Buscar processo no banco
  const [processo] = await db.select().from(processos).where(eq(processos.id, processoId)).limit(1);
  if (!processo) return { atualizado: false, novasMovimentacoes: 0, mensagem: "Processo não encontrado" };

  const numeroCNJ = processo.numeroCnj;
  if (!numeroCNJ) return { atualizado: false, novasMovimentacoes: 0, mensagem: "Número CNJ não disponível" };

  // Consultar DataJud
  const resultado = await consultarProcessoDataJud(numeroCNJ);
  if (!resultado.encontrado || !resultado.processo) {
    return { atualizado: false, novasMovimentacoes: 0, mensagem: resultado.fonte };
  }

  // Buscar movimentações já registradas
  const movExistentes = await db.select().from(movimentacoes)
    .where(eq(movimentacoes.processoId, processoId))
    .orderBy(desc(movimentacoes.createdAt));

  const datasExistentes = new Set(movExistentes.map(m => m.data || ''));

  // Inserir apenas movimentações novas
  let novas = 0;
  for (const mov of resultado.processo.movimentos || []) {
    const dataStr = mov.dataHora?.split('T')[0];
    if (!dataStr || datasExistentes.has(dataStr)) continue;

    await db.insert(movimentacoes).values({
      processoId,
      data: dataStr,
      evento: mov.nome?.substring(0, 500) || null,
      descricao: mov.complemento || mov.nome || null,
    });
    novas++;
  }

  // Atualizar fase do processo se houver movimentação recente
  if (novas > 0 && resultado.processo.movimentos?.length) {
    const ultimaMov = resultado.processo.movimentos[0];
    const faseAtual = classificarFase(ultimaMov.nome, ultimaMov.codigo);
    if (faseAtual) {
      await db.update(processos).set({ faseAtual }).where(eq(processos.id, processoId));
    }
  }

  return {
    atualizado: novas > 0,
    novasMovimentacoes: novas,
    mensagem: novas > 0 
      ? `${novas} nova(s) movimentação(ões) registrada(s) via DataJud`
      : "Nenhuma movimentação nova encontrada",
  };
}

/**
 * Classificar fase processual com base na movimentação
 */
function classificarFase(nomeMovimento: string, codigo: number): string | null {
  const nome = nomeMovimento.toLowerCase();
  
  if (nome.includes('sentença') || nome.includes('julgamento')) return 'Sentença';
  if (nome.includes('recurso') || nome.includes('apelação')) return 'Recurso';
  if (nome.includes('trânsito em julgado')) return 'Trânsito em Julgado';
  if (nome.includes('cumprimento') || nome.includes('execução')) return 'Cumprimento de Sentença';
  if (nome.includes('audiência')) return 'Audiência';
  if (nome.includes('citação') || nome.includes('intimação')) return 'Citação/Intimação';
  if (nome.includes('distribuição') || nome.includes('distribuído')) return 'Distribuição';
  if (nome.includes('arquivamento') || nome.includes('arquivado')) return 'Arquivado';
  if (nome.includes('alvará')) return 'Alvará Expedido';
  if (nome.includes('perícia') || nome.includes('laudo')) return 'Perícia';
  
  return null;
}

/**
 * Atualizar TODOS os processos ativos via DataJud (cron diário)
 */
export async function atualizarTodosProcessosDataJud(): Promise<{
  total: number;
  atualizados: number;
  novasMovimentacoes: number;
  erros: number;
  detalhes: string[];
}> {
  const db = await getDb();
  if (!db) return { total: 0, atualizados: 0, novasMovimentacoes: 0, erros: 0, detalhes: ["DB indisponível"] };

  // Buscar processos ativos (não arquivados)
  const todosProcessos = await db.select().from(processos)
    .where(sql`${processos.faseAtual} != 'Arquivado' OR ${processos.faseAtual} IS NULL`);

  let atualizados = 0;
  let totalNovas = 0;
  let erros = 0;
  const detalhes: string[] = [];

  for (const proc of todosProcessos) {
    try {
      const result = await atualizarMovimentacoesProcesso(proc.id);
      if (result.atualizado) {
        atualizados++;
        totalNovas += result.novasMovimentacoes;
        detalhes.push(`✓ ${proc.numeroCnj}: ${result.mensagem}`);
      }
    } catch (e: any) {
      erros++;
      detalhes.push(`✗ ${proc.numeroCnj}: ${e.message}`);
    }
    // Rate limiting: 5 req/min = 12s entre requests
    await new Promise(r => setTimeout(r, 12000));
  }

  return {
    total: todosProcessos.length,
    atualizados,
    novasMovimentacoes: totalNovas,
    erros,
    detalhes,
  };
}

/**
 * Verificar prazos processuais e gerar alertas
 */
export async function verificarPrazosProcessuais(): Promise<{
  alertas: Array<{
    processoId: number;
    numeroProcesso: string;
    cliente: string;
    tipo: string;
    prazo: string;
    diasRestantes: number;
  }>;
}> {
  const db = await getDb();
  if (!db) return { alertas: [] };

  // Buscar movimentações recentes que geram prazo (intimações, citações)
  const movRecentes = await db.select().from(movimentacoes)
    .where(sql`${movimentacoes.createdAt} >= DATE_SUB(NOW(), INTERVAL 30 DAY)`)
    .orderBy(desc(movimentacoes.createdAt));

  const alertas: Array<{
    processoId: number;
    numeroProcesso: string;
    cliente: string;
    tipo: string;
    prazo: string;
    diasRestantes: number;
  }> = [];

  for (const mov of movRecentes) {
    let prazoDias = 0;

    const descMov = (mov.evento || mov.descricao || '').toLowerCase();
    if (descMov.includes('intimação') || descMov.includes('intimado')) prazoDias = 15;
    if (descMov.includes('citação') || descMov.includes('citado')) prazoDias = 15;
    if (descMov.includes('sentença')) prazoDias = 15; // Prazo para recurso
    if (descMov.includes('despacho') && descMov.includes('manifestação')) prazoDias = 5;

    if (prazoDias > 0 && mov.data) {
      const dataLimite = new Date(mov.data);
      dataLimite.setDate(dataLimite.getDate() + prazoDias);
      const diasRestantes = Math.ceil((dataLimite.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

      if (diasRestantes > 0 && diasRestantes <= 10) {
        const [proc] = await db.select().from(processos).where(eq(processos.id, mov.processoId)).limit(1);
        if (proc) {
          alertas.push({
            processoId: proc.id,
            numeroProcesso: proc.numeroCnj || '',
            cliente: proc.numeroCnj || '',
            tipo: mov.descricao || 'Movimentação',
            prazo: dataLimite.toISOString().split('T')[0],
            diasRestantes,
          });
        }
      }
    }
  }

  return { alertas };
}
