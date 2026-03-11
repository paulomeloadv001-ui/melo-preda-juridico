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
  permissoes: text("permissoes"), // JSON string com permissões específicas
  ativo: int("ativo").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = typeof userProfiles.$inferInsert;
