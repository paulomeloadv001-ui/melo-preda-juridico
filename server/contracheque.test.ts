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

describe("contracheque upload", () => {
  it("processar.uploadContracheque procedure exists and is callable", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Verify the procedure exists on the router
    expect(caller.processar.uploadContracheque).toBeDefined();
    expect(typeof caller.processar.uploadContracheque).toBe("function");
  });

  it("processar.uploadContracheque rejects empty base64", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Should fail with empty/invalid PDF
    await expect(
      caller.processar.uploadContracheque({
        fileName: "test.pdf",
        fileBase64: "",
        fileSize: 0,
      })
    ).rejects.toThrow();
  }, 30000);

  it("processar.uploadContracheque validates input schema", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Missing required fields should throw validation error
    await expect(
      // @ts-expect-error - testing invalid input
      caller.processar.uploadContracheque({
        fileName: "test.pdf",
        // missing fileBase64 and fileSize
      })
    ).rejects.toThrow();
  });

  it("processar.uploadContracheque processes invalid PDF gracefully", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Use unique content each test run to avoid duplicate hash detection
    const uniqueContent = `test_contracheque_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    const fileBase64 = Buffer.from(uniqueContent).toString('base64');

    // With an invalid PDF (not parseable), the system should still process
    // and create a client with empty/default financial data
    const result = await caller.processar.uploadContracheque({
      fileName: `test_${Date.now()}.pdf`,
      fileBase64,
      fileSize: uniqueContent.length,
      clienteId: 1,
    });

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.resumoFinanceiro).toBeDefined();
    expect(typeof result.resumoFinanceiro.remuneracaoBruta).toBe("number");
    expect(typeof result.resumoFinanceiro.margemDisponivel).toBe("number");
  }, 15000);
});

describe("contracheque - financial data queries", () => {
  it("clientes.list returns clients with financial data fields", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const clients = await caller.clientes.list();
    expect(Array.isArray(clients)).toBe(true);

    // Verify clients exist (from previous imports)
    if (clients.length > 0) {
      const client = clients[0];
      expect(client.id).toBeDefined();
      expect(client.nomeCompleto).toBeDefined();
    }
  });

  it("clientes.stats returns aggregate statistics", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const stats = await caller.clientes.stats();
    expect(stats).toBeDefined();
    expect(typeof stats.totalClientes).toBe("number");
    expect(typeof stats.totalProcessos).toBe("number");
  });

  it("relatorios.dadosCadastraisRealtime includes financial summary", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const dados = await caller.relatorios.dadosCadastraisRealtime();
    expect(dados).toBeDefined();
    expect(typeof dados!.totalEmprestimos).toBe("number");
    expect(typeof dados!.totalClientesPF).toBe("number");

    // Verify clients have financial data structure
    if (dados!.clientes.length > 0) {
      const cli = dados!.clientes[0];
      expect(cli.dadosFinanceiros).toBeDefined();
    }
  });
});
