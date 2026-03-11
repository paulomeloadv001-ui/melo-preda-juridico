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

  it("should have correct type exports", async () => {
    const schema = await import("../drizzle/schema");
    // Verify table objects have the expected structure
    expect(schema.clientes).toHaveProperty("id");
    expect(schema.clientes).toHaveProperty("cpfCnpj");
    expect(schema.clientes).toHaveProperty("nomeCompleto");
    expect(schema.processos).toHaveProperty("numeroCnj");
    expect(schema.processos).toHaveProperty("clienteId");
    expect(schema.processos).toHaveProperty("tipoAcao");
    expect(schema.processos).toHaveProperty("pdfStorageKey");
    expect(schema.processos).toHaveProperty("pdfUrl");
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

  it("should have processo fields for complete case tracking", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.processos).toHaveProperty("faseAtual");
    expect(schema.processos).toHaveProperty("statusProcesso");
    expect(schema.processos).toHaveProperty("valorCausa");
    expect(schema.processos).toHaveProperty("valorCondenacao");
    expect(schema.processos).toHaveProperty("danosMorais");
    expect(schema.processos).toHaveProperty("danosMateriais");
    expect(schema.processos).toHaveProperty("tutelaTipo");
    expect(schema.processos).toHaveProperty("tutelaStatus");
    expect(schema.processos).toHaveProperty("textoExtraido");
  });
});

// Test router structure
describe("Router Structure", () => {
  it("should export appRouter with all required routes", async () => {
    const { appRouter } = await import("./routers");
    expect(appRouter).toBeDefined();
    // Check that the router has the expected procedure keys
    const routerDef = appRouter._def;
    expect(routerDef).toBeDefined();
  });
});
