/**
 * CACHE E OTIMIZAÇÃO — Agente IA
 * 
 * Objetivo: Reduzir latência e custo do agente IA através de:
 * 1. Cache de consultas frequentes (clientes, processos)
 * 2. Limitação inteligente de contexto (evitar enviar dados demais)
 * 3. Compressão de histórico de conversas
 * 4. Pool de resultados de tools reutilizáveis
 */

// ==================== CACHE EM MEMÓRIA ====================
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // ms
}

class AgentCache {
  private cache = new Map<string, CacheEntry<any>>();
  private maxEntries = 500;

  /**
   * Obter valor do cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  /**
   * Armazenar valor no cache
   */
  set<T>(key: string, data: T, ttlMs: number = 300000): void { // default 5 min
    // Evict se estiver cheio
    if (this.cache.size >= this.maxEntries) {
      const oldest = [...this.cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
      if (oldest) this.cache.delete(oldest[0]);
    }
    this.cache.set(key, { data, timestamp: Date.now(), ttl: ttlMs });
  }

  /**
   * Invalidar cache por padrão
   */
  invalidate(pattern: string): void {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Limpar todo o cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Estatísticas do cache
   */
  stats(): { entries: number; maxEntries: number; hitRate: string } {
    return {
      entries: this.cache.size,
      maxEntries: this.maxEntries,
      hitRate: "N/A (implementar contagem de hits/misses se necessário)",
    };
  }
}

export const agentCache = new AgentCache();

// ==================== LIMITAÇÃO DE CONTEXTO ====================

/**
 * Comprimir histórico de conversa para caber no contexto do LLM
 * Mantém as últimas N mensagens e resume as anteriores
 */
export function comprimirHistorico(
  historico: Array<{ role: string; content: string }>,
  maxMensagens: number = 10,
  maxCharsTotal: number = 30000
): Array<{ role: string; content: string }> {
  if (historico.length <= maxMensagens) return historico;

  // Manter as últimas N mensagens
  const recentes = historico.slice(-maxMensagens);
  const antigas = historico.slice(0, -maxMensagens);

  // Resumir mensagens antigas em um bloco
  const resumo = antigas.map(m => {
    const prefixo = m.role === 'user' ? 'U' : 'A';
    return `[${prefixo}] ${m.content.substring(0, 100)}`;
  }).join('\n');

  const mensagemResumo = {
    role: 'system' as const,
    content: `[HISTÓRICO RESUMIDO - ${antigas.length} mensagens anteriores]\n${resumo.substring(0, 3000)}`,
  };

  const resultado = [mensagemResumo, ...recentes];

  // Verificar tamanho total
  let totalChars = resultado.reduce((sum, m) => sum + m.content.length, 0);
  while (totalChars > maxCharsTotal && resultado.length > 3) {
    resultado.splice(1, 1); // Remover a segunda mensagem (após o resumo)
    totalChars = resultado.reduce((sum, m) => sum + m.content.length, 0);
  }

  return resultado;
}

/**
 * Limitar tamanho do resultado de uma tool para não estourar contexto
 */
export function limitarResultadoTool(resultado: string, maxChars: number = 8000): string {
  if (resultado.length <= maxChars) return resultado;

  try {
    const parsed = JSON.parse(resultado);
    
    // Se for array, limitar quantidade de itens
    if (Array.isArray(parsed)) {
      const limitado = parsed.slice(0, 20);
      return JSON.stringify({
        ...{ dados: limitado },
        _aviso: `Resultado truncado: mostrando ${limitado.length} de ${parsed.length} itens`,
      });
    }

    // Se for objeto com arrays grandes, truncar cada array
    if (typeof parsed === 'object') {
      const truncado: Record<string, any> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (Array.isArray(value) && value.length > 10) {
          truncado[key] = value.slice(0, 10);
          truncado[`_${key}_total`] = value.length;
        } else if (typeof value === 'string' && value.length > 2000) {
          truncado[key] = value.substring(0, 2000) + '... [truncado]';
        } else {
          truncado[key] = value;
        }
      }
      return JSON.stringify(truncado);
    }
  } catch {
    // Não é JSON, truncar texto puro
  }

  return resultado.substring(0, maxChars) + '\n... [resultado truncado]';
}

/**
 * Preparar contexto do cliente de forma otimizada (sem dados desnecessários)
 */
export function prepararContextoCliente(cliente: any, processos: any[], financeiro: any): string {
  if (!cliente) return '';

  const linhas = [
    `## Cliente: ${cliente.nomeCompleto}`,
    `CPF: ${cliente.cpfCnpj || 'N/I'} | Cargo: ${cliente.cargo || 'N/I'} | Órgão: ${cliente.orgaoEmpregador || 'N/I'}`,
  ];

  if (financeiro) {
    linhas.push(`Remuneração Líquida: R$ ${financeiro.remuneracaoLiquida || 'N/I'} | Margem: R$ ${financeiro.margemDisponivel || 'N/I'} | Score: ${financeiro.scoreRisco || 'N/I'}`);
  }

  if (processos.length > 0) {
    linhas.push(`\n### Processos (${processos.length}):`);
    for (const p of processos.slice(0, 5)) { // Máximo 5 processos no contexto
      linhas.push(`- ${p.numeroCnj} | ${p.tipoAcao || 'N/I'} | Fase: ${p.faseAtual || 'N/I'} | Valor: R$ ${p.valorCausa || 'N/I'}`);
    }
    if (processos.length > 5) {
      linhas.push(`  ... e mais ${processos.length - 5} processo(s)`);
    }
  }

  return linhas.join('\n');
}

/**
 * Preparar panorama global otimizado (resumo rápido do escritório)
 */
export function prepararPanoramaGlobal(stats: {
  totalClientes: number;
  totalProcessos: number;
  processosAtivos: number;
  alertasUrgentes: number;
  margemExcedida: number;
}): string {
  return [
    `## Panorama do Escritório`,
    `Clientes: ${stats.totalClientes} | Processos: ${stats.totalProcessos} (${stats.processosAtivos} ativos)`,
    `Alertas urgentes: ${stats.alertasUrgentes} | Margens excedidas: ${stats.margemExcedida}`,
  ].join('\n');
}

// ==================== DEBOUNCE PARA CONSULTAS ====================

const pendingQueries = new Map<string, Promise<any>>();

/**
 * Deduplica consultas simultâneas ao mesmo recurso
 * Se já há uma consulta em andamento para a mesma chave, retorna a mesma Promise
 */
export async function deduplicarConsulta<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = pendingQueries.get(key);
  if (existing) return existing as Promise<T>;

  const promise = fn().finally(() => {
    pendingQueries.delete(key);
  });

  pendingQueries.set(key, promise);
  return promise;
}
