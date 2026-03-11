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

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

describe("importação em lote - rotas de consulta", () => {
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

  it("jobs.list aceita filtro por status pendente", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const jobsPendentes = await caller.jobs.list({ status: "pendente" });
    expect(Array.isArray(jobsPendentes)).toBe(true);
  });

  it("jobs.list aceita filtro por status concluido", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const jobsConcluidos = await caller.jobs.list({ status: "concluido" });
    expect(Array.isArray(jobsConcluidos)).toBe(true);
  });
});

describe("importação em lote - detecção de tipo de documento", () => {
  const detectar = (fileName: string): string => {
    const nome = fileName.toLowerCase();
    if (
      nome.includes("contracheque") ||
      nome.includes("demonstrativo") ||
      nome.includes("holerite") ||
      nome.includes("pagamento") ||
      nome.includes("folha")
    ) {
      return "contracheque";
    }
    return "processo";
  };

  it("detecta contracheque por nome 'contracheque'", () => {
    expect(detectar("contracheque_janeiro.pdf")).toBe("contracheque");
  });

  it("detecta contracheque por nome 'demonstrativo'", () => {
    expect(detectar("DEMONSTRATIVO_PAGAMENTO.pdf")).toBe("contracheque");
  });

  it("detecta contracheque por nome 'holerite'", () => {
    expect(detectar("holerite_fev2024.pdf")).toBe("contracheque");
  });

  it("detecta contracheque por nome 'folha'", () => {
    expect(detectar("folha_pagamento.pdf")).toBe("contracheque");
  });

  it("detecta contracheque por nome 'pagamento'", () => {
    expect(detectar("pagamento_servidor.pdf")).toBe("contracheque");
  });

  it("detecta processo para nomes genéricos", () => {
    expect(detectar("processo_judicial_001.pdf")).toBe("processo");
  });

  it("detecta processo para sentença", () => {
    expect(detectar("sentenca_final.pdf")).toBe("processo");
  });

  it("detecta processo para autos", () => {
    expect(detectar("autos_principais.pdf")).toBe("processo");
  });

  it("detecta processo para cumprimento de sentença", () => {
    expect(detectar("cumprimento_sentenca.pdf")).toBe("processo");
  });

  it("detecta processo para nomes sem palavras-chave de contracheque", () => {
    expect(detectar("recurso_apelacao.pdf")).toBe("processo");
    expect(detectar("embargos_declaracao.pdf")).toBe("processo");
    expect(detectar("agravo_instrumento.pdf")).toBe("processo");
  });
});

describe("importação em lote - autenticação", () => {
  it("importacaoLoteAvancada rejeita sem autenticação", async () => {
    const ctx = createUnauthContext();
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

  it("jobs.listarLotes rejeita sem autenticação", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.jobs.listarLotes()).rejects.toThrow();
  });

  it("jobs.stats rejeita sem autenticação", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.jobs.stats()).rejects.toThrow();
  });

  it("jobs.cancelar rejeita sem autenticação", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.jobs.cancelar({ id: 1 })).rejects.toThrow();
  });

  it("jobs.reprocessar rejeita sem autenticação", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.jobs.reprocessar({ id: 1 })).rejects.toThrow();
  });
});

describe("importação em lote - validação de input", () => {
  it("importacaoLoteAvancada aceita array vazio de arquivos", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Array vazio deve funcionar (retorna 0 jobs)
    const result = await caller.jobs.importacaoLoteAvancada({
      arquivos: [],
      opcoes: {
        gerarConhecimentos: true,
        gerarRelatorios: true,
        deduplicarAutomatico: true,
        gerarPastaCliente: true,
        prioridade: 0,
      },
    });

    expect(result).toBeDefined();
    expect(result.loteId).toBeDefined();
    expect(typeof result.loteId).toBe("string");
    expect(result.loteId).toContain("LOTE_");
    expect(result.total).toBe(0);
    expect(result.masterJobId).toBeDefined();
    expect(typeof result.masterJobId).toBe("number");
  });

  it("importacaoLoteAvancada retorna estrutura correta", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.jobs.importacaoLoteAvancada({
      arquivos: [],
      opcoes: {
        gerarConhecimentos: false,
        gerarRelatorios: false,
        deduplicarAutomatico: false,
        gerarPastaCliente: false,
        prioridade: 0,
      },
    });

    expect(result).toHaveProperty("loteId");
    expect(result).toHaveProperty("masterJobId");
    expect(result).toHaveProperty("total");
    expect(result).toHaveProperty("jobIds");
    expect(Array.isArray(result.jobIds)).toBe(true);
  });
});

describe("clientes - integração com importação", () => {
  it("clientes.list retorna array de clientes", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const clientesList = await caller.clientes.list();
    expect(Array.isArray(clientesList)).toBe(true);
  });

  it("clientes.stats retorna estatísticas válidas", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const stats = await caller.clientes.stats();
    expect(stats).toBeDefined();
    expect(typeof stats.totalClientes).toBe("number");
    expect(typeof stats.totalProcessos).toBe("number");
    expect(typeof stats.processosAtivos).toBe("number");
    expect(typeof stats.valorTotalCausas).toBe("number");
  });
});

describe("conhecimentos - integração com importação", () => {
  it("conhecimentosRouter.list retorna array de conhecimentos", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const lista = await caller.conhecimentosRouter.list();
    expect(Array.isArray(lista)).toBe(true);
  });
});
