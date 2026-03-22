import { describe, it, expect, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

// Mock LLM
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: "mock" } }],
  }),
}));

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
    profileCompleted: 1,
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

describe("meuPerfil", () => {
  it("obter returns profile data for authenticated user", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.meuPerfil.obter();
    expect(result).toBeDefined();
    expect(result).toHaveProperty("profileCompleted");
    expect(result).toHaveProperty("profile");
    expect(result).toHaveProperty("user");
    expect(result!.user).toHaveProperty("id");
    expect(result!.user).toHaveProperty("name");
    expect(result!.user).toHaveProperty("email");
  });

  it("salvar creates/updates profile and marks profileCompleted", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.meuPerfil.salvar({
      nomeCompleto: "Dr. Paulo Melo Teste",
      celular: "(62) 99999-9999",
      cpf: "123.456.789-00",
      oab: "GO 12345",
      cargo: "Advogado(a) Sócio(a)",
      especialidade: "Direito Civil",
      bio: "Advogado especialista em direito civil com 10 anos de experiência.",
    });
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.message).toContain("sucesso");
  });

  it("salvar validates nomeCompleto minimum length", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.meuPerfil.salvar({
        nomeCompleto: "A", // menos de 2 caracteres
      })
    ).rejects.toThrow();
  });

  it("salvar with only required fields works", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.meuPerfil.salvar({
      nomeCompleto: "Teste Mínimo",
    });
    expect(result.success).toBe(true);
  });

  it("obter after salvar shows profileCompleted as true", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Salvar perfil primeiro
    await caller.meuPerfil.salvar({
      nomeCompleto: "Dr. Paulo Verificação",
      oab: "GO 99999",
    });

    // Verificar que profileCompleted é true
    const result = await caller.meuPerfil.obter();
    expect(result).toBeDefined();
    expect(result!.profileCompleted).toBe(true);
  });
});
