import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { getDb } from "./db";
import {
  clientes, processos, dadosFinanceiros, emprestimosConsignados,
  estrategias, partesProcessuais, movimentacoes, documentos,
  conhecimentos, cumprimentosSentenca, analiseGeral, relatorios, jobs,
  accessRequests, userProfiles, users
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
          return { ...p, estrategias: estrats, partes, movimentacoes: movs, cumprimentos: cumps };
        }));

        // Get knowledge for this client
        const procIds = procs.map(p => p.id);
        let conhecimentosCliente: any[] = [];
        for (const pid of procIds) {
          const kn = await db.select().from(conhecimentos).where(eq(conhecimentos.processoOrigemId, pid));
          conhecimentosCliente.push(...kn);
        }

        return {
          cliente,
          dadosFinanceiros: financeiro[0] ?? null,
          emprestimos,
          processos: processosComDetalhes,
          documentos: docs,
          conhecimentos: conhecimentosCliente,
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
        }
        await db.delete(processos).where(eq(processos.clienteId, input.id));
        await db.delete(dadosFinanceiros).where(eq(dadosFinanceiros.clienteId, input.id));
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

    stats: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { totalClientes: 0, totalProcessos: 0, processosAtivos: 0, valorTotalCausas: 0 };
      const [cliCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(clientes);
      const [procCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(processos);
      const [ativosCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(processos).where(eq(processos.statusProcesso, "Ativo"));
      const [valorTotal] = await db.select({ total: sql<string>`COALESCE(SUM(valorCausa), 0)` }).from(processos);
      return {
        totalClientes: cliCount?.count ?? 0,
        totalProcessos: procCount?.count ?? 0,
        processosAtivos: ativosCount?.count ?? 0,
        valorTotalCausas: parseFloat(String(valorTotal?.total ?? "0")),
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

      return { processosRemovidos: removidos };
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
          descricao: "Dados financeiros, empréstimos consignados, margem consignável",
          subcategorias: [
            { id: "financeiro_margem", titulo: "Margem Consignável", descricao: "Análise de margem consignável por cliente (em breve)" },
          ],
        },
        {
          id: "processual",
          titulo: "Relatórios Processuais",
          descricao: "Acompanhamento de processos, fases, valores, estratégias",
          subcategorias: [
            { id: "processual_geral", titulo: "Panorama Processual", descricao: "Visão geral de todos os processos (em breve)" },
          ],
        },
      ];
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

        // Criar job mestre do lote
        const [masterJob] = await db.insert(jobs).values({
          tipo: 'lote_master',
          status: 'processando',
          prioridade: input.opcoes.prioridade,
          titulo: `Importação em Lote: ${input.arquivos.length} arquivo(s)`,
          descricao: `Lote ${loteId} — ${input.arquivos.length} documentos para processamento automático`,
          inputData: JSON.stringify({
            loteId,
            totalArquivos: input.arquivos.length,
            opcoes: input.opcoes,
            arquivosNomes: input.arquivos.map(a => a.fileName),
          }),
          progresso: 0,
          mensagemProgresso: `Preparando ${input.arquivos.length} arquivo(s)...`,
        });
        const masterJobId = masterJob.insertId;

        // Criar jobs individuais para cada arquivo
        for (let i = 0; i < input.arquivos.length; i++) {
          const arquivo = input.arquivos[i];
          // Detecção automática do tipo de documento
          let tipoFinal = arquivo.tipoDocumento;
          if (tipoFinal === 'auto') {
            const nomeNorm = arquivo.fileName.toLowerCase();
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
            titulo: `[Lote] ${arquivo.fileName}`,
            descricao: `Lote ${loteId} — Arquivo ${i + 1}/${input.arquivos.length}: ${arquivo.fileName} (${(arquivo.fileSize / 1024).toFixed(1)} KB) — Tipo: ${tipoFinal}`,
            inputData: JSON.stringify({
              fileName: arquivo.fileName,
              fileBase64: arquivo.fileBase64,
              fileSize: arquivo.fileSize,
              tipoDocumento: tipoFinal,
              loteId,
              masterJobId,
              opcoes: input.opcoes,
              posicaoNoLote: i + 1,
              totalNoLote: input.arquivos.length,
            }),
            progresso: 0,
          });
          jobIds.push(result.insertId);
        }

        // Processar jobs em background com callback de finalização do lote
        processarLoteCompleto(masterJobId, jobIds, loteId, input.opcoes).catch(err => {
          console.error('[Lote] Erro no processamento em lote:', err);
        });

        return {
          loteId,
          masterJobId,
          jobIds,
          total: jobIds.length,
          message: `${jobIds.length} arquivo(s) na fila de processamento em lote (ID: ${loteId})`,
        };
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
    }
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
  ]
}

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

export type AppRouter = typeof appRouter;
