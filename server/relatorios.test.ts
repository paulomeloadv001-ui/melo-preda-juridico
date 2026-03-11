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

describe("relatorios", () => {
  it("categorias returns available report categories", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const categorias = await caller.relatorios.categorias();

    expect(categorias).toBeDefined();
    expect(Array.isArray(categorias)).toBe(true);
    expect(categorias.length).toBe(3);

    // Verificar categorias esperadas
    const ids = categorias.map(c => c.id);
    expect(ids).toContain("cadastral");
    expect(ids).toContain("financeiro");
    expect(ids).toContain("processual");

    // Verificar estrutura da categoria cadastral
    const cadastral = categorias.find(c => c.id === "cadastral");
    expect(cadastral).toBeDefined();
    expect(cadastral!.titulo).toBe("Relatórios Cadastrais");
    expect(cadastral!.subcategorias).toBeDefined();
    expect(cadastral!.subcategorias.length).toBeGreaterThan(0);
    expect(cadastral!.subcategorias[0].id).toBe("cadastral_pf");
  });

  it("list returns array of reports", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const list = await caller.relatorios.list();

    expect(Array.isArray(list)).toBe(true);
  });

  it("list with categoria filter returns filtered results", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const list = await caller.relatorios.list({ categoria: "Cadastral" });

    expect(Array.isArray(list)).toBe(true);
  });

  it("dadosCadastraisRealtime returns real-time data structure", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const dados = await caller.relatorios.dadosCadastraisRealtime();

    expect(dados).toBeDefined();
    expect(dados).not.toBeNull();
    expect(dados!.dataConsulta).toBeDefined();
    expect(typeof dados!.totalClientesPF).toBe("number");
    expect(typeof dados!.totalClientesGeral).toBe("number");
    expect(typeof dados!.totalProcessos).toBe("number");
    expect(typeof dados!.totalEmprestimos).toBe("number");
    expect(Array.isArray(dados!.clientes)).toBe(true);

    // Verificar estrutura dos clientes
    if (dados!.clientes.length > 0) {
      const cli = dados!.clientes[0];
      expect(cli.id).toBeDefined();
      expect(cli.nomeCompleto).toBeDefined();
      expect(cli.cpfCnpj).toBeDefined();
      expect(typeof cli.totalProcessos).toBe("number");
      expect(typeof cli.processosAtivos).toBe("number");
      expect(Array.isArray(cli.processos)).toBe(true);
    }
  });

  it("gerarCadastral generates report and returns success", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.relatorios.gerarCadastral();

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(typeof result.relatorioId).toBe("number");
    expect(typeof result.totalClientes).toBe("number");
    expect(typeof result.totalProcessos).toBe("number");
    expect(result.url).toBeDefined();
    expect(result.dados).toBeDefined();
    expect(result.dados.titulo).toContain("Cadastrais");
    expect(result.dados.escritorio).toBe("Melo & Preda Advogados");
    expect(result.dados.clientes).toBeDefined();
    expect(Array.isArray(result.dados.clientes)).toBe(true);
  });

  it("getById returns null for non-existent report", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const report = await caller.relatorios.getById({ id: 99999 });

    expect(report).toBeNull();
  });

  it("after gerarCadastral, list contains the generated report", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Gerar relatório primeiro
    await caller.relatorios.gerarCadastral();

    // Listar e verificar
    const list = await caller.relatorios.list();
    const cadastral = list.find((r: any) => r.tipoRelatorio === "cadastral_pf");
    expect(cadastral).toBeDefined();
    expect(cadastral!.titulo).toContain("Cadastrais");
    expect(cadastral!.categoria).toBe("Cadastral");
  });

  it("update modifies report title and description", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Gerar relatório primeiro
    const generated = await caller.relatorios.gerarCadastral();

    // Atualizar
    const updated = await caller.relatorios.update({
      id: generated.relatorioId,
      titulo: "Relatório Editado",
      descricao: "Descrição editada para teste",
    });

    expect(updated).toBeDefined();
    expect(updated!.titulo).toBe("Relatório Editado");
    expect(updated!.descricao).toBe("Descrição editada para teste");
  });

  it("delete removes the report", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Gerar relatório
    const generated = await caller.relatorios.gerarCadastral();

    // Excluir
    const result = await caller.relatorios.delete({ id: generated.relatorioId });
    expect(result.success).toBe(true);

    // Verificar que foi excluído
    const report = await caller.relatorios.getById({ id: generated.relatorioId });
    expect(report).toBeNull();
  });
});
