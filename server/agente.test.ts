import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@melopreda.com",
    name: "Test User",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

describe("agente IA jurídico", () => {
  it("estatisticas returns knowledge base counts", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const stats = await caller.agente.estatisticas();

    expect(stats).toBeDefined();
    expect(typeof stats.total).toBe("number");
    expect(typeof stats.teses).toBe("number");
    expect(typeof stats.jurisprudencias).toBe("number");
    expect(typeof stats.estrategias).toBe("number");
    expect(typeof stats.legislacoes).toBe("number");
    expect(typeof stats.modelos).toBe("number");
    expect(stats.total).toBeGreaterThan(0);
  });

  it("buscarConhecimento returns results for valid search", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const results = await caller.agente.buscarConhecimento({ termo: "consignação" });

    expect(Array.isArray(results)).toBe(true);
    // Should find at least one result about consignações
    expect(results.length).toBeGreaterThan(0);
  });

  it("buscarConhecimento with categoria filter works", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const results = await caller.agente.buscarConhecimento({ 
      termo: "honorários", 
      categoria: "Tese" 
    });

    expect(Array.isArray(results)).toBe(true);
    results.forEach((r: any) => {
      expect(r.categoria).toBe("Tese");
    });
  });

  it("buscarConhecimento returns empty for nonsense term", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const results = await caller.agente.buscarConhecimento({ termo: "xyznonexistent123" });

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
  });

  it("estatisticas returns new expert fields", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const stats = await caller.agente.estatisticas();

    expect(typeof stats.templates).toBe("number");
    expect(typeof stats.peticoesGeradas).toBe("number");
    expect(typeof stats.sessoes).toBe("number");
  });

  it("listarTemplates returns available templates", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const templates = await caller.agente.listarTemplates();

    expect(Array.isArray(templates)).toBe(true);
    if (templates.length > 0) {
      expect(templates[0]).toHaveProperty("nome");
      expect(templates[0]).toHaveProperty("tipo");
      expect(templates[0]).toHaveProperty("descricao");
    }
  });

  it("listarPeticoes returns recent petitions", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const peticoes = await caller.agente.listarPeticoes({ limit: 5 });

    expect(Array.isArray(peticoes)).toBe(true);
  });

  it("historico returns sessions list", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const hist = await caller.agente.historico({ limit: 10 });

    expect(Array.isArray(hist)).toBe(true);
  });

  it("chat responds with modo parameter", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.agente.chat({
      mensagem: "Qual o limite legal para consignações em folha de pagamento?",
      historico: [],
      modo: "chat",
    });

    expect(result).toBeDefined();
    expect(result.resposta).toBeDefined();
    expect(typeof result.resposta).toBe("string");
    expect(result.resposta.length).toBeGreaterThan(10);
    expect(result.sessaoId).toBeDefined();
  }, 30000);

  it("chat with historico and sessaoId maintains context", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.agente.chat({
      mensagem: "E qual a jurisprudência do TJ-GO sobre isso?",
      historico: [
        { role: "user", content: "Qual o limite para consignações?" },
        { role: "assistant", content: "O limite é de 35% conforme Lei Estadual 16.898/2010." },
      ],
      sessaoId: "test_sessao_123",
      modo: "analise",
    });

    expect(result).toBeDefined();
    expect(result.resposta).toBeDefined();
    expect(typeof result.resposta).toBe("string");
    expect(result.resposta.length).toBeGreaterThan(10);
    expect(result.sessaoId).toBe("test_sessao_123");
  }, 30000);

  it("chat with clienteId provides client context", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Use a non-existent client ID - should still work without error
    const result = await caller.agente.chat({
      mensagem: "Resuma a situação deste cliente",
      historico: [],
      clienteId: 99999,
      modo: "estrategia",
    });

    expect(result).toBeDefined();
    expect(result.resposta).toBeDefined();
    expect(typeof result.resposta).toBe("string");
  }, 30000);

  it("chat with calculo mode works", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.agente.chat({
      mensagem: "Calcule o débito judicial de R$ 10.000 com IPCA e juros de 1% ao mês por 12 meses",
      historico: [],
      modo: "calculo",
    });

    expect(result).toBeDefined();
    expect(result.resposta).toBeDefined();
    expect(typeof result.resposta).toBe("string");
  }, 30000);
});
