/**
 * INTEGRAÇÃO — Dados Abertos Goiás (Folha de Pagamento)
 * 
 * Objetivo: Consultar automaticamente a folha de pagamento pública
 * do Estado de Goiás para validar dados de remuneração de servidores.
 * 
 * Fonte: https://dadosabertos.go.gov.br/dataset/folha-de-pagamento
 * Formato: CSV mensal
 * Campos: Nome, Cargo, Órgão, Valor Bruto, Descontos, Valor Líquido
 */
import { getDb } from "../db";
import { clientes, dadosFinanceiros } from "../../drizzle/schema";
import { eq, like } from "drizzle-orm";

// ==================== CONFIGURAÇÃO ====================
const BASE_URL = "https://dadosabertos.go.gov.br/dataset/9cec56e2-8e10-472f-b060-d925ba3b29b5/resource";

// URLs dos recursos mais recentes (atualizar mensalmente via cron)
function getUrlFolhaMensal(ano: number, mes: number): string {
  const mesStr = String(mes).padStart(2, '0');
  return `${BASE_URL}/folhapagamento_${ano}${mesStr}.csv`;
}

// ==================== INTERFACES ====================
export interface ServidorFolha {
  nome: string;
  cargo: string;
  orgao: string;
  valorBruto: number;
  descontos: number;
  valorLiquido: number;
  mesReferencia: string;
}

export interface ResultadoConsultaFolha {
  encontrado: boolean;
  servidor?: ServidorFolha;
  margemCalculada?: number;
  fonte: string;
  dataConsulta: string;
}

// ==================== FUNÇÕES PRINCIPAIS ====================

/**
 * Buscar servidor na folha de pagamento pública de Goiás
 * Faz download do CSV mais recente e busca pelo nome do servidor
 */
export async function consultarFolhaPagamentoGO(
  nomeServidor: string,
  cpf?: string
): Promise<ResultadoConsultaFolha> {
  const agora = new Date();
  const ano = agora.getFullYear();
  // Buscar mês anterior (folha geralmente disponível com 1-2 meses de atraso)
  const mes = agora.getMonth() === 0 ? 12 : agora.getMonth();
  const anoRef = agora.getMonth() === 0 ? ano - 1 : ano;

  try {
    // Tentar buscar CSV do mês mais recente disponível
    let csvText = "";
    let mesConsulta = mes;
    let anoConsulta = anoRef;

    for (let tentativa = 0; tentativa < 3; tentativa++) {
      const url = getUrlFolhaMensal(anoConsulta, mesConsulta);
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (response.ok) {
          csvText = await response.text();
          break;
        }
      } catch (e) {
        // Tentar mês anterior
        mesConsulta--;
        if (mesConsulta <= 0) {
          mesConsulta = 12;
          anoConsulta--;
        }
      }
    }

    if (!csvText) {
      return {
        encontrado: false,
        fonte: "Dados Abertos GO - CSV indisponível",
        dataConsulta: agora.toISOString(),
      };
    }

    // Parsear CSV e buscar servidor
    const linhas = csvText.split('\n');
    const header = linhas[0]?.split(';').map(h => h.trim().toLowerCase());
    
    if (!header) {
      return {
        encontrado: false,
        fonte: "Dados Abertos GO - formato inválido",
        dataConsulta: agora.toISOString(),
      };
    }

    // Identificar colunas
    const colNome = header.findIndex(h => h.includes('nome'));
    const colCargo = header.findIndex(h => h.includes('cargo'));
    const colOrgao = header.findIndex(h => h.includes('orgao') || h.includes('órgão'));
    const colBruto = header.findIndex(h => h.includes('brut'));
    const colDesconto = header.findIndex(h => h.includes('descont'));
    const colLiquido = header.findIndex(h => h.includes('liquid') || h.includes('líquid'));

    // Buscar pelo nome (normalizado)
    const nomeNorm = nomeServidor.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    
    for (let i = 1; i < linhas.length; i++) {
      const cols = linhas[i]?.split(';');
      if (!cols || cols.length < 3) continue;

      const nomeCSV = (cols[colNome] || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      
      if (nomeCSV.includes(nomeNorm) || nomeNorm.includes(nomeCSV)) {
        const valorBruto = parseFloat((cols[colBruto] || '0').replace(/[^\d.,]/g, '').replace(',', '.'));
        const descontos = parseFloat((cols[colDesconto] || '0').replace(/[^\d.,]/g, '').replace(',', '.'));
        const valorLiquido = parseFloat((cols[colLiquido] || '0').replace(/[^\d.,]/g, '').replace(',', '.'));

        const servidor: ServidorFolha = {
          nome: cols[colNome]?.trim() || nomeServidor,
          cargo: cols[colCargo]?.trim() || '',
          orgao: cols[colOrgao]?.trim() || '',
          valorBruto,
          descontos,
          valorLiquido,
          mesReferencia: `${String(mesConsulta).padStart(2, '0')}/${anoConsulta}`,
        };

        return {
          encontrado: true,
          servidor,
          margemCalculada: valorLiquido * 0.35, // 35% Lei Estadual 16.898/2010
          fonte: `Dados Abertos GO - Folha ${servidor.mesReferencia}`,
          dataConsulta: agora.toISOString(),
        };
      }
    }

    return {
      encontrado: false,
      fonte: `Dados Abertos GO - Servidor não encontrado na folha ${String(mesConsulta).padStart(2, '0')}/${anoConsulta}`,
      dataConsulta: agora.toISOString(),
    };

  } catch (error: any) {
    console.error("[DadosAbertosGO] Erro na consulta:", error.message);
    return {
      encontrado: false,
      fonte: `Dados Abertos GO - Erro: ${error.message}`,
      dataConsulta: agora.toISOString(),
    };
  }
}

/**
 * Atualizar dados financeiros de um cliente com base na folha pública
 * Chamado automaticamente pelo cron ou manualmente pelo usuário
 */
export async function atualizarDadosClienteViaFolha(clienteId: number): Promise<{
  atualizado: boolean;
  mensagem: string;
}> {
  const db = await getDb();
  if (!db) return { atualizado: false, mensagem: "Banco de dados indisponível" };

  // Buscar dados do cliente
  const [cliente] = await db.select().from(clientes).where(eq(clientes.id, clienteId)).limit(1);
  if (!cliente) return { atualizado: false, mensagem: "Cliente não encontrado" };

  // Verificar se é servidor estadual de GO
  const orgao = cliente.orgaoEmpregador || '';
  const isServidorGO = orgao.toLowerCase().includes('goiás') || 
                        orgao.toLowerCase().includes('goias') ||
                        orgao.toLowerCase().includes('estado de go') ||
                        orgao.toLowerCase().includes('sead') ||
                        orgao.toLowerCase().includes('governo');

  if (!isServidorGO) {
    return { atualizado: false, mensagem: "Cliente não é servidor estadual de GO" };
  }

  // Consultar folha pública
  const resultado = await consultarFolhaPagamentoGO(cliente.nomeCompleto, cliente.cpfCnpj || undefined);

  if (!resultado.encontrado || !resultado.servidor) {
    return { atualizado: false, mensagem: resultado.fonte };
  }

  // Atualizar dados financeiros
  const existingFin = await db.select().from(dadosFinanceiros).where(eq(dadosFinanceiros.clienteId, clienteId)).limit(1);
  
  const dadosAtualizados = {
    remuneracaoBruta: String(resultado.servidor.valorBruto),
    remuneracaoLiquida: String(resultado.servidor.valorLiquido),
    margemConsignavelValor: String(resultado.margemCalculada || 0),
    fonteRenda: resultado.servidor.orgao || "Servidor Público GO",
    dataReferencia: resultado.servidor.mesReferencia,
  };

  if (existingFin.length > 0) {
    await db.update(dadosFinanceiros).set(dadosAtualizados).where(eq(dadosFinanceiros.clienteId, clienteId));
  } else {
    await db.insert(dadosFinanceiros).values({
      clienteId,
      ...dadosAtualizados,
      margemConsignavelPerc: "35",
      scoreRisco: "Baixo",
    });
  }

  // Atualizar cargo/órgão do cliente se vazio
  const updateCliente: Record<string, any> = {};
  if (!cliente.cargo && resultado.servidor.cargo) updateCliente.cargo = resultado.servidor.cargo;
  if (!cliente.orgaoEmpregador && resultado.servidor.orgao) updateCliente.orgaoEmpregador = resultado.servidor.orgao;
  if (Object.keys(updateCliente).length > 0) {
    await db.update(clientes).set(updateCliente).where(eq(clientes.id, clienteId));
  }

  return {
    atualizado: true,
    mensagem: `Dados atualizados via ${resultado.fonte}. Remuneração: R$ ${resultado.servidor.valorLiquido.toFixed(2)} | Margem: R$ ${(resultado.margemCalculada || 0).toFixed(2)}`,
  };
}

/**
 * Atualizar TODOS os clientes servidores de GO via folha pública
 * Chamado pelo cron mensal
 */
export async function atualizarTodosServidoresGO(): Promise<{
  total: number;
  atualizados: number;
  erros: number;
  detalhes: string[];
}> {
  const db = await getDb();
  if (!db) return { total: 0, atualizados: 0, erros: 0, detalhes: ["DB indisponível"] };

  // Buscar todos os clientes que são servidores de GO
  const todosClientes = await db.select().from(clientes);
  const servidoresGO = todosClientes.filter(c => {
    const orgao = (c.orgaoEmpregador || '').toLowerCase();
    return orgao.includes('goiás') || orgao.includes('goias') || 
           orgao.includes('estado de go') || orgao.includes('sead') ||
           orgao.includes('governo');
  });

  let atualizados = 0;
  let erros = 0;
  const detalhes: string[] = [];

  for (const servidor of servidoresGO) {
    try {
      const result = await atualizarDadosClienteViaFolha(servidor.id);
      if (result.atualizado) {
        atualizados++;
        detalhes.push(`✓ ${servidor.nomeCompleto}: ${result.mensagem}`);
      } else {
        detalhes.push(`- ${servidor.nomeCompleto}: ${result.mensagem}`);
      }
    } catch (e: any) {
      erros++;
      detalhes.push(`✗ ${servidor.nomeCompleto}: ${e.message}`);
    }
    // Rate limiting: esperar 500ms entre consultas
    await new Promise(r => setTimeout(r, 500));
  }

  return {
    total: servidoresGO.length,
    atualizados,
    erros,
    detalhes,
  };
}
