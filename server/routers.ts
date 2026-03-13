import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { initTRPC, TRPCError } from "@trpc/server";
import type { TrpcContext } from "./_core/context";
import { z } from "zod";
import { getDb } from "./db";
import {
  clientes, processos, dadosFinanceiros, emprestimosConsignados,
  estrategias, partesProcessuais, movimentacoes, documentos,
  conhecimentos, cumprimentosSentenca, analiseGeral, relatorios, jobs,
  accessRequests, userProfiles, users, movimentacoesFinanceiras, historicoCorrecoes,
  notificacoes, prazosProcessuais, syncLog
} from "../drizzle/schema";
import { eq, like, desc, sql } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";
import { storagePut, storageGet } from "./storage";

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
  const allClientes = await db.select().from(clientes).orderBy(clientes.nomeCompleto);
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
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
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
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
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

REGRAS IMPORTANTES:
- Extraia CPF/CNPJ do AUTOR (polo ativo/cliente), não do advogado
- Se houver múltiplos CPFs, identifique qual pertence ao autor/cliente
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
    "nacionalidade": "string ou null"
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

        // 3. Deduplication and save to DB
        let clienteId: number;
        const cpf = dadosExtraidos.cliente?.cpfCnpj;
        const nome = dadosExtraidos.cliente?.nomeCompleto || input.fileName.replace(".pdf", "");

        if (cpf) {
          const existing = await db.select().from(clientes).where(eq(clientes.cpfCnpj, cpf)).limit(1);
          if (existing.length > 0) {
            clienteId = existing[0].id;
            await db.update(clientes).set({
              profissao: dadosExtraidos.cliente?.profissao || existing[0].profissao,
              cargo: dadosExtraidos.cliente?.cargo || existing[0].cargo,
              orgaoEmpregador: dadosExtraidos.cliente?.orgaoEmpregador || existing[0].orgaoEmpregador,
              endereco: dadosExtraidos.cliente?.endereco || existing[0].endereco,
              cidade: dadosExtraidos.cliente?.cidade || existing[0].cidade,
              estado: dadosExtraidos.cliente?.estado || existing[0].estado,
              cep: dadosExtraidos.cliente?.cep || existing[0].cep,
            }).where(eq(clientes.id, clienteId));
          } else {
            const [inserted] = await db.insert(clientes).values({
              cpfCnpj: cpf,
              nomeCompleto: nome,
              tipoPessoa: dadosExtraidos.cliente?.tipoPessoa === "PJ" ? "PJ" : "PF",
              rg: dadosExtraidos.cliente?.rg,
              profissao: dadosExtraidos.cliente?.profissao,
              cargo: dadosExtraidos.cliente?.cargo,
              orgaoEmpregador: dadosExtraidos.cliente?.orgaoEmpregador,
              vinculoFuncional: dadosExtraidos.cliente?.vinculoFuncional,
              endereco: dadosExtraidos.cliente?.endereco,
              cidade: dadosExtraidos.cliente?.cidade,
              estado: dadosExtraidos.cliente?.estado,
              cep: dadosExtraidos.cliente?.cep,
              nacionalidade: dadosExtraidos.cliente?.nacionalidade,
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
            const [inserted] = await db.insert(clientes).values({
              cpfCnpj: `PEND_${Date.now().toString(36)}`,
              nomeCompleto: nome,
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
            // Update client data
            const serv = dadosExtraidos.servidor || {};
            const updateData: Record<string, any> = {};
            if (serv.cargo) updateData.cargo = serv.cargo;
            if (serv.orgaoEmpregador) updateData.orgaoEmpregador = serv.orgaoEmpregador;
            if (serv.vinculoFuncional) updateData.vinculoFuncional = serv.vinculoFuncional;
            if (serv.rg) updateData.rg = serv.rg;
            if (Object.keys(updateData).length > 0) {
              await db.update(clientes).set(updateData).where(eq(clientes.id, clienteId));
            }
          } else {
            // Create new client from contracheque
            const serv = dadosExtraidos.servidor || {};
            const [inserted] = await db.insert(clientes).values({
              cpfCnpj: cpf,
              nomeCompleto: nome,
              tipoPessoa: "PF",
              rg: serv.rg,
              cargo: serv.cargo,
              orgaoEmpregador: serv.orgaoEmpregador,
              vinculoFuncional: serv.vinculoFuncional,
              profissao: serv.cargo || "Servidor Público",
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
      const allClientes = await db.select().from(clientes).orderBy(clientes.nomeCompleto);
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
      const allProcs = await db.select().from(processos).orderBy(processos.numeroCnj);
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

      const allClientes = await db.select().from(clientes).orderBy(clientes.id);
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
      const allClientes = await db.select().from(clientes).orderBy(clientes.nomeCompleto);
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

    // Histórico de correções
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
        const allClientes2 = await db.select().from(clientes).orderBy(clientes.id);
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
      const allClientes = await db.select().from(clientes).orderBy(clientes.nomeCompleto);
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
      const allClientes = await db.select().from(clientes).orderBy(clientes.nomeCompleto);
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

      const allClientes = await db.select().from(clientes).orderBy(clientes.nomeCompleto);
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

      const allClientes = await db.select().from(clientes).orderBy(clientes.nomeCompleto);
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
      const allClientes = await db.select().from(clientes).orderBy(clientes.nomeCompleto);
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
        if (!db) throw new Error("Banco de dados indisponível");

        // Verificar se já existe solicitação com este CPF
        const existente = await db.select().from(accessRequests).where(eq(accessRequests.cpf, input.cpf)).limit(1);
        if (existente.length > 0) {
          const status = existente[0].status;
          if (status === 'pendente') throw new Error("Já existe uma solicitação pendente com este CPF. Aguarde a aprovação.");
          if (status === 'aprovado') throw new Error("Este CPF já possui acesso aprovado.");
          // Se rejeitado, permite nova solicitação
          if (status === 'rejeitado') {
            await db.update(accessRequests).set({
              nomeCompleto: input.nomeCompleto,
              email: input.email,
              celular: input.celular,
              motivo: input.motivo || null,
              status: 'pendente',
              aprovadoPor: null,
              aprovadoEm: null,
              observacoesAdmin: null,
            }).where(eq(accessRequests.id, existente[0].id));
            return { success: true, message: "Solicitação reenviada com sucesso. Aguarde a aprovação do administrador." };
          }
        }

        await db.insert(accessRequests).values({
          nomeCompleto: input.nomeCompleto,
          cpf: input.cpf,
          email: input.email,
          celular: input.celular,
          motivo: input.motivo || null,
        });

        return { success: true, message: "Solicitação enviada com sucesso. Aguarde a aprovação do administrador." };
      }),

    // Listar solicitações (admin)
    listar: protectedProcedure
      .input(z.object({
        status: z.enum(["pendente", "aprovado", "rejeitado", "todos"]).optional().default("todos"),
      }).optional())
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        const filtro = input?.status || "todos";
        if (filtro === "todos") {
          return await db.select().from(accessRequests).orderBy(desc(accessRequests.createdAt));
        }
        return await db.select().from(accessRequests)
          .where(eq(accessRequests.status, filtro as "pendente" | "aprovado" | "rejeitado"))
          .orderBy(desc(accessRequests.createdAt));
      }),

    // Contar pendentes (admin - para badge)
    contarPendentes: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { count: 0 };
      const result = await db.select({ count: sql<number>`COUNT(*)` }).from(accessRequests).where(eq(accessRequests.status, 'pendente'));
      return { count: result[0]?.count || 0 };
    }),

    // Aprovar solicitação (admin)
    aprovar: protectedProcedure
      .input(z.object({
        id: z.number(),
        observacoes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados indisponível");

        const [solicitacao] = await db.select().from(accessRequests).where(eq(accessRequests.id, input.id)).limit(1);
        if (!solicitacao) throw new Error("Solicitação não encontrada");
        if (solicitacao.status !== 'pendente') throw new Error("Esta solicitação já foi processada");

        await db.update(accessRequests).set({
          status: 'aprovado',
          aprovadoPor: ctx.user.id,
          aprovadoEm: new Date(),
          observacoesAdmin: input.observacoes || null,
        }).where(eq(accessRequests.id, input.id));

        return { success: true, message: `Acesso aprovado para ${solicitacao.nomeCompleto}` };
      }),

    // Rejeitar solicitação (admin)
    rejeitar: protectedProcedure
      .input(z.object({
        id: z.number(),
        observacoes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados indisponível");

        const [solicitacao] = await db.select().from(accessRequests).where(eq(accessRequests.id, input.id)).limit(1);
        if (!solicitacao) throw new Error("Solicitação não encontrada");

        await db.update(accessRequests).set({
          status: 'rejeitado',
          aprovadoPor: ctx.user.id,
          aprovadoEm: new Date(),
          observacoesAdmin: input.observacoes || `Acesso negado por ${ctx.user.name}`,
        }).where(eq(accessRequests.id, input.id));

        return { success: true, message: `Solicitação de ${solicitacao.nomeCompleto} rejeitada` };
      }),

    // Excluir solicitação (admin)
    excluir: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados indisponível");
        await db.delete(accessRequests).where(eq(accessRequests.id, input.id));
        return { success: true };
      }),

    // Listar usuários do sistema (admin)
    listarUsuarios: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      const allUsers = await db.select().from(users).orderBy(desc(users.lastSignedIn));
      const profiles = await db.select().from(userProfiles);
      return allUsers.map(u => {
        const profile = profiles.find(p => p.userId === u.id);
        return {
          ...u,
          cpf: profile?.cpf || null,
          celular: profile?.celular || null,
          cargo: profile?.cargo || null,
          oab: profile?.oab || null,
          ativo: profile?.ativo ?? 1,
        };
      });
    }),

    // Atualizar perfil de usuário (admin)
    atualizarPerfil: protectedProcedure
      .input(z.object({
        userId: z.number(),
        cpf: z.string().optional(),
        celular: z.string().optional(),
        cargo: z.string().optional(),
        oab: z.string().optional(),
        role: z.enum(["user", "admin"]).optional(),
        ativo: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados indisponível");

        // Atualizar role na tabela users se fornecido
        if (input.role) {
          await db.update(users).set({ role: input.role }).where(eq(users.id, input.userId));
        }

        // Atualizar ou criar perfil
        const [existing] = await db.select().from(userProfiles).where(eq(userProfiles.userId, input.userId)).limit(1);
        if (existing) {
          await db.update(userProfiles).set({
            cpf: input.cpf ?? existing.cpf,
            celular: input.celular ?? existing.celular,
            cargo: input.cargo ?? existing.cargo,
            oab: input.oab ?? existing.oab,
            ativo: input.ativo ?? existing.ativo,
          }).where(eq(userProfiles.id, existing.id));
        } else {
          await db.insert(userProfiles).values({
            userId: input.userId,
            cpf: input.cpf || null,
            celular: input.celular || null,
            cargo: input.cargo || null,
            oab: input.oab || null,
            ativo: input.ativo ?? 1,
          });
        }

        return { success: true };
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
        // Enriquecer com dados do processo e cliente
        const procs = await db.select().from(processos);
        const clis = await db.select().from(clientes);
        const enriched = rows.map((p: any) => {
          const proc = (procs as any[]).find((pr: any) => pr.id === p.processoId);
          const cli = (clis as any[]).find((c: any) => c.id === p.clienteId);
          return {
            ...p,
            numeroCnj: proc?.numeroCnj || '',
            tipoAcao: proc?.tipoAcao || '',
            nomeCliente: cli?.nomeCompleto || '',
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
        for (const prazo of pendentes) {
          const vencimento = new Date(prazo.dataVencimento);
          const diffMs = vencimento.getTime() - agora.getTime();
          const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
          // Prazo já vencido
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
              notificacoesEnviadas++;
            }
            prazosVencidos++;
          }
          // Prazo vencendo em breve
          else if (diffDias <= (prazo.diasAntecedencia || 3) && !prazo.notificacaoEnviada) {
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
            notificacoesEnviadas++;
          }
        }
        return { notificacoesEnviadas, prazosVencidos, totalVerificados: pendentes.length };
      }),
   }),

  // ==================== AGENTE IA JURÍDICO ====================
  agente: router({
    chat: protectedProcedure
      .input(z.object({
        mensagem: z.string().min(1),
        historico: z.array(z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string()
        })).optional().default([]),
        clienteId: z.number().optional(),
        processoId: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error('DB indisponível');

        // 1. Buscar toda a base de conhecimento
        const todosConhecimentos = await db.select().from(conhecimentos).orderBy(desc(conhecimentos.createdAt));
        
        // 2. Buscar contexto específico se clienteId ou processoId fornecido
        let contextoCliente = '';
        let contextoProcesso = '';
        
        if (input.clienteId) {
          const [cliente] = await db.select().from(clientes).where(eq(clientes.id, input.clienteId));
          if (cliente) {
            const procs = await db.select().from(processos).where(eq(processos.clienteId, cliente.id));
            const estrats = [];
            const movs = [];
            const movFin = [];
            for (const p of procs) {
              const e = await db.select().from(estrategias).where(eq(estrategias.processoId, p.id));
              estrats.push(...e);
              const m = await db.select().from(movimentacoes).where(eq(movimentacoes.processoId, p.id));
              movs.push(...m);
              const mf = await db.select().from(movimentacoesFinanceiras).where(eq(movimentacoesFinanceiras.processoId, p.id));
              movFin.push(...mf);
            }
            contextoCliente = `\n\nCONTEXTO DO CLIENTE:\nNome: ${cliente.nomeCompleto}\nCPF: ${cliente.cpfCnpj}\nProcessos: ${procs.map(p => `${p.numeroCnj} (${p.tipoAcao} - ${p.statusProcesso})`).join('; ')}\nEstratégias: ${estrats.map(e => e.tesePrincipal?.substring(0, 100)).join('; ')}\nMovimentações Financeiras: ${movFin.map(m => `${m.tipo}: R$ ${m.valor} (${m.status})`).join('; ')}`;
          }
        }
        
        if (input.processoId) {
          const [proc] = await db.select().from(processos).where(eq(processos.id, input.processoId));
          if (proc) {
            const estrats = await db.select().from(estrategias).where(eq(estrategias.processoId, proc.id));
            const movs = await db.select().from(movimentacoes).where(eq(movimentacoes.processoId, proc.id));
            const movFin = await db.select().from(movimentacoesFinanceiras).where(eq(movimentacoesFinanceiras.processoId, proc.id));
            contextoProcesso = `\n\nCONTEXTO DO PROCESSO:\nNúmero: ${proc.numeroCnj}\nTipo: ${proc.tipoAcao}\nVara: ${proc.vara}\nComarca: ${proc.comarca}\nValor da Causa: R$ ${proc.valorCausa}\nFase: ${proc.faseAtual}\nStatus: ${proc.statusProcesso}\nPolo Ativo: ${proc.poloAtivo}\nPolo Passivo: ${proc.poloPassivo}\nResumo Sentença: ${proc.resumoSentenca || 'N/A'}\nEstratégias: ${estrats.map(e => `Tese: ${e.tesePrincipal?.substring(0, 150)}; Fund: ${e.fundamentacaoLegal?.substring(0, 100)}`).join('\n')}\nMovimentações: ${movs.map(m => `${m.data}: ${m.evento}`).join('\n')}\nFinanceiro: ${movFin.map(m => `${m.tipo}: R$ ${m.valor} (${m.status})`).join('; ')}`;
          }
        }

        // 3. Montar base de conhecimento como contexto
        const teses = todosConhecimentos.filter(c => c.categoria === 'Tese');
        const jurisprudencias = todosConhecimentos.filter(c => c.categoria === 'Jurisprudencia');
        const estrategiasConhec = todosConhecimentos.filter(c => c.categoria === 'Estrategia');
        const legislacoes = todosConhecimentos.filter(c => c.categoria === 'Legislacao');
        const modelos = todosConhecimentos.filter(c => c.categoria === 'Modelo');

        const baseConhecimento = `
BASE DE CONHECIMENTO DO ESCRITÓRIO MELO & PREDA ADVOGADOS (${todosConhecimentos.length} registros):

TESES CENTRAIS (${teses.length}):
${teses.map(t => `- ${t.titulo}: ${t.conteudo?.substring(0, 200)}`).join('\n')}

JURISPRUDÊNCIA ÂNCORA (${jurisprudencias.length}):
${jurisprudencias.map(j => `- ${j.titulo}: ${j.conteudo?.substring(0, 150)}`).join('\n')}

ESTRATÉGIAS PROCESSUAIS (${estrategiasConhec.length}):
${estrategiasConhec.map(e => `- ${e.titulo}: ${e.conteudo?.substring(0, 200)}`).join('\n')}

LEGISLAÇÃO FUNDAMENTAL (${legislacoes.length}):
${legislacoes.map(l => `- ${l.titulo}: ${l.conteudo?.substring(0, 150)}`).join('\n')}

MODELOS E GUIAS (${modelos.length}):
${modelos.map(m => `- ${m.titulo}`).join('\n')}
`;

        // 4. System prompt do agente
        const systemPrompt = `Você é o AGENTE JURÍDICO EXPERT do escritório Melo & Preda Advogados, especializado em Direito do Consumidor, Direito Bancário, Execuções, Cumprimentos de Sentença e Superendividamento.

IDENTIDADE:
- Escritório: Melo & Preda Advogados
- Advogado Principal: Dr. Paulo Melo (OAB/GO 40.559)
- Tribunal Principal: TJ-GO
- Especialidades: Consignações abusivas, honorários sucumbenciais, obrigação de fazer bancária, querela nullitatis

ESTILO DE COMUNICAÇÃO:
- Assertivo e técnico, sem hesitação
- Fundamentado com dispositivos legais, doutrina e jurisprudência
- Estratégico: antecipa objeções e refuta preventivamente
- Combativo quando necessário: "flagrante ilegalidade", "abuso manifesto"

CAPACIDADES:
1. ANÁLISE PROCESSUAL: Analisar processos, identificar teses aplicáveis, sugerir estratégias
2. PETICIONAMENTO: Orientar elaboração de petições seguindo o padrão do escritório
3. CÁLCULOS: Orientar cálculos de débito judicial (IPCA + juros + multa + honorários)
4. CONSULTA: Buscar na base de conhecimento teses, jurisprudências e estratégias relevantes
5. ESTRATÉGIA: Recomendar a melhor estratégia processual para cada caso
6. PRAZOS: Alertar sobre prazos processuais e procedimentos

DIRETRIZES:
- SEMPRE fundamentar com artigos de lei, jurisprudência e doutrina
- SEMPRE citar a jurisprudência âncora do TJ-GO quando aplicável
- NUNCA prometer resultados específicos
- SEMPRE verificar prazos antes de recomendar ações
- Usar linguagem técnica jurídica precisa
- Responder em português brasileiro

${baseConhecimento}${contextoCliente}${contextoProcesso}`;

        // 5. Montar mensagens para o LLM
        const messages: Array<{role: 'system' | 'user' | 'assistant', content: string}> = [
          { role: 'system', content: systemPrompt },
          ...input.historico.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
          { role: 'user' as const, content: input.mensagem }
        ];

        // 6. Invocar LLM
        const result = await invokeLLM({ messages });
        const rawContent = result.choices?.[0]?.message?.content;
        const resposta = typeof rawContent === 'string' ? rawContent : 'Desculpe, não consegui processar sua solicitação.';

        return { resposta };
      }),

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
        // Filtrar por termo de busca
        const termoLower = input.termo.toLowerCase();
        return todos.filter(c => 
          c.titulo.toLowerCase().includes(termoLower) ||
          (c.conteudo && c.conteudo.toLowerCase().includes(termoLower)) ||
          (c.tags && c.tags.toLowerCase().includes(termoLower))
        ).slice(0, 20);
      }),

    gerarPeticao: protectedProcedure
      .input(z.object({
        tipoPeticao: z.string().min(1),
        clienteId: z.number().optional(),
        processoId: z.number().optional(),
        instrucoes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error('DB indisponível');

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
            const estrats = [];
            const movFin = [];
            for (const p of procs) {
              const e = await db.select().from(estrategias).where(eq(estrategias.processoId, p.id));
              estrats.push(...e);
              const mf = await db.select().from(movimentacoesFinanceiras).where(eq(movimentacoesFinanceiras.processoId, p.id));
              movFin.push(...mf);
            }
            contextoCliente = `\nCLIENTE: ${cliente.nomeCompleto}, CPF: ${cliente.cpfCnpj}, Órgão: ${cliente.orgaoEmpregador || 'N/A'}\nProcessos: ${procs.map(p => `${p.numeroCnj} (${p.tipoAcao} - ${p.statusProcesso})`).join('; ')}\nEstratégias: ${estrats.map(e => `${e.tesePrincipal?.substring(0, 200)}`).join('\n')}\nFinanceiro: ${movFin.map(m => `${m.tipo}: R$ ${m.valor} (${m.status})`).join('; ')}`;
          }
        }

        if (input.processoId) {
          const [proc] = await db.select().from(processos).where(eq(processos.id, input.processoId));
          if (proc) {
            numeroProcesso = proc.numeroCnj || '';
            const estrats = await db.select().from(estrategias).where(eq(estrategias.processoId, proc.id));
            const movs = await db.select().from(movimentacoes).where(eq(movimentacoes.processoId, proc.id));
            const movFin = await db.select().from(movimentacoesFinanceiras).where(eq(movimentacoesFinanceiras.processoId, proc.id));
            contextoProcesso = `\nPROCESSO: ${proc.numeroCnj}\nTipo: ${proc.tipoAcao}\nVara: ${proc.vara}, Comarca: ${proc.comarca}, Tribunal: ${proc.tribunal}\nValor da Causa: R$ ${proc.valorCausa}\nFase: ${proc.faseAtual}, Status: ${proc.statusProcesso}\nPolo Ativo: ${proc.poloAtivo}\nPolo Passivo: ${proc.poloPassivo}\nResumo Sentença: ${proc.resumoSentenca || 'N/A'}\nEstratégias: ${estrats.map(e => `Tese: ${e.tesePrincipal}\nFundamentação: ${e.fundamentacaoLegal}\nJurisprudência: ${e.jurisprudenciaCitada}\nPontos Fortes: ${e.pontosFortes}`).join('\n---\n')}\nMovimentações: ${movs.slice(-10).map(m => `${m.data}: ${m.evento} - ${m.descricao?.substring(0, 100)}`).join('\n')}\nFinanceiro: ${movFin.map(m => `${m.tipo}: R$ ${m.valor} (${m.status})`).join('; ')}`;
          }
        }

        // Buscar base de conhecimento relevante
        const todosConhecimentos = await db.select().from(conhecimentos);
        const teses = todosConhecimentos.filter(c => c.categoria === 'Tese').map(t => `- ${t.titulo}: ${t.conteudo?.substring(0, 200)}`).join('\n');
        const jurisprudencias = todosConhecimentos.filter(c => c.categoria === 'Jurisprudencia').map(j => `- ${j.titulo}: ${j.conteudo?.substring(0, 150)}`).join('\n');

        const systemPrompt = `Você é o PETICIONADOR EXPERT do escritório Melo & Preda Advogados (OAB/GO 40.559).

Gere a petição completa do tipo "${input.tipoPeticao}" seguindo rigorosamente o padrão do escritório:

ESTILO DE REDAÇÃO:
- Tom assertivo, combativo e técnico
- Fundamentação robusta com artigos de lei, doutrina e jurisprudência
- Uso de expressões fortes: "flagrante ilegalidade", "abuso manifesto", "violação frontal"
- Parágrafos densos com argumentação encadeada
- Pedidos específicos e detalhados

ESTRUTURA OBRIGATÓRIA:
1. ENDEREÇAMENTO (Exmo. Sr. Dr. Juiz de Direito da Vara...)
2. QUALIFICAÇÃO DAS PARTES
3. FATOS (narrativa processual detalhada)
4. FUNDAMENTAÇÃO JURÍDICA (artigos, doutrina, jurisprudência)
5. PEDIDOS (numerados e específicos)
6. REQUERIMENTOS FINAIS
7. VALOR DA CAUSA (se aplicável)
8. FECHO (Nestes termos, pede deferimento. Local e data. Advogado.)

TESES DISPONÍVEIS:\n${teses}

JURISPRUDÊNCIA:\n${jurisprudencias}
${contextoCliente}${contextoProcesso}

${input.instrucoes ? `INSTRUÇÕES ADICIONAIS: ${input.instrucoes}` : ''}

Gere a petição COMPLETA, pronta para protocolo. Use formatação Markdown com títulos, negritos e numeração.`;

        const result = await invokeLLM({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Gere a petição de ${input.tipoPeticao} completa para o caso.` }
          ]
        });

        const rawContent = result.choices?.[0]?.message?.content;
        const peticaoTexto = typeof rawContent === 'string' ? rawContent : 'Erro ao gerar petição.';

        // Salvar no S3 como markdown
        const timestamp = Date.now();
        const nomeArquivo = `peticoes/${input.tipoPeticao.replace(/\s+/g, '_')}_${nomeCliente.replace(/\s+/g, '_')}_${timestamp}.md`;
        const { url } = await storagePut(nomeArquivo, peticaoTexto, 'text/markdown');

        return {
          peticao: peticaoTexto,
          url,
          tipoPeticao: input.tipoPeticao,
          cliente: nomeCliente,
          processo: numeroProcesso,
        };
      }),

    estatisticas: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { total: 0, teses: 0, jurisprudencias: 0, estrategias: 0, legislacoes: 0, modelos: 0 };
      const todos = await db.select().from(conhecimentos);
      return {
        total: todos.length,
        teses: todos.filter(c => c.categoria === 'Tese').length,
        jurisprudencias: todos.filter(c => c.categoria === 'Jurisprudencia').length,
        estrategias: todos.filter(c => c.categoria === 'Estrategia').length,
        legislacoes: todos.filter(c => c.categoria === 'Legislacao').length,
        modelos: todos.filter(c => c.categoria === 'Modelo').length,
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
        const apiKey = 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';
        
        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `APIKey ${apiKey}`,
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
      
      const apiKey = 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';
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
              'Authorization': `APIKey ${apiKey}`,
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
        const apiKey = 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';
        
        const resp = await fetch(`https://api-publica.datajud.cnj.jus.br/api_publica_tjgo/_search`, {
          method: 'POST',
          headers: {
            'Authorization': `APIKey ${apiKey}`,
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
      const DATAJUD_KEY = 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RZ0NhVlpFSQ==';

      for (const proc of todosProcessos) {
        if (!proc.numeroCnj || proc.numeroCnj.length < 10) continue;
        try {
          const numLimpo = proc.numeroCnj.replace(/[^0-9]/g, '');
          const resp = await fetch(DATAJUD_API, {
            method: 'POST',
            headers: { 'Authorization': `APIKey ${DATAJUD_KEY}`, 'Content-Type': 'application/json' },
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
          .orderBy(clientes.nomeCompleto);
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

REGRAS IMPORTANTES:
- Extraia CPF/CNPJ do AUTOR (polo ativo/cliente), não do advogado
- Se houver múltiplos CPFs, identifique qual pertence ao autor/cliente
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
    "nacionalidade": "string ou null"
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

    await updateProgress(40, 'Salvando cliente...');
    // 3. Deduplication and save to DB
    let clienteId: number;
    const cpf = dadosExtraidos.cliente?.cpfCnpj;
    const nome = dadosExtraidos.cliente?.nomeCompleto || inputData.fileName.replace(/\.pdf$/i, '');

    if (cpf) {
      const existing = await db.select().from(clientes).where(eq(clientes.cpfCnpj, cpf)).limit(1);
      if (existing.length > 0) {
        clienteId = existing[0].id;
        // Atualizar dados do cliente existente
        await db.update(clientes).set({
          profissao: dadosExtraidos.cliente?.profissao || existing[0].profissao,
          cargo: dadosExtraidos.cliente?.cargo || existing[0].cargo,
          orgaoEmpregador: dadosExtraidos.cliente?.orgaoEmpregador || existing[0].orgaoEmpregador,
          vinculoFuncional: dadosExtraidos.cliente?.vinculoFuncional || existing[0].vinculoFuncional,
          endereco: dadosExtraidos.cliente?.endereco || existing[0].endereco,
          cidade: dadosExtraidos.cliente?.cidade || existing[0].cidade,
          estado: dadosExtraidos.cliente?.estado || existing[0].estado,
          cep: dadosExtraidos.cliente?.cep || existing[0].cep,
          rg: dadosExtraidos.cliente?.rg || existing[0].rg,
          nacionalidade: dadosExtraidos.cliente?.nacionalidade || existing[0].nacionalidade,
        }).where(eq(clientes.id, clienteId));
      } else {
        const [inserted] = await db.insert(clientes).values({
          cpfCnpj: cpf,
          nomeCompleto: nome,
          tipoPessoa: dadosExtraidos.cliente?.tipoPessoa === 'PJ' ? 'PJ' : 'PF',
          rg: dadosExtraidos.cliente?.rg,
          profissao: dadosExtraidos.cliente?.profissao,
          cargo: dadosExtraidos.cliente?.cargo,
          orgaoEmpregador: dadosExtraidos.cliente?.orgaoEmpregador,
          vinculoFuncional: dadosExtraidos.cliente?.vinculoFuncional,
          endereco: dadosExtraidos.cliente?.endereco,
          cidade: dadosExtraidos.cliente?.cidade,
          estado: dadosExtraidos.cliente?.estado,
          cep: dadosExtraidos.cliente?.cep,
          nacionalidade: dadosExtraidos.cliente?.nacionalidade,
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
        const [inserted] = await db.insert(clientes).values({
          cpfCnpj: `PEND_${Date.now().toString(36)}`,
          nomeCompleto: nome,
          tipoPessoa: dadosExtraidos.cliente?.tipoPessoa === 'PJ' ? 'PJ' : 'PF',
          rg: dadosExtraidos.cliente?.rg,
          profissao: dadosExtraidos.cliente?.profissao,
          cargo: dadosExtraidos.cliente?.cargo,
          orgaoEmpregador: dadosExtraidos.cliente?.orgaoEmpregador,
          vinculoFuncional: dadosExtraidos.cliente?.vinculoFuncional,
          endereco: dadosExtraidos.cliente?.endereco,
          cidade: dadosExtraidos.cliente?.cidade,
          estado: dadosExtraidos.cliente?.estado,
          cep: dadosExtraidos.cliente?.cep,
          nacionalidade: dadosExtraidos.cliente?.nacionalidade,
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

    await updateProgress(92, 'Gerando pasta do cliente...');
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
        // Update client data from contracheque
        const serv = dadosExtraidos.servidor || {};
        const updateData: Record<string, any> = {};
        if (serv.cargo) updateData.cargo = serv.cargo;
        if (serv.orgaoEmpregador) updateData.orgaoEmpregador = serv.orgaoEmpregador;
        if (serv.vinculoFuncional) updateData.vinculoFuncional = serv.vinculoFuncional;
        if (serv.rg) updateData.rg = serv.rg;
        if (Object.keys(updateData).length > 0) {
          await db.update(clientes).set(updateData).where(eq(clientes.id, clienteId));
        }
      } else {
        // Create new client from contracheque
        const serv = dadosExtraidos.servidor || {};
        const [inserted] = await db.insert(clientes).values({
          cpfCnpj: cpf,
          nomeCompleto: nome,
          tipoPessoa: 'PF',
          rg: serv.rg,
          cargo: serv.cargo,
          orgaoEmpregador: serv.orgaoEmpregador,
          vinculoFuncional: serv.vinculoFuncional,
          profissao: serv.cargo || 'Servidor Público',
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
        const [inserted] = await db.insert(clientes).values({
          cpfCnpj: `PEND_${Date.now().toString(36)}`,
          nomeCompleto: nome,
          tipoPessoa: 'PF',
          profissao: dadosExtraidos.servidor?.cargo || 'Servidor Público',
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
  } catch (e) {
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
  } catch (e) {
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
