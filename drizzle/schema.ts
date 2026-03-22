import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean, json } from "drizzle-orm/mysql-core";

// ==================== USERS (AUTH) ====================
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  profileCompleted: int("profileCompleted").default(0).notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ==================== CLIENTES (CPF como identificador único) ====================
export const clientes = mysqlTable("clientes", {
  id: int("id").autoincrement().primaryKey(),
  cpfCnpj: varchar("cpfCnpj", { length: 50 }).notNull().unique(),
  nomeCompleto: varchar("nomeCompleto", { length: 255 }).notNull(),
  tipoPessoa: mysqlEnum("tipoPessoa", ["PF", "PJ"]).default("PF").notNull(),
  rg: varchar("rg", { length: 30 }),
  profissao: varchar("profissao", { length: 255 }),
  cargo: varchar("cargo", { length: 255 }),
  orgaoEmpregador: varchar("orgaoEmpregador", { length: 255 }),
  vinculoFuncional: varchar("vinculoFuncional", { length: 100 }),
  endereco: text("endereco"),
  cidade: varchar("cidade", { length: 100 }),
  estado: varchar("estado", { length: 100 }),
  cep: varchar("cep", { length: 10 }),
  telefone: varchar("telefone", { length: 20 }),
  email: varchar("email", { length: 320 }),
  dataNascimento: varchar("dataNascimento", { length: 10 }),
  estadoCivil: varchar("estadoCivil", { length: 30 }),
  nacionalidade: varchar("nacionalidade", { length: 50 }),
  observacoes: text("observacoes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Cliente = typeof clientes.$inferSelect;
export type InsertCliente = typeof clientes.$inferInsert;

// ==================== DADOS FINANCEIROS DO CLIENTE ====================
export const dadosFinanceiros = mysqlTable("dados_financeiros", {
  id: int("id").autoincrement().primaryKey(),
  clienteId: int("clienteId").notNull(),
  remuneracaoBruta: decimal("remuneracaoBruta", { precision: 15, scale: 2 }),
  remuneracaoLiquida: decimal("remuneracaoLiquida", { precision: 15, scale: 2 }),
  descontoIrrf: decimal("descontoIrrf", { precision: 15, scale: 2 }),
  descontoPrevidencia: decimal("descontoPrevidencia", { precision: 15, scale: 2 }),
  outrosDescontos: decimal("outrosDescontos", { precision: 15, scale: 2 }),
  margemConsignavelPerc: decimal("margemConsignavelPerc", { precision: 5, scale: 2 }),
  margemConsignavelValor: decimal("margemConsignavelValor", { precision: 15, scale: 2 }),
  totalConsignacoes: decimal("totalConsignacoes", { precision: 15, scale: 2 }),
  margemDisponivel: decimal("margemDisponivel", { precision: 15, scale: 2 }),
  margemExcedida: int("margemExcedida").default(0),
  valorExcedente: decimal("valorExcedente", { precision: 15, scale: 2 }),
  aptoEmprestimo: int("aptoEmprestimo").default(0),
  scoreRisco: mysqlEnum("scoreRisco", ["Baixo", "Medio", "Alto"]),
  fonteRenda: varchar("fonteRenda", { length: 255 }),
  dataReferencia: varchar("dataReferencia", { length: 10 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DadosFinanceiros = typeof dadosFinanceiros.$inferSelect;
export type InsertDadosFinanceiros = typeof dadosFinanceiros.$inferInsert;

// ==================== EMPRÉSTIMOS CONSIGNADOS ====================
export const emprestimosConsignados = mysqlTable("emprestimos_consignados", {
  id: int("id").autoincrement().primaryKey(),
  clienteId: int("clienteId").notNull(),
  banco: varchar("banco", { length: 255 }),
  rubrica: varchar("rubrica", { length: 100 }),
  contrato: varchar("contrato", { length: 100 }),
  valorParcela: decimal("valorParcela", { precision: 15, scale: 2 }),
  valorTotal: decimal("valorTotal", { precision: 15, scale: 2 }),
  totalParcelas: int("totalParcelas"),
  parcelasRestantes: int("parcelasRestantes"),
  dataContratacao: varchar("dataContratacao", { length: 10 }),
  taxaJuros: decimal("taxaJuros", { precision: 8, scale: 4 }),
  status: mysqlEnum("status", ["Ativo", "Quitado", "Suspenso", "Judicial"]).default("Ativo"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type EmprestimoConsignado = typeof emprestimosConsignados.$inferSelect;
export type InsertEmprestimoConsignado = typeof emprestimosConsignados.$inferInsert;

// ==================== PROCESSOS JUDICIAIS ====================
export const processos = mysqlTable("processos", {
  id: int("id").autoincrement().primaryKey(),
  clienteId: int("clienteId").notNull(),
  numeroCnj: varchar("numeroCnj", { length: 30 }).notNull().unique(),
  tribunal: varchar("tribunal", { length: 100 }),
  comarca: varchar("comarca", { length: 100 }),
  vara: varchar("vara", { length: 255 }),
  tipoAcao: varchar("tipoAcao", { length: 255 }),
  natureza: varchar("natureza", { length: 255 }),
  classeProcessual: varchar("classeProcessual", { length: 255 }),
  assunto: varchar("assunto", { length: 500 }),
  faseAtual: varchar("faseAtual", { length: 100 }).default("Conhecimento"),
  statusProcesso: varchar("statusProcesso", { length: 100 }).default("Ativo"),
  valorCausa: decimal("valorCausa", { precision: 15, scale: 2 }),
  dataDistribuicao: varchar("dataDistribuicao", { length: 10 }),
  dataSentenca: varchar("dataSentenca", { length: 10 }),
  juiz: varchar("juiz", { length: 255 }),
  prioridade: varchar("prioridade", { length: 100 }),
  segredoJustica: int("segredoJustica").default(0),
  poloAtivo: varchar("poloAtivo", { length: 500 }),
  poloPassivo: text("poloPassivo"),
  advogadoAutor: varchar("advogadoAutor", { length: 255 }),
  resumoSentenca: text("resumoSentenca"),
  valorCondenacao: decimal("valorCondenacao", { precision: 15, scale: 2 }),
  danosMorais: decimal("danosMorais", { precision: 15, scale: 2 }),
  danosMateriais: decimal("danosMateriais", { precision: 15, scale: 2 }),
  restituicao: decimal("restituicao", { precision: 15, scale: 2 }),
  honorariosPerc: decimal("honorariosPerc", { precision: 5, scale: 2 }),
  honorariosValor: decimal("honorariosValor", { precision: 15, scale: 2 }),
  tutelaTipo: varchar("tutelaTipo", { length: 100 }),
  tutelaStatus: varchar("tutelaStatus", { length: 100 }),
  tutelaDescricao: text("tutelaDescricao"),
  processoOrigemId: int("processoOrigemId"),  // ID do processo principal (para processos dependentes)
  tipoVinculo: varchar("tipoVinculo", { length: 100 }),  // Ex: "Cumprimento Provisório", "Recurso", "Embargos", etc.
  pdfStorageKey: varchar("pdfStorageKey", { length: 500 }),
  pdfUrl: text("pdfUrl"),
  textoExtraido: text("textoExtraido"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Processo = typeof processos.$inferSelect;
export type InsertProcesso = typeof processos.$inferInsert;

// ==================== ESTRATÉGIAS PROCESSUAIS ====================
export const estrategias = mysqlTable("estrategias", {
  id: int("id").autoincrement().primaryKey(),
  processoId: int("processoId").notNull(),
  tesePrincipal: text("tesePrincipal"),
  fundamentacaoLegal: text("fundamentacaoLegal"),
  jurisprudenciaCitada: text("jurisprudenciaCitada"),
  tesesRefutadas: text("tesesRefutadas"),
  pontosFortes: text("pontosFortes"),
  riscosIdentificados: text("riscosIdentificados"),
  observacoes: text("observacoes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Estrategia = typeof estrategias.$inferSelect;
export type InsertEstrategia = typeof estrategias.$inferInsert;

// ==================== PARTES PROCESSUAIS ====================
export const partesProcessuais = mysqlTable("partes_processuais", {
  id: int("id").autoincrement().primaryKey(),
  processoId: int("processoId").notNull(),
  nome: varchar("nome", { length: 255 }).notNull(),
  cpfCnpj: varchar("cpfCnpj", { length: 20 }),
  tipo: mysqlEnum("tipo", ["Autor", "Reu", "Terceiro", "Assistente"]).notNull(),
  categoria: varchar("categoria", { length: 100 }),
  endereco: text("endereco"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ParteProcessual = typeof partesProcessuais.$inferSelect;
export type InsertParteProcessual = typeof partesProcessuais.$inferInsert;

// ==================== MOVIMENTAÇÕES PROCESSUAIS ====================
export const movimentacoes = mysqlTable("movimentacoes", {
  id: int("id").autoincrement().primaryKey(),
  processoId: int("processoId").notNull(),
  data: varchar("data", { length: 10 }),
  evento: varchar("evento", { length: 500 }),
  descricao: text("descricao"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Movimentacao = typeof movimentacoes.$inferSelect;
export type InsertMovimentacao = typeof movimentacoes.$inferInsert;

// ==================== DOCUMENTOS VINCULADOS ====================
export const documentos = mysqlTable("documentos", {
  id: int("id").autoincrement().primaryKey(),
  processoId: int("processoId"),
  clienteId: int("clienteId").notNull(),
  tipo: varchar("tipo", { length: 100 }),
  nomeArquivo: varchar("nomeArquivo", { length: 500 }),
  storageKey: varchar("storageKey", { length: 500 }),
  storageUrl: text("storageUrl"),
  tamanho: int("tamanho"),
  mimeType: varchar("mimeType", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Documento = typeof documentos.$inferSelect;
export type InsertDocumento = typeof documentos.$inferInsert;

// ==================== BANCO DE CONHECIMENTOS ====================
export const conhecimentos = mysqlTable("conhecimentos", {
  id: int("id").autoincrement().primaryKey(),
  categoria: mysqlEnum("categoria", [
    "Jurisprudencia", "Tese", "Estrategia", "Legislacao", "Modelo"
  ]).notNull(),
  titulo: varchar("titulo", { length: 500 }).notNull(),
  conteudo: text("conteudo"),
  tribunal: varchar("tribunal", { length: 100 }),
  tipoAcao: varchar("tipoAcao", { length: 255 }),
  tags: text("tags"),
  processoOrigemId: int("processoOrigemId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Conhecimento = typeof conhecimentos.$inferSelect;
export type InsertConhecimento = typeof conhecimentos.$inferInsert;

// ==================== CUMPRIMENTO DE SENTENÇA ====================
export const cumprimentosSentenca = mysqlTable("cumprimentos_sentenca", {
  id: int("id").autoincrement().primaryKey(),
  processoId: int("processoId").notNull(),
  tipo: mysqlEnum("tipo", ["Provisorio", "Definitivo"]).notNull(),
  valorExecucao: decimal("valorExecucao", { precision: 15, scale: 2 }),
  indiceCorrecao: varchar("indiceCorrecao", { length: 50 }),
  jurosMora: varchar("jurosMora", { length: 50 }),
  dataCalculo: varchar("dataCalculo", { length: 10 }),
  valorPrincipal: decimal("valorPrincipal", { precision: 15, scale: 2 }),
  valorCorrecao: decimal("valorCorrecao", { precision: 15, scale: 2 }),
  valorJuros: decimal("valorJuros", { precision: 15, scale: 2 }),
  valorHonorarios: decimal("valorHonorarios", { precision: 15, scale: 2 }),
  valorTotal: decimal("valorTotal", { precision: 15, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CumprimentoSentenca = typeof cumprimentosSentenca.$inferSelect;
export type InsertCumprimentoSentenca = typeof cumprimentosSentenca.$inferInsert;

// ==================== MOVIMENTAÇÕES FINANCEIRAS (Depósitos, Alvarás, Honorários) ====================
export const movimentacoesFinanceiras = mysqlTable("movimentacoes_financeiras", {
  id: int("id").autoincrement().primaryKey(),
  processoId: int("processoId").notNull(),
  clienteId: int("clienteId").notNull(),
  tipo: mysqlEnum("tipo", [
    "deposito_judicial",      // Depósito judicial realizado
    "alvara_levantamento",    // Alvará de levantamento expedido/cumprido
    "honorarios_sucumbenciais", // Honorários advocatícios sucumbenciais
    "honorarios_contratuais",  // Honorários contratuais
    "pagamento",              // Pagamento genérico
    "restituicao",            // Restituição de valores
    "multa",                  // Multa processual
    "custas",                 // Custas processuais
  ]).notNull(),
  status: mysqlEnum("statusMov", [
    "pago_levantado",         // Já pago ou levantado
    "depositado_a_levantar",  // Depositado, aguardando levantamento
    "pendente",               // Pendente de pagamento/depósito
    "parcial",                // Pagamento/levantamento parcial
    "cancelado",              // Cancelado
  ]).default("pendente").notNull(),
  valor: decimal("valor", { precision: 15, scale: 2 }).notNull(),
  valorLevantado: decimal("valorLevantado", { precision: 15, scale: 2 }),
  valorPendente: decimal("valorPendente", { precision: 15, scale: 2 }),
  dataMovimentacao: varchar("dataMovimentacao", { length: 10 }),
  dataLevantamento: varchar("dataLevantamento", { length: 10 }),
  descricao: text("descricao"),
  beneficiario: varchar("beneficiario", { length: 255 }),
  banco: varchar("banco", { length: 255 }),
  contaDeposito: varchar("contaDeposito", { length: 100 }),
  numeroAlvara: varchar("numeroAlvara", { length: 100 }),
  percentualHonorarios: decimal("percentualHonorarios", { precision: 5, scale: 2 }),
  fundamentoLegal: text("fundamentoLegal"),
  observacoes: text("observacoes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MovimentacaoFinanceira = typeof movimentacoesFinanceiras.$inferSelect;
export type InsertMovimentacaoFinanceira = typeof movimentacoesFinanceiras.$inferInsert;

// ==================== ANÁLISE GERAL DO ESCRITÓRIO ====================
export const analiseGeral = mysqlTable("analise_geral", {
  id: int("id").autoincrement().primaryKey(),
  chave: varchar("chave", { length: 100 }).notNull().unique(),
  titulo: varchar("titulo", { length: 255 }).notNull(),
  categoria: varchar("categoria", { length: 100 }).notNull(),
  conteudo: text("conteudo").notNull(),
  dados: json("dados"),
  ordem: int("ordem").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AnaliseGeral = typeof analiseGeral.$inferSelect;
export type InsertAnaliseGeral = typeof analiseGeral.$inferInsert;

// ==================== RELATÓRIOS ====================
export const relatorios = mysqlTable("relatorios", {
  id: int("id").autoincrement().primaryKey(),
  titulo: varchar("titulo", { length: 500 }).notNull(),
  categoria: varchar("categoria", { length: 100 }).notNull(),
  subcategoria: varchar("subcategoria", { length: 255 }),
  descricao: text("descricao"),
  tipoRelatorio: varchar("tipoRelatorio", { length: 100 }).notNull(),
  formato: varchar("formato", { length: 20 }).default("PDF"),
  storageKey: varchar("storageKey", { length: 500 }),
  storageUrl: text("storageUrl"),
  tamanho: int("tamanho"),
  dadosJson: json("dadosJson"),
  geradoPor: varchar("geradoPor", { length: 100 }).default("Sistema"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Relatorio = typeof relatorios.$inferSelect;
export type InsertRelatorio = typeof relatorios.$inferInsert;

// ==================== FILA DE TRABALHOS (JOBS) ====================
export const jobs = mysqlTable("jobs", {
  id: int("id").autoincrement().primaryKey(),
  tipo: varchar("tipo", { length: 100 }).notNull(), // 'importacao_pdf', 'geracao_relatorio', 'exportacao', 'atualizacao_dados'
  status: varchar("status", { length: 50 }).default("pendente").notNull(), // 'pendente', 'processando', 'concluido', 'erro', 'cancelado'
  prioridade: int("prioridade").default(0), // 0=normal, 1=alta, 2=urgente
  titulo: varchar("titulo", { length: 500 }).notNull(),
  descricao: text("descricao"),
  // Dados de entrada para o job
  inputData: json("inputData"), // { pdfUrl, clienteId, etc. }
  // Resultado do processamento
  outputData: json("outputData"), // { clienteId, processoId, errors, etc. }
  progresso: int("progresso").default(0), // 0-100
  mensagemProgresso: text("mensagemProgresso"),
  // Referências
  clienteId: int("clienteId"),
  processoId: int("processoId"),
  // Controle de execução
  tentativas: int("tentativas").default(0),
  maxTentativas: int("maxTentativas").default(3),
  erroDetalhes: text("erroDetalhes"),
  // Timestamps
  iniciadoEm: timestamp("iniciadoEm"),
  concluidoEm: timestamp("concluidoEm"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Job = typeof jobs.$inferSelect;
export type InsertJob = typeof jobs.$inferInsert;

// ==================== SOLICITAÇÕES DE ACESSO ====================
export const accessRequests = mysqlTable("access_requests", {
  id: int("id").autoincrement().primaryKey(),
  nomeCompleto: varchar("nomeCompleto", { length: 255 }).notNull(),
  cpf: varchar("cpf", { length: 20 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  celular: varchar("celular", { length: 20 }).notNull(),
  motivo: text("motivo"),
  status: mysqlEnum("status", ["pendente", "aprovado", "rejeitado"]).default("pendente").notNull(),
  aprovadoPor: int("aprovadoPor"),
  aprovadoEm: timestamp("aprovadoEm"),
  observacoesAdmin: text("observacoesAdmin"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AccessRequest = typeof accessRequests.$inferSelect;
export type InsertAccessRequest = typeof accessRequests.$inferInsert;

// ==================== PERFIS DE USUÁRIO ESTENDIDO ====================
export const userProfiles = mysqlTable("user_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  cpf: varchar("cpf", { length: 20 }),
  celular: varchar("celular", { length: 20 }),
  cargo: varchar("cargo", { length: 100 }),
  oab: varchar("oab", { length: 30 }),
  especialidade: varchar("especialidade", { length: 255 }),
  fotoUrl: text("fotoUrl"),
  bio: text("bio"),
  permissoes: text("permissoes"), // JSON string com permissões específicas
  ativo: int("ativo").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = typeof userProfiles.$inferInsert;

// ==================== HISTÓRICO DE CORREÇÕES ====================
export const historicoCorrecoes = mysqlTable("historico_correcoes", {
  id: int("id").autoincrement().primaryKey(),
  tipo: varchar("tipo", { length: 100 }).notNull(), // 'normalizar_cpfs', 'auto_merge', 'deduplicar_processos', 'atualizar_cpf', 'merge_manual', 'correcao_completa'
  acao: varchar("acao", { length: 255 }).notNull(),
  detalhes: text("detalhes"),
  itensAfetados: int("itensAfetados").default(0),
  status: mysqlEnum("statusCorrecao", ["sucesso", "parcial", "erro"]).default("sucesso").notNull(),
  executadoPor: varchar("executadoPor", { length: 255 }),
  dadosAntes: json("dadosAntes"),
  dadosDepois: json("dadosDepois"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type HistoricoCorrecao = typeof historicoCorrecoes.$inferSelect;
export type InsertHistoricoCorrecao = typeof historicoCorrecoes.$inferInsert;

// ==================== NOTIFICAÇÕES ====================
export const notificacoes = mysqlTable("notificacoes", {
  id: int("id").autoincrement().primaryKey(),
  tipo: mysqlEnum("tipoNotif", [
    "honorario_status",       // Mudança de status de honorário
    "honorario_novo",         // Novo honorário detectado
    "prazo_vencendo",         // Prazo processual próximo do vencimento
    "prazo_vencido",          // Prazo processual vencido
    "importacao_concluida",   // Importação de processo concluída
    "importacao_erro",        // Erro na importação
    "correcao_executada",     // Correção automática executada
    "novo_cliente",           // Novo cliente cadastrado
    "novo_processo",          // Novo processo importado
    "acesso_solicitado",      // Nova solicitação de acesso
    "sistema",                // Notificação do sistema
  ]).notNull(),
  prioridade: mysqlEnum("prioridadeNotif", ["baixa", "normal", "alta", "urgente"]).default("normal").notNull(),
  titulo: varchar("tituloNotif", { length: 500 }).notNull(),
  mensagem: text("mensagemNotif").notNull(),
  // Referências opcionais para navegação direta
  clienteId: int("clienteIdNotif"),
  processoId: int("processoIdNotif"),
  movimentacaoFinanceiraId: int("movFinanceiraIdNotif"),
  prazoId: int("prazoIdNotif"),
  // Link direto para a página relevante
  linkUrl: varchar("linkUrl", { length: 500 }),
  // Controle de leitura
  lida: int("lidaNotif").default(0).notNull(),
  lidaEm: timestamp("lidaEm"),
  // Metadados
  icone: varchar("icone", { length: 50 }),
  cor: varchar("corNotif", { length: 20 }),
  dadosExtras: json("dadosExtras"),
  createdAt: timestamp("createdAtNotif").defaultNow().notNull(),
});

export type Notificacao = typeof notificacoes.$inferSelect;
export type InsertNotificacao = typeof notificacoes.$inferInsert;

// ==================== PRAZOS PROCESSUAIS ====================
export const prazosProcessuais = mysqlTable("prazos_processuais", {
  id: int("id").autoincrement().primaryKey(),
  processoId: int("processoIdPrazo").notNull(),
  clienteId: int("clienteIdPrazo").notNull(),
  tipo: mysqlEnum("tipoPrazo", [
    "recurso",                // Prazo para recurso
    "contestacao",            // Prazo para contestação
    "manifestacao",           // Prazo para manifestação
    "cumprimento",            // Prazo para cumprimento de sentença
    "audiencia",              // Data de audiência
    "pericia",                // Data de perícia
    "diligencia",             // Prazo para diligência
    "pagamento",              // Prazo para pagamento
    "levantamento",           // Prazo para levantamento de alvará
    "outro",                  // Outro tipo de prazo
  ]).notNull(),
  titulo: varchar("tituloPrazo", { length: 500 }).notNull(),
  descricao: text("descricaoPrazo"),
  dataVencimento: timestamp("dataVencimento").notNull(),
  diasAntecedencia: int("diasAntecedencia").default(3), // Notificar X dias antes
  status: mysqlEnum("statusPrazo", [
    "pendente",               // Prazo ativo, aguardando
    "cumprido",               // Prazo cumprido
    "vencido",                // Prazo vencido sem cumprimento
    "cancelado",              // Prazo cancelado
  ]).default("pendente").notNull(),
  notificacaoEnviada: int("notificacaoEnviada").default(0),
  observacoes: text("observacoesPrazo"),
  createdAt: timestamp("createdAtPrazo").defaultNow().notNull(),
  updatedAt: timestamp("updatedAtPrazo").defaultNow().onUpdateNow().notNull(),
});

export type PrazoProcessual = typeof prazosProcessuais.$inferSelect;
export type InsertPrazoProcessual = typeof prazosProcessuais.$inferInsert;

// ==================== LOG DE SINCRONIZAÇÃO (INTEGRAÇÃO JUSCONSIG) ====================
export const syncLog = mysqlTable("sync_log", {
  id: int("id").autoincrement().primaryKey(),
  tipo: varchar("tipo", { length: 50 }).notNull(),
  direcao: varchar("direcao", { length: 20 }).notNull().default("escritorio_jusconsig"),
  novos: int("novos").notNull().default(0),
  atualizados: int("atualizados").notNull().default(0),
  erros: int("erros").notNull().default(0),
  detalhes: text("detalhes"),
  status: varchar("status", { length: 20 }).notNull().default("sucesso"),
  duracaoMs: int("duracaoMs").default(0),
  executadoEm: timestamp("executadoEm").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SyncLog = typeof syncLog.$inferSelect;
export type InsertSyncLog = typeof syncLog.$inferInsert;

// ==================== TEMPLATES DE PETIÇÃO ====================
export const templatesPeticao = mysqlTable("templates_peticao", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull(),
  tipo: varchar("tipo", { length: 100 }).notNull(),
  descricao: text("descricao"),
  estruturaJson: json("estrutura_json").notNull(),
  variaveisObrigatorias: json("variaveis_obrigatorias"),
  tesesAplicaveis: text("teses_aplicaveis"),
  fundamentacaoPadrao: text("fundamentacao_padrao"),
  tribunalDestino: varchar("tribunal_destino", { length: 255 }),
  tags: text("tags"),
  ativo: int("ativo").default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TemplatePeticao = typeof templatesPeticao.$inferSelect;
export type InsertTemplatePeticao = typeof templatesPeticao.$inferInsert;

// ==================== PETIÇÕES GERADAS ====================
export const peticoesGeradas = mysqlTable("peticoes_geradas", {
  id: int("id").autoincrement().primaryKey(),
  templateId: int("templateId"),
  processoId: int("processoId"),
  clienteId: int("clienteId"),
  tipo: varchar("tipo", { length: 255 }).notNull(),
  titulo: varchar("titulo", { length: 500 }).notNull(),
  conteudoJson: json("conteudo_json").notNull(),
  conteudoTexto: text("conteudo_texto"),
  status: varchar("status", { length: 50 }).default("rascunho").notNull(),
  storageKey: varchar("storageKey", { length: 500 }),
  storageUrl: text("storageUrl"),
  geradoPor: varchar("geradoPor", { length: 100 }).default("agente_ia"),
  revisadoPor: varchar("revisadoPor", { length: 100 }),
  observacoes: text("observacoes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PeticaoGerada = typeof peticoesGeradas.$inferSelect;
export type InsertPeticaoGerada = typeof peticoesGeradas.$inferInsert;

// ==================== CONFIGURAÇÃO DO AGENTE IA ====================
export const agenteIaConfig = mysqlTable("agente_ia_config", {
  id: int("id").autoincrement().primaryKey(),
  chave: varchar("chave", { length: 100 }).notNull().unique(),
  valor: text("valor").notNull(),
  categoria: varchar("categoria", { length: 100 }).notNull(),
  descricao: text("descricao"),
  ativo: int("ativo").default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AgenteIaConfig = typeof agenteIaConfig.$inferSelect;
export type InsertAgenteIaConfig = typeof agenteIaConfig.$inferInsert;

// ==================== HISTÓRICO DE CONVERSAS DO AGENTE IA ====================
export const agenteIaHistorico = mysqlTable("agente_ia_historico", {
  id: int("id").autoincrement().primaryKey(),
  sessaoId: varchar("sessaoId", { length: 100 }).notNull(),
  userId: int("userId"),
  role: varchar("role", { length: 20 }).notNull(),
  conteudo: text("conteudo").notNull(),
  contextoUsado: json("contexto_usado"),
  tokensEntrada: int("tokens_entrada").default(0),
  tokensSaida: int("tokens_saida").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AgenteIaHistorico = typeof agenteIaHistorico.$inferSelect;
export type InsertAgenteIaHistorico = typeof agenteIaHistorico.$inferInsert;

// ==================== ANEXOS DE PETIÇÕES ====================
export const anexosPeticao = mysqlTable("anexos_peticao", {
  id: int("id").autoincrement().primaryKey(),
  peticaoId: int("peticao_id").notNull(),
  nomeArquivo: varchar("nome_arquivo", { length: 500 }).notNull(),
  tipoArquivo: varchar("tipo_arquivo", { length: 100 }).default("application/pdf"),
  tamanhoBytes: int("tamanho_bytes").default(0),
  storageKey: varchar("storage_key", { length: 500 }).notNull(),
  storageUrl: varchar("storage_url", { length: 1000 }).notNull(),
  descricao: text("descricao"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type AnexoPeticao = typeof anexosPeticao.$inferSelect;
export type InsertAnexoPeticao = typeof anexosPeticao.$inferInsert;

// ==================== PERMISSÕES DE USUÁRIO ====================
export const userPermissions = mysqlTable("user_permissions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  modulo: varchar("modulo", { length: 100 }).notNull(),
  podeVisualizar: int("pode_visualizar").default(1).notNull(),
  podeEditar: int("pode_editar").default(0).notNull(),
  podeExcluir: int("pode_excluir").default(0).notNull(),
  podeExportar: int("pode_exportar").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type UserPermission = typeof userPermissions.$inferSelect;

// ==================== CONVITES ====================
export const convites = mysqlTable("convites", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  nome: varchar("nome", { length: 255 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  token: varchar("token", { length: 128 }).notNull(),
  criadoPor: int("criadoPor").notNull(),
  usado: int("usado").default(0).notNull(),
  usadoPor: int("usadoPor"),
  usadoEm: timestamp("usadoEm"),
  expiraEm: timestamp("expiraEm").notNull(),
  permissoes: text("permissoes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Convite = typeof convites.$inferSelect;

// ==================== LOG DE AUDITORIA ====================
export const auditLog = mysqlTable("audit_log", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  acao: varchar("acao", { length: 255 }).notNull(),
  modulo: varchar("modulo", { length: 100 }).notNull(),
  detalhes: text("detalhes"),
  ip: varchar("ip", { length: 45 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AuditLogEntry = typeof auditLog.$inferSelect;


// ==================== PUBLICAÇÕES / INTIMAÇÕES (DJE, DATAJUD, JUSBRASIL, ESCAVADOR) ====================
export const publicacoes = mysqlTable("publicacoes", {
  id: int("id").autoincrement().primaryKey(),
  processoId: int("processoIdPub"),
  clienteId: int("clienteIdPub"),
  numeroCnj: varchar("numeroCnjPub", { length: 30 }),
  fonte: varchar("fonte", { length: 50 }).notNull(), // 'datajud', 'jusbrasil', 'escavador', 'dje', 'manual'
  tipoPublicacao: varchar("tipoPublicacao", { length: 100 }), // 'intimação', 'despacho', 'sentença', 'acórdão'
  dataPublicacao: timestamp("dataPublicacao").notNull(),
  dataDisponibilizacao: timestamp("dataDisponibilizacao"),
  conteudo: text("conteudoPub"),
  resumo: text("resumoPub"),
  diarioOficial: varchar("diarioOficial", { length: 255 }),
  caderno: varchar("caderno", { length: 100 }),
  pagina: varchar("pagina", { length: 20 }),
  oabEncontrada: varchar("oabEncontrada", { length: 20 }),
  prazoGerado: int("prazoGerado").default(0),
  prazoId: int("prazoIdPub"),
  tratada: int("tratada").default(0).notNull(),
  tratadaPor: varchar("tratadaPor", { length: 255 }),
  tratadaEm: timestamp("tratadaEm"),
  urgencia: int("urgencia").default(0).notNull(), // 0=normal, 1=urgente, 2=crítico
  observacoes: text("observacoesPub"),
  jsonOriginal: text("jsonOriginalPub"),
  createdAt: timestamp("createdAtPub").defaultNow().notNull(),
  updatedAt: timestamp("updatedAtPub").defaultNow().onUpdateNow().notNull(),
});
export type Publicacao = typeof publicacoes.$inferSelect;
export type InsertPublicacao = typeof publicacoes.$inferInsert;

// ==================== CONFIGURAÇÃO DE MONITORAMENTO ====================
export const monitoramentoConfig = mysqlTable("monitoramento_config", {
  id: int("id").autoincrement().primaryKey(),
  tipo: varchar("tipoMon", { length: 50 }).notNull(), // 'oab', 'cnj', 'nome_parte'
  valor: varchar("valorMon", { length: 255 }).notNull(), // Ex: '40559/GO'
  descricao: varchar("descricaoMon", { length: 500 }),
  ativo: int("ativoMon").default(1).notNull(),
  ultimaConsulta: timestamp("ultimaConsulta"),
  totalPublicacoes: int("totalPublicacoesMon").default(0),
  createdAt: timestamp("createdAtMon").defaultNow().notNull(),
});
export type MonitoramentoConfig = typeof monitoramentoConfig.$inferSelect;


// ==================== VERSÕES DE PETIÇÃO (HISTÓRICO DE REFINAMENTOS) ====================
export const peticaoVersoes = mysqlTable("peticao_versoes", {
  id: int("id").autoincrement().primaryKey(),
  peticaoId: int("peticaoId").notNull(),
  versao: int("versao").notNull(), // 1 = original, 2 = 1º refinamento, etc.
  conteudoTexto: text("conteudoVersao").notNull(),
  instrucoes: text("instrucoesVersao"), // null para versão original
  diff: text("diffVersao"), // JSON com alterações (adições/remoções)
  docxUrl: text("docxUrlVersao"),
  criadoPor: varchar("criadoPorVersao", { length: 255 }),
  createdAt: timestamp("createdAtVersao").defaultNow().notNull(),
});
export type PeticaoVersao = typeof peticaoVersoes.$inferSelect;
export type InsertPeticaoVersao = typeof peticaoVersoes.$inferInsert;

// ==================== PERFIS DE ACESSO (Templates de Permissões) ====================
export const perfisAcesso = mysqlTable("perfis_acesso", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 100 }).notNull().unique(),
  descricao: text("descricao"),
  cor: varchar("cor", { length: 20 }).default("blue"),
  icone: varchar("icone", { length: 50 }).default("User"),
  permissoes: text("permissoes").notNull(), // JSON: { modulo: { podeVisualizar, podeEditar, podeExcluir, podeExportar } }
  padrao: int("padrao").default(0).notNull(),
  criadoPor: int("criadoPor"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PerfilAcesso = typeof perfisAcesso.$inferSelect;
export type InsertPerfilAcesso = typeof perfisAcesso.$inferInsert;
