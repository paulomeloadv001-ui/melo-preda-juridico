import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

// Helper: create authenticated caller
function createAuthenticatedCaller() {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-open-id",
    name: "Test User",
    email: "test@test.com",
    loginMethod: "google",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

// Helper: create unauthenticated caller
function createUnauthenticatedCaller() {
  const ctx: TrpcContext = {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

// ==================== VALIDAÇÃO CPF/CNPJ ====================
describe("Validação CPF", () => {
  it("deve rejeitar CPF com dígitos repetidos", async () => {
    const caller = createAuthenticatedCaller();
    await expect(
      caller.enriquecimento.atualizarCpf({ clienteId: 999999, cpfCnpj: "11111111111" })
    ).rejects.toThrow();
  });

  it("deve rejeitar CPF com tamanho incorreto", async () => {
    const caller = createAuthenticatedCaller();
    await expect(
      caller.enriquecimento.atualizarCpf({ clienteId: 999999, cpfCnpj: "123456" })
    ).rejects.toThrow();
  });

  it("deve rejeitar CNPJ inválido", async () => {
    const caller = createAuthenticatedCaller();
    await expect(
      caller.enriquecimento.atualizarCpf({ clienteId: 999999, cpfCnpj: "12345678901234" })
    ).rejects.toThrow();
  });
});

// ==================== ENRIQUECIMENTO CADASTRAL ====================
describe("Enriquecimento Cadastral", () => {
  it("deve listar clientes pendentes (autenticado)", async () => {
    const caller = createAuthenticatedCaller();
    const result = await caller.enriquecimento.clientesPendentes();
    expect(result).toHaveProperty("clientes");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.clientes)).toBe(true);
    expect(typeof result.total).toBe("number");
  });

  it("deve rejeitar listagem sem autenticação", async () => {
    const caller = createUnauthenticatedCaller();
    await expect(caller.enriquecimento.clientesPendentes()).rejects.toThrow();
  });

  it("deve retornar estatísticas de completude", async () => {
    const caller = createAuthenticatedCaller();
    const result = await caller.enriquecimento.estatisticas();
    expect(result).toHaveProperty("total");
    expect(result).toHaveProperty("comCpf");
    expect(result).toHaveProperty("semCpf");
    expect(result).toHaveProperty("completude");
    expect(typeof result.total).toBe("number");
    expect(typeof result.comCpf).toBe("number");
    expect(typeof result.semCpf).toBe("number");
    expect(result.total).toBeGreaterThanOrEqual(0);
  });

  it("deve rejeitar extração de CPF sem autenticação", async () => {
    const caller = createUnauthenticatedCaller();
    await expect(caller.enriquecimento.extrairCpfDosProcessos()).rejects.toThrow();
  });

  it("deve executar extração de CPF dos processos (autenticado)", async () => {
    const caller = createAuthenticatedCaller();
    const result = await caller.enriquecimento.extrairCpfDosProcessos();
    expect(result).toHaveProperty("corrigidos");
    expect(result).toHaveProperty("naoEncontrados");
    expect(typeof result.corrigidos).toBe("number");
    expect(typeof result.naoEncontrados).toBe("number");
  });

  it("deve rejeitar atualização em lote vazia", async () => {
    const caller = createAuthenticatedCaller();
    await expect(
      caller.enriquecimento.atualizarCpfLote({ atualizacoes: [] })
    ).rejects.toThrow();
  });

  it("deve rejeitar completar dados sem campos", async () => {
    const caller = createAuthenticatedCaller();
    await expect(
      caller.enriquecimento.completarDados({ clienteId: 999999, dados: {} })
    ).rejects.toThrow("Nenhum dado para atualizar");
  });
});

// ==================== MÉTRICAS DE PRODUTIVIDADE ====================
describe("Métricas de Produtividade", () => {
  it("deve retornar métricas gerais (autenticado)", async () => {
    const caller = createAuthenticatedCaller();
    const result = await caller.metricas.geral();
    expect(result).not.toBeNull();
    if (result) {
      expect(result).toHaveProperty("resumo");
      expect(result).toHaveProperty("honorarios");
      expect(result).toHaveProperty("prazos");
      expect(result).toHaveProperty("jobs");
      expect(result).toHaveProperty("porTipoAcao");
      expect(result).toHaveProperty("porStatus");
      expect(result).toHaveProperty("evolucaoMensal");
      expect(result.resumo).toHaveProperty("totalClientes");
      expect(result.resumo).toHaveProperty("totalProcessos");
      expect(typeof result.resumo.totalClientes).toBe("number");
      expect(Array.isArray(result.evolucaoMensal)).toBe(true);
      expect(result.evolucaoMensal.length).toBe(12);
    }
  });

  it("deve rejeitar métricas sem autenticação", async () => {
    const caller = createUnauthenticatedCaller();
    await expect(caller.metricas.geral()).rejects.toThrow();
  });

  it("deve retornar produtividade por período 7d", async () => {
    const caller = createAuthenticatedCaller();
    const result = await caller.metricas.produtividade({ periodo: "7d" });
    expect(result).not.toBeNull();
    if (result) {
      expect(result.periodo).toBe("7d");
      expect(result).toHaveProperty("totalJobs");
      expect(result).toHaveProperty("importacoes");
      expect(result).toHaveProperty("relatoriosGerados");
      expect(result).toHaveProperty("tempoMedioFormatado");
      expect(result).toHaveProperty("porDia");
      expect(Array.isArray(result.porDia)).toBe(true);
    }
  });

  it("deve retornar produtividade por período 30d", async () => {
    const caller = createAuthenticatedCaller();
    const result = await caller.metricas.produtividade({ periodo: "30d" });
    expect(result).not.toBeNull();
    if (result) {
      expect(result.periodo).toBe("30d");
    }
  });

  it("deve retornar produtividade sem período (default 30d)", async () => {
    const caller = createAuthenticatedCaller();
    const result = await caller.metricas.produtividade();
    expect(result).not.toBeNull();
    if (result) {
      expect(result.periodo).toBe("30d");
    }
  });

  it("deve ter valores numéricos consistentes nas métricas gerais", async () => {
    const caller = createAuthenticatedCaller();
    const result = await caller.metricas.geral();
    if (result) {
      expect(result.prazos.taxaCumprimento).toBeGreaterThanOrEqual(0);
      expect(result.prazos.taxaCumprimento).toBeLessThanOrEqual(100);
      expect(result.jobs.taxaSucesso).toBeGreaterThanOrEqual(0);
      expect(result.jobs.taxaSucesso).toBeLessThanOrEqual(100);
      expect(result.honorarios.valorPago).toBeGreaterThanOrEqual(0);
      expect(result.honorarios.valorALevantar).toBeGreaterThanOrEqual(0);
    }
  });
});
