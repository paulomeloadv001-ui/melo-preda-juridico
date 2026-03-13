import { describe, expect, it, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createProtectedContext(headers: Record<string, string> = {}): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-integracao",
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
      headers,
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

function createPublicContext(headers: Record<string, string> = {}): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers,
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("integracao - endpoints de API externa", () => {
  // Testar que endpoints de API externa requerem API Key
  it("clientesAtualizados rejeita sem API Key", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.integracao.clientesAtualizados({ desde: "2020-01-01" })
    ).rejects.toThrow("API Key de integração inválida");
  });

  it("processosAtualizados rejeita sem API Key", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.integracao.processosAtualizados({ desde: "2020-01-01" })
    ).rejects.toThrow("API Key de integração inválida");
  });

  it("movimentacoesRecentes rejeita sem API Key", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.integracao.movimentacoesRecentes({ desde: "2020-01-01" })
    ).rejects.toThrow("API Key de integração inválida");
  });

  it("conhecimentosAtualizados rejeita sem API Key", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.integracao.conhecimentosAtualizados({ desde: "2020-01-01" })
    ).rejects.toThrow("API Key de integração inválida");
  });

  it("estrategiasAtualizadas rejeita sem API Key", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.integracao.estrategiasAtualizadas({ desde: "2020-01-01" })
    ).rejects.toThrow("API Key de integração inválida");
  });

  it("financeiroAtualizado rejeita sem API Key", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.integracao.financeiroAtualizado({ desde: "2020-01-01" })
    ).rejects.toThrow("API Key de integração inválida");
  });

  it("dadosScoreServidor rejeita sem API Key", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.integracao.dadosScoreServidor({ cpf: "12345678901" })
    ).rejects.toThrow("API Key de integração inválida");
  });

  it("clientesAtualizados rejeita com API Key errada", async () => {
    const ctx = createPublicContext({ "x-integration-key": "chave-errada-123" });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.integracao.clientesAtualizados({ desde: "2020-01-01" })
    ).rejects.toThrow("API Key de integração inválida");
  });
});

describe("integracao - procedures do painel (protegidas)", () => {
  it("statusIntegracao retorna dados de status", async () => {
    const ctx = createProtectedContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.integracao.statusIntegracao();

    expect(result).toBeDefined();
    expect(typeof result.configurado).toBe("boolean");
    expect(typeof result.apiKeyConfigurada).toBe("boolean");
    expect(typeof result.totalSyncs).toBe("number");
    expect(typeof result.totalErros).toBe("number");
  });

  it("historicoSyncs retorna array", async () => {
    const ctx = createProtectedContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.integracao.historicoSyncs({ limite: 10 });

    expect(Array.isArray(result)).toBe(true);
  });

  it("historicoSyncs aceita filtro por tipo", async () => {
    const ctx = createProtectedContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.integracao.historicoSyncs({ limite: 10, tipo: "clientes" });

    expect(Array.isArray(result)).toBe(true);
  });

  it("executarSyncManual executa sync de clientes", async () => {
    const ctx = createProtectedContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.integracao.executarSyncManual({ tipo: "clientes" });

    expect(result).toBeDefined();
    expect(result.sucesso).toBe(true);
    expect(result.tipo).toBe("clientes");
    expect(typeof result.registros).toBe("number");
    expect(typeof result.duracaoMs).toBe("number");
  });

  it("executarSyncManual executa sync completa", async () => {
    const ctx = createProtectedContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.integracao.executarSyncManual({ tipo: "completa" });

    expect(result).toBeDefined();
    expect(result.sucesso).toBe(true);
    expect(result.tipo).toBe("completa");
    expect(result.registros).toBeGreaterThanOrEqual(0);
  });

  it("consultarScorePainel retorna não encontrado para CPF inexistente", async () => {
    const ctx = createProtectedContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.integracao.consultarScorePainel({ cpf: "00000000000" });

    expect(result).toBeDefined();
    if (result && "encontrado" in result) {
      expect(result.encontrado).toBe(false);
    }
  });

  it("limparLogsAntigos executa sem erro", async () => {
    const ctx = createProtectedContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.integracao.limparLogsAntigos({ diasManter: 365 });

    expect(result).toBeDefined();
    expect(typeof result.removidos).toBe("number");
  });

  it("statusIntegracao reflete API Key configurada", async () => {
    const ctx = createProtectedContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.integracao.statusIntegracao();

    // A API Key foi configurada via webdev_request_secrets
    expect(result.apiKeyConfigurada).toBe(true);
    expect(result.configurado).toBe(true);
  });
});
