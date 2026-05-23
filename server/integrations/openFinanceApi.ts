/**
 * INTEGRAÇÃO — Open Finance Brasil / Bancos
 * 
 * Objetivo: Consultar dados financeiros de clientes via Open Finance,
 * incluindo alvarás judiciais, empréstimos consignados, saldos e operações.
 * 
 * Bancos suportados:
 * - Banco do Brasil (alvarás judiciais, empréstimos, consórcios)
 * - Caixa Econômica Federal (alvarás, FGTS, consignados)
 * - C6 Bank (empréstimos, consignados)
 * 
 * Documentação: https://openfinancebrasil.org.br/modelo-de-participacao/
 */
import { getDb } from "../db";
import { clientes, dadosFinanceiros, emprestimosConsignados } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

// ==================== CONFIGURAÇÃO ====================
const OPEN_FINANCE_BASE = process.env.OPEN_FINANCE_BASE_URL || "https://api.openfinancebrasil.org.br";
const BB_API_BASE = process.env.BB_API_BASE || "https://api.bb.com.br/cobrancas/v2";
const BB_CLIENT_ID = process.env.BB_CLIENT_ID || "";
const BB_CLIENT_SECRET = process.env.BB_CLIENT_SECRET || "";

// ==================== INTERFACES ====================
export interface AlvaraJudicial {
  numeroProcesso: string;
  valor: number;
  banco: string;
  agencia: string;
  conta: string;
  status: "Depositado" | "Expedido" | "Levantado" | "Pendente";
  dataDeposito?: string;
  dataExpedicao?: string;
  dataLevantamento?: string;
  beneficiario: string;
}

export interface ConsultaAlvaraResult {
  sucesso: boolean;
  alvaras: AlvaraJudicial[];
  mensagem: string;
  fonte: string;
}

export interface EmprestimoBancario {
  banco: string;
  modalidade: string;
  contrato: string;
  valorParcela: number;
  totalParcelas: number;
  parcelasRestantes: number;
  taxaJuros: number;
  saldoDevedor: number;
  dataContratacao: string;
  dataVencimento: string;
  consignado: boolean;
}

export interface ConsultaEmprestimosResult {
  sucesso: boolean;
  emprestimos: EmprestimoBancario[];
  totalParcelas: number;
  mensagem: string;
}

// ==================== BANCO DO BRASIL ====================

/**
 * Consultar alvarás judiciais no Banco do Brasil por número do processo
 * Busca múltiplas opções para encontrar o depósito judicial
 */
export async function consultarAlvaraBB(numeroProcesso: string): Promise<ConsultaAlvaraResult> {
  if (!BB_CLIENT_ID || !BB_CLIENT_SECRET) {
    return {
      sucesso: false,
      alvaras: [],
      mensagem: "Credenciais BB não configuradas (BB_CLIENT_ID / BB_CLIENT_SECRET)",
      fonte: "Banco do Brasil API",
    };
  }

  try {
    // 1. Autenticar
    const tokenResponse = await fetch("https://oauth.bb.com.br/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: BB_CLIENT_ID,
        client_secret: BB_CLIENT_SECRET,
        scope: "cobrancas.boletos-info",
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!tokenResponse.ok) {
      return {
        sucesso: false,
        alvaras: [],
        mensagem: `Erro autenticação BB: ${tokenResponse.status}`,
        fonte: "Banco do Brasil API",
      };
    }

    const tokenData = await tokenResponse.json();
    const token = tokenData.access_token;

    // 2. Consultar depósitos judiciais pelo número do processo
    const numLimpo = numeroProcesso.replace(/[.\-\/]/g, "");
    
    // Tentar múltiplas formas de busca
    const buscas = [
      `${BB_API_BASE}/depositos-judiciais?numeroProcesso=${numLimpo}`,
      `${BB_API_BASE}/depositos-judiciais?numeroProcesso=${numeroProcesso}`,
    ];

    const alvaras: AlvaraJudicial[] = [];

    for (const url of buscas) {
      try {
        const response = await fetch(url, {
          headers: { "Authorization": `Bearer ${token}` },
          signal: AbortSignal.timeout(15000),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.depositos?.length) {
            for (const dep of data.depositos) {
              alvaras.push({
                numeroProcesso,
                valor: dep.valor || 0,
                banco: "Banco do Brasil",
                agencia: dep.agencia || "",
                conta: dep.conta || "",
                status: dep.status === "LEVANTADO" ? "Levantado" : 
                        dep.status === "EXPEDIDO" ? "Expedido" : "Depositado",
                dataDeposito: dep.dataDeposito,
                dataExpedicao: dep.dataExpedicao,
                dataLevantamento: dep.dataLevantamento,
                beneficiario: dep.beneficiario || "",
              });
            }
            break; // Encontrou, não precisa tentar outras buscas
          }
        }
      } catch { /* Tentar próxima busca */ }
    }

    return {
      sucesso: alvaras.length > 0,
      alvaras,
      mensagem: alvaras.length > 0 
        ? `${alvaras.length} depósito(s) judicial(is) encontrado(s)`
        : "Nenhum depósito judicial encontrado para este processo",
      fonte: "Banco do Brasil API",
    };

  } catch (error: any) {
    return {
      sucesso: false,
      alvaras: [],
      mensagem: `Erro: ${error.message}`,
      fonte: "Banco do Brasil API",
    };
  }
}

/**
 * Consultar empréstimos consignados de um cliente via Open Finance
 * Busca em múltiplos bancos
 */
export async function consultarEmprestimosOpenFinance(
  cpf: string,
  consentToken?: string
): Promise<ConsultaEmprestimosResult> {
  if (!consentToken) {
    return {
      sucesso: false,
      emprestimos: [],
      totalParcelas: 0,
      mensagem: "Token de consentimento Open Finance não disponível. O cliente precisa autorizar o compartilhamento de dados.",
    };
  }

  try {
    // Consultar operações de crédito via Open Finance
    const response = await fetch(`${OPEN_FINANCE_BASE}/opendata/loans/v2/contracts`, {
      headers: {
        "Authorization": `Bearer ${consentToken}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return {
        sucesso: false,
        emprestimos: [],
        totalParcelas: 0,
        mensagem: `Erro Open Finance: ${response.status}`,
      };
    }

    const data = await response.json();
    const emprestimos: EmprestimoBancario[] = (data.data || []).map((c: any) => ({
      banco: c.brandName || c.companyCnpj || "",
      modalidade: c.productType || "",
      contrato: c.contractId || "",
      valorParcela: c.instalmentAmount || 0,
      totalParcelas: c.totalNumberOfInstalments || 0,
      parcelasRestantes: c.dueInstalments || 0,
      taxaJuros: c.interestRates?.[0]?.rate || 0,
      saldoDevedor: c.contractOutstandingBalance || 0,
      dataContratacao: c.contractDate || "",
      dataVencimento: c.settlementDate || "",
      consignado: (c.productSubType || "").toLowerCase().includes("consignado"),
    }));

    const totalParcelas = emprestimos.reduce((sum, e) => sum + e.valorParcela, 0);

    return {
      sucesso: true,
      emprestimos,
      totalParcelas,
      mensagem: `${emprestimos.length} empréstimo(s) encontrado(s). Total parcelas: R$ ${totalParcelas.toFixed(2)}`,
    };

  } catch (error: any) {
    return {
      sucesso: false,
      emprestimos: [],
      totalParcelas: 0,
      mensagem: `Erro: ${error.message}`,
    };
  }
}

/**
 * Sincronizar empréstimos do Open Finance com o banco de dados local
 */
export async function sincronizarEmprestimosCliente(
  clienteId: number,
  consentToken: string
): Promise<{ sincronizados: number; mensagem: string }> {
  const db = await getDb();
  if (!db) return { sincronizados: 0, mensagem: "DB indisponível" };

  const [cliente] = await db.select().from(clientes).where(eq(clientes.id, clienteId)).limit(1);
  if (!cliente?.cpfCnpj) return { sincronizados: 0, mensagem: "Cliente sem CPF" };

  const resultado = await consultarEmprestimosOpenFinance(cliente.cpfCnpj, consentToken);
  if (!resultado.sucesso) return { sincronizados: 0, mensagem: resultado.mensagem };

  let sincronizados = 0;
  for (const emp of resultado.emprestimos) {
    // Verificar se já existe
    const existing = await db.select().from(emprestimosConsignados)
      .where(eq(emprestimosConsignados.clienteId, clienteId))
      .limit(100);
    
    const jaExiste = existing.some(e => 
      e.banco === emp.banco && e.contrato === emp.contrato
    );

    if (!jaExiste) {
      await db.insert(emprestimosConsignados).values({
        clienteId,
        banco: emp.banco,
        contrato: emp.contrato,
        valorParcela: String(emp.valorParcela),
        valorTotal: String(emp.saldoDevedor),
        totalParcelas: emp.totalParcelas,
        parcelasRestantes: emp.parcelasRestantes,
        taxaJuros: String(emp.taxaJuros),
        status: "Ativo",
      });
      sincronizados++;
    }
  }

  // Atualizar totalConsignacoes nos dados financeiros
  if (sincronizados > 0) {
    const existingFin = await db.select().from(dadosFinanceiros).where(eq(dadosFinanceiros.clienteId, clienteId)).limit(1);
    if (existingFin.length > 0) {
      await db.update(dadosFinanceiros).set({
        totalConsignacoes: String(resultado.totalParcelas),
      }).where(eq(dadosFinanceiros.clienteId, clienteId));
    }
  }

  return {
    sincronizados,
    mensagem: `${sincronizados} novo(s) empréstimo(s) sincronizado(s). Total parcelas: R$ ${resultado.totalParcelas.toFixed(2)}`,
  };
}

/**
 * Verificar status de configuração das integrações bancárias
 */
export function statusIntegracoesBancarias(): {
  bancoDoBrasil: { configurado: boolean; funcionalidades: string[] };
  openFinance: { configurado: boolean; funcionalidades: string[] };
} {
  return {
    bancoDoBrasil: {
      configurado: !!(BB_CLIENT_ID && BB_CLIENT_SECRET),
      funcionalidades: [
        "Consulta de depósitos judiciais",
        "Consulta de alvarás",
        "Antecipação de recebíveis (RPF, alvará, precatório)",
      ],
    },
    openFinance: {
      configurado: !!process.env.OPEN_FINANCE_BASE_URL,
      funcionalidades: [
        "Consulta de empréstimos (todos os bancos)",
        "Sincronização de contratos consignados",
        "Consulta de saldos e operações",
      ],
    },
  };
}
