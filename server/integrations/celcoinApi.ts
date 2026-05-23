/**
 * INTEGRAÇÃO — Celcoin API (Consignado as a Service)
 * 
 * Objetivo: Consultar margem consignável em tempo real via API Celcoin.
 * Alternativa programática ao portal NEOCONSIG/Meu Consignado.
 * 
 * Documentação: https://celcoin.com.br/articles/integrar-api-originacao-consignado-privado/
 * Base URL: https://api.celcoin.com.br
 * Autenticação: OAuth2 (client_credentials)
 */
import { getDb } from "../db";
import { clientes, dadosFinanceiros } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

// ==================== CONFIGURAÇÃO ====================
const CELCOIN_BASE_URL = process.env.CELCOIN_BASE_URL || "https://api.celcoin.com.br";
const CELCOIN_CLIENT_ID = process.env.CELCOIN_CLIENT_ID || "";
const CELCOIN_CLIENT_SECRET = process.env.CELCOIN_CLIENT_SECRET || "";

// Cache de token (evitar autenticação a cada request)
let tokenCache: { token: string; expiresAt: number } | null = null;

// ==================== INTERFACES ====================
export interface MargemConsignavel {
  cpf: string;
  nome: string;
  orgao: string;
  matricula: string;
  margemTotal: number;
  margemUtilizada: number;
  margemDisponivel: number;
  margemCartao: number;
  margemCartaoDisponivel: number;
  remuneracaoLiquida: number;
  percentualMargem: number;
  dataConsulta: string;
  convenio: string;
}

export interface ResultadoConsultaMargem {
  sucesso: boolean;
  margem?: MargemConsignavel;
  mensagem: string;
  fonte: string;
}

export interface ContratoConsignado {
  banco: string;
  contrato: string;
  valorParcela: number;
  totalParcelas: number;
  parcelasRestantes: number;
  taxaJuros: number;
  valorSaldoDevedor: number;
  dataInicio: string;
  dataFim: string;
  rubrica: string;
}

// ==================== AUTENTICAÇÃO ====================

/**
 * Obter token de acesso OAuth2 da Celcoin
 */
async function obterToken(): Promise<string> {
  // Verificar cache
  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token;
  }

  if (!CELCOIN_CLIENT_ID || !CELCOIN_CLIENT_SECRET) {
    throw new Error("Credenciais Celcoin não configuradas (CELCOIN_CLIENT_ID / CELCOIN_CLIENT_SECRET)");
  }

  const response = await fetch(`${CELCOIN_BASE_URL}/v5/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: CELCOIN_CLIENT_ID,
      client_secret: CELCOIN_CLIENT_SECRET,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Celcoin auth failed: ${response.status}`);
  }

  const data = await response.json();
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000, // 1 min antes de expirar
  };

  return tokenCache.token;
}

// ==================== FUNÇÕES PRINCIPAIS ====================

/**
 * Consultar margem consignável de um servidor via CPF
 */
export async function consultarMargemCelcoin(
  cpf: string,
  matricula?: string,
  convenio?: string
): Promise<ResultadoConsultaMargem> {
  try {
    const token = await obterToken();

    const response = await fetch(`${CELCOIN_BASE_URL}/v1/consignado/margem`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cpf: cpf.replace(/[.\-]/g, ""),
        matricula: matricula || undefined,
        convenio: convenio || "GOIAS", // Convênio padrão: Estado de Goiás
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        sucesso: false,
        mensagem: `Celcoin API erro ${response.status}: ${errorText.substring(0, 200)}`,
        fonte: "Celcoin API",
      };
    }

    const data = await response.json();

    if (!data.margem) {
      return {
        sucesso: false,
        mensagem: "Margem não encontrada para este CPF/convênio",
        fonte: "Celcoin API",
      };
    }

    const margem: MargemConsignavel = {
      cpf,
      nome: data.nome || "",
      orgao: data.orgao || "",
      matricula: data.matricula || matricula || "",
      margemTotal: data.margem.total || 0,
      margemUtilizada: data.margem.utilizada || 0,
      margemDisponivel: data.margem.disponivel || 0,
      margemCartao: data.margem.cartao || 0,
      margemCartaoDisponivel: data.margem.cartaoDisponivel || 0,
      remuneracaoLiquida: data.remuneracaoLiquida || 0,
      percentualMargem: data.percentualMargem || 35,
      dataConsulta: new Date().toISOString(),
      convenio: data.convenio || "GOIAS",
    };

    return {
      sucesso: true,
      margem,
      mensagem: `Margem disponível: R$ ${margem.margemDisponivel.toFixed(2)}`,
      fonte: "Celcoin API - Tempo real",
    };

  } catch (error: any) {
    return {
      sucesso: false,
      mensagem: error.message,
      fonte: "Celcoin API - Erro",
    };
  }
}

/**
 * Consultar contratos consignados ativos de um servidor
 */
export async function consultarContratosCelcoin(
  cpf: string,
  matricula?: string
): Promise<{ sucesso: boolean; contratos: ContratoConsignado[]; mensagem: string }> {
  try {
    const token = await obterToken();

    const response = await fetch(`${CELCOIN_BASE_URL}/v1/consignado/contratos`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cpf: cpf.replace(/[.\-]/g, ""),
        matricula: matricula || undefined,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return { sucesso: false, contratos: [], mensagem: `Erro HTTP ${response.status}` };
    }

    const data = await response.json();
    const contratos: ContratoConsignado[] = (data.contratos || []).map((c: any) => ({
      banco: c.banco || c.instituicao || "",
      contrato: c.contrato || c.numero || "",
      valorParcela: c.valorParcela || 0,
      totalParcelas: c.totalParcelas || 0,
      parcelasRestantes: c.parcelasRestantes || 0,
      taxaJuros: c.taxaJuros || 0,
      valorSaldoDevedor: c.saldoDevedor || 0,
      dataInicio: c.dataInicio || "",
      dataFim: c.dataFim || "",
      rubrica: c.rubrica || "",
    }));

    return {
      sucesso: true,
      contratos,
      mensagem: `${contratos.length} contrato(s) encontrado(s)`,
    };

  } catch (error: any) {
    return { sucesso: false, contratos: [], mensagem: error.message };
  }
}

/**
 * Atualizar dados financeiros de um cliente via Celcoin (margem em tempo real)
 */
export async function atualizarMargemCliente(clienteId: number): Promise<{
  atualizado: boolean;
  mensagem: string;
}> {
  const db = await getDb();
  if (!db) return { atualizado: false, mensagem: "DB indisponível" };

  const [cliente] = await db.select().from(clientes).where(eq(clientes.id, clienteId)).limit(1);
  if (!cliente) return { atualizado: false, mensagem: "Cliente não encontrado" };
  if (!cliente.cpfCnpj) return { atualizado: false, mensagem: "CPF não disponível" };

  // Consultar margem
  const resultado = await consultarMargemCelcoin(cliente.cpfCnpj);
  if (!resultado.sucesso || !resultado.margem) {
    return { atualizado: false, mensagem: resultado.mensagem };
  }

  const m = resultado.margem;

  // Atualizar dados financeiros
  const existingFin = await db.select().from(dadosFinanceiros).where(eq(dadosFinanceiros.clienteId, clienteId)).limit(1);
  
  const dadosAtualizados = {
    remuneracaoLiquida: String(m.remuneracaoLiquida),
    margemConsignavelPerc: String(m.percentualMargem),
    margemConsignavelValor: String(m.margemTotal),
    totalConsignacoes: String(m.margemUtilizada),
    margemDisponivel: String(m.margemDisponivel),
    margemExcedida: m.margemDisponivel < 0 ? 1 : 0,
    valorExcedente: m.margemDisponivel < 0 ? String(Math.abs(m.margemDisponivel)) : "0",
    aptoEmprestimo: m.margemDisponivel > 0 ? 1 : 0,
    scoreRisco: m.margemDisponivel < 0 ? "Alto" as const : (m.margemDisponivel < m.margemTotal * 0.1 ? "Medio" as const : "Baixo" as const),
    fonteRenda: m.orgao || "Servidor Público",
    dataReferencia: new Date().toISOString().substring(0, 7).replace('-', '/'),
  };

  if (existingFin.length > 0) {
    await db.update(dadosFinanceiros).set(dadosAtualizados).where(eq(dadosFinanceiros.clienteId, clienteId));
  } else {
    await db.insert(dadosFinanceiros).values({ clienteId, ...dadosAtualizados });
  }

  return {
    atualizado: true,
    mensagem: `Margem atualizada via Celcoin: Disponível R$ ${m.margemDisponivel.toFixed(2)} | Total R$ ${m.margemTotal.toFixed(2)} | Utilizada R$ ${m.margemUtilizada.toFixed(2)}`,
  };
}

/**
 * Verificar se a integração Celcoin está configurada e funcional
 */
export function isCelcoinConfigurada(): boolean {
  return !!(CELCOIN_CLIENT_ID && CELCOIN_CLIENT_SECRET);
}

/**
 * Status da integração Celcoin
 */
export function statusIntegracaoCelcoin(): {
  configurada: boolean;
  baseUrl: string;
  convenio: string;
} {
  return {
    configurada: isCelcoinConfigurada(),
    baseUrl: CELCOIN_BASE_URL,
    convenio: "GOIAS",
  };
}
