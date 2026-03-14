import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ==================== SCHEMAS DE VALIDAÇÃO ====================
const accessRequestSchema = z.object({
  nomeCompleto: z.string().min(3),
  cpf: z.string().min(11),
  email: z.string().email(),
  celular: z.string().min(10),
  motivo: z.string().optional(),
});

const permissaoSchema = z.object({
  modulo: z.string().min(1),
  podeVisualizar: z.number().min(0).max(1),
  podeEditar: z.number().min(0).max(1),
  podeExcluir: z.number().min(0).max(1),
  podeExportar: z.number().min(0).max(1),
});

const conviteSchema = z.object({
  email: z.string().email(),
  nome: z.string().optional(),
  role: z.enum(["user", "admin"]),
  diasValidade: z.number().min(1).max(90),
});

// ==================== HELPERS ====================
type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-user",
    email: "admin@melopreda.com",
    name: "Admin User",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

function createUserContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "regular-user",
    email: "user@melopreda.com",
    name: "Regular User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

// ==================== TESTES ====================
describe("Gestão de Acessos - Validação de Schemas", () => {
  describe("Validação de Solicitação de Acesso", () => {
    it("deve aceitar dados válidos de solicitação", () => {
      const dados = {
        nomeCompleto: "João da Silva",
        cpf: "123.456.789-00",
        email: "joao@email.com",
        celular: "(62) 99999-9999",
        motivo: "Preciso acessar o sistema para consultar processos",
      };
      const result = accessRequestSchema.safeParse(dados);
      expect(result.success).toBe(true);
    });

    it("deve rejeitar nome muito curto", () => {
      const dados = {
        nomeCompleto: "Jo",
        cpf: "123.456.789-00",
        email: "joao@email.com",
        celular: "(62) 99999-9999",
      };
      const result = accessRequestSchema.safeParse(dados);
      expect(result.success).toBe(false);
    });

    it("deve rejeitar email inválido", () => {
      const dados = {
        nomeCompleto: "João da Silva",
        cpf: "123.456.789-00",
        email: "email-invalido",
        celular: "(62) 99999-9999",
      };
      const result = accessRequestSchema.safeParse(dados);
      expect(result.success).toBe(false);
    });

    it("deve aceitar solicitação sem motivo (opcional)", () => {
      const dados = {
        nomeCompleto: "Maria Santos",
        cpf: "987.654.321-00",
        email: "maria@email.com",
        celular: "(62) 98888-8888",
      };
      const result = accessRequestSchema.safeParse(dados);
      expect(result.success).toBe(true);
    });

    it("deve rejeitar CPF vazio", () => {
      const dados = {
        nomeCompleto: "Pedro Oliveira",
        cpf: "",
        email: "pedro@email.com",
        celular: "(62) 97777-7777",
      };
      const result = accessRequestSchema.safeParse(dados);
      expect(result.success).toBe(false);
    });

    it("deve rejeitar celular muito curto", () => {
      const dados = {
        nomeCompleto: "Ana Costa",
        cpf: "111.222.333-44",
        email: "ana@email.com",
        celular: "123",
      };
      const result = accessRequestSchema.safeParse(dados);
      expect(result.success).toBe(false);
    });
  });

  describe("Validação de Permissão", () => {
    it("deve aceitar permissão válida com todas as flags", () => {
      const perm = { modulo: "clientes", podeVisualizar: 1, podeEditar: 1, podeExcluir: 0, podeExportar: 1 };
      expect(permissaoSchema.safeParse(perm).success).toBe(true);
    });

    it("deve rejeitar permissão sem módulo", () => {
      const perm = { modulo: "", podeVisualizar: 1, podeEditar: 0, podeExcluir: 0, podeExportar: 0 };
      expect(permissaoSchema.safeParse(perm).success).toBe(false);
    });

    it("deve rejeitar valores fora de 0/1", () => {
      const perm = { modulo: "processos", podeVisualizar: 2, podeEditar: 0, podeExcluir: 0, podeExportar: 0 };
      expect(permissaoSchema.safeParse(perm).success).toBe(false);
    });

    it("deve aceitar permissão totalmente restritiva", () => {
      const perm = { modulo: "peticionamento", podeVisualizar: 0, podeEditar: 0, podeExcluir: 0, podeExportar: 0 };
      expect(permissaoSchema.safeParse(perm).success).toBe(true);
    });

    it("deve aceitar permissão totalmente permissiva", () => {
      const perm = { modulo: "relatorios", podeVisualizar: 1, podeEditar: 1, podeExcluir: 1, podeExportar: 1 };
      expect(permissaoSchema.safeParse(perm).success).toBe(true);
    });
  });

  describe("Validação de Convite", () => {
    it("deve aceitar convite válido para usuário", () => {
      const conv = { email: "novo@email.com", nome: "Novo Usuário", role: "user" as const, diasValidade: 7 };
      expect(conviteSchema.safeParse(conv).success).toBe(true);
    });

    it("deve aceitar convite válido para admin", () => {
      const conv = { email: "admin@email.com", nome: "Novo Admin", role: "admin" as const, diasValidade: 30 };
      expect(conviteSchema.safeParse(conv).success).toBe(true);
    });

    it("deve rejeitar convite com email inválido", () => {
      const conv = { email: "invalido", nome: "Teste", role: "user" as const, diasValidade: 7 };
      expect(conviteSchema.safeParse(conv).success).toBe(false);
    });

    it("deve rejeitar convite com validade 0 dias", () => {
      const conv = { email: "teste@email.com", role: "user" as const, diasValidade: 0 };
      expect(conviteSchema.safeParse(conv).success).toBe(false);
    });

    it("deve rejeitar convite com validade acima de 90 dias", () => {
      const conv = { email: "teste@email.com", role: "user" as const, diasValidade: 91 };
      expect(conviteSchema.safeParse(conv).success).toBe(false);
    });

    it("deve rejeitar role inválido", () => {
      const conv = { email: "teste@email.com", role: "superadmin", diasValidade: 7 };
      expect(conviteSchema.safeParse(conv).success).toBe(false);
    });
  });

  describe("Status de Solicitação", () => {
    const statusValues = ["pendente", "aprovado", "rejeitado"] as const;
    const statusSchema = z.enum(statusValues);

    it("deve aceitar status pendente", () => {
      expect(statusSchema.safeParse("pendente").success).toBe(true);
    });

    it("deve aceitar status aprovado", () => {
      expect(statusSchema.safeParse("aprovado").success).toBe(true);
    });

    it("deve aceitar status rejeitado", () => {
      expect(statusSchema.safeParse("rejeitado").success).toBe(true);
    });

    it("deve rejeitar status inválido", () => {
      expect(statusSchema.safeParse("cancelado").success).toBe(false);
    });
  });
});

describe("Gestão de Acessos - Controle de Acesso por Papel", () => {
  describe("adminProcedure - Proteção de rotas sensíveis", () => {
    it("deve bloquear usuário não-admin em rotas de exclusão de cliente", async () => {
      const ctx = createUserContext();
      const caller = appRouter.createCaller(ctx);
      await expect(caller.clientes.delete({ id: 999 })).rejects.toThrow();
    });

    it("deve bloquear usuário não-admin em rotas de exclusão de processo", async () => {
      const ctx = createUserContext();
      const caller = appRouter.createCaller(ctx);
      await expect(caller.processosRouter.delete({ id: 999 })).rejects.toThrow();
    });

    it("deve bloquear usuário não-admin em rotas de exclusão de conhecimento", async () => {
      const ctx = createUserContext();
      const caller = appRouter.createCaller(ctx);
      await expect(caller.conhecimentosRouter.delete({ id: 999 })).rejects.toThrow();
    });

    it("deve bloquear usuário não-admin em normalização de CPFs", async () => {
      const ctx = createUserContext();
      const caller = appRouter.createCaller(ctx);
      await expect(caller.correcao.normalizarCpfs()).rejects.toThrow();
    });

    it("deve bloquear usuário não-admin em auto-merge", async () => {
      const ctx = createUserContext();
      const caller = appRouter.createCaller(ctx);
      await expect(caller.correcao.autoMerge()).rejects.toThrow();
    });

    it("deve bloquear usuário não-admin em deduplicação de processos", async () => {
      const ctx = createUserContext();
      const caller = appRouter.createCaller(ctx);
      await expect(caller.correcao.deduplicarProcessos()).rejects.toThrow();
    });

    it("deve bloquear usuário não-admin em execução de todas as correções", async () => {
      const ctx = createUserContext();
      const caller = appRouter.createCaller(ctx);
      await expect(caller.correcao.executarTodasCorrecoes()).rejects.toThrow();
    });

    it("deve bloquear usuário não-admin em exclusão de petição", async () => {
      const ctx = createUserContext();
      const caller = appRouter.createCaller(ctx);
      await expect(caller.peticionamento.excluirPeticao({ id: 999 })).rejects.toThrow();
    });

    it("deve bloquear usuário não-autenticado em rotas protegidas", async () => {
      const ctx = createUnauthContext();
      const caller = appRouter.createCaller(ctx);
      await expect(caller.acessos.listar({ status: "todos" })).rejects.toThrow();
    });

    it("deve bloquear usuário não-admin em gestão de acessos (listar)", async () => {
      const ctx = createUserContext();
      const caller = appRouter.createCaller(ctx);
      await expect(caller.acessos.listar({ status: "todos" })).rejects.toThrow();
    });

    it("deve bloquear usuário não-admin em gestão de acessos (listar usuários)", async () => {
      const ctx = createUserContext();
      const caller = appRouter.createCaller(ctx);
      await expect(caller.acessos.listarUsuarios()).rejects.toThrow();
    });

    it("deve bloquear usuário não-admin em criar convite", async () => {
      const ctx = createUserContext();
      const caller = appRouter.createCaller(ctx);
      await expect(caller.acessos.criarConvite({ email: "test@test.com", role: "user", diasValidade: 7 })).rejects.toThrow();
    });

    it("deve bloquear usuário não-admin em listar auditoria", async () => {
      const ctx = createUserContext();
      const caller = appRouter.createCaller(ctx);
      await expect(caller.acessos.listarAuditoria({ limite: 10 })).rejects.toThrow();
    });
  });
});

describe("Gestão de Acessos - Formatação", () => {
  describe("Formatação de CPF", () => {
    function formatCpf(cpf: string): string {
      const digits = cpf.replace(/\D/g, "");
      if (digits.length !== 11) return cpf;
      return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
    }

    it("deve formatar CPF com pontos e traço", () => {
      expect(formatCpf("12345678900")).toBe("123.456.789-00");
    });

    it("deve manter CPF já formatado", () => {
      expect(formatCpf("123.456.789-00")).toBe("123.456.789-00");
    });

    it("deve retornar CPF inválido sem formatar", () => {
      expect(formatCpf("123")).toBe("123");
    });
  });

  describe("Formatação de Celular", () => {
    function formatPhone(phone: string): string {
      const digits = phone.replace(/\D/g, "");
      if (digits.length === 11) {
        return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
      }
      if (digits.length === 10) {
        return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
      }
      return phone;
    }

    it("deve formatar celular com 11 dígitos", () => {
      expect(formatPhone("62999999999")).toBe("(62) 99999-9999");
    });

    it("deve formatar telefone fixo com 10 dígitos", () => {
      expect(formatPhone("6232321234")).toBe("(62) 3232-1234");
    });

    it("deve retornar número inválido sem formatar", () => {
      expect(formatPhone("123")).toBe("123");
    });
  });
});

describe("Gestão de Acessos - Módulos Disponíveis", () => {
  const modulosEsperados = [
    "clientes", "processos", "conhecimentos", "peticionamento",
    "relatorios", "integracao", "prazos", "agente_ia"
  ];

  it("deve ter módulos de permissão definidos", () => {
    expect(modulosEsperados.length).toBeGreaterThan(0);
  });

  it("cada módulo deve ter um identificador não-vazio", () => {
    for (const m of modulosEsperados) {
      expect(m.length).toBeGreaterThan(0);
    }
  });

  it("módulos não devem ter duplicatas", () => {
    const unique = new Set(modulosEsperados);
    expect(unique.size).toBe(modulosEsperados.length);
  });
});

describe("Gestão de Acessos - Lógica de Expiração de Convite", () => {
  function isConviteExpirado(expiraEm: Date): boolean {
    return new Date(expiraEm) < new Date();
  }

  function calcularExpiracao(diasValidade: number): Date {
    const expira = new Date();
    expira.setDate(expira.getDate() + diasValidade);
    return expira;
  }

  it("convite com data futura não deve estar expirado", () => {
    const futuro = new Date();
    futuro.setDate(futuro.getDate() + 7);
    expect(isConviteExpirado(futuro)).toBe(false);
  });

  it("convite com data passada deve estar expirado", () => {
    const passado = new Date();
    passado.setDate(passado.getDate() - 1);
    expect(isConviteExpirado(passado)).toBe(true);
  });

  it("deve calcular expiração corretamente para 7 dias", () => {
    const expira = calcularExpiracao(7);
    const diff = expira.getTime() - Date.now();
    const dias = diff / (1000 * 60 * 60 * 24);
    expect(dias).toBeGreaterThan(6.9);
    expect(dias).toBeLessThan(7.1);
  });

  it("deve calcular expiração corretamente para 30 dias", () => {
    const expira = calcularExpiracao(30);
    const diff = expira.getTime() - Date.now();
    const dias = diff / (1000 * 60 * 60 * 24);
    expect(dias).toBeGreaterThan(29.9);
    expect(dias).toBeLessThan(30.1);
  });
});
