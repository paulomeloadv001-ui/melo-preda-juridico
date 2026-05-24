/**
 * EXTRATOR DE CONTRACHEQUE — Módulo Centralizado
 * 
 * Contém a lógica de extração de dados de contracheque via IA.
 * Usado tanto pela rota direta (uploadContracheque) quanto pelo job assíncrono.
 * Elimina a duplicação de código no routers.ts.
 * 
 * Fluxo:
 * 1. Recebe buffer do PDF
 * 2. Extrai texto via pdf-parse
 * 3. Envia para LLM com prompt especializado
 * 4. Retorna dados estruturados (nome, CPF, remuneração, empréstimos, margem)
 */
import { invokeLLM } from "../_core/llm";

// ==================== INTERFACES ====================
export interface DadosContracheque {
  nomeServidor: string;
  cpf: string;
  matricula: string;
  orgao: string;
  cargo: string;
  vinculoFuncional: string;
  mesReferencia: string;
  remuneracaoBruta: number;
  remuneracaoLiquida: number;
  totalDescontos: number;
  margemConsignavelPerc: number;
  margemConsignavelValor: number;
  totalConsignacoes: number;
  margemDisponivel: number;
  emprestimosConsignados: EmprestimoExtraido[];
  outrosDescontos: DescontoExtraido[];
  observacoes: string;
}

export interface EmprestimoExtraido {
  banco: string;
  contrato: string;
  valorParcela: number;
  parcelasRestantes: number;
  parcelasTotal: number;
}

export interface DescontoExtraido {
  descricao: string;
  valor: number;
  tipo: string;
}

export interface ResultadoExtracao {
  sucesso: boolean;
  dados: DadosContracheque | null;
  textoExtraido: string;
  erro?: string;
}

// ==================== PROMPT DE EXTRAÇÃO ====================
const PROMPT_EXTRACAO = `Você é um assistente especializado em análise de contracheques e demonstrativos de pagamento de servidores públicos brasileiros.
Analise o texto extraído de um contracheque/demonstrativo de pagamento e extraia TODOS os dados financeiros detalhados.

REGRAS IMPORTANTES:
- Identifique o NOME COMPLETO e CPF do servidor/beneficiário
- Extraia TODOS os valores de remuneração (bruta, líquida, descontos)
- Identifique TODOS os empréstimos consignados (banco, contrato, parcela, total parcelas)
- Calcule a margem consignável (35% do líquido para servidores GO, 30% para federais)
- Se não encontrar algum dado, use null (não invente)
- Valores monetários devem ser números (sem R$ ou pontos de milhar)

Retorne EXCLUSIVAMENTE um JSON válido com esta estrutura:
{
  "nomeServidor": "NOME COMPLETO",
  "cpf": "000.000.000-00",
  "matricula": "123456",
  "orgao": "Nome do Órgão",
  "cargo": "Cargo do Servidor",
  "vinculoFuncional": "Efetivo|Comissionado|Temporário|Aposentado|Pensionista",
  "mesReferencia": "MM/AAAA",
  "remuneracaoBruta": 0.00,
  "remuneracaoLiquida": 0.00,
  "totalDescontos": 0.00,
  "margemConsignavelPerc": 35,
  "margemConsignavelValor": 0.00,
  "totalConsignacoes": 0.00,
  "margemDisponivel": 0.00,
  "emprestimosConsignados": [
    {
      "banco": "Nome do Banco",
      "contrato": "Número do Contrato",
      "valorParcela": 0.00,
      "parcelasRestantes": 0,
      "parcelasTotal": 0
    }
  ],
  "outrosDescontos": [
    {
      "descricao": "Descrição do desconto",
      "valor": 0.00,
      "tipo": "obrigatorio|facultativo|judicial"
    }
  ],
  "observacoes": "Qualquer observação relevante"
}`;

// ==================== FUNÇÃO PRINCIPAL ====================

/**
 * Extrair dados de um contracheque a partir do buffer PDF
 */
export async function extrairDadosContracheque(pdfBuffer: Buffer): Promise<ResultadoExtracao> {
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
      erro: 'Não foi possível extrair texto do contracheque. O PDF pode ser uma imagem escaneada.',
    };
  }

  // 2. Enviar para LLM
  try {
    const result = await invokeLLM({
      messages: [
        { role: 'system', content: PROMPT_EXTRACAO },
        { role: 'user', content: `Analise este contracheque:\n\n${textoExtraido.substring(0, 15000)}` },
      ],
    });

    const rawContent = result.choices?.[0]?.message?.content || '';
    const content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
    
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

    const dados = JSON.parse(jsonMatch[0]) as DadosContracheque;

    // 4. Validar e calcular campos derivados
    if (dados.remuneracaoLiquida && !dados.margemConsignavelValor) {
      dados.margemConsignavelPerc = dados.margemConsignavelPerc || 35;
      dados.margemConsignavelValor = dados.remuneracaoLiquida * (dados.margemConsignavelPerc / 100);
    }

    if (dados.margemConsignavelValor && dados.totalConsignacoes !== undefined) {
      dados.margemDisponivel = dados.margemConsignavelValor - dados.totalConsignacoes;
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
 * Extrair apenas o texto de um PDF (sem análise IA)
 */
export async function extrairTextoPDF(pdfBuffer: Buffer): Promise<string> {
  try {
    const pdfParse = (await import('pdf-parse') as any).default || (await import('pdf-parse'));
    const pdfData = await pdfParse(pdfBuffer);
    return pdfData.text || '';
  } catch {
    return '';
  }
}
