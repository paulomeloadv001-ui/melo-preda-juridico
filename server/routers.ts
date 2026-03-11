import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { getDb } from "./db";
import {
  clientes, processos, dadosFinanceiros, emprestimosConsignados,
  estrategias, partesProcessuais, movimentacoes, documentos,
  conhecimentos, cumprimentosSentenca, analiseGeral
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
    "advogadoAutor": "string ou null"
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
          const [inserted] = await db.insert(clientes).values({
            cpfCnpj: `PENDENTE_${Date.now()}`,
            nomeCompleto: nome,
          }).$returningId();
          clienteId = inserted.id;
        }

        // 4. Upload PDF to client folder in S3
        const clienteCpf = cpf || `PENDENTE_${Date.now()}`;
        const folder = clientFolderKey(nome, clienteCpf);
        const pdfKey = `${folder}/processos_pdf/${input.fileName}`;
        const { key, url } = await storagePut(pdfKey, buffer, "application/pdf");

        // 5. Insert processo (dedup by numeroCnj)
        const numCnj = dadosExtraidos.processo?.numeroCnj || `SEM_NUMERO_${Date.now()}`;
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
});

export type AppRouter = typeof appRouter;
