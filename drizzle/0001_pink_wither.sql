CREATE TABLE `clientes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cpfCnpj` varchar(20) NOT NULL,
	`nomeCompleto` varchar(255) NOT NULL,
	`tipoPessoa` enum('PF','PJ') NOT NULL DEFAULT 'PF',
	`rg` varchar(30),
	`profissao` varchar(255),
	`cargo` varchar(255),
	`orgaoEmpregador` varchar(255),
	`vinculoFuncional` varchar(100),
	`endereco` text,
	`cidade` varchar(100),
	`estado` varchar(2),
	`cep` varchar(10),
	`telefone` varchar(20),
	`email` varchar(320),
	`dataNascimento` varchar(10),
	`estadoCivil` varchar(30),
	`nacionalidade` varchar(50),
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clientes_id` PRIMARY KEY(`id`),
	CONSTRAINT `clientes_cpfCnpj_unique` UNIQUE(`cpfCnpj`)
);
--> statement-breakpoint
CREATE TABLE `conhecimentos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`categoria` enum('Jurisprudencia','Tese','Estrategia','Legislacao','Modelo') NOT NULL,
	`titulo` varchar(500) NOT NULL,
	`conteudo` text,
	`tribunal` varchar(100),
	`tipoAcao` varchar(255),
	`tags` text,
	`processoOrigemId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `conhecimentos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cumprimentos_sentenca` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processoId` int NOT NULL,
	`tipo` enum('Provisorio','Definitivo') NOT NULL,
	`valorExecucao` decimal(15,2),
	`indiceCorrecao` varchar(50),
	`jurosMora` varchar(50),
	`dataCalculo` varchar(10),
	`valorPrincipal` decimal(15,2),
	`valorCorrecao` decimal(15,2),
	`valorJuros` decimal(15,2),
	`valorHonorarios` decimal(15,2),
	`valorTotal` decimal(15,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cumprimentos_sentenca_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dados_financeiros` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clienteId` int NOT NULL,
	`remuneracaoBruta` decimal(15,2),
	`remuneracaoLiquida` decimal(15,2),
	`descontoIrrf` decimal(15,2),
	`descontoPrevidencia` decimal(15,2),
	`outrosDescontos` decimal(15,2),
	`margemConsignavelPerc` decimal(5,2),
	`margemConsignavelValor` decimal(15,2),
	`totalConsignacoes` decimal(15,2),
	`margemDisponivel` decimal(15,2),
	`margemExcedida` int DEFAULT 0,
	`valorExcedente` decimal(15,2),
	`aptoEmprestimo` int DEFAULT 0,
	`scoreRisco` enum('Baixo','Medio','Alto'),
	`fonteRenda` varchar(255),
	`dataReferencia` varchar(10),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `dados_financeiros_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `documentos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processoId` int,
	`clienteId` int NOT NULL,
	`tipo` varchar(100),
	`nomeArquivo` varchar(500),
	`storageKey` varchar(500),
	`storageUrl` text,
	`tamanho` int,
	`mimeType` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `documentos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `emprestimos_consignados` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clienteId` int NOT NULL,
	`banco` varchar(255),
	`rubrica` varchar(100),
	`contrato` varchar(100),
	`valorParcela` decimal(15,2),
	`valorTotal` decimal(15,2),
	`totalParcelas` int,
	`parcelasRestantes` int,
	`dataContratacao` varchar(10),
	`taxaJuros` decimal(8,4),
	`status` enum('Ativo','Quitado','Suspenso','Judicial') DEFAULT 'Ativo',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `emprestimos_consignados_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `estrategias` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processoId` int NOT NULL,
	`tesePrincipal` text,
	`fundamentacaoLegal` text,
	`jurisprudenciaCitada` text,
	`tesesRefutadas` text,
	`pontosFortes` text,
	`riscosIdentificados` text,
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `estrategias_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `movimentacoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processoId` int NOT NULL,
	`data` varchar(10),
	`evento` varchar(500),
	`descricao` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `movimentacoes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `partes_processuais` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processoId` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`cpfCnpj` varchar(20),
	`tipo` enum('Autor','Reu','Terceiro','Assistente') NOT NULL,
	`categoria` varchar(100),
	`endereco` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `partes_processuais_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `processos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clienteId` int NOT NULL,
	`numeroCnj` varchar(30) NOT NULL,
	`tribunal` varchar(100),
	`comarca` varchar(100),
	`vara` varchar(255),
	`tipoAcao` varchar(255),
	`natureza` varchar(255),
	`classeProcessual` varchar(255),
	`assunto` varchar(500),
	`faseAtual` enum('Conhecimento','Cumprimento Provisorio','Cumprimento Definitivo','Execucao','Recurso','Arquivado','Suspenso') DEFAULT 'Conhecimento',
	`statusProcesso` enum('Ativo','Sentenca Procedente','Sentenca Improcedente','Parcialmente Procedente','Acordo','Arquivado','Recurso Pendente') DEFAULT 'Ativo',
	`valorCausa` decimal(15,2),
	`dataDistribuicao` varchar(10),
	`dataSentenca` varchar(10),
	`juiz` varchar(255),
	`prioridade` varchar(100),
	`segredoJustica` int DEFAULT 0,
	`poloAtivo` varchar(500),
	`poloPassivo` text,
	`advogadoAutor` varchar(255),
	`resumoSentenca` text,
	`valorCondenacao` decimal(15,2),
	`danosMorais` decimal(15,2),
	`danosMateriais` decimal(15,2),
	`restituicao` decimal(15,2),
	`honorariosPerc` decimal(5,2),
	`honorariosValor` decimal(15,2),
	`tutelaTipo` varchar(100),
	`tutelaStatus` varchar(100),
	`tutelaDescricao` text,
	`pdfStorageKey` varchar(500),
	`pdfUrl` text,
	`textoExtraido` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `processos_id` PRIMARY KEY(`id`),
	CONSTRAINT `processos_numeroCnj_unique` UNIQUE(`numeroCnj`)
);
