/**
 * SERVIÇOS — Melo Advogados
 * 
 * Exporta todos os serviços de forma centralizada.
 * Cada serviço encapsula a lógica de negócio de um domínio específico.
 */

// Serviço de Contracheque
export { processarContracheque } from "./contrachequeService";
export type { ResultadoContracheque } from "./contrachequeService";

// Serviço de Processo
export { processarProcessoPdf } from "./processoService";
export type { ResultadoProcessamento } from "./processoService";

// Extrator de Contracheque (centralizado — elimina duplicação)
export { extrairDadosContracheque, extrairTextoPDF } from "./contrachequeExtractor";
export type { DadosContracheque, ResultadoExtracao } from "./contrachequeExtractor";

// Extrator de Processo (centralizado — elimina duplicação)
export { extrairDadosProcesso, identificarTipoDocumento } from "./processoExtractor";
export type { DadosProcesso, ResultadoExtracaoProcesso } from "./processoExtractor";
