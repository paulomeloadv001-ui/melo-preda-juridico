import { describe, it, expect } from "vitest";
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

describe("API REST e Geração DOCX", () => {
  describe("Agente IA Expert - Funcionalidades de Dados", () => {
    it("estatísticas retornam contagens corretas", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const stats = await caller.agente.estatisticas();
      expect(stats).toBeDefined();
      expect(stats).toHaveProperty("total");
      expect(stats).toHaveProperty("teses");
      expect(stats).toHaveProperty("templates");
      expect(stats).toHaveProperty("peticoesGeradas");
      expect(stats).toHaveProperty("sessoes");
      expect(typeof stats.total).toBe("number");
      expect(stats.total).toBeGreaterThan(0);
    });

    it("listarTemplates retorna templates de petição", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const templates = await caller.agente.listarTemplates();
      expect(Array.isArray(templates)).toBe(true);
    });

    it("listarPeticoes retorna petições geradas", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const peticoes = await caller.agente.listarPeticoes({ limit: 10 });
      expect(Array.isArray(peticoes)).toBe(true);
    });

    it("buscarConhecimento retorna resultados", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.agente.buscarConhecimento({ termo: "consignado" });
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("Agente IA Expert - Chat LLM", () => {
    it("chat modo peticao gera conteúdo de petição", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.agente.chat({
        mensagem: "Gere uma petição simples de juntada de documentos",
        modo: "peticao",
      });
      expect(result).toBeDefined();
      expect(result.resposta).toBeDefined();
      expect(result.resposta.length).toBeGreaterThan(100);
      expect(result.sessaoId).toBeDefined();
    }, 60000);

    it("chat modo estrategia retorna análise estratégica", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.agente.chat({
        mensagem: "Qual a melhor estratégia para ações de obrigação de fazer envolvendo consignados?",
        modo: "estrategia",
      });
      expect(result).toBeDefined();
      expect(result.resposta).toBeDefined();
      expect(result.resposta.length).toBeGreaterThan(100);
      expect(result.sessaoId).toBeDefined();
    }, 60000);

    it("chat modo analise retorna análise técnica", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.agente.chat({
        mensagem: "Analise as teses centrais do escritório para margem consignável",
        modo: "analise",
      });
      expect(result).toBeDefined();
      expect(result.resposta).toBeDefined();
      expect(result.sessaoId).toBeDefined();
    }, 60000);
  });

  describe("Integração JUSCONSIG API", () => {
    it("endpoints de integração estão registrados", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const status = await caller.integracao.statusIntegracao();
      expect(status).toBeDefined();
      expect(status).toHaveProperty("configurado");
      expect(status).toHaveProperty("apiKeyConfigurada");
    });

    it("histórico de syncs retorna array", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const historico = await caller.integracao.historicoSyncs({ limite: 10 });
      expect(Array.isArray(historico)).toBe(true);
    });
  });
});
