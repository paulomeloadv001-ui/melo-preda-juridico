/**
 * TESTES — Integrações Melo Advogados
 * 
 * Testes unitários com mocks para todas as integrações.
 * Não dependem de banco de dados real nem de APIs externas.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ==================== MOCK DO FETCH ====================
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

// ==================== MOCK DO DB ====================
vi.mock('../db', () => ({
  getDb: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => []),
          orderBy: vi.fn(() => []),
        })),
        orderBy: vi.fn(() => []),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        $returningId: vi.fn(() => [{ id: 1 }]),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({})),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => ({})),
    })),
  })),
}));

// ==================== TESTES: DADOS ABERTOS GO ====================
describe('Dados Abertos GO - Folha de Pagamento', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('deve retornar encontrado=false quando CSV não está disponível', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    
    const { consultarFolhaPagamentoGO } = await import('./dadosAbertosGO');
    const resultado = await consultarFolhaPagamentoGO('JOAO DA SILVA');
    
    expect(resultado.encontrado).toBe(false);
    expect(resultado.fonte).toContain('Dados Abertos GO');
  });

  it('deve encontrar servidor no CSV quando dados estão disponíveis', async () => {
    const csvMock = `NOME;CARGO;ORGAO;VALOR_BRUTO;DESCONTOS;VALOR_LIQUIDO
JOAO DA SILVA;ANALISTA;SEAD;10000.00;3000.00;7000.00
MARIA OLIVEIRA;TECNICO;GOINFRA;8000.00;2500.00;5500.00`;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(csvMock),
    });

    const { consultarFolhaPagamentoGO } = await import('./dadosAbertosGO');
    const resultado = await consultarFolhaPagamentoGO('JOAO DA SILVA');
    
    expect(resultado.encontrado).toBe(true);
    expect(resultado.servidor?.nome).toContain('JOAO DA SILVA');
    expect(resultado.servidor?.valorLiquido).toBe(7000);
    expect(resultado.margemCalculada).toBe(7000 * 0.35);
  });

  it('deve retornar encontrado=false quando servidor não está na folha', async () => {
    const csvMock = `NOME;CARGO;ORGAO;VALOR_BRUTO;DESCONTOS;VALOR_LIQUIDO
MARIA OLIVEIRA;TECNICO;GOINFRA;8000.00;2500.00;5500.00`;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(csvMock),
    });

    const { consultarFolhaPagamentoGO } = await import('./dadosAbertosGO');
    const resultado = await consultarFolhaPagamentoGO('PEDRO SANTOS');
    
    expect(resultado.encontrado).toBe(false);
  });
});

// ==================== TESTES: DATAJUD ====================
describe('DataJud CNJ - Movimentações Processuais', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    process.env.DATAJUD_API_KEY = 'test-key-123';
  });

  it('deve retornar erro quando API Key não está configurada', async () => {
    delete process.env.DATAJUD_API_KEY;
    
    // Re-importar para pegar a env atualizada
    vi.resetModules();
    const { consultarProcessoDataJud } = await import('./datajudApi');
    const resultado = await consultarProcessoDataJud('5001234-56.2023.8.09.0001');
    
    expect(resultado.encontrado).toBe(false);
    expect(resultado.fonte).toContain('API Key não configurada');
  });

  it('deve encontrar processo quando DataJud retorna dados', async () => {
    process.env.DATAJUD_API_KEY = 'test-key';
    vi.resetModules();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        hits: {
          hits: [{
            _source: {
              numeroProcesso: '5001234562023809001',
              classe: { nome: 'Procedimento Comum', codigo: 7 },
              orgaoJulgador: { nome: '1ª Vara Cível', codigo: 1 },
              assuntos: [{ nome: 'Empréstimo Consignado', codigo: 123 }],
              movimentos: [
                { dataHora: '2024-01-15T10:00:00', nome: 'Sentença', codigo: 22 },
                { dataHora: '2024-01-10T09:00:00', nome: 'Audiência Realizada', codigo: 970 },
              ],
              dataAjuizamento: '2023-06-01',
              grau: 'G1',
              nivelSigilo: 0,
            },
          }],
        },
      }),
    });

    const { consultarProcessoDataJud } = await import('./datajudApi');
    const resultado = await consultarProcessoDataJud('5001234-56.2023.8.09.0001');
    
    expect(resultado.encontrado).toBe(true);
    expect(resultado.processo?.movimentos.length).toBe(2);
    expect(resultado.novasMovimentacoes).toBe(2);
  });

  it('deve retornar encontrado=false quando processo não existe', async () => {
    process.env.DATAJUD_API_KEY = 'test-key';
    vi.resetModules();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ hits: { hits: [] } }),
    });

    const { consultarProcessoDataJud } = await import('./datajudApi');
    const resultado = await consultarProcessoDataJud('0000000-00.0000.0.00.0000');
    
    expect(resultado.encontrado).toBe(false);
  });
});

// ==================== TESTES: CELCOIN ====================
describe('Celcoin API - Margem Consignável', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('deve retornar erro quando credenciais não estão configuradas', async () => {
    delete process.env.CELCOIN_CLIENT_ID;
    delete process.env.CELCOIN_CLIENT_SECRET;
    vi.resetModules();

    const { consultarMargemCelcoin } = await import('./celcoinApi');
    const resultado = await consultarMargemCelcoin('12345678901');
    
    expect(resultado.sucesso).toBe(false);
    expect(resultado.mensagem).toContain('Credenciais Celcoin não configuradas');
  });

  it('deve retornar margem quando API responde com sucesso', async () => {
    process.env.CELCOIN_CLIENT_ID = 'test-id';
    process.env.CELCOIN_CLIENT_SECRET = 'test-secret';
    vi.resetModules();

    // Mock token
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ access_token: 'token123', expires_in: 3600 }),
    });

    // Mock margem
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        nome: 'JOAO DA SILVA',
        orgao: 'SEAD-GO',
        matricula: '123456',
        remuneracaoLiquida: 7000,
        percentualMargem: 35,
        margem: {
          total: 2450,
          utilizada: 1500,
          disponivel: 950,
          cartao: 350,
          cartaoDisponivel: 200,
        },
        convenio: 'GOIAS',
      }),
    });

    const { consultarMargemCelcoin } = await import('./celcoinApi');
    const resultado = await consultarMargemCelcoin('12345678901');
    
    expect(resultado.sucesso).toBe(true);
    expect(resultado.margem?.margemDisponivel).toBe(950);
    expect(resultado.margem?.margemTotal).toBe(2450);
    expect(resultado.margem?.remuneracaoLiquida).toBe(7000);
  });

  it('deve verificar status de configuração corretamente', async () => {
    process.env.CELCOIN_CLIENT_ID = 'test-id';
    process.env.CELCOIN_CLIENT_SECRET = 'test-secret';
    vi.resetModules();

    const { isCelcoinConfigurada } = await import('./celcoinApi');
    expect(isCelcoinConfigurada()).toBe(true);
  });
});

// ==================== TESTES: CÁLCULO DE MARGEM ====================
describe('Cálculo de Margem Consignável', () => {
  it('deve calcular margem de servidor estadual GO corretamente', async () => {
    const { determinarPercentualMargem } = await import('../utils/calculoMargem');
    const resultado = determinarPercentualMargem({
      remuneracaoLiquida: 7000,
      vinculoFuncional: 'Efetivo',
      orgao: 'SEAD Goiás',
      uf: 'GO',
    });
    
    expect(resultado.percentualMargem).toBe(35);
    expect(resultado.margemTotal).toBe(2450);
    expect(resultado.legislacao).toContain('16.898/2010');
  });

  it('deve calcular margem de aposentado INSS corretamente', async () => {
    const { determinarPercentualMargem } = await import('../utils/calculoMargem');
    const resultado = determinarPercentualMargem({
      remuneracaoLiquida: 3000,
      vinculoFuncional: 'Aposentado',
      orgao: 'INSS',
      uf: 'GO',
    });
    
    expect(resultado.percentualMargem).toBe(35);
    expect(resultado.margemTotal).toBe(1050);
    expect(resultado.legislacao).toContain('14.131/2021');
  });

  it('deve analisar capacidade de empréstimo corretamente', async () => {
    const { analisarCapacidadeEmprestimo } = await import('../utils/calculoMargem');
    
    // Caso 1: Margem saudável
    const saudavel = analisarCapacidadeEmprestimo(7000, 35, 1000);
    expect(saudavel.margemExcedida).toBe(false);
    expect(saudavel.scoreRisco).toBe('Baixo');
    expect(saudavel.aptoNovoEmprestimo).toBe(true);
    expect(saudavel.margemDisponivel).toBe(1450); // 2450 - 1000

    // Caso 2: Margem excedida
    const excedida = analisarCapacidadeEmprestimo(7000, 35, 3000);
    expect(excedida.margemExcedida).toBe(true);
    expect(excedida.scoreRisco).toBe('Alto');
    expect(excedida.aptoNovoEmprestimo).toBe(false);
    expect(excedida.valorExcedente).toBe(550); // 3000 - 2450
  });

  it('deve calcular economia de portabilidade corretamente', async () => {
    const { calcularEconomiaPortabilidade } = await import('../utils/calculoMargem');
    const resultado = calcularEconomiaPortabilidade(50000, 2.5, 1.8, 48);
    
    expect(resultado.parcelaAtual).toBeGreaterThan(resultado.parcelaNova);
    expect(resultado.economiaMensal).toBeGreaterThan(0);
    expect(resultado.economiaTotal).toBe(resultado.economiaMensal * 48);
    expect(resultado.percentualEconomia).toBeGreaterThan(0);
  });
});

// ==================== TESTES: CACHE DO AGENTE ====================
describe('Cache do Agente IA', () => {
  it('deve armazenar e recuperar valores do cache', async () => {
    const { agentCache } = await import('../utils/agenteCache');
    agentCache.clear();
    
    agentCache.set('test-key', { nome: 'João' }, 60000);
    const valor = agentCache.get<{ nome: string }>('test-key');
    
    expect(valor).toEqual({ nome: 'João' });
  });

  it('deve retornar null para chaves expiradas', async () => {
    const { agentCache } = await import('../utils/agenteCache');
    agentCache.clear();
    
    agentCache.set('expired', 'valor', 1); // TTL de 1ms
    await new Promise(r => setTimeout(r, 10));
    
    expect(agentCache.get('expired')).toBeNull();
  });

  it('deve comprimir histórico corretamente', async () => {
    const { comprimirHistorico } = await import('../utils/agenteCache');
    
    const historico = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Mensagem ${i} com conteúdo de teste`,
    }));

    const comprimido = comprimirHistorico(historico, 5);
    expect(comprimido.length).toBeLessThanOrEqual(6); // 1 resumo + 5 recentes
    expect(comprimido[0].role).toBe('system');
    expect(comprimido[0].content).toContain('HISTÓRICO RESUMIDO');
  });

  it('deve limitar resultado de tool corretamente', async () => {
    const { limitarResultadoTool } = await import('../utils/agenteCache');
    
    const arrayGrande = JSON.stringify(Array.from({ length: 100 }, (_, i) => ({ id: i, nome: `Item ${i}` })));
    const limitado = limitarResultadoTool(arrayGrande, 2000);
    
    expect(limitado.length).toBeLessThanOrEqual(2000);
    expect(limitado).toContain('_aviso');
  });
});

// ==================== TESTES: WEBHOOKS ====================
describe('Webhooks - Processamento de Eventos', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('deve rejeitar webhook com tipo desconhecido', async () => {
    const { processarWebhook } = await import('../webhooks/webhookHandler');
    const resultado = await processarWebhook({
      tipo: 'tipo_invalido',
      origem: 'teste',
      timestamp: new Date().toISOString(),
      payload: {},
    });
    
    expect(resultado.processado).toBe(false);
    expect(resultado.acao).toBe('tipo_desconhecido');
  });

  it('deve processar webhook de margem alterada', async () => {
    const { processarWebhook } = await import('../webhooks/webhookHandler');
    const resultado = await processarWebhook({
      tipo: 'margem_alterada',
      origem: 'neoconsig',
      timestamp: new Date().toISOString(),
      payload: {
        cpf: '12345678901',
        margemTotal: 2450,
        margemDisponivel: 950,
        totalConsignacoes: 1500,
      },
    });
    
    // Sem cliente no mock DB, deve retornar não encontrado
    expect(resultado.processado).toBe(false);
    expect(resultado.mensagem).toContain('Cliente não encontrado');
  });
});
