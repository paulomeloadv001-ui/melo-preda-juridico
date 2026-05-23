/**
 * EXTRATOR DE PROCESSO — Módulo Centralizado
 * 
 * Contém a lógica de extração de dados de processos judiciais via IA.
 * Usado tanto pela rota direta (importação) quanto pelo job assíncrono.
 * Elimina a duplicação de código no routers.ts.
 * 
 * Fluxo:
 * 1. Recebe buffer do PDF do processo
 * 2. Extrai texto via pdf-parse
 * 3. Envia para LLM com prompt especializado
 * 4. Retorna dados estruturados (partes, valores, movimentações, etc.)
 */
import { invokeLLM } from "../_core/llm";

// ==================== INTERFACES ====================
export interface DadosProcesso {
  numeroCnj: string;
  tribunal: string;
  vara: string;
  comarca: string;
  tipoAcao: string;
  faseAtual: string;
  valorCausa: number;
  dataDistribuicao: string;
  poloAtivo: ParteProcessual[];
  poloPassivo: ParteProcessual[];
  advogados: AdvogadoProcessual[];
  objetoAcao: string;
  pedidos: string[];
  movimentacoes: MovimentacaoExtraida[];
  decisoes: string[];
  sentenca: string | null;
  honorarios: HonorariosExtraidos | null;
}

export interface ParteProcessual {
  nome: string;
  cpfCnpj: string;
  tipo: string;
  qualificacao: string;
}

export interface AdvogadoProcessual {
  nome: string;
  oab: string;
  polo: string;
}

export interface MovimentacaoExtraida {
  data: string;
  evento: string;
  descricao: string;
}

export interface HonorariosExtraidos {
  tipo: string;
  percentual: number;
  valorBase: number;
  valorCalculado: number;
}

export interface ResultadoExtracaoProcesso {
  sucesso: boolean;
  dados: DadosProcesso | null;
  textoExtraido: string;
  erro?: string;
}

// ==================== PROMPT DE EXTRAÇÃO ====================
const PROMPT_EXTRACAO_PROCESSO = `Você é um assistente jurídico especializado em análise de processos judiciais brasileiros.
Analise o texto extraído de um processo judicial e extraia TODOS os dados relevantes.

REGRAS IMPORTANTES:
- Identifique o número CNJ completo (NNNNNNN-DD.AAAA.J.TR.OOOO)
- Extraia TODAS as partes (polo ativo e passivo) com CPF/CNPJ quando disponível
- Identifique o tipo de ação, vara, comarca e tribunal
- Extraia valor da causa, data de distribuição
- Liste todas as movimentações com data e descrição
- Identifique sentença, decisões e honorários quando presentes
- Se não encontrar algum dado, use null (não invente)

Retorne EXCLUSIVAMENTE um JSON válido com esta estrutura:
{
  "numeroCnj": "NNNNNNN-DD.AAAA.J.TR.OOOO",
  "tribunal": "TJGO|TRT18|TRF1|etc",
  "vara": "1ª Vara Cível",
  "comarca": "Goiânia",
  "tipoAcao": "Procedimento Comum|Execução|etc",
  "faseAtual": "Conhecimento|Execução|Recurso|Cumprimento de Sentença",
  "valorCausa": 0.00,
  "dataDistribuicao": "YYYY-MM-DD",
  "poloAtivo": [
    {"nome": "Nome", "cpfCnpj": "000.000.000-00", "tipo": "Autor", "qualificacao": "Servidor Público"}
  ],
  "poloPassivo": [
    {"nome": "Nome", "cpfCnpj": "00.000.000/0000-00", "tipo": "Réu", "qualificacao": "Instituição Financeira"}
  ],
  "advogados": [
    {"nome": "Nome do Advogado", "oab": "GO 40.559", "polo": "Autor"}
  ],
  "objetoAcao": "Descrição do objeto da ação",
  "pedidos": ["Pedido 1", "Pedido 2"],
  "movimentacoes": [
    {"data": "YYYY-MM-DD", "evento": "Tipo do evento", "descricao": "Detalhes"}
  ],
  "decisoes": ["Texto da decisão 1"],
  "sentenca": "Texto resumido da sentença ou null",
  "honorarios": {
    "tipo": "sucumbenciais|contratuais",
    "percentual": 10,
    "valorBase": 0.00,
    "valorCalculado": 0.00
  }
}`;

// ==================== FUNÇÃO PRINCIPAL ====================

/**
 * Extrair dados de um processo judicial a partir do buffer PDF
 */
export async function extrairDadosProcesso(pdfBuffer: Buffer): Promise<ResultadoExtracaoProcesso> {
  // 1. Extrair texto do PDF
  let textoExtraido = '';
  try {
    const pdfParse = (await import('pdf-parse') as any).default || (await import('pdf-parse'));
    const pdfData = await pdfParse(pdfBuffer);
    textoExtraido = pdfData.text || '';
  } catch (e: any) {
    return {
      sucesso: false,
      dados: null,
      textoExtraido: '',
      erro: `Erro ao extrair texto do PDF: ${e.message}`,
    };
  }

  if (!textoExtraido.trim()) {
    return {
      sucesso: false,
      dados: null,
      textoExtraido: '',
      erro: 'Não foi possível extrair texto do processo. O PDF pode ser uma imagem escaneada.',
    };
  }

  // 2. Enviar para LLM (dividir em chunks se muito grande)
  try {
    const textoParaAnalise = textoExtraido.substring(0, 30000); // Limitar para não estourar contexto
    
    const result = await invokeLLM({
      messages: [
        { role: 'system', content: PROMPT_EXTRACAO_PROCESSO },
        { role: 'user', content: `Analise este processo judicial:\n\n${textoParaAnalise}` },
      ],
    });

    const content = result.choices?.[0]?.message?.content || '';
    
    // 3. Parsear JSON da resposta
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        sucesso: false,
        dados: null,
        textoExtraido,
        erro: 'LLM não retornou JSON válido',
      };
    }

    const dados = JSON.parse(jsonMatch[0]) as DadosProcesso;

    // 4. Validar número CNJ
    if (dados.numeroCnj) {
      // Normalizar formato
      const numLimpo = dados.numeroCnj.replace(/[.\-\/]/g, '');
      if (numLimpo.length === 20) {
        dados.numeroCnj = `${numLimpo.slice(0,7)}-${numLimpo.slice(7,9)}.${numLimpo.slice(9,13)}.${numLimpo.slice(13,14)}.${numLimpo.slice(14,16)}.${numLimpo.slice(16,20)}`;
      }
    }

    return {
      sucesso: true,
      dados,
      textoExtraido,
    };

  } catch (e: any) {
    return {
      sucesso: false,
      dados: null,
      textoExtraido,
      erro: `Erro na análise IA: ${e.message}`,
    };
  }
}

/**
 * Identificar tipo de documento jurídico (processo, petição, sentença, etc.)
 */
export function identificarTipoDocumento(texto: string): string {
  const textoLower = texto.toLowerCase();
  
  if (textoLower.includes('sentença') && textoLower.includes('julgo')) return 'Sentença';
  if (textoLower.includes('acórdão') || textoLower.includes('acordão')) return 'Acórdão';
  if (textoLower.includes('agravo de instrumento')) return 'Agravo de Instrumento';
  if (textoLower.includes('apelação')) return 'Apelação';
  if (textoLower.includes('cumprimento de sentença')) return 'Cumprimento de Sentença';
  if (textoLower.includes('execução')) return 'Execução';
  if (textoLower.includes('petição inicial') || textoLower.includes('exordial')) return 'Petição Inicial';
  if (textoLower.includes('contestação')) return 'Contestação';
  if (textoLower.includes('embargos')) return 'Embargos';
  if (textoLower.includes('intimação')) return 'Intimação';
  if (textoLower.includes('despacho')) return 'Despacho';
  if (textoLower.includes('decisão interlocutória')) return 'Decisão Interlocutória';
  
  return 'Processo Judicial';
}
