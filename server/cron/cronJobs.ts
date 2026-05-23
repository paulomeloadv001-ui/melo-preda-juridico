/**
 * CRON JOBS — Melo Advogados
 * 
 * Tarefas automáticas de atualização de dados:
 * 1. Atualização mensal da folha de pagamento (Dados Abertos GO)
 * 2. Atualização diária de movimentações processuais (DataJud)
 * 3. Verificação diária de prazos processuais (alertas)
 * 4. Atualização semanal de margem consignável (Celcoin)
 * 
 * Cada job registra seu resultado no banco para auditoria.
 */
import { atualizarTodosServidoresGO } from "../integrations/dadosAbertosGO";
import { atualizarTodosProcessosDataJud, verificarPrazosProcessuais } from "../integrations/datajudApi";
import { atualizarMargemCliente, isCelcoinConfigurada } from "../integrations/celcoinApi";
import { getDb } from "../db";
import { clientes } from "../../drizzle/schema";
import { sql } from "drizzle-orm";

// ==================== INTERFACES ====================
export interface ResultadoCron {
  job: string;
  inicio: string;
  fim: string;
  duracao: number; // ms
  sucesso: boolean;
  resumo: string;
  detalhes?: any;
}

// ==================== REGISTRO DE EXECUÇÃO ====================
const historicoExecucoes: ResultadoCron[] = [];

function registrarExecucao(resultado: ResultadoCron) {
  historicoExecucoes.push(resultado);
  // Manter apenas últimas 100 execuções em memória
  if (historicoExecucoes.length > 100) {
    historicoExecucoes.shift();
  }
  console.log(`[CRON] ${resultado.job}: ${resultado.resumo} (${resultado.duracao}ms)`);
}

// ==================== JOB 1: FOLHA DE PAGAMENTO ====================
/**
 * Atualizar dados de remuneração de todos os servidores de GO
 * Frequência: Mensal (dia 10 de cada mês)
 */
export async function cronAtualizarFolhaPagamento(): Promise<ResultadoCron> {
  const inicio = new Date();
  try {
    const resultado = await atualizarTodosServidoresGO();
    const fim = new Date();
    const result: ResultadoCron = {
      job: "folha_pagamento_go",
      inicio: inicio.toISOString(),
      fim: fim.toISOString(),
      duracao: fim.getTime() - inicio.getTime(),
      sucesso: true,
      resumo: `${resultado.atualizados}/${resultado.total} servidores atualizados, ${resultado.erros} erros`,
      detalhes: resultado,
    };
    registrarExecucao(result);
    return result;
  } catch (error: any) {
    const fim = new Date();
    const result: ResultadoCron = {
      job: "folha_pagamento_go",
      inicio: inicio.toISOString(),
      fim: fim.toISOString(),
      duracao: fim.getTime() - inicio.getTime(),
      sucesso: false,
      resumo: `Erro: ${error.message}`,
    };
    registrarExecucao(result);
    return result;
  }
}

// ==================== JOB 2: MOVIMENTAÇÕES PROCESSUAIS ====================
/**
 * Atualizar movimentações de todos os processos ativos via DataJud
 * Frequência: Diária (6h da manhã)
 */
export async function cronAtualizarMovimentacoes(): Promise<ResultadoCron> {
  const inicio = new Date();
  try {
    const resultado = await atualizarTodosProcessosDataJud();
    const fim = new Date();
    const result: ResultadoCron = {
      job: "movimentacoes_datajud",
      inicio: inicio.toISOString(),
      fim: fim.toISOString(),
      duracao: fim.getTime() - inicio.getTime(),
      sucesso: true,
      resumo: `${resultado.atualizados}/${resultado.total} processos com novas movimentações (${resultado.novasMovimentacoes} total), ${resultado.erros} erros`,
      detalhes: resultado,
    };
    registrarExecucao(result);
    return result;
  } catch (error: any) {
    const fim = new Date();
    const result: ResultadoCron = {
      job: "movimentacoes_datajud",
      inicio: inicio.toISOString(),
      fim: fim.toISOString(),
      duracao: fim.getTime() - inicio.getTime(),
      sucesso: false,
      resumo: `Erro: ${error.message}`,
    };
    registrarExecucao(result);
    return result;
  }
}

// ==================== JOB 3: PRAZOS PROCESSUAIS ====================
/**
 * Verificar prazos processuais e gerar alertas
 * Frequência: Diária (7h da manhã)
 */
export async function cronVerificarPrazos(): Promise<ResultadoCron> {
  const inicio = new Date();
  try {
    const resultado = await verificarPrazosProcessuais();
    const fim = new Date();
    
    const alertasUrgentes = resultado.alertas.filter(a => a.diasRestantes <= 3);
    const alertasNormais = resultado.alertas.filter(a => a.diasRestantes > 3);

    const result: ResultadoCron = {
      job: "prazos_processuais",
      inicio: inicio.toISOString(),
      fim: fim.toISOString(),
      duracao: fim.getTime() - inicio.getTime(),
      sucesso: true,
      resumo: `${resultado.alertas.length} prazo(s) identificado(s): ${alertasUrgentes.length} urgente(s), ${alertasNormais.length} normal(is)`,
      detalhes: resultado,
    };
    registrarExecucao(result);
    return result;
  } catch (error: any) {
    const fim = new Date();
    const result: ResultadoCron = {
      job: "prazos_processuais",
      inicio: inicio.toISOString(),
      fim: fim.toISOString(),
      duracao: fim.getTime() - inicio.getTime(),
      sucesso: false,
      resumo: `Erro: ${error.message}`,
    };
    registrarExecucao(result);
    return result;
  }
}

// ==================== JOB 4: MARGEM CONSIGNÁVEL ====================
/**
 * Atualizar margem consignável de todos os clientes via Celcoin
 * Frequência: Semanal (segunda-feira, 8h)
 */
export async function cronAtualizarMargens(): Promise<ResultadoCron> {
  const inicio = new Date();
  
  if (!isCelcoinConfigurada()) {
    const result: ResultadoCron = {
      job: "margem_celcoin",
      inicio: inicio.toISOString(),
      fim: inicio.toISOString(),
      duracao: 0,
      sucesso: false,
      resumo: "Celcoin não configurada (CELCOIN_CLIENT_ID / CELCOIN_CLIENT_SECRET ausentes)",
    };
    registrarExecucao(result);
    return result;
  }

  try {
    const db = await getDb();
    if (!db) throw new Error("DB indisponível");

    // Buscar clientes com CPF que são servidores
    const todosClientes = await db.select().from(clientes)
      .where(sql`${clientes.cpfCnpj} IS NOT NULL AND ${clientes.tipoPessoa} = 'PF'`);

    let atualizados = 0;
    let erros = 0;

    for (const cliente of todosClientes) {
      try {
        const result = await atualizarMargemCliente(cliente.id);
        if (result.atualizado) atualizados++;
      } catch {
        erros++;
      }
      // Rate limiting: 2 req/s
      await new Promise(r => setTimeout(r, 500));
    }

    const fim = new Date();
    const result: ResultadoCron = {
      job: "margem_celcoin",
      inicio: inicio.toISOString(),
      fim: fim.toISOString(),
      duracao: fim.getTime() - inicio.getTime(),
      sucesso: true,
      resumo: `${atualizados}/${todosClientes.length} margens atualizadas, ${erros} erros`,
    };
    registrarExecucao(result);
    return result;
  } catch (error: any) {
    const fim = new Date();
    const result: ResultadoCron = {
      job: "margem_celcoin",
      inicio: inicio.toISOString(),
      fim: fim.toISOString(),
      duracao: fim.getTime() - inicio.getTime(),
      sucesso: false,
      resumo: `Erro: ${error.message}`,
    };
    registrarExecucao(result);
    return result;
  }
}

// ==================== EXECUTOR GERAL ====================
/**
 * Executar todos os cron jobs de uma vez (útil para teste ou execução manual)
 */
export async function executarTodosCronJobs(): Promise<ResultadoCron[]> {
  const resultados: ResultadoCron[] = [];

  console.log("[CRON] Iniciando execução de todos os jobs...");
  
  resultados.push(await cronVerificarPrazos());
  resultados.push(await cronAtualizarMovimentacoes());
  resultados.push(await cronAtualizarFolhaPagamento());
  resultados.push(await cronAtualizarMargens());

  console.log("[CRON] Todos os jobs concluídos.");
  return resultados;
}

/**
 * Obter histórico de execuções dos cron jobs
 */
export function getHistoricoCron(): ResultadoCron[] {
  return [...historicoExecucoes];
}

/**
 * Obter status de todos os cron jobs
 */
export function getStatusCronJobs(): {
  jobs: Array<{
    nome: string;
    descricao: string;
    frequencia: string;
    ultimaExecucao?: ResultadoCron;
    configurado: boolean;
  }>;
} {
  const ultimaFolha = historicoExecucoes.filter(e => e.job === "folha_pagamento_go").pop();
  const ultimaMovimentacao = historicoExecucoes.filter(e => e.job === "movimentacoes_datajud").pop();
  const ultimoPrazo = historicoExecucoes.filter(e => e.job === "prazos_processuais").pop();
  const ultimaMargem = historicoExecucoes.filter(e => e.job === "margem_celcoin").pop();

  return {
    jobs: [
      {
        nome: "folha_pagamento_go",
        descricao: "Atualizar remuneração via Dados Abertos GO",
        frequencia: "Mensal (dia 10)",
        ultimaExecucao: ultimaFolha,
        configurado: true, // Dados abertos não requerem credenciais
      },
      {
        nome: "movimentacoes_datajud",
        descricao: "Atualizar movimentações processuais via DataJud CNJ",
        frequencia: "Diária (6h)",
        ultimaExecucao: ultimaMovimentacao,
        configurado: !!process.env.DATAJUD_API_KEY,
      },
      {
        nome: "prazos_processuais",
        descricao: "Verificar prazos e gerar alertas",
        frequencia: "Diária (7h)",
        ultimaExecucao: ultimoPrazo,
        configurado: true,
      },
      {
        nome: "margem_celcoin",
        descricao: "Atualizar margem consignável via Celcoin API",
        frequencia: "Semanal (segunda, 8h)",
        ultimaExecucao: ultimaMargem,
        configurado: isCelcoinConfigurada(),
      },
    ],
  };
}
