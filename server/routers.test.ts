import { describe, it, expect, vi } from "vitest";

// Test the schema structure
describe("Database Schema", () => {
  it("should have all required tables exported from schema", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.users).toBeDefined();
    expect(schema.clientes).toBeDefined();
    expect(schema.processos).toBeDefined();
    expect(schema.dadosFinanceiros).toBeDefined();
    expect(schema.emprestimosConsignados).toBeDefined();
    expect(schema.estrategias).toBeDefined();
    expect(schema.partesProcessuais).toBeDefined();
    expect(schema.movimentacoes).toBeDefined();
    expect(schema.documentos).toBeDefined();
    expect(schema.conhecimentos).toBeDefined();
    expect(schema.cumprimentosSentenca).toBeDefined();
  });

  it("should have correct type exports for clientes", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.clientes).toHaveProperty("id");
    expect(schema.clientes).toHaveProperty("cpfCnpj");
    expect(schema.clientes).toHaveProperty("nomeCompleto");
    expect(schema.clientes).toHaveProperty("tipoPessoa");
    expect(schema.clientes).toHaveProperty("profissao");
    expect(schema.clientes).toHaveProperty("cargo");
    expect(schema.clientes).toHaveProperty("orgaoEmpregador");
  });

  it("should have correct type exports for processos", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.processos).toHaveProperty("numeroCnj");
    expect(schema.processos).toHaveProperty("clienteId");
    expect(schema.processos).toHaveProperty("tipoAcao");
    expect(schema.processos).toHaveProperty("pdfStorageKey");
    expect(schema.processos).toHaveProperty("pdfUrl");
    expect(schema.processos).toHaveProperty("faseAtual");
    expect(schema.processos).toHaveProperty("statusProcesso");
    expect(schema.processos).toHaveProperty("valorCausa");
    expect(schema.processos).toHaveProperty("valorCondenacao");
    expect(schema.processos).toHaveProperty("danosMorais");
    expect(schema.processos).toHaveProperty("danosMateriais");
    expect(schema.processos).toHaveProperty("tutelaTipo");
    expect(schema.processos).toHaveProperty("tutelaStatus");
    expect(schema.processos).toHaveProperty("textoExtraido");
    expect(schema.processos).toHaveProperty("natureza");
  });

  it("should have financial data fields for consignado analysis", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.dadosFinanceiros).toHaveProperty("remuneracaoBruta");
    expect(schema.dadosFinanceiros).toHaveProperty("remuneracaoLiquida");
    expect(schema.dadosFinanceiros).toHaveProperty("margemConsignavelPerc");
    expect(schema.dadosFinanceiros).toHaveProperty("margemConsignavelValor");
    expect(schema.dadosFinanceiros).toHaveProperty("margemDisponivel");
    expect(schema.dadosFinanceiros).toHaveProperty("aptoEmprestimo");
  });

  it("should have knowledge base fields", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.conhecimentos).toHaveProperty("categoria");
    expect(schema.conhecimentos).toHaveProperty("titulo");
    expect(schema.conhecimentos).toHaveProperty("conteudo");
    expect(schema.conhecimentos).toHaveProperty("tribunal");
    expect(schema.conhecimentos).toHaveProperty("tipoAcao");
    expect(schema.conhecimentos).toHaveProperty("processoOrigemId");
  });
});

// Test router structure
describe("Router Structure", () => {
  it("should export appRouter with all required routes", async () => {
    const { appRouter } = await import("./routers");
    expect(appRouter).toBeDefined();
    const procedures = appRouter._def.procedures as Record<string, any>;
    // Auth
    expect(procedures["auth.me"]).toBeDefined();
    expect(procedures["auth.logout"]).toBeDefined();
    // Clientes
    expect(procedures["clientes.list"]).toBeDefined();
    expect(procedures["clientes.getById"]).toBeDefined();
    expect(procedures["clientes.getByCpf"]).toBeDefined();
    expect(procedures["clientes.getFullProfile"]).toBeDefined();
    expect(procedures["clientes.stats"]).toBeDefined();
    // Processar
    expect(procedures["processar.uploadPdf"]).toBeDefined();
    // Exportar
    expect(procedures["exportar.clienteJson"]).toBeDefined();
    expect(procedures["exportar.todosClientesJson"]).toBeDefined();
    expect(procedures["exportar.conhecimentosJson"]).toBeDefined();
  });

  it("should have pasta router with generate and getFiles", async () => {
    const { appRouter } = await import("./routers");
    const procedures = appRouter._def.procedures as Record<string, any>;
    expect(procedures["pasta.generate"]).toBeDefined();
    expect(procedures["pasta.getFiles"]).toBeDefined();
  });
});

// Test auth flow
describe("Auth Flow", () => {
  it("should return user when authenticated", async () => {
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller({
      user: {
        id: 1,
        openId: "test-user",
        email: "test@example.com",
        name: "Test User",
        loginMethod: "manus",
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: { protocol: "https", headers: {} } as any,
      res: { clearCookie: () => {} } as any,
    });
    const user = await caller.auth.me();
    expect(user).toBeDefined();
    expect(user?.openId).toBe("test-user");
  });

  it("should return null when not authenticated", async () => {
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller({
      user: null,
      req: { protocol: "https", headers: {} } as any,
      res: { clearCookie: () => {} } as any,
    });
    const user = await caller.auth.me();
    expect(user).toBeNull();
  });

  it("should clear cookie on logout", async () => {
    const { appRouter } = await import("./routers");
    const clearedCookies: any[] = [];
    const caller = appRouter.createCaller({
      user: {
        id: 1, openId: "test", email: "t@t.com", name: "T",
        loginMethod: "manus", role: "user",
        createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
      },
      req: { protocol: "https", headers: {} } as any,
      res: {
        clearCookie: (name: string, opts: any) => clearedCookies.push({ name, opts }),
      } as any,
    });
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(clearedCookies.length).toBe(1);
  });
});
