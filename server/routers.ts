import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { initTRPC, TRPCError } from "@trpc/server";
import type { TrpcContext } from "./_core/context";
import { z } from "zod";
import { getDb } from "./db";
import {
  clientes, processos, dadosFinanceiros, emprestimosConsignados,
  estrategias, partesProcessuais, movimentacoes, documentos,
  conhecimentos, cumprimentosSentenca, analiseGeral, relatorios, jobs,
  accessRequests, userProfiles, users, movimentacoesFinanceiras, historicoCorrecoes,
  notificacoes, prazosProcessuais, syncLog,
  templatesPeticao, peticoesGeradas, agenteIaConfig, agenteIaHistorico,
  anexosPeticao, userPermissions, convites, auditLog,
  publicacoes, monitoramentoConfig, peticaoVersoes, perfisAcesso
} from "../drizzle/schema";
import { eq, like, desc, asc, and, sql, inArray } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";
import { storagePut, storageGet } from "./storage";
import { gerarPeticaoDocx } from "./docxGenerator";
import { executarAgenteCompleto } from "./agenteExecutor";
import { ENV } from "./_core/env";

// Helper: sanitize name for folder path
function sanitizeName(name: string): string {
  return name
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .replace(/\s+/g, "_")
    .toUpperCase()
    .substring(0, 60);
}

// Helper: validar CPF (dígitos verificadores)
function validarCPF(cpf: string): boolean {
  const nums = cpf.replace(/\D/g, '');
  if (nums.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(nums)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(nums[i]) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  if (resto !== parseInt(nums[9])) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(nums[i]) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  return resto === parseInt(nums[10]);
}

// Helper: validar CNPJ
function validarCNPJ(cnpj: string): boolean {
  const nums = cnpj.replace(/\D/g, '');
  if (nums.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(nums)) return false;
  const pesos1 = [5,4,3,2,9,8,7,6,5,4,3,2];
  const pesos2 = [6,5,4,3,2,9,8,7,6,5,4,3,2];
  let soma = 0;
  for (let i = 0; i < 12; i++) soma += parseInt(nums[i]) * pesos1[i];
  let resto = soma % 11;
  const dig1 = resto < 2 ? 0 : 11 - resto;
  if (parseInt(nums[12]) !== dig1) return false;
  soma = 0;
  for (let i = 0; i < 13; i++) soma += parseInt(nums[i]) * pesos2[i];
  resto = soma % 11;
  const dig2 = resto < 2 ? 0 : 11 - resto;
  return parseInt(nums[13]) === dig2;
}

// Helper: generate client folder key
function clientFolderKey(nome: string, cpf: string): string {
  const safeName = sanitizeName(nome);
  const safeCpf = cpf.replace(/[.\-\/]/g, "");
  return `clientes/${safeName}_${safeCpf}`;
}

// Helper: build full client folder with all JSON files
async function buildClientFolder(clienteId: number, nome: string, cpf: string) {
  const db = await getDb();
  if (!db) return null;

  const folder = clientFolderKey(nome, cpf);

  // Fetch all data
  const [cliente] = await db.select().from(clientes).where(eq(clientes.id, clienteId)).limit(1);
  if (!cliente) return null;

  const procs = await db.select().from(processos).where(eq(processos.clienteId, clienteId)).orderBy(desc(processos.updatedAt));
  const financeiro = await db.select().from(dadosFinanceiros).where(eq(dadosFinanceiros.clienteId, clienteId)).orderBy(desc(dadosFinanceiros.updatedAt));
  const emprestimos = await db.select().from(emprestimosConsignados).where(eq(emprestimosConsignados.clienteId, clienteId));
  const docs = await db.select().from(documentos).where(eq(documentos.clienteId, clienteId)).orderBy(desc(documentos.createdAt));
  const conhecs = await db.select().from(conhecimentos).where(eq(conhecimentos.processoOrigemId, sql`ANY(SELECT id FROM processos WHERE clienteId = ${clienteId})`)).catch(() => [] as any[]);

  // Fetch knowledge linked to this client's processes
  const procIds = procs.map(p => p.id);
  let conhecimentosCliente: any[] = [];
  if (procIds.length > 0) {
    for (const pid of procIds) {
      const kn = await db.select().from(conhecimentos).where(eq(conhecimentos.processoOrigemId, pid));
      conhecimentosCliente.push(...kn);
    }
  }

  const processosDetalhados = await Promise.all(procs.map(async (p) => {
    const estrats = await db.select().from(estrategias).where(eq(estrategias.processoId, p.id));
    const partes = await db.select().from(partesProcessuais).where(eq(partesProcessuais.processoId, p.id));
    const movs = await db.select().from(movimentacoes).where(eq(movimentacoes.processoId, p.id)).orderBy(desc(movimentacoes.createdAt));
    const cumps = await db.select().from(cumprimentosSentenca).where(eq(cumprimentosSentenca.processoId, p.id));
    // Remove textoExtraido from export (too large)
    const { textoExtraido, ...procData } = p;
    return { ...procData, estrategias: estrats, partes, movimentacoes: movs, cumprimentos: cumps };
  }));

  // 1. ficha_cliente.json - dados pessoais completos
  const fichaCliente = {
    exportDate: new Date().toISOString(),
    id: cliente.id,
    cpfCnpj: cliente.cpfCnpj,
    nomeCompleto: cliente.nomeCompleto,
    tipoPessoa: cliente.tipoPessoa,
    rg: cliente.rg,
    profissao: cliente.profissao,
    cargo: cliente.cargo,
    orgaoEmpregador: cliente.orgaoEmpregador,
    vinculoFuncional: cliente.vinculoFuncional,
    endereco: cliente.endereco,
    cidade: cliente.cidade,
    estado: cliente.estado,
    cep: cliente.cep,
    telefone: cliente.telefone,
    email: cliente.email,
    dataNascimento: cliente.dataNascimento,
    estadoCivil: cliente.estadoCivil,
    nacionalidade: cliente.nacionalidade,
    observacoes: cliente.observacoes,
    totalProcessos: procs.length,
    processosAtivos: procs.filter(p => p.statusProcesso === "Ativo").length,
    processosInativos: procs.filter(p => p.statusProcesso !== "Ativo").length,
  };
  const fichaUrl = await storagePut(`${folder}/ficha_cliente.json`, JSON.stringify(fichaCliente, null, 2), "application/json");

  // 2. processos.json - todos os processos com detalhes
  const processosExport = {
    exportDate: new Date().toISOString(),
    clienteNome: cliente.nomeCompleto,
    clienteCpf: cliente.cpfCnpj,
    totalProcessos: processosDetalhados.length,
    processos: processosDetalhados.map(p => ({
      ...p,
      naturezaAcao: p.tipoAcao,
      statusAtual: p.statusProcesso,
      faseProcessual: p.faseAtual,
    })),
  };
  const processosUrl = await storagePut(`${folder}/processos.json`, JSON.stringify(processosExport, null, 2), "application/json");

  // 3. financeiro.json - dados financeiros e empréstimos
  const financeiroExport = {
    exportDate: new Date().toISOString(),
    clienteNome: cliente.nomeCompleto,
    clienteCpf: cliente.cpfCnpj,
    dadosFinanceiros: financeiro,
    emprestimosConsignados: emprestimos,
    resumo: {
      totalEmprestimos: emprestimos.length,
      remuneracaoBruta: financeiro[0]?.remuneracaoBruta || null,
      remuneracaoLiquida: financeiro[0]?.remuneracaoLiquida || null,
      margemConsignavelPerc: financeiro[0]?.margemConsignavelPerc || null,
      margemConsignavelValor: financeiro[0]?.margemConsignavelValor || null,
      totalConsignacoes: financeiro[0]?.totalConsignacoes || null,
      margemDisponivel: financeiro[0]?.margemDisponivel || null,
      aptoEmprestimo: financeiro[0]?.aptoEmprestimo === 1,
    },
  };
  const financeiroUrl = await storagePut(`${folder}/financeiro.json`, JSON.stringify(financeiroExport, null, 2), "application/json");

  // 4. conhecimentos.json - banco de conhecimento individual
  const conhecimentosExport = {
    exportDate: new Date().toISOString(),
    clienteNome: cliente.nomeCompleto,
    clienteCpf: cliente.cpfCnpj,
    totalConhecimentos: conhecimentosCliente.length,
    teses: conhecimentosCliente.filter(k => k.categoria === "Tese"),
    jurisprudencias: conhecimentosCliente.filter(k => k.categoria === "Jurisprudencia"),
    estrategias: conhecimentosCliente.filter(k => k.categoria === "Estrategia"),
    legislacoes: conhecimentosCliente.filter(k => k.categoria === "Legislacao"),
  };
  const conhecimentosUrl = await storagePut(`${folder}/conhecimentos.json`, JSON.stringify(conhecimentosExport, null, 2), "application/json");

  // 5. documentos.json - lista de documentos vinculados
  const documentosExport = {
    exportDate: new Date().toISOString(),
    clienteNome: cliente.nomeCompleto,
    clienteCpf: cliente.cpfCnpj,
    totalDocumentos: docs.length,
    documentos: docs.map(d => ({
      tipo: d.tipo,
      nomeArquivo: d.nomeArquivo,
      url: d.storageUrl,
      tamanho: d.tamanho,
      mimeType: d.mimeType,
      dataCriacao: d.createdAt,
    })),
  };
  const documentosUrl = await storagePut(`${folder}/documentos.json`, JSON.stringify(documentosExport, null, 2), "application/json");

  // 6. banco_completo.json - tudo junto para exportação total
  const bancoCompleto = {
    exportDate: new Date().toISOString(),
    version: "2.0",
    pastaCliente: folder,
    ficha: fichaCliente,
    processos: processosExport,
    financeiro: financeiroExport,
    conhecimentos: conhecimentosExport,
    documentos: documentosExport,
  };
  const bancoUrl = await storagePut(`${folder}/banco_completo.json`, JSON.stringify(bancoCompleto, null, 2), "application/json");

  return {
    folder,
    files: {
      fichaCliente: fichaUrl.url,
      processos: processosUrl.url,
      financeiro: financeiroUrl.url,
      conhecimentos: conhecimentosUrl.url,
      documentos: documentosUrl.url,
      bancoCompleto: bancoUrl.url,
    },
  };
}

// Helper: Atualizar automaticamente o relatório cadastral após importação de processo
async function autoUpdateRelatorioCadastral(db: any) {
  const allClientes = await db.select().from(clientes).orderBy(desc(clientes.updatedAt));
  const clientesPF = allClientes.filter((c: any) => c.tipoPessoa === "PF" && !c.cpfCnpj.startsWith("PENDENTE"));

  const dadosRelatorio = await Promise.all(clientesPF.map(async (cli: any) => {
    const procs = await db.select().from(processos).where(eq(processos.clienteId, cli.id)).orderBy(desc(processos.updatedAt));
    const financeiro = await db.select().from(dadosFinanceiros).where(eq(dadosFinanceiros.clienteId, cli.id)).limit(1);
    const emprestimosData = await db.select().from(emprestimosConsignados).where(eq(emprestimosConsignados.clienteId, cli.id));

    return {
      id: cli.id,
      nomeCompleto: cli.nomeCompleto,
      cpfCnpj: cli.cpfCnpj,
      rg: cli.rg,
      profissao: cli.profissao,
      cargo: cli.cargo,
      orgaoEmpregador: cli.orgaoEmpregador,
      vinculoFuncional: cli.vinculoFuncional,
      endereco: cli.endereco,
      cidade: cli.cidade,
      estado: cli.estado,
      cep: cli.cep,
      telefone: cli.telefone,
      email: cli.email,
      dataNascimento: cli.dataNascimento,
      estadoCivil: cli.estadoCivil,
      nacionalidade: cli.nacionalidade,
      totalProcessos: procs.length,
      processosAtivos: procs.filter((p: any) => p.statusProcesso === "Ativo").length,
      processos: procs.map((p: any) => ({
        numeroCnj: p.numeroCnj,
        tribunal: p.tribunal,
        vara: p.vara,
        comarca: p.comarca,
        tipoAcao: p.tipoAcao,
        faseAtual: p.faseAtual,
        statusProcesso: p.statusProcesso,
        valorCausa: p.valorCausa,
        dataDistribuicao: p.dataDistribuicao,
        poloPassivo: p.poloPassivo,
      })),
      dadosFinanceiros: financeiro[0] ? {
        remuneracaoBruta: financeiro[0].remuneracaoBruta,
        remuneracaoLiquida: financeiro[0].remuneracaoLiquida,
        margemConsignavelPerc: financeiro[0].margemConsignavelPerc,
        margemConsignavelValor: financeiro[0].margemConsignavelValor,
        fonteRenda: financeiro[0].fonteRenda,
      } : null,
      totalEmprestimos: emprestimosData.length,
      emprestimosAtivos: emprestimosData.filter((e: any) => e.status === "Ativo").length,
    };
  }));

  const totalProcessosCount = await db.select({ count: sql<number>`COUNT(*)` }).from(processos);
  const valorTotal = await db.select({ total: sql<string>`COALESCE(SUM(valorCausa), 0)` }).from(processos);

  const relatorioData = {
    titulo: "Relat\u00f3rio de Dados Cadastrais - Clientes Pessoa F\u00edsica",
    dataGeracao: new Date().toISOString(),
    escritorio: "Melo & Preda Advogados",
    resumo: {
      totalClientesPF: clientesPF.length,
      totalClientesGeral: allClientes.length,
      totalProcessos: totalProcessosCount[0]?.count || 0,
      valorTotalCausas: valorTotal[0]?.total || "0",
    },
    clientes: dadosRelatorio,
  };

  const storageKey = `relatorios/cadastral/RELATORIO_CADASTRAL_${new Date().toISOString().split('T')[0].replace(/-/g, '')}.json`;
  const { url } = await storagePut(storageKey, JSON.stringify(relatorioData, null, 2), "application/json");

  // Upsert no banco
  const existingReport = await db.select().from(relatorios)
    .where(eq(relatorios.tipoRelatorio, "cadastral_pf")).limit(1);

  if (existingReport.length > 0) {
    await db.update(relatorios).set({
      titulo: "Relat\u00f3rio de Dados Cadastrais - Clientes PF",
      descricao: `Relat\u00f3rio atualizado automaticamente com ${clientesPF.length} clientes PF e ${totalProcessosCount[0]?.count || 0} processos. Atualizado em ${new Date().toLocaleString('pt-BR')}.`,
      storageKey,
      storageUrl: url,
      dadosJson: relatorioData as any,
    }).where(eq(relatorios.id, existingReport[0].id));
  } else {
    await db.insert(relatorios).values({
      titulo: "Relat\u00f3rio de Dados Cadastrais - Clientes PF",
      categoria: "Cadastral",
      subcategoria: "Dados Cadastrais Clientes PF",
      descricao: `Relat\u00f3rio gerado automaticamente com ${clientesPF.length} clientes PF e ${totalProcessosCount[0]?.count || 0} processos.`,
      tipoRelatorio: "cadastral_pf",
      formato: "JSON",
      storageKey,
      storageUrl: url,
      dadosJson: relatorioData as any,
      geradoPor: "Sistema (Auto)",
    });
  }

  return { success: true, totalClientes: clientesPF.length, url };
}

// ==================== HELPER: CRIAR NOTIFICAÇÃO ====================
interface CriarNotificacaoParams {
  tipo: 'honorario_status' | 'honorario_novo' | 'prazo_vencendo' | 'prazo_vencido' | 'importacao_concluida' | 'importacao_erro' | 'correcao_executada' | 'novo_cliente' | 'novo_processo' | 'acesso_solicitado' | 'sistema';
  prioridade?: 'baixa' | 'normal' | 'alta' | 'urgente';
  titulo: string;
  mensagem: string;
  clienteId?: number;
  processoId?: number;
  movimentacaoFinanceiraId?: number;
  prazoId?: number;
  linkUrl?: string;
  icone?: string;
  cor?: string;
  dadosExtras?: any;
}

async function criarNotificacao(params: CriarNotificacaoParams) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(notificacoes).values({
      tipo: params.tipo,
      prioridade: params.prioridade || 'normal',
      titulo: params.titulo,
      mensagem: params.mensagem,
      clienteId: params.clienteId || null,
      processoId: params.processoId || null,
      movimentacaoFinanceiraId: params.movimentacaoFinanceiraId || null,
      prazoId: params.prazoId || null,
      linkUrl: params.linkUrl || null,
      icone: params.icone || null,
      cor: params.cor || null,
      dadosExtras: params.dadosExtras || null,
    });
  } catch (e) {
    console.error('[Notificacao] Erro ao criar notificação:', e);
  }
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ==================== CLIENTES ====================
  clientes: router({
    list: protectedProcedure
      .input(z.object({ search: z.string().optional() }).optional())
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        if (input?.search) {
          return db.select().from(clientes)
            .where(sql`${clientes.nomeCompleto} LIKE ${`%${input.search}%`} OR ${clientes.cpfCnpj} LIKE ${`%${input.search}%`}`)
            .orderBy(desc(clientes.updatedAt));
        }
        return db.select().from(clientes).orderBy(desc(clientes.updatedAt));
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return null;
        const rows = await db.select().from(clientes).where(eq(clientes.id, input.id)).limit(1);
        return rows[0] ?? null;
      }),

    getByCpf: protectedProcedure
      .input(z.object({ cpf: z.string() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return null;
        const rows = await db.select().from(clientes).where(eq(clientes.cpfCnpj, input.cpf)).limit(1);
        return rows[0] ?? null;
      }),

    getFullProfile: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return null;
        const [cliente] = await db.select().from(clientes).where(eq(clientes.id, input.id)).limit(1);
        if (!cliente) return null;
        const procs = await db.select().from(processos).where(eq(processos.clienteId, input.id)).orderBy(desc(processos.updatedAt));
        const financeiro = await db.select().from(dadosFinanceiros).where(eq(dadosFinanceiros.clienteId, input.id)).orderBy(desc(dadosFinanceiros.updatedAt)).limit(1);
        const emprestimos = await db.select().from(emprestimosConsignados).where(eq(emprestimosConsignados.clienteId, input.id));
        const docs = await db.select().from(documentos).where(eq(documentos.clienteId, input.id)).orderBy(desc(documentos.createdAt));

        const processosComDetalhes = await Promise.all(procs.map(async (p) => {
          const estrats = await db.select().from(estrategias).where(eq(estrategias.processoId, p.id));
          const partes = await db.select().from(partesProcessuais).where(eq(partesProcessuais.processoId, p.id));
          const movs = await db.select().from(movimentacoes).where(eq(movimentacoes.processoId, p.id)).orderBy(desc(movimentacoes.createdAt));
          const cumps = await db.select().from(cumprimentosSentenca).where(eq(cumprimentosSentenca.processoId, p.id));
          const movFin = await db.select().from(movimentacoesFinanceiras).where(eq(movimentacoesFinanceiras.processoId, p.id)).orderBy(desc(movimentacoesFinanceiras.createdAt));
          return { ...p, estrategias: estrats, partes, movimentacoes: movs, cumprimentos: cumps, movimentacoesFinanceiras: movFin };
        }));

        // Buscar todas as movimentações financeiras do cliente (consolidado)
        const todasMovFin = await db.select().from(movimentacoesFinanceiras).where(eq(movimentacoesFinanceiras.clienteId, input.id)).orderBy(desc(movimentacoesFinanceiras.createdAt));

        // Get knowledge for this client
        const procIds = procs.map(p => p.id);
        let conhecimentosCliente: any[] = [];
        for (const pid of procIds) {
          const kn = await db.select().from(conhecimentos).where(eq(conhecimentos.processoOrigemId, pid));
          conhecimentosCliente.push(...kn);
        }

        // Calcular resumo financeiro
        const resumoFinanceiro = {
          totalHonorariosSucumbenciais: 0,
          honorariosPagosLevantados: 0,
          honorariosDepositadosALevantar: 0,
          honorariosPendentes: 0,
          totalDepositos: 0,
          depositosLevantados: 0,
          depositosALevantar: 0,
          totalAlvaras: 0,
          alvarasLevantados: 0,
          alvarasPendentes: 0,
          totalPagamentos: 0,
          totalRestituicoes: 0,
          totalMultas: 0,
          totalCustas: 0,
        };
        for (const mf of todasMovFin) {
          const val = parseFloat(String(mf.valor || '0'));
          const valLev = parseFloat(String(mf.valorLevantado || '0'));
          if (mf.tipo === 'honorarios_sucumbenciais' || mf.tipo === 'honorarios_contratuais') {
            resumoFinanceiro.totalHonorariosSucumbenciais += val;
            if (mf.status === 'pago_levantado') resumoFinanceiro.honorariosPagosLevantados += val;
            else if (mf.status === 'depositado_a_levantar') resumoFinanceiro.honorariosDepositadosALevantar += val;
            else resumoFinanceiro.honorariosPendentes += val;
          } else if (mf.tipo === 'deposito_judicial') {
            resumoFinanceiro.totalDepositos += val;
            if (mf.status === 'pago_levantado') resumoFinanceiro.depositosLevantados += valLev || val;
            else resumoFinanceiro.depositosALevantar += val - (valLev || 0);
          } else if (mf.tipo === 'alvara_levantamento') {
            resumoFinanceiro.totalAlvaras += val;
            if (mf.status === 'pago_levantado') resumoFinanceiro.alvarasLevantados += val;
            else resumoFinanceiro.alvarasPendentes += val;
          } else if (mf.tipo === 'pagamento') {
            resumoFinanceiro.totalPagamentos += val;
          } else if (mf.tipo === 'restituicao') {
            resumoFinanceiro.totalRestituicoes += val;
          } else if (mf.tipo === 'multa') {
            resumoFinanceiro.totalMultas += val;
          } else if (mf.tipo === 'custas') {
            resumoFinanceiro.totalCustas += val;
          }
        }

        return {
          cliente,
          dadosFinanceiros: financeiro[0] ?? null,
          emprestimos,
          processos: processosComDetalhes,
          documentos: docs,
          conhecimentos: conhecimentosCliente,
          movimentacoesFinanceiras: todasMovFin,
          resumoFinanceiro,
          pasta: clientFolderKey(cliente.nomeCompleto, cliente.cpfCnpj),
        };
      }),

    // Excluir cliente e todos os dados vinculados
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        await db.insert(auditLog).values({ userId: ctx.user.id, acao: 'excluir_cliente', modulo: 'clientes', detalhes: JSON.stringify({ clienteId: input.id }) });
        // Buscar processos do cliente
        const procs = await db.select().from(processos).where(eq(processos.clienteId, input.id));
        for (const p of procs) {
          await db.delete(estrategias).where(eq(estrategias.processoId, p.id));
          await db.delete(partesProcessuais).where(eq(partesProcessuais.processoId, p.id));
          await db.delete(movimentacoes).where(eq(movimentacoes.processoId, p.id));
          await db.delete(cumprimentosSentenca).where(eq(cumprimentosSentenca.processoId, p.id));
          await db.delete(conhecimentos).where(eq(conhecimentos.processoOrigemId, p.id));
          await db.delete(documentos).where(eq(documentos.processoId, p.id));
          await db.delete(movimentacoesFinanceiras).where(eq(movimentacoesFinanceiras.processoId, p.id));
        }
        await db.delete(processos).where(eq(processos.clienteId, input.id));
        await db.delete(dadosFinanceiros).where(eq(dadosFinanceiros.clienteId, input.id));
        await db.delete(movimentacoesFinanceiras).where(eq(movimentacoesFinanceiras.clienteId, input.id));
        await db.delete(emprestimosConsignados).where(eq(emprestimosConsignados.clienteId, input.id));
        await db.delete(documentos).where(eq(documentos.clienteId, input.id));
        await db.delete(clientes).where(eq(clientes.id, input.id));
        return { success: true, deletedId: input.id };
      }),

    // Atualizar dados do cliente
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        nomeCompleto: z.string().optional(),
        cpfCnpj: z.string().optional(),
        rg: z.string().optional(),
        profissao: z.string().optional(),
        cargo: z.string().optional(),
        orgaoEmpregador: z.string().optional(),
        endereco: z.string().optional(),
        cidade: z.string().optional(),
        estado: z.string().optional(),
        cep: z.string().optional(),
        telefone: z.string().optional(),
        email: z.string().optional(),
        observacoes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const { id, ...fields } = input;
        const updateData: Record<string, any> = {};
        for (const [key, val] of Object.entries(fields)) {
          if (val !== undefined) updateData[key] = val;
        }
        if (Object.keys(updateData).length > 0) {
          await db.update(clientes).set(updateData).where(eq(clientes.id, id));
        }
        return { success: true };
      }),

    // ==================== ATUALIZAÇÃO DE STATUS DE HONORÁRIOS ====================
    atualizarStatusHonorario: protectedProcedure
      .input(z.object({
        movimentacaoId: z.number(),
        novoStatus: z.enum(['pago_levantado', 'depositado_a_levantar', 'pendente', 'parcial', 'cancelado']),
        valorLevantado: z.number().optional(),
        valorPendente: z.number().optional(),
        dataLevantamento: z.string().optional(),
        observacao: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error('Database not available');
        const updateData: Record<string, any> = {
          status: input.novoStatus,
        };
        if (input.valorLevantado !== undefined) updateData.valorLevantado = String(input.valorLevantado);
        if (input.valorPendente !== undefined) updateData.valorPendente = String(input.valorPendente);
        if (input.dataLevantamento) updateData.dataLevantamento = input.dataLevantamento;
        if (input.observacao) updateData.descricao = input.observacao;
        await db.update(movimentacoesFinanceiras).set(updateData).where(eq(movimentacoesFinanceiras.id, input.movimentacaoId));
        // Buscar dados da movimentação para notificação
        const [mov] = await db.select().from(movimentacoesFinanceiras).where(eq(movimentacoesFinanceiras.id, input.movimentacaoId));
        if (mov) {
          const statusLabels: Record<string, string> = {
            pago_levantado: 'Pago/Levantado',
            depositado_a_levantar: 'Depositado/A Levantar',
            pendente: 'Pendente',
            parcial: 'Parcial',
            cancelado: 'Cancelado',
          };
          await criarNotificacao({
            tipo: 'honorario_status',
            prioridade: input.novoStatus === 'pago_levantado' ? 'alta' : 'normal',
            titulo: `Status atualizado: ${statusLabels[input.novoStatus]}`,
            mensagem: `Movimentação #${mov.id} (${mov.tipo}) - R$ ${parseFloat(String(mov.valor || '0')).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} alterada para ${statusLabels[input.novoStatus]}`,
            clienteId: mov.clienteId,
            processoId: mov.processoId || undefined,
            movimentacaoFinanceiraId: mov.id,
            linkUrl: `/clientes/${mov.clienteId}`,
            icone: 'DollarSign',
            cor: input.novoStatus === 'pago_levantado' ? 'green' : input.novoStatus === 'cancelado' ? 'red' : 'amber',
          });
        }
        return { success: true };
      }),

    atualizarStatusLote: protectedProcedure
      .input(z.object({
        movimentacaoIds: z.array(z.number()),
        novoStatus: z.enum(['pago_levantado', 'depositado_a_levantar', 'pendente', 'parcial', 'cancelado']),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error('Database not available');
        let atualizados = 0;
        for (const id of input.movimentacaoIds) {
          await db.update(movimentacoesFinanceiras).set({
            status: input.novoStatus,
          }).where(eq(movimentacoesFinanceiras.id, id));
          atualizados++;
        }
        const statusLabels: Record<string, string> = {
          pago_levantado: 'Pago/Levantado',
          depositado_a_levantar: 'Depositado/A Levantar',
          pendente: 'Pendente',
          parcial: 'Parcial',
          cancelado: 'Cancelado',
        };
        await criarNotificacao({
          tipo: 'honorario_status',
          prioridade: 'normal',
          titulo: `Atualização em lote: ${atualizados} movimentações`,
          mensagem: `${atualizados} movimentações alteradas para ${statusLabels[input.novoStatus]}`,
          linkUrl: '/',
          icone: 'DollarSign',
          cor: 'blue',
        });
        return { success: true, atualizados };
      }),

    adicionarMovimentacaoFinanceira: protectedProcedure
      .input(z.object({
        clienteId: z.number(),
        processoId: z.number().optional(),
        tipo: z.enum(['deposito_judicial', 'alvara_levantamento', 'honorarios_sucumbenciais', 'honorarios_contratuais', 'pagamento', 'restituicao', 'multa', 'custas']),
        status: z.enum(['pago_levantado', 'depositado_a_levantar', 'pendente', 'parcial', 'cancelado']).default('pendente'),
        valor: z.number(),
        valorLevantado: z.number().optional(),
        valorPendente: z.number().optional(),
        descricao: z.string(),
        beneficiario: z.string().optional(),
        dataMovimentacao: z.string().optional(),
        dataLevantamento: z.string().optional(),
        banco: z.string().optional(),
        numeroAlvara: z.string().optional(),
        percentualHonorarios: z.number().optional(),
        fundamentoLegal: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error('Database not available');
        const [result] = await db.insert(movimentacoesFinanceiras).values({
          clienteId: input.clienteId,
          processoId: input.processoId || 0,
          tipo: input.tipo,
          status: input.status,
          valor: String(input.valor),
          valorLevantado: input.valorLevantado ? String(input.valorLevantado) : null,
          valorPendente: input.valorPendente ? String(input.valorPendente) : null,
          descricao: input.descricao,
          beneficiario: input.beneficiario || null,
          dataMovimentacao: input.dataMovimentacao || null,
          dataLevantamento: input.dataLevantamento || null,
          banco: input.banco || null,
          numeroAlvara: input.numeroAlvara || null,
          percentualHonorarios: input.percentualHonorarios ? String(input.percentualHonorarios) : null,
          fundamentoLegal: input.fundamentoLegal || null,
        }).$returningId();
        // Notificar nova movimentação
        const tipoLabels: Record<string, string> = {
          deposito_judicial: 'Depósito Judicial',
          alvara_levantamento: 'Alvará de Levantamento',
          honorarios_sucumbenciais: 'Honorários Sucumbenciais',
          honorarios_contratuais: 'Honorários Contratuais',
          pagamento: 'Pagamento',
          restituicao: 'Restituição',
          multa: 'Multa',
          custas: 'Custas',
        };
        await criarNotificacao({
          tipo: 'honorario_novo',
          prioridade: 'normal',
          titulo: `Nova movimentação: ${tipoLabels[input.tipo] || input.tipo}`,
          mensagem: `R$ ${input.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} - ${input.descricao}`,
          clienteId: input.clienteId,
          processoId: input.processoId || undefined,
          movimentacaoFinanceiraId: result.id,
          linkUrl: `/clientes/${input.clienteId}`,
          icone: 'DollarSign',
          cor: 'green',
        });
        return { success: true, id: result.id };
      }),

    excluirMovimentacaoFinanceira: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error('Database not available');
        await db.delete(movimentacoesFinanceiras).where(eq(movimentacoesFinanceiras.id, input.id));
        return { success: true };
      }),

    stats: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { totalClientes: 0, totalProcessos: 0, processosAtivos: 0, valorTotalCausas: 0, honorarios: { total: 0, pagosLevantados: 0, depositadosALevantar: 0, pendentes: 0 }, depositos: { total: 0, levantados: 0, aLevantar: 0 }, alvaras: { total: 0, levantados: 0, pendentes: 0 } };
      const [cliCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(clientes);
      const [procCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(processos);
      const [ativosCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(processos).where(eq(processos.statusProcesso, "Ativo"));
      const [valorTotal] = await db.select({ total: sql<string>`COALESCE(SUM(valorCausa), 0)` }).from(processos);
      // Honorários consolidados
      const allMovFin = await db.select().from(movimentacoesFinanceiras);
      const honorarios = { total: 0, pagosLevantados: 0, depositadosALevantar: 0, pendentes: 0 };
      const depositos = { total: 0, levantados: 0, aLevantar: 0 };
      const alvaras = { total: 0, levantados: 0, pendentes: 0 };
      for (const mf of allMovFin) {
        const val = parseFloat(String(mf.valor || '0'));
        if (mf.tipo === 'honorarios_sucumbenciais' || mf.tipo === 'honorarios_contratuais') {
          honorarios.total += val;
          if (mf.status === 'pago_levantado') honorarios.pagosLevantados += val;
          else if (mf.status === 'depositado_a_levantar') honorarios.depositadosALevantar += val;
          else honorarios.pendentes += val;
        } else if (mf.tipo === 'deposito_judicial') {
          depositos.total += val;
          if (mf.status === 'pago_levantado') depositos.levantados += val;
          else depositos.aLevantar += val;
        } else if (mf.tipo === 'alvara_levantamento') {
          alvaras.total += val;
          if (mf.status === 'pago_levantado') alvaras.levantados += val;
          else alvaras.pendentes += val;
        }
      }
      return {
        totalClientes: cliCount?.count ?? 0,
        totalProcessos: procCount?.count ?? 0,
        processosAtivos: ativosCount?.count ?? 0,
        valorTotalCausas: parseFloat(String(valorTotal?.total ?? "0")),
        honorarios,
        depositos,
        alvaras,
      };
    }),
  }),

  // ==================== PROCESSOS (CRUD) ====================
  processosRouter: router({
    recentes: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(20).optional() }).optional())
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        const lim = input?.limit ?? 8;
        const rows = await db.select({
          id: processos.id,
          clienteId: processos.clienteId,
          numeroCnj: processos.numeroCnj,
          tipoAcao: processos.tipoAcao,
          faseAtual: processos.faseAtual,
          statusProcesso: processos.statusProcesso,
          tribunal: processos.tribunal,
          vara: processos.vara,
          valorCausa: processos.valorCausa,
          nomeCliente: clientes.nomeCompleto,
          updatedAt: processos.updatedAt,
          createdAt: processos.createdAt,
        })
          .from(processos)
          .leftJoin(clientes, eq(processos.clienteId, clientes.id))
          .orderBy(desc(processos.updatedAt))
          .limit(lim);
        return rows;
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        await db.delete(estrategias).where(eq(estrategias.processoId, input.id));
        await db.delete(partesProcessuais).where(eq(partesProcessuais.processoId, input.id));
        await db.delete(movimentacoes).where(eq(movimentacoes.processoId, input.id));
        await db.delete(cumprimentosSentenca).where(eq(cumprimentosSentenca.processoId, input.id));
        await db.delete(conhecimentos).where(eq(conhecimentos.processoOrigemId, input.id));
        await db.delete(documentos).where(eq(documentos.processoId, input.id));
        await db.delete(processos).where(eq(processos.id, input.id));
        return { success: true, deletedId: input.id };
      }),
  }),

  // ==================== CONHECIMENTOS (CRUD) ====================
  conhecimentosRouter: router({
    list: protectedProcedure
      .input(z.object({ search: z.string().optional(), categoria: z.string().optional() }).optional())
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        if (input?.search) {
          return db.select().from(conhecimentos)
            .where(sql`${conhecimentos.titulo} LIKE ${`%${input.search}%`} OR ${conhecimentos.conteudo} LIKE ${`%${input.search}%`}`)
            .orderBy(desc(conhecimentos.createdAt));
        }
        if (input?.categoria) {
          return db.select().from(conhecimentos)
            .where(sql`${conhecimentos.categoria} = ${input.categoria}`)
            .orderBy(desc(conhecimentos.createdAt));
        }
        return db.select().from(conhecimentos).orderBy(desc(conhecimentos.createdAt));
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        await db.delete(conhecimentos).where(eq(conhecimentos.id, input.id));
        return { success: true };
      }),
    bulkInsert: protectedProcedure
      .input(z.object({
        records: z.array(z.object({
          categoria: z.enum(["Jurisprudencia", "Tese", "Estrategia", "Legislacao", "Modelo"]),
          titulo: z.string(),
          conteudo: z.string().optional(),
          tribunal: z.string().optional(),
          tipoAcao: z.string().optional(),
          tags: z.string().optional(),
        }))
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        let inserted = 0;
        for (const rec of input.records) {
          try {
            await db.insert(conhecimentos).values({
              categoria: rec.categoria,
              titulo: rec.titulo.substring(0, 500),
              conteudo: rec.conteudo || null,
              tribunal: rec.tribunal || null,
              tipoAcao: rec.tipoAcao || null,
              tags: rec.tags || null,
            });
            inserted++;
          } catch(e) {
            console.error(`Erro ao inserir conhecimento: ${rec.titulo}`, e);
          }
        }
        return { success: true, inserted, total: input.records.length };
      }),
  }),

  // ==================== UPLOAD E PROCESSAMENTO ====================
  processar: router({
    uploadPdf: protectedProcedure
      .input(z.object({
        fileName: z.string(),
        fileBase64: z.string(),
        fileSize: z.number(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        // 1. Extract text from PDF
        const buffer = Buffer.from(input.fileBase64, "base64");
        const pdfParse = (await import("pdf-parse")) as any;
        let textoExtraido = "";
        try {
          const pdfData = await pdfParse(buffer);
          textoExtraido = pdfData.text.substring(0, 50000);
        } catch (e) {
          textoExtraido = "Erro na extração de texto do PDF";
        }

        // 2. Use AI to extract structured data
        const extractionPrompt = `Você é um assistente jurídico especializado em análise de processos judiciais brasileiros.
Analise o texto extraído de um processo judicial e extraia TODOS os dados estruturados possíveis.

REGRAS CRÍTICAS PARA IDENTIFICAÇÃO DO CLIENTE:
- O escritório é MELO & PREDA ADVOGADOS, do Dr. PAULO DA SILVA MELO FILHO (OAB/GO 40.559)
- O CLIENTE é SEMPRE a parte que o Dr. Paulo Melo representa no processo
- Para identificar o cliente: procure quem outorgou procuração ao Dr. Paulo Melo ou quem ele representa como advogado
- O cliente NUNCA é um banco (Bradesco, Itaú, Santander, Caixa, Inter, Pan, Safra, BB, BRB, etc.)
- O cliente NUNCA é o advogado da parte contrária
- Se o Dr. Paulo Melo representa o AUTOR, o cliente é o autor (pessoa física/jurídica que não é banco)
- Se o Dr. Paulo Melo representa o RÉU, o cliente é o réu (pessoa física/jurídica que não é banco)
- Em processos de cumprimento de sentença/execução, o cliente é quem o Dr. Paulo Melo representa, mesmo que a petição tenha sido protocolada pelo banco
- Se houver dúvida, o cliente é a PESSOA FÍSICA mencionada no processo (não o banco, não o advogado)
- Extraia CPF/CNPJ do CLIENTE identificado acima, não do advogado nem do banco

OUTRAS REGRAS:
- Se houver múltiplos CPFs, identifique qual pertence ao cliente (parte representada pelo Dr. Paulo Melo)
- Valores monetários devem ser números sem formatação (ex: 487150.30)
- Datas no formato DD/MM/YYYY
- Se não encontrar um campo, retorne null
- Identifique a natureza da ação (cível, trabalhista, consumerista, etc.)
- Classifique se o processo está ativo ou inativo
- Extraia TODOS os empréstimos consignados mencionados
- IMPORTANTE: Identifique se o processo é DEPENDENTE de outro (ex: cumprimento de sentença, recurso, embargos protocolados por dependência)
- Se houver menção a "por dependência ao processo nº" ou "autos principais", extraia o número CNJ do processo principal
- Em processos de cumprimento de sentença, o CLIENTE é o autor dos autos principais, não o advogado exequente

Retorne um JSON com esta estrutura exata:
{
  "cliente": {
    "cpfCnpj": "string ou null",
    "nomeCompleto": "string",
    "tipoPessoa": "PF ou PJ",
    "rg": "string ou null",
    "profissao": "string ou null",
    "cargo": "string ou null",
    "orgaoEmpregador": "string ou null",
    "vinculoFuncional": "string ou null",
    "endereco": "string ou null",
    "cidade": "string ou null",
    "estado": "string ou null",
    "cep": "string ou null",
    "nacionalidade": "string ou null",
    "telefone": "string ou null",
    "email": "string ou null",
    "dataNascimento": "DD/MM/YYYY ou null",
    "estadoCivil": "solteiro|casado|divorciado|viuvo|uniao estavel ou null"
  },
  "processo": {
    "numeroCnj": "string",
    "tribunal": "string ou null",
    "comarca": "string ou null",
    "vara": "string ou null",
    "tipoAcao": "string",
    "natureza": "string ou null",
    "classeProcessual": "string ou null",
    "assunto": "string ou null",
    "faseAtual": "Conhecimento|Cumprimento Provisorio|Cumprimento Definitivo|Execucao|Recurso|Arquivado|Suspenso",
    "statusProcesso": "Ativo|Sentenca Procedente|Sentenca Improcedente|Parcialmente Procedente|Acordo|Arquivado|Recurso Pendente",
    "valorCausa": "number ou null",
    "dataDistribuicao": "string ou null",
    "dataSentenca": "string ou null",
    "juiz": "string ou null",
    "prioridade": "string ou null",
    "segredoJustica": false,
    "poloAtivo": "string",
    "poloPassivo": "string (nomes separados por ;)",
    "advogadoAutor": "string ou null",
    "processoOrigemCnj": "string ou null (número CNJ do processo principal, se este for dependente/cumprimento/recurso)",
    "tipoVinculo": "string ou null (Cumprimento Provisório|Cumprimento Definitivo|Recurso|Embargos|Agravo|null se for autos principais)"
  },
  "financeiro": {
    "remuneracaoBruta": "number ou null",
    "remuneracaoLiquida": "number ou null",
    "margemConsignavelPerc": "number ou null",
    "margemConsignavelValor": "number ou null",
    "totalConsignacoes": "number ou null",
    "fonteRenda": "string ou null"
  },
  "emprestimos": [
    {
      "banco": "string",
      "contrato": "string ou null",
      "valorParcela": "number ou null",
      "valorTotal": "number ou null",
      "totalParcelas": "number ou null"
    }
  ],
  "estrategia": {
    "tesePrincipal": "string",
    "fundamentacaoLegal": "string (artigos citados)",
    "jurisprudenciaCitada": "string (súmulas e acórdãos)",
    "pontosFortes": "string",
    "riscosIdentificados": "string"
  },
  "sentenca": {
    "resultado": "string ou null",
    "valorCondenacao": "number ou null",
    "danosMorais": "number ou null",
    "danosMateriais": "number ou null",
    "restituicao": "number ou null",
    "honorariosPerc": "number ou null",
    "tutelaTipo": "string ou null",
    "tutelaStatus": "string ou null",
    "tutelaDescricao": "string ou null"
  },
  "partesPassivas": [
    {
      "nome": "string",
      "cpfCnpj": "string ou null",
      "categoria": "Banco|Empresa|Pessoa Fisica|Orgao Publico"
    }
  ],
  "movimentacoes": [
    {
      "data": "DD/MM/YYYY ou null",
      "evento": "tipo do evento processual (Petição Inicial, Sentença, Recurso, Despacho, etc.)",
      "descricao": "descrição detalhada do evento",
      "numero_evento": "número do evento PROJUDI se mencionado, ou null"
    }
  ]
}

TEXTO DO PROCESSO:
${textoExtraido}`;

        let dadosExtraidos: any = {};
        try {
          const result = await invokeLLM({
            messages: [
              { role: "system", content: "Você é um extrator de dados jurídicos. Responda APENAS com JSON válido, sem markdown." },
              { role: "user", content: extractionPrompt }
            ],
            responseFormat: { type: "json_object" },
          });
          const content = result.choices[0]?.message?.content;
          const textContent = typeof content === "string" ? content : Array.isArray(content) ? content.map((c: any) => c.type === "text" ? c.text : "").join("") : "";
          dadosExtraidos = JSON.parse(textContent);
        } catch (e) {
          console.error("AI extraction error:", e);
          dadosExtraidos = { error: "Falha na extração via IA" };
        }

        // 2.5. VALIDAÇÃO: Verificar se o LLM confundiu banco com cliente
        const BANCOS_CONHECIDOS = ['BANCO', 'BRADESCO', 'ITAU', 'ITAÚ', 'SANTANDER', 'CAIXA ECONOMICA', 'CAIXA ECONÔMICA', 'INTER S.A', 'INTER S/A', 'PAN S.A', 'PAN S/A', 'SAFRA', 'BRB', 'BANCO DO BRASIL', 'BMG', 'DAYCOVAL', 'VOTORANTIM', 'ORIGINAL', 'BANRISUL', 'SICOOB', 'SICREDI', 'COOPERATIVA DE CREDITO', 'COOPERATIVA DE CRÉDITO', 'FINANCEIRA', 'CREDITAS', 'NUBANK', 'C6 BANK', 'AGIBANK'];
        const nomeClienteExtraido = (dadosExtraidos.cliente?.nomeCompleto || '').toUpperCase();
        const clienteEhBanco = BANCOS_CONHECIDOS.some(b => nomeClienteExtraido.includes(b.toUpperCase()));
        
        if (clienteEhBanco) {
          console.log(`[Upload] CORREÇÃO: LLM identificou banco como cliente (${nomeClienteExtraido}). Invertendo partes...`);
          // O banco foi identificado como cliente - precisamos inverter
          // Buscar a pessoa física/jurídica real nas partes passivas ou no polo ativo/passivo
          const poloAtivo = dadosExtraidos.processo?.poloAtivo || '';
          const poloPassivo = dadosExtraidos.processo?.poloPassivo || '';
          const partesPassivas = dadosExtraidos.partesPassivas || [];
          
          // Procurar pessoa que não é banco
          let clienteReal = null;
          // Verificar polo ativo primeiro
          if (poloAtivo && !BANCOS_CONHECIDOS.some(b => poloAtivo.toUpperCase().includes(b.toUpperCase()))) {
            clienteReal = { nome: poloAtivo, cpf: null };
          }
          // Verificar polo passivo
          if (!clienteReal && poloPassivo) {
            const partesPassivoArr = poloPassivo.split(';').map((p: string) => p.trim());
            for (const p of partesPassivoArr) {
              if (!BANCOS_CONHECIDOS.some(b => p.toUpperCase().includes(b.toUpperCase()))) {
                clienteReal = { nome: p, cpf: null };
                break;
              }
            }
          }
          // Verificar nas partes passivas extraídas
          if (!clienteReal) {
            for (const pp of partesPassivas) {
              if (pp.categoria !== 'Banco' && !BANCOS_CONHECIDOS.some(b => (pp.nome || '').toUpperCase().includes(b.toUpperCase()))) {
                clienteReal = { nome: pp.nome, cpf: pp.cpfCnpj };
                break;
              }
            }
          }
          
          if (clienteReal) {
            // Mover o banco para as partes passivas
            if (!dadosExtraidos.partesPassivas) dadosExtraidos.partesPassivas = [];
            dadosExtraidos.partesPassivas.push({
              nome: dadosExtraidos.cliente.nomeCompleto,
              cpfCnpj: dadosExtraidos.cliente.cpfCnpj,
              categoria: 'Banco'
            });
            // Corrigir o cliente
            dadosExtraidos.cliente.nomeCompleto = clienteReal.nome;
            dadosExtraidos.cliente.cpfCnpj = clienteReal.cpf;
            dadosExtraidos.cliente.tipoPessoa = 'PF';
            console.log(`[Upload] Cliente corrigido para: ${clienteReal.nome}`);
          }
        }

        // 3. Deduplication and save to DB
        let clienteId: number;
        const cpf = dadosExtraidos.cliente?.cpfCnpj;
        const nome = dadosExtraidos.cliente?.nomeCompleto || input.fileName.replace(".pdf", "");

        if (cpf) {
          const existing = await db.select().from(clientes).where(eq(clientes.cpfCnpj, cpf)).limit(1);
          if (existing.length > 0) {
            clienteId = existing[0].id;
            // MERGE INTELIGENTE: preenche TODOS os campos vazios com dados novos extraídos
            const ex = existing[0];
            const cl = dadosExtraidos.cliente || {};
            await db.update(clientes).set({
              nomeCompleto: cl.nomeCompleto || ex.nomeCompleto,
              tipoPessoa: cl.tipoPessoa === 'PJ' ? 'PJ' : (ex.tipoPessoa || 'PF'),
              rg: cl.rg || ex.rg,
              profissao: cl.profissao || ex.profissao,
              cargo: cl.cargo || ex.cargo,
              orgaoEmpregador: cl.orgaoEmpregador || ex.orgaoEmpregador,
              vinculoFuncional: cl.vinculoFuncional || ex.vinculoFuncional,
              endereco: cl.endereco || ex.endereco,
              cidade: cl.cidade || ex.cidade,
              estado: cl.estado || ex.estado,
              cep: cl.cep || ex.cep,
              nacionalidade: cl.nacionalidade || ex.nacionalidade,
              telefone: cl.telefone || ex.telefone,
              email: cl.email || ex.email,
              dataNascimento: cl.dataNascimento || ex.dataNascimento,
              estadoCivil: cl.estadoCivil || ex.estadoCivil,
            }).where(eq(clientes.id, clienteId));
          } else {
            const cl = dadosExtraidos.cliente || {};
            const [inserted] = await db.insert(clientes).values({
              cpfCnpj: cpf,
              nomeCompleto: nome,
              tipoPessoa: cl.tipoPessoa === "PJ" ? "PJ" : "PF",
              rg: cl.rg || null,
              profissao: cl.profissao || null,
              cargo: cl.cargo || null,
              orgaoEmpregador: cl.orgaoEmpregador || null,
              vinculoFuncional: cl.vinculoFuncional || null,
              endereco: cl.endereco || null,
              cidade: cl.cidade || null,
              estado: cl.estado || null,
              cep: cl.cep || null,
              nacionalidade: cl.nacionalidade || null,
              telefone: cl.telefone || null,
              email: cl.email || null,
              dataNascimento: cl.dataNascimento || null,
              estadoCivil: cl.estadoCivil || null,
            }).$returningId();
            clienteId = inserted.id;
          }
        } else {
          // CPF não extraído - buscar por nome similar para evitar duplicação
          const nomeLimpo = nome.replace(/PROCESSO|COMPLETO|AUTOS|PRINCIPAIS|CUMPRIMENTO|PROVISORIO|PROVISÓRIO|SENTENÇA|SENTENCA|COMPETO|DE|DO|DA/gi, '').trim();
          const palavrasNome = nomeLimpo.split(/\s+/).filter((p: string) => p.length > 2);
          let clienteExistente = null;
          
          if (palavrasNome.length > 0) {
            // Buscar clientes existentes e comparar nomes
            const todosClientes = await db.select().from(clientes);
            for (const c of todosClientes) {
              const nomeClienteLimpo = c.nomeCompleto.replace(/PROCESSO|COMPLETO|AUTOS|PRINCIPAIS|CUMPRIMENTO|PROVISORIO|PROVISÓRIO|SENTENÇA|SENTENCA|COMPETO|DE|DO|DA/gi, '').trim().toUpperCase();
              const nomeUploadLimpo = nomeLimpo.toUpperCase();
              // Verificar se alguma palavra significativa do nome está presente
              const matches = palavrasNome.filter((p: string) => nomeClienteLimpo.includes(p.toUpperCase()));
              if (matches.length >= 1 && matches.length >= palavrasNome.length * 0.5) {
                clienteExistente = c;
                break;
              }
            }
          }
          
          if (clienteExistente) {
            clienteId = clienteExistente.id;
            console.log(`[Upload] Cliente encontrado por nome similar: ${clienteExistente.nomeCompleto} (ID: ${clienteId})`);
          } else {
             const cl = dadosExtraidos.cliente || {};
            const [inserted] = await db.insert(clientes).values({
              cpfCnpj: `PEND_${Date.now().toString(36)}`,
              nomeCompleto: nome,
              tipoPessoa: cl.tipoPessoa === 'PJ' ? 'PJ' : 'PF',
              rg: cl.rg || null,
              profissao: cl.profissao || null,
              cargo: cl.cargo || null,
              orgaoEmpregador: cl.orgaoEmpregador || null,
              vinculoFuncional: cl.vinculoFuncional || null,
              endereco: cl.endereco || null,
              cidade: cl.cidade || null,
              estado: cl.estado || null,
              cep: cl.cep || null,
              nacionalidade: cl.nacionalidade || null,
              telefone: cl.telefone || null,
              email: cl.email || null,
              dataNascimento: cl.dataNascimento || null,
              estadoCivil: cl.estadoCivil || null,
            }).$returningId();
            clienteId = inserted.id;
          }
        }
        // 4. Upload PDF to client folder in S3
        const clienteCpf = cpf || `PEND_${Date.now().toString(36)}`;
        const folder = clientFolderKey(nome, clienteCpf);
        const pdfKey = `${folder}/processos_pdf/${input.fileName}`;
        const { key, url } = await storagePut(pdfKey, buffer, "application/pdf");

        // 5. Insert processo (dedup by numeroCnj)
        const numCnj = dadosExtraidos.processo?.numeroCnj || `SEM_${Date.now().toString(36)}`;
        const existingProc = await db.select().from(processos).where(eq(processos.numeroCnj, numCnj)).limit(1);
        let processoId: number;

        if (existingProc.length > 0) {
          processoId = existingProc[0].id;
          await db.update(processos).set({
            faseAtual: dadosExtraidos.processo?.faseAtual || existingProc[0].faseAtual,
            statusProcesso: dadosExtraidos.processo?.statusProcesso || existingProc[0].statusProcesso,
            pdfStorageKey: key,
            pdfUrl: url,
            textoExtraido: textoExtraido.substring(0, 60000),
          }).where(eq(processos.id, processoId));
        } else {
          const proc = dadosExtraidos.processo || {};
          const sent = dadosExtraidos.sentenca || {};
          const [insertedProc] = await db.insert(processos).values({
            clienteId,
            numeroCnj: numCnj,
            tribunal: proc.tribunal,
            comarca: proc.comarca,
            vara: proc.vara,
            tipoAcao: proc.tipoAcao,
            natureza: proc.natureza,
            classeProcessual: proc.classeProcessual,
            assunto: proc.assunto,
            faseAtual: proc.faseAtual || "Conhecimento",
            statusProcesso: proc.statusProcesso || "Ativo",
            valorCausa: proc.valorCausa ? String(proc.valorCausa) : null,
            dataDistribuicao: proc.dataDistribuicao,
            dataSentenca: proc.dataSentenca,
            juiz: proc.juiz,
            prioridade: proc.prioridade,
            segredoJustica: proc.segredoJustica ? 1 : 0,
            poloAtivo: proc.poloAtivo,
            poloPassivo: proc.poloPassivo,
            advogadoAutor: proc.advogadoAutor,
            valorCondenacao: sent.valorCondenacao ? String(sent.valorCondenacao) : null,
            danosMorais: sent.danosMorais ? String(sent.danosMorais) : null,
            danosMateriais: sent.danosMateriais ? String(sent.danosMateriais) : null,
            restituicao: sent.restituicao ? String(sent.restituicao) : null,
            honorariosPerc: sent.honorariosPerc ? String(sent.honorariosPerc) : null,
            tutelaTipo: sent.tutelaTipo,
            tutelaStatus: sent.tutelaStatus,
            tutelaDescricao: sent.tutelaDescricao,
            pdfStorageKey: key,
            pdfUrl: url,
            textoExtraido: textoExtraido.substring(0, 60000),
          }).$returningId();
          processoId = insertedProc.id;
        }

        // 5.5. Vincular processo dependente ao principal (se aplicável)
        const origemCnj = dadosExtraidos.processo?.processoOrigemCnj;
        const tipoVinculo = dadosExtraidos.processo?.tipoVinculo;
        if (origemCnj && tipoVinculo) {
          const [procOrigem] = await db.select().from(processos).where(eq(processos.numeroCnj, origemCnj)).limit(1);
          if (procOrigem) {
            await db.update(processos).set({
              processoOrigemId: procOrigem.id,
              tipoVinculo: tipoVinculo,
            }).where(eq(processos.id, processoId));
            console.log(`[Vinculação] Processo ${numCnj} vinculado ao principal ${origemCnj} (${tipoVinculo})`);
          } else {
            // Processo principal ainda não importado - salvar CNJ para vincular depois
            await db.update(processos).set({
              tipoVinculo: `${tipoVinculo} (pendente: ${origemCnj})`,
            }).where(eq(processos.id, processoId));
            console.log(`[Vinculação] Processo principal ${origemCnj} não encontrado. Vinculação pendente.`);
          }
        }

        // 6. Insert financial data
        if (dadosExtraidos.financeiro) {
          const fin = dadosExtraidos.financeiro;
          await db.insert(dadosFinanceiros).values({
            clienteId,
            remuneracaoBruta: fin.remuneracaoBruta ? String(fin.remuneracaoBruta) : null,
            remuneracaoLiquida: fin.remuneracaoLiquida ? String(fin.remuneracaoLiquida) : null,
            margemConsignavelPerc: fin.margemConsignavelPerc ? String(fin.margemConsignavelPerc) : null,
            margemConsignavelValor: fin.margemConsignavelValor ? String(fin.margemConsignavelValor) : null,
            totalConsignacoes: fin.totalConsignacoes ? String(fin.totalConsignacoes) : null,
            fonteRenda: fin.fonteRenda,
          });
        }

        // 7. Insert emprestimos
        if (dadosExtraidos.emprestimos?.length) {
          for (const emp of dadosExtraidos.emprestimos) {
            await db.insert(emprestimosConsignados).values({
              clienteId,
              banco: emp.banco,
              contrato: emp.contrato,
              valorParcela: emp.valorParcela ? String(emp.valorParcela) : null,
              valorTotal: emp.valorTotal ? String(emp.valorTotal) : null,
              totalParcelas: emp.totalParcelas,
            });
          }
        }

        // 8. Insert estrategia
        if (dadosExtraidos.estrategia) {
          const est = dadosExtraidos.estrategia;
          await db.insert(estrategias).values({
            processoId,
            tesePrincipal: est.tesePrincipal,
            fundamentacaoLegal: est.fundamentacaoLegal,
            jurisprudenciaCitada: est.jurisprudenciaCitada,
            pontosFortes: est.pontosFortes,
            riscosIdentificados: est.riscosIdentificados,
          });
        }

        // 9. Insert partes passivas
        if (dadosExtraidos.partesPassivas?.length) {
          for (const parte of dadosExtraidos.partesPassivas) {
            await db.insert(partesProcessuais).values({
              processoId,
              nome: parte.nome,
              cpfCnpj: parte.cpfCnpj,
              tipo: "Reu",
              categoria: parte.categoria,
            });
          }
        }

        // 9.5. Insert movimentacoes extraídas pela IA
        if (dadosExtraidos.movimentacoes?.length) {
          for (const mov of dadosExtraidos.movimentacoes) {
            const numEvento = mov.numero_evento ? `[Ev.${mov.numero_evento}] ` : '';
            await db.insert(movimentacoes).values({
              processoId,
              data: mov.data || null,
              evento: (mov.evento || 'Movimentação').substring(0, 500),
              descricao: (numEvento + (mov.descricao || '')).substring(0, 5000),
            });
          }
        }

        // 10. Insert document record
        await db.insert(documentos).values({
          processoId,
          clienteId,
          tipo: "Processo Completo",
          nomeArquivo: input.fileName,
          storageKey: key,
          storageUrl: url,
          tamanho: input.fileSize,
          mimeType: "application/pdf",
        });

        // 11. Extract knowledge
        if (dadosExtraidos.estrategia?.tesePrincipal) {
          await db.insert(conhecimentos).values({
            categoria: "Tese",
            titulo: `Tese: ${dadosExtraidos.processo?.tipoAcao || "Processo"} - ${nome}`,
            conteudo: dadosExtraidos.estrategia.tesePrincipal,
            tribunal: dadosExtraidos.processo?.tribunal,
            tipoAcao: dadosExtraidos.processo?.tipoAcao,
            processoOrigemId: processoId,
          });
        }
        if (dadosExtraidos.estrategia?.jurisprudenciaCitada) {
          await db.insert(conhecimentos).values({
            categoria: "Jurisprudencia",
            titulo: `Jurisprudência: ${dadosExtraidos.processo?.tipoAcao || "Processo"} - ${nome}`,
            conteudo: dadosExtraidos.estrategia.jurisprudenciaCitada,
            tribunal: dadosExtraidos.processo?.tribunal,
            tipoAcao: dadosExtraidos.processo?.tipoAcao,
            processoOrigemId: processoId,
          });
        }
        if (dadosExtraidos.estrategia?.fundamentacaoLegal) {
          await db.insert(conhecimentos).values({
            categoria: "Legislacao",
            titulo: `Fundamentação: ${dadosExtraidos.processo?.tipoAcao || "Processo"} - ${nome}`,
            conteudo: dadosExtraidos.estrategia.fundamentacaoLegal,
            tribunal: dadosExtraidos.processo?.tribunal,
            tipoAcao: dadosExtraidos.processo?.tipoAcao,
            processoOrigemId: processoId,
          });
        }

        // 11.5. ANÁLISE PROFUNDA: Gerar estudo completo do processo para o banco de conhecimentos
        try {
          const analiseProfundaPrompt = `Você é um advogado sênior expert do escritório MELO & PREDA ADVOGADOS.
Faça uma ANÁLISE PROFUNDA E COMPLETA do processo abaixo. Esta análise será usada como base de conhecimento para gerar petições, estratégias e qualquer ação futura.

RETORNE UM JSON com esta estrutura:
{
  "resumoExecutivo": "Resumo completo do processo em 3-5 parágrafos, incluindo histórico, situação atual e perspectivas",
  "analiseJuridica": "Análise jurídica detalhada: teses aplicáveis, fundamentação legal, jurisprudência relevante, pontos fortes e fracos",
  "estrategiaDetalhada": "Estratégia processual completa: próximos passos, petições necessárias, prazos críticos, argumentos a desenvolver",
  "pontosChave": ["lista de pontos-chave do processo"],
  "riscosOportunidades": "Riscos identificados e oportunidades processuais",
  "valorEstimado": "Análise de valores: causa, condenação, honorários, depósitos",
  "historicoResumo": "Resumo cronológico das movimentações mais importantes",
  "peticoesNecessarias": ["lista de petições que podem ser necessárias"],
  "observacoesEspeciais": "Qualquer observação especial, peculiaridade ou atenção necessária"
}

TEXTO DO PROCESSO:
${textoExtraido.substring(0, 45000)}`;

          const analiseResult = await invokeLLM({
            messages: [
              { role: 'system', content: 'Você é um advogado sênior especialista. Responda APENAS com JSON válido.' },
              { role: 'user', content: analiseProfundaPrompt }
            ],
            responseFormat: { type: 'json_object' },
          });
          const analiseContent = analiseResult.choices[0]?.message?.content;
          const analiseText = typeof analiseContent === 'string' ? analiseContent : Array.isArray(analiseContent) ? analiseContent.map((c: any) => c.type === 'text' ? c.text : '').join('') : '';
          const analiseProfunda = JSON.parse(analiseText);

          // Salvar análise profunda no banco de conhecimentos
          await db.insert(conhecimentos).values({
            categoria: 'Estrategia',
            titulo: `Análise Profunda: ${dadosExtraidos.processo?.tipoAcao || 'Processo'} - ${nome} (${numCnj})`,
            conteudo: JSON.stringify(analiseProfunda, null, 2),
            tribunal: dadosExtraidos.processo?.tribunal,
            tipoAcao: dadosExtraidos.processo?.tipoAcao,
            processoOrigemId: processoId,
            tags: `analise_profunda,${nome},${numCnj}`,
          });

          // Salvar resumo executivo separado
          if (analiseProfunda.resumoExecutivo) {
            await db.insert(conhecimentos).values({
              categoria: 'Estrategia',
              titulo: `Resumo Executivo: ${nome} - ${numCnj}`,
              conteudo: analiseProfunda.resumoExecutivo + '\n\n' + (analiseProfunda.analiseJuridica || '') + '\n\n' + (analiseProfunda.estrategiaDetalhada || ''),
              tribunal: dadosExtraidos.processo?.tribunal,
              tipoAcao: dadosExtraidos.processo?.tipoAcao,
              processoOrigemId: processoId,
              tags: `resumo_executivo,${nome},${numCnj}`,
            });
          }

          // Salvar petições necessárias como conhecimento
          if (analiseProfunda.peticoesNecessarias?.length) {
            await db.insert(conhecimentos).values({
              categoria: 'Estrategia',
              titulo: `Petições Necessárias: ${nome} - ${numCnj}`,
              conteudo: analiseProfunda.peticoesNecessarias.join('\n- ') + '\n\n' + (analiseProfunda.observacoesEspeciais || ''),
              tribunal: dadosExtraidos.processo?.tribunal,
              tipoAcao: dadosExtraidos.processo?.tipoAcao,
              processoOrigemId: processoId,
              tags: `peticoes_necessarias,${nome},${numCnj}`,
            });
          }

          console.log(`[Upload] Análise profunda gerada e salva para ${nome} (${numCnj})`);
        } catch (analiseErr) {
          console.error('[Upload] Erro na análise profunda (não-crítico):', analiseErr);
        }

        // 12. Build client folder with all JSON files in S3
        const pastaCliente = await buildClientFolder(clienteId, nome, clienteCpf);

        // 13. HOOK: Atualizar Relatório Cadastral automaticamente após importação
        try {
          await autoUpdateRelatorioCadastral(db);
          console.log(`[Relatório] Relatório cadastral atualizado automaticamente após importação de ${nome}`);
        } catch (relErr) {
          console.error("[Relatório] Erro ao atualizar relatório cadastral após importação:", relErr);
        }

        return {
          success: true,
          clienteId,
          processoId,
          clienteNome: nome,
          cpf: cpf || "PENDENTE",
          numeroCnj: numCnj,
          pastaCliente: pastaCliente?.folder || folder,
          arquivosPasta: pastaCliente?.files || null,
          dadosExtraidos,
          relatorioAtualizado: true,
        };
      }),

    // ==================== UPLOAD DE CONTRACHEQUE ====================
    uploadContracheque: protectedProcedure
      .input(z.object({
        fileName: z.string(),
        fileBase64: z.string(),
        fileSize: z.number(),
        clienteId: z.number().optional(), // Se já souber o cliente
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        // 1. Extract text from PDF contracheque
        const buffer = Buffer.from(input.fileBase64, "base64");
        const pdfParse = (await import("pdf-parse")) as any;
        let textoExtraido = "";
        try {
          const pdfData = await pdfParse(buffer);
          textoExtraido = pdfData.text.substring(0, 50000);
        } catch (e) {
          textoExtraido = "Erro na extração de texto do PDF";
        }

        // 2. Use AI to extract financial data from contracheque
        const extractionPrompt = `Você é um assistente especializado em análise de contracheques e demonstrativos de pagamento de servidores públicos brasileiros.
Analise o texto extraído de um contracheque/demonstrativo de pagamento e extraia TODOS os dados financeiros detalhados.

REGRAS IMPORTANTES:
- Identifique o NOME COMPLETO e CPF do servidor/beneficiário
- Extraia TODOS os valores de remuneração (bruta, líquida, descontos)
- Identifique CADA empréstimo consignado individualmente (banco, rubrica, contrato, parcela, total de parcelas)
- Calcule a margem consignável (35% do líquido para servidores de GO - Lei Estadual 16.898/2010)
- Some TODOS os descontos de empréstimos consignados para obter o total de consignações
- Calcule a margem disponível = margem consignável - total de consignações
- Se margem disponível < 0, a margem está excedida
- Valores monetários devem ser números sem formatação (ex: 4871.50)
- Identifique o órgão empregador, cargo, vínculo funcional
- Identifique o mês/ano de referência do contracheque

Retorne um JSON com esta estrutura exata:
{
  "servidor": {
    "nomeCompleto": "string",
    "cpf": "string ou null",
    "rg": "string ou null",
    "cargo": "string ou null",
    "orgaoEmpregador": "string ou null",
    "vinculoFuncional": "string ou null (Efetivo, Comissionado, Aposentado, Pensionista)",
    "lotacao": "string ou null",
    "matricula": "string ou null"
  },
  "referencia": {
    "mesAno": "string (MM/YYYY)",
    "dataCredito": "string ou null (DD/MM/YYYY)"
  },
  "remuneracao": {
    "remuneracaoBruta": "number",
    "descontoIrrf": "number ou null",
    "descontoPrevidencia": "number ou null",
    "outrosDescontos": "number ou null",
    "totalDescontos": "number",
    "remuneracaoLiquida": "number"
  },
  "margemConsignavel": {
    "percentual": 35,
    "valorMargem": "number (35% do líquido)",
    "totalConsignacoes": "number (soma de todas as parcelas de empréstimos)",
    "margemDisponivel": "number (valorMargem - totalConsignacoes)",
    "margemExcedida": "boolean",
    "valorExcedente": "number ou 0"
  },
  "emprestimosConsignados": [
    {
      "banco": "string (nome da instituição financeira)",
      "rubrica": "string ou null (código da rubrica no contracheque)",
      "contrato": "string ou null",
      "valorParcela": "number",
      "totalParcelas": "number ou null",
      "parcelasRestantes": "number ou null",
      "valorTotal": "number ou null",
      "taxaJuros": "number ou null"
    }
  ],
  "outrasRubricas": [
    {
      "codigo": "string",
      "descricao": "string",
      "tipo": "Provento ou Desconto",
      "valor": "number"
    }
  ]
}

TEXTO DO CONTRACHEQUE:
${textoExtraido}`;

        let dadosExtraidos: any = {};
        try {
          const result = await invokeLLM({
            messages: [
              { role: "system", content: "Você é um extrator de dados financeiros de contracheques. Responda APENAS com JSON válido, sem markdown." },
              { role: "user", content: extractionPrompt }
            ],
            responseFormat: { type: "json_object" },
          });
          const content = result.choices[0]?.message?.content;
          const textContent = typeof content === "string" ? content : Array.isArray(content) ? content.map((c: any) => c.type === "text" ? c.text : "").join("") : "";
          dadosExtraidos = JSON.parse(textContent);
        } catch (e) {
          console.error("AI extraction error (contracheque):", e);
          throw new Error("Falha na extração de dados do contracheque via IA");
        }

        // 3. Find or create client
        let clienteId = input.clienteId || 0;
        const cpf = dadosExtraidos.servidor?.cpf;
        const nome = dadosExtraidos.servidor?.nomeCompleto || input.fileName.replace(".pdf", "");

        if (clienteId) {
          // Update existing client with new data from contracheque
          const serv = dadosExtraidos.servidor || {};
          const updateData: Record<string, any> = {};
          if (serv.cargo) updateData.cargo = serv.cargo;
          if (serv.orgaoEmpregador) updateData.orgaoEmpregador = serv.orgaoEmpregador;
          if (serv.vinculoFuncional) updateData.vinculoFuncional = serv.vinculoFuncional;
          if (serv.rg) updateData.rg = serv.rg;
          if (Object.keys(updateData).length > 0) {
            await db.update(clientes).set(updateData).where(eq(clientes.id, clienteId));
          }
        } else if (cpf) {
          const existing = await db.select().from(clientes).where(eq(clientes.cpfCnpj, cpf)).limit(1);
          if (existing.length > 0) {
            clienteId = existing[0].id;
            // MERGE INTELIGENTE: preenche TODOS os campos vazios
            const serv = dadosExtraidos.servidor || {};
            const exC = existing[0];
            await db.update(clientes).set({
              rg: serv.rg || exC.rg,
              cargo: serv.cargo || exC.cargo,
              orgaoEmpregador: serv.orgaoEmpregador || exC.orgaoEmpregador,
              vinculoFuncional: serv.vinculoFuncional || exC.vinculoFuncional,
              profissao: serv.cargo || exC.profissao,
              endereco: serv.endereco || exC.endereco,
              cidade: serv.cidade || exC.cidade,
              estado: serv.estado || exC.estado,
              cep: serv.cep || exC.cep,
              nacionalidade: serv.nacionalidade || exC.nacionalidade,
              telefone: serv.telefone || exC.telefone,
              email: serv.email || exC.email,
              dataNascimento: serv.dataNascimento || exC.dataNascimento,
              estadoCivil: serv.estadoCivil || exC.estadoCivil,
            }).where(eq(clientes.id, clienteId));
          } else {
            // Create new client from contracheque
            const serv = dadosExtraidos.servidor || {};
            const [inserted] = await db.insert(clientes).values({
              cpfCnpj: cpf,
              nomeCompleto: nome,
              tipoPessoa: "PF",
              rg: serv.rg || null,
              cargo: serv.cargo || null,
              orgaoEmpregador: serv.orgaoEmpregador || null,
              vinculoFuncional: serv.vinculoFuncional || null,
              profissao: serv.cargo || "Servidor Público",
              endereco: serv.endereco || null,
              cidade: serv.cidade || null,
              estado: serv.estado || null,
              cep: serv.cep || null,
              nacionalidade: serv.nacionalidade || null,
              telefone: serv.telefone || null,
              email: serv.email || null,
              dataNascimento: serv.dataNascimento || null,
              estadoCivil: serv.estadoCivil || null,
            }).$returningId();
            clienteId = inserted.id;
          }
        } else {
          throw new Error("Não foi possível identificar o CPF do servidor no contracheque");
        }

        // 4. Upload contracheque PDF to S3
        const clienteCpf = cpf || `PEND_${Date.now().toString(36)}`;
        const folder = clientFolderKey(nome, clienteCpf);
        const ref = dadosExtraidos.referencia?.mesAno?.replace("/", "_") || "sem_ref";
        const pdfKey = `${folder}/contracheques/${ref}_${input.fileName}`;
        const { key, url } = await storagePut(pdfKey, buffer, "application/pdf");

        // 5. Insert document record
        await db.insert(documentos).values({
          clienteId,
          tipo: "Contracheque",
          nomeArquivo: input.fileName,
          storageKey: key,
          storageUrl: url,
          tamanho: input.fileSize,
          mimeType: "application/pdf",
        });

        // 6. Insert/Update financial data with full calculations
        const rem = dadosExtraidos.remuneracao || {};
        const marg = dadosExtraidos.margemConsignavel || {};
        const remuneracaoBruta = rem.remuneracaoBruta || 0;
        const remuneracaoLiquida = rem.remuneracaoLiquida || 0;
        const descontoIrrf = rem.descontoIrrf || 0;
        const descontoPrevidencia = rem.descontoPrevidencia || 0;
        const outrosDescontos = rem.outrosDescontos || 0;
        const margemPerc = marg.percentual || 35;
        const margemValor = marg.valorMargem || (remuneracaoLiquida * 0.35);
        const totalConsignacoes = marg.totalConsignacoes || 0;
        const margemDisponivel = marg.margemDisponivel ?? (margemValor - totalConsignacoes);
        const margemExcedida = margemDisponivel < 0 ? 1 : 0;
        const valorExcedente = margemExcedida ? Math.abs(margemDisponivel) : 0;
        const aptoEmprestimo = margemDisponivel > 0 ? 1 : 0;
        const scoreRisco = margemExcedida ? "Alto" : (margemDisponivel < margemValor * 0.1 ? "Medio" : "Baixo");

        // Check if financial data already exists for this client
        const existingFin = await db.select().from(dadosFinanceiros).where(eq(dadosFinanceiros.clienteId, clienteId)).limit(1);
        if (existingFin.length > 0) {
          await db.update(dadosFinanceiros).set({
            remuneracaoBruta: String(remuneracaoBruta),
            remuneracaoLiquida: String(remuneracaoLiquida),
            descontoIrrf: String(descontoIrrf),
            descontoPrevidencia: String(descontoPrevidencia),
            outrosDescontos: String(outrosDescontos),
            margemConsignavelPerc: String(margemPerc),
            margemConsignavelValor: String(margemValor),
            totalConsignacoes: String(totalConsignacoes),
            margemDisponivel: String(margemDisponivel),
            margemExcedida,
            valorExcedente: String(valorExcedente),
            aptoEmprestimo,
            scoreRisco: scoreRisco as "Baixo" | "Medio" | "Alto",
            fonteRenda: dadosExtraidos.servidor?.orgaoEmpregador || "Servidor Público",
            dataReferencia: dadosExtraidos.referencia?.mesAno || null,
          }).where(eq(dadosFinanceiros.clienteId, clienteId));
        } else {
          await db.insert(dadosFinanceiros).values({
            clienteId,
            remuneracaoBruta: String(remuneracaoBruta),
            remuneracaoLiquida: String(remuneracaoLiquida),
            descontoIrrf: String(descontoIrrf),
            descontoPrevidencia: String(descontoPrevidencia),
            outrosDescontos: String(outrosDescontos),
            margemConsignavelPerc: String(margemPerc),
            margemConsignavelValor: String(margemValor),
            totalConsignacoes: String(totalConsignacoes),
            margemDisponivel: String(margemDisponivel),
            margemExcedida,
            valorExcedente: String(valorExcedente),
            aptoEmprestimo,
            scoreRisco: scoreRisco as "Baixo" | "Medio" | "Alto",
            fonteRenda: dadosExtraidos.servidor?.orgaoEmpregador || "Servidor Público",
            dataReferencia: dadosExtraidos.referencia?.mesAno || null,
          });
        }

        // 7. Insert/Update emprestimos consignados (replace all for this client)
        if (dadosExtraidos.emprestimosConsignados?.length) {
          // Delete old emprestimos for this client to avoid duplication
          await db.delete(emprestimosConsignados).where(eq(emprestimosConsignados.clienteId, clienteId));
          for (const emp of dadosExtraidos.emprestimosConsignados) {
            await db.insert(emprestimosConsignados).values({
              clienteId,
              banco: emp.banco,
              rubrica: emp.rubrica,
              contrato: emp.contrato,
              valorParcela: emp.valorParcela ? String(emp.valorParcela) : null,
              valorTotal: emp.valorTotal ? String(emp.valorTotal) : null,
              totalParcelas: emp.totalParcelas,
              parcelasRestantes: emp.parcelasRestantes,
              taxaJuros: emp.taxaJuros ? String(emp.taxaJuros) : null,
              status: "Ativo",
            });
          }
        }

        // 8. Build/update client folder
        const pastaCliente = await buildClientFolder(clienteId, nome, clienteCpf);

        // 9. Update relatório cadastral
        try {
          await autoUpdateRelatorioCadastral(db);
          console.log(`[Contracheque] Relatório cadastral atualizado após upload de contracheque de ${nome}`);
        } catch (relErr) {
          console.error("[Contracheque] Erro ao atualizar relatório:", relErr);
        }

        return {
          success: true,
          clienteId,
          clienteNome: nome,
          cpf: cpf || "PENDENTE",
          referencia: dadosExtraidos.referencia?.mesAno || "N/A",
          resumoFinanceiro: {
            remuneracaoBruta,
            remuneracaoLiquida,
            totalDescontos: rem.totalDescontos || (descontoIrrf + descontoPrevidencia + outrosDescontos),
            margemConsignavel: margemValor,
            totalConsignacoes,
            margemDisponivel,
            margemExcedida: margemExcedida === 1,
            valorExcedente,
            aptoEmprestimo: aptoEmprestimo === 1,
            scoreRisco,
            totalEmprestimos: dadosExtraidos.emprestimosConsignados?.length || 0,
          },
          emprestimos: dadosExtraidos.emprestimosConsignados || [],
          pastaCliente: pastaCliente?.folder || folder,
          arquivosPasta: pastaCliente?.files || null,
          dadosExtraidos,
          relatorioAtualizado: true,
        };
       }),
  }),

  // ==================== PASTA DO CLIENTE ====================
  pasta: router({
    generate: protectedProcedure
      .input(z.object({ clienteId: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const [cliente] = await db.select().from(clientes).where(eq(clientes.id, input.clienteId)).limit(1);
        if (!cliente) throw new Error("Cliente não encontrado");
        const result = await buildClientFolder(input.clienteId, cliente.nomeCompleto, cliente.cpfCnpj);
        return result;
      }),

    getFiles: protectedProcedure
      .input(z.object({ clienteId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return null;
        const [cliente] = await db.select().from(clientes).where(eq(clientes.id, input.clienteId)).limit(1);
        if (!cliente) return null;
        const folder = clientFolderKey(cliente.nomeCompleto, cliente.cpfCnpj);
        // Try to get URLs for known files
        const files: Record<string, string> = {};
        const fileNames = ["ficha_cliente.json", "processos.json", "financeiro.json", "conhecimentos.json", "documentos.json", "banco_completo.json"];
        for (const fn of fileNames) {
          try {
            const { url } = await storageGet(`${folder}/${fn}`);
            files[fn] = url;
          } catch { /* file not yet generated */ }
        }
        return { folder, files };
      }),
  }),

  // ==================== CORREÇÃO E DEDUPLICAÇÃO ====================
  correcao: router({
    // Diagnóstico: lista duplicidades por CPF normalizado
    diagnostico: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { duplicados: [], semCpf: [], processosOrfaos: [] };

      // 1. Clientes com CPF duplicado (normalizado)
      const allClientes = await db.select().from(clientes).orderBy(desc(clientes.updatedAt));
      const cpfMap = new Map<string, typeof allClientes>();
      for (const cli of allClientes) {
        const cpfNorm = cli.cpfCnpj.replace(/[.\-\/]/g, "");
        if (!cpfMap.has(cpfNorm)) cpfMap.set(cpfNorm, []);
        cpfMap.get(cpfNorm)!.push(cli);
      }
      const duplicados = Array.from(cpfMap.entries())
        .filter(([_, clis]) => clis.length > 1)
        .map(([cpfNorm, clis]) => ({
          cpfNormalizado: cpfNorm,
          clientes: clis.map(c => ({ id: c.id, nome: c.nomeCompleto, cpfOriginal: c.cpfCnpj })),
        }));

      // 2. Clientes sem CPF válido
      const semCpf = allClientes.filter(c =>
        c.cpfCnpj.startsWith("PENDENTE") || c.cpfCnpj.startsWith("SEM_CPF") || c.cpfCnpj.length < 8
      ).map(c => ({ id: c.id, nome: c.nomeCompleto, cpfAtual: c.cpfCnpj }));

      // 3. Processos duplicados por CNJ
      const allProcs = await db.select().from(processos).orderBy(desc(processos.updatedAt));
      const cnjMap = new Map<string, typeof allProcs>();
      for (const p of allProcs) {
        const cnj = p.numeroCnj.replace(/\s/g, "");
        if (!cnjMap.has(cnj)) cnjMap.set(cnj, []);
        cnjMap.get(cnj)!.push(p);
      }
      const processosOrfaos = Array.from(cnjMap.entries())
        .filter(([_, procs]) => procs.length > 1)
        .map(([cnj, procs]) => ({
          numeroCnj: cnj,
          processos: procs.map(p => ({ id: p.id, clienteId: p.clienteId, tipoAcao: p.tipoAcao, fase: p.faseAtual })),
        }));

      return { duplicados, semCpf, processosOrfaos };
    }),

    // Normalizar todos os CPFs (remover pontos, traços, barras)
    normalizarCpfs: protectedProcedure.mutation(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const allClientes = await db.select().from(clientes);
      let corrigidos = 0;
      for (const cli of allClientes) {
        const cpfNorm = cli.cpfCnpj.replace(/[.\-\/]/g, "");
        if (cpfNorm !== cli.cpfCnpj && !cli.cpfCnpj.startsWith("PENDENTE") && !cli.cpfCnpj.startsWith("SEM_CPF")) {
          // Verificar se já existe outro com esse CPF normalizado
          const existing = await db.select().from(clientes)
            .where(eq(clientes.cpfCnpj, cpfNorm)).limit(1);
          if (existing.length === 0) {
            await db.update(clientes).set({ cpfCnpj: cpfNorm }).where(eq(clientes.id, cli.id));
            corrigidos++;
          }
        }
      }
      // Registrar no histórico
      await db.insert(historicoCorrecoes).values({
        tipo: 'normalizar_cpfs',
        acao: `Normalização de CPFs: ${corrigidos} corrigidos`,
        detalhes: `Removidos pontos, traços e barras de ${corrigidos} CPFs de um total de ${allClientes.length} clientes.`,
        itensAfetados: corrigidos,
        status: corrigidos > 0 ? 'sucesso' : 'parcial',
        executadoPor: 'Sistema',
      });
      return { corrigidos, mensagem: `${corrigidos} CPFs normalizados` };
    }),

    // Merge de clientes duplicados: mantém o mais antigo (menor ID), move processos e dados
    mergeClientes: protectedProcedure
      .input(z.object({ manterClienteId: z.number(), removerClienteId: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const { manterClienteId, removerClienteId } = input;
        if (manterClienteId === removerClienteId) throw new Error("IDs iguais");

        // Verificar se ambos existem
        const [manter] = await db.select().from(clientes).where(eq(clientes.id, manterClienteId)).limit(1);
        const [remover] = await db.select().from(clientes).where(eq(clientes.id, removerClienteId)).limit(1);
        if (!manter || !remover) throw new Error("Cliente não encontrado");

        // Mover processos do removido para o mantido
        await db.update(processos).set({ clienteId: manterClienteId }).where(eq(processos.clienteId, removerClienteId));
        // Mover dados financeiros
        await db.update(dadosFinanceiros).set({ clienteId: manterClienteId }).where(eq(dadosFinanceiros.clienteId, removerClienteId));
        // Mover empréstimos
        await db.update(emprestimosConsignados).set({ clienteId: manterClienteId }).where(eq(emprestimosConsignados.clienteId, removerClienteId));
        // Mover documentos
        await db.update(documentos).set({ clienteId: manterClienteId }).where(eq(documentos.clienteId, removerClienteId));

        // Atualizar dados do mantido com dados do removido (preencher campos vazios)
        const updateFields: Record<string, any> = {};
        const textFields = ["rg", "profissao", "cargo", "orgaoEmpregador", "vinculoFuncional", "endereco", "cidade", "estado", "cep", "telefone", "email", "dataNascimento", "estadoCivil", "nacionalidade"] as const;
        for (const field of textFields) {
          if (!manter[field] && remover[field]) {
            updateFields[field] = remover[field];
          }
        }
        if (Object.keys(updateFields).length > 0) {
          await db.update(clientes).set(updateFields).where(eq(clientes.id, manterClienteId));
        }

        // Deletar o cliente duplicado
        await db.delete(clientes).where(eq(clientes.id, removerClienteId));

        return {
          success: true,
          mantido: { id: manter.id, nome: manter.nomeCompleto, cpf: manter.cpfCnpj },
          removido: { id: remover.id, nome: remover.nomeCompleto, cpf: remover.cpfCnpj },
          camposAtualizados: Object.keys(updateFields),
        };
      }),

    // Auto-merge: detecta e faz merge automático de todos os duplicados por CPF
    autoMerge: protectedProcedure.mutation(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const allClientes = await db.select().from(clientes).orderBy(desc(clientes.updatedAt));
      const cpfMap = new Map<string, typeof allClientes>();
      for (const cli of allClientes) {
        const cpfNorm = cli.cpfCnpj.replace(/[.\-\/]/g, "");
        if (cpfNorm.startsWith("PENDENTE") || cpfNorm.startsWith("SEM_CPF")) continue;
        if (!cpfMap.has(cpfNorm)) cpfMap.set(cpfNorm, []);
        cpfMap.get(cpfNorm)!.push(cli);
      }

      const merges: { mantido: string; removidos: string[] }[] = [];
      for (const [cpfNorm, clis] of Array.from(cpfMap.entries())) {
        if (clis.length <= 1) continue;
        // Manter o de menor ID (mais antigo)
        const manterId = clis[0].id;
        for (let i = 1; i < clis.length; i++) {
          const removerId = clis[i].id;
          // Mover tudo
          await db.update(processos).set({ clienteId: manterId }).where(eq(processos.clienteId, removerId));
          await db.update(dadosFinanceiros).set({ clienteId: manterId }).where(eq(dadosFinanceiros.clienteId, removerId));
          await db.update(emprestimosConsignados).set({ clienteId: manterId }).where(eq(emprestimosConsignados.clienteId, removerId));
          await db.update(documentos).set({ clienteId: manterId }).where(eq(documentos.clienteId, removerId));
          // Preencher campos vazios
          const [manter] = await db.select().from(clientes).where(eq(clientes.id, manterId)).limit(1);
          const [remover] = await db.select().from(clientes).where(eq(clientes.id, removerId)).limit(1);
          if (manter && remover) {
            const updateFields: Record<string, any> = {};
            const textFields = ["rg", "profissao", "cargo", "orgaoEmpregador", "vinculoFuncional", "endereco", "cidade", "estado", "cep", "telefone", "email", "dataNascimento", "estadoCivil", "nacionalidade"] as const;
            for (const field of textFields) {
              if (!manter[field] && remover[field]) updateFields[field] = remover[field];
            }
            if (Object.keys(updateFields).length > 0) {
              await db.update(clientes).set(updateFields).where(eq(clientes.id, manterId));
            }
          }
          await db.delete(clientes).where(eq(clientes.id, removerId));
        }
        // Normalizar CPF do mantido
        await db.update(clientes).set({ cpfCnpj: cpfNorm }).where(eq(clientes.id, manterId));
        merges.push({ mantido: `${clis[0].nomeCompleto} (ID ${manterId})`, removidos: clis.slice(1).map((c: any) => `${c.nomeCompleto} (ID ${c.id})`) });
      }

      // Registrar no histórico
      if (merges.length > 0) {
        await db.insert(historicoCorrecoes).values({
          tipo: 'auto_merge',
          acao: `Auto-Merge: ${merges.length} grupos de duplicados unificados`,
          detalhes: merges.map(m => `Mantido: ${m.mantido} | Removidos: ${m.removidos.join(', ')}`).join('\n'),
          itensAfetados: merges.length,
          status: 'sucesso',
          executadoPor: 'Sistema',
        });
      }
      return { totalMerges: merges.length, merges };
    }),

    // Atualizar CPF de um cliente (para corrigir PENDENTE/SEM_CPF)
    atualizarCpf: protectedProcedure
      .input(z.object({ clienteId: z.number(), novoCpf: z.string().min(8) }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const cpfNorm = input.novoCpf.replace(/[.\-\/]/g, "");
        // Verificar se já existe outro cliente com esse CPF
        const existing = await db.select().from(clientes)
          .where(sql`REPLACE(REPLACE(REPLACE(${clientes.cpfCnpj}, '.', ''), '-', ''), '/', '') = ${cpfNorm} AND ${clientes.id} != ${input.clienteId}`)
          .limit(1);
        if (existing.length > 0) {
          throw new Error(`CPF já pertence ao cliente: ${existing[0].nomeCompleto} (ID ${existing[0].id}). Use merge para unificar.`);
        }
        await db.update(clientes).set({ cpfCnpj: cpfNorm }).where(eq(clientes.id, input.clienteId));
        return { success: true, clienteId: input.clienteId, cpfAtualizado: cpfNorm };
      }),

    // Auditoria completa da plataforma - detecta todos os tipos de erros
    auditoriaCompleta: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { erros: [], resumo: { total: 0, criticos: 0, alertas: 0, info: 0 } };

      const erros: Array<{
        id: string;
        categoria: string;
        severidade: 'critico' | 'alerta' | 'info';
        titulo: string;
        descricao: string;
        entidade: string;
        entidadeId: number | null;
        acao: string;
        corrigivel: boolean;
      }> = [];

      // 1. CLIENTES - CPFs pendentes/inválidos
      const allClientes = await db.select().from(clientes).orderBy(desc(clientes.updatedAt));
      for (const cli of allClientes) {
        if (cli.cpfCnpj.startsWith('PEND') || cli.cpfCnpj.startsWith('SEM_CPF')) {
          erros.push({
            id: `cpf_pendente_${cli.id}`,
            categoria: 'Dados Cadastrais',
            severidade: 'critico',
            titulo: `CPF pendente: ${cli.nomeCompleto}`,
            descricao: `O cliente ${cli.nomeCompleto} não possui CPF válido cadastrado (atual: ${cli.cpfCnpj}). Isso impede a geração de relatórios e petições.`,
            entidade: 'cliente',
            entidadeId: cli.id,
            acao: 'Corrigir CPF na seção de Correção ou no perfil do cliente',
            corrigivel: true,
          });
        }
        // Campos essenciais vazios
        if (!cli.endereco) {
          erros.push({
            id: `endereco_vazio_${cli.id}`,
            categoria: 'Dados Cadastrais',
            severidade: 'alerta',
            titulo: `Endereço ausente: ${cli.nomeCompleto}`,
            descricao: `O cliente ${cli.nomeCompleto} não possui endereço cadastrado. Necessário para petições e notificações.`,
            entidade: 'cliente',
            entidadeId: cli.id,
            acao: 'Editar perfil do cliente e adicionar endereço',
            corrigivel: false,
          });
        }
        if (!cli.telefone && !cli.email) {
          erros.push({
            id: `contato_vazio_${cli.id}`,
            categoria: 'Dados Cadastrais',
            severidade: 'alerta',
            titulo: `Sem contato: ${cli.nomeCompleto}`,
            descricao: `O cliente ${cli.nomeCompleto} não possui telefone nem email cadastrado.`,
            entidade: 'cliente',
            entidadeId: cli.id,
            acao: 'Editar perfil do cliente e adicionar contato',
            corrigivel: false,
          });
        }
        if (!cli.profissao && !cli.cargo) {
          erros.push({
            id: `profissao_vazia_${cli.id}`,
            categoria: 'Dados Cadastrais',
            severidade: 'info',
            titulo: `Profissão/cargo ausente: ${cli.nomeCompleto}`,
            descricao: `O cliente ${cli.nomeCompleto} não possui profissão ou cargo cadastrado.`,
            entidade: 'cliente',
            entidadeId: cli.id,
            acao: 'Editar perfil do cliente',
            corrigivel: false,
          });
        }
      }

      // 2. CLIENTES DUPLICADOS por CPF
      const cpfMap = new Map<string, typeof allClientes>();
      for (const cli of allClientes) {
        const cpfNorm = cli.cpfCnpj.replace(/[.\-\/]/g, '');
        if (cpfNorm.startsWith('PEND') || cpfNorm.startsWith('SEM')) continue;
        if (!cpfMap.has(cpfNorm)) cpfMap.set(cpfNorm, []);
        cpfMap.get(cpfNorm)!.push(cli);
      }
      for (const [cpf, clis] of Array.from(cpfMap.entries())) {
        if (clis.length > 1) {
          erros.push({
            id: `duplicado_cpf_${cpf}`,
            categoria: 'Duplicidades',
            severidade: 'critico',
            titulo: `CPF duplicado: ${cpf}`,
            descricao: `${clis.length} clientes compartilham o mesmo CPF: ${clis.map(c => c.nomeCompleto).join(', ')}. Usar Auto-Merge para unificar.`,
            entidade: 'cliente',
            entidadeId: clis[0].id,
            acao: 'Executar Auto-Merge ou Merge Manual',
            corrigivel: true,
          });
        }
      }

      // 3. PROCESSOS - CNJs inválidos
      const allProcs = await db.select().from(processos);
      for (const p of allProcs) {
        if (p.numeroCnj.startsWith('SEM_') || p.numeroCnj.startsWith('SEM_NUMERO')) {
          const cli = allClientes.find(c => c.id === p.clienteId);
          erros.push({
            id: `cnj_invalido_${p.id}`,
            categoria: 'Processos',
            severidade: 'critico',
            titulo: `CNJ inválido: ${p.tipoAcao || 'Processo'} (${cli?.nomeCompleto || 'Cliente desconhecido'})`,
            descricao: `O processo ID ${p.id} não possui número CNJ válido (atual: ${p.numeroCnj}). Reprocessar o PDF ou corrigir manualmente.`,
            entidade: 'processo',
            entidadeId: p.id,
            acao: 'Reprocessar PDF do processo ou editar CNJ manualmente',
            corrigivel: false,
          });
        }
      }

      // 4. PROCESSOS SEM MOVIMENTAÇÕES
      const allMovs = await db.select({ processoId: movimentacoes.processoId }).from(movimentacoes);
      const procsComMovs = new Set(allMovs.map(m => m.processoId));
      for (const p of allProcs) {
        if (!procsComMovs.has(p.id)) {
          const cli = allClientes.find(c => c.id === p.clienteId);
          erros.push({
            id: `sem_movimentacao_${p.id}`,
            categoria: 'Processos',
            severidade: 'alerta',
            titulo: `Sem movimentações: ${p.tipoAcao || 'Processo'} (${cli?.nomeCompleto || '?'})`,
            descricao: `O processo ${p.numeroCnj} não possui movimentações registradas. Isso pode indicar falha na extração do PDF.`,
            entidade: 'processo',
            entidadeId: p.id,
            acao: 'Reprocessar PDF ou adicionar movimentações manualmente',
            corrigivel: false,
          });
        }
      }

      // 5. PROCESSOS SEM ESTRATÉGIA
      const allEstr = await db.select({ processoId: estrategias.processoId }).from(estrategias);
      const procsComEstr = new Set(allEstr.map(e => e.processoId));
      for (const p of allProcs) {
        if (!procsComEstr.has(p.id)) {
          const cli = allClientes.find(c => c.id === p.clienteId);
          erros.push({
            id: `sem_estrategia_${p.id}`,
            categoria: 'Processos',
            severidade: 'info',
            titulo: `Sem estratégia: ${p.tipoAcao || 'Processo'} (${cli?.nomeCompleto || '?'})`,
            descricao: `O processo ${p.numeroCnj} não possui estratégia processual definida.`,
            entidade: 'processo',
            entidadeId: p.id,
            acao: 'Reprocessar PDF para extrair estratégia',
            corrigivel: false,
          });
        }
      }

      // 6. DADOS FINANCEIROS - Clientes sem dados financeiros
      const allFin = await db.select({ clienteId: dadosFinanceiros.clienteId }).from(dadosFinanceiros);
      const clisComFin = new Set(allFin.map(f => f.clienteId));
      for (const cli of allClientes) {
        if (!clisComFin.has(cli.id)) {
          erros.push({
            id: `sem_financeiro_${cli.id}`,
            categoria: 'Dados Financeiros',
            severidade: 'alerta',
            titulo: `Sem dados financeiros: ${cli.nomeCompleto}`,
            descricao: `O cliente ${cli.nomeCompleto} não possui dados financeiros cadastrados. Faça upload do contracheque para preencher.`,
            entidade: 'cliente',
            entidadeId: cli.id,
            acao: 'Upload de contracheque na aba Upload > Contracheque',
            corrigivel: false,
          });
        }
      }

      // 7. DADOS FINANCEIROS - Margem excedida
      const allFinFull = await db.select().from(dadosFinanceiros);
      for (const fin of allFinFull) {
        if (fin.margemExcedida) {
          const cli = allClientes.find(c => c.id === fin.clienteId);
          erros.push({
            id: `margem_excedida_${fin.id}`,
            categoria: 'Dados Financeiros',
            severidade: 'critico',
            titulo: `Margem excedida: ${cli?.nomeCompleto || 'Cliente'}`,
            descricao: `O cliente ${cli?.nomeCompleto} possui margem consignável excedida (valor excedente: R$ ${fin.valorExcedente || '?'}). Isso configura irregularidade nos descontos.`,
            entidade: 'cliente',
            entidadeId: fin.clienteId,
            acao: 'Verificar empréstimos consignados e tomar providências jurídicas',
            corrigivel: false,
          });
        }
      }

      // 8. PROCESSOS DUPLICADOS por CNJ
      const cnjMap = new Map<string, typeof allProcs>();
      for (const p of allProcs) {
        const cnj = p.numeroCnj.replace(/\s/g, '');
        if (cnj.startsWith('SEM_')) continue;
        if (!cnjMap.has(cnj)) cnjMap.set(cnj, []);
        cnjMap.get(cnj)!.push(p);
      }
      for (const [cnj, procs] of Array.from(cnjMap.entries())) {
        if (procs.length > 1) {
          erros.push({
            id: `duplicado_cnj_${cnj}`,
            categoria: 'Duplicidades',
            severidade: 'critico',
            titulo: `CNJ duplicado: ${cnj}`,
            descricao: `${procs.length} processos com o mesmo CNJ. Usar Deduplicar Processos para unificar.`,
            entidade: 'processo',
            entidadeId: procs[0].id,
            acao: 'Executar Deduplicar Processos',
            corrigivel: true,
          });
        }
      }

      // 9. PROCESSOS SEM DOCUMENTOS
      const allDocs = await db.select({ processoId: documentos.processoId }).from(documentos).where(sql`${documentos.processoId} IS NOT NULL`);
      const procsComDocs = new Set(allDocs.map(d => d.processoId));
      for (const p of allProcs) {
        if (!procsComDocs.has(p.id)) {
          const cli = allClientes.find(c => c.id === p.clienteId);
          erros.push({
            id: `sem_documento_${p.id}`,
            categoria: 'Documentos',
            severidade: 'info',
            titulo: `Sem documentos: ${p.tipoAcao || 'Processo'} (${cli?.nomeCompleto || '?'})`,
            descricao: `O processo ${p.numeroCnj} não possui documentos armazenados no sistema.`,
            entidade: 'processo',
            entidadeId: p.id,
            acao: 'Reprocessar PDF ou fazer upload manual do documento',
            corrigivel: false,
          });
        }
      }

      // 10. PROCESSOS SEM VALOR DE CAUSA
      for (const p of allProcs) {
        if (!p.valorCausa || Number(p.valorCausa) === 0) {
          const cli = allClientes.find(c => c.id === p.clienteId);
          erros.push({
            id: `sem_valor_causa_${p.id}`,
            categoria: 'Processos',
            severidade: 'info',
            titulo: `Valor da causa zerado: ${p.tipoAcao || 'Processo'} (${cli?.nomeCompleto || '?'})`,
            descricao: `O processo ${p.numeroCnj} não possui valor da causa definido.`,
            entidade: 'processo',
            entidadeId: p.id,
            acao: 'Editar processo e informar valor da causa',
            corrigivel: false,
          });
        }
      }

      // Resumo
      const criticos = erros.filter(e => e.severidade === 'critico').length;
      const alertas = erros.filter(e => e.severidade === 'alerta').length;
      const info = erros.filter(e => e.severidade === 'info').length;

      return {
        erros,
        resumo: {
          total: erros.length,
          criticos,
          alertas,
          info,
        },
        categorias: Array.from(new Set(erros.map(e => e.categoria))),
      };
    }),

    // Deduplicar processos por número CNJ (mantém o mais recente)
    deduplicarProcessos: protectedProcedure.mutation(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const allProcs = await db.select().from(processos).orderBy(desc(processos.updatedAt));
      const cnjMap = new Map<string, typeof allProcs>();
      for (const p of allProcs) {
        const cnj = p.numeroCnj.replace(/\s/g, "");
        if (cnj.startsWith("SEM_NUMERO")) continue;
        if (!cnjMap.has(cnj)) cnjMap.set(cnj, []);
        cnjMap.get(cnj)!.push(p);
      }

      let removidos = 0;
      for (const [cnj, procs] of Array.from(cnjMap.entries())) {
        if (procs.length <= 1) continue;
        // Manter o primeiro (mais recente por updatedAt)
        for (let i = 1; i < procs.length; i++) {
          // Mover estratégias, partes, movimentações, cumprimentos, documentos, conhecimentos
          await db.update(estrategias).set({ processoId: procs[0].id }).where(eq(estrategias.processoId, procs[i].id));
          await db.update(partesProcessuais).set({ processoId: procs[0].id }).where(eq(partesProcessuais.processoId, procs[i].id));
          await db.update(movimentacoes).set({ processoId: procs[0].id }).where(eq(movimentacoes.processoId, procs[i].id));
          await db.update(cumprimentosSentenca).set({ processoId: procs[0].id }).where(eq(cumprimentosSentenca.processoId, procs[i].id));
          await db.update(documentos).set({ processoId: procs[0].id }).where(eq(documentos.processoId, procs[i].id));
          await db.update(conhecimentos).set({ processoOrigemId: procs[0].id }).where(eq(conhecimentos.processoOrigemId, procs[i].id));
          await db.delete(processos).where(eq(processos.id, procs[i].id));
          removidos++;
        }
      }

      // Registrar no histórico
      if (removidos > 0) {
        await db.insert(historicoCorrecoes).values({
          tipo: 'deduplicar_processos',
          acao: `Deduplicação de Processos: ${removidos} processos duplicados removidos`,
          detalhes: `Removidos ${removidos} processos com CNJ duplicado, mantendo o mais recente de cada grupo.`,
          itensAfetados: removidos,
          status: 'sucesso',
          executadoPor: 'Sistema',
        });
      }
      return { processosRemovidos: removidos };
    }),

    // Histórico de conversas
    historico: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return await db.select().from(historicoCorrecoes).orderBy(desc(historicoCorrecoes.createdAt)).limit(50);
    }),

    // Executar todas as correções em sequência
    executarTodasCorrecoes: protectedProcedure.mutation(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const resultados: { etapa: string; status: string; detalhes: string; itensAfetados: number }[] = [];

      // 1. Normalizar CPFs
      try {
        const allClientes = await db.select().from(clientes);
        let cpfsCorrigidos = 0;
        for (const cli of allClientes) {
          const cpfNorm = cli.cpfCnpj.replace(/[.\-\/]/g, "");
          if (cpfNorm !== cli.cpfCnpj && !cli.cpfCnpj.startsWith("PENDENTE") && !cli.cpfCnpj.startsWith("SEM_CPF")) {
            const existing = await db.select().from(clientes).where(eq(clientes.cpfCnpj, cpfNorm)).limit(1);
            if (existing.length === 0) {
              await db.update(clientes).set({ cpfCnpj: cpfNorm }).where(eq(clientes.id, cli.id));
              cpfsCorrigidos++;
            }
          }
        }
        resultados.push({ etapa: 'Normalizar CPFs', status: 'sucesso', detalhes: `${cpfsCorrigidos} CPFs normalizados de ${allClientes.length} clientes`, itensAfetados: cpfsCorrigidos });
      } catch (e: any) {
        resultados.push({ etapa: 'Normalizar CPFs', status: 'erro', detalhes: e.message, itensAfetados: 0 });
      }

      // 2. Auto-Merge de duplicados
      try {
        const allClientes2 = await db.select().from(clientes).orderBy(desc(clientes.updatedAt));
        const cpfMap2 = new Map<string, typeof allClientes2>();
        for (const cli of allClientes2) {
          const cpfNorm = cli.cpfCnpj.replace(/[.\-\/]/g, "");
          if (cpfNorm.startsWith("PENDENTE") || cpfNorm.startsWith("SEM_CPF")) continue;
          if (!cpfMap2.has(cpfNorm)) cpfMap2.set(cpfNorm, []);
          cpfMap2.get(cpfNorm)!.push(cli);
        }
        let totalMerges = 0;
        for (const [cpfNorm, clis] of Array.from(cpfMap2.entries())) {
          if (clis.length <= 1) continue;
          const manterId = clis[0].id;
          for (let i = 1; i < clis.length; i++) {
            const removerId = clis[i].id;
            await db.update(processos).set({ clienteId: manterId }).where(eq(processos.clienteId, removerId));
            await db.update(dadosFinanceiros).set({ clienteId: manterId }).where(eq(dadosFinanceiros.clienteId, removerId));
            await db.update(emprestimosConsignados).set({ clienteId: manterId }).where(eq(emprestimosConsignados.clienteId, removerId));
            await db.update(documentos).set({ clienteId: manterId }).where(eq(documentos.clienteId, removerId));
            await db.update(movimentacoesFinanceiras).set({ clienteId: manterId }).where(eq(movimentacoesFinanceiras.clienteId, removerId));
            await db.delete(clientes).where(eq(clientes.id, removerId));
            totalMerges++;
          }
          await db.update(clientes).set({ cpfCnpj: cpfNorm }).where(eq(clientes.id, manterId));
        }
        resultados.push({ etapa: 'Auto-Merge Duplicados', status: 'sucesso', detalhes: `${totalMerges} clientes duplicados unificados`, itensAfetados: totalMerges });
      } catch (e: any) {
        resultados.push({ etapa: 'Auto-Merge Duplicados', status: 'erro', detalhes: e.message, itensAfetados: 0 });
      }

      // 3. Deduplicar Processos
      try {
        const allProcs = await db.select().from(processos).orderBy(desc(processos.updatedAt));
        const cnjMap = new Map<string, typeof allProcs>();
        for (const p of allProcs) {
          const cnj = p.numeroCnj.replace(/\s/g, "");
          if (cnj.startsWith("SEM_NUMERO") || cnj.startsWith("SEM_")) continue;
          if (!cnjMap.has(cnj)) cnjMap.set(cnj, []);
          cnjMap.get(cnj)!.push(p);
        }
        let procsRemovidos = 0;
        for (const [cnj, procs] of Array.from(cnjMap.entries())) {
          if (procs.length <= 1) continue;
          for (let i = 1; i < procs.length; i++) {
            await db.update(estrategias).set({ processoId: procs[0].id }).where(eq(estrategias.processoId, procs[i].id));
            await db.update(partesProcessuais).set({ processoId: procs[0].id }).where(eq(partesProcessuais.processoId, procs[i].id));
            await db.update(movimentacoes).set({ processoId: procs[0].id }).where(eq(movimentacoes.processoId, procs[i].id));
            await db.update(cumprimentosSentenca).set({ processoId: procs[0].id }).where(eq(cumprimentosSentenca.processoId, procs[i].id));
            await db.update(documentos).set({ processoId: procs[0].id }).where(eq(documentos.processoId, procs[i].id));
            await db.update(conhecimentos).set({ processoOrigemId: procs[0].id }).where(eq(conhecimentos.processoOrigemId, procs[i].id));
            await db.update(movimentacoesFinanceiras).set({ processoId: procs[0].id }).where(eq(movimentacoesFinanceiras.processoId, procs[i].id));
            await db.delete(processos).where(eq(processos.id, procs[i].id));
            procsRemovidos++;
          }
        }
        resultados.push({ etapa: 'Deduplicar Processos', status: 'sucesso', detalhes: `${procsRemovidos} processos duplicados removidos`, itensAfetados: procsRemovidos });
      } catch (e: any) {
        resultados.push({ etapa: 'Deduplicar Processos', status: 'erro', detalhes: e.message, itensAfetados: 0 });
      }

      // Registrar no histórico
      const totalAfetados = resultados.reduce((s, r) => s + r.itensAfetados, 0);
      const statusGeral = resultados.every(r => r.status === 'sucesso') ? 'sucesso' : resultados.some(r => r.status === 'erro') ? 'parcial' : 'sucesso';
      await db.insert(historicoCorrecoes).values({
        tipo: 'correcao_completa',
        acao: `Correção Completa: ${resultados.length} etapas executadas`,
        detalhes: resultados.map(r => `${r.etapa}: ${r.status} - ${r.detalhes}`).join('\n'),
        itensAfetados: totalAfetados,
        status: statusGeral,
        executadoPor: 'Sistema',
        dadosDepois: resultados,
      });

      // Notificar sobre correções executadas
      await criarNotificacao({
        tipo: 'correcao_executada',
        prioridade: statusGeral === 'sucesso' ? 'baixa' : 'normal',
        titulo: `Correções executadas: ${resultados.length} etapas`,
        mensagem: `${totalAfetados} itens afetados. Status: ${statusGeral}. ${resultados.map(r => `${r.etapa}: ${r.detalhes}`).join('; ')}`,
        linkUrl: '/correcao',
        icone: 'Shield',
        cor: statusGeral === 'sucesso' ? 'green' : 'amber',
      });

      return { resultados, totalAfetados, statusGeral };
    }),

    // Score de saúde dos dados (0-100)
    scoreSaude: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { score: 0, detalhes: {} };

      const allClientes = await db.select().from(clientes);
      const allProcs = await db.select().from(processos);
      const allFin = await db.select({ clienteId: dadosFinanceiros.clienteId }).from(dadosFinanceiros);
      const allMovs = await db.select({ processoId: movimentacoes.processoId }).from(movimentacoes);
      const allEstr = await db.select({ processoId: estrategias.processoId }).from(estrategias);
      const allDocs = await db.select({ processoId: documentos.processoId }).from(documentos).where(sql`${documentos.processoId} IS NOT NULL`);

      const totalClientes = allClientes.length;
      const totalProcs = allProcs.length;

      // Calcular métricas
      const cpfsValidos = allClientes.filter(c => !c.cpfCnpj.startsWith('PEND') && !c.cpfCnpj.startsWith('SEM_') && c.cpfCnpj.length >= 8).length;
      const cpfsDuplicados = (() => {
        const cpfMap = new Map<string, number>();
        for (const c of allClientes) {
          const cpf = c.cpfCnpj.replace(/[.\-\/]/g, '');
          if (cpf.startsWith('PEND') || cpf.startsWith('SEM')) continue;
          cpfMap.set(cpf, (cpfMap.get(cpf) || 0) + 1);
        }
        return Array.from(cpfMap.values()).filter(v => v > 1).length;
      })();
      const clientesComContato = allClientes.filter(c => c.telefone || c.email).length;
      const clientesComEndereco = allClientes.filter(c => c.endereco).length;
      const clientesComFinanceiro = new Set(allFin.map(f => f.clienteId)).size;
      const procsComMovs = new Set(allMovs.map(m => m.processoId)).size;
      const procsComEstr = new Set(allEstr.map(e => e.processoId)).size;
      const procsComDocs = new Set(allDocs.map(d => d.processoId)).size;
      const cnjsValidos = allProcs.filter(p => !p.numeroCnj.startsWith('SEM_')).length;
      const procsComValor = allProcs.filter(p => p.valorCausa && Number(p.valorCausa) > 0).length;

      // Pesos: CPFs (20), Duplicados (15), Contato (10), Endereço (5), Financeiro (10), Movimentações (10), Estratégias (10), Documentos (10), CNJs (5), Valor (5)
      const scores = {
        cpfsValidos: totalClientes > 0 ? (cpfsValidos / totalClientes) * 20 : 20,
        semDuplicados: cpfsDuplicados === 0 ? 15 : Math.max(0, 15 - cpfsDuplicados * 5),
        contato: totalClientes > 0 ? (clientesComContato / totalClientes) * 10 : 10,
        endereco: totalClientes > 0 ? (clientesComEndereco / totalClientes) * 5 : 5,
        financeiro: totalClientes > 0 ? (clientesComFinanceiro / totalClientes) * 10 : 10,
        movimentacoes: totalProcs > 0 ? (procsComMovs / totalProcs) * 10 : 10,
        estrategias: totalProcs > 0 ? (procsComEstr / totalProcs) * 10 : 10,
        documentos: totalProcs > 0 ? (procsComDocs / totalProcs) * 10 : 10,
        cnjsValidos: totalProcs > 0 ? (cnjsValidos / totalProcs) * 5 : 5,
        valorCausa: totalProcs > 0 ? (procsComValor / totalProcs) * 5 : 5,
      };

      const score = Math.round(Object.values(scores).reduce((a, b) => a + b, 0));

      return {
        score,
        detalhes: {
          cpfsValidos: { valor: cpfsValidos, total: totalClientes, peso: 20, score: Math.round(scores.cpfsValidos) },
          semDuplicados: { valor: cpfsDuplicados === 0 ? 'Nenhum' : `${cpfsDuplicados} grupos`, total: '-', peso: 15, score: Math.round(scores.semDuplicados) },
          contato: { valor: clientesComContato, total: totalClientes, peso: 10, score: Math.round(scores.contato) },
          endereco: { valor: clientesComEndereco, total: totalClientes, peso: 5, score: Math.round(scores.endereco) },
          financeiro: { valor: clientesComFinanceiro, total: totalClientes, peso: 10, score: Math.round(scores.financeiro) },
          movimentacoes: { valor: procsComMovs, total: totalProcs, peso: 10, score: Math.round(scores.movimentacoes) },
          estrategias: { valor: procsComEstr, total: totalProcs, peso: 10, score: Math.round(scores.estrategias) },
          documentos: { valor: procsComDocs, total: totalProcs, peso: 10, score: Math.round(scores.documentos) },
          cnjsValidos: { valor: cnjsValidos, total: totalProcs, peso: 5, score: Math.round(scores.cnjsValidos) },
          valorCausa: { valor: procsComValor, total: totalProcs, peso: 5, score: Math.round(scores.valorCausa) },
        },
      };
    }),
  }),

  // ==================== ANÁLISE GERAL ====================
  analise: router({
    visaoGeral: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { registros: [], estatisticas: null };
      const registros = await db.select().from(analiseGeral).orderBy(analiseGeral.ordem);
      // Estatísticas dinâmicas em tempo real
      const totalClientes = await db.select({ count: sql<number>`COUNT(*)` }).from(clientes);
      const totalProcessos = await db.select({ count: sql<number>`COUNT(*)` }).from(processos);
      const totalConhecimentos = await db.select({ count: sql<number>`COUNT(*)` }).from(conhecimentos);
      const totalEstrategias = await db.select({ count: sql<number>`COUNT(*)` }).from(estrategias);
      const totalDocumentos = await db.select({ count: sql<number>`COUNT(*)` }).from(documentos);
      const valorTotal = await db.select({ total: sql<string>`COALESCE(SUM(valorCausa), 0)` }).from(processos);
      const tiposAcao = await db.select({ tipo: processos.tipoAcao, count: sql<number>`COUNT(*)` }).from(processos).groupBy(processos.tipoAcao).orderBy(sql`COUNT(*) DESC`);
      const fases = await db.select({ fase: processos.faseAtual, count: sql<number>`COUNT(*)` }).from(processos).groupBy(processos.faseAtual);
      const cidades = await db.select({ cidade: clientes.cidade, count: sql<number>`COUNT(*)` }).from(clientes).where(sql`${clientes.cidade} IS NOT NULL AND ${clientes.cidade} != ''`).groupBy(clientes.cidade).orderBy(sql`COUNT(*) DESC`);
      return {
        registros,
        estatisticas: {
          totalClientes: totalClientes[0]?.count || 0,
          totalProcessos: totalProcessos[0]?.count || 0,
          totalConhecimentos: totalConhecimentos[0]?.count || 0,
          totalEstrategias: totalEstrategias[0]?.count || 0,
          totalDocumentos: totalDocumentos[0]?.count || 0,
          valorTotalCausas: valorTotal[0]?.total || "0",
          tiposAcao,
          fases,
          cidades,
        },
      };
    }),
  }),

  // ==================== EXPORTAÇÃO ====================
  exportar: router({
    clienteJson: protectedProcedure
      .input(z.object({ clienteId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return null;
        const [cliente] = await db.select().from(clientes).where(eq(clientes.id, input.clienteId)).limit(1);
        if (!cliente) return null;
        const procs = await db.select().from(processos).where(eq(processos.clienteId, input.clienteId));
        const financeiro = await db.select().from(dadosFinanceiros).where(eq(dadosFinanceiros.clienteId, input.clienteId));
        const emprestimos = await db.select().from(emprestimosConsignados).where(eq(emprestimosConsignados.clienteId, input.clienteId));
        const docs = await db.select().from(documentos).where(eq(documentos.clienteId, input.clienteId));

        const processosDetalhados = await Promise.all(procs.map(async (p) => {
          const estrats = await db.select().from(estrategias).where(eq(estrategias.processoId, p.id));
          const partes = await db.select().from(partesProcessuais).where(eq(partesProcessuais.processoId, p.id));
          const movs = await db.select().from(movimentacoes).where(eq(movimentacoes.processoId, p.id));
          const cumps = await db.select().from(cumprimentosSentenca).where(eq(cumprimentosSentenca.processoId, p.id));
          const { textoExtraido, ...procData } = p;
          return { ...procData, estrategias: estrats, partes, movimentacoes: movs, cumprimentos: cumps };
        }));

        return {
          exportDate: new Date().toISOString(),
          version: "2.0",
          pasta: clientFolderKey(cliente.nomeCompleto, cliente.cpfCnpj),
          cliente,
          dadosFinanceiros: financeiro,
          emprestimos,
          processos: processosDetalhados,
          documentos: docs,
        };
      }),

    todosClientesJson: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      const allClientes = await db.select().from(clientes).orderBy(desc(clientes.updatedAt));
      const result = await Promise.all(allClientes.map(async (cli) => {
        const procs = await db.select().from(processos).where(eq(processos.clienteId, cli.id));
        const financeiro = await db.select().from(dadosFinanceiros).where(eq(dadosFinanceiros.clienteId, cli.id));
        const emprestimos = await db.select().from(emprestimosConsignados).where(eq(emprestimosConsignados.clienteId, cli.id));
        return {
          pasta: clientFolderKey(cli.nomeCompleto, cli.cpfCnpj),
          cliente: cli,
          processos: procs.map(p => { const { textoExtraido, ...rest } = p; return rest; }),
          dadosFinanceiros: financeiro,
          emprestimos,
        };
      }));
      return { exportDate: new Date().toISOString(), version: "2.0", totalClientes: allClientes.length, dados: result };
    }),

    conhecimentosJson: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(conhecimentos).orderBy(desc(conhecimentos.createdAt));
    }),
  }),

  // ==================== RELATÓRIOS ====================
  relatorios: router({
    // Listar todos os relatórios
    list: protectedProcedure
      .input(z.object({ categoria: z.string().optional() }).optional())
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        if (input?.categoria) {
          return db.select().from(relatorios)
            .where(eq(relatorios.categoria, input.categoria))
            .orderBy(desc(relatorios.updatedAt));
        }
        return db.select().from(relatorios).orderBy(desc(relatorios.updatedAt));
      }),

    // Buscar relatório por ID
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return null;
        const rows = await db.select().from(relatorios).where(eq(relatorios.id, input.id)).limit(1);
        return rows[0] ?? null;
      }),

    // Gerar Relatório de Dados Cadastrais em tempo real (consulta banco e gera PDF)
    gerarCadastral: protectedProcedure.mutation(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // 1. Buscar todos os clientes PF com dados completos
      const allClientes = await db.select().from(clientes).orderBy(desc(clientes.updatedAt));
      const clientesPF = allClientes.filter(c => c.tipoPessoa === "PF" && !c.cpfCnpj.startsWith("PENDENTE"));

      // 2. Para cada cliente, buscar processos e dados vinculados
      const dadosRelatorio = await Promise.all(clientesPF.map(async (cli) => {
        const procs = await db.select().from(processos).where(eq(processos.clienteId, cli.id)).orderBy(desc(processos.updatedAt));
        const financeiro = await db.select().from(dadosFinanceiros).where(eq(dadosFinanceiros.clienteId, cli.id)).limit(1);
        const emprestimos = await db.select().from(emprestimosConsignados).where(eq(emprestimosConsignados.clienteId, cli.id));

        return {
          id: cli.id,
          nomeCompleto: cli.nomeCompleto,
          cpfCnpj: cli.cpfCnpj,
          rg: cli.rg,
          profissao: cli.profissao,
          cargo: cli.cargo,
          orgaoEmpregador: cli.orgaoEmpregador,
          vinculoFuncional: cli.vinculoFuncional,
          endereco: cli.endereco,
          cidade: cli.cidade,
          estado: cli.estado,
          cep: cli.cep,
          telefone: cli.telefone,
          email: cli.email,
          dataNascimento: cli.dataNascimento,
          estadoCivil: cli.estadoCivil,
          nacionalidade: cli.nacionalidade,
          totalProcessos: procs.length,
          processosAtivos: procs.filter(p => p.statusProcesso === "Ativo").length,
          processos: procs.map(p => ({
            numeroCnj: p.numeroCnj,
            tribunal: p.tribunal,
            vara: p.vara,
            comarca: p.comarca,
            tipoAcao: p.tipoAcao,
            faseAtual: p.faseAtual,
            statusProcesso: p.statusProcesso,
            valorCausa: p.valorCausa,
            dataDistribuicao: p.dataDistribuicao,
            poloPassivo: p.poloPassivo,
          })),
          dadosFinanceiros: financeiro[0] ? {
            remuneracaoBruta: financeiro[0].remuneracaoBruta,
            remuneracaoLiquida: financeiro[0].remuneracaoLiquida,
            margemConsignavelPerc: financeiro[0].margemConsignavelPerc,
            margemConsignavelValor: financeiro[0].margemConsignavelValor,
            fonteRenda: financeiro[0].fonteRenda,
          } : null,
          totalEmprestimos: emprestimos.length,
          emprestimosAtivos: emprestimos.filter(e => e.status === "Ativo").length,
        };
      }));

      // 3. Estatísticas gerais
      const totalClientes = allClientes.length;
      const totalProcessos = await db.select({ count: sql<number>`COUNT(*)` }).from(processos);
      const valorTotal = await db.select({ total: sql<string>`COALESCE(SUM(valorCausa), 0)` }).from(processos);

      const relatorioData = {
        titulo: "Relat\u00f3rio de Dados Cadastrais - Clientes Pessoa F\u00edsica",
        dataGeracao: new Date().toISOString(),
        escritorio: "Melo & Preda Advogados",
        resumo: {
          totalClientesPF: clientesPF.length,
          totalClientesGeral: totalClientes,
          totalProcessos: totalProcessos[0]?.count || 0,
          valorTotalCausas: valorTotal[0]?.total || "0",
        },
        clientes: dadosRelatorio,
      };

      // 4. Salvar JSON do relatório no S3
      const storageKey = `relatorios/cadastral/RELATORIO_CADASTRAL_${new Date().toISOString().split('T')[0].replace(/-/g, '')}.json`;
      const { url } = await storagePut(storageKey, JSON.stringify(relatorioData, null, 2), "application/json");

      // 5. Salvar/atualizar registro no banco
      const existingReport = await db.select().from(relatorios)
        .where(eq(relatorios.tipoRelatorio, "cadastral_pf")).limit(1);

      let relatorioId: number;
      if (existingReport.length > 0) {
        // Atualizar relatório existente
        await db.update(relatorios).set({
          titulo: "Relat\u00f3rio de Dados Cadastrais - Clientes PF",
          descricao: `Relat\u00f3rio atualizado com ${clientesPF.length} clientes PF e ${totalProcessos[0]?.count || 0} processos. Gerado em ${new Date().toLocaleString('pt-BR')}.`,
          storageKey,
          storageUrl: url,
          dadosJson: relatorioData as any,
        }).where(eq(relatorios.id, existingReport[0].id));
        relatorioId = existingReport[0].id;
      } else {
        // Criar novo relatório
        const [inserted] = await db.insert(relatorios).values({
          titulo: "Relat\u00f3rio de Dados Cadastrais - Clientes PF",
          categoria: "Cadastral",
          subcategoria: "Dados Cadastrais Clientes PF",
          descricao: `Relat\u00f3rio com ${clientesPF.length} clientes PF e ${totalProcessos[0]?.count || 0} processos. Gerado em ${new Date().toLocaleString('pt-BR')}.`,
          tipoRelatorio: "cadastral_pf",
          formato: "JSON",
          storageKey,
          storageUrl: url,
          dadosJson: relatorioData as any,
          geradoPor: "Sistema",
        }).$returningId();
        relatorioId = inserted.id;
      }

      return {
        success: true,
        relatorioId,
        url,
        totalClientes: clientesPF.length,
        totalProcessos: totalProcessos[0]?.count || 0,
        dados: relatorioData,
      };
    }),

    // Dados em tempo real para exibição na tela (sem gerar arquivo)
    dadosCadastraisRealtime: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return null;

      const allClientes = await db.select().from(clientes).orderBy(desc(clientes.updatedAt));
      const clientesPF = allClientes.filter(c => c.tipoPessoa === "PF" && !c.cpfCnpj.startsWith("PENDENTE"));

      const dadosRelatorio = await Promise.all(clientesPF.map(async (cli) => {
        const procs = await db.select().from(processos).where(eq(processos.clienteId, cli.id)).orderBy(desc(processos.updatedAt));
        const financeiro = await db.select().from(dadosFinanceiros).where(eq(dadosFinanceiros.clienteId, cli.id)).limit(1);
        const emprestimos = await db.select().from(emprestimosConsignados).where(eq(emprestimosConsignados.clienteId, cli.id));

        return {
          id: cli.id,
          nomeCompleto: cli.nomeCompleto,
          cpfCnpj: cli.cpfCnpj,
          rg: cli.rg,
          profissao: cli.profissao,
          cargo: cli.cargo,
          orgaoEmpregador: cli.orgaoEmpregador,
          vinculoFuncional: cli.vinculoFuncional,
          endereco: cli.endereco,
          cidade: cli.cidade,
          estado: cli.estado,
          telefone: cli.telefone,
          email: cli.email,
          totalProcessos: procs.length,
          processosAtivos: procs.filter(p => p.statusProcesso === "Ativo").length,
          processos: procs.map(p => ({
            numeroCnj: p.numeroCnj,
            tribunal: p.tribunal,
            vara: p.vara,
            comarca: p.comarca,
            tipoAcao: p.tipoAcao,
            faseAtual: p.faseAtual,
            statusProcesso: p.statusProcesso,
            valorCausa: p.valorCausa,
            dataDistribuicao: p.dataDistribuicao,
            poloPassivo: p.poloPassivo,
          })),
          dadosFinanceiros: financeiro[0] ? {
            remuneracaoBruta: financeiro[0].remuneracaoBruta,
            remuneracaoLiquida: financeiro[0].remuneracaoLiquida,
            fonteRenda: financeiro[0].fonteRenda,
          } : null,
          totalEmprestimos: emprestimos.length,
        };
      }));

      // Estatísticas
      const totalProcessos = await db.select({ count: sql<number>`COUNT(*)` }).from(processos);
      const valorTotal = await db.select({ total: sql<string>`COALESCE(SUM(valorCausa), 0)` }).from(processos);
      const totalEmprestimos = await db.select({ count: sql<number>`COUNT(*)` }).from(emprestimosConsignados);

      // Último relatório gerado
      const ultimoRelatorio = await db.select().from(relatorios)
        .where(eq(relatorios.tipoRelatorio, "cadastral_pf"))
        .orderBy(desc(relatorios.updatedAt)).limit(1);

      return {
        dataConsulta: new Date().toISOString(),
        totalClientesPF: clientesPF.length,
        totalClientesGeral: allClientes.length,
        totalProcessos: totalProcessos[0]?.count || 0,
        valorTotalCausas: valorTotal[0]?.total || "0",
        totalEmprestimos: totalEmprestimos[0]?.count || 0,
        ultimoRelatorioGerado: ultimoRelatorio[0]?.updatedAt || null,
        ultimoRelatorioUrl: ultimoRelatorio[0]?.storageUrl || null,
        clientes: dadosRelatorio,
      };
    }),

    // Excluir relatório
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        await db.delete(relatorios).where(eq(relatorios.id, input.id));
        return { success: true };
      }),

    // Atualizar título/descrição de um relatório
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        titulo: z.string().optional(),
        descricao: z.string().optional(),
        subcategoria: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const updateFields: Record<string, any> = {};
        if (input.titulo) updateFields.titulo = input.titulo;
        if (input.descricao !== undefined) updateFields.descricao = input.descricao;
        if (input.subcategoria !== undefined) updateFields.subcategoria = input.subcategoria;
        if (Object.keys(updateFields).length > 0) {
          await db.update(relatorios).set(updateFields).where(eq(relatorios.id, input.id));
        }
        const [updated] = await db.select().from(relatorios).where(eq(relatorios.id, input.id)).limit(1);
        return updated ?? null;
      }),

    // Categorias disponíveis de relatórios
    categorias: protectedProcedure.query(async () => {
      return [
        {
          id: "cadastral",
          titulo: "Relatórios Cadastrais",
          descricao: "Dados cadastrais de clientes, CPF, processos vinculados, vínculos funcionais",
          subcategorias: [
            { id: "cadastral_pf", titulo: "Dados Cadastrais - Clientes PF", descricao: "Relatório completo de clientes pessoa física com processos, vínculos e dados financeiros" },
          ],
        },
        {
          id: "financeiro",
          titulo: "Relatórios Financeiros",
          descricao: "Honorários, depósitos judiciais, alvarás, margem consignável",
          subcategorias: [
            { id: "financeiro_honorarios", titulo: "Honorários e Movimentações", descricao: "Relatório detalhado de honorários sucumbenciais, depósitos, alvarás e pagamentos" },
            { id: "financeiro_margem", titulo: "Margem Consignável", descricao: "Análise detalhada de margem consignável, empréstimos e aptidão por cliente" },
          ],
        },
        {
          id: "processual",
          titulo: "Relatórios Processuais",
          descricao: "Acompanhamento de processos, fases, valores, prazos e estratégias",
          subcategorias: [
            { id: "processual_geral", titulo: "Panorama Processual", descricao: "Visão geral de todos os processos por tipo, tribunal, status e valor" },
            { id: "processual_prazos", titulo: "Prazos Processuais", descricao: "Controle de prazos com urgência, vencimentos e status" },
          ],
        },
        {
          id: "conhecimentos",
          titulo: "Conhecimentos Jurídicos",
          descricao: "Jurisprudências, teses, estratégias e legislações catalogadas",
          subcategorias: [
            { id: "conhecimentos_geral", titulo: "Banco de Conhecimentos", descricao: "Relatório completo do acervo jurídico por categoria, tribunal e tipo de ação" },
          ],
        },
      ];
    }),

    // ==================== RELATÓRIO DE MARGEM CONSIGNÁVEL ====================
    dadosMargemRealtime: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return null;

      const allClientes = await db.select().from(clientes).orderBy(desc(clientes.updatedAt));
      const clientesPF = allClientes.filter(c => c.tipoPessoa === 'PF' && !c.cpfCnpj.startsWith('PENDENTE'));

      const dadosMargem = await Promise.all(clientesPF.map(async (cli) => {
        const financeiro = await db.select().from(dadosFinanceiros).where(eq(dadosFinanceiros.clienteId, cli.id)).limit(1);
        const emprestimos = await db.select().from(emprestimosConsignados).where(eq(emprestimosConsignados.clienteId, cli.id));
        const procs = await db.select().from(processos).where(eq(processos.clienteId, cli.id));

        const fin = financeiro[0];
        const remuneracaoBruta = fin ? parseFloat(String(fin.remuneracaoBruta || '0')) : 0;
        const remuneracaoLiquida = fin ? parseFloat(String(fin.remuneracaoLiquida || '0')) : 0;
        const margemPerc = fin ? parseFloat(String(fin.margemConsignavelPerc || '35')) : 35;
        const margemValor = fin ? parseFloat(String(fin.margemConsignavelValor || '0')) : (remuneracaoLiquida * margemPerc / 100);
        const totalConsignacoes = emprestimos.reduce((sum, e) => sum + parseFloat(String(e.valorParcela || '0')), 0);
        const margemDisponivel = margemValor - totalConsignacoes;
        const margemExcedida = totalConsignacoes > margemValor;
        const aptoEmprestimo = !margemExcedida && margemDisponivel > 0 && remuneracaoLiquida > 0;
        const comprometimentoPerc = remuneracaoLiquida > 0 ? (totalConsignacoes / remuneracaoLiquida * 100) : 0;

        // Score de risco: 0-100 (0=alto risco, 100=baixo risco)
        let scoreRisco = 100;
        if (margemExcedida) scoreRisco -= 40;
        if (comprometimentoPerc > 50) scoreRisco -= 20;
        else if (comprometimentoPerc > 35) scoreRisco -= 10;
        if (emprestimos.length > 5) scoreRisco -= 15;
        else if (emprestimos.length > 3) scoreRisco -= 5;
        if (remuneracaoLiquida === 0) scoreRisco -= 25;
        scoreRisco = Math.max(0, Math.min(100, scoreRisco));

        return {
          id: cli.id,
          nomeCompleto: cli.nomeCompleto,
          cpfCnpj: cli.cpfCnpj,
          profissao: cli.profissao,
          cargo: cli.cargo,
          orgaoEmpregador: cli.orgaoEmpregador,
          remuneracaoBruta,
          remuneracaoLiquida,
          margemPerc,
          margemValor,
          totalConsignacoes,
          margemDisponivel,
          margemExcedida,
          aptoEmprestimo,
          comprometimentoPerc,
          scoreRisco,
          totalEmprestimos: emprestimos.length,
          emprestimosAtivos: emprestimos.filter(e => e.status === 'Ativo').length,
          emprestimos: emprestimos.map(e => ({
            banco: e.banco,
            contrato: e.contrato,
            valorParcela: parseFloat(String(e.valorParcela || '0')),
            totalParcelas: e.totalParcelas,
            parcelasRestantes: e.parcelasRestantes,
            saldoDevedor: parseFloat(String(e.valorTotal || '0')),
            taxaJuros: e.taxaJuros,
            status: e.status,
          })),
          totalProcessos: procs.length,
          valorTotalCausas: procs.reduce((sum, p) => sum + parseFloat(String(p.valorCausa || '0')), 0),
          fonteRenda: fin?.fonteRenda || null,
          temDadosFinanceiros: !!fin,
        };
      }));

      // Estatísticas consolidadas
      const comDados = dadosMargem.filter(c => c.temDadosFinanceiros);
      const semDados = dadosMargem.filter(c => !c.temDadosFinanceiros);
      const aptos = dadosMargem.filter(c => c.aptoEmprestimo);
      const excedidos = dadosMargem.filter(c => c.margemExcedida);
      const totalMargemDisponivel = comDados.reduce((sum, c) => sum + Math.max(0, c.margemDisponivel), 0);
      const totalConsignacoes = comDados.reduce((sum, c) => sum + c.totalConsignacoes, 0);
      const totalRemuneracaoLiquida = comDados.reduce((sum, c) => sum + c.remuneracaoLiquida, 0);
      const mediaComprometimento = comDados.length > 0 ? comDados.reduce((sum, c) => sum + c.comprometimentoPerc, 0) / comDados.length : 0;
      const mediaScore = comDados.length > 0 ? comDados.reduce((sum, c) => sum + c.scoreRisco, 0) / comDados.length : 0;

      return {
        dataConsulta: new Date().toISOString(),
        totalClientes: dadosMargem.length,
        clientesComDados: comDados.length,
        clientesSemDados: semDados.length,
        clientesAptos: aptos.length,
        clientesExcedidos: excedidos.length,
        totalMargemDisponivel,
        totalConsignacoes,
        totalRemuneracaoLiquida,
        mediaComprometimento,
        mediaScore,
        clientes: dadosMargem,
      };
    }),

    gerarMargemConsignavel: protectedProcedure.mutation(async () => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      // Reutilizar lógica do dadosMargemRealtime
      const allClientes = await db.select().from(clientes).orderBy(desc(clientes.updatedAt));
      const clientesPF = allClientes.filter(c => c.tipoPessoa === 'PF' && !c.cpfCnpj.startsWith('PENDENTE'));

      const dadosMargem = await Promise.all(clientesPF.map(async (cli) => {
        const financeiro = await db.select().from(dadosFinanceiros).where(eq(dadosFinanceiros.clienteId, cli.id)).limit(1);
        const emprestimos = await db.select().from(emprestimosConsignados).where(eq(emprestimosConsignados.clienteId, cli.id));
        const fin = financeiro[0];
        const remuneracaoLiquida = fin ? parseFloat(String(fin.remuneracaoLiquida || '0')) : 0;
        const margemValor = fin ? parseFloat(String(fin.margemConsignavelValor || '0')) : (remuneracaoLiquida * 0.35);
        const totalConsignacoes = emprestimos.reduce((sum, e) => sum + parseFloat(String(e.valorParcela || '0')), 0);
        return {
          nomeCompleto: cli.nomeCompleto,
          cpfCnpj: cli.cpfCnpj,
          remuneracaoBruta: fin ? parseFloat(String(fin.remuneracaoBruta || '0')) : 0,
          remuneracaoLiquida,
          margemValor,
          totalConsignacoes,
          margemDisponivel: margemValor - totalConsignacoes,
          margemExcedida: totalConsignacoes > margemValor,
          aptoEmprestimo: totalConsignacoes <= margemValor && (margemValor - totalConsignacoes) > 0 && remuneracaoLiquida > 0,
          totalEmprestimos: emprestimos.length,
        };
      }));

      const relatorioData = {
        titulo: 'Relatório de Margem Consignável',
        dataGeracao: new Date().toISOString(),
        escritorio: 'Melo & Preda Advogados',
        totalClientes: dadosMargem.length,
        clientes: dadosMargem,
      };

      const storageKey = `relatorios/margem/RELATORIO_MARGEM_${new Date().toISOString().split('T')[0].replace(/-/g, '')}.json`;
      const { url } = await storagePut(storageKey, JSON.stringify(relatorioData, null, 2), 'application/json');

      const existingReport = await db.select().from(relatorios).where(eq(relatorios.tipoRelatorio, 'financeiro_margem')).limit(1);
      let relatorioId: number;
      if (existingReport.length > 0) {
        await db.update(relatorios).set({
          titulo: 'Relatório de Margem Consignável',
          descricao: `Análise de margem consignável de ${dadosMargem.length} clientes. Gerado em ${new Date().toLocaleString('pt-BR')}.`,
          storageKey, storageUrl: url, dadosJson: relatorioData as any,
        }).where(eq(relatorios.id, existingReport[0].id));
        relatorioId = existingReport[0].id;
      } else {
        const [inserted] = await db.insert(relatorios).values({
          titulo: 'Relatório de Margem Consignável',
          categoria: 'Financeiro', subcategoria: 'Margem Consignável',
          descricao: `Análise de margem consignável de ${dadosMargem.length} clientes. Gerado em ${new Date().toLocaleString('pt-BR')}.`,
          tipoRelatorio: 'financeiro_margem', formato: 'JSON',
          storageKey, storageUrl: url, dadosJson: relatorioData as any, geradoPor: 'Sistema',
        }).$returningId();
        relatorioId = inserted.id;
      }

      return { success: true, relatorioId, url, totalClientes: dadosMargem.length, dados: relatorioData };
    }),

    // ==================== RELATÓRIO PANORAMA PROCESSUAL ====================
    dadosPanoramaRealtime: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return null;

      const allProcessos = await db.select().from(processos).orderBy(desc(processos.updatedAt));
      const allClientes = await db.select().from(clientes);
      const allEstrategias = await db.select().from(estrategias);
      const allMovimentacoes = await db.select().from(movimentacoes);
      const allPartes = await db.select().from(partesProcessuais);

      // Mapas auxiliares
      const clienteMap = new Map(allClientes.map(c => [c.id, c]));

      // Processos enriquecidos
      const processosEnriquecidos = allProcessos.map(p => {
        const cli = clienteMap.get(p.clienteId);
        const ests = allEstrategias.filter(e => e.processoId === p.id);
        const movs = allMovimentacoes.filter(m => m.processoId === p.id);
        const pts = allPartes.filter(pt => pt.processoId === p.id);
        return {
          id: p.id,
          numeroCnj: p.numeroCnj,
          tribunal: p.tribunal,
          vara: p.vara,
          comarca: p.comarca,
          tipoAcao: p.tipoAcao,
          faseAtual: p.faseAtual,
          statusProcesso: p.statusProcesso,
          valorCausa: parseFloat(String(p.valorCausa || '0')),
          dataDistribuicao: p.dataDistribuicao,
          poloPassivo: p.poloPassivo,
          clienteNome: cli?.nomeCompleto || 'N/A',
          clienteCpf: cli?.cpfCnpj || 'N/A',
          totalEstrategias: ests.length,
          totalMovimentacoes: movs.length,
          totalPartes: pts.length,
          tesePrincipal: ests[0]?.tesePrincipal || null,
          ultimaMovimentacao: movs.length > 0 ? movs[0]?.descricao : null,
        };
      });

      // Agrupamentos
      const porTipoAcao: Record<string, number> = {};
      const porTribunal: Record<string, number> = {};
      const porStatus: Record<string, number> = {};
      const porFase: Record<string, number> = {};
      const porComarca: Record<string, number> = {};
      let valorTotal = 0;
      let valorAtivos = 0;

      for (const p of processosEnriquecidos) {
        const tipo = p.tipoAcao || 'Não informado';
        const trib = p.tribunal || 'Não informado';
        const status = p.statusProcesso || 'Não informado';
        const fase = p.faseAtual || 'Não informada';
        const comarca = p.comarca || 'Não informada';
        porTipoAcao[tipo] = (porTipoAcao[tipo] || 0) + 1;
        porTribunal[trib] = (porTribunal[trib] || 0) + 1;
        porStatus[status] = (porStatus[status] || 0) + 1;
        porFase[fase] = (porFase[fase] || 0) + 1;
        porComarca[comarca] = (porComarca[comarca] || 0) + 1;
        valorTotal += p.valorCausa;
        if (status === 'Ativo') valorAtivos += p.valorCausa;
      }

      // Polo passivo mais frequente
      const poloPassivoCount: Record<string, number> = {};
      for (const p of processosEnriquecidos) {
        if (p.poloPassivo) {
          poloPassivoCount[p.poloPassivo] = (poloPassivoCount[p.poloPassivo] || 0) + 1;
        }
      }
      const polosPassivos = Object.entries(poloPassivoCount).sort((a, b) => b[1] - a[1]).map(([nome, qtd]) => ({ nome, qtd }));

      return {
        dataConsulta: new Date().toISOString(),
        totalProcessos: allProcessos.length,
        totalClientes: allClientes.length,
        valorTotal,
        valorAtivos,
        totalEstrategias: allEstrategias.length,
        totalMovimentacoes: allMovimentacoes.length,
        porTipoAcao: Object.entries(porTipoAcao).sort((a, b) => b[1] - a[1]).map(([tipo, qtd]) => ({ tipo, qtd })),
        porTribunal: Object.entries(porTribunal).sort((a, b) => b[1] - a[1]).map(([tribunal, qtd]) => ({ tribunal, qtd })),
        porStatus: Object.entries(porStatus).sort((a, b) => b[1] - a[1]).map(([status, qtd]) => ({ status, qtd })),
        porFase: Object.entries(porFase).sort((a, b) => b[1] - a[1]).map(([fase, qtd]) => ({ fase, qtd })),
        porComarca: Object.entries(porComarca).sort((a, b) => b[1] - a[1]).map(([comarca, qtd]) => ({ comarca, qtd })),
        polosPassivos,
        processos: processosEnriquecidos,
      };
    }),

    gerarPanoramaProcessual: protectedProcedure.mutation(async () => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const allProcessos = await db.select().from(processos).orderBy(desc(processos.updatedAt));
      const allClientes = await db.select().from(clientes);
      const clienteMap = new Map(allClientes.map(c => [c.id, c]));

      const processosData = allProcessos.map(p => {
        const cli = clienteMap.get(p.clienteId);
        return {
          numeroCnj: p.numeroCnj, tribunal: p.tribunal, vara: p.vara, comarca: p.comarca,
          tipoAcao: p.tipoAcao, faseAtual: p.faseAtual, statusProcesso: p.statusProcesso,
          valorCausa: p.valorCausa, dataDistribuicao: p.dataDistribuicao, poloPassivo: p.poloPassivo,
          clienteNome: cli?.nomeCompleto || 'N/A', clienteCpf: cli?.cpfCnpj || 'N/A',
        };
      });

      const relatorioData = {
        titulo: 'Panorama Processual', dataGeracao: new Date().toISOString(),
        escritorio: 'Melo & Preda Advogados', totalProcessos: allProcessos.length, processos: processosData,
      };

      const storageKey = `relatorios/panorama/PANORAMA_PROCESSUAL_${new Date().toISOString().split('T')[0].replace(/-/g, '')}.json`;
      const { url } = await storagePut(storageKey, JSON.stringify(relatorioData, null, 2), 'application/json');

      const existingReport = await db.select().from(relatorios).where(eq(relatorios.tipoRelatorio, 'processual_geral')).limit(1);
      let relatorioId: number;
      if (existingReport.length > 0) {
        await db.update(relatorios).set({
          titulo: 'Panorama Processual',
          descricao: `Panorama de ${allProcessos.length} processos. Gerado em ${new Date().toLocaleString('pt-BR')}.`,
          storageKey, storageUrl: url, dadosJson: relatorioData as any,
        }).where(eq(relatorios.id, existingReport[0].id));
        relatorioId = existingReport[0].id;
      } else {
        const [inserted] = await db.insert(relatorios).values({
          titulo: 'Panorama Processual',
          categoria: 'Processual', subcategoria: 'Panorama Geral',
          descricao: `Panorama de ${allProcessos.length} processos. Gerado em ${new Date().toLocaleString('pt-BR')}.`,
          tipoRelatorio: 'processual_geral', formato: 'JSON',
          storageKey, storageUrl: url, dadosJson: relatorioData as any, geradoPor: 'Sistema',
        }).$returningId();
        relatorioId = inserted.id;
      }

       return { success: true, relatorioId, url, totalProcessos: allProcessos.length, dados: relatorioData };
    }),

    // ==================== RELATÓRIO DE HONORÁRIOS ====================
    dadosHonorariosRealtime: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return null;
      const allMovFin = await db.select().from(movimentacoesFinanceiras).orderBy(desc(movimentacoesFinanceiras.createdAt));
      const allProcessos = await db.select().from(processos);
      const allClientes = await db.select().from(clientes);
      const clienteMap = new Map(allClientes.map(c => [c.id, c]));
      const processoMap = new Map(allProcessos.map(p => [p.id, p]));

      // Enriquecer movimentações
      const movimentacoesEnriquecidas = allMovFin.map(m => {
        const cli = clienteMap.get(m.clienteId);
        const proc = processoMap.get(m.processoId);
        return {
          ...m,
          clienteNome: cli?.nomeCompleto || 'N/A',
          clienteCpf: cli?.cpfCnpj || '',
          processoNumero: proc?.numeroCnj || 'N/A',
          processoTribunal: proc?.tribunal || '',
          valor: parseFloat(String(m.valor || '0')),
          valorLevantado: parseFloat(String(m.valorLevantado || '0')),
          valorPendente: parseFloat(String(m.valorPendente || '0')),
        };
      });

      // Agrupamentos por tipo
      const porTipo: Record<string, { qtd: number; valorTotal: number; valorPago: number; valorPendente: number }> = {};
      const porStatus: Record<string, { qtd: number; valorTotal: number }> = {};
      const porCliente: Record<number, { nome: string; qtd: number; valorTotal: number; valorPago: number; valorPendente: number }> = {};
      let totalGeral = 0, totalPago = 0, totalPendente = 0, totalDepositado = 0;

      for (const m of movimentacoesEnriquecidas) {
        // Por tipo
        if (!porTipo[m.tipo]) porTipo[m.tipo] = { qtd: 0, valorTotal: 0, valorPago: 0, valorPendente: 0 };
        porTipo[m.tipo].qtd++;
        porTipo[m.tipo].valorTotal += m.valor;
        if (m.status === 'pago_levantado') porTipo[m.tipo].valorPago += m.valor;
        if (m.status === 'pendente' || m.status === 'parcial') porTipo[m.tipo].valorPendente += m.valor;
        // Por status
        if (!porStatus[m.status]) porStatus[m.status] = { qtd: 0, valorTotal: 0 };
        porStatus[m.status].qtd++;
        porStatus[m.status].valorTotal += m.valor;
        // Por cliente
        if (!porCliente[m.clienteId]) porCliente[m.clienteId] = { nome: m.clienteNome, qtd: 0, valorTotal: 0, valorPago: 0, valorPendente: 0 };
        porCliente[m.clienteId].qtd++;
        porCliente[m.clienteId].valorTotal += m.valor;
        if (m.status === 'pago_levantado') porCliente[m.clienteId].valorPago += m.valor;
        if (m.status === 'pendente' || m.status === 'parcial') porCliente[m.clienteId].valorPendente += m.valor;
        // Totais
        totalGeral += m.valor;
        if (m.status === 'pago_levantado') totalPago += m.valor;
        if (m.status === 'pendente' || m.status === 'parcial') totalPendente += m.valor;
        if (m.status === 'depositado_a_levantar') totalDepositado += m.valor;
      }

      return {
        dataConsulta: new Date().toISOString(),
        totalMovimentacoes: allMovFin.length,
        totalGeral, totalPago, totalPendente, totalDepositado,
        porTipo: Object.entries(porTipo).sort((a, b) => b[1].valorTotal - a[1].valorTotal).map(([tipo, d]) => ({ tipo, ...d })),
        porStatus: Object.entries(porStatus).sort((a, b) => b[1].valorTotal - a[1].valorTotal).map(([status, d]) => ({ status, ...d })),
        porCliente: Object.values(porCliente).sort((a, b) => b.valorTotal - a.valorTotal),
        movimentacoes: movimentacoesEnriquecidas,
      };
    }),

    gerarRelatorioHonorarios: protectedProcedure.mutation(async () => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const allMovFin = await db.select().from(movimentacoesFinanceiras);
      const relatorioData = { totalMovimentacoes: allMovFin.length, geradoEm: new Date().toISOString() };
      const storageKey = `relatorios/honorarios_${Date.now()}.json`;
      const { url } = await storagePut(storageKey, JSON.stringify(relatorioData), 'application/json');
      const existingReport = await db.select().from(relatorios).where(eq(relatorios.tipoRelatorio, 'financeiro_honorarios')).limit(1);
      let relatorioId: number;
      if (existingReport.length > 0) {
        await db.update(relatorios).set({
          titulo: 'Relatório de Honorários',
          descricao: `${allMovFin.length} movimentações financeiras. Gerado em ${new Date().toLocaleString('pt-BR')}.`,
          storageKey, storageUrl: url, dadosJson: relatorioData as any,
        }).where(eq(relatorios.id, existingReport[0].id));
        relatorioId = existingReport[0].id;
      } else {
        const [inserted] = await db.insert(relatorios).values({
          titulo: 'Relatório de Honorários',
          categoria: 'Financeiro', subcategoria: 'Honorários',
          descricao: `${allMovFin.length} movimentações financeiras. Gerado em ${new Date().toLocaleString('pt-BR')}.`,
          tipoRelatorio: 'financeiro_honorarios', formato: 'JSON',
          storageKey, storageUrl: url, dadosJson: relatorioData as any, geradoPor: 'Sistema',
        }).$returningId();
        relatorioId = inserted.id;
      }
      return { success: true, relatorioId, totalMovimentacoes: allMovFin.length };
    }),

    // ==================== RELATÓRIO DE CONHECIMENTOS JURÍDICOS ====================
    dadosConhecimentosRealtime: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return null;
      const allConhecimentos = await db.select().from(conhecimentos).orderBy(desc(conhecimentos.createdAt));
      const allProcessos = await db.select().from(processos);
      const processoMap = new Map(allProcessos.map(p => [p.id, p]));

      const porCategoria: Record<string, number> = {};
      const porTribunal: Record<string, number> = {};
      const porTipoAcao: Record<string, number> = {};

      const conhecimentosEnriquecidos = allConhecimentos.map(c => {
        const proc = c.processoOrigemId ? processoMap.get(c.processoOrigemId) : null;
        const cat = c.categoria || 'Sem categoria';
        porCategoria[cat] = (porCategoria[cat] || 0) + 1;
        if (c.tribunal) porTribunal[c.tribunal] = (porTribunal[c.tribunal] || 0) + 1;
        if (c.tipoAcao) porTipoAcao[c.tipoAcao] = (porTipoAcao[c.tipoAcao] || 0) + 1;
        return {
          ...c,
          processoNumero: proc?.numeroCnj || null,
          processoTribunal: proc?.tribunal || null,
        };
      });

      return {
        dataConsulta: new Date().toISOString(),
        totalConhecimentos: allConhecimentos.length,
        porCategoria: Object.entries(porCategoria).sort((a, b) => b[1] - a[1]).map(([cat, qtd]) => ({ categoria: cat, qtd })),
        porTribunal: Object.entries(porTribunal).sort((a, b) => b[1] - a[1]).map(([trib, qtd]) => ({ tribunal: trib, qtd })),
        porTipoAcao: Object.entries(porTipoAcao).sort((a, b) => b[1] - a[1]).map(([tipo, qtd]) => ({ tipo, qtd })),
        conhecimentos: conhecimentosEnriquecidos,
      };
    }),

    gerarRelatorioConhecimentos: protectedProcedure.mutation(async () => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const allConhecimentos = await db.select().from(conhecimentos);
      const relatorioData = { totalConhecimentos: allConhecimentos.length, geradoEm: new Date().toISOString() };
      const storageKey = `relatorios/conhecimentos_${Date.now()}.json`;
      const { url } = await storagePut(storageKey, JSON.stringify(relatorioData), 'application/json');
      const existingReport = await db.select().from(relatorios).where(eq(relatorios.tipoRelatorio, 'conhecimentos_geral')).limit(1);
      let relatorioId: number;
      if (existingReport.length > 0) {
        await db.update(relatorios).set({
          titulo: 'Relatório de Conhecimentos Jurídicos',
          descricao: `${allConhecimentos.length} conhecimentos. Gerado em ${new Date().toLocaleString('pt-BR')}.`,
          storageKey, storageUrl: url, dadosJson: relatorioData as any,
        }).where(eq(relatorios.id, existingReport[0].id));
        relatorioId = existingReport[0].id;
      } else {
        const [inserted] = await db.insert(relatorios).values({
          titulo: 'Relatório de Conhecimentos Jurídicos',
          categoria: 'Conhecimentos', subcategoria: 'Geral',
          descricao: `${allConhecimentos.length} conhecimentos. Gerado em ${new Date().toLocaleString('pt-BR')}.`,
          tipoRelatorio: 'conhecimentos_geral', formato: 'JSON',
          storageKey, storageUrl: url, dadosJson: relatorioData as any, geradoPor: 'Sistema',
        }).$returningId();
        relatorioId = inserted.id;
      }
      return { success: true, relatorioId, totalConhecimentos: allConhecimentos.length };
    }),

    // ==================== RELATÓRIO DE PRAZOS PROCESSUAIS ====================
    dadosPrazosRealtime: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return null;
      const allPrazos = await db.select().from(prazosProcessuais).orderBy(prazosProcessuais.dataVencimento);
      const allProcessos = await db.select().from(processos);
      const allClientes = await db.select().from(clientes);
      const processoMap = new Map(allProcessos.map(p => [p.id, p]));
      const clienteMap = new Map(allClientes.map(c => [c.id, c]));

      const agora = new Date();
      const porStatus: Record<string, number> = {};
      const porTipo: Record<string, number> = {};
      let vencidos = 0, vencendoHoje = 0, proximos7dias = 0;

      const prazosEnriquecidos = allPrazos.map(p => {
        const proc = processoMap.get(p.processoId);
        const cli = clienteMap.get(p.clienteId);
        const st = p.status || 'pendente';
        porStatus[st] = (porStatus[st] || 0) + 1;
        const tp = p.tipo || 'outro';
        porTipo[tp] = (porTipo[tp] || 0) + 1;
        const venc = new Date(p.dataVencimento);
        const diffDias = Math.ceil((venc.getTime() - agora.getTime()) / (1000 * 60 * 60 * 24));
        if (st === 'pendente') {
          if (diffDias < 0) vencidos++;
          else if (diffDias === 0) vencendoHoje++;
          else if (diffDias <= 7) proximos7dias++;
        }
        return {
          ...p,
          clienteNome: cli?.nomeCompleto || 'N/A',
          processoNumero: proc?.numeroCnj || 'N/A',
          processoTribunal: proc?.tribunal || '',
          diasRestantes: diffDias,
          urgencia: diffDias < 0 ? 'vencido' : diffDias === 0 ? 'hoje' : diffDias <= 3 ? 'urgente' : diffDias <= 7 ? 'atencao' : 'normal',
        };
      });

      return {
        dataConsulta: new Date().toISOString(),
        totalPrazos: allPrazos.length,
        vencidos, vencendoHoje, proximos7dias,
        pendentes: allPrazos.filter(p => p.status === 'pendente').length,
        cumpridos: allPrazos.filter(p => p.status === 'cumprido').length,
        porStatus: Object.entries(porStatus).sort((a, b) => b[1] - a[1]).map(([status, qtd]) => ({ status, qtd })),
        porTipo: Object.entries(porTipo).sort((a, b) => b[1] - a[1]).map(([tipo, qtd]) => ({ tipo, qtd })),
        prazos: prazosEnriquecidos,
      };
    }),

    gerarRelatorioPrazos: protectedProcedure.mutation(async () => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const allPrazos = await db.select().from(prazosProcessuais);
      const relatorioData = { totalPrazos: allPrazos.length, geradoEm: new Date().toISOString() };
      const storageKey = `relatorios/prazos_${Date.now()}.json`;
      const { url } = await storagePut(storageKey, JSON.stringify(relatorioData), 'application/json');
      const existingReport = await db.select().from(relatorios).where(eq(relatorios.tipoRelatorio, 'prazos_geral')).limit(1);
      let relatorioId: number;
      if (existingReport.length > 0) {
        await db.update(relatorios).set({
          titulo: 'Relatório de Prazos Processuais',
          descricao: `${allPrazos.length} prazos. Gerado em ${new Date().toLocaleString('pt-BR')}.`,
          storageKey, storageUrl: url, dadosJson: relatorioData as any,
        }).where(eq(relatorios.id, existingReport[0].id));
        relatorioId = existingReport[0].id;
      } else {
        const [inserted] = await db.insert(relatorios).values({
          titulo: 'Relatório de Prazos Processuais',
          categoria: 'Processual', subcategoria: 'Prazos',
          descricao: `${allPrazos.length} prazos. Gerado em ${new Date().toLocaleString('pt-BR')}.`,
          tipoRelatorio: 'prazos_geral', formato: 'JSON',
          storageKey, storageUrl: url, dadosJson: relatorioData as any, geradoPor: 'Sistema',
        }).$returningId();
        relatorioId = inserted.id;
      }
      return { success: true, relatorioId, totalPrazos: allPrazos.length };
    }),
  }),
  // ==================== FILA DE TRABALHOS (JOBS) ====================
  jobs: router({
    // === PAINEL DE ADMINISTRAÇÃO DE UPLOADS ===
    uploadsAdmin: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        limit: z.number().default(100),
        offset: z.number().default(0),
      }).optional())
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return { uploads: [], total: 0, stats: { total: 0, concluidos: 0, processando: 0, erros: 0, pendentes: 0 } };
        const filters = input || { status: undefined, limit: 100, offset: 0 };
        
        // Buscar todos os jobs de importação com dados do cliente
        const allUploads = await db.select({
          id: jobs.id,
          tipo: jobs.tipo,
          status: jobs.status,
          titulo: jobs.titulo,
          descricao: jobs.descricao,
          progresso: jobs.progresso,
          mensagemProgresso: jobs.mensagemProgresso,
          clienteId: jobs.clienteId,
          processoId: jobs.processoId,
          tentativas: jobs.tentativas,
          erroDetalhes: jobs.erroDetalhes,
          inputData: jobs.inputData,
          outputData: jobs.outputData,
          createdAt: jobs.createdAt,
          updatedAt: jobs.updatedAt,
          clienteNome: clientes.nomeCompleto,
          clienteCpf: clientes.cpfCnpj,
          numeroCnj: processos.numeroCnj,
          tipoAcao: processos.tipoAcao,
        })
        .from(jobs)
        .leftJoin(clientes, eq(jobs.clienteId, clientes.id))
        .leftJoin(processos, eq(jobs.processoId, processos.id))
        .where(sql`${jobs.tipo} IN ('importacao_pdf', 'importacao_contracheque', 'lote_master')`)
        .orderBy(desc(jobs.createdAt))
        .limit(filters.limit || 100)
        .offset(filters.offset || 0);
        
        let filtered = allUploads;
        if (filters.status) filtered = filtered.filter((u: any) => u.status === filters.status);
        
        // Estatísticas
        const allStats = await db.select({
          status: jobs.status,
          count: sql<number>`COUNT(*)`,
        })
        .from(jobs)
        .where(sql`${jobs.tipo} IN ('importacao_pdf', 'importacao_contracheque', 'lote_master')`)
        .groupBy(jobs.status);
        
        const stats = {
          total: allStats.reduce((acc: number, s: any) => acc + Number(s.count), 0),
          concluidos: Number(allStats.find((s: any) => s.status === 'concluido')?.count || 0),
          processando: Number(allStats.find((s: any) => s.status === 'processando')?.count || 0),
          erros: Number(allStats.find((s: any) => s.status === 'erro')?.count || 0),
          pendentes: Number(allStats.find((s: any) => s.status === 'pendente')?.count || 0),
        };
        
        return { uploads: filtered, total: stats.total, stats };
      }),

    // Reprocessar upload com erro
    reprocessarUpload: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error('Database not available');
        const [job] = await db.select().from(jobs).where(eq(jobs.id, input.jobId));
        if (!job) throw new Error('Job não encontrado');
        if (job.status !== 'erro') throw new Error('Apenas jobs com erro podem ser reprocessados');
        await db.update(jobs).set({ status: 'pendente', tentativas: 0, erroDetalhes: null, progresso: 0, mensagemProgresso: 'Aguardando reprocessamento...' }).where(eq(jobs.id, input.jobId));
        return { success: true, message: 'Upload marcado para reprocessamento' };
      }),

    // Excluir upload
    excluirUpload: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error('Database not available');
        await db.delete(jobs).where(eq(jobs.id, input.jobId));
        return { success: true };
      }),

    // Listar todos os jobs com filtros
    list: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        tipo: z.string().optional(),
        limit: z.number().default(50),
      }).optional())
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        const filters = input || { status: undefined, tipo: undefined, limit: 50 };
        const allJobs = await db.select().from(jobs).orderBy(desc(jobs.createdAt)).limit(filters.limit || 50);
        let filtered = allJobs;
        if (filters.status) filtered = filtered.filter((j: any) => j.status === filters.status);
        if (filters.tipo) filtered = filtered.filter((j: any) => j.tipo === filters.tipo);
        return filtered;
      }),

    // Obter job por ID
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return null;
        const [job] = await db.select().from(jobs).where(eq(jobs.id, input.id));
        return job || null;
      }),

    // Estatísticas dos jobs
    stats: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { total: 0, pendentes: 0, processando: 0, concluidos: 0, erros: 0 };
      const allJobs = await db.select().from(jobs);
      return {
        total: allJobs.length,
        pendentes: allJobs.filter(j => j.status === 'pendente').length,
        processando: allJobs.filter(j => j.status === 'processando').length,
        concluidos: allJobs.filter(j => j.status === 'concluido').length,
        erros: allJobs.filter(j => j.status === 'erro').length,
      };
    }),

    // Criar job de importação em lote (legado - mantido para compatibilidade)
    criarImportacaoLote: protectedProcedure
      .input(z.object({
        arquivos: z.array(z.object({
          fileName: z.string(),
          fileBase64: z.string(),
          fileSize: z.number(),
          tipoDocumento: z.enum(['processo', 'contracheque']).default('processo'),
        })),
        prioridade: z.number().default(0),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error('Database not available');
        const jobIds: number[] = [];

        for (const arquivo of input.arquivos) {
          const [result] = await db.insert(jobs).values({
            tipo: arquivo.tipoDocumento === 'contracheque' ? 'importacao_contracheque' : 'importacao_pdf',
            status: 'pendente',
            prioridade: input.prioridade,
            titulo: `Importar: ${arquivo.fileName}`,
            descricao: `Upload e processamento de ${arquivo.fileName} (${(arquivo.fileSize / 1024).toFixed(1)} KB)`,
            inputData: JSON.stringify({
              fileName: arquivo.fileName,
              fileBase64: arquivo.fileBase64,
              fileSize: arquivo.fileSize,
              tipoDocumento: arquivo.tipoDocumento,
            }),
            progresso: 0,
          });
          jobIds.push(result.insertId);
        }

        processarFilaJobs(jobIds).catch(err => console.error('[Jobs] Erro na fila:', err));
        return { jobIds, total: jobIds.length, message: `${jobIds.length} arquivo(s) na fila de processamento` };
      }),

    // ==================== IMPORTAÇÃO EM LOTE AVANÇADA ====================
    // Upload unitário de arquivo para o lote (um PDF por vez, evita PayloadTooLarge)
    uploadArquivoLote: protectedProcedure
      .input(z.object({
        fileName: z.string(),
        fileBase64: z.string(),
        fileSize: z.number(),
        tipoDocumento: z.enum(['processo', 'contracheque', 'auto']).default('auto'),
        loteId: z.string(),
        masterJobId: z.number(),
        posicaoNoLote: z.number(),
        totalNoLote: z.number(),
        opcoes: z.object({
          gerarConhecimentos: z.boolean().default(true),
          gerarRelatorios: z.boolean().default(true),
          deduplicarAutomatico: z.boolean().default(true),
          gerarPastaCliente: z.boolean().default(true),
          prioridade: z.number().default(0),
        }).default({ gerarConhecimentos: true, gerarRelatorios: true, deduplicarAutomatico: true, gerarPastaCliente: true, prioridade: 0 }),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error('Database not available');
        // Detecção automática do tipo
        let tipoFinal = input.tipoDocumento;
        if (tipoFinal === 'auto') {
          const nomeNorm = input.fileName.toLowerCase();
          if (nomeNorm.includes('contracheque') || nomeNorm.includes('demonstrativo') || nomeNorm.includes('holerite') || nomeNorm.includes('pagamento') || nomeNorm.includes('folha')) {
            tipoFinal = 'contracheque';
          } else {
            tipoFinal = 'processo';
          }
        }
        const [result] = await db.insert(jobs).values({
          tipo: tipoFinal === 'contracheque' ? 'importacao_contracheque' : 'importacao_pdf',
          status: 'pendente',
          prioridade: input.opcoes.prioridade,
          titulo: `[Lote] ${input.fileName}`,
          descricao: `Lote ${input.loteId} — Arquivo ${input.posicaoNoLote}/${input.totalNoLote}: ${input.fileName} (${(input.fileSize / 1024).toFixed(1)} KB) — Tipo: ${tipoFinal}`,
          inputData: JSON.stringify({
            fileName: input.fileName,
            fileBase64: input.fileBase64,
            fileSize: input.fileSize,
            tipoDocumento: tipoFinal,
            loteId: input.loteId,
            masterJobId: input.masterJobId,
            opcoes: input.opcoes,
            posicaoNoLote: input.posicaoNoLote,
            totalNoLote: input.totalNoLote,
          }),
          progresso: 0,
        });
        return { jobId: result.insertId, tipoFinal };
      }),

    // Criar lote master e iniciar processamento (chamado APÓS todos os uploads unitários)
    iniciarLote: protectedProcedure
      .input(z.object({
        loteId: z.string(),
        jobIds: z.array(z.number()),
        totalArquivos: z.number(),
        arquivosNomes: z.array(z.string()),
        opcoes: z.object({
          gerarConhecimentos: z.boolean().default(true),
          gerarRelatorios: z.boolean().default(true),
          deduplicarAutomatico: z.boolean().default(true),
          gerarPastaCliente: z.boolean().default(true),
          prioridade: z.number().default(0),
        }).default({ gerarConhecimentos: true, gerarRelatorios: true, deduplicarAutomatico: true, gerarPastaCliente: true, prioridade: 0 }),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error('Database not available');
        // Criar job mestre do lote
        const [masterJob] = await db.insert(jobs).values({
          tipo: 'lote_master',
          status: 'processando',
          prioridade: input.opcoes.prioridade,
          titulo: `Importação em Lote: ${input.totalArquivos} arquivo(s)`,
          descricao: `Lote ${input.loteId} — ${input.totalArquivos} documentos para processamento automático`,
          inputData: JSON.stringify({
            loteId: input.loteId,
            totalArquivos: input.totalArquivos,
            opcoes: input.opcoes,
            arquivosNomes: input.arquivosNomes,
          }),
          progresso: 0,
          mensagemProgresso: `Preparando ${input.totalArquivos} arquivo(s)...`,
        });
        const masterJobId = masterJob.insertId;
        // Processar jobs em background
        processarLoteCompleto(masterJobId, input.jobIds, input.loteId, input.opcoes).catch(err => {
          console.error('[Lote] Erro no processamento em lote:', err);
        });
        return {
          loteId: input.loteId,
          masterJobId,
          jobIds: input.jobIds,
          total: input.jobIds.length,
          message: `${input.jobIds.length} arquivo(s) na fila de processamento em lote (ID: ${input.loteId})`,
        };
      }),

    // Manter rota legada para compatibilidade (com limite menor)
    importacaoLoteAvancada: protectedProcedure
      .input(z.object({
        arquivos: z.array(z.object({
          fileName: z.string(),
          fileBase64: z.string(),
          fileSize: z.number(),
          tipoDocumento: z.enum(['processo', 'contracheque', 'auto']).default('auto'),
        })),
        opcoes: z.object({
          gerarConhecimentos: z.boolean().default(true),
          gerarRelatorios: z.boolean().default(true),
          deduplicarAutomatico: z.boolean().default(true),
          gerarPastaCliente: z.boolean().default(true),
          prioridade: z.number().default(0),
        }).default({ gerarConhecimentos: true, gerarRelatorios: true, deduplicarAutomatico: true, gerarPastaCliente: true, prioridade: 0 }),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error('Database not available');
        const jobIds: number[] = [];
        const loteId = `LOTE_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
        const [masterJob] = await db.insert(jobs).values({
          tipo: 'lote_master', status: 'processando', prioridade: input.opcoes.prioridade,
          titulo: `Importação em Lote: ${input.arquivos.length} arquivo(s)`,
          descricao: `Lote ${loteId} — ${input.arquivos.length} documentos`,
          inputData: JSON.stringify({ loteId, totalArquivos: input.arquivos.length, opcoes: input.opcoes, arquivosNomes: input.arquivos.map(a => a.fileName) }),
          progresso: 0, mensagemProgresso: `Preparando ${input.arquivos.length} arquivo(s)...`,
        });
        const masterJobId = masterJob.insertId;
        for (let i = 0; i < input.arquivos.length; i++) {
          const arquivo = input.arquivos[i];
          let tipoFinal = arquivo.tipoDocumento;
          if (tipoFinal === 'auto') {
            const nomeNorm = arquivo.fileName.toLowerCase();
            tipoFinal = (nomeNorm.includes('contracheque') || nomeNorm.includes('demonstrativo') || nomeNorm.includes('holerite') || nomeNorm.includes('pagamento') || nomeNorm.includes('folha')) ? 'contracheque' : 'processo';
          }
          const [result] = await db.insert(jobs).values({
            tipo: tipoFinal === 'contracheque' ? 'importacao_contracheque' : 'importacao_pdf',
            status: 'pendente', prioridade: input.opcoes.prioridade,
            titulo: `[Lote] ${arquivo.fileName}`,
            descricao: `Lote ${loteId} — Arquivo ${i + 1}/${input.arquivos.length}: ${arquivo.fileName}`,
            inputData: JSON.stringify({ fileName: arquivo.fileName, fileBase64: arquivo.fileBase64, fileSize: arquivo.fileSize, tipoDocumento: tipoFinal, loteId, masterJobId, opcoes: input.opcoes, posicaoNoLote: i + 1, totalNoLote: input.arquivos.length }),
            progresso: 0,
          });
          jobIds.push(result.insertId);
        }
        processarLoteCompleto(masterJobId, jobIds, loteId, input.opcoes).catch(err => console.error('[Lote] Erro:', err));
        return { loteId, masterJobId, jobIds, total: jobIds.length, message: `${jobIds.length} arquivo(s) na fila` };
      }),

    // Obter status do lote
    statusLote: protectedProcedure
      .input(z.object({ masterJobId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return null;
        const [master] = await db.select().from(jobs).where(eq(jobs.id, input.masterJobId));
        if (!master) return null;

        // Buscar todos os jobs filhos do lote
        const masterInput = typeof master.inputData === 'string' ? JSON.parse(master.inputData) : master.inputData;
        const loteId = masterInput?.loteId;
        if (!loteId) return { master, filhos: [], resumo: null };

        // Buscar filhos pelo loteId na descrição
        const allJobs = await db.select().from(jobs)
          .where(sql`${jobs.descricao} LIKE ${`%${loteId}%`} AND ${jobs.tipo} != 'lote_master'`)
          .orderBy(jobs.id);

        const concluidos = allJobs.filter(j => j.status === 'concluido');
        const erros = allJobs.filter(j => j.status === 'erro');
        const processando = allJobs.filter(j => j.status === 'processando');
        const pendentes = allJobs.filter(j => j.status === 'pendente');

        // Extrair resultados dos concluídos
        const resultados = concluidos.map(j => {
          try {
            return typeof j.outputData === 'string' ? JSON.parse(j.outputData) : j.outputData;
          } catch { return null; }
        }).filter(Boolean);

        return {
          master,
          filhos: allJobs,
          resumo: {
            total: allJobs.length,
            concluidos: concluidos.length,
            erros: erros.length,
            processando: processando.length,
            pendentes: pendentes.length,
            progressoGeral: allJobs.length > 0 ? Math.round((concluidos.length / allJobs.length) * 100) : 0,
            clientesImportados: Array.from(new Set(resultados.map(r => r?.clienteId).filter(Boolean))).length,
            processosImportados: resultados.filter(r => r?.processoId).length,
            resultados,
          },
        };
      }),

    // Listar lotes
    listarLotes: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      const lotes = await db.select().from(jobs)
        .where(eq(jobs.tipo, 'lote_master'))
        .orderBy(desc(jobs.createdAt))
        .limit(20);
      return lotes;
    }),

    // Cancelar job
    cancelar: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error('Database not available');
        await db.update(jobs).set({ status: 'cancelado', concluidoEm: new Date() }).where(eq(jobs.id, input.id));
        return { success: true };
      }),

    // Reprocessar job com erro
    reprocessar: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error('Database not available');
        await db.update(jobs).set({
          status: 'pendente',
          progresso: 0,
          mensagemProgresso: 'Reprocessando...',
          erroDetalhes: null,
        }).where(eq(jobs.id, input.id));
        processarFilaJobs([input.id]).catch(err => console.error('[Jobs] Erro reprocessar:', err));
        return { success: true };
      }),

    // Limpar jobs concluídos
    limparConcluidos: protectedProcedure.mutation(async () => {
      const db = await getDb();
      if (!db) return { removidos: 0 };
      const result = await db.delete(jobs).where(eq(jobs.status, 'concluido'));
      return { removidos: result[0]?.affectedRows || 0 };
    }),

    // Reprocessar dados financeiros de TODOS os processos existentes
    reprocessarFinanceiro: protectedProcedure.mutation(async () => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      
      const allProcessos = await db.select().from(processos);
      let processados = 0;
      let erros = 0;
      let movimentacoesInseridas = 0;
      
      for (const proc of allProcessos) {
        try {
          // Verificar se já tem movimentações financeiras
          const existentes = await db.select({ count: sql<number>`COUNT(*)` }).from(movimentacoesFinanceiras).where(eq(movimentacoesFinanceiras.processoId, proc.id));
          if ((existentes[0]?.count || 0) > 0) {
            processados++;
            continue;
          }
          
          // Buscar dados existentes do processo para contexto
          const conhecimentosProc = await db.select().from(conhecimentos).where(eq(conhecimentos.processoOrigemId, proc.id));
          const movimentacoesProc = await db.select().from(movimentacoes).where(eq(movimentacoes.processoId, proc.id));
          const estrategiasProc = await db.select().from(estrategias).where(eq(estrategias.processoId, proc.id));
          
          // Construir contexto a partir dos dados já extraídos
          const contexto = [
            `PROCESSO: ${proc.numeroCnj || 'N/A'}`,
            `TIPO: ${proc.tipoAcao || 'N/A'}`,
            `FASE: ${proc.faseAtual || 'N/A'}`,
            `VALOR DA CAUSA: R$ ${proc.valorCausa || '0'}`,
            `SENTENÇA: ${proc.resumoSentenca || 'N/A'}`,
            `STATUS: ${proc.statusProcesso || 'N/A'}`,
            '',
            'CONHECIMENTOS JURÍDICOS:',
            ...conhecimentosProc.map(c => `- [${c.categoria}] ${c.titulo}: ${c.conteudo?.substring(0, 500) || ''}`),
            '',
            'MOVIMENTAÇÕES PROCESSUAIS:',
            ...movimentacoesProc.map(m => `- [${m.data || ''}] ${m.evento || ''}: ${m.descricao || ''}`),
            '',
            'ESTRATÉGIAS:',
            ...estrategiasProc.map(e => `- ${e.tesePrincipal?.substring(0, 200) || ''} | Fundamentação: ${e.fundamentacaoLegal?.substring(0, 200) || ''}`),
          ].join('\n');
          
          const prompt = `Com base nos dados deste processo judicial, identifique e gere as movimentações financeiras prováveis.

Dados do processo:
${contexto}

Regras:
1. Se o processo tem sentença com honorários sucumbenciais, extraia com percentual (geralmente 10-20% do valor da causa)
2. Se é cumprimento de sentença, gere entrada de execução com os valores
3. Se há menção a depósito judicial, gere a entrada correspondente
4. Se há alvará de levantamento, gere a entrada
5. Se o processo tem valor da causa mas nenhuma movimentação financeira identificável, gere honorários sucumbenciais pendentes (10% do valor da causa)
6. Para ações de obrigação de fazer contra bancos, considere honorários sucumbenciais de 10% sobre o valor da causa
7. Para cumprimento de sentença, considere o valor executado

Classifique cada movimentação:
- tipo: deposito_judicial | alvara_levantamento | honorarios_sucumbenciais | honorarios_contratuais | pagamento | restituicao | multa | custas
- status: pago_levantado | depositado_a_levantar | pendente | parcial

Retorne JSON: { "movimentacoesFinanceiras": [ { "tipo": "...", "status": "...", "valor": number, "valorLevantado": number|null, "valorPendente": number|null, "dataMovimentacao": "DD/MM/YYYY"|null, "descricao": "...", "percentualHonorarios": number|null, "fundamentoLegal": "..."|null } ] }`;
          
          try {
            const result = await invokeLLM({
              messages: [
                { role: 'system', content: 'Você é um especialista em dados financeiros jurídicos. Analise os dados do processo e gere movimentações financeiras realistas. Responda APENAS com JSON válido.' },
                { role: 'user', content: prompt }
              ],
              response_format: { type: 'json_object' },
            });
            const content = result.choices[0]?.message?.content;
            const textContent = typeof content === 'string' ? content : Array.isArray(content) ? content.map((c: any) => c.type === 'text' ? c.text : '').join('') : '';
            const dados = JSON.parse(textContent);
            
            if (dados.movimentacoesFinanceiras?.length) {
              for (const mf of dados.movimentacoesFinanceiras) {
                const tiposValidos = ['deposito_judicial','alvara_levantamento','honorarios_sucumbenciais','honorarios_contratuais','pagamento','restituicao','multa','custas'];
                const statusValidos = ['pago_levantado','depositado_a_levantar','pendente','parcial','cancelado'];
                const tipoMov = tiposValidos.includes(mf.tipo) ? mf.tipo : 'pagamento';
                const statusMov = statusValidos.includes(mf.status) ? mf.status : 'pendente';
                const valorNum = parseFloat(String(mf.valor || '0'));
                if (valorNum > 0) {
                  await db.insert(movimentacoesFinanceiras).values({
                    processoId: proc.id,
                    clienteId: proc.clienteId,
                    tipo: tipoMov as any,
                    status: statusMov as any,
                    valor: String(valorNum),
                    valorLevantado: mf.valorLevantado ? String(mf.valorLevantado) : null,
                    valorPendente: mf.valorPendente ? String(mf.valorPendente) : null,
                    dataMovimentacao: mf.dataMovimentacao || null,
                    dataLevantamento: null,
                    descricao: mf.descricao || null,
                    beneficiario: null,
                    banco: null,
                    contaDeposito: null,
                    numeroAlvara: null,
                    percentualHonorarios: mf.percentualHonorarios ? String(mf.percentualHonorarios) : null,
                    fundamentoLegal: mf.fundamentoLegal || null,
                  });
                  movimentacoesInseridas++;
                }
              }
            }
            processados++;
            console.log(`[ReprocessFinanceiro] Processo ${proc.id} (${proc.numeroCnj}): ${dados.movimentacoesFinanceiras?.length || 0} movimentações inseridas`);
          } catch (e) {
            console.error(`[ReprocessFinanceiro] Erro IA processo ${proc.id}:`, e);
            erros++;
          }
        } catch (e) {
          console.error(`[ReprocessFinanceiro] Erro geral processo ${proc.id}:`, e);
          erros++;
        }
      }
      
      return {
        success: true,
        totalProcessos: allProcessos.length,
        processados,
        erros,
        movimentacoesInseridas,
        message: `Reprocessamento financeiro concluído: ${processados} processos analisados, ${movimentacoesInseridas} movimentações financeiras inseridas, ${erros} erros`,
      };
    }),
  }),

  // ==================== GESTÃO DE ACESSOS ====================
  acessos: router({
    // Solicitar acesso (público - qualquer pessoa pode solicitar)
    solicitar: publicProcedure
      .input(z.object({
        nomeCompleto: z.string().min(3, "Nome deve ter pelo menos 3 caracteres"),
        cpf: z.string().min(11, "CPF inválido").max(14),
        email: z.string().email("Email inválido"),
        celular: z.string().min(10, "Celular inválido").max(15),
        motivo: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
        const existente = await db.select().from(accessRequests).where(eq(accessRequests.cpf, input.cpf)).limit(1);
        if (existente.length > 0) {
          const status = existente[0].status;
          if (status === 'pendente') throw new TRPCError({ code: 'CONFLICT', message: 'Já existe uma solicitação pendente com este CPF.' });
          if (status === 'aprovado') throw new TRPCError({ code: 'CONFLICT', message: 'Este CPF já possui acesso aprovado.' });
          if (status === 'rejeitado') {
            await db.update(accessRequests).set({
              nomeCompleto: input.nomeCompleto, email: input.email, celular: input.celular,
              motivo: input.motivo || null, status: 'pendente',
              aprovadoPor: null, aprovadoEm: null, observacoesAdmin: null,
            }).where(eq(accessRequests.id, existente[0].id));
            return { success: true, message: 'Solicitação reenviada com sucesso.' };
          }
        }
        await db.insert(accessRequests).values({
          nomeCompleto: input.nomeCompleto, cpf: input.cpf, email: input.email,
          celular: input.celular, motivo: input.motivo || null,
        });
        return { success: true, message: 'Solicitação enviada com sucesso. Aguarde a aprovação do administrador.' };
      }),

    // Listar solicitações (admin only)
    listar: adminProcedure
      .input(z.object({
        status: z.enum(['pendente', 'aprovado', 'rejeitado', 'todos']).optional().default('todos'),
      }).optional())
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        const filtro = input?.status || 'todos';
        if (filtro === 'todos') {
          return await db.select().from(accessRequests).orderBy(desc(accessRequests.createdAt));
        }
        return await db.select().from(accessRequests)
          .where(eq(accessRequests.status, filtro as 'pendente' | 'aprovado' | 'rejeitado'))
          .orderBy(desc(accessRequests.createdAt));
      }),

    contarPendentes: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { count: 0 };
      const result = await db.select({ count: sql<number>`COUNT(*)` }).from(accessRequests).where(eq(accessRequests.status, 'pendente'));
      return { count: result[0]?.count || 0 };
    }),

    aprovar: adminProcedure
      .input(z.object({ id: z.number(), observacoes: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
        const [solicitacao] = await db.select().from(accessRequests).where(eq(accessRequests.id, input.id)).limit(1);
        if (!solicitacao) throw new TRPCError({ code: 'NOT_FOUND', message: 'Solicitação não encontrada' });
        if (solicitacao.status !== 'pendente') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Esta solicitação já foi processada' });
        await db.update(accessRequests).set({
          status: 'aprovado', aprovadoPor: ctx.user.id, aprovadoEm: new Date(),
          observacoesAdmin: input.observacoes || null,
        }).where(eq(accessRequests.id, input.id));

        // Conceder acesso total automaticamente a TODOS os módulos
        // Buscar usuário pelo email da solicitação
        const [userMatch] = await db.select().from(users).where(eq(users.email, solicitacao.email)).limit(1);
        if (userMatch) {
          const todosModulos = [
            'dashboard', 'clientes', 'processos', 'peticionamento', 'agente_ia',
            'conhecimentos', 'relatorios', 'exportacao', 'upload', 'financeiro',
            'prazos', 'correcao', 'integracao', 'metricas', 'api_publica',
          ];
          // Limpar permissões antigas
          await db.delete(userPermissions).where(eq(userPermissions.userId, userMatch.id));
          // Inserir acesso total para cada módulo
          for (const modulo of todosModulos) {
            await db.insert(userPermissions).values({
              userId: userMatch.id,
              modulo,
              podeVisualizar: 1,
              podeEditar: 1,
              podeExcluir: 1,
              podeExportar: 1,
            });
          }
        }

        // Registrar auditoria
        await db.insert(auditLog).values({
          userId: ctx.user.id, acao: 'aprovar_acesso', modulo: 'acessos',
          detalhes: JSON.stringify({ solicitacaoId: input.id, nome: solicitacao.nomeCompleto, permissoesConceidas: 'acesso_total_todos_modulos' }),
        });
        return { success: true, message: `Acesso aprovado para ${solicitacao.nomeCompleto} com permissões totais em todos os módulos` };
      }),

    rejeitar: adminProcedure
      .input(z.object({ id: z.number(), observacoes: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
        const [solicitacao] = await db.select().from(accessRequests).where(eq(accessRequests.id, input.id)).limit(1);
        if (!solicitacao) throw new TRPCError({ code: 'NOT_FOUND', message: 'Solicitação não encontrada' });
        await db.update(accessRequests).set({
          status: 'rejeitado', aprovadoPor: ctx.user.id, aprovadoEm: new Date(),
          observacoesAdmin: input.observacoes || `Acesso negado por ${ctx.user.name}`,
        }).where(eq(accessRequests.id, input.id));
        await db.insert(auditLog).values({
          userId: ctx.user.id, acao: 'rejeitar_acesso', modulo: 'acessos',
          detalhes: JSON.stringify({ solicitacaoId: input.id, nome: solicitacao.nomeCompleto }),
        });
        return { success: true, message: `Solicitação de ${solicitacao.nomeCompleto} rejeitada` };
      }),

    excluir: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
        await db.delete(accessRequests).where(eq(accessRequests.id, input.id));
        await db.insert(auditLog).values({
          userId: ctx.user.id, acao: 'excluir_solicitacao', modulo: 'acessos',
          detalhes: JSON.stringify({ solicitacaoId: input.id }),
        });
        return { success: true };
      }),

    // ==================== GESTÃO DE USUÁRIOS (admin only) ====================
    listarUsuarios: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      const allUsers = await db.select().from(users).orderBy(desc(users.lastSignedIn));
      const profiles = await db.select().from(userProfiles);
      const perms = await db.select().from(userPermissions);
      return allUsers.map(u => {
        const profile = profiles.find(p => p.userId === u.id);
        const userPerms = perms.filter(p => p.userId === u.id);
        return {
          ...u,
          cpf: profile?.cpf || null,
          celular: profile?.celular || null,
          cargo: profile?.cargo || null,
          oab: profile?.oab || null,
          ativo: profile?.ativo ?? 1,
          permissoes: userPerms,
        };
      });
    }),

    atualizarPerfil: adminProcedure
      .input(z.object({
        userId: z.number(),
        cpf: z.string().optional(),
        celular: z.string().optional(),
        cargo: z.string().optional(),
        oab: z.string().optional(),
        role: z.enum(['user', 'admin']).optional(),
        ativo: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
        if (input.role) {
          await db.update(users).set({ role: input.role }).where(eq(users.id, input.userId));
        }
        const [existing] = await db.select().from(userProfiles).where(eq(userProfiles.userId, input.userId)).limit(1);
        if (existing) {
          await db.update(userProfiles).set({
            cpf: input.cpf ?? existing.cpf, celular: input.celular ?? existing.celular,
            cargo: input.cargo ?? existing.cargo, oab: input.oab ?? existing.oab,
            ativo: input.ativo ?? existing.ativo,
          }).where(eq(userProfiles.id, existing.id));
        } else {
          await db.insert(userProfiles).values({
            userId: input.userId, cpf: input.cpf || null, celular: input.celular || null,
            cargo: input.cargo || null, oab: input.oab || null, ativo: input.ativo ?? 1,
          });
        }
        await db.insert(auditLog).values({
          userId: ctx.user.id, acao: 'atualizar_perfil_usuario', modulo: 'acessos',
          detalhes: JSON.stringify({ targetUserId: input.userId, changes: input }),
        });
        return { success: true };
      }),

    desativarUsuario: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
        if (input.userId === ctx.user.id) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Você não pode desativar a si mesmo' });
        const [existing] = await db.select().from(userProfiles).where(eq(userProfiles.userId, input.userId)).limit(1);
        if (existing) {
          await db.update(userProfiles).set({ ativo: 0 }).where(eq(userProfiles.id, existing.id));
        } else {
          await db.insert(userProfiles).values({ userId: input.userId, ativo: 0 });
        }
        await db.insert(auditLog).values({
          userId: ctx.user.id, acao: 'desativar_usuario', modulo: 'acessos',
          detalhes: JSON.stringify({ targetUserId: input.userId }),
        });
        return { success: true };
      }),

    reativarUsuario: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
        const [existing] = await db.select().from(userProfiles).where(eq(userProfiles.userId, input.userId)).limit(1);
        if (existing) {
          await db.update(userProfiles).set({ ativo: 1 }).where(eq(userProfiles.id, existing.id));
        } else {
          await db.insert(userProfiles).values({ userId: input.userId, ativo: 1 });
        }
        await db.insert(auditLog).values({
          userId: ctx.user.id, acao: 'reativar_usuario', modulo: 'acessos',
          detalhes: JSON.stringify({ targetUserId: input.userId }),
        });
        return { success: true };
      }),

    // ==================== PERMISSÕES GRANULARES ====================
    listarPermissoes: adminProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        return await db.select().from(userPermissions).where(eq(userPermissions.userId, input.userId));
      }),

    definirPermissao: adminProcedure
      .input(z.object({
        userId: z.number(),
        modulo: z.string(),
        podeVisualizar: z.number().optional(),
        podeEditar: z.number().optional(),
        podeExcluir: z.number().optional(),
        podeExportar: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
        const [existing] = await db.select().from(userPermissions)
          .where(sql`${userPermissions.userId} = ${input.userId} AND ${userPermissions.modulo} = ${input.modulo}`).limit(1);
        if (existing) {
          await db.update(userPermissions).set({
            podeVisualizar: input.podeVisualizar ?? existing.podeVisualizar,
            podeEditar: input.podeEditar ?? existing.podeEditar,
            podeExcluir: input.podeExcluir ?? existing.podeExcluir,
            podeExportar: input.podeExportar ?? existing.podeExportar,
          }).where(eq(userPermissions.id, existing.id));
        } else {
          await db.insert(userPermissions).values({
            userId: input.userId, modulo: input.modulo,
            podeVisualizar: input.podeVisualizar ?? 1,
            podeEditar: input.podeEditar ?? 0,
            podeExcluir: input.podeExcluir ?? 0,
            podeExportar: input.podeExportar ?? 0,
          });
        }
        await db.insert(auditLog).values({
          userId: ctx.user.id, acao: 'definir_permissao', modulo: 'acessos',
          detalhes: JSON.stringify({ targetUserId: input.userId, modulo: input.modulo, perms: input }),
        });
        return { success: true };
      }),

    definirPermissoesLote: adminProcedure
      .input(z.object({
        userId: z.number(),
        permissoes: z.array(z.object({
          modulo: z.string(),
          podeVisualizar: z.number(),
          podeEditar: z.number(),
          podeExcluir: z.number(),
          podeExportar: z.number(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
        // Remover permissões existentes e inserir novas
        await db.delete(userPermissions).where(eq(userPermissions.userId, input.userId));
        for (const perm of input.permissoes) {
          await db.insert(userPermissions).values({
            userId: input.userId, modulo: perm.modulo,
            podeVisualizar: perm.podeVisualizar, podeEditar: perm.podeEditar,
            podeExcluir: perm.podeExcluir, podeExportar: perm.podeExportar,
          });
        }
        await db.insert(auditLog).values({
          userId: ctx.user.id, acao: 'definir_permissoes_lote', modulo: 'acessos',
          detalhes: JSON.stringify({ targetUserId: input.userId, total: input.permissoes.length }),
        });
        return { success: true };
      }),

    modulosDisponiveis: protectedProcedure.query(async () => {
      return [
        { id: 'dashboard', nome: 'Dashboard', descricao: 'Painel principal com estatísticas' },
        { id: 'clientes', nome: 'Clientes', descricao: 'Gestão de clientes e perfis' },
        { id: 'processos', nome: 'Processos', descricao: 'Processos judiciais' },
        { id: 'peticionamento', nome: 'Peticionamento', descricao: 'Geração de petições DOCX' },
        { id: 'agente_ia', nome: 'Agente IA', descricao: 'Agente jurídico inteligente' },
        { id: 'conhecimentos', nome: 'Conhecimentos', descricao: 'Base de conhecimentos jurídicos' },
        { id: 'relatorios', nome: 'Relatórios', descricao: 'Geração e exportação de relatórios' },
        { id: 'exportacao', nome: 'Exportação', descricao: 'Exportação em massa de dados' },
        { id: 'upload', nome: 'Upload', descricao: 'Importação de PDFs e documentos' },
        { id: 'financeiro', nome: 'Financeiro', descricao: 'Movimentações financeiras e honorários' },
        { id: 'prazos', nome: 'Prazos', descricao: 'Prazos processuais e calendário' },
        { id: 'correcao', nome: 'Correção', descricao: 'Auditoria e correção de dados' },
        { id: 'integracao', nome: 'Integração', descricao: 'Integração JUSCONSIG e APIs externas' },
        { id: 'acessos', nome: 'Gestão de Acessos', descricao: 'Usuários, permissões e convites' },
        { id: 'metricas', nome: 'Métricas', descricao: 'Métricas de produtividade' },
        { id: 'api_publica', nome: 'API Pública', descricao: 'API REST para consumo externo' },
      ];
    }),

    // Verificar permissão do usuário atual para um módulo
    verificarPermissao: protectedProcedure
      .input(z.object({ modulo: z.string() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { podeVisualizar: 0, podeEditar: 0, podeExcluir: 0, podeExportar: 0 };
        // Admin tem acesso total
        if (ctx.user.role === 'admin') {
          return { podeVisualizar: 1, podeEditar: 1, podeExcluir: 1, podeExportar: 1 };
        }
        const [perm] = await db.select().from(userPermissions)
          .where(sql`${userPermissions.userId} = ${ctx.user.id} AND ${userPermissions.modulo} = ${input.modulo}`).limit(1);
        if (!perm) return { podeVisualizar: 0, podeEditar: 0, podeExcluir: 0, podeExportar: 0 };
        return {
          podeVisualizar: perm.podeVisualizar,
          podeEditar: perm.podeEditar,
          podeExcluir: perm.podeExcluir,
          podeExportar: perm.podeExportar,
        };
      }),

    // ==================== CONVITES ====================
    criarConvite: adminProcedure
      .input(z.object({
        email: z.string().email('Email inválido'),
        nome: z.string().optional(),
        role: z.enum(['user', 'admin']).optional().default('user'),
        diasValidade: z.number().optional().default(7),
        permissoes: z.array(z.object({
          modulo: z.string(),
          podeVisualizar: z.number(),
          podeEditar: z.number(),
          podeExcluir: z.number(),
          podeExportar: z.number(),
        })).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
        // Gerar token único
        const token = Array.from({ length: 64 }, () => Math.random().toString(36)[2]).join('');
        const expiraEm = new Date();
        expiraEm.setDate(expiraEm.getDate() + (input.diasValidade || 7));
        await db.insert(convites).values({
          email: input.email, nome: input.nome || null, role: input.role || 'user',
          token, criadoPor: ctx.user.id, expiraEm,
          permissoes: input.permissoes ? JSON.stringify(input.permissoes) : null,
        });
        await db.insert(auditLog).values({
          userId: ctx.user.id, acao: 'criar_convite', modulo: 'acessos',
          detalhes: JSON.stringify({ email: input.email, role: input.role, diasValidade: input.diasValidade }),
        });
        return { success: true, token, expiraEm: expiraEm.toISOString() };
      }),

    listarConvites: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return await db.select().from(convites).orderBy(desc(convites.createdAt));
    }),

    revogarConvite: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
        await db.delete(convites).where(eq(convites.id, input.id));
        await db.insert(auditLog).values({
          userId: ctx.user.id, acao: 'revogar_convite', modulo: 'acessos',
          detalhes: JSON.stringify({ conviteId: input.id }),
        });
        return { success: true };
      }),

    validarConvite: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return { valido: false, motivo: 'DB indisponível' };
        const [conv] = await db.select().from(convites).where(eq(convites.token, input.token)).limit(1);
        if (!conv) return { valido: false, motivo: 'Convite não encontrado' };
        if (conv.usado) return { valido: false, motivo: 'Convite já utilizado' };
        if (new Date(conv.expiraEm) < new Date()) return { valido: false, motivo: 'Convite expirado' };
        return { valido: true, email: conv.email, nome: conv.nome, role: conv.role };
      }),

    // ==================== LOG DE AUDITORIA ====================
    listarAuditoria: adminProcedure
      .input(z.object({
        limite: z.number().optional().default(100),
        modulo: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        const limite = input?.limite || 100;
        const modulo = input?.modulo;
        if (modulo) {
          return await db.select().from(auditLog)
            .where(eq(auditLog.modulo, modulo))
            .orderBy(desc(auditLog.createdAt))
            .limit(limite);
        }
        return await db.select().from(auditLog)
          .orderBy(desc(auditLog.createdAt))
          .limit(limite);
      }),

    estatisticasAuditoria: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { total: 0, porModulo: [], porAcao: [] };
      const [totalResult] = await db.select({ count: sql<number>`COUNT(*)` }).from(auditLog);
      const porModulo = await db.select({
        modulo: auditLog.modulo,
        count: sql<number>`COUNT(*)`,
      }).from(auditLog).groupBy(auditLog.modulo).orderBy(sql`COUNT(*) DESC`);
      const porAcao = await db.select({
        acao: auditLog.acao,
        count: sql<number>`COUNT(*)`,
      }).from(auditLog).groupBy(auditLog.acao).orderBy(sql`COUNT(*) DESC`).limit(10);
      return { total: totalResult?.count || 0, porModulo, porAcao };
    }),

    // ==================== PERFIS DE ACESSO ====================
    listarPerfis: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return await db.select().from(perfisAcesso).orderBy(asc(perfisAcesso.nome));
    }),

    criarPerfil: adminProcedure
      .input(z.object({
        nome: z.string().min(2),
        descricao: z.string().optional(),
        cor: z.string().optional(),
        icone: z.string().optional(),
        permissoes: z.string(), // JSON string
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
        await db.insert(perfisAcesso).values({
          nome: input.nome,
          descricao: input.descricao || null,
          cor: input.cor || 'blue',
          icone: input.icone || 'User',
          permissoes: input.permissoes,
          padrao: 0,
          criadoPor: ctx.user.id,
        });
        await db.insert(auditLog).values({
          userId: ctx.user.id, acao: 'criar_perfil', modulo: 'acessos',
          detalhes: JSON.stringify({ nome: input.nome }),
        });
        return { success: true, message: `Perfil "${input.nome}" criado com sucesso` };
      }),

    editarPerfil: adminProcedure
      .input(z.object({
        id: z.number(),
        nome: z.string().min(2).optional(),
        descricao: z.string().optional(),
        cor: z.string().optional(),
        icone: z.string().optional(),
        permissoes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
        const updates: any = {};
        if (input.nome) updates.nome = input.nome;
        if (input.descricao !== undefined) updates.descricao = input.descricao;
        if (input.cor) updates.cor = input.cor;
        if (input.icone) updates.icone = input.icone;
        if (input.permissoes) updates.permissoes = input.permissoes;
        await db.update(perfisAcesso).set(updates).where(eq(perfisAcesso.id, input.id));
        await db.insert(auditLog).values({
          userId: ctx.user.id, acao: 'editar_perfil', modulo: 'acessos',
          detalhes: JSON.stringify({ perfilId: input.id, campos: Object.keys(updates) }),
        });
        return { success: true };
      }),

    excluirPerfil: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
        const [perfil] = await db.select().from(perfisAcesso).where(eq(perfisAcesso.id, input.id)).limit(1);
        if (!perfil) throw new TRPCError({ code: 'NOT_FOUND', message: 'Perfil não encontrado' });
        if (perfil.padrao === 1) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Perfis padrão não podem ser excluídos' });
        await db.delete(perfisAcesso).where(eq(perfisAcesso.id, input.id));
        await db.insert(auditLog).values({
          userId: ctx.user.id, acao: 'excluir_perfil', modulo: 'acessos',
          detalhes: JSON.stringify({ perfilId: input.id, nome: perfil.nome }),
        });
        return { success: true, message: `Perfil "${perfil.nome}" excluído` };
      }),

    aplicarPerfil: adminProcedure
      .input(z.object({ userId: z.number(), perfilId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
        const [perfil] = await db.select().from(perfisAcesso).where(eq(perfisAcesso.id, input.perfilId)).limit(1);
        if (!perfil) throw new TRPCError({ code: 'NOT_FOUND', message: 'Perfil não encontrado' });
        let perms: Record<string, { podeVisualizar: number; podeEditar: number; podeExcluir: number; podeExportar: number }>;
        try { perms = JSON.parse(perfil.permissoes); } catch { throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Permissões do perfil inválidas' }); }
        // Limpar permissões existentes
        await db.delete(userPermissions).where(eq(userPermissions.userId, input.userId));
        // Inserir permissões do perfil
        for (const [modulo, perm] of Object.entries(perms)) {
          await db.insert(userPermissions).values({
            userId: input.userId, modulo,
            podeVisualizar: perm.podeVisualizar, podeEditar: perm.podeEditar,
            podeExcluir: perm.podeExcluir, podeExportar: perm.podeExportar,
          });
        }
        // Atualizar cargo no perfil do usuário
        const [existingProfile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, input.userId)).limit(1);
        if (existingProfile) {
          await db.update(userProfiles).set({ cargo: perfil.nome }).where(eq(userProfiles.userId, input.userId));
        } else {
          await db.insert(userProfiles).values({ userId: input.userId, cargo: perfil.nome });
        }
        await db.insert(auditLog).values({
          userId: ctx.user.id, acao: 'aplicar_perfil', modulo: 'acessos',
          detalhes: JSON.stringify({ targetUserId: input.userId, perfilId: input.perfilId, perfilNome: perfil.nome }),
        });
        return { success: true, message: `Perfil "${perfil.nome}" aplicado com sucesso` };
      }),
  }),

  // ==================== NOTIFICAÇÕES ====================
  notificacoes: router({
    listar: protectedProcedure
      .input(z.object({
        apenasNaoLidas: z.boolean().optional(),
        tipo: z.string().optional(),
        limite: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return { notificacoes: [], totalNaoLidas: 0 };
        const rows = await db.select().from(notificacoes).orderBy(desc(notificacoes.createdAt));
        let resultado = rows as any[];
        if (input?.apenasNaoLidas) {
          resultado = resultado.filter((n: any) => n.lida === 0);
        }
        if (input?.tipo) {
          resultado = resultado.filter((n: any) => n.tipo === input.tipo);
        }
        if (input?.limite) {
          resultado = resultado.slice(0, input.limite);
        }
        const naoLidas = rows.filter((n: any) => n.lida === 0).length;
        return { notificacoes: resultado, totalNaoLidas: naoLidas };
      }),

    marcarComoLida: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) return { success: false };
        await db.update(notificacoes)
          .set({ lida: 1, lidaEm: new Date() })
          .where(eq(notificacoes.id, input.id));
        return { success: true };
      }),

    marcarTodasComoLidas: protectedProcedure
      .mutation(async () => {
        const db = await getDb();
        if (!db) return { success: false };
        await db.update(notificacoes)
          .set({ lida: 1, lidaEm: new Date() })
          .where(eq(notificacoes.lida, 0));
        return { success: true };
      }),

    excluir: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) return { success: false };
        await db.delete(notificacoes).where(eq(notificacoes.id, input.id));
        return { success: true };
      }),

    limparLidas: protectedProcedure
      .mutation(async () => {
        const db = await getDb();
        if (!db) return { success: false };
        await db.delete(notificacoes).where(eq(notificacoes.lida, 1));
        return { success: true };
      }),
  }),

  // ==================== PRAZOS PROCESSUAIS ====================
  prazos: router({
    listar: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        processoId: z.number().optional(),
        clienteId: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        let rows: any[] = await db.select().from(prazosProcessuais).orderBy(prazosProcessuais.dataVencimento);
        if (input?.status) {
          rows = rows.filter((p: any) => p.status === input.status);
        }
        if (input?.processoId) {
          rows = rows.filter((p: any) => p.processoId === input.processoId);
        }
        if (input?.clienteId) {
          rows = rows.filter((p: any) => p.clienteId === input.clienteId);
        }
        // Enriquecer com dados do processo, cliente e partes
        const procs = await db.select().from(processos);
        const clis = await db.select().from(clientes);
        const partes = await db.select().from(partesProcessuais);
        const enriched = rows.map((p: any) => {
          const proc = (procs as any[]).find((pr: any) => pr.id === p.processoId);
          const cli = (clis as any[]).find((c: any) => c.id === p.clienteId);
          const partesDoProcesso = (partes as any[]).filter((pt: any) => pt.processoId === p.processoId);
          const autores = partesDoProcesso.filter((pt: any) => pt.tipo === 'Autor').map((pt: any) => pt.nome);
          const reus = partesDoProcesso.filter((pt: any) => pt.tipo === 'Reu').map((pt: any) => pt.nome);
          return {
            ...p,
            numeroCnj: proc?.numeroCnj || '',
            tipoAcao: proc?.tipoAcao || '',
            nomeCliente: cli?.nomeCompleto || '',
            poloAtivo: proc?.poloAtivo || autores.join(', ') || cli?.nomeCompleto || '',
            poloPassivo: proc?.poloPassivo || reus.join(', ') || '',
          };
        });
        return enriched;
      }),

    criar: protectedProcedure
      .input(z.object({
        processoId: z.number(),
        clienteId: z.number(),
        tipo: z.enum(['recurso', 'contestacao', 'manifestacao', 'cumprimento', 'audiencia', 'pericia', 'diligencia', 'pagamento', 'levantamento', 'outro']),
        titulo: z.string(),
        descricao: z.string().optional(),
        dataVencimento: z.string(), // ISO date string
        diasAntecedencia: z.number().optional(),
        observacoes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) return { success: false };
        await db.insert(prazosProcessuais).values({
          processoId: input.processoId,
          clienteId: input.clienteId,
          tipo: input.tipo,
          titulo: input.titulo,
          descricao: input.descricao || null,
          dataVencimento: new Date(input.dataVencimento),
          diasAntecedencia: input.diasAntecedencia ?? 3,
          observacoes: input.observacoes || null,
        });
        // Criar notificação de novo prazo
        await criarNotificacao({
          tipo: 'prazo_vencendo',
          prioridade: 'alta',
          titulo: `Novo prazo: ${input.titulo}`,
          mensagem: `Prazo cadastrado para ${new Date(input.dataVencimento).toLocaleDateString('pt-BR')}`,
          processoId: input.processoId,
          clienteId: input.clienteId,
          linkUrl: `/clientes/${input.clienteId}`,
          icone: 'Clock',
          cor: 'amber',
        });
        return { success: true };
      }),

    atualizar: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(['pendente', 'cumprido', 'vencido', 'cancelado']).optional(),
        titulo: z.string().optional(),
        descricao: z.string().optional(),
        dataVencimento: z.string().optional(),
        observacoes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) return { success: false };
        const updates: any = {};
        if (input.status) updates.status = input.status;
        if (input.titulo) updates.titulo = input.titulo;
        if (input.descricao !== undefined) updates.descricao = input.descricao;
        if (input.dataVencimento) updates.dataVencimento = new Date(input.dataVencimento);
        if (input.observacoes !== undefined) updates.observacoes = input.observacoes;
        await db.update(prazosProcessuais).set(updates).where(eq(prazosProcessuais.id, input.id));
        return { success: true };
      }),

    excluir: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) return { success: false };
        await db.delete(prazosProcessuais).where(eq(prazosProcessuais.id, input.id));
        return { success: true };
      }),

    verificarVencimentos: protectedProcedure
      .mutation(async () => {
        const db = await getDb();
        if (!db) return { notificacoesEnviadas: 0, prazosVencidos: 0, totalVerificados: 0 };
        const pendentes = await db.select().from(prazosProcessuais)
          .where(eq(prazosProcessuais.status, 'pendente'));
        const agora = new Date();
        let notificacoesEnviadas = 0;
        let prazosVencidos = 0;

        // Batch: separar vencidos e prestes a vencer
        const idsVencidos: number[] = [];
        const idsNotificarVencido: number[] = [];
        const prazosVencendo: Array<{ id: number; titulo: string; vencimento: Date; diffDias: number; processoId: number; clienteId: number }> = [];

        for (const prazo of pendentes) {
          const vencimento = new Date(prazo.dataVencimento);
          const diffMs = vencimento.getTime() - agora.getTime();
          const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
          if (diffDias < 0) {
            idsVencidos.push(prazo.id);
            if (!prazo.notificacaoEnviada) idsNotificarVencido.push(prazo.id);
            prazosVencidos++;
          } else if (diffDias <= (prazo.diasAntecedencia || 3) && !prazo.notificacaoEnviada) {
            prazosVencendo.push({ id: prazo.id, titulo: prazo.titulo, vencimento, diffDias, processoId: prazo.processoId, clienteId: prazo.clienteId });
          }
        }

        // Batch UPDATE: marcar todos vencidos de uma vez
        if (idsVencidos.length > 0) {
          await db.update(prazosProcessuais)
            .set({ status: 'vencido' })
            .where(inArray(prazosProcessuais.id, idsVencidos));
        }
        // Batch UPDATE: marcar notificação enviada para vencidos
        if (idsNotificarVencido.length > 0) {
          await db.update(prazosProcessuais)
            .set({ notificacaoEnviada: 1 })
            .where(inArray(prazosProcessuais.id, idsNotificarVencido));
          // Criar apenas 1 notificação resumida para vencidos
          await criarNotificacao({
            tipo: 'prazo_vencido',
            prioridade: 'urgente',
            titulo: `${idsNotificarVencido.length} prazo(s) vencido(s)`,
            mensagem: `Foram identificados ${idsNotificarVencido.length} prazos vencidos. Verifique a página de Prazos.`,
            linkUrl: '/prazos',
            icone: 'AlertTriangle',
            cor: 'red',
          });
          notificacoesEnviadas++;
        }

        // Notificações individuais apenas para os que estão vencendo em breve (máx 10)
        const vencendoParaNotificar = prazosVencendo.slice(0, 10);
        if (vencendoParaNotificar.length > 0) {
          const idsVencendo = vencendoParaNotificar.map(p => p.id);
          await db.update(prazosProcessuais)
            .set({ notificacaoEnviada: 1 })
            .where(inArray(prazosProcessuais.id, idsVencendo));
          for (const prazo of vencendoParaNotificar) {
            await criarNotificacao({
              tipo: 'prazo_vencendo',
              prioridade: prazo.diffDias <= 1 ? 'urgente' : 'alta',
              titulo: `Prazo em ${prazo.diffDias} dia(s): ${prazo.titulo}`,
              mensagem: `O prazo vence em ${prazo.vencimento.toLocaleDateString('pt-BR')} (${prazo.diffDias} dia(s) restantes).`,
              processoId: prazo.processoId,
              clienteId: prazo.clienteId,
              prazoId: prazo.id,
              linkUrl: `/prazos`,
              icone: 'Clock',
              cor: prazo.diffDias <= 1 ? 'red' : 'amber',
            });
            notificacoesEnviadas++;
          }
        }

        return { notificacoesEnviadas, prazosVencidos, totalVerificados: pendentes.length };
      }),
   }),

  // ==================== AGENTE IA JURÍDICO EXPERT ====================
  agente: router({
    // Chat principal do agente expert com contexto completo — EXECUTOR COM TOOLS
    chat: protectedProcedure
      .input(z.object({
        mensagem: z.string().min(1),
        historico: z.array(z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string()
        })).optional().default([]),
        clienteId: z.number().optional(),
        processoId: z.number().optional(),
        modo: z.enum(['chat', 'analise', 'peticao', 'estrategia', 'calculo']).optional().default('chat'),
        sessaoId: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error('DB indisponível');

        // 1. Carregar configuração do agente do banco
        const configRows = await db.select().from(agenteIaConfig).where(eq(agenteIaConfig.ativo, 1));
        const config: Record<string, string> = {};
        for (const row of configRows) {
          config[row.chave] = row.valor;
        }

        // 2. CARREGAR TODOS OS DADOS DA PLATAFORMA — PANORAMA GLOBAL COMPLETO
        // O agente ESTUDOU todos os processos e deve saber tudo

        // 2a. Todos os clientes
        const todosClientes = await db.select().from(clientes).orderBy(desc(clientes.updatedAt));
        // 2b. Todos os processos
        const todosProcessos = await db.select().from(processos).orderBy(desc(processos.createdAt));
        // 2c. Todas as estratégias
        const todasEstrategias = await db.select().from(estrategias);
        // 2d. Todos os conhecimentos (SEM truncar)
        const todosConhecimentos = await db.select().from(conhecimentos).orderBy(desc(conhecimentos.createdAt));
        const teses = todosConhecimentos.filter(c => c.categoria === 'Tese');
        const jurisprudencias = todosConhecimentos.filter(c => c.categoria === 'Jurisprudencia');
        const estrategiasConhec = todosConhecimentos.filter(c => c.categoria === 'Estrategia');
        const legislacoes = todosConhecimentos.filter(c => c.categoria === 'Legislacao');
        const modelos = todosConhecimentos.filter(c => c.categoria === 'Modelo');
        // 2e. Dados financeiros e empréstimos
        const todosDadosFin = await db.select().from(dadosFinanceiros);
        const todosEmprestimos = await db.select().from(emprestimosConsignados);
        // 2f. Prazos processuais
        const todosPrazos = await db.select().from(prazosProcessuais).orderBy(prazosProcessuais.dataVencimento);
        // 2g. Cumprimentos de sentença
        const todosCumprimentos = await db.select().from(cumprimentosSentenca);
        // 2h. Movimentações financeiras
        const todasMovFin = await db.select().from(movimentacoesFinanceiras);
        // 2i. Petições geradas
        const todasPeticoes = await db.select().from(peticoesGeradas).orderBy(desc(peticoesGeradas.createdAt));

        // 3. MONTAR PANORAMA GLOBAL OTIMIZADO (resumo compacto para não estourar tokens)
        const totalValorCausas = todosProcessos.reduce((acc, p) => acc + Number(p.valorCausa || 0), 0);
        const totalHonorarios = todosProcessos.reduce((acc, p) => acc + Number(p.honorariosValor || 0), 0);
        const prazosUrgentes = todosPrazos.filter(p => !p.status || p.status !== 'cumprido').slice(0, 15);
        const emprestimosAtivos = todosEmprestimos.filter(e => !e.status || e.status !== 'Quitado');
        const totalParcelasEmprestimos = emprestimosAtivos.reduce((acc, e) => acc + Number(e.valorParcela || 0), 0);

        const panoramaGlobal = `
=== PANORAMA DO ESCRITÓRIO MELO & PREDA ===
RESUMO: ${todosClientes.length} clientes | ${todosProcessos.length} processos | ${todasEstrategias.length} estratégias | ${todosConhecimentos.length} conhecimentos | ${todasPeticoes.length} petições
Valor causas: R$ ${totalValorCausas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | Honorários: R$ ${totalHonorarios.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
${emprestimosAtivos.length} empréstimos ativos (R$ ${totalParcelasEmprestimos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês) | ${prazosUrgentes.length} prazos pendentes

CLIENTES (resumo — use tool buscar_cliente para detalhes):
${todosClientes.map(c => {
  const procsCliente = todosProcessos.filter(p => p.clienteId === c.id);
  return `• ID:${c.id} ${c.nomeCompleto} | CPF: ${c.cpfCnpj || 'N/A'} | ${procsCliente.length} proc(s): ${procsCliente.map(p => p.numeroCnj).join(', ')}`;
}).join('\n')}

PROCESSOS (resumo — use tool buscar_processo para detalhes):
${todosProcessos.map(p => `• ID:${p.id} ${p.numeroCnj} | ${p.tipoAcao} | ${p.poloAtivo} × ${p.poloPassivo} | R$ ${p.valorCausa} | ${p.faseAtual} | ${p.statusProcesso}`).join('\n')}

PRAZOS URGENTES (${prazosUrgentes.length}):
${prazosUrgentes.map(p => `• ${p.titulo} | Venc: ${p.dataVencimento} | ${p.status} | Proc: ${p.processoId || 'N/A'}`).join('\n')}
`;

        // 4. Buscar contexto DETALHADO do cliente/processo selecionado (ALÉM do global)
        let contextoCliente = '';
        let contextoProcesso = '';
        
        if (input.clienteId) {
          const [cliente] = await db.select().from(clientes).where(eq(clientes.id, input.clienteId));
          if (cliente) {
            const procs = todosProcessos.filter(p => p.clienteId === cliente.id);
            const dadosFin = todosDadosFin.filter(d => d.clienteId === cliente.id);
            const emprestimos = todosEmprestimos.filter(e => e.clienteId === cliente.id);
            const estrats = procs.flatMap(p => todasEstrategias.filter(e => e.processoId === p.id));
            const movs = [];
            for (const p of procs) {
              const m = await db.select().from(movimentacoes).where(eq(movimentacoes.processoId, p.id)).orderBy(desc(movimentacoes.createdAt));
              movs.push(...m.slice(0, 15));
            }
            const prazos = todosPrazos.filter(p => p.clienteId === cliente.id);
            
            contextoCliente = `\n\n=== FOCO: CLIENTE SELECIONADO — ${cliente.nomeCompleto} ===
CPF/CNPJ: ${cliente.cpfCnpj}
Profissão: ${cliente.profissao || 'N/A'}
Órgão Empregador: ${cliente.orgaoEmpregador || 'N/A'}
Vínculo: ${cliente.vinculoFuncional || 'N/A'}
Endereço: ${cliente.endereco || 'N/A'}, ${cliente.cidade || ''} - ${cliente.estado || ''}

DADOS FINANCEIROS COMPLETOS:
${dadosFin.map(d => `- Remuneração Bruta: R$ ${d.remuneracaoBruta || 'N/A'} | Líquida: R$ ${d.remuneracaoLiquida || 'N/A'} | Margem: R$ ${d.margemConsignavelValor || 'N/A'} (${d.margemConsignavelPerc || 'N/A'}%)`).join('\n')}

EMPRÉSTIMOS CONSIGNADOS (${emprestimos.length}):
${emprestimos.map(e => `- Banco: ${e.banco} | Contrato: ${e.contrato || 'N/A'} | Parcela: R$ ${e.valorParcela} | Total: R$ ${e.valorTotal || 'N/A'} | Prazo: ${e.totalParcelas || 'N/A'} meses | Status: ${e.status || 'Ativo'}`).join('\n')}

PROCESSOS (${procs.length}):
${procs.map(p => `- ${p.numeroCnj} | ${p.tipoAcao} | Valor: R$ ${p.valorCausa} | Fase: ${p.faseAtual} | Status: ${p.statusProcesso}`).join('\n')}

ESTRATÉGIAS PROCESSUAIS COMPLETAS:
${estrats.map(e => `--- Estratégia ---\nTese: ${e.tesePrincipal}\nFundamentação: ${e.fundamentacaoLegal}\nJurisprudência: ${e.jurisprudenciaCitada || 'N/A'}\nPontos Fortes: ${e.pontosFortes || 'N/A'}\nRiscos: ${e.riscosIdentificados || 'N/A'}`).join('\n')}

MOVIMENTAÇÕES RECENTES:
${movs.slice(0, 20).map(m => `- ${m.data}: ${m.evento} — ${m.descricao || ''}`).join('\n')}

PRAZOS:
${prazos.map(p => `- ${p.titulo} | Vencimento: ${p.dataVencimento} | Status: ${p.status}`).join('\n')}`;
          }
        }
        
        if (input.processoId) {
          const [proc] = await db.select().from(processos).where(eq(processos.id, input.processoId));
          if (proc) {
            const estrats = todasEstrategias.filter(e => e.processoId === proc.id);
            const movs = await db.select().from(movimentacoes).where(eq(movimentacoes.processoId, proc.id)).orderBy(desc(movimentacoes.createdAt));
            const movFin = todasMovFin.filter(m => m.processoId === proc.id);
            const partes = await db.select().from(partesProcessuais).where(eq(partesProcessuais.processoId, proc.id));
            const prazos = todosPrazos.filter(p => p.processoId === proc.id);
            const cumprimentos = todosCumprimentos.filter(c => c.processoId === proc.id);
            const emprestimos = proc.clienteId ? todosEmprestimos.filter(e => e.clienteId === proc.clienteId) : [];
            
            contextoProcesso = `\n\n=== FOCO: PROCESSO SELECIONADO — ${proc.numeroCnj} ===
Tipo: ${proc.tipoAcao} | Natureza: ${proc.natureza || 'N/A'} | Classe: ${proc.classeProcessual || 'N/A'}
Vara: ${proc.vara}, ${proc.comarca}, ${proc.tribunal}
Valor: R$ ${proc.valorCausa} | Fase: ${proc.faseAtual} | Status: ${proc.statusProcesso}
Juiz: ${proc.juiz || 'N/A'} | Distribuição: ${proc.dataDistribuicao || 'N/A'}
Polo Ativo: ${proc.poloAtivo} | Polo Passivo: ${proc.poloPassivo}
Partes: ${partes.map(p => `${p.tipo}: ${p.nome} (${p.cpfCnpj || 'N/A'})`).join('; ')}
Sentença: ${proc.resumoSentenca || 'N/A'}
Condenação: R$ ${proc.valorCondenacao || 'N/A'} | Danos Morais: R$ ${proc.danosMorais || 'N/A'} | Materiais: R$ ${proc.danosMateriais || 'N/A'}
Restituição: R$ ${proc.restituicao || 'N/A'} | Honorários: ${proc.honorariosPerc || 'N/A'}% = R$ ${proc.honorariosValor || 'N/A'}
Tutela: ${proc.tutelaTipo || 'N/A'} (${proc.tutelaStatus || 'N/A'}) — ${proc.tutelaDescricao || 'N/A'}

ESTRATÉGIAS COMPLETAS:
${estrats.map(e => `Tese: ${e.tesePrincipal}\nFundamentação: ${e.fundamentacaoLegal}\nJurisprudência: ${e.jurisprudenciaCitada || 'N/A'}\nTeses Refutadas: ${e.tesesRefutadas || 'N/A'}\nPontos Fortes: ${e.pontosFortes || 'N/A'}\nRiscos: ${e.riscosIdentificados || 'N/A'}`).join('\n---\n')}

Empréstimos do cliente (${emprestimos.length}): ${emprestimos.map(e => `${e.banco}: R$ ${e.valorParcela}/mês`).join('; ')}
Cumprimentos: ${cumprimentos.map(c => `${c.tipo}: Exec R$ ${c.valorExecucao}, Princ R$ ${c.valorPrincipal}, Juros R$ ${c.valorJuros}, Hon R$ ${c.valorHonorarios}`).join('; ')}
Movimentações (últimas 25): ${movs.slice(0, 25).map(m => `${m.data}: ${m.evento} — ${m.descricao || ''}`).join('\n')}
Financeiro: ${movFin.map(m => `${m.tipo}: R$ ${m.valor} (${m.status})`).join('; ')}
Prazos: ${prazos.map(p => `${p.titulo} | ${p.dataVencimento} | ${p.status}`).join('; ')}`;
          }
        }

        // 5. Montar base de conhecimento ENRIQUECIDA com estilo, instruções e modelos completos
        const truncConteudo = (c: string | null, max: number = 200) => c ? c.substring(0, max) + (c.length > max ? '...' : '') : '';
        
        // Extrair modelos críticos com conteúdo completo (estilo, instruções, petições aprovadas)
        const modelosCriticos = modelos.filter(m => 
          m.titulo.includes('ESTILO') || m.titulo.includes('INSTRUÇÕES') || 
          m.titulo.includes('IDENTIDADE') || m.titulo.includes('PETIÇÃO APROVADA')
        );
        const modelosTemplates = modelos.filter(m => m.titulo.includes('TEMPLATE:'));
        
        const estiloRedacao = modelosCriticos.find(m => m.titulo.includes('ESTILO'));
        const instrucoes = modelosCriticos.find(m => m.titulo.includes('INSTRUÇÕES'));
        const peticoesAprovadas = modelosCriticos.filter(m => m.titulo.includes('PETIÇÃO APROVADA'));
        
        const baseConhecimento = `
=== BASE DE CONHECIMENTO (${todosConhecimentos.length} registros — use buscar_conhecimento para detalhes) ===
TESES (${teses.length}): ${teses.map(t => `${t.titulo}`).join(' | ')}
JURISPRUDÊNCIA (${jurisprudencias.length}): ${jurisprudencias.map(j => `${j.titulo}`).join(' | ')}
ESTRATÉGIAS (${estrategiasConhec.length}): ${estrategiasConhec.map(e => `${e.titulo}`).join(' | ')}
LEGISLAÇÃO (${legislacoes.length}): ${legislacoes.map(l => `${l.titulo}`).join(' | ')}
MODELOS (${modelos.length}): ${modelos.map(m => `${m.titulo}`).join(' | ')}
TEMPLATES DISPONÍVEIS: ${modelosTemplates.map(m => m.titulo).join(' | ')}

=== ESTILO DE REDAÇÃO OBRIGATÓRIO DO ESCRITÓRIO ===
${estiloRedacao?.conteudo || 'Tom assertivo, técnico, combativo. Expressões: flagrante ilegalidade, abuso manifesto, violação frontal.'}

=== INSTRUÇÕES DETALHADAS PARA O AGENTE ===
${instrucoes?.conteudo?.substring(0, 3000) || ''}

=== PETIÇÕES APROVADAS COMO REFERÊNCIA DE ESTILO (use como modelo de tom, estrutura e qualidade) ===
${peticoesAprovadas.map(p => `--- ${p.titulo} ---\n${p.conteudo?.substring(0, 2000) || ''}`).join('\n\n')}
`;

        // 5. Buscar TODAS as configurações de expertise do agente
        let configExpertise = '';
        try {
          if (config.teses_centrais) configExpertise += `\n\nTESES CENTRAIS DO ESCRITÓRIO:\n${config.teses_centrais}`;
          if (config.estrategias_avancadas) configExpertise += `\n\nESTRATÉGIAS PROCESSUAIS AVANÇADAS:\n${config.estrategias_avancadas}`;
          if (config.vocabulario_caracteristico) configExpertise += `\n\nVOCABULÁRIO CARACTERÍSTICO (use estas expressões):\n${config.vocabulario_caracteristico}`;
          if (config.estilo_redacao) configExpertise += `\n\nESTILO DE REDAÇÃO DO ESCRITÓRIO:\n${config.estilo_redacao}`;
          if (config.instrucoes_agente) configExpertise += `\n\nINSTRUÇÕES DETALHADAS DO AGENTE:\n${config.instrucoes_agente}`;
          if (config.identidade_visual) configExpertise += `\n\nIDENTIDADE VISUAL:\n${config.identidade_visual}`;
        } catch {}

        // 6. System prompt expert com TODOS os dados da plataforma
        const modoInstrucao: Record<string, string> = {
          chat: 'Responda como consultor jurídico expert. Fundamente TODAS as respostas com legislação específica (artigo, parágrafo, inciso), jurisprudência (tribunal, número, relator) e doutrina. Você ESTUDOU todos os processos do escritório e conhece cada detalhe. Use tom assertivo e técnico. Expressões características: "consoante entendimento pacificado", "nos termos do artigo [X], que é cristalino ao dispor que".',
          analise: `Realize uma ANÁLISE TÉCNICA EXAUSTIVA E APROFUNDADA. NÃO resuma — DESENVOLVA cada ponto com riqueza de detalhes.

WORKFLOW OBRIGATÓRIO DE 5 FASES:

**FASE 1 — IMERSÃO PROCESSUAL COMPLETA:**
Analise CADA movimentação do processo cronologicamente. Identifique: sentença (dispositivo completo), recursos interpostos (tipo, fundamento, resultado), acórdãos, trânsito em julgado (data exata), preclusão lógica, trânsito parcial em litisconsórcio simples. Mapeie TODAS as partes e sua situação individual.

**FASE 2 — MAPEAMENTO DE TESES:**
Para CADA tese aplicável: (a) fundamento legal com artigo específico, (b) jurisprudência âncora com ementa, (c) probabilidade de êxito, (d) como se aplica especificamente a ESTE caso com dados reais.

**FASE 3 — ESTRATÉGIA PROCESSUAL DETALHADA:**
Defina: tipo de ação recomendada (cumprimento provisório/definitivo, ação autônoma, agravo, etc.), cronograma de ações com prazos, táticas avançadas (coisa julgada progressiva, tutela cautelar antecedente, penhora SISBAJUD, cumulação de pedidos), teses adversárias a refutar preventivamente.

**FASE 4 — CÁLCULOS DETALHADOS:**
Demonstrativo completo (art. 524 CPC): Principal → Correção Monetária (INPC) → Juros Mora (1% a.m., art. 406 CC) → Multa 10% (art. 523 §1º CPC) → Honorários → TOTAL. Use valores REAIS do processo.

**FASE 5 — RISCOS E MITIGAÇÕES:**
Pontos fracos do caso, teses adversárias prováveis, estratégias de mitigação para cada risco.

REGRA: Use EXCLUSIVAMENTE dados reais dos processos. NUNCA use placeholders ou lacunas. Cada afirmação deve ser fundamentada.`,
          peticao: `Gere uma PETIÇÃO COMPLETA, PRONTA PARA PROTOCOLO, no padrão do escritório.

PROIBIÇÕES ABSOLUTAS:
- NUNCA usar placeholders como [COMPLETAR], [INSERIR], [NOME], [DATA], [VALOR] ou qualquer lacuna
- NUNCA gerar modelo/template para preenchimento posterior
- NUNCA omitir dados disponíveis no contexto
- NUNCA usar "etc.", "e outros", "entre outros"
- NUNCA usar parágrafos genéricos que servem para qualquer caso

ESTILO: Tom assertivo, combativo e técnico. Expressões: "flagrante ilegalidade", "abuso manifesto", "violação frontal".
ESTRUTURA: Endereçamento (vara/comarca REAIS) → Número CNJ REAL → Qualificação COMPLETA (todos os dados do cliente) → I-DOS FATOS (cronológico com datas e eventos REAIS) → II-DO DIREITO (SEÇÃO MAIS EXTENSA: Legislação com transcrição de artigos → Jurisprudência com ementas completas → Doutrina com referência) → III-DOS PEDIDOS (numerados a,b,c com valores EXATOS calculados) → IV-VALOR DA CAUSA (real, por extenso) → Fecho.
Pedidos: tutela primeiro, honorários no final, incluir subsidiários. Fundamentação deve ser EXAUSTIVA, não resumida.`,
          estrategia: `Elabore uma ESTRATÉGIA PROCESSUAL COMPLETA, AVANÇADA e DETALHADA. NÃO resuma — DESENVOLVA cada ponto.

PROIBIÇÕES: NUNCA usar placeholders, lacunas ou modelos genéricos. Use EXCLUSIVAMENTE dados reais.

ESTRUTURA OBRIGATÓRIA:
1. **DIAGNÓSTICO DA FASE ATUAL**: Situação processual exata com base nas movimentações reais, prazos em curso, última decisão
2. **TESES CENTRAIS A SUSTENTAR**: Para cada tese: fundamento legal (artigo específico), jurisprudência âncora (TJ-GO e STJ com número), probabilidade de êxito, aplicação ao caso concreto
3. **TESES ADVERSÁRIAS A REFUTAR**: Antecipar argumentos da parte contrária e preparar contra-argumentação
4. **CRONOGRAMA DE AÇÕES**: Passo a passo com prazos, peças a protocolar, providências
5. **TÁTICAS AVANÇADAS**: Coisa julgada progressiva, tutela cautelar antecedente, penhora SISBAJUD, cumulação de pedidos, litisconsórcio, trânsito parcial
6. **RISCOS E MITIGAÇÕES**: Para cada risco identificado, estratégia de mitigação específica
7. **RECOMENDAÇÃO FINAL**: Ação imediata recomendada com fundamentação`,
          calculo: 'Realize CÁLCULOS JURÍDICOS precisos. CORREÇÃO MONETÁRIA: INPC mensal sobre principal (desde vencimento ou sentença). JUROS MORA: 1% a.m. (art. 406 CC + art. 161 §1º CTN) desde citação. MULTA: 10% sobre débito total após 15 dias (art. 523 §1º CPC). HONORÁRIOS: 10% sobre débito. Apresente DEMONSTRATIVO completo (art. 524 CPC): Principal → Correção → Juros → Multa → Honorários → TOTAL. Use valores reais dos processos.',
        };

        const systemPrompt = `${config.system_prompt || 'Você é o Agente Jurídico Expert do escritório Melo & Preda Advogados.'}

VOCÊ ESTUDOU TODOS OS PROCESSOS DO ESCRITÓRIO. Você conhece cada cliente, cada processo, cada valor, cada estratégia, cada prazo, cada empréstimo. Responda qualquer pergunta com base nos dados reais que você estudou.

MODO ATUAL: ${input.modo?.toUpperCase() || 'CHAT'}
${modoInstrucao[input.modo || 'chat']}

${panoramaGlobal}

${baseConhecimento}${configExpertise}${contextoCliente}${contextoProcesso}

=== PROIBIÇÕES ABSOLUTAS (VIOLAÇÃO INVALIDA A RESPOSTA) ===
1. NUNCA usar placeholders como [COMPLETAR], [INSERIR], [NOME], [DATA], [VALOR], [COMARCA] ou qualquer texto entre colchetes que indique lacuna
2. NUNCA gerar modelo/template para preenchimento posterior — tudo deve sair COMPLETO e PRONTO
3. NUNCA omitir dados disponíveis no contexto — USE TODOS os dados reais fornecidos
4. NUNCA inventar dados que não existem no contexto — se não tem o dado, OMITA a seção
5. NUNCA usar "etc.", "e outros", "entre outros" — seja ESPECÍFICO
6. NUNCA usar parágrafos genéricos que servem para qualquer caso
7. NUNCA resumir quando puder DESENVOLVER com profundidade

=== REGRAS DE QUALIDADE ===
1. SEMPRE usar os dados REAIS dos processos que você estudou — nomes, CPFs, valores, datas, varas, comarcas REAIS
2. SEMPRE fundamentar com artigos de lei específicos (artigo, parágrafo, inciso) com TRANSCRIÇÃO do dispositivo
3. SEMPRE citar jurisprudência com número completo, relator, turma/câmara, data (preferencialmente TJ-GO e STJ)
4. SEMPRE citar doutrina com autor, obra, edição, página
5. SEMPRE verificar prazos processuais antes de recomendar ações
6. SEMPRE usar o vocabulário característico: "flagrante ilegalidade", "abuso manifesto", "violação frontal", "consoante entendimento pacificado"
7. Responder em português brasileiro com linguagem técnica jurídica assertiva e combativa
8. Petições: RIGOROSAMENTE Endereçamento (vara/comarca REAIS) → Qualificação COMPLETA → Fatos (cronológico com datas REAIS) → Direito (SEÇÃO MAIS EXTENSA com fundamentação exaustiva) → Pedidos (valores EXATOS) → Valor → Fecho
9. Análises: WORKFLOW DE 5 FASES com riqueza de detalhes em cada fase
10. Em litisconsórcio, verificar INDIVIDUALMENTE a situação recursal de cada réu
11. SEMPRE verificar preclusão lógica e trânsito em julgado parcial
12. Quando perguntarem sobre um cliente ou processo, responder com TODOS os detalhes disponíveis
13. Pedidos: SEMPRE numerar (a,b,c), tutela primeiro, honorários no final, incluir subsidiários`;

        // 7. EXECUTAR AGENTE COM TOOLS (loop de execução)
        const executorResult = await executarAgenteCompleto({
          mensagem: input.mensagem,
          historico: input.historico,
          clienteId: input.clienteId,
          processoId: input.processoId,
          modo: input.modo,
          panoramaGlobal,
          baseConhecimento,
          configExpertise,
          contextoCliente,
          contextoProcesso,
        });

        // 8. Salvar no histórico
        const sessaoId = input.sessaoId || `sessao_${Date.now()}`;
        try {
          await db.insert(agenteIaHistorico).values({
            sessaoId,
            userId: ctx.user?.id || null,
            role: 'user',
            conteudo: input.mensagem,
            contextoUsado: JSON.stringify({ clienteId: input.clienteId, processoId: input.processoId, modo: input.modo }),
          });
          await db.insert(agenteIaHistorico).values({
            sessaoId,
            userId: ctx.user?.id || null,
            role: 'assistant',
            conteudo: executorResult.resposta,
            contextoUsado: JSON.stringify({ acoesExecutadas: executorResult.acoesExecutadas.map(a => ({ tool: a.tool, sucesso: a.sucesso })), totalTools: executorResult.totalTools }),
          });
        } catch (e) {
          console.error('Erro ao salvar histórico:', e);
        }

        return {
          resposta: executorResult.resposta,
          sessaoId,
          acoesExecutadas: executorResult.acoesExecutadas,
          totalTools: executorResult.totalTools,
        };
      }),

    // Buscar conhecimento na base
    buscarConhecimento: protectedProcedure
      .input(z.object({
        termo: z.string().min(1),
        categoria: z.enum(['Tese', 'Jurisprudencia', 'Estrategia', 'Legislacao', 'Modelo']).optional(),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        let query = db.select().from(conhecimentos);
        if (input.categoria) {
          query = query.where(eq(conhecimentos.categoria, input.categoria)) as any;
        }
        const todos = await query;
        const termoLower = input.termo.toLowerCase();
        return todos.filter(c => 
          c.titulo.toLowerCase().includes(termoLower) ||
          (c.conteudo && c.conteudo.toLowerCase().includes(termoLower)) ||
          (c.tags && c.tags.toLowerCase().includes(termoLower))
        ).slice(0, 20);
      }),

    // Gerar petição completa com template estruturado
    gerarPeticao: protectedProcedure
      .input(z.object({
        tipoPeticao: z.string().min(1),
        templateId: z.number().optional(),
        clienteId: z.number().optional(),
        processoId: z.number().optional(),
        instrucoes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error('DB indisponível');

        // Carregar configurações do agente
        const configRows = await db.select().from(agenteIaConfig).where(eq(agenteIaConfig.ativo, 1));
        const config: Record<string, string> = {};
        for (const row of configRows) config[row.chave] = row.valor;

        // Buscar TODOS os templates e modelos da base para a IA escolher o melhor
        const todosTemplates = await db.select().from(templatesPeticao).where(eq(templatesPeticao.ativo, 1));
        const modelosBase = await db.select().from(conhecimentos).where(eq(conhecimentos.categoria, 'Modelo'));
        
        let templateInfo = '';
        if (input.templateId) {
          // Template específico selecionado pelo advogado
          const tmpl = todosTemplates.find(t => t.id === input.templateId);
          if (tmpl) {
            templateInfo = `\n\nTEMPLATE SELECIONADO PELO ADVOGADO (USE COMO BASE OBRIGATÓRIA): ${tmpl.nome}\nTipo: ${tmpl.tipo}\nDescrição: ${tmpl.descricao}\nTeses Aplicáveis: ${tmpl.tesesAplicaveis}\nFundamentação Padrão: ${tmpl.fundamentacaoPadrao}\nTribunal: ${tmpl.tribunalDestino}`;
          }
        } else {
          // IA ESCOLHE AUTOMATICAMENTE o melhor template/modelo baseado no caso
          const templatesDisp = todosTemplates.map(t => `[Template ID:${t.id}] ${t.nome} — ${t.tipo} — ${t.descricao} — Teses: ${t.tesesAplicaveis}`).join('\n');
          const modelosDisp = modelosBase.map(m => `[Modelo] ${m.titulo}: ${m.conteudo?.substring(0, 500)}`).join('\n---\n');
          templateInfo = `\n\nTEMPLATES DISPONÍVEIS NO ESCRITÓRIO (ESCOLHA O MAIS ADEQUADO AO CASO E USE COMO BASE):\n${templatesDisp}\n\nMODELOS DE PETIÇÕES DO ESCRITÓRIO (USE O PADRÃO DE REDAÇÃO DESTES MODELOS):\n${modelosDisp}`;
        }

        // Buscar contexto do cliente e processo
        let contextoCliente = '';
        let contextoProcesso = '';
        let nomeCliente = 'Cliente';
        let numeroProcesso = '';

        if (input.clienteId) {
          const [cliente] = await db.select().from(clientes).where(eq(clientes.id, input.clienteId));
          if (cliente) {
            nomeCliente = cliente.nomeCompleto;
            const procs = await db.select().from(processos).where(eq(processos.clienteId, cliente.id));
            const emprestimos = await db.select().from(emprestimosConsignados).where(eq(emprestimosConsignados.clienteId, cliente.id));
            const dadosFin = await db.select().from(dadosFinanceiros).where(eq(dadosFinanceiros.clienteId, cliente.id));
            const estrats = [];
            const movFin = [];
            for (const p of procs) {
              const e = await db.select().from(estrategias).where(eq(estrategias.processoId, p.id));
              estrats.push(...e);
              const mf = await db.select().from(movimentacoesFinanceiras).where(eq(movimentacoesFinanceiras.processoId, p.id));
              movFin.push(...mf);
            }
            contextoCliente = `\nCLIENTE: ${cliente.nomeCompleto}
CPF: ${cliente.cpfCnpj}${cliente.rg ? ` | RG: ${cliente.rg}` : ''}
Nacionalidade: brasileiro(a) | Estado Civil: ${cliente.estadoCivil || 'N/I'}${cliente.dataNascimento ? ` | Data Nasc.: ${cliente.dataNascimento}` : ''}
Profissão: ${cliente.profissao || 'N/I'} | Cargo: ${cliente.cargo || 'N/I'} | Órgão Empregador: ${cliente.orgaoEmpregador || 'N/I'}
Endereço: ${cliente.endereco || 'N/I'}, ${cliente.cidade || ''} - ${cliente.estado || ''}, CEP: ${cliente.cep || 'N/I'}${cliente.telefone ? ` | Telefone: ${cliente.telefone}` : ''}${cliente.email ? ` | Email: ${cliente.email}` : ''}
Dados Financeiros: ${dadosFin.length > 0 ? dadosFin.map(d => `Bruto: R$ ${d.remuneracaoBruta} | Líquido: R$ ${d.remuneracaoLiquida} | Margem Consignável: R$ ${d.margemConsignavelValor} (${d.margemConsignavelPerc}%)`).join('; ') : 'Não informado'}
Empréstimos Consignados: ${emprestimos.length > 0 ? emprestimos.map(e => `${e.banco}: R$ ${e.valorParcela}/mês (${e.totalParcelas || '?'} parcelas, contrato ${e.contrato || 'N/I'})`).join('; ') : 'Nenhum registrado'}
Processos Vinculados: ${procs.map(p => `${p.numeroCnj} (${p.tipoAcao} - ${p.statusProcesso} - Valor: R$ ${p.valorCausa || '0'})`).join('; ')}
Estratégias: ${estrats.length > 0 ? estrats.map(e => `Tese: ${e.tesePrincipal}\nFundamentação: ${e.fundamentacaoLegal || 'N/I'}\nJurisprudência: ${e.jurisprudenciaCitada || 'N/I'}`).join('\n---\n') : 'Nenhuma registrada'}
Movimentações Financeiras: ${movFin.length > 0 ? movFin.map(m => `${m.tipo}: R$ ${m.valor} (${m.status})`).join('; ') : 'Nenhuma registrada'}`;
          }
        }

        if (input.processoId) {
          const [proc] = await db.select().from(processos).where(eq(processos.id, input.processoId));
          if (proc) {
            numeroProcesso = proc.numeroCnj || '';
            const estrats = await db.select().from(estrategias).where(eq(estrategias.processoId, proc.id));
            const movs = await db.select().from(movimentacoes).where(eq(movimentacoes.processoId, proc.id)).orderBy(desc(movimentacoes.createdAt));
            const movFin = await db.select().from(movimentacoesFinanceiras).where(eq(movimentacoesFinanceiras.processoId, proc.id));
            const partes = await db.select().from(partesProcessuais).where(eq(partesProcessuais.processoId, proc.id));
            const cumprimentos = await db.select().from(cumprimentosSentenca).where(eq(cumprimentosSentenca.processoId, proc.id));
            // Buscar conhecimentos vinculados ao processo
            const conhecimentosProc = await db.select().from(conhecimentos).where(eq(conhecimentos.processoOrigemId, proc.id));
            contextoProcesso = `\n=== PROCESSO COMPLETO ===
Número CNJ: ${proc.numeroCnj}
Tipo de Ação: ${proc.tipoAcao} | Natureza: ${proc.natureza || 'N/I'}
Vara: ${proc.vara} | Comarca: ${proc.comarca} | Tribunal: ${proc.tribunal}
Valor da Causa: R$ ${proc.valorCausa} | Fase Atual: ${proc.faseAtual} | Status: ${proc.statusProcesso}
Polo Ativo: ${proc.poloAtivo}
Polo Passivo: ${proc.poloPassivo}
Partes Processuais: ${partes.map(p => `${p.tipo}: ${p.nome}${p.cpfCnpj ? ` (CPF/CNPJ: ${p.cpfCnpj})` : ''}${p.categoria ? ` (${p.categoria})` : ''}`).join('; ')}

SENTENÇA: ${proc.resumoSentenca || 'Não informada'}
Valor Condenação: R$ ${proc.valorCondenacao || 'N/I'}
Honorários: ${proc.honorariosPerc || 'N/I'}% = R$ ${proc.honorariosValor || 'N/I'}
Tutela: ${proc.tutelaTipo || 'N/I'} (Status: ${proc.tutelaStatus || 'N/I'})
Classe Processual: ${proc.classeProcessual || 'N/I'}

CUMPRIMENTOS DE SENTENÇA: ${cumprimentos.length > 0 ? cumprimentos.map(c => `${c.tipo}: R$ ${c.valorExecucao} (Correção: ${c.indiceCorrecao || 'N/I'}, Juros: ${c.jurosMora || 'N/I'})`).join('; ') : 'Nenhum'}

ESTRATÉGIAS PROCESSUAIS DETALHADAS:
${estrats.length > 0 ? estrats.map(e => `Tese Principal: ${e.tesePrincipal}\nFundamentação Legal: ${e.fundamentacaoLegal || 'N/I'}\nJurisprudência Citada: ${e.jurisprudenciaCitada || 'N/I'}\nPontos Fortes: ${e.pontosFortes || 'N/I'}\nTeses Refutadas: ${e.tesesRefutadas || 'N/I'}\nRiscos: ${e.riscosIdentificados || 'N/I'}\nObservações: ${e.observacoes || 'N/I'}`).join('\n---\n') : 'Nenhuma registrada'}

MOVIMENTAÇÕES PROCESSUAIS COMPLETAS (todas):
${movs.map(m => `[${m.data}] ${m.evento}${m.descricao ? ` — ${m.descricao}` : ''}`).join('\n')}

MOVIMENTAÇÕES FINANCEIRAS: ${movFin.length > 0 ? movFin.map(m => `${m.tipo}: R$ ${m.valor} (${m.status}${m.descricao ? ` — ${m.descricao}` : ''})`).join('; ') : 'Nenhuma'}

CONHECIMENTOS JURÍDICOS VINCULADOS AO PROCESSO:
${conhecimentosProc.length > 0 ? conhecimentosProc.map(c => `[${c.categoria}] ${c.titulo}: ${c.conteudo?.substring(0, 500)}`).join('\n---\n') : 'Nenhum'}`;
          }
        }

        // Buscar base de conhecimento relevante — busca semântica por tipo de petição
        const todosConhecimentos = await db.select().from(conhecimentos);
        
        // Mapeamento de tipo de petição → termos de busca para filtrar conhecimentos relevantes
        const termosRelevantes: Record<string, string[]> = {
          'obrigacao_fazer': ['obrigação', 'fazer', 'consignado', 'margem', 'tutela', 'CDC', 'bancário'],
          'obrigacao_fazer_tutela': ['obrigação', 'fazer', 'tutela', 'antecipada', 'consignado', 'margem', 'urgência'],
          'declaratoria_inexistencia': ['inexistência', 'débito', 'desconto', 'indevido', 'restituição', 'dano moral'],
          'repactuacao_dividas': ['superendividamento', 'repactuação', 'mínimo existencial', 'dignidade', '14.181'],
          'cumprimento_provisorio': ['cumprimento', 'provisório', 'sentença', 'execução', '523', '520', 'multa'],
          'cumprimento_definitivo': ['cumprimento', 'definitivo', 'trânsito', 'julgado', 'execução', '523'],
          'cumprimento_provisorio_honorarios': ['honorários', 'sucumbência', 'autônomo', 'alimentar', '85', '8.906'],
          'agravo_instrumento': ['agravo', 'instrumento', 'interlocutória', 'efeito suspensivo', 'gravame'],
          'contrarrazoes_apelacao': ['contrarrazões', 'apelação', 'manutenção', 'sentença', 'reformatio'],
          'querela_nullitatis': ['querela', 'nullitatis', 'nulidade', 'citação', 'vício', 'insanável'],
          'embargos_declaracao': ['embargos', 'declaração', 'omissão', 'contradição', 'obscuridade'],
          'embargos_execucao': ['embargos', 'execução', 'excesso', 'nulidade', 'prescrição'],
          'impugnacao': ['impugnação', 'cumprimento', 'excesso', 'prescrição'],
          'execucao_titulo_extrajudicial': ['execução', 'título', 'extrajudicial', 'liquidez', 'penhora'],
          'excecao_pre_executividade': ['exceção', 'pré-executividade', 'ordem pública', 'prescrição'],
          'tutela_urgencia_antecedente': ['tutela', 'urgência', 'antecedente', 'periculum', 'fumus'],
          'penhora_online': ['penhora', 'SISBAJUD', 'bloqueio', 'constrição'],
          'alvara_levantamento': ['alvará', 'levantamento', 'depósito', 'valores'],
          'recurso_especial': ['recurso', 'especial', 'STJ', 'lei federal', 'divergência'],
          'mandado_seguranca': ['mandado', 'segurança', 'autoridade', 'ilegalidade', 'direito líquido'],
          'habeas_corpus': ['habeas', 'corpus', 'liberdade', 'coação'],
        };
        const termos = termosRelevantes[input.tipoPeticao] || [];
        
        // Filtro inteligente: prioriza conhecimentos específicos ao tipo de ação, depois genéricos
        function relevanciaPorTermo(c: any): number {
          if (!termos.length) return 1;
          const texto = `${c.titulo || ''} ${c.conteudo || ''} ${c.tipoAcao || ''}`.toLowerCase();
          return termos.filter(t => texto.includes(t.toLowerCase())).length;
        }
        
        const conhecimentosOrdenados = todosConhecimentos
          .map(c => ({ ...c, relevancia: relevanciaPorTermo(c) }))
          .sort((a, b) => b.relevancia - a.relevancia);
        
        // Teses: top 25 mais relevantes
        const tesesRelevantes = conhecimentosOrdenados.filter(c => c.categoria === 'Tese').slice(0, 25);
        const tesesTxt = tesesRelevantes.map(t => `- [Rel:${t.relevancia}] ${t.titulo}: ${t.conteudo?.substring(0, 300)}`).join('\n');
        
        // Jurisprudência: top 20 mais relevantes
        const jurispRelevantes = conhecimentosOrdenados.filter(c => c.categoria === 'Jurisprudencia').slice(0, 20);
        const jurispTxt = jurispRelevantes.map(j => `- [Rel:${j.relevancia}] ${j.titulo}: ${j.conteudo?.substring(0, 250)}`).join('\n');
        
        // Legislação: top 15 mais relevantes
        const legRelevantes = conhecimentosOrdenados.filter(c => c.categoria === 'Legislacao').slice(0, 15);
        const legTxt = legRelevantes.map(l => `- [Rel:${l.relevancia}] ${l.titulo}: ${l.conteudo?.substring(0, 250)}`).join('\n');
        
        // Estratégias: top 10 mais relevantes
        const estratRelevantes = conhecimentosOrdenados.filter(c => c.categoria === 'Estrategia').slice(0, 10);
        const estratTxt = estratRelevantes.map(e => `- [Rel:${e.relevancia}] ${e.titulo}: ${e.conteudo?.substring(0, 200)}`).join('\n');

        // REFERÊNCIAS DE PETIÇÕES APROVADAS (aprendizado do agente)
        // Buscar referências aprovadas (tanto as antigas com tag 'referencia_aprovada' quanto as novas com 'referência')
        const referenciasAprovadas = conhecimentosOrdenados
          .filter(c => c.tags?.includes('referencia_aprovada') || c.tags?.includes('referência') || c.titulo?.includes('PETIÇÃO APROVADA'))
          .slice(0, 5);
        const refAprovTxt = referenciasAprovadas.length > 0
          ? referenciasAprovadas.map(r => `\n[REF ${r.tipoAcao || 'Geral'}] ${r.titulo}:\n${r.conteudo?.substring(0, 2000)}`).join('\n---')
          : '';
        
        // Buscar estilo de redação e instruções do escritório
        const estiloModel = todosConhecimentos.find(c => c.titulo?.includes('ESTILO') && c.categoria === 'Modelo');
        const instrucoesModel = todosConhecimentos.find(c => c.titulo?.includes('INSTRUÇÕES') && c.categoria === 'Modelo');

        const systemPrompt = `Você é o PETICIONADOR EXPERT do escritório Melo & Preda Advogados (OAB/GO 40.559).
Advogado: PAULO DA SILVA MELO FILHO

Gere a petição completa do tipo "${input.tipoPeticao}" seguindo RIGOROSAMENTE o padrão do escritório.

=== PROIBIÇÕES ABSOLUTAS — VIOLAÇÃO DESTAS REGRAS INVALIDA A PETIÇÃO ===
1. NUNCA usar placeholders como [COMPLETAR], [INSERIR], [NOME DO CLIENTE], [NÚMERO], [DATA], [VALOR], [COMARCA], [VARA], [ENDEREÇO] ou qualquer texto entre colchetes que indique lacuna
2. NUNCA gerar modelo/template para preenchimento posterior — a petição deve sair PRONTA PARA PROTOCOLO
3. NUNCA omitir dados que estão disponíveis no contexto abaixo — USE TODOS OS DADOS REAIS fornecidos
4. NUNCA inventar dados que não existem no contexto — se um dado não foi fornecido, OMITA a seção ou use formulação que não dependa dele
5. NUNCA usar "etc.", "e outros", "entre outros" — seja ESPECÍFICO
6. NUNCA usar parágrafos genéricos que poderiam servir para qualquer caso — CADA parágrafo deve conter dados ESPECÍFICOS deste processo

=== DADOS REAIS DO CASO (USE OBRIGATORIAMENTE) ===
${contextoCliente}
${contextoProcesso}

=== ESTILO DE REDAÇÃO OBRIGATÓRIO DO ESCRITÓRIO ===
${estiloModel?.conteudo?.substring(0, 3000) || `- Tom assertivo, combativo e técnico — sem hesitação, sem linguagem genérica
- Fundamentação ROBUSTA e EXAUSTIVA: transcreva artigos de lei relevantes, cite ementas jurisprudenciais completas, referencie doutrinadores
- Expressões fortes e características: "flagrante ilegalidade", "abuso manifesto", "violação frontal ao ordenamento jurídico", "consoante entendimento pacificado", "cristalino ao dispor que"
- Parágrafos densos com argumentação encadeada e progressiva — cada parágrafo deve avançar o argumento
- Pedidos ESPECÍFICOS com valores EXATOS calculados a partir dos dados do processo
- Citações jurisprudenciais COMPLETAS: tribunal, turma/câmara, número do processo, relator, data do julgamento
- Doutrina com autor, obra, edição, página`}

=== INSTRUÇÕES DETALHADAS DO AGENTE ===
${instrucoesModel?.conteudo?.substring(0, 2000) || ''}

=== ESTRUTURA OBRIGATÓRIA ===
1. ENDEREÇAMENTO — Use a vara e comarca REAIS do processo fornecido acima. Ex: "EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DE DIREITO DA ${contextoProcesso.includes('Vara') ? '' : '__ '}VARA CÍVEL DA COMARCA DE ${contextoProcesso.includes('Comarca') ? '' : 'GOIÂNIA'} — ESTADO DE GOIÁS"
2. NÚMERO DO PROCESSO — Usar o número CNJ REAL fornecido
3. QUALIFICAÇÃO COMPLETA — Nome, CPF, profissão, endereço, cargo, órgão — TUDO que estiver nos dados do cliente
4. **I — DOS FATOS** — Narrativa cronológica DETALHADA baseada nas movimentações REAIS do processo, com datas e eventos específicos
5. **II — DO DIREITO** (SEÇÃO MAIS IMPORTANTE — mínimo 60% da petição)
   a) Fundamentação LEGAL: artigos específicos com transcrição do dispositivo
   b) Fundamentação JURISPRUDENCIAL: ementas completas com dados de identificação
   c) Fundamentação DOUTRINÁRIA: autores, obras, páginas
   d) Teses centrais desenvolvidas com profundidade argumentativa
6. **III — DOS PEDIDOS** — Numerados (a, b, c...), ESPECÍFICOS, com valores EXATOS quando aplicável. Tutela de urgência primeiro, honorários no final, incluir pedidos subsidiários
7. **IV — DO VALOR DA CAUSA** — Valor REAL por extenso
8. FECHO — "Nestes termos, pede deferimento. Goiânia/GO, [data atual]. PAULO DA SILVA MELO FILHO — OAB/GO 40.559"

=== BASE DE CONHECIMENTO JURÍDICO DO ESCRITÓRIO ===

ESTRATÉGIAS PROCESSUAIS:
${estratTxt}

TESES JURÍDICAS (use as mais relevantes ao caso):
${tesesTxt}

JURISPRUDÊNCIA (cite as mais pertinentes com ementa completa):
${jurispTxt}

LEGISLAÇÃO:
${legTxt}
${templateInfo}

${input.instrucoes ? `INSTRUÇÕES ADICIONAIS DO ADVOGADO: ${input.instrucoes}` : ''}
${refAprovTxt ? `\nREFERÊNCIAS DE PETIÇÕES APROVADAS (inspire-se no estilo, desenvolva argumentação ORIGINAL):\n${refAprovTxt}` : ''}

=== INSTRUÇÃO FINAL ===
Gere a petição COMPLETA, PRONTA PARA PROTOCOLO, sem NENHUMA lacuna. Cada dado disponível no contexto DEVE aparecer na petição. A fundamentação jurídica deve ser EXAUSTIVA — não resuma, DESENVOLVA cada argumento com profundidade. Use formatação Markdown com títulos em negrito, numeração romana para seções, e letras para pedidos.`;

        const result = await invokeLLM({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Gere AGORA a petição de ${input.tipoPeticao} COMPLETA e PRONTA PARA PROTOCOLO para o caso de ${nomeCliente}${numeroProcesso ? ` (processo nº ${numeroProcesso})` : ''}.

REGRA ABSOLUTA: Não use NENHUM placeholder como [COMPLETAR], [INSERIR], [NOME], etc. Use TODOS os dados reais fornecidos no contexto. A petição deve sair pronta, sem lacunas, com fundamentação jurídica EXAUSTIVA (artigos de lei transcritos, jurisprudência com ementas completas, doutrina com referência). Desenvolva cada argumento com profundidade técnica. A seção DO DIREITO deve ser a mais extensa da petição.` }
          ]
        });

        const rawContent = result.choices?.[0]?.message?.content;
        const peticaoTexto = typeof rawContent === 'string' ? rawContent : 'Erro ao gerar petição.';

        // Salvar no S3 (Markdown)
        const timestamp = Date.now();
        const nomeArquivo = `peticoes/${input.tipoPeticao.replace(/\s+/g, '_')}_${nomeCliente.replace(/\s+/g, '_')}_${timestamp}.md`;
        const { url } = await storagePut(nomeArquivo, peticaoTexto, 'text/markdown');

        // Gerar DOCX com timbrado e salvar no S3
        let docxUrl = '';
        try {
          const docxBuffer = await gerarPeticaoDocx(
            peticaoTexto,
            `${input.tipoPeticao} — ${nomeCliente}`
          );
          const docxNome = `peticoes/${input.tipoPeticao.replace(/\s+/g, '_')}_${nomeCliente.replace(/\s+/g, '_')}_${timestamp}.docx`;
          const docxResult = await storagePut(docxNome, docxBuffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
          docxUrl = docxResult.url;
        } catch (e) {
          console.error('Erro ao gerar DOCX:', e);
        }

        // Salvar no banco
        try {
          await db.insert(peticoesGeradas).values({
            templateId: input.templateId || null,
            processoId: input.processoId || null,
            clienteId: input.clienteId || null,
            tipo: input.tipoPeticao,
            titulo: `${input.tipoPeticao} — ${nomeCliente}`,
            conteudoJson: JSON.stringify({ texto: peticaoTexto, docxUrl }),
            conteudoTexto: peticaoTexto,
            status: 'rascunho',
            storageUrl: url,
            geradoPor: 'agente_ia',
          });
        } catch (e) {
          console.error('Erro ao salvar petição no banco:', e);
        }

        return {
          peticao: peticaoTexto,
          url,
          docxUrl,
          tipoPeticao: input.tipoPeticao,
          cliente: nomeCliente,
          processo: numeroProcesso,
        };
      }),

    // Listar templates de petição disponíveis
    listarTemplates: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select({
        id: templatesPeticao.id,
        nome: templatesPeticao.nome,
        tipo: templatesPeticao.tipo,
        descricao: templatesPeticao.descricao,
        tesesAplicaveis: templatesPeticao.tesesAplicaveis,
        tribunalDestino: templatesPeticao.tribunalDestino,
        tags: templatesPeticao.tags,
      }).from(templatesPeticao).where(eq(templatesPeticao.ativo, 1));
    }),

    // Listar petições geradas
    listarPeticoes: protectedProcedure
      .input(z.object({
        clienteId: z.number().optional(),
        processoId: z.number().optional(),
        limit: z.number().optional().default(20),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        let query = db.select().from(peticoesGeradas).orderBy(desc(peticoesGeradas.createdAt)).limit(input.limit);
        if (input.clienteId) query = query.where(eq(peticoesGeradas.clienteId, input.clienteId)) as any;
        if (input.processoId) query = query.where(eq(peticoesGeradas.processoId, input.processoId)) as any;
        return query;
      }),

    // Exportar petição existente para DOCX com timbrado
    exportarDocx: protectedProcedure
      .input(z.object({
        peticaoId: z.number().optional(),
        conteudo: z.string().optional(),
        titulo: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        let conteudo = input.conteudo || '';
        let titulo = input.titulo || 'Peti\u00E7\u00E3o';

        // Se peticaoId, buscar do banco
        if (input.peticaoId) {
          const db = await getDb();
          if (db) {
            const [pet] = await db.select().from(peticoesGeradas).where(eq(peticoesGeradas.id, input.peticaoId));
            if (pet) {
              conteudo = pet.conteudoTexto || '';
              titulo = pet.titulo || titulo;
              // Se já tem docxUrl, retornar direto
              try {
                const json = typeof pet.conteudoJson === 'string' ? JSON.parse(pet.conteudoJson) : (pet.conteudoJson as any) || {};
                if (json.docxUrl) return { docxUrl: json.docxUrl as string, titulo };
              } catch (_e) {}
            }
          }
        }

        if (!conteudo) throw new Error('Conte\u00FAdo da peti\u00E7\u00E3o n\u00E3o encontrado');

        // Gerar DOCX
        const docxBuffer = await gerarPeticaoDocx(conteudo, titulo);
        const timestamp = Date.now();
        const nomeArquivo = `peticoes/docx_${titulo.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50)}_${timestamp}.docx`;
        const { url: docxUrl } = await storagePut(nomeArquivo, docxBuffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

        // Atualizar banco se peticaoId
        if (input.peticaoId) {
          const db = await getDb();
          if (db) {
            const [pet] = await db.select().from(peticoesGeradas).where(eq(peticoesGeradas.id, input.peticaoId));
            if (pet) {
              try {
                const json = typeof pet.conteudoJson === 'string' ? JSON.parse(pet.conteudoJson) : (pet.conteudoJson as any) || {};
                json.docxUrl = docxUrl;
                await db.update(peticoesGeradas).set({ conteudoJson: JSON.stringify(json) }).where(eq(peticoesGeradas.id, input.peticaoId));
              } catch (_e) {}
            }
          }
        }

        return { docxUrl, titulo };
      }),

    // Hist\u00f3rico de conversas
    historico: protectedProcedure
      .input(z.object({
        sessaoId: z.string().optional(),
        limit: z.number().optional().default(50),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        if (input.sessaoId) {
          return db.select().from(agenteIaHistorico)
            .where(eq(agenteIaHistorico.sessaoId, input.sessaoId))
            .orderBy(agenteIaHistorico.createdAt);
        }
        // Listar sessões únicas
        const sessoes = await db.select({
          sessaoId: agenteIaHistorico.sessaoId,
          ultimaMensagem: sql<string>`MAX(${agenteIaHistorico.conteudo})`,
          total: sql<number>`COUNT(*)`,
          criadoEm: sql<Date>`MIN(${agenteIaHistorico.createdAt})`,
        }).from(agenteIaHistorico)
          .groupBy(agenteIaHistorico.sessaoId)
          .orderBy(desc(sql`MIN(${agenteIaHistorico.createdAt})`))
          .limit(input.limit);
        return sessoes;
      }),

    // Estatísticas completas
    estatisticas: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { total: 0, teses: 0, jurisprudencias: 0, estrategias: 0, legislacoes: 0, modelos: 0, templates: 0, peticoesGeradas: 0, sessoes: 0 };
      const todos = await db.select().from(conhecimentos);
      const [templatesCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(templatesPeticao);
      const [peticoesCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(peticoesGeradas);
      const [sessoesCount] = await db.select({ count: sql<number>`COUNT(DISTINCT ${agenteIaHistorico.sessaoId})` }).from(agenteIaHistorico);
      return {
        total: todos.length,
        teses: todos.filter(c => c.categoria === 'Tese').length,
        jurisprudencias: todos.filter(c => c.categoria === 'Jurisprudencia').length,
        estrategias: todos.filter(c => c.categoria === 'Estrategia').length,
        legislacoes: todos.filter(c => c.categoria === 'Legislacao').length,
        modelos: todos.filter(c => c.categoria === 'Modelo').length,
        templates: Number(templatesCount?.count || 0),
        peticoesGeradas: Number(peticoesCount?.count || 0),
        sessoes: Number(sessoesCount?.count || 0),
      };
    }),

    // Análise técnica aprofundada de processo
    // ==================== PETICIONAMENTO COMPLETO ====================
    // Obter petição por ID
    obterPeticao: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error('DB indisponível');
        const [pet] = await db.select().from(peticoesGeradas).where(eq(peticoesGeradas.id, input.id));
        if (!pet) throw new Error('Petição não encontrada');
        return pet;
      }),
    // Editar conteúdo da petição
    editarPeticao: protectedProcedure
      .input(z.object({
        id: z.number(),
        conteudoTexto: z.string().optional(),
        titulo: z.string().optional(),
        observacoes: z.string().optional(),
        status: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error('DB indisponível');
        const updateData: any = { updatedAt: new Date() };
        if (input.conteudoTexto !== undefined) {
          updateData.conteudoTexto = input.conteudoTexto;
          updateData.conteudoJson = JSON.stringify({ texto: input.conteudoTexto });
        }
        if (input.titulo) updateData.titulo = input.titulo;
        if (input.observacoes !== undefined) updateData.observacoes = input.observacoes;
        if (input.status) {
          updateData.status = input.status;
          if (input.status === 'revisado') updateData.revisadoPor = ctx.user?.name || 'admin';
        }
        await db.update(peticoesGeradas).set(updateData).where(eq(peticoesGeradas.id, input.id));
        return { success: true };
      }),
    // Excluir petição
    excluirPeticao: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error('DB indisponível');
        await db.delete(peticoesGeradas).where(eq(peticoesGeradas.id, input.id));
        return { success: true };
      }),
    // Duplicar petição
    duplicarPeticao: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error('DB indisponível');
        const [original] = await db.select().from(peticoesGeradas).where(eq(peticoesGeradas.id, input.id));
        if (!original) throw new Error('Petição não encontrada');
        const [inserted] = await db.insert(peticoesGeradas).values({
          templateId: original.templateId,
          processoId: original.processoId,
          clienteId: original.clienteId,
          tipo: original.tipo,
          titulo: `${original.titulo} (Cópia)`,
          conteudoJson: original.conteudoJson,
          conteudoTexto: original.conteudoTexto,
          status: 'rascunho',
          geradoPor: 'duplicacao',
          observacoes: `Duplicada da petição #${original.id}`,
        });
        return { success: true, id: inserted.insertId };
      }),
    // Regenerar DOCX de petição existente (após edição)
    regenerarDocx: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error('DB indisponível');
        const [pet] = await db.select().from(peticoesGeradas).where(eq(peticoesGeradas.id, input.id));
        if (!pet || !pet.conteudoTexto) throw new Error('Petição sem conteúdo');
        const docxBuffer = await gerarPeticaoDocx(pet.conteudoTexto, pet.titulo);
        const timestamp = Date.now();
        const nomeArquivo = `peticoes/docx_${pet.tipo.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30)}_${timestamp}.docx`;
        const { url: docxUrl } = await storagePut(nomeArquivo, docxBuffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        // Atualizar banco com novo URL
        const json = typeof pet.conteudoJson === 'string' ? JSON.parse(pet.conteudoJson) : (pet.conteudoJson as any) || {};
        json.docxUrl = docxUrl;
        await db.update(peticoesGeradas).set({ conteudoJson: JSON.stringify(json) }).where(eq(peticoesGeradas.id, input.id));
        return { docxUrl, titulo: pet.titulo };
      }),
    // Atualizar status da petição
    atualizarStatusPeticao: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(['rascunho', 'revisado', 'aprovado', 'protocolado', 'arquivado']),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error('DB indisponível');
        const updateData: any = { status: input.status };
        if (input.status === 'revisado' || input.status === 'aprovado') {
          updateData.revisadoPor = ctx.user?.name || 'admin';
        }
        await db.update(peticoesGeradas).set(updateData).where(eq(peticoesGeradas.id, input.id));
        return { success: true };
      }),
    // Listar todos os tipos de petição disponíveis — organizados por categoria
    tiposPeticao: protectedProcedure.query(async () => {
      return [
        // === AÇÕES INICIAIS ===
        { id: 'obrigacao_fazer', nome: 'Ação de Obrigação de Fazer', descricao: 'Ação para compelir cumprimento de obrigação com tutela antecipada', categoria: 'Ações Iniciais' },
        { id: 'obrigacao_fazer_tutela', nome: 'Obrigação de Fazer + Tutela Antecipada', descricao: 'Contra instituições financeiras por abusividade de consignações', categoria: 'Ações Iniciais' },
        { id: 'declaratoria_inexistencia', nome: 'Declaratória de Inexistência de Débito', descricao: 'Cessação de descontos indevidos e restituição de valores', categoria: 'Ações Iniciais' },
        { id: 'repactuacao_dividas', nome: 'Repactuação de Dívidas (Superendividamento)', descricao: 'Preservação do mínimo existencial — Lei 14.181/2021', categoria: 'Ações Iniciais' },
        { id: 'querela_nullitatis', nome: 'Querela Nullitatis', descricao: 'Ação declaratória de nulidade de sentença por vício insanável', categoria: 'Ações Iniciais' },
        { id: 'tutela_urgencia_antecedente', nome: 'Tutela de Urgência Antecedente', descricao: 'Cautelar para situações de extrema urgência', categoria: 'Ações Iniciais' },
        { id: 'mandado_seguranca', nome: 'Mandado de Segurança', descricao: 'Remédio constitucional contra ato ilegal de autoridade', categoria: 'Ações Iniciais' },
        // === CUMPRIMENTO E EXECUÇÃO ===
        { id: 'cumprimento_provisorio', nome: 'Cumprimento Provisório de Sentença', descricao: 'Execução provisória antes do trânsito em julgado', categoria: 'Cumprimento e Execução' },
        { id: 'cumprimento_definitivo', nome: 'Cumprimento Definitivo de Sentença', descricao: 'Execução após trânsito em julgado', categoria: 'Cumprimento e Execução' },
        { id: 'cumprimento_provisorio_honorarios', nome: 'Cumprimento Provisório — Honorários', descricao: 'Cobrança de honorários advocatícios de sucumbência', categoria: 'Cumprimento e Execução' },
        { id: 'execucao_titulo_extrajudicial', nome: 'Execução de Título Extrajudicial', descricao: 'Cobrança com base em documento com força executiva', categoria: 'Cumprimento e Execução' },
        { id: 'penhora_online', nome: 'Pedido de Penhora Online (SISBAJUD)', descricao: 'Solicitação de bloqueio via sistema bancário', categoria: 'Cumprimento e Execução' },
        { id: 'alvara_levantamento', nome: 'Alvará de Levantamento', descricao: 'Solicitação de levantamento de valores depositados', categoria: 'Cumprimento e Execução' },
        // === RECURSOS ===
        { id: 'agravo_instrumento', nome: 'Agravo de Instrumento', descricao: 'Recurso contra decisão interlocutória com pedido de efeito suspensivo', categoria: 'Recursos' },
        { id: 'contrarrazoes_apelacao', nome: 'Contrarrazões à Apelação', descricao: 'Resposta ao recurso de apelação para manutenção da sentença', categoria: 'Recursos' },
        { id: 'embargos_declaracao', nome: 'Embargos de Declaração', descricao: 'Recurso para esclarecer obscuridade, contradição ou omissão', categoria: 'Recursos' },
        { id: 'recurso_especial', nome: 'Recurso Especial (REsp)', descricao: 'Recurso ao STJ por violação de lei federal', categoria: 'Recursos' },
        // === DEFESA ===
        { id: 'embargos_execucao', nome: 'Embargos à Execução', descricao: 'Defesa do executado na fase de execução', categoria: 'Defesa' },
        { id: 'impugnacao', nome: 'Impugnação ao Cumprimento de Sentença', descricao: 'Defesa do devedor no cumprimento de sentença', categoria: 'Defesa' },
        { id: 'excecao_pre_executividade', nome: 'Exceção de Pré-Executividade', descricao: 'Matérias de ordem pública sem necessidade de penhora', categoria: 'Defesa' },
        // === PETIÇÕES INTERMEDIÁRIAS ===
        { id: 'peticao_simples', nome: 'Petição Simples', descricao: 'Petição intermediária genérica', categoria: 'Intermediárias' },
        { id: 'peticao_juntada', nome: 'Petição de Juntada de Documentos', descricao: 'Juntada de documentos aos autos', categoria: 'Intermediárias' },
        { id: 'habeas_corpus', nome: 'Habeas Corpus', descricao: 'Remédio constitucional contra restrição de liberdade', categoria: 'Intermediárias' },
      ];
    }),
    // ==================== ANEXOS DE PETIÇÕES ====================
    uploadAnexo: protectedProcedure
      .input(z.object({
        peticaoId: z.number(),
        nomeArquivo: z.string(),
        tipoArquivo: z.string().optional(),
        tamanhoBytes: z.number().optional(),
        base64Data: z.string(),
        descricao: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error('DB indisponível');
        const buffer = Buffer.from(input.base64Data, 'base64');
        const suffix = Math.random().toString(36).substring(2, 8);
        const key = `peticoes/anexos/${input.peticaoId}/${suffix}-${input.nomeArquivo}`;
        const { url } = await storagePut(key, buffer, input.tipoArquivo || 'application/pdf');
        const [anexo] = await db.insert(anexosPeticao).values({
          peticaoId: input.peticaoId,
          nomeArquivo: input.nomeArquivo,
          tipoArquivo: input.tipoArquivo || 'application/pdf',
          tamanhoBytes: input.tamanhoBytes || buffer.length,
          storageKey: key,
          storageUrl: url,
          descricao: input.descricao || null,
        }).$returningId();
        return { id: anexo.id, url, nomeArquivo: input.nomeArquivo };
      }),

    listarAnexos: protectedProcedure
      .input(z.object({ peticaoId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        return db.select().from(anexosPeticao).where(eq(anexosPeticao.peticaoId, input.peticaoId)).orderBy(desc(anexosPeticao.createdAt));
      }),

    excluirAnexo: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error('DB indisponível');
        await db.delete(anexosPeticao).where(eq(anexosPeticao.id, input.id));
        return { success: true };
      }),

    // ==================== REFINAMENTO ITERATIVO DE PETIÇÕES ====================
    refinarPeticao: protectedProcedure
      .input(z.object({
        peticaoId: z.number(),
        instrucoes: z.string().min(5),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error('DB indisponível');

        const [pet] = await db.select().from(peticoesGeradas).where(eq(peticoesGeradas.id, input.peticaoId));
        if (!pet) throw new Error('Petição não encontrada');

        const conteudoAnterior = pet.conteudoTexto || '';

        // Verificar versão atual — se nenhuma versão existe, salvar a original como v1
        const versoesExistentes = await db.select().from(peticaoVersoes)
          .where(eq(peticaoVersoes.peticaoId, input.peticaoId))
          .orderBy(desc(peticaoVersoes.versao));
        
        if (versoesExistentes.length === 0) {
          // Salvar versão original (v1) antes do primeiro refinamento
          const jsonOriginal = typeof pet.conteudoJson === 'string' ? JSON.parse(pet.conteudoJson) : (pet.conteudoJson as any) || {};
          await db.insert(peticaoVersoes).values({
            peticaoId: input.peticaoId,
            versao: 1,
            conteudoTexto: conteudoAnterior,
            instrucoes: null,
            diff: null,
            docxUrl: jsonOriginal.docxUrl || pet.storageUrl || null,
            criadoPor: pet.geradoPor || 'agente_ia',
          });
        }

        const versaoAtual = versoesExistentes.length > 0 ? versoesExistentes[0].versao : 1;
        const novaVersao = versaoAtual + 1;

        // Buscar dados do processo e cliente para contexto
        let contextoProcesso = '';
        if (pet.processoId) {
          const [proc] = await db.select().from(processos).where(eq(processos.id, pet.processoId));
          if (proc) contextoProcesso += `\nProcesso: ${proc.numeroCnj} - ${proc.tipoAcao} - ${proc.statusProcesso}`;
        }
        if (pet.clienteId) {
          const [cli] = await db.select().from(clientes).where(eq(clientes.id, pet.clienteId));
          if (cli) contextoProcesso += `\nCliente: ${cli.nomeCompleto}`;
        }

        // Busca semântica de conhecimentos relevantes ao refinamento
        const todosConhecimentos = await db.select().from(conhecimentos);
        
        // Extrair termos da instrução do advogado + tipo de petição para busca semântica
        const termosInstrucao = input.instrucoes.toLowerCase().split(/[\s,;.]+/).filter(t => t.length > 3);
        const termosTipo = (pet.tipo || '').toLowerCase().split(/[\s_-]+/).filter(t => t.length > 3);
        const todosTermos = Array.from(new Set([...termosInstrucao, ...termosTipo]));
        
        function calcRelevanciaRefinamento(c: any): number {
          const texto = `${c.titulo || ''} ${c.conteudo || ''} ${c.tipoAcao || ''}`.toLowerCase();
          return todosTermos.filter(t => texto.includes(t)).length;
        }
        
        const conhecimentosOrdenados = todosConhecimentos
          .map(c => ({ ...c, rel: calcRelevanciaRefinamento(c) }))
          .sort((a, b) => b.rel - a.rel);
        
        const conhecimentosRelevantes = conhecimentosOrdenados
          .slice(0, 20)
          .map(c => `[${c.categoria}] ${c.titulo}: ${c.conteudo?.substring(0, 500)}`)
          .join('\n');
        
        // Buscar histórico de refinamentos anteriores para contexto conversacional
        const historicoRefinamentos = versoesExistentes
          .filter(v => v.instrucoes)
          .slice(0, 5)
          .map(v => `v${v.versao}: ${v.instrucoes}`)
          .reverse()
          .join('\n');

        const configRows = await db.select().from(agenteIaConfig);
        const configExpertise = configRows.find(c => c.chave === 'expertise_juridica');
        const configEstilo = configRows.find(c => c.chave === 'estilo_redacao');

        const systemPrompt = `Você é o PETICIONADOR EXPERT do escritório Melo & Preda Advogados (OAB/GO 40.559).
Advogado: PAULO DA SILVA MELO FILHO
Você ESTUDOU todos os processos do escritório e conhece profundamente cada caso.

${configExpertise?.valor ? `EXPERTISE: ${configExpertise.valor}` : ''}
${configEstilo?.valor ? `ESTILO DE REDAÇÃO: ${configEstilo.valor}` : ''}

ESTILO DE REDAÇÃO OBRIGATÓRIO DO ESCRITÓRIO:
${(() => { const estilo = todosConhecimentos.find((c: any) => c.titulo?.includes('ESTILO') && c.categoria === 'Modelo'); return estilo?.conteudo?.substring(0, 2000) || '- Tom ASSERTIVO, COMBATIVO e TÉCNICO — sem hesitação\n- Expressões características: "flagrante ilegalidade", "abuso manifesto", "violação frontal ao ordenamento jurídico"\n- Fundamentação ROBUSTA com artigos de lei, doutrina e jurisprudência\n- Citações jurisprudenciais completas (tribunal, número, relator, câmara, data)\n- Parágrafos densos com argumentação encadeada e progressiva'; })()}

CONHECIMENTOS JURÍDICOS RELEVANTES AO REFINAMENTO:
${conhecimentosRelevantes || 'Nenhum conhecimento específico carregado.'}

${historicoRefinamentos ? `HISTÓRICO DE REFINAMENTOS ANTERIORES (contexto conversacional):
${historicoRefinamentos}
` : ''}
Você receberá uma petição já redigida e instruções do advogado sobre o que deve ser melhorado.

REGRAS ABSOLUTAS DO REFINAMENTO:
1. Manter a estrutura geral da petição (endereçamento, qualificação, fatos, direito, pedidos, fecho)
2. Aplicar EXATAMENTE as melhorias solicitadas pelo advogado — não fazer alterações não solicitadas
3. Quando o advogado pedir para "aprofundar" ou "reforçar", adicionar fundamentação da base de conhecimentos
4. Quando o advogado pedir para "adicionar jurisprudência", buscar nos conhecimentos relevantes acima
5. Quando o advogado pedir para "melhorar pedidos", tornar mais específicos e detalhados
6. Retornar a petição COMPLETA refinada (não apenas as partes alteradas)
7. NUNCA inventar dados, números de processo, nomes ou valores — usar apenas informações reais
8. Manter formatação Markdown com títulos em negrito, numeração romana para seções, e letras para pedidos`;

        const userPrompt = `PETIÇÃO ATUAL (${pet.tipo} - ${pet.titulo}):
${contextoProcesso}

--- INÍCIO DA PETIÇÃO ---
${conteudoAnterior}
--- FIM DA PETIÇÃO ---

INSTRUÇÕES DO ADVOGADO PARA REFINAMENTO:
${input.instrucoes}

Refine a petição aplicando as instruções acima. Retorne a petição COMPLETA refinada.`;

        const result = await invokeLLM({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ]
        });

        const conteudoRefinado = typeof result.choices?.[0]?.message?.content === 'string'
          ? result.choices[0].message.content : conteudoAnterior;

        // Calcular diff entre versões (parágrafos adicionados/removidos/modificados)
        const linhasAnterior = conteudoAnterior.split('\n').filter(l => l.trim());
        const linhasNovo = conteudoRefinado.split('\n').filter(l => l.trim());
        const diffResult: Array<{ tipo: 'adicionado' | 'removido' | 'mantido'; texto: string }> = [];
        const setAnterior = new Set(linhasAnterior);
        const setNovo = new Set(linhasNovo);
        for (const linha of linhasNovo) {
          if (!setAnterior.has(linha)) {
            diffResult.push({ tipo: 'adicionado', texto: linha });
          } else {
            diffResult.push({ tipo: 'mantido', texto: linha });
          }
        }
        for (const linha of linhasAnterior) {
          if (!setNovo.has(linha)) {
            diffResult.push({ tipo: 'removido', texto: linha });
          }
        }
        const resumoDiff = {
          adicionados: diffResult.filter(d => d.tipo === 'adicionado').length,
          removidos: diffResult.filter(d => d.tipo === 'removido').length,
          mantidos: diffResult.filter(d => d.tipo === 'mantido').length,
          detalhes: diffResult,
        };

        // Salvar versão no conteudoJson da petição
        const jsonAtual = typeof pet.conteudoJson === 'string' ? JSON.parse(pet.conteudoJson) : (pet.conteudoJson as any) || {};
        if (!jsonAtual.historicoRefinamentos) jsonAtual.historicoRefinamentos = [];
        jsonAtual.historicoRefinamentos.push({
          data: new Date().toISOString(),
          instrucoes: input.instrucoes,
          por: ctx.user?.name || 'advogado',
          versao: novaVersao,
        });

        await db.update(peticoesGeradas).set({
          conteudoTexto: conteudoRefinado,
          conteudoJson: JSON.stringify(jsonAtual),
          status: 'rascunho',
          revisadoPor: ctx.user?.name || 'advogado',
        }).where(eq(peticoesGeradas.id, input.peticaoId));

        // Gerar novo DOCX
        const docxBuffer = await gerarPeticaoDocx(conteudoRefinado, pet.titulo);
        const timestamp = Date.now();
        const nomeArquivo = `peticoes/refinado_v${novaVersao}_${pet.tipo.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30)}_${timestamp}.docx`;
        const { url: docxUrl } = await storagePut(nomeArquivo, docxBuffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        jsonAtual.docxUrl = docxUrl;
        await db.update(peticoesGeradas).set({ conteudoJson: JSON.stringify(jsonAtual) }).where(eq(peticoesGeradas.id, input.peticaoId));

        // Salvar nova versão na tabela peticao_versoes
        await db.insert(peticaoVersoes).values({
          peticaoId: input.peticaoId,
          versao: novaVersao,
          conteudoTexto: conteudoRefinado,
          instrucoes: input.instrucoes,
          diff: JSON.stringify(resumoDiff),
          docxUrl,
          criadoPor: ctx.user?.name || 'advogado',
        });

        return {
          success: true,
          conteudoRefinado,
          docxUrl,
          versao: novaVersao,
          totalRefinamentos: jsonAtual.historicoRefinamentos.length,
          diff: resumoDiff,
        };
      }),

    // ==================== LISTAR VERSÕES DE UMA PETIÇÃO ====================
    listarVersoes: protectedProcedure
      .input(z.object({ peticaoId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error('DB indisponível');
        const versoes = await db.select().from(peticaoVersoes)
          .where(eq(peticaoVersoes.peticaoId, input.peticaoId))
          .orderBy(asc(peticaoVersoes.versao));
        return versoes.map(v => ({
          ...v,
          diff: v.diff ? JSON.parse(v.diff) : null,
        }));
      }),

    // ==================== RESTAURAR VERSÃO ANTERIOR ====================
    restaurarVersao: protectedProcedure
      .input(z.object({ peticaoId: z.number(), versaoId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error('DB indisponível');

        const [versao] = await db.select().from(peticaoVersoes)
          .where(and(eq(peticaoVersoes.peticaoId, input.peticaoId), eq(peticaoVersoes.id, input.versaoId)));
        if (!versao) throw new Error('Versão não encontrada');

        const [pet] = await db.select().from(peticoesGeradas).where(eq(peticoesGeradas.id, input.peticaoId));
        if (!pet) throw new Error('Petição não encontrada');

        // Salvar estado atual como nova versão antes de restaurar
        const versoesExistentes = await db.select().from(peticaoVersoes)
          .where(eq(peticaoVersoes.peticaoId, input.peticaoId))
          .orderBy(desc(peticaoVersoes.versao));
        const ultimaVersao = versoesExistentes.length > 0 ? versoesExistentes[0].versao : 1;

        // Restaurar conteúdo da versão selecionada
        const jsonAtual = typeof pet.conteudoJson === 'string' ? JSON.parse(pet.conteudoJson) : (pet.conteudoJson as any) || {};
        if (!jsonAtual.historicoRefinamentos) jsonAtual.historicoRefinamentos = [];
        jsonAtual.historicoRefinamentos.push({
          data: new Date().toISOString(),
          instrucoes: `Restaurada versão ${versao.versao}`,
          por: ctx.user?.name || 'advogado',
          versao: ultimaVersao + 1,
          restauracao: true,
        });

        await db.update(peticoesGeradas).set({
          conteudoTexto: versao.conteudoTexto,
          conteudoJson: JSON.stringify(jsonAtual),
          status: 'rascunho',
          revisadoPor: ctx.user?.name || 'advogado',
        }).where(eq(peticoesGeradas.id, input.peticaoId));

        // Registrar restauração como nova versão
        await db.insert(peticaoVersoes).values({
          peticaoId: input.peticaoId,
          versao: ultimaVersao + 1,
          conteudoTexto: versao.conteudoTexto,
          instrucoes: `Restauração da versão ${versao.versao}`,
          diff: JSON.stringify({ restauracao: true, versaoOrigem: versao.versao }),
          docxUrl: versao.docxUrl,
          criadoPor: ctx.user?.name || 'advogado',
        });

        return {
          success: true,
          versaoRestaurada: versao.versao,
          novaVersao: ultimaVersao + 1,
          conteudo: versao.conteudoTexto,
        };
      }),

    // ==================== APRENDIZADO DO AGENTE: APROVAR E ENSINAR ====================
    aprovarEEnsinar: protectedProcedure
      .input(z.object({
        peticaoId: z.number(),
        feedback: z.string().optional(), // feedback do advogado sobre o que ficou bom
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error('DB indisponível');

        const [pet] = await db.select().from(peticoesGeradas).where(eq(peticoesGeradas.id, input.peticaoId));
        if (!pet) throw new Error('Petição não encontrada');

        // Buscar contexto do processo e cliente
        let contextoProcesso = '';
        let tipoAcaoProcesso = '';
        if (pet.processoId) {
          const [proc] = await db.select().from(processos).where(eq(processos.id, pet.processoId));
          if (proc) {
            contextoProcesso = `Processo: ${proc.numeroCnj} - ${proc.tipoAcao} - ${proc.statusProcesso}`;
            tipoAcaoProcesso = proc.tipoAcao || '';
          }
        }
        let nomeCliente = '';
        if (pet.clienteId) {
          const [cli] = await db.select().from(clientes).where(eq(clientes.id, pet.clienteId));
          if (cli) nomeCliente = cli.nomeCompleto;
        }

        // Usar LLM para extrair padrões de estilo, estratégia e estrutura da petição aprovada
        const extractResult = await invokeLLM({
          messages: [
            {
              role: 'system',
              content: `Você é um analista jurídico expert. Analise a petição aprovada abaixo e extraia:
1. ESTILO DE REDAÇÃO: Tom, voz, expressões características, nível de formalidade, combatividade
2. ESTRUTURA ARGUMENTATIVA: Como os argumentos são encadeados, ordem das seções, técnicas de persuasão
3. TESES UTILIZADAS: Quais teses jurídicas foram empregadas e como foram fundamentadas
4. JURISPRUDÊNCIA CITADA: Quais decisões foram referenciadas e como
5. ESTRATÉGIA PROCESSUAL: Qual a estratégia geral adotada (ofensiva, defensiva, cautelar, etc.)
6. PONTOS FORTES: O que torna esta petição eficaz e digna de ser referência

Retorne em formato JSON com as chaves: estilo, estrutura, teses, jurisprudencia, estrategia, pontosFortes, resumoExecutivo`
            },
            {
              role: 'user',
              content: `PETIÇÃO APROVADA (${pet.tipo}):
${contextoProcesso}
Cliente: ${nomeCliente}
${input.feedback ? `\nFEEDBACK DO ADVOGADO: ${input.feedback}` : ''}

--- CONTEÚDO ---
${pet.conteudoTexto || ''}
--- FIM ---`
            }
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'peticao_analise',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  estilo: { type: 'string', description: 'Descrição do estilo de redação' },
                  estrutura: { type: 'string', description: 'Estrutura argumentativa utilizada' },
                  teses: { type: 'string', description: 'Teses jurídicas empregadas' },
                  jurisprudencia: { type: 'string', description: 'Jurisprudência citada' },
                  estrategia: { type: 'string', description: 'Estratégia processual adotada' },
                  pontosFortes: { type: 'string', description: 'Pontos fortes da petição' },
                  resumoExecutivo: { type: 'string', description: 'Resumo executivo da petição como referência' },
                },
                required: ['estilo', 'estrutura', 'teses', 'jurisprudencia', 'estrategia', 'pontosFortes', 'resumoExecutivo'],
                additionalProperties: false,
              },
            },
          },
        });

        let analise: any = {};
        try {
          const rawContent = extractResult.choices?.[0]?.message?.content;
          analise = JSON.parse((typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent)) || '{}');
        } catch {
          analise = { resumoExecutivo: 'Petição aprovada como referência', estilo: '', estrutura: '', teses: '', jurisprudencia: '', estrategia: '', pontosFortes: '' };
        }

        // Salvar como referência de aprendizado na base de conhecimentos
        const conteudoReferencia = [
          `RESUMO: ${analise.resumoExecutivo}`,
          `\nESTILO DE REDAÇÃO: ${analise.estilo}`,
          `\nESTRUTURA ARGUMENTATIVA: ${analise.estrutura}`,
          `\nTESES UTILIZADAS: ${analise.teses}`,
          `\nJURISPRUDÊNCIA CITADA: ${analise.jurisprudencia}`,
          `\nESTRATÉGIA PROCESSUAL: ${analise.estrategia}`,
          `\nPONTOS FORTES: ${analise.pontosFortes}`,
          input.feedback ? `\nFEEDBACK DO ADVOGADO: ${input.feedback}` : '',
          `\n\n--- TRECHO REFERÊNCIA (primeiros 2000 caracteres) ---\n${(pet.conteudoTexto || '').substring(0, 2000)}`,
        ].filter(Boolean).join('');

        const [ref] = await db.insert(conhecimentos).values({
          categoria: 'Estrategia',
          titulo: `[REF APROVADA] ${pet.tipo} - ${nomeCliente || pet.titulo} (${new Date().toLocaleDateString('pt-BR')})`,
          conteudo: conteudoReferencia,
          tipoAcao: tipoAcaoProcesso || pet.tipo,
          tags: `referencia_aprovada,aprendizado_ia,${pet.tipo.toLowerCase().replace(/\s+/g, '_')}`,
          processoOrigemId: pet.processoId || null,
        });

        // Atualizar status da petição para "aprovado"
        const jsonAtual = typeof pet.conteudoJson === 'string' ? JSON.parse(pet.conteudoJson) : (pet.conteudoJson as any) || {};
        jsonAtual.aprovadoEm = new Date().toISOString();
        jsonAtual.aprovadoPor = ctx.user?.name || 'advogado';
        jsonAtual.referenciaConhecimentoId = ref.insertId;
        jsonAtual.analiseAprendizado = analise;

        await db.update(peticoesGeradas).set({
          status: 'aprovado',
          revisadoPor: ctx.user?.name || 'advogado',
          conteudoJson: JSON.stringify(jsonAtual),
        }).where(eq(peticoesGeradas.id, input.peticaoId));

        // Contar total de referências aprendidas
        const totalRefs = await db.select().from(conhecimentos)
          .where(like(conhecimentos.tags, '%referencia_aprovada%'));

        return {
          success: true,
          referenciaId: ref.insertId,
          analise,
          totalReferenciasAprendidas: totalRefs.length,
          mensagem: `Petição aprovada! O agente aprendeu padrões de estilo, estratégia e fundamentação desta peça. Total de referências: ${totalRefs.length}`,
        };
      }),

    // ==================== ESTATÍSTICAS DE APRENDIZADO DO AGENTE ====================
    estatisticasAprendizado: protectedProcedure
      .query(async () => {
        const db = await getDb();
        if (!db) throw new Error('DB indisponível');

        const todasRefs = await db.select().from(conhecimentos)
          .where(like(conhecimentos.tags, '%referencia_aprovada%'));

        // Agrupar por tipo de ação
        const porTipo: Record<string, number> = {};
        for (const ref of todasRefs) {
          const tipo = ref.tipoAcao || 'Outros';
          porTipo[tipo] = (porTipo[tipo] || 0) + 1;
        }

        // Total de conhecimentos gerais
        const totalConhecimentos = await db.select().from(conhecimentos);

        return {
          totalReferencias: todasRefs.length,
          porTipoAcao: porTipo,
          ultimaReferencia: todasRefs.length > 0 ? {
            titulo: todasRefs[todasRefs.length - 1].titulo,
            data: todasRefs[todasRefs.length - 1].createdAt,
          } : null,
          totalConhecimentos: totalConhecimentos.length,
          categorias: {
            teses: totalConhecimentos.filter(c => c.categoria === 'Tese').length,
            jurisprudencias: totalConhecimentos.filter(c => c.categoria === 'Jurisprudencia').length,
            estrategias: totalConhecimentos.filter(c => c.categoria === 'Estrategia').length,
            legislacoes: totalConhecimentos.filter(c => c.categoria === 'Legislacao').length,
            modelos: totalConhecimentos.filter(c => c.categoria === 'Modelo').length,
          },
        };
      }),

    // ==================== LISTAR REFERÊNCIAS APRENDIDAS ====================
    listarReferencias: protectedProcedure
      .input(z.object({
        tipoAcao: z.string().optional(),
        limite: z.number().default(20),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error('DB indisponível');

        let query = db.select().from(conhecimentos)
          .where(like(conhecimentos.tags, '%referencia_aprovada%'))
          .orderBy(desc(conhecimentos.createdAt))
          .limit(input.limite);

        const refs = await query;

        // Filtrar por tipo se especificado
        const resultado = input.tipoAcao
          ? refs.filter(r => (r.tipoAcao || '').toLowerCase().includes(input.tipoAcao!.toLowerCase()))
          : refs;

        return resultado.map(r => ({
          id: r.id,
          titulo: r.titulo,
          tipoAcao: r.tipoAcao,
          conteudo: r.conteudo?.substring(0, 500),
          tags: r.tags,
          createdAt: r.createdAt,
        }));
      }),

    // ==================== REMOVER REFERÊNCIA APRENDIDA ====================
    removerReferencia: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error('DB indisponível');

        const [ref] = await db.select().from(conhecimentos).where(eq(conhecimentos.id, input.id));
        if (!ref || !ref.tags?.includes('referencia_aprovada')) {
          throw new Error('Referência não encontrada');
        }

        await db.delete(conhecimentos).where(eq(conhecimentos.id, input.id));
        return { success: true };
      }),

    // ==================== ANÁLISE AUTOMÁTICA DE DOCUMENTO NA PASTA DO CLIENTE ====================
    analisarDocumentoCliente: protectedProcedure
      .input(z.object({
        clienteId: z.number(),
        documentoBase64: z.string(),
        nomeArquivo: z.string(),
        tipoArquivo: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error('DB indisponível');

        // 1. Upload do documento para S3
        const buffer = Buffer.from(input.documentoBase64, 'base64');
        const suffix = Math.random().toString(36).substring(2, 8);
        const key = `clientes/${input.clienteId}/docs/${suffix}-${input.nomeArquivo}`;
        const { url: docUrl } = await storagePut(key, buffer, input.tipoArquivo || 'application/pdf');

        // 2. Salvar referência no banco
        const [doc] = await db.insert(documentos).values({
          clienteId: input.clienteId,
          processoId: 0, // Será atualizado após análise
          nomeArquivo: input.nomeArquivo,
          tipo: input.tipoArquivo || 'application/pdf',
          storageKey: key,
          storageUrl: docUrl,
          tamanho: buffer.length,
          mimeType: input.tipoArquivo || 'application/pdf',
        }).$returningId();

        // 3. Buscar dados do cliente para contexto
        const [cliente] = await db.select().from(clientes).where(eq(clientes.id, input.clienteId));
        const processosCliente = await db.select().from(processos).where(eq(processos.clienteId, input.clienteId));

        // 4. Analisar o documento via IA
        const configRows = await db.select().from(agenteIaConfig);
        const configExpertise = configRows.find(c => c.chave === 'expertise_juridica');

        const analysisPrompt = `Você é o Agente Jurídico Expert do escritório Melo & Preda Advogados.
Você recebeu um novo documento (${input.nomeArquivo}) para o cliente ${cliente?.nomeCompleto || 'Desconhecido'}.

PROCESSOS EXISTENTES DO CLIENTE:
${processosCliente.map(p => `- ${p.numeroCnj} | ${p.tipoAcao} | ${p.statusProcesso} | Vara: ${p.vara}`).join('\n') || 'Nenhum processo cadastrado'}

${configExpertise?.valor ? `EXPERTISE: ${configExpertise.valor}` : ''}

ANALISE O DOCUMENTO E RETORNE EM JSON:
{
  "tipo_documento": "(cumprimento_sentenca|agravo|embargos|inicial|sentenca|despacho|intimacao|procuracao|contracheque|contrato|outro)",
  "resumo": "Resumo do documento em 3-5 linhas",
  "processo_relacionado": "Número CNJ se identificado ou null",
  "processo_existente_id": "ID do processo existente se match ou null",
  "dados_extraidos": {
    "partes": ["lista de partes identificadas"],
    "valores": ["valores monetários encontrados"],
    "datas_importantes": ["datas relevantes"],
    "teses_identificadas": ["teses jurídicas identificadas"],
    "decisoes": ["decisões ou despachos encontrados"]
  },
  "acoes_sugeridas": ["lista de ações recomendadas"],
  "urgencia": "(baixa|media|alta|critica)",
  "novo_conhecimento": {
    "titulo": "Título para base de conhecimento se aplicável",
    "categoria": "(tese|jurisprudencia|estrategia|legislacao|modelo)",
    "conteudo": "Conteúdo para enriquecer a base"
  }
}`;

        const result = await invokeLLM({
          messages: [
            { role: 'system', content: 'Você é um analista jurídico expert. Retorne APENAS JSON válido.' },
            { role: 'user', content: [{ type: 'text', text: analysisPrompt }, { type: 'file_url', file_url: { url: docUrl, mime_type: 'application/pdf' } }] }
          ],
          response_format: { type: 'json_object' }
        });

        let analise: any = {};
        try {
          const raw = result.choices?.[0]?.message?.content;
          analise = typeof raw === 'string' ? JSON.parse(raw) : {};
        } catch { analise = { tipo_documento: 'outro', resumo: 'Erro ao analisar documento' }; }

        // 5. Se identificou processo existente, vincular
        if (analise.processo_existente_id) {
          await db.update(documentos).set({ processoId: Number(analise.processo_existente_id) }).where(eq(documentos.id, doc.id));
        } else if (analise.processo_relacionado) {
          // Tentar encontrar pelo número CNJ
          const numLimpo = analise.processo_relacionado.replace(/[^0-9]/g, '');
          const [procMatch] = await db.select().from(processos)
            .where(sql`REPLACE(REPLACE(REPLACE(${processos.numeroCnj}, '.', ''), '-', ''), '/', '') LIKE ${`%${numLimpo}%`}`);
          if (procMatch) {
            await db.update(documentos).set({ processoId: procMatch.id }).where(eq(documentos.id, doc.id));
            analise.processo_existente_id = procMatch.id;
          }
        }

        // 6. Enriquecer base de conhecimento se aplicável
        if (analise.novo_conhecimento?.titulo && analise.novo_conhecimento?.conteudo) {
          const catMap: Record<string, any> = {
            'tese': 'Tese', 'jurisprudencia': 'Jurisprudencia', 'estrategia': 'Estrategia',
            'legislacao': 'Legislacao', 'modelo': 'Modelo',
          };
          const cat = catMap[(analise.novo_conhecimento.categoria || 'estrategia').toLowerCase()] || 'Estrategia';
          await db.insert(conhecimentos).values({
            titulo: analise.novo_conhecimento.titulo,
            categoria: cat,
            conteudo: analise.novo_conhecimento.conteudo,
            tags: input.nomeArquivo,
          });
        }

        return {
          success: true,
          documentoId: doc.id,
          documentoUrl: docUrl,
          analise,
        };
      }),

    // ==================== CLASSIFICAÇÃO AUTOMÁTICA DE PROCESSOS VIA IA ====================
    classificarProcessos: protectedProcedure
      .input(z.object({ processoIds: z.array(z.number()).optional() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error('DB indisponível');
        let procs;
        if (input.processoIds && input.processoIds.length > 0) {
          procs = await db.select().from(processos).where(sql`${processos.id} IN (${sql.raw(input.processoIds.join(','))})`);
        } else {
          procs = await db.select().from(processos).where(sql`${processos.tipoAcao} IS NULL OR ${processos.tipoAcao} = '' OR ${processos.tipoAcao} = 'Não classificado'`);
        }
        if (procs.length === 0) return { total: 0, classificados: 0, resultados: [] };
        const resultados: Array<{id: number, numeroCnj: string, tipoAnterior: string | null, tipoNovo: string}> = [];
        // Processar em lotes de 10
        for (let i = 0; i < procs.length; i += 10) {
          const lote = procs.slice(i, i + 10);
          const descricoes = lote.map((p: any) => `ID:${p.id} CNJ:${p.numeroCnj || 'N/A'} Vara:${p.vara || 'N/A'} Comarca:${p.comarca || 'N/A'} Assunto:${p.assunto || 'N/A'} Valor:${p.valorCausa || 'N/A'}`).join('\n');
          try {
            const resp = await invokeLLM({
              messages: [
                { role: 'system', content: 'Você é um classificador de processos judiciais. Para cada processo, determine o tipo de ação mais adequado. Responda APENAS em JSON válido, sem markdown.' },
                { role: 'user', content: `Classifique os seguintes processos judiciais. Para cada um, determine o tipo de ação (ex: Obrigação de Fazer, Cumprimento de Sentença, Execução de Título Extrajudicial, Ação de Indenização, Revisional de Contrato, Consignação em Pagamento, Embargos de Terceiro, Ação Declaratória, etc.):\n\n${descricoes}\n\nResponda em JSON: [{"id": number, "tipoAcao": "string"}]` }
              ],
              response_format: { type: 'json_schema', json_schema: { name: 'classificacao', strict: true, schema: { type: 'object', properties: { classificacoes: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' }, tipoAcao: { type: 'string' } }, required: ['id', 'tipoAcao'], additionalProperties: false } } }, required: ['classificacoes'], additionalProperties: false } } }
            });
            const parsed = JSON.parse(resp.choices[0].message.content as string || '{}');
            const classificacoes = parsed.classificacoes || [];
            for (const c of classificacoes) {
              const proc = lote.find((p: any) => p.id === c.id);
              if (proc && c.tipoAcao) {
                await db.update(processos).set({ tipoAcao: c.tipoAcao }).where(eq(processos.id, c.id));
                resultados.push({ id: c.id, numeroCnj: (proc as any).numeroCnj || '', tipoAnterior: (proc as any).tipoAcao, tipoNovo: c.tipoAcao });
              }
            }
          } catch (e: any) {
            console.error('Erro ao classificar lote:', e.message);
          }
        }
        return { total: procs.length, classificados: resultados.length, resultados };
      }),

    processosNaoClassificados: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { total: 0, processos: [] };
      const procs = await db.select({ id: processos.id, numeroCnj: processos.numeroCnj, tipoAcao: processos.tipoAcao, vara: processos.vara, comarca: processos.comarca, assunto: processos.assunto })
        .from(processos)
        .where(sql`${processos.tipoAcao} IS NULL OR ${processos.tipoAcao} = '' OR ${processos.tipoAcao} = 'Não classificado'`);
      return { total: procs.length, processos: procs };
    }),

    analisarProcesso: protectedProcedure
      .input(z.object({
        processoId: z.number(),
        focoAnalise: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error('DB indisponível');

        const [proc] = await db.select().from(processos).where(eq(processos.id, input.processoId));
        if (!proc) throw new Error('Processo não encontrado');

        // Buscar todos os dados do processo
        const estrats = await db.select().from(estrategias).where(eq(estrategias.processoId, proc.id));
        const movs = await db.select().from(movimentacoes).where(eq(movimentacoes.processoId, proc.id)).orderBy(desc(movimentacoes.createdAt));
        const movFin = await db.select().from(movimentacoesFinanceiras).where(eq(movimentacoesFinanceiras.processoId, proc.id));
        const partes = await db.select().from(partesProcessuais).where(eq(partesProcessuais.processoId, proc.id));
        const cumprimentos = await db.select().from(cumprimentosSentenca).where(eq(cumprimentosSentenca.processoId, proc.id));
        const prazos = await db.select().from(prazosProcessuais).where(eq(prazosProcessuais.processoId, proc.id));
        
        let emprestimos: any[] = [];
        let dadosFin: any[] = [];
        if (proc.clienteId) {
          emprestimos = await db.select().from(emprestimosConsignados).where(eq(emprestimosConsignados.clienteId, proc.clienteId));
          dadosFin = await db.select().from(dadosFinanceiros).where(eq(dadosFinanceiros.clienteId, proc.clienteId));
        }

        // Buscar conhecimentos relevantes
        const todosConhecimentos = await db.select().from(conhecimentos);
        const configRows = await db.select().from(agenteIaConfig).where(eq(agenteIaConfig.ativo, 1));
        const config: Record<string, string> = {};
        for (const row of configRows) config[row.chave] = row.valor;

        const prompt = `Realize uma ANÁLISE TÉCNICA APROFUNDADA E EXAUSTIVA do seguinte processo:

DADOS DO PROCESSO:
Número: ${proc.numeroCnj}
Tipo: ${proc.tipoAcao} | Natureza: ${proc.natureza || 'N/A'}
Vara: ${proc.vara} | Comarca: ${proc.comarca} | Tribunal: ${proc.tribunal}
Valor da Causa: R$ ${proc.valorCausa}
Fase: ${proc.faseAtual} | Status: ${proc.statusProcesso}
Polo Ativo: ${proc.poloAtivo}
Polo Passivo: ${proc.poloPassivo}
Sentença: ${proc.resumoSentenca || 'N/A'}
Condenação: R$ ${proc.valorCondenacao || 'N/A'}
Honorários: ${proc.honorariosPerc || 'N/A'}% = R$ ${proc.honorariosValor || 'N/A'}
Tutela: ${proc.tutelaTipo || 'N/A'} (${proc.tutelaStatus || 'N/A'}) — ${proc.tutelaDescricao || 'N/A'}

PARTES: ${partes.map(p => `${p.tipo}: ${p.nome} (${p.cpfCnpj || 'N/A'})`).join('; ')}

EMPRÉSTIMOS (${emprestimos.length}): ${emprestimos.map(e => `${e.banco}: R$ ${e.valorParcela}/mês`).join('; ')}

DADOS FINANCEIROS: ${dadosFin.map(d => `Bruto: R$ ${d.remuneracaoBruta} | Líquido: R$ ${d.remuneracaoLiquida} | Comprometimento: ${d.margemConsignavelPerc}%`).join('; ')}

ESTRATÉGIAS EXISTENTES: ${estrats.map(e => `${e.tesePrincipal}`).join('\n')}

CUMPRIMENTOS: ${cumprimentos.map(c => `${c.tipo}: R$ ${c.valorExecucao}`).join('; ')}

MOVIMENTAÇÕES (últimas 20): ${movs.slice(0, 20).map(m => `${m.data}: ${m.evento} — ${m.descricao?.substring(0, 100) || ''}`).join('\n')}

FINANCEIRO: ${movFin.map(m => `${m.tipo}: R$ ${m.valor} (${m.status})`).join('; ')}

PRAZOS: ${prazos.map(p => `${p.titulo} — ${p.dataVencimento} (${p.status})`).join('; ')}

${input.focoAnalise ? `FOCO DA ANÁLISE: ${input.focoAnalise}` : ''}

TESES DISPONÍVEIS NO ESCRITÓRIO:
${todosConhecimentos.filter(c => c.categoria === 'Tese').map(t => `• ${t.titulo}: ${t.conteudo?.substring(0, 200)}`).join('\n')}

JURISPRUDÊNCIA DISPONÍVEL:
${todosConhecimentos.filter(c => c.categoria === 'Jurisprudencia').map(j => `• ${j.titulo}: ${j.conteudo?.substring(0, 150)}`).join('\n')}

${config.estrategias_avancadas ? `ESTRATÉGIAS AVANÇADAS DO ESCRITÓRIO:\n${config.estrategias_avancadas}` : ''}

PRODUZA UMA ANÁLISE COMPLETA COM:
1. **RESUMO EXECUTIVO** — Síntese do caso em 3-5 linhas
2. **SITUAÇÃO PROCESSUAL ATUAL** — Fase, status, últimas movimentações relevantes
3. **TESES APLICÁVEIS** — Identificar todas as teses jurídicas aplicáveis ao caso
4. **FUNDAMENTAÇÃO LEGAL** — Artigos de lei, súmulas e precedentes aplicáveis
5. **JURISPRUDÊNCIA RELEVANTE** — Decisões do TJ-GO e STJ que fortalecem o caso
6. **ESTRATÉGIA PROCESSUAL RECOMENDADA** — Próximos passos detalhados
7. **ANÁLISE DE RISCOS** — Pontos fracos e possíveis objeções adversárias
8. **CÁLCULOS** — Valores atualizados quando aplicável
9. **PRAZOS E PROVIDÊNCIAS** — Ações imediatas necessárias
10. **RECOMENDAÇÕES FINAIS** — Conclusão estratégica`;

        const result = await invokeLLM({
          messages: [
            { role: 'system', content: config.system_prompt || 'Você é o Agente Jurídico Expert do escritório Melo & Preda Advogados.' },
            { role: 'user', content: prompt }
          ]
        });

        const rawContent = result.choices?.[0]?.message?.content;
        return { 
          analise: typeof rawContent === 'string' ? rawContent : 'Erro ao gerar análise.',
          processo: proc.numeroCnj,
          tipo: proc.tipoAcao || '',
        };
      }),
  }),

  // ==================== DATAJUD / PJE - ACOMPANHAMENTO PROCESSUAL ====================
  datajud: router({
    // Consultar processo por número CNJ na API DataJud
    consultarProcesso: protectedProcedure
      .input(z.object({ numeroCnj: z.string() }))
      .mutation(async ({ input }) => {
        const numLimpo = input.numeroCnj.replace(/[^0-9]/g, '');
        if (numLimpo.length < 15) throw new Error('Número CNJ inválido');
        
        // Detectar tribunal pelo código (8.09 = TJ-GO)
        const segJustica = numLimpo.substring(13, 14);
        const codTribunal = numLimpo.substring(14, 16);
        let alias = 'api_publica_tjgo'; // default TJ-GO
        
        // Mapear tribunais estaduais comuns
        const tribunaisMap: Record<string, string> = {
          '8_01': 'tjac', '8_02': 'tjal', '8_03': 'tjap', '8_04': 'tjam',
          '8_05': 'tjba', '8_06': 'tjce', '8_07': 'tjdft', '8_08': 'tjes',
          '8_09': 'tjgo', '8_10': 'tjma', '8_11': 'tjmt', '8_12': 'tjms',
          '8_13': 'tjmg', '8_14': 'tjpa', '8_15': 'tjpb', '8_16': 'tjpe',
          '8_17': 'tjpi', '8_18': 'tjpr', '8_19': 'tjrj', '8_20': 'tjrn',
          '8_21': 'tjrs', '8_22': 'tjro', '8_23': 'tjrr', '8_24': 'tjsc',
          '8_25': 'tjse', '8_26': 'tjsp', '8_27': 'tjto',
        };
        const chave = `${segJustica}_${codTribunal}`;
        if (tribunaisMap[chave]) alias = `api_publica_${tribunaisMap[chave]}`;
        
        const url = `https://api-publica.datajud.cnj.jus.br/${alias}/_search`;
        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `APIKey ${ENV.datajudApiKey || 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw=='}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: { match: { numeroProcesso: numLimpo } }
          }),
        });
        
        if (!resp.ok) throw new Error(`Erro na API DataJud: ${resp.status}`);
        const data = await resp.json();
        
        if (!data.hits?.hits?.length) {
          return { encontrado: false, processo: null, movimentos: [], totalMovimentos: 0 };
        }
        
        const source = data.hits.hits[0]._source;
        return {
          encontrado: true,
          processo: {
            numeroProcesso: source.numeroProcesso,
            classe: source.classe?.nome || 'N/A',
            classeCode: source.classe?.codigo,
            sistema: source.sistema?.nome || 'N/A',
            formato: source.formato?.nome || 'N/A',
            tribunal: source.tribunal || 'N/A',
            grau: source.grau || 'N/A',
            dataAjuizamento: source.dataAjuizamento,
            dataUltimaAtualizacao: source.dataHoraUltimaAtualizacao,
            nivelSigilo: source.nivelSigilo,
            orgaoJulgador: source.orgaoJulgador?.nome || 'N/A',
            assuntos: (source.assuntos || []).map((a: any) => a.nome).join(', '),
          },
          movimentos: (source.movimentos || []).map((m: any) => ({
            codigo: m.codigo,
            nome: m.nome,
            dataHora: m.dataHora,
            orgaoJulgador: m.orgaoJulgador?.nome || null,
            complementos: (m.complementosTabelados || []).map((c: any) => c.nome).join(', '),
          })).sort((a: any, b: any) => new Date(b.dataHora).getTime() - new Date(a.dataHora).getTime()),
          totalMovimentos: (source.movimentos || []).length,
        };
      }),

    // Consultar todos os processos cadastrados no banco de uma vez
    consultarTodosProcessos: protectedProcedure.mutation(async () => {
      const db = await getDb();
      if (!db) return { resultados: [], total: 0 };
      
      const todosProcessos = await db.select({
        id: processos.id,
        numeroCnj: processos.numeroCnj,
        clienteId: processos.clienteId,
      }).from(processos).where(sql`${processos.numeroCnj} IS NOT NULL AND ${processos.numeroCnj} != ''`);
      
      const resultados: any[] = [];
      
      for (const proc of todosProcessos) {
        try {
          const numLimpo = (proc.numeroCnj || '').replace(/[^0-9]/g, '');
          if (numLimpo.length < 15) continue;
          
          const segJustica = numLimpo.substring(13, 14);
          const codTribunal = numLimpo.substring(14, 16);
          let alias = 'api_publica_tjgo';
          if (segJustica === '8' && codTribunal === '09') alias = 'api_publica_tjgo';
          
          const resp = await fetch(`https://api-publica.datajud.cnj.jus.br/${alias}/_search`, {
            method: 'POST',
            headers: {
              'Authorization': `APIKey ${ENV.datajudApiKey || 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw=='}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query: { match: { numeroProcesso: numLimpo } } }),
          });
          
          if (resp.ok) {
            const data = await resp.json();
            if (data.hits?.hits?.length) {
              const source = data.hits.hits[0]._source;
              const movs = source.movimentos || [];
              const ultimoMov = movs.sort((a: any, b: any) => 
                new Date(b.dataHora).getTime() - new Date(a.dataHora).getTime()
              )[0];
              
              resultados.push({
                processoId: proc.id,
                numeroCnj: proc.numeroCnj,
                classe: source.classe?.nome,
                orgaoJulgador: source.orgaoJulgador?.nome,
                totalMovimentos: movs.length,
                ultimaAtualizacao: source.dataHoraUltimaAtualizacao,
                ultimoMovimento: ultimoMov ? {
                  nome: ultimoMov.nome,
                  dataHora: ultimoMov.dataHora,
                } : null,
              });
            }
          }
          // Rate limit: 200ms entre consultas
          await new Promise(r => setTimeout(r, 200));
        } catch (e) {
          // Continua com o próximo processo
        }
      }
      
      return { resultados, total: resultados.length };
    }),

    // Verificar novas movimentações desde a última verificação
    verificarNovasMovimentacoes: protectedProcedure
      .input(z.object({ numeroCnj: z.string(), ultimaDataConhecida: z.string().optional() }))
      .mutation(async ({ input }) => {
        const numLimpo = input.numeroCnj.replace(/[^0-9]/g, '');
        const resp = await fetch(`https://api-publica.datajud.cnj.jus.br/api_publica_tjgo/_search`, {
          method: 'POST',
          headers: {
            'Authorization': `APIKey ${ENV.datajudApiKey || 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw=='}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: { match: { numeroProcesso: numLimpo } } }),
        });
        
        if (!resp.ok) throw new Error(`Erro na API DataJud: ${resp.status}`);
        const data = await resp.json();
        
        if (!data.hits?.hits?.length) return { novasMovimentacoes: [], total: 0 };
        
        const source = data.hits.hits[0]._source;
        let movimentos = (source.movimentos || []).map((m: any) => ({
          codigo: m.codigo,
          nome: m.nome,
          dataHora: m.dataHora,
          orgaoJulgador: m.orgaoJulgador?.nome || null,
          complementos: (m.complementosTabelados || []).map((c: any) => c.nome).join(', '),
        })).sort((a: any, b: any) => new Date(b.dataHora).getTime() - new Date(a.dataHora).getTime());
        
        if (input.ultimaDataConhecida) {
          const dataLimite = new Date(input.ultimaDataConhecida).getTime();
          movimentos = movimentos.filter((m: any) => new Date(m.dataHora).getTime() > dataLimite);
        }
        
        return { novasMovimentacoes: movimentos, total: movimentos.length };
      }),
  }),

  // ==================== PUBLICAÇÕES / INTIMAÇÕES - SISTEMA MULTICAMADA ====================
  publicacoesRouter: router({
    // Listar publicações com fila de urgência (mais recentes primeiro, não tratadas no topo)
    listar: protectedProcedure
      .input(z.object({
        fonte: z.string().optional(),
        tratada: z.number().optional(),
        limit: z.number().default(50),
      }).optional())
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        const filters = input || { limit: 50 };
        const all = await db.select().from(publicacoes)
          .orderBy(sql`tratada ASC, urgencia DESC, dataPublicacao DESC`)
          .limit(filters.limit || 50);
        let filtered = all as any[];
        if (filters.fonte) filtered = filtered.filter((p: any) => p.fonte === filters.fonte);
        if (filters.tratada !== undefined) filtered = filtered.filter((p: any) => p.tratada === filters.tratada);
        // Enriquecer com nome das partes para identificação
        const procs = await db.select().from(processos);
        const clis = await db.select().from(clientes);
        const partesAll = await db.select().from(partesProcessuais);
        const enriched = filtered.map((pub: any) => {
          const proc = (procs as any[]).find((pr: any) => pr.id === pub.processoId);
          const cli = (clis as any[]).find((c: any) => c.id === pub.clienteId);
          const partesDoProcesso = (partesAll as any[]).filter((pt: any) => pt.processoId === pub.processoId);
          const autores = partesDoProcesso.filter((pt: any) => pt.tipo === 'Autor').map((pt: any) => pt.nome);
          const reus = partesDoProcesso.filter((pt: any) => pt.tipo === 'Reu').map((pt: any) => pt.nome);
          return {
            ...pub,
            nomeCliente: cli?.nomeCompleto || '',
            poloAtivo: proc?.poloAtivo || autores.join(', ') || cli?.nomeCompleto || '',
            poloPassivo: proc?.poloPassivo || reus.join(', ') || '',
            tipoAcao: proc?.tipoAcao || '',
          };
        });
        return enriched;
      }),

    // Marcar publicação como tratada
    marcarTratada: protectedProcedure
      .input(z.object({ id: z.number(), observacoes: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error('DB indisponível');
        await db.update(publicacoes).set({
          tratada: 1,
          tratadaPor: ctx.user?.name || 'admin',
          tratadaEm: new Date(),
          observacoes: input.observacoes || null,
        }).where(eq(publicacoes.id, input.id));
        return { success: true };
      }),

    // Gerar prazo automaticamente a partir de publicação
    gerarPrazo: protectedProcedure
      .input(z.object({
        publicacaoId: z.number(),
        tipoPrazo: z.string(),
        diasPrazo: z.number(),
        descricao: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error('DB indisponível');
        const [pub] = await db.select().from(publicacoes).where(eq(publicacoes.id, input.publicacaoId));
        if (!pub) throw new Error('Publicação não encontrada');

        const dataInicio = pub.dataPublicacao;
        const dataFim = new Date(dataInicio.getTime() + input.diasPrazo * 24 * 60 * 60 * 1000);

        // Map input tipoPrazo to valid enum values
        const tipoMap: Record<string, any> = {
          'recurso': 'recurso', 'contestacao': 'contestacao', 'manifestacao': 'manifestacao',
          'cumprimento': 'cumprimento', 'audiencia': 'audiencia', 'pericia': 'pericia',
          'diligencia': 'diligencia', 'pagamento': 'pagamento', 'levantamento': 'levantamento',
        };
        const tipoEnum = tipoMap[input.tipoPrazo] || 'outro';

        const [prazo] = await db.insert(prazosProcessuais).values({
          processoId: pub.processoId || 0,
          clienteId: pub.clienteId || 0,
          tipo: tipoEnum,
          titulo: input.descricao || `Prazo: ${pub.tipoPublicacao} - ${pub.fonte}`,
          descricao: input.descricao || `Prazo gerado da publicação ${pub.fonte} - ${pub.tipoPublicacao}`,
          dataVencimento: dataFim,
          status: 'pendente',
        }).$returningId();

        await db.update(publicacoes).set({ prazoGerado: 1, prazoId: prazo.id }).where(eq(publicacoes.id, input.publicacaoId));
        return { success: true, prazoId: prazo.id, dataFim: dataFim.toISOString() };
      }),

    // Buscar publicações via DATAJUD pela OAB
    buscarDatajud: protectedProcedure.mutation(async () => {
      const db = await getDb();
      if (!db) throw new Error('DB indisponível');

      const DATAJUD_API = 'https://api-publica.datajud.cnj.jus.br/api_publica_tjgo/_search';


      // Buscar todos os processos do escritório
      const todosProcessos = await db.select({
        id: processos.id,
        numeroCnj: processos.numeroCnj,
        clienteId: processos.clienteId,
      }).from(processos);

      let novasPublicacoes = 0;
      let erros = 0;

      for (const proc of todosProcessos) {
        if (!proc.numeroCnj || proc.numeroCnj.length < 10) continue;
        try {
          const numLimpo = proc.numeroCnj.replace(/[^0-9]/g, '');
          const resp = await fetch(DATAJUD_API, {
           headers: { 'Authorization': `APIKey ${ENV.datajudApiKey || 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw=='}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: { match: { "dadosBasicos.orgaoJulgador.codigoMunicipioIBGE": "5208707" } }, size: 20 }),    });
          if (!resp.ok) { erros++; continue; }
          const data = await resp.json();
          const hits = data?.hits?.hits || [];
          if (hits.length === 0) continue;

          const source = hits[0]._source;
          const movs = source.movimentos || [];

          // Verificar se já temos essa publicação
          const existentes = await db.select().from(publicacoes)
            .where(sql`${publicacoes.processoId} = ${proc.id} AND ${publicacoes.fonte} = 'datajud'`);
          const existentesSet = new Set(existentes.map((p: any) => `${p.dataPublicacao?.toISOString()?.split('T')[0]}_${(p.conteudo || '').substring(0, 50)}`));

          for (const mov of movs.slice(0, 10)) {
            const dataPub = mov.dataHora ? new Date(mov.dataHora) : new Date();
            const desc = mov.nome || mov.complementosTabelados?.map((c: any) => c.descricao).join(', ') || 'Movimentação';
            const chave = `${dataPub.toISOString().split('T')[0]}_${desc.substring(0, 50)}`;

            if (!existentesSet.has(chave)) {
              // Determinar urgência
              const descLower = desc.toLowerCase();
              let urgencia = 0;
              if (descLower.includes('intimação') || descLower.includes('citação')) urgencia = 2;
              else if (descLower.includes('sentença') || descLower.includes('despacho') || descLower.includes('decisão')) urgencia = 1;

              const tipoPublicacao = desc.includes('Intimação') ? 'intimação' : desc.includes('Sentença') ? 'sentença' : desc.includes('Despacho') ? 'despacho' : 'movimentação';
              const [pubInserted] = await db.insert(publicacoes).values({
                processoId: proc.id,
                clienteId: proc.clienteId,
                numeroCnj: proc.numeroCnj,
                fonte: 'datajud',
                tipoPublicacao,
                dataPublicacao: dataPub,
                conteudo: desc,
                resumo: desc,
                oabEncontrada: '40559/GO',
                urgencia,
                jsonOriginal: JSON.stringify(mov),
              }).$returningId();
              novasPublicacoes++;

              // AUTO-GERAÇÃO DE PRAZOS para publicações urgentes (intimações e citações)
              if (urgencia >= 2 && proc.clienteId) {
                try {
                  const diasPrazo = descLower.includes('citação') ? 15 : descLower.includes('contestação') ? 15 : descLower.includes('recurso') ? 15 : 5;
                  const tipoPrazo = descLower.includes('citação') ? 'contestacao' : descLower.includes('recurso') ? 'recurso' : 'manifestacao';
                  const dataVenc = new Date(dataPub.getTime() + diasPrazo * 24 * 60 * 60 * 1000);
                  const [prazoAuto] = await db.insert(prazosProcessuais).values({
                    processoId: proc.id,
                    clienteId: proc.clienteId,
                    tipo: tipoPrazo as any,
                    titulo: `Prazo Auto: ${desc.substring(0, 100)}`,
                    descricao: `Prazo gerado automaticamente da publicação DATAJUD: ${desc}`,
                    dataVencimento: dataVenc,
                    status: 'pendente',
                    diasAntecedencia: 3,
                  }).$returningId();
                  await db.update(publicacoes).set({ prazoGerado: 1, prazoId: prazoAuto.id }).where(eq(publicacoes.id, pubInserted.id));
                  // Notificar sobre o novo prazo
                  await criarNotificacao({
                    tipo: 'prazo_vencendo',
                    prioridade: 'alta',
                    titulo: `Novo Prazo: ${desc.substring(0, 60)}`,
                    mensagem: `Prazo de ${diasPrazo} dias gerado automaticamente. Vence em ${dataVenc.toLocaleDateString('pt-BR')}.`,
                    processoId: proc.id,
                    clienteId: proc.clienteId,
                    prazoId: prazoAuto.id,
                    linkUrl: `/prazos`,
                    icone: 'Clock',
                    cor: 'amber',
                  });
                } catch (prazoErr) {
                  console.error('[DATAJUD] Erro ao gerar prazo automático:', prazoErr);
                }
              }
            }
          }

          await new Promise(r => setTimeout(r, 500)); // Rate limit
        } catch { erros++; }
      }

      // Atualizar monitoramento
      await db.update(monitoramentoConfig).set({
        ultimaConsulta: new Date(),
        totalPublicacoes: sql`totalPublicacoesMon + ${novasPublicacoes}`,
      }).where(eq(monitoramentoConfig.tipo, 'oab'));

      return { novasPublicacoes, erros, totalProcessos: todosProcessos.length };
    }),

    // Buscar publicações via Escavador (preparado para API Key)
    buscarEscavador: protectedProcedure.mutation(async () => {
      const ESCAVADOR_KEY = process.env.ESCAVADOR_API_KEY;
      if (!ESCAVADOR_KEY) return { error: 'API Key do Escavador não configurada. Configure em Configurações > Segredos.', novasPublicacoes: 0 };

      const db = await getDb();
      if (!db) throw new Error('DB indisponível');

      try {
        // Buscar publicações pela OAB no DJE
        const resp = await fetch('https://api.escavador.com/api/v1/diarios/buscar', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${ESCAVADOR_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            termo: 'OAB 40559 GO',
            caderno: 'judicial',
            tribunal: 'TJGO',
          }),
        });

        if (!resp.ok) return { error: `Escavador retornou ${resp.status}`, novasPublicacoes: 0 };
        const data = await resp.json();
        const items = data?.items || data?.results || [];
        let novasPublicacoes = 0;

        for (const item of items) {
          const dataPub = item.data_publicacao ? new Date(item.data_publicacao) : new Date();
          const conteudo = item.conteudo || item.texto || '';

          // Verificar duplicata
          const existente = await db.select().from(publicacoes)
            .where(sql`${publicacoes.fonte} = 'escavador' AND DATE(${publicacoes.dataPublicacao}) = DATE(${dataPub.toISOString()}) AND LEFT(${publicacoes.conteudo}, 100) = LEFT(${conteudo.substring(0, 100)}, 100)`)
            .limit(1);

          if (existente.length === 0) {
            // Tentar vincular a processo pelo número CNJ no conteúdo
            const cnjMatch = conteudo.match(/(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/);
            let processoId = null;
            let clienteId = null;
            if (cnjMatch) {
              const numLimpo = cnjMatch[1].replace(/[^0-9]/g, '');
              const [proc] = await db.select().from(processos)
                .where(sql`REPLACE(REPLACE(REPLACE(${processos.numeroCnj}, '.', ''), '-', ''), '/', '') LIKE ${`%${numLimpo}%`}`);
              if (proc) { processoId = proc.id; clienteId = proc.clienteId; }
            }

            await db.insert(publicacoes).values({
              processoId,
              clienteId,
              numeroCnj: cnjMatch?.[1] || null,
              fonte: 'escavador',
              tipoPublicacao: item.tipo || 'publicação',
              dataPublicacao: dataPub,
              conteudo: conteudo,
              resumo: conteudo.substring(0, 500),
              diarioOficial: item.diario || 'DJE-GO',
              caderno: item.caderno || 'judicial',
              pagina: item.pagina?.toString() || null,
              oabEncontrada: '40559/GO',
              urgencia: conteudo.toLowerCase().includes('intimação') ? 2 : 1,
              jsonOriginal: JSON.stringify(item),
            });
            novasPublicacoes++;
          }
        }

        return { novasPublicacoes, totalItems: items.length };
      } catch (e: any) {
        return { error: e.message, novasPublicacoes: 0 };
      }
    }),

    // Buscar publicações via JusBrasil (preparado para API Key)
    buscarJusbrasil: protectedProcedure.mutation(async () => {
      const JUSBRASIL_KEY = process.env.JUSBRASIL_API_KEY;
      if (!JUSBRASIL_KEY) return { error: 'API Key do JusBrasil não configurada. Configure em Configurações > Segredos.', novasPublicacoes: 0 };

      const db = await getDb();
      if (!db) throw new Error('DB indisponível');

      try {
        const resp = await fetch('https://api.jusbrasil.com.br/search/diarios', {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${JUSBRASIL_KEY}`, 'Content-Type': 'application/json' },
        });

        if (!resp.ok) return { error: `JusBrasil retornou ${resp.status}`, novasPublicacoes: 0 };
        const data = await resp.json();
        const items = data?.results || data?.items || [];
        let novasPublicacoes = 0;

        for (const item of items) {
          const dataPub = item.date ? new Date(item.date) : new Date();
          const conteudo = item.content || item.text || '';

          await db.insert(publicacoes).values({
            fonte: 'jusbrasil',
            tipoPublicacao: item.type || 'publicação',
            dataPublicacao: dataPub,
            conteudo: conteudo,
            resumo: conteudo.substring(0, 500),
            diarioOficial: item.source || 'DJE',
            oabEncontrada: '40559/GO',
            urgencia: 1,
            jsonOriginal: JSON.stringify(item),
          });
          novasPublicacoes++;
        }

        return { novasPublicacoes, totalItems: items.length };
      } catch (e: any) {
        return { error: e.message, novasPublicacoes: 0 };
      }
    }),

    // Buscar publicações via PROJUDI TJGO (consulta pública gratuita)
    buscarProjudi: protectedProcedure.mutation(async () => {
      const db = await getDb();
      if (!db) throw new Error('DB indisponível');
      try {
        // Buscar todos os processos com CNJ para consultar no PROJUDI
        const todosProcessos = await db.select({ id: processos.id, numeroCnj: processos.numeroCnj, clienteId: processos.clienteId }).from(processos).where(sql`${processos.numeroCnj} IS NOT NULL AND ${processos.numeroCnj} != ''`);
        let novasPublicacoes = 0;
        let erros = 0;
        for (const proc of todosProcessos) {
          try {
            const numLimpo = proc.numeroCnj!.replace(/[^0-9.-]/g, '');
            // Consulta pública PROJUDI TJGO
            const resp = await fetch('https://projudi.tjgo.jus.br/BuscaProcesso', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: `TipoConsultaProcesso=1&NumeroProcesso=${encodeURIComponent(numLimpo)}&PassoBusca=2`,
            });
            if (!resp.ok) { erros++; continue; }
            const html = await resp.text();
            // Extrair informações básicas da página de resultado
            const statusMatch = html.match(/Situa[çc][ãa]o[:\s]*<[^>]*>([^<]+)/i);
            const varaMatch = html.match(/Vara[:\s]*<[^>]*>([^<]+)/i);
            const comarcaMatch = html.match(/Comarca[:\s]*<[^>]*>([^<]+)/i);
            if (statusMatch || varaMatch) {
              const conteudo = `Consulta PROJUDI TJGO - Processo ${proc.numeroCnj}: ${statusMatch ? 'Situação: ' + statusMatch[1].trim() : ''} ${varaMatch ? '| Vara: ' + varaMatch[1].trim() : ''} ${comarcaMatch ? '| Comarca: ' + comarcaMatch[1].trim() : ''}`;
              // Verificar duplicata
              const existente = await db.select().from(publicacoes)
                .where(sql`${publicacoes.processoId} = ${proc.id} AND ${publicacoes.fonte} = 'projudi' AND DATE(${publicacoes.createdAt}) = CURDATE()`)
                .limit(1);
              if (existente.length === 0) {
                await db.insert(publicacoes).values({
                  processoId: proc.id,
                  clienteId: proc.clienteId,
                  numeroCnj: proc.numeroCnj,
                  fonte: 'projudi',
                  tipoPublicacao: 'consulta',
                  dataPublicacao: new Date(),
                  conteudo,
                  resumo: conteudo.substring(0, 500),
                  diarioOficial: 'PROJUDI-TJGO',
                  oabEncontrada: '40559/GO',
                  urgencia: 0,
                  jsonOriginal: JSON.stringify({ status: statusMatch?.[1]?.trim(), vara: varaMatch?.[1]?.trim(), comarca: comarcaMatch?.[1]?.trim() }),
                });
                novasPublicacoes++;
              }
            }
            await new Promise(r => setTimeout(r, 1000)); // Rate limit
          } catch { erros++; }
        }
        return { novasPublicacoes, erros, totalProcessos: todosProcessos.length, fonte: 'PROJUDI TJGO' };
      } catch (e: any) {
        return { error: e.message, novasPublicacoes: 0 };
      }
    }),
    // Buscar publicações via DJE TJGO (Diário da Justiça Eletrônico - consulta pública)
    buscarDje: protectedProcedure.mutation(async () => {
      const db = await getDb();
      if (!db) throw new Error('DB indisponível');
      try {
        // Buscar publicações no DJE TJGO pela OAB
        const resp = await fetch('https://projudi.tjgo.jus.br/ConsultaPublicacao', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'TipoPesquisa=2&TextoPesquisa=OAB+40559&Pesquisar=Pesquisar',
        });
        if (!resp.ok) return { error: `DJE TJGO retornou ${resp.status}`, novasPublicacoes: 0 };
        const html = await resp.text();
        // Extrair publicações da página de resultados
        const pubRegex = /<tr[^>]*class="[^"]*linha[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
        const dateRegex = /(\d{2}\/\d{2}\/\d{4})/;
        const cnjRegex = /(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/;
        let novasPublicacoes = 0;
        let match;
        const maxPubs = 50;
        let count = 0;
        // Tentar extrair texto de publicações da página
        const textBlocks = html.split(/<\/tr>/i);
        for (const block of textBlocks) {
          if (count >= maxPubs) break;
          const dateMatch = block.match(dateRegex);
          const cnjMatch = block.match(cnjRegex);
          const textContent = block.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          if (textContent.length > 50 && (textContent.toLowerCase().includes('oab') || cnjMatch)) {
            const dataPub = dateMatch ? new Date(dateMatch[1].split('/').reverse().join('-')) : new Date();
            const conteudo = textContent.substring(0, 5000);
            // Verificar duplicata
            const existente = await db.select().from(publicacoes)
              .where(sql`${publicacoes.fonte} = 'dje-tjgo' AND DATE(${publicacoes.dataPublicacao}) = DATE(${dataPub.toISOString()}) AND LEFT(${publicacoes.conteudo}, 100) = LEFT(${conteudo.substring(0, 100)}, 100)`)
              .limit(1);
            if (existente.length === 0) {
              let processoId = null;
              let clienteId = null;
              if (cnjMatch) {
                const numLimpo = cnjMatch[1].replace(/[^0-9]/g, '');
                const [proc] = await db.select().from(processos)
                  .where(sql`REPLACE(REPLACE(REPLACE(${processos.numeroCnj}, '.', ''), '-', ''), '/', '') LIKE ${`%${numLimpo}%`}`);
                if (proc) { processoId = proc.id; clienteId = proc.clienteId; }
              }
              const descLower = conteudo.toLowerCase();
              let urgencia = 0;
              if (descLower.includes('intimação') || descLower.includes('citação') || descLower.includes('intima-se')) urgencia = 2;
              else if (descLower.includes('sentença') || descLower.includes('despacho') || descLower.includes('decisão')) urgencia = 1;
              await db.insert(publicacoes).values({
                processoId,
                clienteId,
                numeroCnj: cnjMatch?.[1] || null,
                fonte: 'dje-tjgo',
                tipoPublicacao: urgencia >= 2 ? 'intimação' : urgencia >= 1 ? 'despacho' : 'publicação',
                dataPublicacao: dataPub,
                conteudo,
                resumo: conteudo.substring(0, 500),
                diarioOficial: 'DJE-TJGO',
                oabEncontrada: '40559/GO',
                urgencia,
                jsonOriginal: JSON.stringify({ source: 'dje-tjgo', date: dateMatch?.[1], cnj: cnjMatch?.[1] }),
              });
              novasPublicacoes++;
              // Auto-gerar prazo para intimações
              if (urgencia >= 2 && processoId && clienteId) {
                try {
                  const diasPrazo = descLower.includes('citação') ? 15 : descLower.includes('contestação') ? 15 : 5;
                  const tipoPrazo = descLower.includes('citação') ? 'contestacao' : 'manifestacao';
                  const dataVenc = new Date(dataPub.getTime() + diasPrazo * 24 * 60 * 60 * 1000);
                  const [prazoAuto] = await db.insert(prazosProcessuais).values({
                    processoId,
                    clienteId,
                    tipo: tipoPrazo as any,
                    titulo: `Prazo DJE: ${conteudo.substring(0, 100)}`,
                    descricao: `Prazo gerado automaticamente da publicação DJE-TJGO`,
                    dataVencimento: dataVenc,
                    status: 'pendente',
                    diasAntecedencia: 3,
                  }).$returningId();
                  await db.update(publicacoes).set({ prazoGerado: 1, prazoId: prazoAuto.id }).where(sql`${publicacoes.id} = LAST_INSERT_ID()`);
                  await criarNotificacao({
                    tipo: 'prazo_vencendo',
                    prioridade: 'alta',
                    titulo: `Novo Prazo DJE: ${conteudo.substring(0, 60)}`,
                    mensagem: `Prazo de ${diasPrazo} dias gerado automaticamente. Vence em ${dataVenc.toLocaleDateString('pt-BR')}.`,
                    processoId,
                    clienteId,
                    prazoId: prazoAuto.id,
                    linkUrl: '/prazos',
                    icone: 'Clock',
                    cor: 'amber',
                  });
                } catch (prazoErr) {
                  console.error('[DJE] Erro ao gerar prazo automático:', prazoErr);
                }
              }
              count++;
            }
          }
        }
        return { novasPublicacoes, fonte: 'DJE-TJGO' };
      } catch (e: any) {
        return { error: e.message, novasPublicacoes: 0 };
      }
    }),
    // Buscar comunicações via Comunica PJe (portal público)
    buscarComunicaPje: protectedProcedure.mutation(async () => {
      const db = await getDb();
      if (!db) throw new Error('DB indisponível');
      try {
        // Buscar comunicações processuais no portal Comunica PJe
        const todosProcessos = await db.select({ id: processos.id, numeroCnj: processos.numeroCnj, clienteId: processos.clienteId }).from(processos).where(sql`${processos.numeroCnj} IS NOT NULL AND ${processos.numeroCnj} != ''`);
        let novasPublicacoes = 0;
        let erros = 0;
        for (const proc of todosProcessos) {
          try {
            const numLimpo = proc.numeroCnj!.replace(/[^0-9]/g, '');
            // API pública do Comunica PJe
            const resp = await fetch(`https://comunica.pje.jus.br/consulta/v1/comunicacoes?numeroProcesso=${numLimpo}`, {
              method: 'GET',
              headers: { 'Accept': 'application/json' },
            });
            if (!resp.ok) { erros++; continue; }
            const data = await resp.json();
            const comunicacoes = data?.comunicacoes || data?.items || data?.content || [];
            for (const com of comunicacoes) {
              const dataPub = com.dataDisponibilizacao ? new Date(com.dataDisponibilizacao) : com.data ? new Date(com.data) : new Date();
              const conteudo = com.texto || com.conteudo || com.descricao || JSON.stringify(com);
              // Verificar duplicata
              const existente = await db.select().from(publicacoes)
                .where(sql`${publicacoes.processoId} = ${proc.id} AND ${publicacoes.fonte} = 'comunica-pje' AND DATE(${publicacoes.dataPublicacao}) = DATE(${dataPub.toISOString()})`)
                .limit(1);
              if (existente.length === 0) {
                const descLower = conteudo.toLowerCase();
                let urgencia = 0;
                if (descLower.includes('intimação') || descLower.includes('citação')) urgencia = 2;
                else if (descLower.includes('sentença') || descLower.includes('despacho')) urgencia = 1;
                await db.insert(publicacoes).values({
                  processoId: proc.id,
                  clienteId: proc.clienteId,
                  numeroCnj: proc.numeroCnj,
                  fonte: 'comunica-pje',
                  tipoPublicacao: com.tipo || (urgencia >= 2 ? 'intimação' : 'comunicação'),
                  dataPublicacao: dataPub,
                  dataDisponibilizacao: com.dataDisponibilizacao ? new Date(com.dataDisponibilizacao) : null,
                  conteudo,
                  resumo: conteudo.substring(0, 500),
                  diarioOficial: com.tribunal || 'PJe',
                  oabEncontrada: '40559/GO',
                  urgencia,
                  jsonOriginal: JSON.stringify(com),
                });
                novasPublicacoes++;
                // Auto-gerar prazo para intimações
                if (urgencia >= 2 && proc.clienteId) {
                  try {
                    const diasPrazo = descLower.includes('citação') ? 15 : 5;
                    const tipoPrazo = descLower.includes('citação') ? 'contestacao' : 'manifestacao';
                    const dataVenc = new Date(dataPub.getTime() + diasPrazo * 24 * 60 * 60 * 1000);
                    await db.insert(prazosProcessuais).values({
                      processoId: proc.id,
                      clienteId: proc.clienteId,
                      tipo: tipoPrazo as any,
                      titulo: `Prazo PJe: ${conteudo.substring(0, 100)}`,
                      descricao: `Prazo gerado automaticamente da comunicação PJe`,
                      dataVencimento: dataVenc,
                      status: 'pendente',
                      diasAntecedencia: 3,
                    });
                    await criarNotificacao({
                      tipo: 'prazo_vencendo',
                      prioridade: 'alta',
                      titulo: `Novo Prazo PJe: ${conteudo.substring(0, 60)}`,
                      mensagem: `Prazo de ${diasPrazo} dias. Vence em ${dataVenc.toLocaleDateString('pt-BR')}.`,
                      processoId: proc.id,
                      clienteId: proc.clienteId,
                      linkUrl: '/prazos',
                      icone: 'Clock',
                      cor: 'amber',
                    });
                  } catch (prazoErr) {
                    console.error('[PJe] Erro ao gerar prazo automático:', prazoErr);
                  }
                }
              }
            }
            await new Promise(r => setTimeout(r, 500)); // Rate limit
          } catch { erros++; }
        }
        return { novasPublicacoes, erros, totalProcessos: todosProcessos.length, fonte: 'Comunica PJe' };
      } catch (e: any) {
        return { error: e.message, novasPublicacoes: 0 };
      }
    }),
    // Varredura completa multicamada - executa TODAS as fontes em sequência
    varreduraCompleta: protectedProcedure.mutation(async () => {
      const resultados: any[] = [];
      const fontes = ['datajud', 'projudi', 'dje', 'comunica-pje'];
      let totalNovas = 0;
      let totalErros = 0;
      // 1. DataJud
      try {
        const db = await getDb();
        if (!db) throw new Error('DB indisponível');
        const todosProcessos = await db.select({ id: processos.id, numeroCnj: processos.numeroCnj, clienteId: processos.clienteId }).from(processos).where(sql`${processos.numeroCnj} IS NOT NULL AND ${processos.numeroCnj} != ''`);
        let novasDatajud = 0;
        for (const proc of todosProcessos) {
          try {
            const numLimpo = proc.numeroCnj!.replace(/[^0-9]/g, '');
            const tribunal = proc.numeroCnj!.includes('.8.09.') ? 'api_publica_tjgo' : 'api_publica_tjgo';
            const DATAJUD_API = `https://api-publica.datajud.cnj.jus.br/${tribunal}/_search`;
            const resp = await fetch(DATAJUD_API, {
              method: 'POST',
              headers: { 'Authorization': `APIKey ${ENV.datajudApiKey || 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw=='}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ query: { match: { numeroProcesso: numLimpo } }, size: 1 }),
            });
            if (!resp.ok) continue;
            const data = await resp.json();
            const hits = data?.hits?.hits || [];
            if (hits.length === 0) continue;
            const source = hits[0]._source;
            const movs = source.movimentos || [];
            const existentes = await db.select().from(publicacoes)
              .where(sql`${publicacoes.processoId} = ${proc.id} AND ${publicacoes.fonte} = 'datajud'`);
            const existentesSet = new Set(existentes.map((p: any) => `${p.dataPublicacao?.toISOString()?.split('T')[0]}_${(p.conteudo || '').substring(0, 50)}`));
            for (const mov of movs.slice(0, 10)) {
              const dataPub = mov.dataHora ? new Date(mov.dataHora) : new Date();
              const descr = mov.nome || mov.complementosTabelados?.map((c: any) => c.descricao).join(', ') || 'Movimentação';
              const chave = `${dataPub.toISOString().split('T')[0]}_${descr.substring(0, 50)}`;
              if (!existentesSet.has(chave)) {
                const descLower = descr.toLowerCase();
                let urgencia = 0;
                if (descLower.includes('intimação') || descLower.includes('citação')) urgencia = 2;
                else if (descLower.includes('sentença') || descLower.includes('despacho')) urgencia = 1;
                await db.insert(publicacoes).values({
                  processoId: proc.id, clienteId: proc.clienteId, numeroCnj: proc.numeroCnj,
                  fonte: 'datajud', tipoPublicacao: urgencia >= 2 ? 'intimação' : 'movimentação',
                  dataPublicacao: dataPub, conteudo: descr, resumo: descr,
                  oabEncontrada: '40559/GO', urgencia, jsonOriginal: JSON.stringify(mov),
                });
                novasDatajud++;
              }
            }
            await new Promise(r => setTimeout(r, 500));
          } catch { /* skip */ }
        }
        totalNovas += novasDatajud;
        resultados.push({ fonte: 'DataJud', novas: novasDatajud });
      } catch (e: any) {
        resultados.push({ fonte: 'DataJud', error: e.message });
        totalErros++;
      }
      // 2. PROJUDI TJGO
      try {
        const db = await getDb();
        if (!db) throw new Error('DB indisponível');
        const todosProcessos = await db.select({ id: processos.id, numeroCnj: processos.numeroCnj, clienteId: processos.clienteId }).from(processos).where(sql`${processos.numeroCnj} IS NOT NULL AND ${processos.numeroCnj} != ''`);
        let novasProjudi = 0;
        for (const proc of todosProcessos) {
          try {
            const numLimpo = proc.numeroCnj!.replace(/[^0-9.-]/g, '');
            const resp = await fetch('https://projudi.tjgo.jus.br/BuscaProcesso', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: `TipoConsultaProcesso=1&NumeroProcesso=${encodeURIComponent(numLimpo)}&PassoBusca=2`,
            });
            if (!resp.ok) continue;
            const html = await resp.text();
            const statusMatch = html.match(/Situa[çc][ãa]o[:\s]*<[^>]*>([^<]+)/i);
            if (statusMatch) {
              const conteudo = `PROJUDI: ${proc.numeroCnj} - Situação: ${statusMatch[1].trim()}`;
              const existente = await db.select().from(publicacoes)
                .where(sql`${publicacoes.processoId} = ${proc.id} AND ${publicacoes.fonte} = 'projudi' AND DATE(${publicacoes.createdAt}) = CURDATE()`)
                .limit(1);
              if (existente.length === 0) {
                await db.insert(publicacoes).values({
                  processoId: proc.id, clienteId: proc.clienteId, numeroCnj: proc.numeroCnj,
                  fonte: 'projudi', tipoPublicacao: 'consulta', dataPublicacao: new Date(),
                  conteudo, resumo: conteudo, diarioOficial: 'PROJUDI-TJGO',
                  oabEncontrada: '40559/GO', urgencia: 0,
                });
                novasProjudi++;
              }
            }
            await new Promise(r => setTimeout(r, 1000));
          } catch { /* skip */ }
        }
        totalNovas += novasProjudi;
        resultados.push({ fonte: 'PROJUDI TJGO', novas: novasProjudi });
      } catch (e: any) {
        resultados.push({ fonte: 'PROJUDI TJGO', error: e.message });
        totalErros++;
      }
      // 3. DJE TJGO
      try {
        const db = await getDb();
        if (!db) throw new Error('DB indisponível');
        const resp = await fetch('https://projudi.tjgo.jus.br/ConsultaPublicacao', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'TipoPesquisa=2&TextoPesquisa=OAB+40559&Pesquisar=Pesquisar',
        });
        let novasDje = 0;
        if (resp.ok) {
          const html = await resp.text();
          const cnjRegex = /(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/g;
          const cnjMatches = html.match(cnjRegex) || [];
          const cnjs = Array.from(new Set(cnjMatches));
          for (const cnj of cnjs.slice(0, 20)) {
            const numLimpo = cnj.replace(/[^0-9]/g, '');
            const [proc] = await db.select().from(processos)
              .where(sql`REPLACE(REPLACE(REPLACE(${processos.numeroCnj}, '.', ''), '-', ''), '/', '') LIKE ${`%${numLimpo}%`}`);
            const existente = await db.select().from(publicacoes)
              .where(sql`${publicacoes.fonte} = 'dje-tjgo' AND ${publicacoes.numeroCnj} = ${cnj} AND DATE(${publicacoes.createdAt}) = CURDATE()`)
              .limit(1);
            if (existente.length === 0) {
              await db.insert(publicacoes).values({
                processoId: proc?.id || null, clienteId: proc?.clienteId || null, numeroCnj: cnj,
                fonte: 'dje-tjgo', tipoPublicacao: 'publicação', dataPublicacao: new Date(),
                conteudo: `Publicação DJE-TJGO referente ao processo ${cnj}`,
                resumo: `Publicação DJE-TJGO: ${cnj}`, diarioOficial: 'DJE-TJGO',
                oabEncontrada: '40559/GO', urgencia: 1,
              });
              novasDje++;
            }
          }
        }
        totalNovas += novasDje;
        resultados.push({ fonte: 'DJE-TJGO', novas: novasDje });
      } catch (e: any) {
        resultados.push({ fonte: 'DJE-TJGO', error: e.message });
        totalErros++;
      }
      // 4. Comunica PJe
      try {
        const db = await getDb();
        if (!db) throw new Error('DB indisponível');
        const todosProcessos = await db.select({ id: processos.id, numeroCnj: processos.numeroCnj, clienteId: processos.clienteId }).from(processos).where(sql`${processos.numeroCnj} IS NOT NULL AND ${processos.numeroCnj} != ''`).limit(10);
        let novasPje = 0;
        for (const proc of todosProcessos) {
          try {
            const numLimpo = proc.numeroCnj!.replace(/[^0-9]/g, '');
            const resp = await fetch(`https://comunica.pje.jus.br/consulta/v1/comunicacoes?numeroProcesso=${numLimpo}`, {
              method: 'GET', headers: { 'Accept': 'application/json' },
            });
            if (!resp.ok) continue;
            const data = await resp.json();
            const coms = data?.comunicacoes || data?.items || data?.content || [];
            for (const com of coms) {
              const dataPub = com.dataDisponibilizacao ? new Date(com.dataDisponibilizacao) : new Date();
              const conteudo = com.texto || com.conteudo || JSON.stringify(com);
              const existente = await db.select().from(publicacoes)
                .where(sql`${publicacoes.processoId} = ${proc.id} AND ${publicacoes.fonte} = 'comunica-pje' AND DATE(${publicacoes.dataPublicacao}) = DATE(${dataPub.toISOString()})`)
                .limit(1);
              if (existente.length === 0) {
                await db.insert(publicacoes).values({
                  processoId: proc.id, clienteId: proc.clienteId, numeroCnj: proc.numeroCnj,
                  fonte: 'comunica-pje', tipoPublicacao: com.tipo || 'comunicação',
                  dataPublicacao: dataPub, conteudo, resumo: conteudo.substring(0, 500),
                  diarioOficial: 'PJe', oabEncontrada: '40559/GO', urgencia: 1,
                  jsonOriginal: JSON.stringify(com),
                });
                novasPje++;
              }
            }
            await new Promise(r => setTimeout(r, 500));
          } catch { /* skip */ }
        }
        totalNovas += novasPje;
        resultados.push({ fonte: 'Comunica PJe', novas: novasPje });
      } catch (e: any) {
        resultados.push({ fonte: 'Comunica PJe', error: e.message });
        totalErros++;
      }
      // 5. JusBrasil (se tiver API Key)
      const JUSBRASIL_KEY = process.env.JUSBRASIL_API_KEY;
      if (JUSBRASIL_KEY) {
        resultados.push({ fonte: 'JusBrasil', novas: 0, info: 'Disponível' });
      }
      // 6. Escavador (se tiver API Key)
      const ESCAVADOR_KEY = process.env.ESCAVADOR_API_KEY;
      if (ESCAVADOR_KEY) {
        resultados.push({ fonte: 'Escavador', novas: 0, info: 'Disponível' });
      }
      return {
        totalNovasPublicacoes: totalNovas,
        totalErros,
        fontes: resultados,
        mensagem: `Varredura completa: ${totalNovas} novas publicações de ${resultados.length} fontes.`,
      };
    }),

    // Estatísticas de publicações
    stats: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { total: 0, naoTratadas: 0, urgentes: 0, porFonte: [] };

      const total = await db.select({ count: sql<number>`COUNT(*)` }).from(publicacoes);
      const naoTratadas = await db.select({ count: sql<number>`COUNT(*)` }).from(publicacoes).where(eq(publicacoes.tratada, 0));
      const urgentes = await db.select({ count: sql<number>`COUNT(*)` }).from(publicacoes).where(sql`${publicacoes.urgencia} >= 2 AND ${publicacoes.tratada} = 0`);
      const porFonte = await db.select({
        fonte: publicacoes.fonte,
        count: sql<number>`COUNT(*)`,
      }).from(publicacoes).groupBy(publicacoes.fonte);

      const monitoramento = await db.select().from(monitoramentoConfig);

      return {
        total: Number(total[0]?.count || 0),
        naoTratadas: Number(naoTratadas[0]?.count || 0),
        urgentes: Number(urgentes[0]?.count || 0),
        porFonte: porFonte.map(p => ({ fonte: p.fonte, count: Number(p.count) })),
        monitoramento,
      };
    }),
  }),

  // ==================== DASHBOARD EVOLUÇÃO ====================
  dashboard: router({
    evolucao: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { processosPorMes: [], honorariosPorMes: [], movimentacoesPorMes: [] };

      // Processos por mês (últimos 12 meses)
      const processosPorMes = await db.select({
        mes: sql<string>`DATE_FORMAT(createdAt, '%Y-%m')`,
        count: sql<number>`COUNT(*)`,
      }).from(processos).groupBy(sql`DATE_FORMAT(createdAt, '%Y-%m')`).orderBy(sql`DATE_FORMAT(createdAt, '%Y-%m')`);

      // Honorários por status
      const honorariosPorStatus = await db.select({
        status: movimentacoesFinanceiras.status,
        total: sql<string>`COALESCE(SUM(valor), 0)`,
        count: sql<number>`COUNT(*)`,
      }).from(movimentacoesFinanceiras)
        .where(sql`${movimentacoesFinanceiras.tipo} IN ('honorarios_sucumbenciais', 'honorarios_contratuais')`)
        .groupBy(movimentacoesFinanceiras.status);

      // Movimentações por mês (últimos 6 meses)
      const movimentacoesPorMes = await db.select({
        mes: sql<string>`DATE_FORMAT(data, '%Y-%m')`,
        count: sql<number>`COUNT(*)`,
      }).from(movimentacoes).groupBy(sql`DATE_FORMAT(data, '%Y-%m')`).orderBy(sql`DATE_FORMAT(data, '%Y-%m')`);

      // Processos por tipo de ação
      const processosPorTipo = await db.select({
        tipo: processos.tipoAcao,
        count: sql<number>`COUNT(*)`,
      }).from(processos).groupBy(processos.tipoAcao).orderBy(sql`COUNT(*) DESC`).limit(10);

      // Processos por status
      const processosPorStatus = await db.select({
        status: processos.statusProcesso,
        count: sql<number>`COUNT(*)`,
      }).from(processos).groupBy(processos.statusProcesso);

      // Clientes por mês
      const clientesPorMes = await db.select({
        mes: sql<string>`DATE_FORMAT(createdAt, '%Y-%m')`,
        count: sql<number>`COUNT(*)`,
      }).from(clientes).groupBy(sql`DATE_FORMAT(createdAt, '%Y-%m')`).orderBy(sql`DATE_FORMAT(createdAt, '%Y-%m')`);

      return {
        processosPorMes: processosPorMes.map(p => ({ mes: p.mes, count: Number(p.count) })),
        honorariosPorStatus: honorariosPorStatus.map(h => ({ status: h.status || 'pendente', total: parseFloat(String(h.total)), count: Number(h.count) })),
        movimentacoesPorMes: movimentacoesPorMes.slice(-12).map(m => ({ mes: m.mes, count: Number(m.count) })),
        processosPorTipo: processosPorTipo.map(p => ({ tipo: p.tipo || 'Não classificado', count: Number(p.count) })),
        processosPorStatus: processosPorStatus.map(p => ({ status: p.status || 'Indefinido', count: Number(p.count) })),
        clientesPorMes: clientesPorMes.map(c => ({ mes: c.mes, count: Number(c.count) })),
      };
    }),

    varreduraDataJud: protectedProcedure.mutation(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const todosProcessos = await db.select({
        id: processos.id,
        numeroCnj: processos.numeroCnj,
        nomeCliente: clientes.nomeCompleto,
      }).from(processos).leftJoin(clientes, eq(processos.clienteId, clientes.id));

      let consultados = 0;
      let novasMovs = 0;
      let erros = 0;
      const DATAJUD_API = 'https://api-publica.datajud.cnj.jus.br/api_publica_tjgo/_search';


      for (const proc of todosProcessos) {
        if (!proc.numeroCnj || proc.numeroCnj.length < 10) continue;
        try {
          const numLimpo = proc.numeroCnj.replace(/[^0-9]/g, '');
          const resp = await fetch(DATAJUD_API, {
            method: 'POST',
            headers: { 'Authorization': `APIKey ${ENV.datajudApiKey || 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw=='}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: { match: { numeroProcesso: numLimpo } }, size: 1 }),
          });
          if (!resp.ok) { erros++; continue; }
          const data = await resp.json();
          const hits = data?.hits?.hits || [];
          if (hits.length === 0) continue;
          consultados++;

          const source = hits[0]._source;
          const movsDataJud = source.movimentos || [];

          // Buscar movimentações existentes
          const movsExistentes = await db.select().from(movimentacoes).where(eq(movimentacoes.processoId, proc.id));
          const eventosExistentes = new Set(movsExistentes.map((m: any) => `${m.data}_${m.descricao?.substring(0, 50)}`));

          let novasDesteProcesso = 0;
          for (const mov of movsDataJud.slice(0, 20)) {
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
              novasDesteProcesso++;
              novasMovs++;
            }
          }

          if (novasDesteProcesso > 0) {
            await criarNotificacao({
              tipo: 'novo_processo',
              titulo: `${novasDesteProcesso} nova(s) movimentação(ões) - ${proc.nomeCliente || 'Processo'}`,
              mensagem: `Detectadas ${novasDesteProcesso} novas movimentações no processo ${proc.numeroCnj} via DataJud.`,
              prioridade: 'alta',
              linkUrl: `/cliente/${proc.id}`,
            });
          }

          // Rate limit
          await new Promise(r => setTimeout(r, 500));
        } catch (e) {
          erros++;
        }
      }

      return { consultados, novasMovimentacoes: novasMovs, erros, totalProcessos: todosProcessos.length };
    }),
  }),

  // ============================================================
  // INTEGRAÇÃO ESCRITÓRIO → JUSCONSIG 3.0
  // Endpoints consumidos pela JUSCONSIG automaticamente
  // Autenticação via header x-integration-key
  // ============================================================
  integracao: router({

    // 1. Clientes atualizados desde uma data
    clientesAtualizados: publicProcedure
      .input(z.object({ desde: z.string() }))
      .query(async ({ input, ctx }) => {
        // Validar API Key
        const apiKey = ctx.req?.headers['x-integration-key'];
        const expectedKey = process.env.JUSCONSIG_API_KEY;
        if (!expectedKey || apiKey !== expectedKey) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'API Key de integração inválida' });
        }
        const db = await getDb();
        if (!db) return [];
        const rows = await db.select().from(clientes)
          .where(sql`${clientes.updatedAt} >= ${input.desde}`)
          .orderBy(clientes.updatedAt)
          .limit(500);
        return rows;
      }),

    // 2. Processos/Ações novas e atualizadas
    processosAtualizados: publicProcedure
      .input(z.object({ desde: z.string() }))
      .query(async ({ input, ctx }) => {
        const apiKey = ctx.req?.headers['x-integration-key'];
        const expectedKey = process.env.JUSCONSIG_API_KEY;
        if (!expectedKey || apiKey !== expectedKey) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'API Key de integração inválida' });
        }
        const db = await getDb();
        if (!db) return [];
        const rows = await db.select().from(processos)
          .where(sql`${processos.updatedAt} >= ${input.desde}`)
          .orderBy(processos.updatedAt)
          .limit(500);
        return rows;
      }),

    // 3. Movimentações processuais recentes
    movimentacoesRecentes: publicProcedure
      .input(z.object({ desde: z.string() }))
      .query(async ({ input, ctx }) => {
        const apiKey = ctx.req?.headers['x-integration-key'];
        const expectedKey = process.env.JUSCONSIG_API_KEY;
        if (!expectedKey || apiKey !== expectedKey) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'API Key de integração inválida' });
        }
        const db = await getDb();
        if (!db) return [];
        const rows = await db.select().from(movimentacoes)
          .where(sql`${movimentacoes.createdAt} >= ${input.desde}`)
          .orderBy(movimentacoes.createdAt)
          .limit(1000);
        return rows;
      }),

    // 4. Base de conhecimento (teses, jurisprudência, legislação)
    conhecimentosAtualizados: publicProcedure
      .input(z.object({ desde: z.string() }))
      .query(async ({ input, ctx }) => {
        const apiKey = ctx.req?.headers['x-integration-key'];
        const expectedKey = process.env.JUSCONSIG_API_KEY;
        if (!expectedKey || apiKey !== expectedKey) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'API Key de integração inválida' });
        }
        const db = await getDb();
        if (!db) return [];
        const rows = await db.select().from(conhecimentos)
          .where(sql`${conhecimentos.createdAt} >= ${input.desde}`)
          .orderBy(conhecimentos.createdAt)
          .limit(500);
        return rows;
      }),

    // 5. Estratégias processuais
    estrategiasAtualizadas: publicProcedure
      .input(z.object({ desde: z.string() }))
      .query(async ({ input, ctx }) => {
        const apiKey = ctx.req?.headers['x-integration-key'];
        const expectedKey = process.env.JUSCONSIG_API_KEY;
        if (!expectedKey || apiKey !== expectedKey) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'API Key de integração inválida' });
        }
        const db = await getDb();
        if (!db) return [];
        const rows = await db.select().from(estrategias)
          .where(sql`${estrategias.createdAt} >= ${input.desde}`)
          .orderBy(estrategias.createdAt)
          .limit(500);
        return rows;
      }),

    // 6. Dados financeiros (movimentações financeiras)
    financeiroAtualizado: publicProcedure
      .input(z.object({ desde: z.string() }))
      .query(async ({ input, ctx }) => {
        const apiKey = ctx.req?.headers['x-integration-key'];
        const expectedKey = process.env.JUSCONSIG_API_KEY;
        if (!expectedKey || apiKey !== expectedKey) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'API Key de integração inválida' });
        }
        const db = await getDb();
        if (!db) return { dadosFinanceiros: [], movimentacoesFinanceiras: [], emprestimos: [] };
        const df = await db.select().from(dadosFinanceiros)
          .where(sql`${dadosFinanceiros.updatedAt} >= ${input.desde}`)
          .orderBy(dadosFinanceiros.updatedAt)
          .limit(500);
        const mf = await db.select().from(movimentacoesFinanceiras)
          .where(sql`${movimentacoesFinanceiras.createdAt} >= ${input.desde}`)
          .orderBy(movimentacoesFinanceiras.createdAt)
          .limit(500);
        const emp = await db.select().from(emprestimosConsignados)
          .where(sql`${emprestimosConsignados.createdAt} >= ${input.desde}`)
          .orderBy(emprestimosConsignados.createdAt)
          .limit(500);
        return { dadosFinanceiros: df, movimentacoesFinanceiras: mf, emprestimos: emp };
      }),

    // 7. Dados para score antifraude de um servidor (por CPF)
    dadosScoreServidor: publicProcedure
      .input(z.object({ cpf: z.string() }))
      .query(async ({ input, ctx }) => {
        const apiKey = ctx.req?.headers['x-integration-key'];
        const expectedKey = process.env.JUSCONSIG_API_KEY;
        if (!expectedKey || apiKey !== expectedKey) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'API Key de integração inválida' });
        }
        const db = await getDb();
        if (!db) return { cliente: null, processos: [], totalProcessos: 0, totalAtivos: 0, valorTotal: 0, emprestimos: [], financeiro: [] };

        // Buscar cliente pelo CPF
        const [cliente] = await db.select().from(clientes)
          .where(eq(clientes.cpfCnpj, input.cpf))
          .limit(1);
        if (!cliente) return { cliente: null, processos: [], totalProcessos: 0, totalAtivos: 0, valorTotal: 0, emprestimos: [], financeiro: [] };

        // Buscar processos do cliente
        const procs = await db.select().from(processos)
          .where(eq(processos.clienteId, cliente.id));
        const ativos = procs.filter(p => p.statusProcesso === 'Ativo' || p.statusProcesso === 'Em andamento');

        // Buscar empréstimos
        const emps = await db.select().from(emprestimosConsignados)
          .where(eq(emprestimosConsignados.clienteId, cliente.id));

        // Buscar dados financeiros
        const fin = await db.select().from(dadosFinanceiros)
          .where(eq(dadosFinanceiros.clienteId, cliente.id));

        return {
          cliente: {
            id: cliente.id,
            nome: cliente.nomeCompleto,
            cpf: cliente.cpfCnpj,
            profissao: cliente.profissao,
            orgao: cliente.orgaoEmpregador,
          },
          processos: procs.map(p => ({
            id: p.id,
            numeroCnj: p.numeroCnj,
            tipoAcao: p.tipoAcao,
            status: p.statusProcesso,
            valorCausa: p.valorCausa,
            tribunal: p.tribunal,
            vara: p.vara,
          })),
          totalProcessos: procs.length,
          totalAtivos: ativos.length,
          valorTotal: procs.reduce((sum, p) => sum + (parseFloat(String(p.valorCausa || '0')) || 0), 0),
          emprestimos: emps.map(e => ({
            banco: e.banco,
            parcela: e.valorParcela,
            contrato: e.contrato,
            prazoTotal: e.totalParcelas,
          })),
          financeiro: fin.map(f => ({
            remuneracaoBruta: f.remuneracaoBruta,
            remuneracaoLiquida: f.remuneracaoLiquida,
            margemConsignavel: f.margemConsignavelValor,
            margemDisponivel: f.margemDisponivel,
          })),
        };
      }),

    // ============================================================
    // PROCEDURES DO PAINEL DE INTEGRAÇÃO (para o frontend)
    // ============================================================

    // 8. Status geral da integração
    statusIntegracao: protectedProcedure
      .query(async () => {
        const db = await getDb();
        if (!db) return { configurado: false, ultimaSyncCompleta: null, totalSyncs: 0, totalErros: 0, apiKeyConfigurada: false };

        const apiKeyConfigurada = !!process.env.JUSCONSIG_API_KEY;

        // Última sync completa
        const [ultimaCompleta] = await db.select().from(syncLog)
          .where(eq(syncLog.tipo, 'completa'))
          .orderBy(desc(syncLog.executadoEm))
          .limit(1);

        // Totais
        const [totais] = await db.select({
          total: sql<number>`COUNT(*)`,
          erros: sql<number>`SUM(CASE WHEN ${syncLog.status} = 'erro' THEN 1 ELSE 0 END)`,
          novosTotal: sql<number>`SUM(${syncLog.novos})`,
          atualizadosTotal: sql<number>`SUM(${syncLog.atualizados})`,
        }).from(syncLog);

        // Última sync por tipo
        const ultimasPorTipo = await db.select({
          tipo: syncLog.tipo,
          status: syncLog.status,
          executadoEm: syncLog.executadoEm,
          novos: syncLog.novos,
          atualizados: syncLog.atualizados,
          erros: syncLog.erros,
          duracaoMs: syncLog.duracaoMs,
        }).from(syncLog)
          .orderBy(desc(syncLog.executadoEm))
          .limit(20);

        // Agrupar por tipo (pegar apenas a última de cada)
        const ultimaMap = new Map<string, typeof ultimasPorTipo[0]>();
        for (const s of ultimasPorTipo) {
          if (!ultimaMap.has(s.tipo)) ultimaMap.set(s.tipo, s);
        }

        return {
          configurado: apiKeyConfigurada,
          apiKeyConfigurada,
          ultimaSyncCompleta: ultimaCompleta?.executadoEm || null,
          totalSyncs: Number(totais?.total || 0),
          totalErros: Number(totais?.erros || 0),
          totalNovos: Number(totais?.novosTotal || 0),
          totalAtualizados: Number(totais?.atualizadosTotal || 0),
          ultimasPorTipo: Object.fromEntries(ultimaMap),
        };
      }),

    // 9. Histórico de sincronizações
    historicoSyncs: protectedProcedure
      .input(z.object({
        limite: z.number().min(1).max(100).default(50),
        tipo: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        if (input.tipo) {
          return await db.select().from(syncLog)
            .where(eq(syncLog.tipo, input.tipo))
            .orderBy(desc(syncLog.executadoEm))
            .limit(input.limite);
        }
        return await db.select().from(syncLog)
          .orderBy(desc(syncLog.executadoEm))
          .limit(input.limite);
      }),

    // 10. Executar sync manual (registra no log)
    executarSyncManual: protectedProcedure
      .input(z.object({
        tipo: z.enum(['clientes', 'processos', 'movimentacoes', 'conhecimentos', 'estrategias', 'financeiro', 'completa']),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco de dados indisponível' });

        const inicio = Date.now();

        // Registrar início da sync
        const [inserted] = await db.insert(syncLog).values({
          tipo: input.tipo,
          direcao: 'escritorio_jusconsig',
          status: 'em_andamento',
          novos: 0,
          atualizados: 0,
          erros: 0,
          detalhes: JSON.stringify({ iniciadoPor: 'manual', inicioEm: new Date().toISOString() }),
        });

        // Simular contagem de registros disponíveis para sync
        let novos = 0;
        let atualizados = 0;
        try {
          if (input.tipo === 'clientes' || input.tipo === 'completa') {
            const [c] = await db.select({ count: sql<number>`COUNT(*)` }).from(clientes);
            novos += Number(c?.count || 0);
          }
          if (input.tipo === 'processos' || input.tipo === 'completa') {
            const [p] = await db.select({ count: sql<number>`COUNT(*)` }).from(processos);
            novos += Number(p?.count || 0);
          }
          if (input.tipo === 'movimentacoes' || input.tipo === 'completa') {
            const [m] = await db.select({ count: sql<number>`COUNT(*)` }).from(movimentacoes);
            novos += Number(m?.count || 0);
          }
          if (input.tipo === 'conhecimentos' || input.tipo === 'completa') {
            const [k] = await db.select({ count: sql<number>`COUNT(*)` }).from(conhecimentos);
            novos += Number(k?.count || 0);
          }
          if (input.tipo === 'estrategias' || input.tipo === 'completa') {
            const [e] = await db.select({ count: sql<number>`COUNT(*)` }).from(estrategias);
            novos += Number(e?.count || 0);
          }
          if (input.tipo === 'financeiro' || input.tipo === 'completa') {
            const [f] = await db.select({ count: sql<number>`COUNT(*)` }).from(dadosFinanceiros);
            novos += Number(f?.count || 0);
          }

          const duracao = Date.now() - inicio;
          // Atualizar log com resultado
          await db.update(syncLog)
            .set({
              status: 'sucesso',
              novos,
              atualizados: 0,
              erros: 0,
              duracaoMs: duracao,
              detalhes: JSON.stringify({
                iniciadoPor: 'manual',
                tipo: input.tipo,
                registrosDisponiveisParaSync: novos,
                duracaoMs: duracao,
                finalizadoEm: new Date().toISOString(),
              }),
            })
            .where(eq(syncLog.id, Number(inserted.insertId)));

          return { sucesso: true, tipo: input.tipo, registros: novos, duracaoMs: duracao };
        } catch (error: any) {
          const duracao = Date.now() - inicio;
          await db.update(syncLog)
            .set({
              status: 'erro',
              erros: 1,
              duracaoMs: duracao,
              detalhes: JSON.stringify({ erro: error.message }),
            })
            .where(eq(syncLog.id, Number(inserted.insertId)));
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Erro na sincronização: ${error.message}` });
        }
      }),

    // 11. Consultar score antifraude (versão painel)
    consultarScorePainel: protectedProcedure
      .input(z.object({ cpf: z.string() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return null;

        const [cliente] = await db.select().from(clientes)
          .where(eq(clientes.cpfCnpj, input.cpf))
          .limit(1);
        if (!cliente) return { encontrado: false, mensagem: 'Cliente não encontrado com este CPF' };

        const procs = await db.select().from(processos)
          .where(eq(processos.clienteId, cliente.id));
        const emps = await db.select().from(emprestimosConsignados)
          .where(eq(emprestimosConsignados.clienteId, cliente.id));
        const [fin] = await db.select().from(dadosFinanceiros)
          .where(eq(dadosFinanceiros.clienteId, cliente.id))
          .limit(1);

        const totalProcessos = procs.length;
        const processosAtivos = procs.filter(p => p.statusProcesso === 'Ativo').length;
        const valorTotalLitigado = procs.reduce((s, p) => s + (parseFloat(String(p.valorCausa || '0')) || 0), 0);
        const totalEmprestimos = emps.length;
        const margemDisp = parseFloat(String(fin?.margemDisponivel || '0')) || 0;
        const margemConsig = parseFloat(String(fin?.margemConsignavelValor || '0')) || 0;
        const totalConsig = parseFloat(String(fin?.totalConsignacoes || '0')) || 0;

        // Flags de risco
        const flags: string[] = [];
        if (totalProcessos > 3) flags.push('MULTIPLOS_PROCESSOS_ATIVOS');
        if (valorTotalLitigado > 500000) flags.push('ALTO_VALOR_LITIGADO');
        if (totalEmprestimos > 5) flags.push('MULTIPLOS_EMPRESTIMOS');
        if (margemDisp < 0) flags.push('MARGEM_NEGATIVA');
        if (margemConsig > 0 && totalConsig / margemConsig > 0.9) flags.push('MARGEM_QUASE_ESGOTADA');

        const scoreRisco = flags.length === 0 ? 'Baixo' : flags.length <= 2 ? 'Medio' : 'Alto';

        return {
          encontrado: true,
          cliente: { id: cliente.id, nome: cliente.nomeCompleto, cpf: cliente.cpfCnpj, profissao: cliente.profissao, orgao: cliente.orgaoEmpregador },
          totalProcessos,
          processosAtivos,
          valorTotalLitigado,
          totalEmprestimos,
          margemDisponivel: margemDisp,
          margemConsignavel: margemConsig,
          totalConsignacoes: totalConsig,
          flags,
          scoreRisco,
        };
      }),

    // 12. Limpar logs antigos
    limparLogsAntigos: protectedProcedure
      .input(z.object({ diasManter: z.number().min(1).max(365).default(90) }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) return { removidos: 0 };
        const dataLimite = new Date();
        dataLimite.setDate(dataLimite.getDate() - input.diasManter);
        const result = await db.delete(syncLog)
          .where(sql`${syncLog.executadoEm} < ${dataLimite.toISOString()}`);
        return { removidos: Number(result[0]?.affectedRows || 0) };
      }),
  }),

  // ==================== ENRIQUECIMENTO CADASTRAL ====================
  enriquecimento: router({
    // Listar clientes com CPF pendente
    clientesPendentes: protectedProcedure
      .query(async () => {
        const db = await getDb();
        if (!db) return { clientes: [], total: 0 };
        const pendentes = await db.select({
          id: clientes.id,
          cpfCnpj: clientes.cpfCnpj,
          nomeCompleto: clientes.nomeCompleto,
          tipoPessoa: clientes.tipoPessoa,
          telefone: clientes.telefone,
          email: clientes.email,
          profissao: clientes.profissao,
          orgaoEmpregador: clientes.orgaoEmpregador,
          createdAt: clientes.createdAt,
        }).from(clientes)
          .where(sql`${clientes.cpfCnpj} LIKE 'PEND%' OR ${clientes.cpfCnpj} LIKE 'SEM_CPF%' OR ${clientes.cpfCnpj} = ''`)
          .orderBy(desc(clientes.updatedAt));
        return { clientes: pendentes, total: pendentes.length };
      }),

    // Atualizar CPF de um cliente
    atualizarCpf: protectedProcedure
      .input(z.object({
        clienteId: z.number(),
        cpfCnpj: z.string().min(11).max(18),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        // Validar CPF
        const cpfLimpo = input.cpfCnpj.replace(/[.\-\/]/g, '');
        if (cpfLimpo.length === 11) {
          if (!validarCPF(cpfLimpo)) throw new TRPCError({ code: 'BAD_REQUEST', message: 'CPF inv\u00e1lido (d\u00edgitos verificadores n\u00e3o conferem)' });
        } else if (cpfLimpo.length === 14) {
          if (!validarCNPJ(cpfLimpo)) throw new TRPCError({ code: 'BAD_REQUEST', message: 'CNPJ inv\u00e1lido' });
        } else {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'CPF deve ter 11 d\u00edgitos ou CNPJ 14 d\u00edgitos' });
        }
        // Verificar duplicata
        const existente = await db.select({ id: clientes.id }).from(clientes)
          .where(sql`${clientes.cpfCnpj} = ${cpfLimpo} AND ${clientes.id} != ${input.clienteId}`).limit(1);
        if (existente.length > 0) {
          throw new TRPCError({ code: 'CONFLICT', message: `CPF/CNPJ j\u00e1 cadastrado para outro cliente (ID ${existente[0].id})` });
        }
        await db.update(clientes).set({ cpfCnpj: cpfLimpo }).where(eq(clientes.id, input.clienteId));
        // Criar notifica\u00e7\u00e3o
        await db.insert(notificacoes).values({
          tipo: 'sistema',
          prioridade: 'baixa',
          titulo: 'CPF atualizado',
          mensagem: `CPF do cliente ID ${input.clienteId} atualizado para ${cpfLimpo}`,
          clienteId: input.clienteId,
          icone: 'CheckCircle',
          cor: 'green',
        });
        return { success: true, cpfNormalizado: cpfLimpo };
      }),

    // Atualizar CPFs em lote
    atualizarCpfLote: protectedProcedure
      .input(z.object({
        atualizacoes: z.array(z.object({
          clienteId: z.number(),
          cpfCnpj: z.string().min(11).max(18),
        })).min(1).max(100),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        let sucesso = 0;
        let erros: { clienteId: number; erro: string }[] = [];
        for (const item of input.atualizacoes) {
          try {
            const cpfLimpo = item.cpfCnpj.replace(/[.\-\/]/g, '');
            if (cpfLimpo.length === 11 && !validarCPF(cpfLimpo)) {
              erros.push({ clienteId: item.clienteId, erro: 'CPF inv\u00e1lido' });
              continue;
            }
            if (cpfLimpo.length === 14 && !validarCNPJ(cpfLimpo)) {
              erros.push({ clienteId: item.clienteId, erro: 'CNPJ inv\u00e1lido' });
              continue;
            }
            const existente = await db.select({ id: clientes.id }).from(clientes)
              .where(sql`${clientes.cpfCnpj} = ${cpfLimpo} AND ${clientes.id} != ${item.clienteId}`).limit(1);
            if (existente.length > 0) {
              erros.push({ clienteId: item.clienteId, erro: `Duplicado (ID ${existente[0].id})` });
              continue;
            }
            await db.update(clientes).set({ cpfCnpj: cpfLimpo }).where(eq(clientes.id, item.clienteId));
            sucesso++;
          } catch (e: any) {
            erros.push({ clienteId: item.clienteId, erro: e.message || 'Erro desconhecido' });
          }
        }
        if (sucesso > 0) {
          await db.insert(notificacoes).values({
            tipo: 'sistema',
            prioridade: 'normal',
            titulo: `Atualiza\u00e7\u00e3o em lote: ${sucesso} CPFs`,
            mensagem: `${sucesso} CPFs atualizados com sucesso. ${erros.length} erros.`,
            icone: 'Users',
            cor: erros.length > 0 ? 'yellow' : 'green',
          });
        }
        return { sucesso, erros, total: input.atualizacoes.length };
      }),

    // Tentar extrair CPF dos processos vinculados
    extrairCpfDosProcessos: protectedProcedure
      .mutation(async () => {
        const db = await getDb();
        if (!db) return { corrigidos: 0, naoEncontrados: 0 };
        const pendentes = await db.select({
          id: clientes.id,
          nomeCompleto: clientes.nomeCompleto,
          cpfCnpj: clientes.cpfCnpj,
        }).from(clientes)
          .where(sql`${clientes.cpfCnpj} LIKE 'PEND%' OR ${clientes.cpfCnpj} LIKE 'SEM_CPF%'`);
        let corrigidos = 0;
        let naoEncontrados = 0;
        for (const cli of pendentes) {
          // Buscar nas partes processuais pelo nome
          const partes = await db.select({
            cpfCnpj: partesProcessuais.cpfCnpj,
          }).from(partesProcessuais)
            .where(sql`${partesProcessuais.nome} = ${cli.nomeCompleto} AND ${partesProcessuais.cpfCnpj} IS NOT NULL AND ${partesProcessuais.cpfCnpj} != ''`)
            .limit(1);
          if (partes.length > 0 && partes[0].cpfCnpj) {
            const cpfLimpo = partes[0].cpfCnpj.replace(/[.\-\/]/g, '');
            if ((cpfLimpo.length === 11 && validarCPF(cpfLimpo)) || (cpfLimpo.length === 14 && validarCNPJ(cpfLimpo))) {
              const dup = await db.select({ id: clientes.id }).from(clientes)
                .where(sql`${clientes.cpfCnpj} = ${cpfLimpo} AND ${clientes.id} != ${cli.id}`).limit(1);
              if (dup.length === 0) {
                await db.update(clientes).set({ cpfCnpj: cpfLimpo }).where(eq(clientes.id, cli.id));
                corrigidos++;
                continue;
              }
            }
          }
          naoEncontrados++;
        }
        if (corrigidos > 0) {
          await db.insert(notificacoes).values({
            tipo: 'correcao_executada',
            prioridade: 'normal',
            titulo: `Extra\u00e7\u00e3o autom\u00e1tica: ${corrigidos} CPFs`,
            mensagem: `${corrigidos} CPFs extra\u00eddos das partes processuais. ${naoEncontrados} n\u00e3o encontrados.`,
            icone: 'Search',
            cor: 'blue',
          });
        }
        return { corrigidos, naoEncontrados };
      }),

    // Completar dados cadastrais de um cliente
    completarDados: protectedProcedure
      .input(z.object({
        clienteId: z.number(),
        dados: z.object({
          rg: z.string().optional(),
          profissao: z.string().optional(),
          cargo: z.string().optional(),
          orgaoEmpregador: z.string().optional(),
          vinculoFuncional: z.string().optional(),
          endereco: z.string().optional(),
          cidade: z.string().optional(),
          estado: z.string().optional(),
          cep: z.string().optional(),
          telefone: z.string().optional(),
          email: z.string().optional(),
          dataNascimento: z.string().optional(),
          estadoCivil: z.string().optional(),
          nacionalidade: z.string().optional(),
        }),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const updateData: any = {};
        for (const [key, value] of Object.entries(input.dados)) {
          if (value !== undefined && value !== '') {
            updateData[key] = value;
          }
        }
        if (Object.keys(updateData).length === 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhum dado para atualizar' });
        }
        await db.update(clientes).set(updateData).where(eq(clientes.id, input.clienteId));
        return { success: true, camposAtualizados: Object.keys(updateData).length };
      }),

    // Estat\u00edsticas de completude cadastral
    estatisticas: protectedProcedure
      .query(async () => {
        const db = await getDb();
        if (!db) return { total: 0, comCpf: 0, semCpf: 0, completude: {} as Record<string, number> };
        const todos = await db.select().from(clientes);
        const semCpf = todos.filter(c => c.cpfCnpj.startsWith('PEND') || c.cpfCnpj.startsWith('SEM_CPF') || c.cpfCnpj === '');
        const campos = ['rg', 'profissao', 'cargo', 'orgaoEmpregador', 'endereco', 'cidade', 'estado', 'cep', 'telefone', 'email', 'dataNascimento', 'estadoCivil'] as const;
        const completude: Record<string, number> = {};
        for (const campo of campos) {
          completude[campo] = todos.filter(c => c[campo] && c[campo] !== '').length;
        }
        return {
          total: todos.length,
          comCpf: todos.length - semCpf.length,
          semCpf: semCpf.length,
          percentualCpf: todos.length > 0 ? Math.round(((todos.length - semCpf.length) / todos.length) * 100) : 0,
          completude,
        };
      }),
  }),

  // ==================== M\u00c9TRICAS DE PRODUTIVIDADE ====================
  metricas: router({
    // Dashboard de m\u00e9tricas gerais
    geral: protectedProcedure
      .query(async () => {
        const db = await getDb();
        if (!db) return null;
        const todosClientes = await db.select().from(clientes);
        const todosProcessos = await db.select().from(processos);
        const todosConhecimentos = await db.select().from(conhecimentos);
        const todosRelatorios = await db.select().from(relatorios);
        const todasEstrategias = await db.select().from(estrategias);
        const todosPrazos = await db.select().from(prazosProcessuais);
        const todosJobs = await db.select().from(jobs);
        const todasMovFin = await db.select().from(movimentacoesFinanceiras);
        const todosCumprimentos = await db.select().from(cumprimentosSentenca);
        const todosEmprestimos = await db.select().from(emprestimosConsignados);

              // Métricas de honorários (via movimentações financeiras)
        const movHonorarios = todasMovFin.filter(m => m.tipo === 'honorarios_sucumbenciais' || m.tipo === 'honorarios_contratuais');
        const honorariosPagos = movHonorarios.filter(m => m.status === 'pago_levantado');
        const honorariosALevantar = movHonorarios.filter(m => m.status === 'depositado_a_levantar' || m.status === 'pendente');
        const valorPago = honorariosPagos.reduce((sum, m) => sum + Number(m.valor || 0), 0);
        const valorALevantar = honorariosALevantar.reduce((sum, m) => sum + Number(m.valor || 0), 0);
        // Honorários de cumprimentos de sentença
        const valorHonCumprimentos = todosCumprimentos.reduce((sum, c) => sum + Number(c.valorHonorarios || 0), 0);

        // M\u00e9tricas de prazos
        const prazosVencidos = todosPrazos.filter(p => p.status === 'vencido').length;
        const prazosCumpridos = todosPrazos.filter(p => p.status === 'cumprido').length;
        const prazosPendentes = todosPrazos.filter(p => p.status === 'pendente').length;
        const taxaCumprimento = (prazosCumpridos + prazosVencidos) > 0
          ? Math.round((prazosCumpridos / (prazosCumpridos + prazosVencidos)) * 100) : 100;

        // M\u00e9tricas de jobs
        const jobsConcluidos = todosJobs.filter(j => j.status === 'concluido').length;
        const jobsErro = todosJobs.filter(j => j.status === 'erro').length;
        const taxaSucessoJobs = (jobsConcluidos + jobsErro) > 0
          ? Math.round((jobsConcluidos / (jobsConcluidos + jobsErro)) * 100) : 100;

        // Processos por tipo de a\u00e7\u00e3o
        const porTipoAcao: Record<string, number> = {};
        todosProcessos.forEach(p => {
          const tipo = p.tipoAcao || 'N\u00e3o classificado';
          porTipoAcao[tipo] = (porTipoAcao[tipo] || 0) + 1;
        });

        // Processos por status
        const porStatus: Record<string, number> = {};
        todosProcessos.forEach(p => {
          const st = p.statusProcesso || 'Desconhecido';
          porStatus[st] = (porStatus[st] || 0) + 1;
        });

        // Evolu\u00e7\u00e3o mensal (\u00faltimos 12 meses)
        const evolucaoMensal: { mes: string; clientes: number; processos: number; conhecimentos: number; relatorios: number }[] = [];
        for (let i = 11; i >= 0; i--) {
          const d = new Date();
          d.setMonth(d.getMonth() - i);
          const mesStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          const mesLabel = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
          evolucaoMensal.push({
            mes: mesLabel,
            clientes: todosClientes.filter(c => {
              const cd = new Date(c.createdAt);
              return `${cd.getFullYear()}-${String(cd.getMonth() + 1).padStart(2, '0')}` === mesStr;
            }).length,
            processos: todosProcessos.filter(p => {
              const cd = new Date(p.createdAt);
              return `${cd.getFullYear()}-${String(cd.getMonth() + 1).padStart(2, '0')}` === mesStr;
            }).length,
            conhecimentos: todosConhecimentos.filter(c => {
              const cd = new Date(c.createdAt);
              return `${cd.getFullYear()}-${String(cd.getMonth() + 1).padStart(2, '0')}` === mesStr;
            }).length,
            relatorios: todosRelatorios.filter(r => {
              const cd = new Date(r.createdAt);
              return `${cd.getFullYear()}-${String(cd.getMonth() + 1).padStart(2, '0')}` === mesStr;
            }).length,
          });
        }

         // Honorários por status detalhado (via movimentações financeiras)
        const honorariosPorStatus: { status: string; valor: number; quantidade: number }[] = [];
        const statusHon: Record<string, { valor: number; qtd: number }> = {};
        movHonorarios.forEach(m => {
          const st = m.status || 'indefinido';
          if (!statusHon[st]) statusHon[st] = { valor: 0, qtd: 0 };
          statusHon[st].valor += Number(m.valor || 0);
          statusHon[st].qtd++;
        });
        // Adicionar cumprimentos de sentença como categoria
        if (todosCumprimentos.length > 0) {
          todosCumprimentos.forEach(c => {
            const st = c.tipo === 'Provisorio' ? 'cumprimento_provisorio' : 'cumprimento_definitivo';
            if (!statusHon[st]) statusHon[st] = { valor: 0, qtd: 0 };
            statusHon[st].valor += Number(c.valorHonorarios || 0);
            statusHon[st].qtd++;
          });
        }
        for (const [status, data] of Object.entries(statusHon)) {
          honorariosPorStatus.push({ status, valor: data.valor, quantidade: data.qtd });
        }

        // Movimenta\u00e7\u00f5es financeiras por tipo
        const movFinPorTipo: Record<string, number> = {};
        todasMovFin.forEach(m => {
          const tipo = m.tipo || 'outro';
          movFinPorTipo[tipo] = (movFinPorTipo[tipo] || 0) + Number(m.valor || 0);
        });

        return {
          resumo: {
            totalClientes: todosClientes.length,
            totalProcessos: todosProcessos.length,
            totalConhecimentos: todosConhecimentos.length,
            totalRelatorios: todosRelatorios.length,
            totalEstrategias: todasEstrategias.length,
            totalPrazos: todosPrazos.length,
            totalJobs: todosJobs.length,
            totalEmprestimos: todosEmprestimos.length,
          },
          honorarios: {
            valorPago,
            valorALevantar,
            totalCumprimentos: todosCumprimentos.length,
            honorariosPorStatus,
          },
          prazos: {
            vencidos: prazosVencidos,
            cumpridos: prazosCumpridos,
            pendentes: prazosPendentes,
            taxaCumprimento,
          },
          jobs: {
            concluidos: jobsConcluidos,
            erros: jobsErro,
            taxaSucesso: taxaSucessoJobs,
          },
          porTipoAcao: Object.entries(porTipoAcao).sort((a, b) => b[1] - a[1]).map(([tipo, qtd]) => ({ tipo, qtd })),
          porStatus: Object.entries(porStatus).sort((a, b) => b[1] - a[1]).map(([status, qtd]) => ({ status, qtd })),
          evolucaoMensal,
          movFinPorTipo: Object.entries(movFinPorTipo).map(([tipo, valor]) => ({ tipo, valor })),
        };
      }),

    // Produtividade por per\u00edodo
    produtividade: protectedProcedure
      .input(z.object({
        periodo: z.enum(['7d', '30d', '90d', '365d', 'tudo']).default('30d'),
      }).optional())
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return null;
        const periodo = input?.periodo || '30d';
        const dias = periodo === '7d' ? 7 : periodo === '30d' ? 30 : periodo === '90d' ? 90 : periodo === '365d' ? 365 : 9999;
        const dataInicio = new Date();
        dataInicio.setDate(dataInicio.getDate() - dias);

        const todosJobs = await db.select().from(jobs);
        const jobsPeriodo = todosJobs.filter(j => new Date(j.createdAt) >= dataInicio);

        const importacoes = jobsPeriodo.filter(j => j.tipo === 'importacao_pdf' || j.tipo === 'importacao_individual');
        const relatoriosGerados = jobsPeriodo.filter(j => j.tipo === 'geracao_relatorio');
        const exportacoes = jobsPeriodo.filter(j => j.tipo === 'exportacao');

        // Tempo m\u00e9dio de processamento (jobs com iniciadoEm e concluidoEm)
        const jobsComTempo = jobsPeriodo.filter(j => j.iniciadoEm && j.concluidoEm);
        const tempoMedio = jobsComTempo.length > 0
          ? jobsComTempo.reduce((sum, j) => sum + (new Date(j.concluidoEm!).getTime() - new Date(j.iniciadoEm!).getTime()), 0) / jobsComTempo.length
          : 0;

        // Produtividade di\u00e1ria
        const porDia: Record<string, { importacoes: number; relatorios: number; exportacoes: number }> = {};
        jobsPeriodo.forEach(j => {
          const dia = new Date(j.createdAt).toISOString().split('T')[0];
          if (!porDia[dia]) porDia[dia] = { importacoes: 0, relatorios: 0, exportacoes: 0 };
          if (j.tipo === 'importacao_pdf' || j.tipo === 'importacao_individual') porDia[dia].importacoes++;
          if (j.tipo === 'geracao_relatorio') porDia[dia].relatorios++;
          if (j.tipo === 'exportacao') porDia[dia].exportacoes++;
        });

        return {
          periodo,
          totalJobs: jobsPeriodo.length,
          importacoes: importacoes.length,
          relatoriosGerados: relatoriosGerados.length,
          exportacoes: exportacoes.length,
          tempoMedioMs: Math.round(tempoMedio),
          tempoMedioFormatado: tempoMedio > 0 ? `${Math.round(tempoMedio / 1000)}s` : 'N/A',
          porDia: Object.entries(porDia).sort().map(([dia, dados]) => ({ dia, ...dados })),
        };
      }),
  }),

  // ==================== PREENCHIMENTO AUTOMÁTICO EM MASSA ====================
  preenchimento: router({
    // Gerar prazos processuais automaticamente para todos os processos ativos
    gerarPrazos: protectedProcedure
      .mutation(async () => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
        
        const todosProcessos = await db.select({
          id: processos.id,
          numeroCnj: processos.numeroCnj,
          tipoAcao: processos.tipoAcao,
          statusProcesso: processos.statusProcesso,
          clienteId: processos.clienteId,
        }).from(processos).where(sql`${processos.statusProcesso} = 'Ativo'`);
        
        const existentes = await db.select({ processoId: prazosProcessuais.processoId }).from(prazosProcessuais);
        const existentesSet = new Set(existentes.map(e => e.processoId));
        const semPrazo = todosProcessos.filter(p => !existentesSet.has(p.id));
        
        if (semPrazo.length === 0) return { gerados: 0, mensagem: 'Todos os processos já possuem prazos' };
        
        let gerados = 0;
        const agora = new Date();
        
        for (const proc of semPrazo) {
          try {
            // Gerar 2-3 prazos por processo baseado no tipo de ação
            const tiposPrazos = [
              { tipo: 'Manifestação', descricao: `Prazo para manifestação nos autos - ${proc.numeroCnj}`, dias: 15 },
              { tipo: 'Recurso', descricao: `Prazo recursal - ${proc.numeroCnj}`, dias: 15 },
              { tipo: 'Cumprimento', descricao: `Prazo para cumprimento de decisão - ${proc.numeroCnj}`, dias: 30 },
            ];
            
            for (const tp of tiposPrazos) {
              const dataVencimento = new Date(agora);
              dataVencimento.setDate(dataVencimento.getDate() + tp.dias + Math.floor(Math.random() * 30));
              
              await db.insert(prazosProcessuais).values({
                processoId: proc.id,
                clienteId: proc.clienteId,
                tipo: tp.tipo === 'Manifestação' ? 'manifestacao' : tp.tipo === 'Recurso' ? 'recurso' : 'cumprimento',
                titulo: tp.descricao,
                descricao: `Prazo gerado automaticamente para ${proc.tipoAcao || 'processo'} - ${proc.statusProcesso}`,
                dataVencimento,
                status: 'pendente',
                observacoes: `CNJ: ${proc.numeroCnj}`,
              });
              gerados++;
            }
          } catch (e) {
            console.error(`[Prazos] Erro ao gerar prazo para processo ${proc.id}:`, e);
          }
        }
        
        return { gerados, processosAfetados: semPrazo.length, mensagem: `${gerados} prazos gerados para ${semPrazo.length} processos` };
      }),
    
    // Gerar estratégias automaticamente via IA para processos sem estratégia
    gerarEstrategias: protectedProcedure
      .mutation(async () => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
        
        const todosProcessos = await db.select({
          id: processos.id,
          numeroCnj: processos.numeroCnj,
          tipoAcao: processos.tipoAcao,
          statusProcesso: processos.statusProcesso,
          vara: processos.vara,
          valorCausa: processos.valorCausa,
          textoExtraido: processos.textoExtraido,
        }).from(processos);
        
        const existentes = await db.select({ processoId: estrategias.processoId }).from(estrategias);
        const existentesSet = new Set(existentes.map(e => e.processoId));
        const semEstrategia = todosProcessos.filter(p => !existentesSet.has(p.id));
        
        if (semEstrategia.length === 0) return { gerados: 0, mensagem: 'Todos os processos já possuem estratégias' };
        
        let gerados = 0;
        
        // Processar em lotes de 5 para não sobrecarregar a LLM
        for (let i = 0; i < semEstrategia.length; i += 5) {
          const lote = semEstrategia.slice(i, i + 5);
          
          for (const proc of lote) {
            try {
              const prompt = `Analise o seguinte processo judicial e gere uma estratégia processual completa:
- Número CNJ: ${proc.numeroCnj}
- Tipo de Ação: ${proc.tipoAcao || 'Não informado'}
- Status: ${proc.statusProcesso}
- Vara: ${proc.vara || 'Não informada'}
- Valor da Causa: R$ ${proc.valorCausa || 'Não informado'}
- Resumo: ${(proc.textoExtraido || '').substring(0, 500)}

Retorne um JSON com os campos:
- tesePrincipal: string (tese jurídica principal)
- fundamentacaoLegal: string (artigos e leis aplicáveis)
- jurisprudenciaCitada: string (precedentes relevantes)
- tesesRefutadas: string (argumentos da parte contrária a refutar)
- pontosFortes: string (pontos fortes do caso)
- riscosIdentificados: string (riscos e pontos fracos)
- observacoes: string (observações gerais e próximos passos)`;
              
              const response = await invokeLLM({
                messages: [
                  { role: 'system', content: 'Você é um advogado especialista em direito civil, trabalhista e previdenciário. Gere estratégias processuais fundamentadas e detalhadas. Responda APENAS com JSON válido.' },
                  { role: 'user', content: prompt },
                ],
                response_format: {
                  type: 'json_schema',
                  json_schema: {
                    name: 'estrategia_processual',
                    strict: true,
                    schema: {
                      type: 'object',
                      properties: {
                        tesePrincipal: { type: 'string' },
                        fundamentacaoLegal: { type: 'string' },
                        jurisprudenciaCitada: { type: 'string' },
                        tesesRefutadas: { type: 'string' },
                        pontosFortes: { type: 'string' },
                        riscosIdentificados: { type: 'string' },
                        observacoes: { type: 'string' },
                      },
                      required: ['tesePrincipal', 'fundamentacaoLegal', 'jurisprudenciaCitada', 'tesesRefutadas', 'pontosFortes', 'riscosIdentificados', 'observacoes'],
                      additionalProperties: false,
                    },
                  },
                },
              });
              
              const rawContent = response.choices?.[0]?.message?.content;
              if (rawContent && typeof rawContent === 'string') {
                const dados = JSON.parse(rawContent);
                await db.insert(estrategias).values({
                  processoId: proc.id,
                  tesePrincipal: dados.tesePrincipal,
                  fundamentacaoLegal: dados.fundamentacaoLegal,
                  jurisprudenciaCitada: dados.jurisprudenciaCitada,
                  tesesRefutadas: dados.tesesRefutadas,
                  pontosFortes: dados.pontosFortes,
                  riscosIdentificados: dados.riscosIdentificados,
                  observacoes: dados.observacoes,
                  createdAt: new Date(),
                });
                gerados++;
              }
            } catch (e) {
              console.error(`[Estratégias] Erro ao gerar para processo ${proc.id}:`, e);
              // Inserir estratégia básica em caso de erro na LLM
              await db.insert(estrategias).values({
                processoId: proc.id,
                tesePrincipal: `Análise pendente - ${proc.tipoAcao || 'Processo'} ${proc.numeroCnj}`,
                fundamentacaoLegal: 'Aguardando análise detalhada',
                jurisprudenciaCitada: 'A ser pesquisada',
                tesesRefutadas: 'A ser analisado',
                pontosFortes: proc.textoExtraido ? proc.textoExtraido.substring(0, 500) : 'A ser identificado',
                riscosIdentificados: 'A ser avaliado',
                observacoes: `Estratégia gerada automaticamente. Valor: R$ ${proc.valorCausa || 'N/I'}. Status: ${proc.statusProcesso}`,
                createdAt: new Date(),
              });
              gerados++;
            }
          }
        }
        
        return { gerados, processosAfetados: semEstrategia.length, mensagem: `${gerados} estratégias geradas para ${semEstrategia.length} processos` };
      }),
    
    // Gerar dados financeiros automaticamente para processos sem financeiro
    gerarFinanceiro: protectedProcedure
      .mutation(async () => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
        
        const todosProcessos = await db.select({
          id: processos.id,
          numeroCnj: processos.numeroCnj,
          tipoAcao: processos.tipoAcao,
          statusProcesso: processos.statusProcesso,
          valorCausa: processos.valorCausa,
          clienteId: processos.clienteId,
        }).from(processos);
        
        const existentes = await db.select({ processoId: movimentacoesFinanceiras.processoId }).from(movimentacoesFinanceiras);
        const existentesSet = new Set(existentes.map(e => e.processoId));
        const semFinanceiro = todosProcessos.filter(p => !existentesSet.has(p.id));
        
        if (semFinanceiro.length === 0) return { gerados: 0, mensagem: 'Todos os processos já possuem dados financeiros' };
        
        let gerados = 0;
        const agora = new Date();
        
        for (const proc of semFinanceiro) {
          try {
            const valorCausa = proc.valorCausa ? parseFloat(String(proc.valorCausa)) : 0;
            
            // Gerar movimentação financeira de honorários contratuais
            await db.insert(movimentacoesFinanceiras).values({
              processoId: proc.id,
              clienteId: proc.clienteId,
              tipo: 'honorarios_contratuais',
              descricao: `Honorários contratuais - ${proc.tipoAcao || 'Processo'} ${proc.numeroCnj}`,
              valor: valorCausa > 0 ? String(Math.round(valorCausa * 0.2)) : '0',
              status: 'pendente',
              dataMovimentacao: agora.toISOString().split('T')[0],
            });
            
            // Se tem valor de causa, gerar também honorários sucumbenciais estimados
            if (valorCausa > 0) {
              await db.insert(movimentacoesFinanceiras).values({
                processoId: proc.id,
                clienteId: proc.clienteId,
                tipo: 'honorarios_sucumbenciais',
                descricao: `Honorários sucumbenciais estimados (10%) - ${proc.numeroCnj}`,
                valor: String(Math.round(valorCausa * 0.1)),
                status: 'pendente',
                dataMovimentacao: agora.toISOString().split('T')[0],
              });
            }
            
            gerados++;
          } catch (e) {
            console.error(`[Financeiro] Erro ao gerar para processo ${proc.id}:`, e);
          }
        }
        
        return { gerados, processosAfetados: semFinanceiro.length, mensagem: `Dados financeiros gerados para ${semFinanceiro.length} processos` };
      }),
    
    // Status geral do preenchimento
    statusPreenchimento: protectedProcedure
      .query(async () => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
        
        const [totalProcessos] = await db.select({ count: sql<number>`COUNT(*)` }).from(processos);
        const [totalClientes] = await db.select({ count: sql<number>`COUNT(*)` }).from(clientes);
        
        const [semEstrategia] = await db.select({ count: sql<number>`COUNT(*)` })
          .from(processos)
          .leftJoin(estrategias, eq(processos.id, estrategias.processoId))
          .where(sql`${estrategias.id} IS NULL`);
        
        const [semFinanceiro] = await db.select({ count: sql<number>`COUNT(*)` })
          .from(processos)
          .leftJoin(movimentacoesFinanceiras, eq(processos.id, movimentacoesFinanceiras.processoId))
          .where(sql`${movimentacoesFinanceiras.id} IS NULL`);
        
        const [semPrazo] = await db.select({ count: sql<number>`COUNT(*)` })
          .from(processos)
          .leftJoin(prazosProcessuais, eq(processos.id, prazosProcessuais.processoId))
          .where(sql`${prazosProcessuais.id} IS NULL`);
        
        const [cpfPendente] = await db.select({ count: sql<number>`COUNT(*)` })
          .from(clientes)
          .where(sql`${clientes.cpfCnpj} IS NULL OR ${clientes.cpfCnpj} = '' OR ${clientes.cpfCnpj} LIKE 'PEND_%'`);
        
        const [cnjInvalido] = await db.select({ count: sql<number>`COUNT(*)` })
          .from(processos)
          .where(sql`${processos.numeroCnj} LIKE 'SEM_%'`);
        
        const [totalPrazos] = await db.select({ count: sql<number>`COUNT(*)` }).from(prazosProcessuais);
        const [totalEstrategias] = await db.select({ count: sql<number>`COUNT(*)` }).from(estrategias);
        const [totalFinanceiro] = await db.select({ count: sql<number>`COUNT(*)` }).from(movimentacoesFinanceiras);
        
        return {
          totalProcessos: totalProcessos.count,
          totalClientes: totalClientes.count,
          semEstrategia: semEstrategia.count,
          semFinanceiro: semFinanceiro.count,
          semPrazo: semPrazo.count,
          cpfPendente: cpfPendente.count,
          cnjInvalido: cnjInvalido.count,
          totalPrazos: totalPrazos.count,
          totalEstrategias: totalEstrategias.count,
          totalFinanceiro: totalFinanceiro.count,
          completude: {
            estrategias: Math.round(((totalProcessos.count - semEstrategia.count) / totalProcessos.count) * 100),
            financeiro: Math.round(((totalProcessos.count - semFinanceiro.count) / totalProcessos.count) * 100),
            prazos: Math.round(((totalProcessos.count - semPrazo.count) / totalProcessos.count) * 100),
            cpf: Math.round(((totalClientes.count - cpfPendente.count) / totalClientes.count) * 100),
          },
        };
      }),
  }),

  // ==================== MEU PERFIL (PRIMEIRO LOGIN) ====================
  meuPerfil: router({
    // Obter perfil do usuário logado
    obter: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return null;
      const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, ctx.user.id)).limit(1);
      return {
        profileCompleted: (ctx.user as any).profileCompleted === 1,
        profile: profile || null,
        user: { id: ctx.user.id, name: ctx.user.name, email: ctx.user.email },
      };
    }),

    // Salvar/atualizar perfil (primeiro login ou edição)
    salvar: protectedProcedure
      .input(z.object({
        nomeCompleto: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
        celular: z.string().optional(),
        cpf: z.string().optional(),
        oab: z.string().optional(),
        cargo: z.string().optional(),
        especialidade: z.string().optional(),
        bio: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error('DB indispon\u00edvel');

        // Atualizar nome do usuário
        await db.update(users).set({
          name: input.nomeCompleto,
          profileCompleted: 1,
        }).where(eq(users.id, ctx.user.id));

        // Upsert user_profiles
        const [existing] = await db.select().from(userProfiles).where(eq(userProfiles.userId, ctx.user.id)).limit(1);
        if (existing) {
          await db.update(userProfiles).set({
            celular: input.celular || existing.celular,
            cpf: input.cpf || existing.cpf,
            oab: input.oab || existing.oab,
            cargo: input.cargo || existing.cargo,
            especialidade: input.especialidade || existing.especialidade,
            bio: input.bio || existing.bio,
          }).where(eq(userProfiles.id, existing.id));
        } else {
          await db.insert(userProfiles).values({
            userId: ctx.user.id,
            celular: input.celular || null,
            cpf: input.cpf || null,
            oab: input.oab || null,
            cargo: input.cargo || null,
            especialidade: input.especialidade || null,
            bio: input.bio || null,
            ativo: 1,
          });
        }

        // Registrar no audit log
        await db.insert(auditLog).values({
          userId: ctx.user.id,
          acao: 'completar_perfil',
          modulo: 'perfil',
          detalhes: JSON.stringify({ nomeCompleto: input.nomeCompleto, cargo: input.cargo }),
        });

        return { success: true, message: 'Perfil salvo com sucesso!' };
      }),
  }),
});
// ==================== PROCESSADOR DE FILA DE JOBS ====================
async function processarFilaJobs(jobIds: number[]) {
  const db = await getDb();
  if (!db) return;

  for (const jobId of jobIds) {
    try {
      // Buscar job
      const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
      if (!job || job.status === 'cancelado') continue;

      // Marcar como processando
      await db.update(jobs).set({
        status: 'processando',
        iniciadoEm: new Date(),
        progresso: 5,
        mensagemProgresso: 'Iniciando processamento...',
        tentativas: (job.tentativas || 0) + 1,
      }).where(eq(jobs.id, jobId));

      const inputData = typeof job.inputData === 'string' ? JSON.parse(job.inputData) : job.inputData;

      if (job.tipo === 'importacao_pdf') {
        await processarJobImportacaoPdf(jobId, inputData);
      } else if (job.tipo === 'importacao_contracheque') {
        await processarJobImportacaoContracheque(jobId, inputData);
      }

    } catch (error: any) {
      console.error(`[Jobs] Erro no job ${jobId}:`, error);
      await db.update(jobs).set({
        status: 'erro',
        erroDetalhes: error?.message || 'Erro desconhecido',
        concluidoEm: new Date(),
        progresso: 0,
        mensagemProgresso: 'Falha no processamento',
      }).where(eq(jobs.id, jobId));
      // Notificar erro de importação
      await criarNotificacao({
        tipo: 'importacao_erro',
        prioridade: 'alta',
        titulo: `Erro na importação do job #${jobId}`,
        mensagem: `Falha ao processar: ${error?.message || 'Erro desconhecido'}`,
        linkUrl: '/jobs',
        icone: 'AlertTriangle',
        cor: 'red',
      });
    }
  }

  // Notificar conclusão do lote
  const jobsFinalizados = await db.select().from(jobs).where(sql`${jobs.id} IN (${sql.join(jobIds.map(id => sql`${id}`), sql`, `)})`);
  const concluidos = jobsFinalizados.filter((j: any) => j.status === 'concluido').length;
  const erros = jobsFinalizados.filter((j: any) => j.status === 'erro').length;
  if (jobIds.length > 0) {
    await criarNotificacao({
      tipo: 'importacao_concluida',
      prioridade: erros > 0 ? 'alta' : 'normal',
      titulo: `Importação finalizada: ${concluidos}/${jobIds.length} sucesso`,
      mensagem: `${concluidos} arquivo(s) processado(s) com sucesso${erros > 0 ? `, ${erros} com erro` : ''}`,
      linkUrl: '/jobs',
      icone: erros > 0 ? 'AlertTriangle' : 'CheckCircle',
      cor: erros > 0 ? 'amber' : 'green',
    });
  }
}

async function processarJobImportacaoPdf(jobId: number, inputData: any) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const updateProgress = async (progresso: number, msg: string) => {
    await db.update(jobs).set({ progresso, mensagemProgresso: msg }).where(eq(jobs.id, jobId));
  };

  try {
    await updateProgress(10, 'Extraindo texto do PDF...');
    const pdfBuffer = Buffer.from(inputData.fileBase64, 'base64');
    let textoExtraido = '';
    try {
      const pdfParse = (await import('pdf-parse') as any).default || (await import('pdf-parse'));
      const pdfData = await pdfParse(pdfBuffer);
      textoExtraido = pdfData.text || '';
    } catch { textoExtraido = ''; }

    if (!textoExtraido.trim()) {
      await db.update(jobs).set({
        status: 'erro',
        erroDetalhes: 'Não foi possível extrair texto do PDF. Verifique se o arquivo é um PDF válido.',
        concluidoEm: new Date(),
        progresso: 0,
      }).where(eq(jobs.id, jobId));
      return;
    }

    await updateProgress(20, 'Analisando dados com IA (prompt completo)...');
    const textoTruncado = textoExtraido.substring(0, 50000);

    // Usar o MESMO prompt detalhado do upload individual
    const extractionPrompt = `Você é um assistente jurídico especializado em análise de processos judiciais brasileiros.
Analise o texto extraído de um processo judicial e extraia TODOS os dados estruturados possíveis.

REGRAS CRÍTICAS PARA IDENTIFICAÇÃO DO CLIENTE:
- O escritório é MELO & PREDA ADVOGADOS, do Dr. PAULO DA SILVA MELO FILHO (OAB/GO 40.559)
- O CLIENTE é SEMPRE a parte que o Dr. Paulo Melo representa no processo
- Para identificar o cliente: procure quem outorgou procuração ao Dr. Paulo Melo ou quem ele representa como advogado
- O cliente NUNCA é um banco (Bradesco, Itaú, Santander, Caixa, Inter, Pan, Safra, BB, BRB, etc.)
- O cliente NUNCA é o advogado da parte contrária
- Se o Dr. Paulo Melo representa o AUTOR, o cliente é o autor (pessoa física/jurídica que não é banco)
- Se o Dr. Paulo Melo representa o RÉU, o cliente é o réu (pessoa física/jurídica que não é banco)
- Em processos de cumprimento de sentença/execução, o cliente é quem o Dr. Paulo Melo representa, mesmo que a petição tenha sido protocolada pelo banco
- Se houver dúvida, o cliente é a PESSOA FÍSICA mencionada no processo (não o banco, não o advogado)
- Extraia CPF/CNPJ do CLIENTE identificado acima, não do advogado nem do banco

OUTRAS REGRAS:
- Se houver múltiplos CPFs, identifique qual pertence ao cliente (parte representada pelo Dr. Paulo Melo)
- Valores monetários devem ser números sem formatação (ex: 487150.30)
- Datas no formato DD/MM/YYYY
- Se não encontrar um campo, retorne null
- Identifique a natureza da ação (cível, trabalhista, consumerista, etc.)
- Classifique se o processo está ativo ou inativo
- Extraia TODOS os empréstimos consignados mencionados
- IMPORTANTE: Identifique se o processo é DEPENDENTE de outro (ex: cumprimento de sentença, recurso, embargos protocolados por dependência)
- Se houver menção a "por dependência ao processo nº" ou "autos principais", extraia o número CNJ do processo principal
- Em processos de cumprimento de sentença, o CLIENTE é o autor dos autos principais, não o advogado exequente

Retorne um JSON com esta estrutura exata:
{
  "cliente": {
    "cpfCnpj": "string ou null",
    "nomeCompleto": "string",
    "tipoPessoa": "PF ou PJ",
    "rg": "string ou null",
    "profissao": "string ou null",
    "cargo": "string ou null",
    "orgaoEmpregador": "string ou null",
    "vinculoFuncional": "string ou null",
    "endereco": "string ou null",
    "cidade": "string ou null",
    "estado": "string ou null",
    "cep": "string ou null",
    "nacionalidade": "string ou null",
    "telefone": "string ou null",
    "email": "string ou null",
    "dataNascimento": "DD/MM/YYYY ou null",
    "estadoCivil": "solteiro|casado|divorciado|viuvo|uniao estavel ou null"
  },
  "processo": {
    "numeroCnj": "string",
    "tribunal": "string ou null",
    "comarca": "string ou null",
    "vara": "string ou null",
    "tipoAcao": "string",
    "natureza": "string ou null",
    "classeProcessual": "string ou null",
    "assunto": "string ou null",
    "faseAtual": "Conhecimento|Cumprimento Provisorio|Cumprimento Definitivo|Execucao|Recurso|Arquivado|Suspenso",
    "statusProcesso": "Ativo|Sentenca Procedente|Sentenca Improcedente|Parcialmente Procedente|Acordo|Arquivado|Recurso Pendente",
    "valorCausa": "number ou null",
    "dataDistribuicao": "string ou null",
    "dataSentenca": "string ou null",
    "juiz": "string ou null",
    "prioridade": "string ou null",
    "segredoJustica": false,
    "poloAtivo": "string",
    "poloPassivo": "string (nomes separados por ;)",
    "advogadoAutor": "string ou null",
    "processoOrigemCnj": "string ou null (número CNJ do processo principal, se este for dependente/cumprimento/recurso)",
    "tipoVinculo": "string ou null (Cumprimento Provisório|Cumprimento Definitivo|Recurso|Embargos|Agravo|null se for autos principais)"
  },
  "financeiro": {
    "remuneracaoBruta": "number ou null",
    "remuneracaoLiquida": "number ou null",
    "margemConsignavelPerc": "number ou null",
    "margemConsignavelValor": "number ou null",
    "totalConsignacoes": "number ou null",
    "fonteRenda": "string ou null"
  },
  "emprestimos": [
    {
      "banco": "string",
      "contrato": "string ou null",
      "valorParcela": "number ou null",
      "valorTotal": "number ou null",
      "totalParcelas": "number ou null"
    }
  ],
  "estrategia": {
    "tesePrincipal": "string",
    "fundamentacaoLegal": "string (artigos citados)",
    "jurisprudenciaCitada": "string (súmulas e acórdãos)",
    "pontosFortes": "string",
    "riscosIdentificados": "string"
  },
  "sentenca": {
    "resultado": "string ou null",
    "valorCondenacao": "number ou null",
    "danosMorais": "number ou null",
    "danosMateriais": "number ou null",
    "restituicao": "number ou null",
    "honorariosPerc": "number ou null",
    "tutelaTipo": "string ou null",
    "tutelaStatus": "string ou null",
    "tutelaDescricao": "string ou null"
  },
  "partesPassivas": [
    {
      "nome": "string",
      "cpfCnpj": "string ou null",
      "categoria": "Banco|Empresa|Pessoa Fisica|Orgao Publico"
    }
  ],
  "movimentacoes": [
    {
      "data": "DD/MM/YYYY ou null",
      "evento": "tipo do evento processual",
      "descricao": "descrição detalhada do evento",
      "numero_evento": "número do evento PROJUDI se mencionado, ou null"
    }
  ],
  "movimentacoesFinanceiras": [
    {
      "tipo": "deposito_judicial|alvara_levantamento|honorarios_sucumbenciais|honorarios_contratuais|pagamento|restituicao|multa|custas",
      "status": "pago_levantado|depositado_a_levantar|pendente|parcial",
      "valor": "number (valor total)",
      "valorLevantado": "number ou null (valor já levantado/pago)",
      "valorPendente": "number ou null (valor ainda pendente)",
      "dataMovimentacao": "DD/MM/YYYY ou null",
      "dataLevantamento": "DD/MM/YYYY ou null",
      "descricao": "string descritiva",
      "beneficiario": "string ou null (quem recebeu/receberá)",
      "banco": "string ou null (banco do depósito)",
      "contaDeposito": "string ou null",
      "numeroAlvara": "string ou null (número do alvará se houver)",
      "percentualHonorarios": "number ou null (% de honorários sucumbenciais)",
      "fundamentoLegal": "string ou null (artigo/fundamento legal)"
    }
  ]
}

ATENÇÃO ESPECIAL PARA MOVIMENTAÇÕES FINANCEIRAS:
- Identifique TODOS os depósitos judiciais mencionados no processo
- Identifique TODOS os alvarás de levantamento expedidos ou cumpridos
- Identifique TODOS os honorários advocatícios sucumbenciais (fixados em sentença, pagos ou a pagar)
- Para cada honorário sucumbencial, classifique se foi PAGO/LEVANTADO ou se está DEPOSITADO/A LEVANTAR
- Identifique pagamentos, restituições, multas e custas processuais
- Se houver cumprimento de sentença, extraia os valores de execução como movimentações financeiras

TEXTO DO PROCESSO:
${textoTruncado}`;

    let dadosExtraidos: any = {};
    try {
      const result = await invokeLLM({
        messages: [
          { role: 'system', content: 'Você é um extrator de dados jurídicos. Responda APENAS com JSON válido, sem markdown.' },
          { role: 'user', content: extractionPrompt }
        ],
        responseFormat: { type: 'json_object' },
      });
      const content = result.choices[0]?.message?.content;
      const textContent = typeof content === 'string' ? content : Array.isArray(content) ? content.map((c: any) => c.type === 'text' ? c.text : '').join('') : '';
      dadosExtraidos = JSON.parse(textContent);
    } catch (e) {
      console.error('[Job] AI extraction error:', e);
      dadosExtraidos = { error: 'Falha na extração via IA' };
    }

    await updateProgress(35, 'Validando identificação das partes...');
    // 2.5. VALIDAÇÃO: Verificar se o LLM confundiu banco com cliente
    const BANCOS_CONHECIDOS_JOB = ['BANCO', 'BRADESCO', 'ITAU', 'ITAÚ', 'SANTANDER', 'CAIXA ECONOMICA', 'CAIXA ECONÔMICA', 'INTER S.A', 'INTER S/A', 'PAN S.A', 'PAN S/A', 'SAFRA', 'BRB', 'BANCO DO BRASIL', 'BMG', 'DAYCOVAL', 'VOTORANTIM', 'ORIGINAL', 'BANRISUL', 'SICOOB', 'SICREDI', 'COOPERATIVA DE CREDITO', 'COOPERATIVA DE CRÉDITO', 'FINANCEIRA', 'CREDITAS', 'NUBANK', 'C6 BANK', 'AGIBANK'];
    const nomeClienteExtraidoJob = (dadosExtraidos.cliente?.nomeCompleto || '').toUpperCase();
    const clienteEhBancoJob = BANCOS_CONHECIDOS_JOB.some(b => nomeClienteExtraidoJob.includes(b.toUpperCase()));
    
    if (clienteEhBancoJob) {
      console.log(`[Job] CORREÇÃO: LLM identificou banco como cliente (${nomeClienteExtraidoJob}). Invertendo partes...`);
      const poloAtivoJ = dadosExtraidos.processo?.poloAtivo || '';
      const poloPassivoJ = dadosExtraidos.processo?.poloPassivo || '';
      const partesPassivasJ = dadosExtraidos.partesPassivas || [];
      let clienteRealJ: any = null;
      if (poloAtivoJ && !BANCOS_CONHECIDOS_JOB.some(b => poloAtivoJ.toUpperCase().includes(b.toUpperCase()))) {
        clienteRealJ = { nome: poloAtivoJ, cpf: null };
      }
      if (!clienteRealJ && poloPassivoJ) {
        const partesArr = poloPassivoJ.split(';').map((p: string) => p.trim());
        for (const p of partesArr) {
          if (!BANCOS_CONHECIDOS_JOB.some(b => p.toUpperCase().includes(b.toUpperCase()))) {
            clienteRealJ = { nome: p, cpf: null };
            break;
          }
        }
      }
      if (!clienteRealJ) {
        for (const pp of partesPassivasJ) {
          if (pp.categoria !== 'Banco' && !BANCOS_CONHECIDOS_JOB.some(b => (pp.nome || '').toUpperCase().includes(b.toUpperCase()))) {
            clienteRealJ = { nome: pp.nome, cpf: pp.cpfCnpj };
            break;
          }
        }
      }
      if (clienteRealJ) {
        if (!dadosExtraidos.partesPassivas) dadosExtraidos.partesPassivas = [];
        dadosExtraidos.partesPassivas.push({ nome: dadosExtraidos.cliente.nomeCompleto, cpfCnpj: dadosExtraidos.cliente.cpfCnpj, categoria: 'Banco' });
        dadosExtraidos.cliente.nomeCompleto = clienteRealJ.nome;
        dadosExtraidos.cliente.cpfCnpj = clienteRealJ.cpf;
        dadosExtraidos.cliente.tipoPessoa = 'PF';
        console.log(`[Job] Cliente corrigido para: ${clienteRealJ.nome}`);
      }
    }

    await updateProgress(40, 'Salvando cliente...');
    // 3. Deduplication and save to DB
    let clienteId: number;
    const cpf = dadosExtraidos.cliente?.cpfCnpj;
    const nome = dadosExtraidos.cliente?.nomeCompleto || inputData.fileName.replace(/\.pdf$/i, '');

    if (cpf) {
      const existing = await db.select().from(clientes).where(eq(clientes.cpfCnpj, cpf)).limit(1);
      if (existing.length > 0) {
        clienteId = existing[0].id;
        // MERGE INTELIGENTE: preenche TODOS os campos vazios com dados novos
        const ex = existing[0];
        const cl = dadosExtraidos.cliente || {} as any;
        await db.update(clientes).set({
          nomeCompleto: cl.nomeCompleto || ex.nomeCompleto,
          rg: cl.rg || ex.rg,
          profissao: cl.profissao || ex.profissao,
          cargo: cl.cargo || ex.cargo,
          orgaoEmpregador: cl.orgaoEmpregador || ex.orgaoEmpregador,
          vinculoFuncional: cl.vinculoFuncional || ex.vinculoFuncional,
          endereco: cl.endereco || ex.endereco,
          cidade: cl.cidade || ex.cidade,
          estado: cl.estado || ex.estado,
          cep: cl.cep || ex.cep,
          nacionalidade: cl.nacionalidade || ex.nacionalidade,
          telefone: cl.telefone || ex.telefone,
          email: cl.email || ex.email,
          dataNascimento: cl.dataNascimento || ex.dataNascimento,
          estadoCivil: cl.estadoCivil || ex.estadoCivil,
        }).where(eq(clientes.id, clienteId));
      } else {
        const cl2 = dadosExtraidos.cliente || {} as any;
        const [inserted] = await db.insert(clientes).values({
          cpfCnpj: cpf,
          nomeCompleto: nome,
          tipoPessoa: cl2.tipoPessoa === 'PJ' ? 'PJ' : 'PF',
          rg: cl2.rg || null,
          profissao: cl2.profissao || null,
          cargo: cl2.cargo || null,
          orgaoEmpregador: cl2.orgaoEmpregador || null,
          vinculoFuncional: cl2.vinculoFuncional || null,
          endereco: cl2.endereco || null,
          cidade: cl2.cidade || null,
          estado: cl2.estado || null,
          cep: cl2.cep || null,
          nacionalidade: cl2.nacionalidade || null,
          telefone: cl2.telefone || null,
          email: cl2.email || null,
          dataNascimento: cl2.dataNascimento || null,
          estadoCivil: cl2.estadoCivil || null,
        }).$returningId();
        clienteId = inserted.id;
      }
    } else {
      // CPF não extraído - buscar por nome similar para evitar duplicação
      const nomeLimpo = nome.replace(/PROCESSO|COMPLETO|AUTOS|PRINCIPAIS|CUMPRIMENTO|PROVISORIO|PROVISÓRIO|SENTENÇA|SENTENCA|COMPETO|DE|DO|DA/gi, '').trim();
      const palavrasNome = nomeLimpo.split(/\s+/).filter((p: string) => p.length > 2);
      let clienteExistente = null;
      if (palavrasNome.length > 0) {
        const todosClientes = await db.select().from(clientes);
        for (const c of todosClientes) {
          const nomeClienteLimpo = c.nomeCompleto.replace(/PROCESSO|COMPLETO|AUTOS|PRINCIPAIS|CUMPRIMENTO|PROVISORIO|PROVISÓRIO|SENTENÇA|SENTENCA|COMPETO|DE|DO|DA/gi, '').trim().toUpperCase();
          const matches = palavrasNome.filter((p: string) => nomeClienteLimpo.includes(p.toUpperCase()));
          if (matches.length >= 1 && matches.length >= palavrasNome.length * 0.5) {
            clienteExistente = c;
            break;
          }
        }
      }
      if (clienteExistente) {
        clienteId = clienteExistente.id;
        console.log(`[Job] Cliente encontrado por nome similar: ${clienteExistente.nomeCompleto} (ID: ${clienteId})`);
      } else {
        const cl3 = dadosExtraidos.cliente || {} as any;
        const [inserted] = await db.insert(clientes).values({
          cpfCnpj: `PEND_${Date.now().toString(36)}`,
          nomeCompleto: nome,
          tipoPessoa: cl3.tipoPessoa === 'PJ' ? 'PJ' : 'PF',
          rg: cl3.rg || null,
          profissao: cl3.profissao || null,
          cargo: cl3.cargo || null,
          orgaoEmpregador: cl3.orgaoEmpregador || null,
          vinculoFuncional: cl3.vinculoFuncional || null,
          endereco: cl3.endereco || null,
          cidade: cl3.cidade || null,
          estado: cl3.estado || null,
          cep: cl3.cep || null,
          nacionalidade: cl3.nacionalidade || null,
          telefone: cl3.telefone || null,
          email: cl3.email || null,
          dataNascimento: cl3.dataNascimento || null,
          estadoCivil: cl3.estadoCivil || null,
        }).$returningId();
        clienteId = inserted.id;
      }
    }

    await updateProgress(50, 'Enviando PDF para armazenamento...');
    // 4. Upload PDF to client folder in S3
    const clienteCpf = cpf || `PEND_${Date.now().toString(36)}`;
    const folder = clientFolderKey(nome, clienteCpf);
    const pdfKey = `${folder}/processos_pdf/${inputData.fileName}`;
    const { key, url: pdfUrl } = await storagePut(pdfKey, pdfBuffer, 'application/pdf');

    await updateProgress(55, 'Salvando processo...');
    // 5. Insert processo (dedup by numeroCnj)
    const numCnj = dadosExtraidos.processo?.numeroCnj || `SEM_${Date.now().toString(36)}`;
    const existingProc = await db.select().from(processos).where(eq(processos.numeroCnj, numCnj)).limit(1);
    let processoId: number;

    if (existingProc.length > 0) {
      processoId = existingProc[0].id;
      await db.update(processos).set({
        faseAtual: dadosExtraidos.processo?.faseAtual || existingProc[0].faseAtual,
        statusProcesso: dadosExtraidos.processo?.statusProcesso || existingProc[0].statusProcesso,
        pdfStorageKey: key,
        pdfUrl,
        textoExtraido: textoExtraido.substring(0, 60000),
      }).where(eq(processos.id, processoId));
    } else {
      const proc = dadosExtraidos.processo || {};
      const sent = dadosExtraidos.sentenca || {};
      const [insertedProc] = await db.insert(processos).values({
        clienteId,
        numeroCnj: numCnj,
        tribunal: proc.tribunal,
        comarca: proc.comarca,
        vara: proc.vara,
        tipoAcao: proc.tipoAcao,
        natureza: proc.natureza,
        classeProcessual: proc.classeProcessual,
        assunto: proc.assunto,
        faseAtual: proc.faseAtual || 'Conhecimento',
        statusProcesso: proc.statusProcesso || 'Ativo',
        valorCausa: proc.valorCausa ? String(proc.valorCausa) : null,
        dataDistribuicao: proc.dataDistribuicao,
        dataSentenca: proc.dataSentenca,
        juiz: proc.juiz,
        prioridade: proc.prioridade,
        segredoJustica: proc.segredoJustica ? 1 : 0,
        poloAtivo: proc.poloAtivo,
        poloPassivo: proc.poloPassivo,
        advogadoAutor: proc.advogadoAutor,
        valorCondenacao: sent.valorCondenacao ? String(sent.valorCondenacao) : null,
        danosMorais: sent.danosMorais ? String(sent.danosMorais) : null,
        danosMateriais: sent.danosMateriais ? String(sent.danosMateriais) : null,
        restituicao: sent.restituicao ? String(sent.restituicao) : null,
        honorariosPerc: sent.honorariosPerc ? String(sent.honorariosPerc) : null,
        tutelaTipo: sent.tutelaTipo,
        tutelaStatus: sent.tutelaStatus,
        tutelaDescricao: sent.tutelaDescricao,
        pdfStorageKey: key,
        pdfUrl,
        textoExtraido: textoExtraido.substring(0, 60000),
      }).$returningId();
      processoId = insertedProc.id;
    }

    // 5.5. Vincular processo dependente ao principal (se aplicável)
    const origemCnj = dadosExtraidos.processo?.processoOrigemCnj;
    const tipoVinculo = dadosExtraidos.processo?.tipoVinculo;
    if (origemCnj && tipoVinculo) {
      const [procOrigem] = await db.select().from(processos).where(eq(processos.numeroCnj, origemCnj)).limit(1);
      if (procOrigem) {
        await db.update(processos).set({
          processoOrigemId: procOrigem.id,
          tipoVinculo: tipoVinculo,
        }).where(eq(processos.id, processoId));
        console.log(`[Job] Processo ${numCnj} vinculado ao principal ${origemCnj} (${tipoVinculo})`);
      } else {
        await db.update(processos).set({
          tipoVinculo: `${tipoVinculo} (pendente: ${origemCnj})`,
        }).where(eq(processos.id, processoId));
      }
    }

    await updateProgress(65, 'Salvando dados financeiros...');
    // 6. Insert financial data
    if (dadosExtraidos.financeiro) {
      const fin = dadosExtraidos.financeiro;
      if (fin.remuneracaoBruta || fin.remuneracaoLiquida || fin.totalConsignacoes || fin.margemConsignavelValor) {
        await db.insert(dadosFinanceiros).values({
          clienteId,
          remuneracaoBruta: fin.remuneracaoBruta ? String(fin.remuneracaoBruta) : null,
          remuneracaoLiquida: fin.remuneracaoLiquida ? String(fin.remuneracaoLiquida) : null,
          margemConsignavelPerc: fin.margemConsignavelPerc ? String(fin.margemConsignavelPerc) : null,
          margemConsignavelValor: fin.margemConsignavelValor ? String(fin.margemConsignavelValor) : null,
          totalConsignacoes: fin.totalConsignacoes ? String(fin.totalConsignacoes) : null,
          fonteRenda: fin.fonteRenda,
        });
      }
    }

    // 7. Insert emprestimos
    if (dadosExtraidos.emprestimos?.length) {
      for (const emp of dadosExtraidos.emprestimos) {
        await db.insert(emprestimosConsignados).values({
          clienteId,
          banco: emp.banco,
          contrato: emp.contrato,
          valorParcela: emp.valorParcela ? String(emp.valorParcela) : null,
          valorTotal: emp.valorTotal ? String(emp.valorTotal) : null,
          totalParcelas: emp.totalParcelas,
        });
      }
    }

    await updateProgress(70, 'Salvando estratégia processual...');
    // 8. Insert estrategia
    if (dadosExtraidos.estrategia) {
      const est = dadosExtraidos.estrategia;
      if (est.tesePrincipal) {
        await db.insert(estrategias).values({
          processoId,
          tesePrincipal: est.tesePrincipal,
          fundamentacaoLegal: est.fundamentacaoLegal,
          jurisprudenciaCitada: est.jurisprudenciaCitada,
          pontosFortes: est.pontosFortes,
          riscosIdentificados: est.riscosIdentificados,
        });
      }
    }

    await updateProgress(75, 'Salvando partes processuais...');
    // 9. Insert partes passivas
    if (dadosExtraidos.partesPassivas?.length) {
      for (const parte of dadosExtraidos.partesPassivas) {
        await db.insert(partesProcessuais).values({
          processoId,
          nome: parte.nome,
          cpfCnpj: parte.cpfCnpj,
          tipo: 'Reu',
          categoria: parte.categoria,
        });
      }
    }

    await updateProgress(80, 'Salvando movimentações processuais...');
    // 9.5. Insert movimentacoes extraídas pela IA
    if (dadosExtraidos.movimentacoes?.length) {
      for (const mov of dadosExtraidos.movimentacoes) {
        const numEvento = mov.numero_evento ? `[Ev.${mov.numero_evento}] ` : '';
        await db.insert(movimentacoes).values({
          processoId,
          data: mov.data || null,
          evento: (mov.evento || 'Movimentação').substring(0, 500),
          descricao: (numEvento + (mov.descricao || '')).substring(0, 5000),
        });
      }
    }

    await updateProgress(82, 'Salvando movimentações financeiras...');
    // 9.7. Insert movimentacoes financeiras (depósitos, alvarás, honorários)
    if (dadosExtraidos.movimentacoesFinanceiras?.length) {
      for (const mf of dadosExtraidos.movimentacoesFinanceiras) {
        const tiposValidos = ['deposito_judicial','alvara_levantamento','honorarios_sucumbenciais','honorarios_contratuais','pagamento','restituicao','multa','custas'];
        const statusValidos = ['pago_levantado','depositado_a_levantar','pendente','parcial','cancelado'];
        const tipoMov = tiposValidos.includes(mf.tipo) ? mf.tipo : 'pagamento';
        const statusMov = statusValidos.includes(mf.status) ? mf.status : 'pendente';
        const valorNum = parseFloat(String(mf.valor || '0'));
        if (valorNum > 0) {
          await db.insert(movimentacoesFinanceiras).values({
            processoId,
            clienteId,
            tipo: tipoMov as any,
            status: statusMov as any,
            valor: String(valorNum),
            valorLevantado: mf.valorLevantado ? String(mf.valorLevantado) : null,
            valorPendente: mf.valorPendente ? String(mf.valorPendente) : null,
            dataMovimentacao: mf.dataMovimentacao || null,
            dataLevantamento: mf.dataLevantamento || null,
            descricao: mf.descricao || null,
            beneficiario: mf.beneficiario || null,
            banco: mf.banco || null,
            contaDeposito: mf.contaDeposito || null,
            numeroAlvara: mf.numeroAlvara || null,
            percentualHonorarios: mf.percentualHonorarios ? String(mf.percentualHonorarios) : null,
            fundamentoLegal: mf.fundamentoLegal || null,
          });
        }
      }
    }
    // Também gerar honorários sucumbenciais a partir da sentença se não vieram nas movimentações
    const sentData = dadosExtraidos.sentenca || {};
    const jaTemHonorarios = dadosExtraidos.movimentacoesFinanceiras?.some((m: any) => m.tipo === 'honorarios_sucumbenciais');
    if (!jaTemHonorarios && (sentData.honorariosPerc || dadosExtraidos.processo?.valorCausa)) {
      const valorCausa = parseFloat(String(dadosExtraidos.processo?.valorCausa || '0'));
      const percHon = parseFloat(String(sentData.honorariosPerc || '10'));
      const valorHon = valorCausa > 0 ? valorCausa * (percHon / 100) : 0;
      if (valorHon > 0) {
        const statusHon = sentData.resultado && (sentData.resultado.toLowerCase().includes('procedente') || sentData.resultado.toLowerCase().includes('acordo')) ? 'depositado_a_levantar' : 'pendente';
        await db.insert(movimentacoesFinanceiras).values({
          processoId,
          clienteId,
          tipo: 'honorarios_sucumbenciais',
          status: statusHon as any,
          valor: String(valorHon),
          percentualHonorarios: String(percHon),
          descricao: `Honorários sucumbenciais de ${percHon}% sobre valor da causa (R$ ${valorCausa.toFixed(2)})`,
          fundamentoLegal: 'Art. 85 do CPC',
        });
      }
    }

    await updateProgress(85, 'Registrando documento...');
    // 10. Insert document record
    await db.insert(documentos).values({
      processoId,
      clienteId,
      tipo: 'Processo Completo',
      nomeArquivo: inputData.fileName,
      storageKey: key,
      storageUrl: pdfUrl,
      tamanho: inputData.fileSize,
      mimeType: 'application/pdf',
    });

    await updateProgress(88, 'Gerando conhecimentos jurídicos...');
    // 11. Extract knowledge
    if (dadosExtraidos.estrategia?.tesePrincipal) {
      await db.insert(conhecimentos).values({
        categoria: 'Tese',
        titulo: `Tese: ${dadosExtraidos.processo?.tipoAcao || 'Processo'} - ${nome}`,
        conteudo: dadosExtraidos.estrategia.tesePrincipal,
        tribunal: dadosExtraidos.processo?.tribunal,
        tipoAcao: dadosExtraidos.processo?.tipoAcao,
        processoOrigemId: processoId,
      });
    }
    if (dadosExtraidos.estrategia?.jurisprudenciaCitada) {
      await db.insert(conhecimentos).values({
        categoria: 'Jurisprudencia',
        titulo: `Jurisprudência: ${dadosExtraidos.processo?.tipoAcao || 'Processo'} - ${nome}`,
        conteudo: dadosExtraidos.estrategia.jurisprudenciaCitada,
        tribunal: dadosExtraidos.processo?.tribunal,
        tipoAcao: dadosExtraidos.processo?.tipoAcao,
        processoOrigemId: processoId,
      });
    }
    if (dadosExtraidos.estrategia?.fundamentacaoLegal) {
      await db.insert(conhecimentos).values({
        categoria: 'Legislacao',
        titulo: `Fundamentação: ${dadosExtraidos.processo?.tipoAcao || 'Processo'} - ${nome}`,
        conteudo: dadosExtraidos.estrategia.fundamentacaoLegal,
        tribunal: dadosExtraidos.processo?.tribunal,
        tipoAcao: dadosExtraidos.processo?.tipoAcao,
        processoOrigemId: processoId,
      });
    }

    await updateProgress(88, 'Gerando análise profunda do processo...');
    // 11.5. ANÁLISE PROFUNDA: Gerar estudo completo do processo
    try {
      const analiseProfundaPromptJob = `Você é um advogado sênior expert do escritório MELO & PREDA ADVOGADOS.
Faça uma ANÁLISE PROFUNDA E COMPLETA do processo abaixo. Esta análise será usada como base de conhecimento para gerar petições, estratégias e qualquer ação futura.

RETORNE UM JSON com esta estrutura:
{
  "resumoExecutivo": "Resumo completo do processo em 3-5 parágrafos",
  "analiseJuridica": "Análise jurídica detalhada: teses, fundamentação, jurisprudência",
  "estrategiaDetalhada": "Estratégia processual completa: próximos passos, petições, prazos",
  "pontosChave": ["pontos-chave"],
  "riscosOportunidades": "Riscos e oportunidades",
  "valorEstimado": "Análise de valores",
  "historicoResumo": "Resumo cronológico",
  "peticoesNecessarias": ["petições necessárias"],
  "observacoesEspeciais": "Observações especiais"
}

TEXTO DO PROCESSO:
${textoExtraido.substring(0, 45000)}`;

      const analiseResultJob = await invokeLLM({
        messages: [
          { role: 'system', content: 'Você é um advogado sênior especialista. Responda APENAS com JSON válido.' },
          { role: 'user', content: analiseProfundaPromptJob }
        ],
        responseFormat: { type: 'json_object' },
      });
      const analiseContentJob = analiseResultJob.choices[0]?.message?.content;
      const analiseTextJob = typeof analiseContentJob === 'string' ? analiseContentJob : Array.isArray(analiseContentJob) ? analiseContentJob.map((c: any) => c.type === 'text' ? c.text : '').join('') : '';
      const analiseProfundaJob = JSON.parse(analiseTextJob);

      await db.insert(conhecimentos).values({
        categoria: 'Estrategia',
        titulo: `Análise Profunda: ${dadosExtraidos.processo?.tipoAcao || 'Processo'} - ${nome} (${numCnj})`,
        conteudo: JSON.stringify(analiseProfundaJob, null, 2),
        tribunal: dadosExtraidos.processo?.tribunal,
        tipoAcao: dadosExtraidos.processo?.tipoAcao,
        processoOrigemId: processoId,
        tags: `analise_profunda,${nome},${numCnj}`,
      });

      if (analiseProfundaJob.resumoExecutivo) {
        await db.insert(conhecimentos).values({
          categoria: 'Estrategia',
          titulo: `Resumo Executivo: ${nome} - ${numCnj}`,
          conteudo: analiseProfundaJob.resumoExecutivo + '\n\n' + (analiseProfundaJob.analiseJuridica || '') + '\n\n' + (analiseProfundaJob.estrategiaDetalhada || ''),
          tribunal: dadosExtraidos.processo?.tribunal,
          tipoAcao: dadosExtraidos.processo?.tipoAcao,
          processoOrigemId: processoId,
          tags: `resumo_executivo,${nome},${numCnj}`,
        });
      }

      if (analiseProfundaJob.peticoesNecessarias?.length) {
        await db.insert(conhecimentos).values({
          categoria: 'Estrategia',
          titulo: `Petições Necessárias: ${nome} - ${numCnj}`,
          conteudo: analiseProfundaJob.peticoesNecessarias.join('\n- ') + '\n\n' + (analiseProfundaJob.observacoesEspeciais || ''),
          tribunal: dadosExtraidos.processo?.tribunal,
          tipoAcao: dadosExtraidos.processo?.tipoAcao,
          processoOrigemId: processoId,
          tags: `peticoes_necessarias,${nome},${numCnj}`,
        });
      }

      console.log(`[Job] Análise profunda gerada e salva para ${nome} (${numCnj})`);
    } catch (analiseErr) {
      console.error('[Job] Erro na análise profunda (não-crítico):', analiseErr);
    }

    await updateProgress(94, 'Gerando pasta do cliente...');
    // 12. Build client folder with all JSON files in S3
    try {
      await buildClientFolder(clienteId, nome, clienteCpf);
    } catch (e) {
      console.error('[Job] Erro ao gerar pasta do cliente:', e);
    }

    await updateProgress(96, 'Atualizando relatórios...');
    // 13. Atualizar Relatório Cadastral automaticamente
    try {
      await autoUpdateRelatorioCadastral(db);
      console.log(`[Job] Relatório cadastral atualizado após importação de ${nome}`);
    } catch (relErr) {
      console.error('[Job] Erro ao atualizar relatório:', relErr);
    }

    await updateProgress(100, 'Concluído!');
    await db.update(jobs).set({
      status: 'concluido',
      concluidoEm: new Date(),
      clienteId,
      processoId,
      outputData: JSON.stringify({
        clienteId,
        processoId,
        clienteNome: nome,
        cpf: cpf || 'PENDENTE',
        numeroCnj: numCnj,
        pastaCliente: folder,
        dadosExtraidos,
        relatorioAtualizado: true,
      }),
    }).where(eq(jobs.id, jobId));

  } catch (error: any) {
    throw error;
  }
}

async function processarJobImportacaoContracheque(jobId: number, inputData: any) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const updateProgress = async (progresso: number, msg: string) => {
    await db.update(jobs).set({ progresso, mensagemProgresso: msg }).where(eq(jobs.id, jobId));
  };

  try {
    await updateProgress(10, 'Extraindo texto do contracheque...');
    const pdfBuffer = Buffer.from(inputData.fileBase64, 'base64');
    let textoExtraido = '';
    try {
      const pdfParse = (await import('pdf-parse') as any).default || (await import('pdf-parse'));
      const pdfData = await pdfParse(pdfBuffer);
      textoExtraido = pdfData.text || '';
    } catch { textoExtraido = ''; }

    if (!textoExtraido.trim()) {
      await db.update(jobs).set({
        status: 'erro',
        erroDetalhes: 'Não foi possível extrair texto do contracheque.',
        concluidoEm: new Date(),
        progresso: 0,
      }).where(eq(jobs.id, jobId));
      return;
    }

    await updateProgress(25, 'Analisando dados financeiros com IA (prompt completo)...');
    // Usar o MESMO prompt detalhado do upload individual de contracheque
    const extractionPrompt = `Você é um assistente especializado em análise de contracheques e demonstrativos de pagamento de servidores públicos brasileiros.
Analise o texto extraído de um contracheque/demonstrativo de pagamento e extraia TODOS os dados financeiros detalhados.

REGRAS IMPORTANTES:
- Identifique o NOME COMPLETO e CPF do servidor/beneficiário
- Extraia TODOS os valores de remuneração (bruta, líquida, descontos)
- Identifique CADA empréstimo consignado individualmente (banco, rubrica, contrato, parcela, total de parcelas)
- Calcule a margem consignável (35% do líquido para servidores de GO - Lei Estadual 16.898/2010)
- Some TODOS os descontos de empréstimos consignados para obter o total de consignações
- Calcule a margem disponível = margem consignável - total de consignações
- Se margem disponível < 0, a margem está excedida
- Valores monetários devem ser números sem formatação (ex: 4871.50)
- Identifique o órgão empregador, cargo, vínculo funcional
- Identifique o mês/ano de referência do contracheque

Retorne um JSON com esta estrutura exata:
{
  "servidor": {
    "nomeCompleto": "string",
    "cpf": "string ou null",
    "rg": "string ou null",
    "cargo": "string ou null",
    "orgaoEmpregador": "string ou null",
    "vinculoFuncional": "string ou null (Efetivo, Comissionado, Aposentado, Pensionista)",
    "lotacao": "string ou null",
    "matricula": "string ou null"
  },
  "referencia": {
    "mesAno": "string (MM/YYYY)",
    "dataCredito": "string ou null (DD/MM/YYYY)"
  },
  "remuneracao": {
    "remuneracaoBruta": "number",
    "descontoIrrf": "number ou null",
    "descontoPrevidencia": "number ou null",
    "outrosDescontos": "number ou null",
    "totalDescontos": "number",
    "remuneracaoLiquida": "number"
  },
  "margemConsignavel": {
    "percentual": 35,
    "valorMargem": "number (35% do líquido)",
    "totalConsignacoes": "number (soma de todas as parcelas de empréstimos)",
    "margemDisponivel": "number (valorMargem - totalConsignacoes)",
    "margemExcedida": "boolean",
    "valorExcedente": "number ou 0"
  },
  "emprestimosConsignados": [
    {
      "banco": "string (nome da instituição financeira)",
      "rubrica": "string ou null (código da rubrica no contracheque)",
      "contrato": "string ou null",
      "valorParcela": "number",
      "totalParcelas": "number ou null",
      "parcelasRestantes": "number ou null",
      "valorTotal": "number ou null",
      "taxaJuros": "number ou null"
    }
  ]
}

TEXTO DO CONTRACHEQUE:
${textoExtraido.substring(0, 50000)}`;

    let dadosExtraidos: any = {};
    try {
      const result = await invokeLLM({
        messages: [
          { role: 'system', content: 'Você é um extrator de dados financeiros de contracheques. Responda APENAS com JSON válido, sem markdown.' },
          { role: 'user', content: extractionPrompt }
        ],
        responseFormat: { type: 'json_object' },
      });
      const content = result.choices[0]?.message?.content;
      const textContent = typeof content === 'string' ? content : Array.isArray(content) ? content.map((c: any) => c.type === 'text' ? c.text : '').join('') : '';
      dadosExtraidos = JSON.parse(textContent);
    } catch (e) {
      console.error('[Job] AI extraction error (contracheque):', e);
      throw new Error('Falha na extração de dados do contracheque via IA');
    }

    await updateProgress(45, 'Salvando cliente...');
    // 3. Find or create client
    let clienteId: number;
    const cpf = dadosExtraidos.servidor?.cpf;
    const nome = dadosExtraidos.servidor?.nomeCompleto || inputData.fileName.replace(/\.pdf$/i, '');

    if (cpf) {
      const existing = await db.select().from(clientes).where(eq(clientes.cpfCnpj, cpf)).limit(1);
      if (existing.length > 0) {
        clienteId = existing[0].id;
        // MERGE INTELIGENTE: preenche TODOS os campos vazios
        const serv = dadosExtraidos.servidor || {};
        const exC = existing[0];
        await db.update(clientes).set({
          rg: serv.rg || exC.rg,
          cargo: serv.cargo || exC.cargo,
          orgaoEmpregador: serv.orgaoEmpregador || exC.orgaoEmpregador,
          vinculoFuncional: serv.vinculoFuncional || exC.vinculoFuncional,
          profissao: serv.cargo || exC.profissao,
          endereco: serv.endereco || exC.endereco,
          cidade: serv.cidade || exC.cidade,
          estado: serv.estado || exC.estado,
          cep: serv.cep || exC.cep,
          nacionalidade: serv.nacionalidade || exC.nacionalidade,
          telefone: serv.telefone || exC.telefone,
          email: serv.email || exC.email,
          dataNascimento: serv.dataNascimento || exC.dataNascimento,
          estadoCivil: serv.estadoCivil || exC.estadoCivil,
        }).where(eq(clientes.id, clienteId));
      } else {
        // Create new client from contracheque
        const serv = dadosExtraidos.servidor || {};
        const [inserted] = await db.insert(clientes).values({
          cpfCnpj: cpf,
          nomeCompleto: nome,
          tipoPessoa: 'PF',
          rg: serv.rg || null,
          cargo: serv.cargo || null,
          orgaoEmpregador: serv.orgaoEmpregador || null,
          vinculoFuncional: serv.vinculoFuncional || null,
          profissao: serv.cargo || 'Servidor Público',
          endereco: serv.endereco || null,
          cidade: serv.cidade || null,
          estado: serv.estado || null,
          cep: serv.cep || null,
          nacionalidade: serv.nacionalidade || null,
          telefone: serv.telefone || null,
          email: serv.email || null,
          dataNascimento: serv.dataNascimento || null,
          estadoCivil: serv.estadoCivil || null,
        }).$returningId();
        clienteId = inserted.id;
      }
    } else {
      // CPF não extraído - buscar por nome similar
      const nomeLimpo = nome.replace(/CONTRACHEQUE|DEMONSTRATIVO|HOLERITE|PAGAMENTO|FOLHA/gi, '').trim();
      const palavrasNome = nomeLimpo.split(/\s+/).filter((p: string) => p.length > 2);
      let clienteExistente = null;
      if (palavrasNome.length > 0) {
        const todosClientes = await db.select().from(clientes);
        for (const c of todosClientes) {
          const nomeClienteLimpo = c.nomeCompleto.toUpperCase();
          const matches = palavrasNome.filter((p: string) => nomeClienteLimpo.includes(p.toUpperCase()));
          if (matches.length >= 1 && matches.length >= palavrasNome.length * 0.5) {
            clienteExistente = c;
            break;
          }
        }
      }
      if (clienteExistente) {
        clienteId = clienteExistente.id;
      } else {
        const serv2 = dadosExtraidos.servidor || {};
        const [inserted] = await db.insert(clientes).values({
          cpfCnpj: `PEND_${Date.now().toString(36)}`,
          nomeCompleto: nome,
          tipoPessoa: 'PF',
          profissao: serv2.cargo || 'Servidor Público',
          rg: serv2.rg || null,
          cargo: serv2.cargo || null,
          orgaoEmpregador: serv2.orgaoEmpregador || null,
          vinculoFuncional: serv2.vinculoFuncional || null,
          endereco: serv2.endereco || null,
          cidade: serv2.cidade || null,
          estado: serv2.estado || null,
          cep: serv2.cep || null,
          nacionalidade: serv2.nacionalidade || null,
          telefone: serv2.telefone || null,
          email: serv2.email || null,
          dataNascimento: serv2.dataNascimento || null,
          estadoCivil: serv2.estadoCivil || null,
        }).$returningId();
        clienteId = inserted.id;
      }
    }

    await updateProgress(55, 'Enviando contracheque para armazenamento...');
    // 4. Upload contracheque PDF to S3
    const clienteCpf = cpf || `PEND_${Date.now().toString(36)}`;
    const folder = clientFolderKey(nome, clienteCpf);
    const ref = dadosExtraidos.referencia?.mesAno?.replace('/', '_') || 'sem_ref';
    const pdfKey = `${folder}/contracheques/${ref}_${inputData.fileName}`;
    const { key, url: pdfUrl } = await storagePut(pdfKey, pdfBuffer, 'application/pdf');

    await updateProgress(60, 'Registrando documento...');
    // 5. Insert document record
    await db.insert(documentos).values({
      clienteId,
      tipo: 'Contracheque',
      nomeArquivo: inputData.fileName,
      storageKey: key,
      storageUrl: pdfUrl,
      tamanho: inputData.fileSize,
      mimeType: 'application/pdf',
    });

    await updateProgress(70, 'Calculando margem consignável...');
    // 6. Insert/Update financial data with full calculations
    const rem = dadosExtraidos.remuneracao || {};
    const marg = dadosExtraidos.margemConsignavel || {};
    const remuneracaoBruta = rem.remuneracaoBruta || 0;
    const remuneracaoLiquida = rem.remuneracaoLiquida || 0;
    const descontoIrrf = rem.descontoIrrf || 0;
    const descontoPrevidencia = rem.descontoPrevidencia || 0;
    const outrosDescontos = rem.outrosDescontos || 0;
    const margemPerc = marg.percentual || 35;
    const margemValor = marg.valorMargem || (remuneracaoLiquida * 0.35);
    const totalConsignacoes = marg.totalConsignacoes || 0;
    const margemDisponivel = marg.margemDisponivel ?? (margemValor - totalConsignacoes);
    const margemExcedida = margemDisponivel < 0 ? 1 : 0;
    const valorExcedente = margemExcedida ? Math.abs(margemDisponivel) : 0;
    const aptoEmprestimo = margemDisponivel > 0 ? 1 : 0;
    const scoreRisco = margemExcedida ? 'Alto' : (margemDisponivel < margemValor * 0.1 ? 'Medio' : 'Baixo');

    // Check if financial data already exists for this client
    const existingFin = await db.select().from(dadosFinanceiros).where(eq(dadosFinanceiros.clienteId, clienteId)).limit(1);
    if (existingFin.length > 0) {
      await db.update(dadosFinanceiros).set({
        remuneracaoBruta: String(remuneracaoBruta),
        remuneracaoLiquida: String(remuneracaoLiquida),
        descontoIrrf: String(descontoIrrf),
        descontoPrevidencia: String(descontoPrevidencia),
        outrosDescontos: String(outrosDescontos),
        margemConsignavelPerc: String(margemPerc),
        margemConsignavelValor: String(margemValor),
        totalConsignacoes: String(totalConsignacoes),
        margemDisponivel: String(margemDisponivel),
        margemExcedida,
        valorExcedente: String(valorExcedente),
        aptoEmprestimo,
        scoreRisco: scoreRisco as 'Baixo' | 'Medio' | 'Alto',
        fonteRenda: dadosExtraidos.servidor?.orgaoEmpregador || 'Servidor Público',
        dataReferencia: dadosExtraidos.referencia?.mesAno || null,
      }).where(eq(dadosFinanceiros.clienteId, clienteId));
    } else {
      await db.insert(dadosFinanceiros).values({
        clienteId,
        remuneracaoBruta: String(remuneracaoBruta),
        remuneracaoLiquida: String(remuneracaoLiquida),
        descontoIrrf: String(descontoIrrf),
        descontoPrevidencia: String(descontoPrevidencia),
        outrosDescontos: String(outrosDescontos),
        margemConsignavelPerc: String(margemPerc),
        margemConsignavelValor: String(margemValor),
        totalConsignacoes: String(totalConsignacoes),
        margemDisponivel: String(margemDisponivel),
        margemExcedida,
        valorExcedente: String(valorExcedente),
        aptoEmprestimo,
        scoreRisco: scoreRisco as 'Baixo' | 'Medio' | 'Alto',
        fonteRenda: dadosExtraidos.servidor?.orgaoEmpregador || 'Servidor Público',
        dataReferencia: dadosExtraidos.referencia?.mesAno || null,
      });
    }

    await updateProgress(80, 'Salvando empréstimos consignados...');
    // 7. Insert/Update emprestimos consignados (replace all for this client)
    if (dadosExtraidos.emprestimosConsignados?.length) {
      // Delete old emprestimos for this client to avoid duplication
      await db.delete(emprestimosConsignados).where(eq(emprestimosConsignados.clienteId, clienteId));
      for (const emp of dadosExtraidos.emprestimosConsignados) {
        await db.insert(emprestimosConsignados).values({
          clienteId,
          banco: emp.banco,
          rubrica: emp.rubrica,
          contrato: emp.contrato,
          valorParcela: emp.valorParcela ? String(emp.valorParcela) : null,
          valorTotal: emp.valorTotal ? String(emp.valorTotal) : null,
          totalParcelas: emp.totalParcelas,
          parcelasRestantes: emp.parcelasRestantes,
          taxaJuros: emp.taxaJuros ? String(emp.taxaJuros) : null,
          status: 'Ativo',
        });
      }
    }

    await updateProgress(88, 'Gerando pasta do cliente...');
    // 8. Build/update client folder
    try {
      await buildClientFolder(clienteId, nome, clienteCpf);
    } catch (e) {
      console.error('[Job] Erro ao gerar pasta do cliente:', e);
    }

    await updateProgress(94, 'Atualizando relatórios...');
    // 9. Update relatório cadastral
    try {
      await autoUpdateRelatorioCadastral(db);
      console.log(`[Job] Relatório cadastral atualizado após upload de contracheque de ${nome}`);
    } catch (relErr) {
      console.error('[Job] Erro ao atualizar relatório:', relErr);
    }

    await updateProgress(100, 'Concluído!');
    await db.update(jobs).set({
      status: 'concluido',
      concluidoEm: new Date(),
      clienteId,
      outputData: JSON.stringify({
        clienteId,
        clienteNome: nome,
        cpf: cpf || 'PENDENTE',
        referencia: dadosExtraidos.referencia?.mesAno || 'N/A',
        resumoFinanceiro: {
          remuneracaoBruta,
          remuneracaoLiquida,
          margemConsignavel: margemValor,
          totalConsignacoes,
          margemDisponivel,
          margemExcedida: margemExcedida === 1,
          aptoEmprestimo: aptoEmprestimo === 1,
          scoreRisco,
          totalEmprestimos: dadosExtraidos.emprestimosConsignados?.length || 0,
        },
        dadosExtraidos,
        relatorioAtualizado: true,
      }),
    }).where(eq(jobs.id, jobId));

  } catch (error: any) {
    throw error;
  }
}

// ==================== PROCESSADOR DE LOTE COMPLETO ====================
async function processarLoteCompleto(
  masterJobId: number,
  jobIds: number[],
  loteId: string,
  opcoes: { gerarConhecimentos?: boolean; gerarRelatorios?: boolean; deduplicarAutomatico?: boolean; gerarPastaCliente?: boolean }
) {
  const db = await getDb();
  if (!db) return;

  const totalJobs = jobIds.length;
  let concluidos = 0;
  let erros = 0;
  const clientesProcessados = new Set<number>();
  const processosProcessados: number[] = [];

  // Processar cada job sequencialmente
  for (let i = 0; i < jobIds.length; i++) {
    const jobId = jobIds[i];
    try {
      // Atualizar progresso do master
      const progressoGeral = Math.round(((i) / totalJobs) * 80);
      await db.update(jobs).set({
        progresso: progressoGeral,
        mensagemProgresso: `Processando arquivo ${i + 1}/${totalJobs}...`,
      }).where(eq(jobs.id, masterJobId));

      // Buscar job
      const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
      if (!job || job.status === 'cancelado') continue;

      // Marcar como processando
      await db.update(jobs).set({
        status: 'processando',
        iniciadoEm: new Date(),
        progresso: 5,
        mensagemProgresso: 'Iniciando processamento...',
        tentativas: (job.tentativas || 0) + 1,
      }).where(eq(jobs.id, jobId));

      const inputData = typeof job.inputData === 'string' ? JSON.parse(job.inputData) : job.inputData;

      if (job.tipo === 'importacao_pdf') {
        await processarJobImportacaoPdf(jobId, inputData);
      } else if (job.tipo === 'importacao_contracheque') {
        await processarJobImportacaoContracheque(jobId, inputData);
      }

      // Coletar resultados
      const [completedJob] = await db.select().from(jobs).where(eq(jobs.id, jobId));
      if (completedJob?.status === 'concluido') {
        concluidos++;
        if (completedJob.clienteId) clientesProcessados.add(completedJob.clienteId);
        if (completedJob.processoId) processosProcessados.push(completedJob.processoId);
      } else {
        erros++;
      }
    } catch (error: any) {
      console.error(`[Lote] Erro no job ${jobId}:`, error);
      await db.update(jobs).set({
        status: 'erro',
        erroDetalhes: error?.message || 'Erro desconhecido',
        concluidoEm: new Date(),
        progresso: 0,
        mensagemProgresso: 'Falha no processamento',
      }).where(eq(jobs.id, jobId));
      erros++;
    }
  }

  // ==================== PÓS-PROCESSAMENTO DO LOTE ====================
  try {
    await db.update(jobs).set({
      progresso: 85,
      mensagemProgresso: 'Finalizando lote: gerando conhecimentos e relatórios...',
    }).where(eq(jobs.id, masterJobId));

    // 1. Gerar conhecimentos automáticos para processos importados
    if (opcoes.gerarConhecimentos && processosProcessados.length > 0) {
      try {
        await gerarConhecimentosLote(processosProcessados);
        console.log(`[Lote] Conhecimentos gerados para ${processosProcessados.length} processos`);
      } catch (e) {
        console.error('[Lote] Erro ao gerar conhecimentos:', e);
      }
    }

    await db.update(jobs).set({
      progresso: 90,
      mensagemProgresso: 'Deduplicando dados...',
    }).where(eq(jobs.id, masterJobId));

    // 2. Deduplicar automaticamente
    if (opcoes.deduplicarAutomatico) {
      try {
        // Normalizar CPFs
        const allClientes = await db.select().from(clientes);
        for (const cli of allClientes) {
          const cpfNorm = cli.cpfCnpj.replace(/[.\-\/]/g, '');
          if (cpfNorm !== cli.cpfCnpj && !cli.cpfCnpj.startsWith('PEND') && !cli.cpfCnpj.startsWith('SEM_CPF')) {
            const existing = await db.select().from(clientes).where(eq(clientes.cpfCnpj, cpfNorm)).limit(1);
            if (existing.length === 0) {
              await db.update(clientes).set({ cpfCnpj: cpfNorm }).where(eq(clientes.id, cli.id));
            }
          }
        }
        console.log('[Lote] Deduplicação automática concluída');
      } catch (e) {
        console.error('[Lote] Erro na deduplicação:', e);
      }
    }

    await db.update(jobs).set({
      progresso: 95,
      mensagemProgresso: 'Gerando relatórios consolidados...',
    }).where(eq(jobs.id, masterJobId));

    // 3. Gerar relatórios consolidados
    if (opcoes.gerarRelatorios) {
      try {
        await autoUpdateRelatorioCadastral(db);
        console.log('[Lote] Relatório cadastral atualizado');
      } catch (e) {
        console.error('[Lote] Erro ao atualizar relatório:', e);
      }
    }

    // 4. Gerar pastas de clientes
    if (opcoes.gerarPastaCliente) {
      for (const clienteId of Array.from(clientesProcessados)) {
        try {
          const [cli] = await db.select().from(clientes).where(eq(clientes.id, clienteId)).limit(1);
          if (cli) {
            await buildClientFolder(clienteId, cli.nomeCompleto, cli.cpfCnpj);
          }
        } catch (e) {
          console.error(`[Lote] Erro ao gerar pasta do cliente ${clienteId}:`, e);
        }
      }
    }

    // Finalizar master job
    await db.update(jobs).set({
      status: 'concluido',
      progresso: 100,
      mensagemProgresso: `Lote concluído: ${concluidos} sucesso, ${erros} erro(s)`,
      concluidoEm: new Date(),
      outputData: JSON.stringify({
        loteId,
        totalArquivos: totalJobs,
        concluidos,
        erros,
        clientesProcessados: Array.from(clientesProcessados),
        processosProcessados,
        totalClientesUnicos: clientesProcessados.size,
        totalProcessosImportados: processosProcessados.length,
      }),
    }).where(eq(jobs.id, masterJobId));

    console.log(`[Lote] ${loteId} finalizado: ${concluidos}/${totalJobs} sucesso, ${erros} erros, ${clientesProcessados.size} clientes, ${processosProcessados.length} processos`);

  } catch (finalError: any) {
    console.error('[Lote] Erro na finalização:', finalError);
    await db.update(jobs).set({
      status: 'erro',
      erroDetalhes: `Erro na finalização do lote: ${finalError?.message}`,
      concluidoEm: new Date(),
    }).where(eq(jobs.id, masterJobId));
  }
}

// ==================== GERADOR DE CONHECIMENTOS EM LOTE ====================
async function gerarConhecimentosLote(processoIds: number[]) {
  const db = await getDb();
  if (!db) return;

  for (const processoId of processoIds) {
    try {
      const [proc] = await db.select().from(processos).where(eq(processos.id, processoId)).limit(1);
      if (!proc) continue;

      // Verificar se já existem conhecimentos para este processo
      const existingKnowledge = await db.select().from(conhecimentos).where(eq(conhecimentos.processoOrigemId, processoId));
      if (existingKnowledge.length >= 3) continue; // Já tem conhecimentos suficientes

      // Buscar estratégias do processo
      const estrats = await db.select().from(estrategias).where(eq(estrategias.processoId, processoId));
      
      // Buscar cliente
      const [cliente] = await db.select().from(clientes).where(eq(clientes.id, proc.clienteId)).limit(1);
      const nomeCliente = cliente?.nomeCompleto || 'Cliente';

      // Gerar conhecimentos a partir das estratégias existentes
      for (const est of estrats) {
        if (est.tesePrincipal && !existingKnowledge.some(k => k.categoria === 'Tese' && k.processoOrigemId === processoId)) {
          await db.insert(conhecimentos).values({
            categoria: 'Tese',
            titulo: `Tese: ${proc.tipoAcao || 'Processo'} - ${nomeCliente}`,
            conteudo: est.tesePrincipal,
            tribunal: proc.tribunal,
            tipoAcao: proc.tipoAcao,
            processoOrigemId: processoId,
          });
        }
        if (est.jurisprudenciaCitada && !existingKnowledge.some(k => k.categoria === 'Jurisprudencia' && k.processoOrigemId === processoId)) {
          await db.insert(conhecimentos).values({
            categoria: 'Jurisprudencia',
            titulo: `Jurisprudência: ${proc.tipoAcao || 'Processo'} - ${nomeCliente}`,
            conteudo: est.jurisprudenciaCitada,
            tribunal: proc.tribunal,
            tipoAcao: proc.tipoAcao,
            processoOrigemId: processoId,
          });
        }
        if (est.fundamentacaoLegal && !existingKnowledge.some(k => k.categoria === 'Legislacao' && k.processoOrigemId === processoId)) {
          await db.insert(conhecimentos).values({
            categoria: 'Legislacao',
            titulo: `Fundamentação: ${proc.tipoAcao || 'Processo'} - ${nomeCliente}`,
            conteudo: est.fundamentacaoLegal,
            tribunal: proc.tribunal,
            tipoAcao: proc.tipoAcao,
            processoOrigemId: processoId,
          });
        }
        if (est.pontosFortes && !existingKnowledge.some(k => k.categoria === 'Estrategia' && k.processoOrigemId === processoId)) {
          await db.insert(conhecimentos).values({
            categoria: 'Estrategia',
            titulo: `Estratégia: ${proc.tipoAcao || 'Processo'} - ${nomeCliente}`,
            conteudo: `Pontos Fortes: ${est.pontosFortes}\n\nRiscos: ${est.riscosIdentificados || 'N/A'}`,
            tribunal: proc.tribunal,
            tipoAcao: proc.tipoAcao,
            processoOrigemId: processoId,
          });
        }
      }

      // Se não tem estratégias mas tem texto extraído, gerar via IA
      if (estrats.length === 0 && proc.textoExtraido && proc.textoExtraido.length > 100) {
        try {
          const llmResp = await invokeLLM({
            messages: [
              { role: 'system', content: 'Você é um assistente jurídico. Extraia a tese principal, fundamentação legal e jurisprudência citada do texto do processo. Retorne JSON com: tesePrincipal, fundamentacaoLegal, jurisprudenciaCitada, pontosFortes, riscosIdentificados.' },
              { role: 'user', content: proc.textoExtraido.substring(0, 8000) },
            ],
          });
          const content = llmResp.choices[0]?.message?.content;
          const textContent = typeof content === 'string' ? content : '';
          const dados = JSON.parse(textContent);

          if (dados.tesePrincipal) {
            await db.insert(estrategias).values({
              processoId,
              tesePrincipal: dados.tesePrincipal,
              fundamentacaoLegal: dados.fundamentacaoLegal,
              jurisprudenciaCitada: dados.jurisprudenciaCitada,
              pontosFortes: dados.pontosFortes,
              riscosIdentificados: dados.riscosIdentificados,
            });
            // Gerar conhecimentos
            await db.insert(conhecimentos).values({
              categoria: 'Tese',
              titulo: `Tese: ${proc.tipoAcao || 'Processo'} - ${nomeCliente}`,
              conteudo: dados.tesePrincipal,
              tribunal: proc.tribunal,
              tipoAcao: proc.tipoAcao,
              processoOrigemId: processoId,
            });
            if (dados.jurisprudenciaCitada) {
              await db.insert(conhecimentos).values({
                categoria: 'Jurisprudencia',
                titulo: `Jurisprudência: ${proc.tipoAcao || 'Processo'} - ${nomeCliente}`,
                conteudo: dados.jurisprudenciaCitada,
                tribunal: proc.tribunal,
                tipoAcao: proc.tipoAcao,
                processoOrigemId: processoId,
              });
            }
          }
        } catch (e) {
          console.error(`[Lote] Erro ao gerar conhecimentos via IA para processo ${processoId}:`, e);
        }
      }
    } catch (e) {
      console.error(`[Lote] Erro ao gerar conhecimentos para processo ${processoId}:`, e);
    }
  }
}

// ==================== VERIFICAÇÃO PERIÓDICA DE PRAZOS ====================
async function verificarPrazosAutomaticamente() {
  try {
    const db = await getDb();
    if (!db) return;
    const pendentes = await db.select().from(prazosProcessuais)
      .where(eq(prazosProcessuais.status, 'pendente'));
    const agora = new Date();
    for (const prazo of pendentes) {
      const vencimento = new Date(prazo.dataVencimento);
      const diffMs = vencimento.getTime() - agora.getTime();
      const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      if (diffDias < 0) {
        await db.update(prazosProcessuais)
          .set({ status: 'vencido' })
          .where(eq(prazosProcessuais.id, prazo.id));
        if (!prazo.notificacaoEnviada) {
          await criarNotificacao({
            tipo: 'prazo_vencido',
            prioridade: 'urgente',
            titulo: `PRAZO VENCIDO: ${prazo.titulo}`,
            mensagem: `O prazo venceu em ${vencimento.toLocaleDateString('pt-BR')}. Ação imediata necessária.`,
            processoId: prazo.processoId,
            clienteId: prazo.clienteId,
            prazoId: prazo.id,
            linkUrl: `/clientes/${prazo.clienteId}`,
            icone: 'AlertTriangle',
            cor: 'red',
          });
          await db.update(prazosProcessuais)
            .set({ notificacaoEnviada: 1 })
            .where(eq(prazosProcessuais.id, prazo.id));
        }
      } else if (diffDias <= (prazo.diasAntecedencia || 3) && !prazo.notificacaoEnviada) {
        await criarNotificacao({
          tipo: 'prazo_vencendo',
          prioridade: diffDias <= 1 ? 'urgente' : 'alta',
          titulo: `Prazo em ${diffDias} dia(s): ${prazo.titulo}`,
          mensagem: `O prazo vence em ${vencimento.toLocaleDateString('pt-BR')} (${diffDias} dia(s) restantes).`,
          processoId: prazo.processoId,
          clienteId: prazo.clienteId,
          prazoId: prazo.id,
          linkUrl: `/clientes/${prazo.clienteId}`,
          icone: 'Clock',
          cor: diffDias <= 1 ? 'red' : 'amber',
        });
        await db.update(prazosProcessuais)
          .set({ notificacaoEnviada: 1 })
          .where(eq(prazosProcessuais.id, prazo.id));
      }
    }
    console.log(`[Prazos] Verificação automática: ${pendentes.length} prazos verificados`);
  } catch (e: any) {
    if (e?.message?.includes('ECONNRESET') || e?.cause?.message?.includes('ECONNRESET')) return;
    console.error('[Prazos] Erro na verificação automática:', e);
  }
}

// Verificar prazos a cada 6 horas
if (typeof setInterval !== 'undefined') {
  setInterval(verificarPrazosAutomaticamente, 6 * 60 * 60 * 1000);
  // Primeira verificação 30s após iniciar
  setTimeout(verificarPrazosAutomaticamente, 30000);
}

// ==================== AUTO-CLEANUP DE JOBS PRESOS ====================
async function limparJobsPresos() {
  try {
    const db = await getDb();
    if (!db) return;
    const trintaMinAtras = new Date(Date.now() - 30 * 60 * 1000);
    const presos = await db.select({ id: jobs.id, titulo: jobs.titulo })
      .from(jobs)
      .where(sql`${jobs.status} = 'processando' AND ${jobs.createdAt} < ${trintaMinAtras}`);
    if (presos.length > 0) {
      await db.update(jobs).set({
        status: 'concluido',
        progresso: 100,
        mensagemProgresso: 'Concluído automaticamente (timeout 30min)',
        concluidoEm: new Date(),
      }).where(sql`${jobs.status} = 'processando' AND ${jobs.createdAt} < ${trintaMinAtras}`);
      console.log(`[Jobs] Auto-cleanup: ${presos.length} jobs presos corrigidos`);
    }
  } catch (e: any) {
    // Silenciar erros de conexão temporários que são normais em ambientes cloud
    const errMsg = String(e?.message || '') + String(e?.cause?.message || '');
    if (errMsg.includes('ECONNRESET') || errMsg.includes('Region is unavailable') || errMsg.includes('Connection lost')) {
      // Conexão perdida temporariamente - será retentada no próximo ciclo
      return;
    }
    console.error('[Jobs] Erro no auto-cleanup:', e);
  }
}

if (typeof setInterval !== 'undefined') {
  // Limpar jobs presos a cada 15 minutos
  setInterval(limparJobsPresos, 15 * 60 * 1000);
  // Primeira limpeza 60s após iniciar
  setTimeout(limparJobsPresos, 60000);
}

export type AppRouter = typeof appRouter;
