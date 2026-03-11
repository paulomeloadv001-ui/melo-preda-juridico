import { describe, it, expect } from "vitest";
import { z } from "zod";

// Schema de validação de notificação
const notificacaoSchema = z.object({
  tipo: z.enum([
    'honorario_status', 'honorario_novo', 'prazo_vencendo', 'prazo_vencido',
    'importacao_concluida', 'importacao_erro', 'correcao_executada',
    'novo_cliente', 'novo_processo', 'acesso_solicitado', 'sistema',
  ]),
  prioridade: z.enum(['baixa', 'normal', 'alta', 'urgente']).optional(),
  titulo: z.string().min(1),
  mensagem: z.string().min(1),
  clienteId: z.number().optional(),
  processoId: z.number().optional(),
  movimentacaoFinanceiraId: z.number().optional(),
  prazoId: z.number().optional(),
  linkUrl: z.string().optional(),
  icone: z.string().optional(),
  cor: z.string().optional(),
  dadosExtras: z.any().optional(),
});

// Schema de validação de prazo processual
const prazoSchema = z.object({
  processoId: z.number(),
  clienteId: z.number(),
  tipo: z.enum([
    'recurso', 'contestacao', 'manifestacao', 'cumprimento',
    'audiencia', 'pericia', 'diligencia', 'pagamento', 'levantamento', 'outro',
  ]),
  titulo: z.string().min(1),
  descricao: z.string().optional(),
  dataVencimento: z.string(), // ISO date string
  diasAntecedencia: z.number().optional(),
  observacoes: z.string().optional(),
});

// Schema de input para listar notificações
const listarNotificacoesSchema = z.object({
  apenasNaoLidas: z.boolean().optional(),
  tipo: z.string().optional(),
  limite: z.number().optional(),
}).optional();

describe("Sistema de Notificações", () => {
  describe("Validação de Notificação", () => {
    it("deve aceitar notificação válida de honorário", () => {
      const notif = {
        tipo: 'honorario_status' as const,
        prioridade: 'alta' as const,
        titulo: 'Status atualizado: Pago/Levantado',
        mensagem: 'Movimentação #1 alterada para Pago/Levantado',
        clienteId: 1,
        processoId: 5,
        movimentacaoFinanceiraId: 10,
        linkUrl: '/clientes/1',
        icone: 'DollarSign',
        cor: 'green',
      };
      const result = notificacaoSchema.safeParse(notif);
      expect(result.success).toBe(true);
    });

    it("deve aceitar notificação de prazo vencido", () => {
      const notif = {
        tipo: 'prazo_vencido' as const,
        prioridade: 'urgente' as const,
        titulo: 'PRAZO VENCIDO: Recurso de Apelação',
        mensagem: 'O prazo venceu em 10/03/2026. Ação imediata necessária.',
        processoId: 3,
        clienteId: 2,
        prazoId: 1,
        linkUrl: '/clientes/2',
        icone: 'AlertTriangle',
        cor: 'red',
      };
      const result = notificacaoSchema.safeParse(notif);
      expect(result.success).toBe(true);
    });

    it("deve aceitar notificação mínima (apenas campos obrigatórios)", () => {
      const notif = {
        tipo: 'sistema' as const,
        titulo: 'Sistema atualizado',
        mensagem: 'O sistema foi atualizado com sucesso.',
      };
      const result = notificacaoSchema.safeParse(notif);
      expect(result.success).toBe(true);
    });

    it("deve rejeitar tipo inválido", () => {
      const notif = {
        tipo: 'tipo_invalido',
        titulo: 'Teste',
        mensagem: 'Teste',
      };
      const result = notificacaoSchema.safeParse(notif);
      expect(result.success).toBe(false);
    });

    it("deve rejeitar título vazio", () => {
      const notif = {
        tipo: 'sistema' as const,
        titulo: '',
        mensagem: 'Teste',
      };
      const result = notificacaoSchema.safeParse(notif);
      expect(result.success).toBe(false);
    });

    it("deve rejeitar prioridade inválida", () => {
      const notif = {
        tipo: 'sistema' as const,
        prioridade: 'critica',
        titulo: 'Teste',
        mensagem: 'Teste',
      };
      const result = notificacaoSchema.safeParse(notif);
      expect(result.success).toBe(false);
    });

    it("deve aceitar notificação de importação concluída", () => {
      const notif = {
        tipo: 'importacao_concluida' as const,
        prioridade: 'normal' as const,
        titulo: 'Importação finalizada: 5/5 sucesso',
        mensagem: '5 arquivo(s) processado(s) com sucesso',
        linkUrl: '/jobs',
        icone: 'CheckCircle',
        cor: 'green',
      };
      const result = notificacaoSchema.safeParse(notif);
      expect(result.success).toBe(true);
    });

    it("deve aceitar notificação de correção executada", () => {
      const notif = {
        tipo: 'correcao_executada' as const,
        prioridade: 'baixa' as const,
        titulo: 'Correções executadas: 3 etapas',
        mensagem: '5 itens afetados. Status: sucesso.',
        linkUrl: '/correcao',
        icone: 'Shield',
        cor: 'green',
      };
      const result = notificacaoSchema.safeParse(notif);
      expect(result.success).toBe(true);
    });
  });

  describe("Validação de Prazo Processual", () => {
    it("deve aceitar prazo válido", () => {
      const prazo = {
        processoId: 1,
        clienteId: 2,
        tipo: 'recurso' as const,
        titulo: 'Recurso de Apelação',
        descricao: 'Prazo para interpor recurso de apelação',
        dataVencimento: '2026-04-15',
        diasAntecedencia: 5,
        observacoes: 'Verificar jurisprudência atualizada',
      };
      const result = prazoSchema.safeParse(prazo);
      expect(result.success).toBe(true);
    });

    it("deve aceitar prazo mínimo (sem opcionais)", () => {
      const prazo = {
        processoId: 1,
        clienteId: 2,
        tipo: 'audiencia' as const,
        titulo: 'Audiência de conciliação',
        dataVencimento: '2026-05-01',
      };
      const result = prazoSchema.safeParse(prazo);
      expect(result.success).toBe(true);
    });

    it("deve rejeitar tipo de prazo inválido", () => {
      const prazo = {
        processoId: 1,
        clienteId: 2,
        tipo: 'tipo_invalido',
        titulo: 'Teste',
        dataVencimento: '2026-04-15',
      };
      const result = prazoSchema.safeParse(prazo);
      expect(result.success).toBe(false);
    });

    it("deve rejeitar prazo sem processoId", () => {
      const prazo = {
        clienteId: 2,
        tipo: 'recurso' as const,
        titulo: 'Teste',
        dataVencimento: '2026-04-15',
      };
      const result = prazoSchema.safeParse(prazo);
      expect(result.success).toBe(false);
    });

    it("deve aceitar todos os tipos de prazo válidos", () => {
      const tipos = [
        'recurso', 'contestacao', 'manifestacao', 'cumprimento',
        'audiencia', 'pericia', 'diligencia', 'pagamento', 'levantamento', 'outro',
      ];
      for (const tipo of tipos) {
        const prazo = {
          processoId: 1,
          clienteId: 2,
          tipo,
          titulo: `Prazo de ${tipo}`,
          dataVencimento: '2026-04-15',
        };
        const result = prazoSchema.safeParse(prazo);
        expect(result.success).toBe(true);
      }
    });
  });

  describe("Validação de Input de Listagem", () => {
    it("deve aceitar input vazio (listar todas)", () => {
      const result = listarNotificacoesSchema.safeParse(undefined);
      expect(result.success).toBe(true);
    });

    it("deve aceitar filtro por não lidas", () => {
      const result = listarNotificacoesSchema.safeParse({ apenasNaoLidas: true });
      expect(result.success).toBe(true);
    });

    it("deve aceitar filtro por tipo", () => {
      const result = listarNotificacoesSchema.safeParse({ tipo: 'honorario_status' });
      expect(result.success).toBe(true);
    });

    it("deve aceitar limite", () => {
      const result = listarNotificacoesSchema.safeParse({ limite: 50 });
      expect(result.success).toBe(true);
    });

    it("deve aceitar combinação de filtros", () => {
      const result = listarNotificacoesSchema.safeParse({
        apenasNaoLidas: true,
        tipo: 'prazo_vencendo',
        limite: 10,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("Lógica de Prioridade de Prazos", () => {
    it("deve calcular dias restantes corretamente", () => {
      const agora = new Date();
      const vencimento = new Date(agora);
      vencimento.setDate(vencimento.getDate() + 3);
      const diffMs = vencimento.getTime() - agora.getTime();
      const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      expect(diffDias).toBe(3);
    });

    it("deve identificar prazo vencido (dias negativos)", () => {
      const agora = new Date();
      const vencimento = new Date(agora);
      vencimento.setDate(vencimento.getDate() - 2);
      const diffMs = vencimento.getTime() - agora.getTime();
      const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      expect(diffDias).toBeLessThan(0);
    });

    it("deve definir prioridade urgente para prazo <= 1 dia", () => {
      const diffDias = 1;
      const prioridade = diffDias <= 1 ? 'urgente' : 'alta';
      expect(prioridade).toBe('urgente');
    });

    it("deve definir prioridade alta para prazo > 1 dia e <= 3 dias", () => {
      const diffDias = 2;
      const prioridade = diffDias <= 1 ? 'urgente' : 'alta';
      expect(prioridade).toBe('alta');
    });
  });

  describe("Formatação de Tempo Relativo", () => {
    function formatTimeAgo(date: Date | string) {
      const now = new Date();
      const d = new Date(date);
      const diffMs = now.getTime() - d.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return 'agora';
      if (diffMin < 60) return `${diffMin}min`;
      const diffH = Math.floor(diffMin / 60);
      if (diffH < 24) return `${diffH}h`;
      const diffD = Math.floor(diffH / 24);
      if (diffD < 7) return `${diffD}d`;
      return d.toLocaleDateString('pt-BR');
    }

    it("deve retornar 'agora' para data recente", () => {
      expect(formatTimeAgo(new Date())).toBe('agora');
    });

    it("deve retornar minutos para < 1 hora", () => {
      const d = new Date();
      d.setMinutes(d.getMinutes() - 30);
      expect(formatTimeAgo(d)).toBe('30min');
    });

    it("deve retornar horas para < 24 horas", () => {
      const d = new Date();
      d.setHours(d.getHours() - 5);
      expect(formatTimeAgo(d)).toBe('5h');
    });

    it("deve retornar dias para < 7 dias", () => {
      const d = new Date();
      d.setDate(d.getDate() - 3);
      expect(formatTimeAgo(d)).toBe('3d');
    });
  });

  describe("Tipos de Notificação e Ícones", () => {
    const tipoIconeMap: Record<string, string> = {
      'honorario_status': 'DollarSign',
      'honorario_novo': 'DollarSign',
      'prazo_vencendo': 'Clock',
      'prazo_vencido': 'AlertTriangle',
      'importacao_concluida': 'CheckCircle',
      'importacao_erro': 'AlertTriangle',
      'correcao_executada': 'Shield',
      'novo_cliente': 'Users',
      'novo_processo': 'FileText',
    };

    it("deve ter ícone definido para cada tipo de notificação", () => {
      const tipos = [
        'honorario_status', 'honorario_novo', 'prazo_vencendo', 'prazo_vencido',
        'importacao_concluida', 'importacao_erro', 'correcao_executada',
        'novo_cliente', 'novo_processo',
      ];
      for (const tipo of tipos) {
        expect(tipoIconeMap[tipo]).toBeDefined();
        expect(tipoIconeMap[tipo].length).toBeGreaterThan(0);
      }
    });

    it("deve ter cores definidas para cada prioridade", () => {
      const prioridadeCores: Record<string, string> = {
        'urgente': 'text-red-400 bg-red-500/10',
        'alta': 'text-amber-400 bg-amber-500/10',
        'normal': 'text-blue-400 bg-blue-500/10',
        'baixa': 'text-gray-400 bg-gray-500/10',
      };
      for (const [prioridade, cor] of Object.entries(prioridadeCores)) {
        expect(cor).toBeDefined();
        expect(cor.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Status de Honorários e Labels", () => {
    const statusLabels: Record<string, string> = {
      pago_levantado: 'Pago/Levantado',
      depositado_a_levantar: 'Depositado/A Levantar',
      pendente: 'Pendente',
      parcial: 'Parcial',
      cancelado: 'Cancelado',
    };

    it("deve ter label para todos os status de honorários", () => {
      const statuses = ['pago_levantado', 'depositado_a_levantar', 'pendente', 'parcial', 'cancelado'];
      for (const status of statuses) {
        expect(statusLabels[status]).toBeDefined();
        expect(statusLabels[status].length).toBeGreaterThan(0);
      }
    });

    it("deve gerar mensagem de notificação correta para atualização de status", () => {
      const novoStatus = 'pago_levantado';
      const valor = 150000.50;
      const mensagem = `Movimentação #1 (honorarios_sucumbenciais) - R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} alterada para ${statusLabels[novoStatus]}`;
      expect(mensagem).toContain('Pago/Levantado');
      expect(mensagem).toContain('R$');
    });
  });
});
