/**
 * INTEGRAÇÕES — Melo Advogados
 * 
 * Exporta todas as integrações disponíveis de forma centralizada.
 * Cada integração possui objetivo claro e função automática simples.
 */

// Dados Abertos Goiás — Folha de Pagamento
export {
  consultarFolhaPagamentoGO,
  atualizarDadosClienteViaFolha,
  atualizarTodosServidoresGO,
} from "./dadosAbertosGO";

// DataJud CNJ — Movimentações Processuais
export {
  consultarProcessoDataJud,
  atualizarMovimentacoesProcesso,
  atualizarTodosProcessosDataJud,
  verificarPrazosProcessuais,
} from "./datajudApi";

// Celcoin API — Margem Consignável
export {
  consultarMargemCelcoin,
  consultarContratosCelcoin,
  atualizarMargemCliente,
  isCelcoinConfigurada,
  statusIntegracaoCelcoin,
} from "./celcoinApi";
