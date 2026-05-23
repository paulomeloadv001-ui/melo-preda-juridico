/**
 * UTILITÁRIO — Cálculo de Margem Consignável
 * 
 * Centraliza todas as regras de cálculo de margem consignável
 * conforme legislação aplicável:
 * 
 * - Servidores Estaduais GO: 35% (Lei Estadual 16.898/2010)
 * - Servidores Federais: 35% (Lei 10.820/2003 + MP 1.132/2022)
 * - Aposentados/Pensionistas INSS: 35% + 5% cartão (Lei 14.131/2021)
 * - Servidores Municipais: varia por município (padrão 30%)
 */

// ==================== INTERFACES ====================
export interface ParametrosMargem {
  remuneracaoLiquida: number;
  vinculoFuncional: string; // Efetivo, Comissionado, Aposentado, Pensionista
  orgao: string;
  uf: string;
}

export interface ResultadoCalculoMargem {
  percentualMargem: number;
  margemTotal: number;
  legislacao: string;
  observacao: string;
}

export interface AnaliseEmprestimo {
  margemTotal: number;
  margemUtilizada: number;
  margemDisponivel: number;
  margemExcedida: boolean;
  valorExcedente: number;
  scoreRisco: "Baixo" | "Medio" | "Alto";
  aptoNovoEmprestimo: boolean;
  capacidadeNovaParcela: number;
  recomendacao: string;
}

// ==================== REGRAS DE MARGEM ====================

/**
 * Determinar percentual de margem conforme legislação
 */
export function determinarPercentualMargem(params: ParametrosMargem): ResultadoCalculoMargem {
  const { vinculoFuncional, orgao, uf } = params;
  const orgaoLower = orgao.toLowerCase();
  const vinculo = vinculoFuncional?.toLowerCase() || '';

  // Aposentados/Pensionistas INSS
  if (vinculo.includes('aposentado') || vinculo.includes('pensionista')) {
    if (orgaoLower.includes('inss') || orgaoLower.includes('previdência social')) {
      return {
        percentualMargem: 35,
        margemTotal: params.remuneracaoLiquida * 0.35,
        legislacao: "Lei 14.131/2021 (INSS) + 5% cartão consignado",
        observacao: "Margem de 35% para empréstimos + 5% adicional para cartão consignado",
      };
    }
    // Aposentados estaduais (GOIASPREV)
    if (orgaoLower.includes('goiasprev') || uf === 'GO') {
      return {
        percentualMargem: 35,
        margemTotal: params.remuneracaoLiquida * 0.35,
        legislacao: "Lei Estadual 16.898/2010 (GO) + Decreto 10.372/2023",
        observacao: "Margem de 35% para aposentados/pensionistas do Estado de Goiás",
      };
    }
  }

  // Servidores Estaduais de Goiás
  if (uf === 'GO' || orgaoLower.includes('goiás') || orgaoLower.includes('goias') || orgaoLower.includes('sead')) {
    return {
      percentualMargem: 35,
      margemTotal: params.remuneracaoLiquida * 0.35,
      legislacao: "Lei Estadual 16.898/2010 (GO) + Decreto 10.372/2023",
      observacao: "Margem de 35% do líquido para servidores do Estado de Goiás",
    };
  }

  // Servidores Federais
  if (orgaoLower.includes('federal') || orgaoLower.includes('união') || orgaoLower.includes('siape')) {
    return {
      percentualMargem: 35,
      margemTotal: params.remuneracaoLiquida * 0.35,
      legislacao: "Lei 10.820/2003 + MP 1.132/2022",
      observacao: "Margem de 35% para servidores federais (SIAPE)",
    };
  }

  // Servidores Municipais (padrão conservador)
  if (orgaoLower.includes('municipal') || orgaoLower.includes('prefeitura')) {
    return {
      percentualMargem: 30,
      margemTotal: params.remuneracaoLiquida * 0.30,
      legislacao: "Legislação municipal (padrão 30%)",
      observacao: "Margem de 30% — verificar legislação específica do município",
    };
  }

  // Default: 35% (padrão mais comum)
  return {
    percentualMargem: 35,
    margemTotal: params.remuneracaoLiquida * 0.35,
    legislacao: "Lei 10.820/2003 (padrão geral)",
    observacao: "Margem padrão de 35% — verificar legislação específica do órgão",
  };
}

/**
 * Analisar situação financeira completa do cliente para empréstimos
 */
export function analisarCapacidadeEmprestimo(
  remuneracaoLiquida: number,
  percentualMargem: number,
  totalConsignacoes: number
): AnaliseEmprestimo {
  const margemTotal = remuneracaoLiquida * (percentualMargem / 100);
  const margemDisponivel = margemTotal - totalConsignacoes;
  const margemExcedida = margemDisponivel < 0;
  const valorExcedente = margemExcedida ? Math.abs(margemDisponivel) : 0;

  // Score de risco
  let scoreRisco: "Baixo" | "Medio" | "Alto";
  if (margemExcedida) {
    scoreRisco = "Alto";
  } else if (margemDisponivel < margemTotal * 0.1) {
    scoreRisco = "Medio";
  } else {
    scoreRisco = "Baixo";
  }

  // Capacidade para nova parcela (com margem de segurança de 5%)
  const capacidadeNovaParcela = margemExcedida ? 0 : margemDisponivel * 0.95;

  // Recomendação
  let recomendacao: string;
  if (margemExcedida) {
    recomendacao = `MARGEM EXCEDIDA em R$ ${valorExcedente.toFixed(2)}. Recomenda-se ação de revisão/renegociação de contratos ou ação judicial para redução de juros abusivos.`;
  } else if (scoreRisco === "Medio") {
    recomendacao = `Margem quase esgotada (R$ ${margemDisponivel.toFixed(2)} disponível). Avaliar portabilidade para reduzir parcelas antes de novo empréstimo.`;
  } else {
    recomendacao = `Margem saudável: R$ ${margemDisponivel.toFixed(2)} disponível para novas consignações. Capacidade máxima de parcela: R$ ${capacidadeNovaParcela.toFixed(2)}.`;
  }

  return {
    margemTotal,
    margemUtilizada: totalConsignacoes,
    margemDisponivel,
    margemExcedida,
    valorExcedente,
    scoreRisco,
    aptoNovoEmprestimo: !margemExcedida && margemDisponivel > 100,
    capacidadeNovaParcela,
    recomendacao,
  };
}

/**
 * Calcular economia potencial com portabilidade de empréstimo
 */
export function calcularEconomiaPortabilidade(
  saldoDevedor: number,
  taxaAtual: number, // % ao mês
  taxaNova: number, // % ao mês
  parcelasRestantes: number
): {
  parcelaAtual: number;
  parcelaNova: number;
  economiaMensal: number;
  economiaTotal: number;
  percentualEconomia: number;
} {
  // Cálculo de parcela usando tabela Price
  const calcParcela = (saldo: number, taxa: number, n: number) => {
    if (taxa === 0) return saldo / n;
    const fator = Math.pow(1 + taxa / 100, n);
    return saldo * (taxa / 100 * fator) / (fator - 1);
  };

  const parcelaAtual = calcParcela(saldoDevedor, taxaAtual, parcelasRestantes);
  const parcelaNova = calcParcela(saldoDevedor, taxaNova, parcelasRestantes);
  const economiaMensal = parcelaAtual - parcelaNova;
  const economiaTotal = economiaMensal * parcelasRestantes;
  const percentualEconomia = (economiaMensal / parcelaAtual) * 100;

  return {
    parcelaAtual,
    parcelaNova,
    economiaMensal,
    economiaTotal,
    percentualEconomia,
  };
}
