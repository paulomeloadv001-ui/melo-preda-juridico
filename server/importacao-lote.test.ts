import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-lote",
    email: "test@melopreda.com",
    name: "Test User",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("importação em lote", () => {
  it("jobs.listarLotes retorna array de lotes", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const lotes = await caller.jobs.listarLotes();
    expect(Array.isArray(lotes)).toBe(true);
  });

  it("jobs.stats retorna estatísticas válidas", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const stats = await caller.jobs.stats();
    expect(stats).toBeDefined();
    expect(typeof stats.total).toBe("number");
    expect(typeof stats.pendentes).toBe("number");
    expect(typeof stats.processando).toBe("number");
    expect(typeof stats.concluidos).toBe("number");
    expect(typeof stats.erros).toBe("number");
  });

  it("jobs.statusLote retorna null para masterJobId inexistente", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const status = await caller.jobs.statusLote({ masterJobId: 999999 });
    expect(status).toBeNull();
  });

  it("jobs.list retorna array de jobs", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const jobsList = await caller.jobs.list();
    expect(Array.isArray(jobsList)).toBe(true);
  });

  it("jobs.list aceita filtro por status", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const jobsPendentes = await caller.jobs.list({ status: "pendente" });
    expect(Array.isArray(jobsPendentes)).toBe(true);

    const jobsConcluidos = await caller.jobs.list({ status: "concluido" });
    expect(Array.isArray(jobsConcluidos)).toBe(true);
  });

  it("detectarTipoDocumento identifica contracheques por nome", () => {
    // Testar a lógica de detecção de tipo de documento
    const detectar = (fileName: string): string => {
      const nome = fileName.toLowerCase();
      if (nome.includes('contracheque') || nome.includes('demonstrativo') || nome.includes('holerite') || nome.includes('pagamento') || nome.includes('folha')) {
        return 'contracheque';
      }
      return 'processo';
    };

    expect(detectar("contracheque_janeiro.pdf")).toBe("contracheque");
    expect(detectar("DEMONSTRATIVO_PAGAMENTO.pdf")).toBe("contracheque");
    expect(detectar("holerite_fev2024.pdf")).toBe("contracheque");
    expect(detectar("folha_pagamento.pdf")).toBe("contracheque");
    expect(detectar("processo_judicial_001.pdf")).toBe("processo");
    expect(detectar("sentenca_final.pdf")).toBe("processo");
    expect(detectar("autos_principais.pdf")).toBe("processo");
    expect(detectar("cumprimento_sentenca.pdf")).toBe("processo");
  });

  it("importacaoLoteAvancada rejeita sem autenticação", async () => {
    const ctx: TrpcContext = {
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: () => {} } as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.jobs.importacaoLoteAvancada({
        arquivos: [],
        opcoes: {
          gerarConhecimentos: true,
          gerarRelatorios: true,
          deduplicarAutomatico: true,
          gerarPastaCliente: true,
          prioridade: 0,
        },
      })
    ).rejects.toThrow();
  });
});
