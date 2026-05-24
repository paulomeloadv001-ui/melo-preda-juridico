/**
 * PAINEL DE DEPLOY / EXPORTAÇÃO COMPLETA
 * 
 * Objetivo claro: Exportar todo o banco de dados, conhecimentos, documentos,
 * configurações e código em um pacote JSON para backup, migração ou deploy.
 */

import { getDb } from "../db";
import { 
  clientes, processos, movimentacoes, dadosFinanceiros,
  publicacoes, conhecimentos, documentos, prazosProcessuais,
  notificacoes, emprestimosConsignados
} from "../../drizzle/schema";
import { desc, sql, eq } from "drizzle-orm";

export interface ResultadoExportacao {
  sucesso: boolean;
  totalRegistros: number;
  tabelas: Record<string, number>;
  tamanhoEstimado: string;
  dataExportacao: string;
  dados: Record<string, any[]>;
}

/**
 * Exportar banco de dados completo
 */
export async function exportarBancoCompleto(): Promise<ResultadoExportacao> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");

  const resultado: ResultadoExportacao = {
    sucesso: false,
    totalRegistros: 0,
    tabelas: {},
    tamanhoEstimado: "0 KB",
    dataExportacao: new Date().toISOString(),
    dados: {},
  };

  try {
    const todosClientes = await db.select().from(clientes).orderBy(desc(clientes.id));
    resultado.dados.clientes = todosClientes;
    resultado.tabelas.clientes = todosClientes.length;
    resultado.totalRegistros += todosClientes.length;

    const todosProcessos = await db.select().from(processos).orderBy(desc(processos.id));
    resultado.dados.processos = todosProcessos;
    resultado.tabelas.processos = todosProcessos.length;
    resultado.totalRegistros += todosProcessos.length;

    const todasMovimentacoes = await db.select().from(movimentacoes).orderBy(desc(movimentacoes.id));
    resultado.dados.movimentacoes = todasMovimentacoes;
    resultado.tabelas.movimentacoes = todasMovimentacoes.length;
    resultado.totalRegistros += todasMovimentacoes.length;

    const todosFinanceiros = await db.select().from(dadosFinanceiros).orderBy(desc(dadosFinanceiros.id));
    resultado.dados.dadosFinanceiros = todosFinanceiros;
    resultado.tabelas.dadosFinanceiros = todosFinanceiros.length;
    resultado.totalRegistros += todosFinanceiros.length;

    const todasPublicacoes = await db.select().from(publicacoes).orderBy(desc(publicacoes.id));
    resultado.dados.publicacoes = todasPublicacoes;
    resultado.tabelas.publicacoes = todasPublicacoes.length;
    resultado.totalRegistros += todasPublicacoes.length;

    const todosPrazos = await db.select().from(prazosProcessuais).orderBy(desc(prazosProcessuais.id));
    resultado.dados.prazosProcessuais = todosPrazos;
    resultado.tabelas.prazosProcessuais = todosPrazos.length;
    resultado.totalRegistros += todosPrazos.length;

    // Honorários estão dentro da tabela processos (honorariosPerc, honorariosValor)
    resultado.tabelas.honorarios = 0;

    const todosEmprestimos = await db.select().from(emprestimosConsignados).orderBy(desc(emprestimosConsignados.id));
    resultado.dados.emprestimos = todosEmprestimos;
    resultado.tabelas.emprestimos = todosEmprestimos.length;
    resultado.totalRegistros += todosEmprestimos.length;

    const todosConhecimentos = await db.select().from(conhecimentos).orderBy(desc(conhecimentos.id));
    resultado.dados.conhecimentos = todosConhecimentos;
    resultado.tabelas.conhecimentos = todosConhecimentos.length;
    resultado.totalRegistros += todosConhecimentos.length;

    const todosDocumentos = await db.select().from(documentos).orderBy(desc(documentos.id));
    resultado.dados.documentos = todosDocumentos;
    resultado.tabelas.documentos = todosDocumentos.length;
    resultado.totalRegistros += todosDocumentos.length;

    // Calcular tamanho estimado
    const jsonStr = JSON.stringify(resultado.dados);
    const tamanhoBytes = Buffer.byteLength(jsonStr, "utf8");
    resultado.tamanhoEstimado = tamanhoBytes > 1024 * 1024 
      ? `${(tamanhoBytes / (1024 * 1024)).toFixed(2)} MB`
      : `${(tamanhoBytes / 1024).toFixed(2)} KB`;

    resultado.sucesso = true;
    return resultado;

  } catch (err: any) {
    throw new Error(`Erro na exportação: ${err.message}`);
  }
}

/**
 * Exportar apenas conhecimentos (banco de teses e estratégias)
 */
export async function exportarBancoConhecimentos(): Promise<{
  total: number;
  categorias: Record<string, number>;
  dados: any[];
}> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");

  const todosConhecimentos = await db.select().from(conhecimentos).orderBy(desc(conhecimentos.id));
  
  const categorias: Record<string, number> = {};
  for (const c of todosConhecimentos) {
    const cat = (c as any).categoria || "geral";
    categorias[cat] = (categorias[cat] || 0) + 1;
  }

  return {
    total: todosConhecimentos.length,
    categorias,
    dados: todosConhecimentos,
  };
}

/**
 * Gerar relatório de integridade do banco de dados
 */
export async function gerarRelatorioIntegridade(): Promise<{
  status: "ok" | "alerta" | "critico";
  totalRegistros: number;
  tabelas: Record<string, { total: number }>;
  alertas: string[];
}> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");

  const alertas: string[] = [];
  const tabelas: Record<string, { total: number }> = {};

  const [countClientes] = await db.select({ count: sql<number>`COUNT(*)` }).from(clientes);
  const [countProcessos] = await db.select({ count: sql<number>`COUNT(*)` }).from(processos);
  const [countMovimentacoes] = await db.select({ count: sql<number>`COUNT(*)` }).from(movimentacoes);
  const [countConhecimentos] = await db.select({ count: sql<number>`COUNT(*)` }).from(conhecimentos);
  const [countPublicacoes] = await db.select({ count: sql<number>`COUNT(*)` }).from(publicacoes);
  const [countPrazos] = await db.select({ count: sql<number>`COUNT(*)` }).from(prazosProcessuais);

  tabelas.clientes = { total: countClientes.count };
  tabelas.processos = { total: countProcessos.count };
  tabelas.movimentacoes = { total: countMovimentacoes.count };
  tabelas.conhecimentos = { total: countConhecimentos.count };
  tabelas.publicacoes = { total: countPublicacoes.count };
  tabelas.prazosProcessuais = { total: countPrazos.count };

  const totalRegistros = Object.values(tabelas).reduce((acc, t) => acc + t.total, 0);

  if (countClientes.count === 0) alertas.push("Nenhum cliente cadastrado");
  if (countProcessos.count === 0) alertas.push("Nenhum processo cadastrado");
  if (countConhecimentos.count === 0) alertas.push("Banco de conhecimentos vazio");

  const status = alertas.length === 0 ? "ok" : alertas.length <= 2 ? "alerta" : "critico";

  return { status, totalRegistros, tabelas, alertas };
}

/**
 * Exportar dados de um cliente específico (pasta do cliente)
 */
export async function exportarPastaCliente(clienteId: number): Promise<{
  cliente: any;
  processos: any[];
  financeiro: any[];
  publicacoes: any[];
  prazos: any[];
  documentos: any[];
  conhecimentos: any[];
}> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");

  const [cliente] = await db.select().from(clientes).where(eq(clientes.id, clienteId)).limit(1);
  if (!cliente) throw new Error(`Cliente ${clienteId} não encontrado`);

  const processosCliente = await db.select().from(processos).where(eq(processos.clienteId, clienteId));
  const financeiroCliente = await db.select().from(dadosFinanceiros).where(eq(dadosFinanceiros.clienteId, clienteId));
  const publicacoesCliente = await db.select().from(publicacoes).where(eq(publicacoes.clienteId, clienteId));
  const prazosCliente = await db.select().from(prazosProcessuais).where(eq(prazosProcessuais.clienteId, clienteId));
  const documentosCliente = await db.select().from(documentos).where(eq(documentos.clienteId, clienteId));
  
  // Buscar conhecimentos vinculados aos processos do cliente
  const processosIds = processosCliente.map((p: any) => p.id);
  let conhecimentosCliente: any[] = [];
  if (processosIds.length > 0) {
    for (const pid of processosIds) {
      const kn = await db.select().from(conhecimentos).where(eq(conhecimentos.processoOrigemId, pid));
      conhecimentosCliente.push(...kn);
    }
  }

  return {
    cliente,
    processos: processosCliente,
    financeiro: financeiroCliente,
    publicacoes: publicacoesCliente,
    prazos: prazosCliente,
    documentos: documentosCliente,
    conhecimentos: conhecimentosCliente,
  };
}
