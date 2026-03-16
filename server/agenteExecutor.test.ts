import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db module
vi.mock("./db", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnValue([]),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue({}) }),
    update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) }) }),
    delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) }),
  },
}));

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

// Mock drizzle schema
vi.mock("../drizzle/schema", () => {
  const mockTable = (name: string) => ({
    id: { name: "id" },
    nomeCompleto: { name: "nomeCompleto" },
    cpf: { name: "cpf" },
    numeroCnj: { name: "numeroCnj" },
    clienteId: { name: "clienteId" },
    processoId: { name: "processoId" },
    tipo: { name: "tipo" },
    titulo: { name: "titulo" },
    conteudo: { name: "conteudo" },
    status: { name: "status" },
    acao: { name: "acao" },
    detalhes: { name: "detalhes" },
    entidade: { name: "entidade" },
    entidadeId: { name: "entidadeId" },
    criadoEm: { name: "criadoEm" },
    _: { name },
  });
  return {
    clientes: mockTable("clientes"),
    processos: mockTable("processos"),
    movimentacoes: mockTable("movimentacoes"),
    baseConhecimento: mockTable("baseConhecimento"),
    historicoCorrecoes: mockTable("historicoCorrecoes"),
    agenteIaHistorico: mockTable("agenteIaHistorico"),
    estrategiasProcessuais: mockTable("estrategiasProcessuais"),
    peticoesGeradas: mockTable("peticoesGeradas"),
    documentos: mockTable("documentos"),
    emprestimosConsignados: mockTable("emprestimosConsignados"),
    contracheques: mockTable("contracheques"),
    relatoriosCadastrais: mockTable("relatoriosCadastrais"),
    partesProcessuais: mockTable("partesProcessuais"),
    prazosProcessuais: mockTable("prazosProcessuais"),
    agenteIaConfig: mockTable("agenteIaConfig"),
    templatesDocumento: mockTable("templatesDocumento"),
    publicacoes: mockTable("publicacoes"),
  };
});

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: any[]) => ({ type: "eq", args })),
  like: vi.fn((...args: any[]) => ({ type: "like", args })),
  or: vi.fn((...args: any[]) => ({ type: "or", args })),
  and: vi.fn((...args: any[]) => ({ type: "and", args })),
  desc: vi.fn((col: any) => ({ type: "desc", col })),
  asc: vi.fn((col: any) => ({ type: "asc", col })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: any[]) => ({ type: "sql", strings, values })),
  count: vi.fn(() => ({ type: "count" })),
  inArray: vi.fn((...args: any[]) => ({ type: "inArray", args })),
}));

describe("agenteExecutor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should export the AGENT_TOOLS array with correct structure", async () => {
    const mod = await import("./agenteExecutor");
    expect(mod.AGENT_TOOLS).toBeDefined();
    expect(Array.isArray(mod.AGENT_TOOLS)).toBe(true);
    expect(mod.AGENT_TOOLS.length).toBeGreaterThan(0);

    // Each tool should have type: "function" and function.name
    for (const tool of mod.AGENT_TOOLS) {
      expect(tool.type).toBe("function");
      expect(tool.function.name).toBeDefined();
      expect(typeof tool.function.name).toBe("string");
      expect(tool.function.description).toBeDefined();
      expect(tool.function.parameters).toBeDefined();
    }
  });

  it("should have all expected tool names", async () => {
    const mod = await import("./agenteExecutor");
    const toolNames = mod.AGENT_TOOLS.map((t: any) => t.function.name);

    expect(toolNames).toContain("buscar_cliente");
    expect(toolNames).toContain("buscar_processo");
    expect(toolNames).toContain("diagnosticar_banco");
    expect(toolNames).toContain("listar_duplicados");
    expect(toolNames).toContain("merge_clientes");
    expect(toolNames).toContain("remover_registro");
    expect(toolNames).toContain("completar_movimentacoes");
    expect(toolNames).toContain("analisar_processo_tecnico");
    expect(toolNames).toContain("gerar_peticao");
    expect(toolNames).toContain("atualizar_dados_cliente");
    expect(toolNames).toContain("atualizar_dados_processo");
    expect(toolNames).toContain("consultar_estatisticas");
  });

  it("should export executarAgenteCompleto function", async () => {
    const mod = await import("./agenteExecutor");
    expect(mod.executarAgenteCompleto).toBeDefined();
    expect(typeof mod.executarAgenteCompleto).toBe("function");
  });

  it("should export executarTool function", async () => {
    const mod = await import("./agenteExecutor");
    expect(mod.executarTool).toBeDefined();
    expect(typeof mod.executarTool).toBe("function");
  });

  it("should return error for unknown tool", async () => {
    const mod = await import("./agenteExecutor");
    const result = await mod.executarTool("unknown_tool", {});
    const parsed = JSON.parse(result);
    expect(parsed.erro).toBeDefined();
  });

  it("executarAgenteCompleto should handle LLM returning text without tool calls", async () => {
    const { invokeLLM } = await import("./_core/llm");
    const mod = await import("./agenteExecutor");

    // Mock LLM to return a simple text response (no tool calls)
    (invokeLLM as any).mockResolvedValueOnce({
      choices: [{
        message: {
          role: "assistant",
          content: "Aqui está minha resposta sobre o caso.",
          tool_calls: undefined,
        },
        finish_reason: "stop",
      }],
    });

    const result = await mod.executarAgenteCompleto({
      mensagem: "Olá, como vai?",
      historico: [],
      panoramaGlobal: "Panorama test",
      baseConhecimento: "Base test",
      configExpertise: "",
      contextoCliente: "",
      contextoProcesso: "",
    });

    expect(result.resposta).toBe("Aqui está minha resposta sobre o caso.");
    expect(result.acoesExecutadas).toEqual([]);
    expect(result.totalTools).toBe(0);
  });

  it("executarAgenteCompleto should handle LLM with tool calls and execute them", async () => {
    const { invokeLLM } = await import("./_core/llm");
    const mod = await import("./agenteExecutor");

    // First call: LLM returns tool call
    (invokeLLM as any).mockResolvedValueOnce({
      choices: [{
        message: {
          role: "assistant",
          content: null,
          tool_calls: [{
            id: "call_1",
            type: "function",
            function: {
              name: "consultar_estatisticas",
              arguments: "{}",
            },
          }],
        },
        finish_reason: "tool_calls",
      }],
    });

    // Second call: LLM returns final text
    (invokeLLM as any).mockResolvedValueOnce({
      choices: [{
        message: {
          role: "assistant",
          content: "Aqui estão as estatísticas do escritório.",
          tool_calls: undefined,
        },
        finish_reason: "stop",
      }],
    });

    const result = await mod.executarAgenteCompleto({
      mensagem: "Mostre as estatísticas",
      historico: [],
      panoramaGlobal: "",
      baseConhecimento: "",
      configExpertise: "",
      contextoCliente: "",
      contextoProcesso: "",
    });

    expect(result.resposta).toBe("Aqui estão as estatísticas do escritório.");
    expect(result.acoesExecutadas.length).toBe(1);
    expect(result.acoesExecutadas[0].tool).toBe("consultar_estatisticas");
    expect(result.totalTools).toBe(1);
  });

  it("executarAgenteCompleto should respect max iterations limit", async () => {
    const { invokeLLM } = await import("./_core/llm");
    const mod = await import("./agenteExecutor");

    // Always return tool calls to trigger max iterations
    (invokeLLM as any).mockResolvedValue({
      choices: [{
        message: {
          role: "assistant",
          content: null,
          tool_calls: [{
            id: "call_loop",
            type: "function",
            function: {
              name: "consultar_estatisticas",
              arguments: "{}",
            },
          }],
        },
        finish_reason: "tool_calls",
      }],
    });

    const result = await mod.executarAgenteCompleto({
      mensagem: "Loop test",
      historico: [],
      panoramaGlobal: "",
      baseConhecimento: "",
      configExpertise: "",
      contextoCliente: "",
      contextoProcesso: "",
    });

    // Should stop after max iterations (10) and return a fallback message
    expect(result.totalTools).toBeLessThanOrEqual(10);
    expect(result.resposta).toBeDefined();
  });
});
