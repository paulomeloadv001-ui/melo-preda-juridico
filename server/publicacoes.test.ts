import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-user",
    email: "admin@melopreda.com",
    name: "Dr. Melo",
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

function createUserContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "regular-user",
    email: "user@melopreda.com",
    name: "User Test",
    loginMethod: "manus",
    role: "user",
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

describe("publicacoesRouter", () => {
  it("stats route exists and is callable", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    // Should not throw - stats returns data from DB
    const result = await caller.publicacoesRouter.stats();
    expect(result).toBeDefined();
    expect(typeof result.total).toBe("number");
    expect(typeof result.naoTratadas).toBe("number");
    expect(typeof result.urgentes).toBe("number");
    expect(Array.isArray(result.porFonte)).toBe(true);
  });

  it("listar route exists and returns array", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.publicacoesRouter.listar({ limit: 10 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("listar with fonte filter works", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.publicacoesRouter.listar({ fonte: "datajud", limit: 5 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("marcarTratada handles non-existent publication gracefully", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    // marcarTratada returns success even if ID doesn't exist (UPDATE affects 0 rows)
    const result = await caller.publicacoesRouter.marcarTratada({ id: 999999 });
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });

  it("gerarPrazo validates input", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    // Should throw for non-existent publication
    await expect(
      caller.publicacoesRouter.gerarPrazo({
        publicacaoId: 999999,
        tipoPrazo: "recurso",
        diasPrazo: 15,
      })
    ).rejects.toThrow();
  });
});

describe("agente.refinarPeticao", () => {
  it("validates peticaoId input", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    // Should throw for non-existent petition
    await expect(
      caller.agente.refinarPeticao({
        peticaoId: 999999,
        instrucoes: "Melhorar fundamentação jurídica",
      })
    ).rejects.toThrow();
  });

  it("rejects short instructions", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.agente.refinarPeticao({
        peticaoId: 1,
        instrucoes: "ab", // Too short (min 5)
      })
    ).rejects.toThrow();
  });
});

describe("agente.analisarDocumentoCliente", () => {
  it("validates required input fields", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    // Should throw for missing required fields
    await expect(
      // @ts-expect-error - intentionally missing fields
      caller.agente.analisarDocumentoCliente({
        clienteId: 1,
      })
    ).rejects.toThrow();
  });
});

describe("access control", () => {
  it("publicacoesRouter.stats is accessible to authenticated users", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    // Stats uses protectedProcedure, so any authenticated user can access
    const result = await caller.publicacoesRouter.stats();
    expect(result).toBeDefined();
    expect(typeof result.total).toBe("number");
  });

  it("publicacoesRouter.buscarDatajud requires admin", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.publicacoesRouter.buscarDatajud()).rejects.toThrow();
  });
});
