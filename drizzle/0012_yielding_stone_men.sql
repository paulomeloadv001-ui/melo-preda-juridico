CREATE TABLE `agente_ia_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`chave` varchar(100) NOT NULL,
	`valor` text NOT NULL,
	`categoria` varchar(100) NOT NULL,
	`descricao` text,
	`ativo` int DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agente_ia_config_id` PRIMARY KEY(`id`),
	CONSTRAINT `agente_ia_config_chave_unique` UNIQUE(`chave`)
);
--> statement-breakpoint
CREATE TABLE `agente_ia_historico` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessaoId` varchar(100) NOT NULL,
	`userId` int,
	`role` varchar(20) NOT NULL,
	`conteudo` text NOT NULL,
	`contexto_usado` json,
	`tokens_entrada` int DEFAULT 0,
	`tokens_saida` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `agente_ia_historico_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `anexos_peticao` (
	`id` int AUTO_INCREMENT NOT NULL,
	`peticao_id` int NOT NULL,
	`nome_arquivo` varchar(500) NOT NULL,
	`tipo_arquivo` varchar(100) DEFAULT 'application/pdf',
	`tamanho_bytes` int DEFAULT 0,
	`storage_key` varchar(500) NOT NULL,
	`storage_url` varchar(1000) NOT NULL,
	`descricao` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `anexos_peticao_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`acao` varchar(255) NOT NULL,
	`modulo` varchar(100) NOT NULL,
	`detalhes` text,
	`ip` varchar(45),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `convites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`nome` varchar(255),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`token` varchar(128) NOT NULL,
	`criadoPor` int NOT NULL,
	`usado` int NOT NULL DEFAULT 0,
	`usadoPor` int,
	`usadoEm` timestamp,
	`expiraEm` timestamp NOT NULL,
	`permissoes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `convites_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `monitoramento_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tipoMon` varchar(50) NOT NULL,
	`valorMon` varchar(255) NOT NULL,
	`descricaoMon` varchar(500),
	`ativoMon` int NOT NULL DEFAULT 1,
	`ultimaConsulta` timestamp,
	`totalPublicacoesMon` int DEFAULT 0,
	`createdAtMon` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `monitoramento_config_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `peticoes_geradas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`templateId` int,
	`processoId` int,
	`clienteId` int,
	`tipo` varchar(255) NOT NULL,
	`titulo` varchar(500) NOT NULL,
	`conteudo_json` json NOT NULL,
	`conteudo_texto` text,
	`status` varchar(50) NOT NULL DEFAULT 'rascunho',
	`storageKey` varchar(500),
	`storageUrl` text,
	`geradoPor` varchar(100) DEFAULT 'agente_ia',
	`revisadoPor` varchar(100),
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `peticoes_geradas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `publicacoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processoIdPub` int,
	`clienteIdPub` int,
	`numeroCnjPub` varchar(30),
	`fonte` varchar(50) NOT NULL,
	`tipoPublicacao` varchar(100),
	`dataPublicacao` timestamp NOT NULL,
	`dataDisponibilizacao` timestamp,
	`conteudoPub` text,
	`resumoPub` text,
	`diarioOficial` varchar(255),
	`caderno` varchar(100),
	`pagina` varchar(20),
	`oabEncontrada` varchar(20),
	`prazoGerado` int DEFAULT 0,
	`prazoIdPub` int,
	`tratada` int NOT NULL DEFAULT 0,
	`tratadaPor` varchar(255),
	`tratadaEm` timestamp,
	`urgencia` int NOT NULL DEFAULT 0,
	`observacoesPub` text,
	`jsonOriginalPub` text,
	`createdAtPub` timestamp NOT NULL DEFAULT (now()),
	`updatedAtPub` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `publicacoes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sync_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tipo` varchar(50) NOT NULL,
	`direcao` varchar(20) NOT NULL DEFAULT 'escritorio_jusconsig',
	`novos` int NOT NULL DEFAULT 0,
	`atualizados` int NOT NULL DEFAULT 0,
	`erros` int NOT NULL DEFAULT 0,
	`detalhes` text,
	`status` varchar(20) NOT NULL DEFAULT 'sucesso',
	`duracaoMs` int DEFAULT 0,
	`executadoEm` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sync_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `templates_peticao` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(255) NOT NULL,
	`tipo` varchar(100) NOT NULL,
	`descricao` text,
	`estrutura_json` json NOT NULL,
	`variaveis_obrigatorias` json,
	`teses_aplicaveis` text,
	`fundamentacao_padrao` text,
	`tribunal_destino` varchar(255),
	`tags` text,
	`ativo` int DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `templates_peticao_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`modulo` varchar(100) NOT NULL,
	`pode_visualizar` int NOT NULL DEFAULT 1,
	`pode_editar` int NOT NULL DEFAULT 0,
	`pode_excluir` int NOT NULL DEFAULT 0,
	`pode_exportar` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_permissions_id` PRIMARY KEY(`id`)
);
