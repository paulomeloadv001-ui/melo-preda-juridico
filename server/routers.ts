import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { getDb } from "./db";
import {
  clientes, processos, dadosFinanceiros, emprestimosConsignados,
  estrategias, partesProcessuais, movimentacoes, documentos,
  conhecimentos, cumprimentosSentenca
} from "../drizzle/schema";
import { eq, like, desc, sql } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";
import { storagePut, storageGet } from "./storage";

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

        return {
          cliente,
          dadosFinanceiros: financeiro[0] ?? null,
          emprestimos,
          processos: processosComDetalhes,
          documentos: docs,
        };
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

        // 1. Upload PDF to S3
        const buffer = Buffer.from(input.fileBase64, "base64");
        const storageKey = `processos/${Date.now()}_${input.fileName}`;
        const { key, url } = await storagePut(storageKey, buffer, "application/pdf");

        // 2. Extract text from PDF using pdf-parse
        const pdfParse = (await import("pdf-parse")) as any;
        let textoExtraido = "";
        try {
          const pdfData = await pdfParse(buffer);
          textoExtraido = pdfData.text.substring(0, 50000); // Limit to 50k chars
        } catch (e) {
          textoExtraido = "Erro na extração de texto do PDF";
        }

        // 3. Use AI to extract structured data
        const extractionPrompt = `Você é um assistente jurídico especializado em análise de processos judiciais brasileiros.
Analise o texto extraído de um processo judicial e extraia TODOS os dados estruturados possíveis.

REGRAS IMPORTANTES:
- Extraia CPF/CNPJ do AUTOR (polo ativo/cliente), não do advogado
- Se houver múltiplos CPFs, identifique qual pertence ao autor/cliente
- Valores monetários devem ser números sem formatação (ex: 487150.30)
- Datas no formato DD/MM/YYYY
- Se não encontrar um campo, retorne null

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

        // 4. Save to database with deduplication by CPF
        let clienteId: number;
        const cpf = dadosExtraidos.cliente?.cpfCnpj;
        const nome = dadosExtraidos.cliente?.nomeCompleto || input.fileName.replace(".pdf", "");

        if (cpf) {
          const existing = await db.select().from(clientes).where(eq(clientes.cpfCnpj, cpf)).limit(1);
          if (existing.length > 0) {
            clienteId = existing[0].id;
            // Update existing client with new data
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
          // No CPF found, create with placeholder
          const [inserted] = await db.insert(clientes).values({
            cpfCnpj: `PENDENTE_${Date.now()}`,
            nomeCompleto: nome,
          }).$returningId();
          clienteId = inserted.id;
        }

        // 5. Insert processo (check dedup by numeroCnj)
        const numCnj = dadosExtraidos.processo?.numeroCnj || `SEM_NUMERO_${Date.now()}`;
        const existingProc = await db.select().from(processos).where(eq(processos.numeroCnj, numCnj)).limit(1);
        let processoId: number;

        if (existingProc.length > 0) {
          processoId = existingProc[0].id;
          // Update existing
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

        return {
          success: true,
          clienteId,
          processoId,
          clienteNome: nome,
          cpf: cpf || "PENDENTE",
          numeroCnj: numCnj,
          dadosExtraidos,
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
          return { ...p, estrategias: estrats, partes, movimentacoes: movs, cumprimentos: cumps };
        }));

        return {
          exportDate: new Date().toISOString(),
          version: "1.0",
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
        return { cliente: cli, processos: procs, dadosFinanceiros: financeiro, emprestimos };
      }));
      return { exportDate: new Date().toISOString(), version: "1.0", totalClientes: allClientes.length, dados: result };
    }),

    conhecimentosJson: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(conhecimentos).orderBy(desc(conhecimentos.createdAt));
    }),
  }),
});

export type AppRouter = typeof appRouter;
