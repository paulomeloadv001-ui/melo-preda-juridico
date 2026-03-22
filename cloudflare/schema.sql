-- ============================================================
-- Melo & Preda - Sistema Jurídico Integrado
-- Schema D1 (SQLite) - Equivalente ao MySQL/TiDB
-- Gerado automaticamente a partir do drizzle/schema.ts
-- ============================================================

-- ==================== USERS (AUTH) ====================
DROP TABLE IF EXISTS users;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  openId TEXT NOT NULL UNIQUE,
  name TEXT,
  email TEXT,
  loginMethod TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'admin')),
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  lastSignedIn TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==================== CLIENTES ====================
DROP TABLE IF EXISTS clientes;
CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cpfCnpj TEXT NOT NULL UNIQUE,
  nomeCompleto TEXT NOT NULL,
  tipoPessoa TEXT NOT NULL DEFAULT 'PF' CHECK(tipoPessoa IN ('PF', 'PJ')),
  rg TEXT,
  profissao TEXT,
  cargo TEXT,
  orgaoEmpregador TEXT,
  vinculoFuncional TEXT,
  endereco TEXT,
  cidade TEXT,
  estado TEXT,
  cep TEXT,
  telefone TEXT,
  email TEXT,
  dataNascimento TEXT,
  estadoCivil TEXT,
  nacionalidade TEXT,
  observacoes TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==================== DADOS FINANCEIROS ====================
DROP TABLE IF EXISTS dados_financeiros;
CREATE TABLE IF NOT EXISTS dados_financeiros (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clienteId INTEGER NOT NULL,
  remuneracaoBruta REAL,
  remuneracaoLiquida REAL,
  descontoIrrf REAL,
  descontoPrevidencia REAL,
  outrosDescontos REAL,
  margemConsignavelPerc REAL,
  margemConsignavelValor REAL,
  totalConsignacoes REAL,
  margemDisponivel REAL,
  margemExcedida INTEGER DEFAULT 0,
  valorExcedente REAL,
  aptoEmprestimo INTEGER DEFAULT 0,
  scoreRisco TEXT CHECK(scoreRisco IN ('Baixo', 'Medio', 'Alto')),
  fonteRenda TEXT,
  dataReferencia TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==================== EMPRÉSTIMOS CONSIGNADOS ====================
DROP TABLE IF EXISTS emprestimos_consignados;
CREATE TABLE IF NOT EXISTS emprestimos_consignados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clienteId INTEGER NOT NULL,
  banco TEXT,
  rubrica TEXT,
  contrato TEXT,
  valorParcela REAL,
  valorTotal REAL,
  totalParcelas INTEGER,
  parcelasRestantes INTEGER,
  dataContratacao TEXT,
  taxaJuros REAL,
  status TEXT DEFAULT 'Ativo' CHECK(status IN ('Ativo', 'Quitado', 'Suspenso', 'Judicial')),
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==================== PROCESSOS JUDICIAIS ====================
DROP TABLE IF EXISTS processos;
CREATE TABLE IF NOT EXISTS processos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clienteId INTEGER NOT NULL,
  numeroCnj TEXT NOT NULL UNIQUE,
  tribunal TEXT,
  comarca TEXT,
  vara TEXT,
  tipoAcao TEXT,
  natureza TEXT,
  classeProcessual TEXT,
  assunto TEXT,
  faseAtual TEXT DEFAULT 'Conhecimento',
  statusProcesso TEXT DEFAULT 'Ativo',
  valorCausa REAL,
  dataDistribuicao TEXT,
  dataSentenca TEXT,
  juiz TEXT,
  prioridade TEXT,
  segredoJustica INTEGER DEFAULT 0,
  poloAtivo TEXT,
  poloPassivo TEXT,
  advogadoAutor TEXT,
  resumoSentenca TEXT,
  valorCondenacao REAL,
  danosMorais REAL,
  danosMateriais REAL,
  restituicao REAL,
  honorariosPerc REAL,
  honorariosValor REAL,
  tutelaTipo TEXT,
  tutelaStatus TEXT,
  tutelaDescricao TEXT,
  processoOrigemId INTEGER,
  tipoVinculo TEXT,
  pdfStorageKey TEXT,
  pdfUrl TEXT,
  textoExtraido TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==================== ESTRATÉGIAS PROCESSUAIS ====================
DROP TABLE IF EXISTS estrategias;
CREATE TABLE IF NOT EXISTS estrategias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  processoId INTEGER NOT NULL,
  tesePrincipal TEXT,
  fundamentacaoLegal TEXT,
  jurisprudenciaCitada TEXT,
  tesesRefutadas TEXT,
  pontosFortes TEXT,
  riscosIdentificados TEXT,
  observacoes TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==================== PARTES PROCESSUAIS ====================
DROP TABLE IF EXISTS partes_processuais;
CREATE TABLE IF NOT EXISTS partes_processuais (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  processoId INTEGER NOT NULL,
  nome TEXT NOT NULL,
  cpfCnpj TEXT,
  tipo TEXT NOT NULL CHECK(tipo IN ('Autor', 'Reu', 'Terceiro', 'Assistente')),
  categoria TEXT,
  endereco TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==================== MOVIMENTAÇÕES PROCESSUAIS ====================
DROP TABLE IF EXISTS movimentacoes;
CREATE TABLE IF NOT EXISTS movimentacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  processoId INTEGER NOT NULL,
  data TEXT,
  evento TEXT,
  descricao TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==================== DOCUMENTOS VINCULADOS ====================
DROP TABLE IF EXISTS documentos;
CREATE TABLE IF NOT EXISTS documentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  processoId INTEGER,
  clienteId INTEGER NOT NULL,
  tipo TEXT,
  nomeArquivo TEXT,
  storageKey TEXT,
  storageUrl TEXT,
  tamanho INTEGER,
  mimeType TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==================== BANCO DE CONHECIMENTOS ====================
DROP TABLE IF EXISTS conhecimentos;
CREATE TABLE IF NOT EXISTS conhecimentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  categoria TEXT NOT NULL CHECK(categoria IN ('Jurisprudencia', 'Tese', 'Estrategia', 'Legislacao', 'Modelo')),
  titulo TEXT NOT NULL,
  conteudo TEXT,
  tribunal TEXT,
  tipoAcao TEXT,
  tags TEXT,
  processoOrigemId INTEGER,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==================== CUMPRIMENTOS DE SENTENÇA ====================
DROP TABLE IF EXISTS cumprimentos_sentenca;
CREATE TABLE IF NOT EXISTS cumprimentos_sentenca (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  processoId INTEGER NOT NULL,
  tipo TEXT NOT NULL CHECK(tipo IN ('Provisorio', 'Definitivo')),
  valorExecucao REAL,
  indiceCorrecao TEXT,
  jurosMora TEXT,
  dataCalculo TEXT,
  valorPrincipal REAL,
  valorCorrecao REAL,
  valorJuros REAL,
  valorHonorarios REAL,
  valorTotal REAL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==================== MOVIMENTAÇÕES FINANCEIRAS ====================
DROP TABLE IF EXISTS movimentacoes_financeiras;
CREATE TABLE IF NOT EXISTS movimentacoes_financeiras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  processoId INTEGER NOT NULL,
  clienteId INTEGER NOT NULL,
  tipo TEXT NOT NULL CHECK(tipo IN ('deposito_judicial', 'alvara_levantamento', 'honorarios_sucumbenciais', 'honorarios_contratuais', 'pagamento', 'restituicao', 'multa', 'custas')),
  statusMov TEXT NOT NULL DEFAULT 'pendente' CHECK(statusMov IN ('pago_levantado', 'depositado_a_levantar', 'pendente', 'parcial', 'cancelado')),
  valor REAL NOT NULL,
  valorLevantado REAL,
  valorPendente REAL,
  dataMovimentacao TEXT,
  dataLevantamento TEXT,
  descricao TEXT,
  beneficiario TEXT,
  banco TEXT,
  contaDeposito TEXT,
  numeroAlvara TEXT,
  percentualHonorarios REAL,
  fundamentoLegal TEXT,
  observacoes TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==================== ANÁLISE GERAL DO ESCRITÓRIO ====================
DROP TABLE IF EXISTS analise_geral;
CREATE TABLE IF NOT EXISTS analise_geral (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chave TEXT NOT NULL UNIQUE,
  titulo TEXT NOT NULL,
  categoria TEXT NOT NULL,
  conteudo TEXT NOT NULL,
  dados TEXT,
  ordem INTEGER DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==================== RELATÓRIOS ====================
DROP TABLE IF EXISTS relatorios;
CREATE TABLE IF NOT EXISTS relatorios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL,
  categoria TEXT NOT NULL,
  subcategoria TEXT,
  descricao TEXT,
  tipoRelatorio TEXT NOT NULL,
  formato TEXT DEFAULT 'PDF',
  storageKey TEXT,
  storageUrl TEXT,
  tamanho INTEGER,
  dadosJson TEXT,
  geradoPor TEXT DEFAULT 'Sistema',
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==================== FILA DE TRABALHOS (JOBS) ====================
DROP TABLE IF EXISTS jobs;
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  prioridade INTEGER DEFAULT 0,
  titulo TEXT NOT NULL,
  descricao TEXT,
  inputData TEXT,
  outputData TEXT,
  progresso INTEGER DEFAULT 0,
  mensagemProgresso TEXT,
  clienteId INTEGER,
  processoId INTEGER,
  tentativas INTEGER DEFAULT 0,
  maxTentativas INTEGER DEFAULT 3,
  erroDetalhes TEXT,
  iniciadoEm TEXT,
  concluidoEm TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==================== SOLICITAÇÕES DE ACESSO ====================
DROP TABLE IF EXISTS access_requests;
CREATE TABLE IF NOT EXISTS access_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nomeCompleto TEXT NOT NULL,
  cpf TEXT NOT NULL,
  email TEXT NOT NULL,
  celular TEXT NOT NULL,
  motivo TEXT,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente', 'aprovado', 'rejeitado')),
  aprovadoPor INTEGER,
  aprovadoEm TEXT,
  observacoesAdmin TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==================== PERFIS DE USUÁRIO ESTENDIDO ====================
DROP TABLE IF EXISTS user_profiles;
CREATE TABLE IF NOT EXISTS user_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL,
  cpf TEXT,
  celular TEXT,
  cargo TEXT,
  oab TEXT,
  permissoes TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==================== HISTÓRICO DE CORREÇÕES ====================
DROP TABLE IF EXISTS historico_correcoes;
CREATE TABLE IF NOT EXISTS historico_correcoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,
  acao TEXT NOT NULL,
  detalhes TEXT,
  itensAfetados INTEGER DEFAULT 0,
  statusCorrecao TEXT NOT NULL DEFAULT 'sucesso' CHECK(statusCorrecao IN ('sucesso', 'parcial', 'erro')),
  executadoPor TEXT,
  dadosAntes TEXT,
  dadosDepois TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==================== NOTIFICAÇÕES ====================
DROP TABLE IF EXISTS notificacoes;
CREATE TABLE IF NOT EXISTS notificacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipoNotif TEXT NOT NULL CHECK(tipoNotif IN ('honorario_status', 'honorario_novo', 'prazo_vencendo', 'prazo_vencido', 'importacao_concluida', 'importacao_erro', 'correcao_executada', 'novo_cliente', 'novo_processo', 'acesso_solicitado', 'sistema')),
  prioridadeNotif TEXT NOT NULL DEFAULT 'normal' CHECK(prioridadeNotif IN ('baixa', 'normal', 'alta', 'urgente')),
  tituloNotif TEXT NOT NULL,
  mensagemNotif TEXT NOT NULL,
  clienteIdNotif INTEGER,
  processoIdNotif INTEGER,
  movFinanceiraIdNotif INTEGER,
  prazoIdNotif INTEGER,
  linkUrl TEXT,
  lidaNotif INTEGER NOT NULL DEFAULT 0,
  lidaEm TEXT,
  icone TEXT,
  corNotif TEXT,
  dadosExtras TEXT,
  createdAtNotif TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==================== PRAZOS PROCESSUAIS ====================
DROP TABLE IF EXISTS prazos_processuais;
CREATE TABLE IF NOT EXISTS prazos_processuais (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  processoIdPrazo INTEGER NOT NULL,
  clienteIdPrazo INTEGER NOT NULL,
  tipoPrazo TEXT NOT NULL CHECK(tipoPrazo IN ('recurso', 'contestacao', 'manifestacao', 'cumprimento', 'audiencia', 'pericia', 'diligencia', 'pagamento', 'levantamento', 'outro')),
  tituloPrazo TEXT NOT NULL,
  descricaoPrazo TEXT,
  dataVencimento TEXT NOT NULL,
  diasAntecedencia INTEGER DEFAULT 3,
  statusPrazo TEXT NOT NULL DEFAULT 'pendente' CHECK(statusPrazo IN ('pendente', 'cumprido', 'vencido', 'cancelado')),
  notificacaoEnviada INTEGER DEFAULT 0,
  observacoesPrazo TEXT,
  createdAtPrazo TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAtPrazo TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==================== LOG DE SINCRONIZAÇÃO ====================
DROP TABLE IF EXISTS sync_log;
CREATE TABLE IF NOT EXISTS sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,
  direcao TEXT NOT NULL DEFAULT 'escritorio_jusconsig',
  novos INTEGER NOT NULL DEFAULT 0,
  atualizados INTEGER NOT NULL DEFAULT 0,
  erros INTEGER NOT NULL DEFAULT 0,
  detalhes TEXT,
  status TEXT NOT NULL DEFAULT 'sucesso',
  duracaoMs INTEGER DEFAULT 0,
  executadoEm TEXT NOT NULL DEFAULT (datetime('now')),
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==================== TEMPLATES DE PETIÇÃO ====================
DROP TABLE IF EXISTS templates_peticao;
CREATE TABLE IF NOT EXISTS templates_peticao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL,
  descricao TEXT,
  estrutura_json TEXT NOT NULL,
  variaveis_obrigatorias TEXT,
  teses_aplicaveis TEXT,
  fundamentacao_padrao TEXT,
  tribunal_destino TEXT,
  tags TEXT,
  ativo INTEGER DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==================== PETIÇÕES GERADAS ====================
DROP TABLE IF EXISTS peticoes_geradas;
CREATE TABLE IF NOT EXISTS peticoes_geradas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  templateId INTEGER,
  processoId INTEGER,
  clienteId INTEGER,
  tipo TEXT NOT NULL,
  titulo TEXT NOT NULL,
  conteudo_json TEXT NOT NULL,
  conteudo_texto TEXT,
  status TEXT NOT NULL DEFAULT 'rascunho',
  storageKey TEXT,
  storageUrl TEXT,
  geradoPor TEXT DEFAULT 'agente_ia',
  revisadoPor TEXT,
  observacoes TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==================== CONFIGURAÇÃO DO AGENTE IA ====================
DROP TABLE IF EXISTS agente_ia_config;
CREATE TABLE IF NOT EXISTS agente_ia_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chave TEXT NOT NULL UNIQUE,
  valor TEXT NOT NULL,
  categoria TEXT NOT NULL,
  descricao TEXT,
  ativo INTEGER DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==================== HISTÓRICO DE CONVERSAS DO AGENTE IA ====================
DROP TABLE IF EXISTS agente_ia_historico;
CREATE TABLE IF NOT EXISTS agente_ia_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessaoId TEXT NOT NULL,
  userId INTEGER,
  role TEXT NOT NULL,
  conteudo TEXT NOT NULL,
  contexto_usado TEXT,
  tokens_entrada INTEGER DEFAULT 0,
  tokens_saida INTEGER DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==================== ANEXOS DE PETIÇÕES ====================
DROP TABLE IF EXISTS anexos_peticao;
CREATE TABLE IF NOT EXISTS anexos_peticao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  peticao_id INTEGER NOT NULL,
  nome_arquivo TEXT NOT NULL,
  tipo_arquivo TEXT DEFAULT 'application/pdf',
  tamanho_bytes INTEGER DEFAULT 0,
  storage_key TEXT NOT NULL,
  storage_url TEXT NOT NULL,
  descricao TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==================== PERMISSÕES DE USUÁRIO ====================
DROP TABLE IF EXISTS user_permissions;
CREATE TABLE IF NOT EXISTS user_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL,
  modulo TEXT NOT NULL,
  pode_visualizar INTEGER NOT NULL DEFAULT 1,
  pode_editar INTEGER NOT NULL DEFAULT 0,
  pode_excluir INTEGER NOT NULL DEFAULT 0,
  pode_exportar INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==================== CONVITES ====================
DROP TABLE IF EXISTS convites;
CREATE TABLE IF NOT EXISTS convites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  nome TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'admin')),
  token TEXT NOT NULL,
  criadoPor INTEGER NOT NULL,
  usado INTEGER NOT NULL DEFAULT 0,
  usadoPor INTEGER,
  usadoEm TEXT,
  expiraEm TEXT NOT NULL,
  permissoes TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==================== LOG DE AUDITORIA ====================
DROP TABLE IF EXISTS audit_log;
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL,
  acao TEXT NOT NULL,
  modulo TEXT NOT NULL,
  detalhes TEXT,
  ip TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==================== PUBLICAÇÕES / INTIMAÇÕES ====================
DROP TABLE IF EXISTS publicacoes;
CREATE TABLE IF NOT EXISTS publicacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  processoIdPub INTEGER,
  clienteIdPub INTEGER,
  numeroCnjPub TEXT,
  fonte TEXT NOT NULL,
  tipoPublicacao TEXT,
  dataPublicacao TEXT NOT NULL,
  dataDisponibilizacao TEXT,
  conteudoPub TEXT,
  resumoPub TEXT,
  diarioOficial TEXT,
  caderno TEXT,
  pagina TEXT,
  oabEncontrada TEXT,
  prazoGerado INTEGER DEFAULT 0,
  prazoIdPub INTEGER,
  tratada INTEGER NOT NULL DEFAULT 0,
  tratadaPor TEXT,
  tratadaEm TEXT,
  urgencia INTEGER NOT NULL DEFAULT 0,
  observacoesPub TEXT,
  jsonOriginalPub TEXT,
  createdAtPub TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAtPub TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==================== CONFIGURAÇÃO DE MONITORAMENTO ====================
DROP TABLE IF EXISTS monitoramento_config;
CREATE TABLE IF NOT EXISTS monitoramento_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipoMon TEXT NOT NULL,
  valorMon TEXT NOT NULL,
  descricaoMon TEXT,
  ativoMon INTEGER NOT NULL DEFAULT 1,
  ultimaConsulta TEXT,
  totalPublicacoesMon INTEGER DEFAULT 0,
  createdAtMon TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==================== VERSÕES DE PETIÇÃO ====================
DROP TABLE IF EXISTS peticao_versoes;
CREATE TABLE IF NOT EXISTS peticao_versoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  peticaoId INTEGER NOT NULL,
  versao INTEGER NOT NULL,
  conteudoVersao TEXT NOT NULL,
  instrucoesVersao TEXT,
  diffVersao TEXT,
  docxUrlVersao TEXT,
  criadoPorVersao TEXT,
  createdAtVersao TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==================== PERFIS DE ACESSO ====================
DROP TABLE IF EXISTS perfis_acesso;
CREATE TABLE IF NOT EXISTS perfis_acesso (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT,
  cor TEXT DEFAULT 'blue',
  icone TEXT DEFAULT 'User',
  permissoes TEXT NOT NULL,
  padrao INTEGER NOT NULL DEFAULT 0,
  criadoPor INTEGER,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==================== ÍNDICES ====================
CREATE INDEX IF NOT EXISTS idx_clientes_cpf ON clientes(cpfCnpj);
CREATE INDEX IF NOT EXISTS idx_processos_cnj ON processos(numeroCnj);
CREATE INDEX IF NOT EXISTS idx_processos_cliente ON processos(clienteId);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_processo ON movimentacoes(processoId);
CREATE INDEX IF NOT EXISTS idx_partes_processo ON partes_processuais(processoId);
CREATE INDEX IF NOT EXISTS idx_documentos_cliente ON documentos(clienteId);
CREATE INDEX IF NOT EXISTS idx_documentos_processo ON documentos(processoId);
CREATE INDEX IF NOT EXISTS idx_conhecimentos_categoria ON conhecimentos(categoria);
CREATE INDEX IF NOT EXISTS idx_prazos_vencimento ON prazos_processuais(dataVencimento);
CREATE INDEX IF NOT EXISTS idx_prazos_status ON prazos_processuais(statusPrazo);
CREATE INDEX IF NOT EXISTS idx_publicacoes_cnj ON publicacoes(numeroCnjPub);
CREATE INDEX IF NOT EXISTS idx_publicacoes_data ON publicacoes(dataPublicacao);
CREATE INDEX IF NOT EXISTS idx_notificacoes_lida ON notificacoes(lidaNotif);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_peticoes_cliente ON peticoes_geradas(clienteId);
CREATE INDEX IF NOT EXISTS idx_peticoes_processo ON peticoes_geradas(processoId);
CREATE INDEX IF NOT EXISTS idx_mov_fin_processo ON movimentacoes_financeiras(processoId);
CREATE INDEX IF NOT EXISTS idx_mov_fin_cliente ON movimentacoes_financeiras(clienteId);
CREATE INDEX IF NOT EXISTS idx_emprestimos_cliente ON emprestimos_consignados(clienteId);
CREATE INDEX IF NOT EXISTS idx_estrategias_processo ON estrategias(processoId);
