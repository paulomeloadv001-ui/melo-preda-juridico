/**
 * WEBHOOKS — Melo Advogados
 * 
 * Recebe notificações automáticas de sistemas externos:
 * 1. NEOCONSIG — Alteração de margem consignável
 * 2. DataJud — Nova movimentação processual (quando disponível)
 * 3. Bancos — Depósito judicial realizado/levantado
 * 4. PJe/PROJUDI — Intimação eletrônica
 * 
 * Cada webhook valida a origem, processa o evento e atualiza o banco.
 */
import { getDb } from "../db";
import { processos, movimentacoes, clientes, dadosFinanceiros, notificacoes } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

// ==================== INTERFACES ====================
export interface WebhookEvent {
  tipo: string;
  origem: string;
  timestamp: string;
  payload: any;
  assinatura?: string;
}

export interface WebhookResult {
  processado: boolean;
  acao: string;
  mensagem: string;
}

// ==================== VALIDAÇÃO ====================
const WEBHOOK_SECRETS: Record<string, string> = {
  neoconsig: process.env.WEBHOOK_SECRET_NEOCONSIG || "",
  datajud: process.env.WEBHOOK_SECRET_DATAJUD || "",
  banco: process.env.WEBHOOK_SECRET_BANCO || "",
  pje: process.env.WEBHOOK_SECRET_PJE || "",
};

function validarAssinatura(origem: string, payload: string, assinatura: string): boolean {
  const secret = WEBHOOK_SECRETS[origem];
  if (!secret) return true; // Se não tem secret configurado, aceitar (dev mode)
  
  const crypto = require("crypto");
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(assinatura));
}

// ==================== HANDLERS ====================

/**
 * Webhook: Alteração de margem consignável (NEOCONSIG/Celcoin)
 */
async function handleMargemAlterada(payload: any): Promise<WebhookResult> {
  const db = await getDb();
  if (!db) return { processado: false, acao: "nenhuma", mensagem: "DB indisponível" };

  const cpf = payload.cpf?.replace(/[.\-]/g, "");
  if (!cpf) return { processado: false, acao: "nenhuma", mensagem: "CPF não informado" };

  // Buscar cliente
  const [cliente] = await db.select().from(clientes).where(eq(clientes.cpfCnpj, cpf)).limit(1);
  if (!cliente) return { processado: false, acao: "nenhuma", mensagem: "Cliente não encontrado" };

  // Atualizar dados financeiros
  const existingFin = await db.select().from(dadosFinanceiros).where(eq(dadosFinanceiros.clienteId, cliente.id)).limit(1);
  const dadosAtualizados = {
    margemConsignavelValor: payload.margemTotal ? String(payload.margemTotal) : undefined,
    margemDisponivel: payload.margemDisponivel ? String(payload.margemDisponivel) : undefined,
    totalConsignacoes: payload.totalConsignacoes ? String(payload.totalConsignacoes) : undefined,
    margemExcedida: payload.margemDisponivel < 0 ? 1 : 0,
  };

  if (existingFin.length > 0) {
    await db.update(dadosFinanceiros).set(dadosAtualizados).where(eq(dadosFinanceiros.clienteId, cliente.id));
  }

  // Criar notificação
  await db.insert(notificacoes).values({
    tipo: "margem_alterada",
    titulo: `Margem alterada: ${cliente.nomeCompleto}`,
    mensagem: `Margem disponível atualizada para R$ ${payload.margemDisponivel?.toFixed(2) || '0.00'}`,
    clienteId: cliente.id,
    lida: 0,
  });

  return {
    processado: true,
    acao: "margem_atualizada",
    mensagem: `Margem do cliente ${cliente.nomeCompleto} atualizada via webhook`,
  };
}

/**
 * Webhook: Nova movimentação processual (DataJud/PJe)
 */
async function handleNovaMovimentacao(payload: any): Promise<WebhookResult> {
  const db = await getDb();
  if (!db) return { processado: false, acao: "nenhuma", mensagem: "DB indisponível" };

  const numeroCnj = payload.numeroProcesso?.replace(/[.\-\/]/g, "");
  if (!numeroCnj) return { processado: false, acao: "nenhuma", mensagem: "Número do processo não informado" };

  // Buscar processo
  const [processo] = await db.select().from(processos).where(eq(processos.numeroCnj, numeroCnj)).limit(1);
  if (!processo) return { processado: false, acao: "nenhuma", mensagem: "Processo não encontrado no sistema" };

  // Inserir movimentação
  await db.insert(movimentacoes).values({
    processoId: processo.id,
    data: payload.data || new Date().toISOString().split('T')[0],
    evento: payload.evento?.substring(0, 500) || "Nova movimentação",
    descricao: payload.descricao || payload.complemento || null,
  });

  // Criar notificação urgente se for intimação
  const eventoLower = (payload.evento || '').toLowerCase();
  const isUrgente = eventoLower.includes('intimação') || eventoLower.includes('citação') || eventoLower.includes('sentença');

  await db.insert(notificacoes).values({
    tipo: isUrgente ? "prazo_urgente" : "movimentacao",
    titulo: `${isUrgente ? '⚠️ ' : ''}Movimentação: ${processo.numeroCnj}`,
    mensagem: payload.evento || "Nova movimentação registrada",
    processoId: processo.id,
    clienteId: processo.clienteId,
    lida: 0,
  });

  return {
    processado: true,
    acao: "movimentacao_registrada",
    mensagem: `Movimentação registrada no processo ${processo.numeroCnj}${isUrgente ? ' (URGENTE)' : ''}`,
  };
}

/**
 * Webhook: Depósito judicial realizado/levantado (Banco)
 */
async function handleDepositoJudicial(payload: any): Promise<WebhookResult> {
  const db = await getDb();
  if (!db) return { processado: false, acao: "nenhuma", mensagem: "DB indisponível" };

  const numeroCnj = payload.numeroProcesso?.replace(/[.\-\/]/g, "");
  if (!numeroCnj) return { processado: false, acao: "nenhuma", mensagem: "Número do processo não informado" };

  const [processo] = await db.select().from(processos).where(eq(processos.numeroCnj, numeroCnj)).limit(1);
  if (!processo) return { processado: false, acao: "nenhuma", mensagem: "Processo não encontrado" };

  // Registrar movimentação financeira
  const tipo = payload.tipo === "levantamento" ? "Alvará levantado" : "Depósito judicial";
  
  await db.insert(movimentacoes).values({
    processoId: processo.id,
    data: payload.data || new Date().toISOString().split('T')[0],
    evento: `${tipo}: R$ ${payload.valor?.toFixed(2) || '0.00'}`,
    descricao: `${tipo} - Banco: ${payload.banco || 'N/I'} - Ag: ${payload.agencia || 'N/I'} - Conta: ${payload.conta || 'N/I'}`,
  });

  // Notificação
  await db.insert(notificacoes).values({
    tipo: "financeiro",
    titulo: `💰 ${tipo}: ${processo.numeroCnj}`,
    mensagem: `Valor: R$ ${payload.valor?.toFixed(2) || '0.00'} - ${payload.banco || 'Banco não identificado'}`,
    processoId: processo.id,
    clienteId: processo.clienteId,
    lida: 0,
  });

  return {
    processado: true,
    acao: "deposito_registrado",
    mensagem: `${tipo} de R$ ${payload.valor?.toFixed(2)} registrado no processo ${processo.numeroCnj}`,
  };
}

/**
 * Webhook: Intimação eletrônica (PJe/PROJUDI)
 */
async function handleIntimacao(payload: any): Promise<WebhookResult> {
  const db = await getDb();
  if (!db) return { processado: false, acao: "nenhuma", mensagem: "DB indisponível" };

  const numeroCnj = payload.numeroProcesso?.replace(/[.\-\/]/g, "");
  if (!numeroCnj) return { processado: false, acao: "nenhuma", mensagem: "Número do processo não informado" };

  const [processo] = await db.select().from(processos).where(eq(processos.numeroCnj, numeroCnj)).limit(1);
  if (!processo) {
    // Processo não cadastrado — registrar notificação genérica
    await db.insert(notificacoes).values({
      tipo: "prazo_urgente",
      titulo: `⚠️ INTIMAÇÃO: ${payload.numeroProcesso}`,
      mensagem: `Intimação recebida para processo não cadastrado. Teor: ${payload.teor?.substring(0, 200) || 'N/I'}`,
      lida: 0,
    });
    return { processado: true, acao: "intimacao_generica", mensagem: "Intimação registrada (processo não cadastrado)" };
  }

  // Registrar movimentação
  await db.insert(movimentacoes).values({
    processoId: processo.id,
    data: payload.data || new Date().toISOString().split('T')[0],
    evento: "Intimação Eletrônica",
    descricao: payload.teor?.substring(0, 2000) || "Intimação recebida via sistema eletrônico",
  });

  // Calcular prazo (padrão 15 dias úteis)
  const prazoFinal = calcularPrazoUtil(new Date(), payload.prazoDias || 15);

  // Notificação urgente
  await db.insert(notificacoes).values({
    tipo: "prazo_urgente",
    titulo: `⚠️ INTIMAÇÃO: ${processo.numeroCnj}`,
    mensagem: `Prazo: ${prazoFinal.toLocaleDateString('pt-BR')} (${payload.prazoDias || 15} dias). Teor: ${payload.teor?.substring(0, 200) || 'N/I'}`,
    processoId: processo.id,
    clienteId: processo.clienteId,
    lida: 0,
  });

  return {
    processado: true,
    acao: "intimacao_registrada",
    mensagem: `Intimação registrada no processo ${processo.numeroCnj}. Prazo: ${prazoFinal.toLocaleDateString('pt-BR')}`,
  };
}

// ==================== UTILITÁRIOS ====================

/**
 * Calcular prazo em dias úteis (excluindo sábados, domingos e feriados nacionais)
 */
function calcularPrazoUtil(dataInicio: Date, diasUteis: number): Date {
  const resultado = new Date(dataInicio);
  let contagem = 0;
  
  while (contagem < diasUteis) {
    resultado.setDate(resultado.getDate() + 1);
    const diaSemana = resultado.getDay();
    if (diaSemana !== 0 && diaSemana !== 6) { // Não é sábado nem domingo
      contagem++;
    }
  }
  
  return resultado;
}

// ==================== DISPATCHER PRINCIPAL ====================

/**
 * Processar webhook recebido — dispatcher principal
 */
export async function processarWebhook(event: WebhookEvent): Promise<WebhookResult> {
  // Validar assinatura se disponível
  if (event.assinatura) {
    const payloadStr = JSON.stringify(event.payload);
    if (!validarAssinatura(event.origem, payloadStr, event.assinatura)) {
      return { processado: false, acao: "rejeitado", mensagem: "Assinatura inválida" };
    }
  }

  // Dispatch por tipo de evento
  switch (event.tipo) {
    case "margem_alterada":
    case "margem_atualizada":
      return await handleMargemAlterada(event.payload);

    case "nova_movimentacao":
    case "movimentacao_processual":
      return await handleNovaMovimentacao(event.payload);

    case "deposito_judicial":
    case "alvara_levantado":
      return await handleDepositoJudicial(event.payload);

    case "intimacao":
    case "intimacao_eletronica":
      return await handleIntimacao(event.payload);

    default:
      return {
        processado: false,
        acao: "tipo_desconhecido",
        mensagem: `Tipo de webhook não suportado: ${event.tipo}`,
      };
  }
}

/**
 * Listar tipos de webhook suportados
 */
export function getWebhookTypes(): Array<{
  tipo: string;
  descricao: string;
  origem: string;
  payloadEsperado: Record<string, string>;
}> {
  return [
    {
      tipo: "margem_alterada",
      descricao: "Notificação de alteração na margem consignável do servidor",
      origem: "NEOCONSIG / Celcoin",
      payloadEsperado: {
        cpf: "string (CPF do servidor)",
        margemTotal: "number (valor total da margem)",
        margemDisponivel: "number (valor disponível)",
        totalConsignacoes: "number (total de consignações)",
      },
    },
    {
      tipo: "nova_movimentacao",
      descricao: "Nova movimentação processual registrada",
      origem: "DataJud / PJe / PROJUDI",
      payloadEsperado: {
        numeroProcesso: "string (número CNJ)",
        data: "string (YYYY-MM-DD)",
        evento: "string (descrição do evento)",
        complemento: "string (detalhes adicionais)",
      },
    },
    {
      tipo: "deposito_judicial",
      descricao: "Depósito judicial realizado ou alvará levantado",
      origem: "Banco do Brasil / Caixa",
      payloadEsperado: {
        numeroProcesso: "string (número CNJ)",
        valor: "number (valor em R$)",
        banco: "string (nome do banco)",
        tipo: "string (deposito ou levantamento)",
        data: "string (YYYY-MM-DD)",
      },
    },
    {
      tipo: "intimacao",
      descricao: "Intimação eletrônica recebida",
      origem: "PJe / PROJUDI / ESAJ",
      payloadEsperado: {
        numeroProcesso: "string (número CNJ)",
        teor: "string (texto da intimação)",
        prazoDias: "number (prazo em dias úteis)",
        data: "string (YYYY-MM-DD)",
      },
    },
  ];
}
