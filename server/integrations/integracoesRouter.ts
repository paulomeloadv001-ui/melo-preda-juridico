/**
 * ROTAS DE INTEGRAÇÕES — Melo Advogados
 * 
 * Rotas tRPC para acesso às integrações automáticas.
 * Cada rota expõe uma função simples com objetivo claro.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { consultarFolhaPagamentoGO, atualizarDadosClienteViaFolha, atualizarTodosServidoresGO } from "./dadosAbertosGO";
import { consultarProcessoDataJud, atualizarMovimentacoesProcesso, atualizarTodosProcessosDataJud, verificarPrazosProcessuais } from "./datajudApi";
import { consultarMargemCelcoin, consultarContratosCelcoin, atualizarMargemCliente, statusIntegracaoCelcoin } from "./celcoinApi";
import { cronAtualizarFolhaPagamento, cronAtualizarMovimentacoes, cronVerificarPrazos, cronAtualizarMargens, executarTodosCronJobs, getStatusCronJobs, getHistoricoCron } from "../cron/cronJobs";

export const integracoesRouter = router({

  // ==================== STATUS GERAL ====================
  status: protectedProcedure.query(async () => {
    const cronStatus = getStatusCronJobs();
    const celcoinStatus = statusIntegracaoCelcoin();
    return {
      integracoes: {
        dadosAbertosGO: { configurada: true, descricao: "Folha de pagamento pública do Estado de Goiás" },
        datajud: { configurada: !!process.env.DATAJUD_API_KEY, descricao: "Movimentações processuais via CNJ" },
        celcoin: { ...celcoinStatus, descricao: "Margem consignável em tempo real" },
      },
      cronJobs: cronStatus,
    };
  }),

  // ==================== DADOS ABERTOS GO ====================
  folhaGO: router({
    // Consultar servidor na folha pública
    consultar: protectedProcedure
      .input(z.object({ nome: z.string(), cpf: z.string().optional() }))
      .mutation(async ({ input }) => {
        return await consultarFolhaPagamentoGO(input.nome, input.cpf);
      }),

    // Atualizar dados de um cliente específico
    atualizarCliente: protectedProcedure
      .input(z.object({ clienteId: z.number() }))
      .mutation(async ({ input }) => {
        return await atualizarDadosClienteViaFolha(input.clienteId);
      }),

    // Atualizar TODOS os servidores de GO (cron manual)
    atualizarTodos: protectedProcedure.mutation(async () => {
      return await atualizarTodosServidoresGO();
    }),
  }),

  // ==================== DATAJUD CNJ ====================
  datajud: router({
    // Consultar processo no DataJud
    consultarProcesso: protectedProcedure
      .input(z.object({ numeroCNJ: z.string(), tribunal: z.string().optional() }))
      .mutation(async ({ input }) => {
        return await consultarProcessoDataJud(input.numeroCNJ, input.tribunal);
      }),

    // Atualizar movimentações de um processo
    atualizarMovimentacoes: protectedProcedure
      .input(z.object({ processoId: z.number() }))
      .mutation(async ({ input }) => {
        return await atualizarMovimentacoesProcesso(input.processoId);
      }),

    // Atualizar TODOS os processos ativos (cron manual)
    atualizarTodos: protectedProcedure.mutation(async () => {
      return await atualizarTodosProcessosDataJud();
    }),

    // Verificar prazos processuais
    verificarPrazos: protectedProcedure.query(async () => {
      return await verificarPrazosProcessuais();
    }),
  }),

  // ==================== CELCOIN (MARGEM CONSIGNÁVEL) ====================
  margem: router({
    // Consultar margem de um CPF
    consultar: protectedProcedure
      .input(z.object({ cpf: z.string(), matricula: z.string().optional(), convenio: z.string().optional() }))
      .mutation(async ({ input }) => {
        return await consultarMargemCelcoin(input.cpf, input.matricula, input.convenio);
      }),

    // Consultar contratos consignados
    contratos: protectedProcedure
      .input(z.object({ cpf: z.string(), matricula: z.string().optional() }))
      .mutation(async ({ input }) => {
        return await consultarContratosCelcoin(input.cpf, input.matricula);
      }),

    // Atualizar margem de um cliente
    atualizarCliente: protectedProcedure
      .input(z.object({ clienteId: z.number() }))
      .mutation(async ({ input }) => {
        return await atualizarMargemCliente(input.clienteId);
      }),
  }),

  // ==================== CRON JOBS ====================
  cron: router({
    // Status dos cron jobs
    status: protectedProcedure.query(async () => {
      return getStatusCronJobs();
    }),

    // Histórico de execuções
    historico: protectedProcedure.query(async () => {
      return getHistoricoCron();
    }),

    // Executar job individual
    executar: protectedProcedure
      .input(z.object({ job: z.enum(["folha", "movimentacoes", "prazos", "margens", "todos"]) }))
      .mutation(async ({ input }) => {
        switch (input.job) {
          case "folha": return await cronAtualizarFolhaPagamento();
          case "movimentacoes": return await cronAtualizarMovimentacoes();
          case "prazos": return await cronVerificarPrazos();
          case "margens": return await cronAtualizarMargens();
          case "todos": return await executarTodosCronJobs();
        }
      }),
  }),

  // ==================== EXPORTAÇÃO COMPLETA ====================
  exportarBancoCompleto: protectedProcedure.mutation(async () => {
    const { exportarBancoCompleto } = await import("./exportacaoCompleta");
    return await exportarBancoCompleto();
  }),

  exportarConhecimentos: protectedProcedure.mutation(async () => {
    const { exportarBancoConhecimentos } = await import("./exportacaoCompleta");
    return await exportarBancoConhecimentos();
  }),

  relatorioIntegridade: protectedProcedure.query(async () => {
    const { gerarRelatorioIntegridade } = await import("./exportacaoCompleta");
    return await gerarRelatorioIntegridade();
  }),

  exportarPastaCliente: protectedProcedure
    .input(z.object({ clienteId: z.number() }))
    .mutation(async ({ input }) => {
      const { exportarPastaCliente } = await import("./exportacaoCompleta");
      return await exportarPastaCliente(input.clienteId);
    }),

  // ==================== IMPORTAÇÃO GMAIL/PROJUDI ====================
  importarGmailProjudi: protectedProcedure
    .input(z.object({ diasAtras: z.number().default(7) }).optional())
    .mutation(async ({ input }) => {
      const { importarPublicacoesProjudiGmail } = await import("./gmailProjudiImporter");
      return await importarPublicacoesProjudiGmail(input?.diasAtras || 7);
    }),

  statusGmail: protectedProcedure.query(async () => {
    const { statusGmailProjudi } = await import("./gmailProjudiImporter");
    return statusGmailProjudi();
  }),

  // ==================== STATUS GERAL INTEGRAÇÕES ====================
  statusIntegracoes: protectedProcedure.query(async () => {
    const { statusGmailProjudi } = await import("./gmailProjudiImporter");
    const { gerarRelatorioIntegridade } = await import("./exportacaoCompleta");
    const cronStatus = getStatusCronJobs();
    const celcoinStatus = statusIntegracaoCelcoin();
    const gmailStatus = statusGmailProjudi();
    const integridade = await gerarRelatorioIntegridade();
    return { cronStatus, celcoinStatus, gmailStatus, integridade };
  }),
});
