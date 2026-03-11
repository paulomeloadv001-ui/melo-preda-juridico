import { describe, it, expect, vi } from "vitest";
import { z } from "zod";

// Schema de validação da solicitação de acesso
const accessRequestSchema = z.object({
  nomeCompleto: z.string().min(3),
  cpf: z.string().min(11),
  email: z.string().email(),
  celular: z.string().min(10),
  motivo: z.string().optional(),
});

describe("Gestão de Acessos", () => {
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
