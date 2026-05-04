CREATE TABLE `creditos_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`operacao` varchar(100) NOT NULL,
	`descricao` varchar(255) NOT NULL,
	`custoPorUso` int NOT NULL DEFAULT 1,
	`categoria` enum('llm','api_externa','storage','processamento','outros') NOT NULL DEFAULT 'outros',
	`ativo` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `creditos_config_id` PRIMARY KEY(`id`),
	CONSTRAINT `creditos_config_operacao_unique` UNIQUE(`operacao`)
);
--> statement-breakpoint
CREATE TABLE `creditos_resumo_diario` (
	`id` int AUTO_INCREMENT NOT NULL,
	`data` varchar(10) NOT NULL,
	`conta` varchar(100) NOT NULL DEFAULT 'principal',
	`totalCreditos` int NOT NULL DEFAULT 0,
	`totalDebitos` int NOT NULL DEFAULT 0,
	`operacoesCount` int NOT NULL DEFAULT 0,
	`categoriaLlm` int DEFAULT 0,
	`categoriaApiExterna` int DEFAULT 0,
	`categoriaStorage` int DEFAULT 0,
	`categoriaProcessamento` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `creditos_resumo_diario_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `creditos_saldo` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conta` varchar(100) NOT NULL DEFAULT 'principal',
	`saldoAtual` int NOT NULL DEFAULT 0,
	`totalAdicionado` int NOT NULL DEFAULT 0,
	`totalConsumido` int NOT NULL DEFAULT 0,
	`limiteAlerta` int DEFAULT 100,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `creditos_saldo_id` PRIMARY KEY(`id`),
	CONSTRAINT `creditos_saldo_conta_unique` UNIQUE(`conta`)
);
--> statement-breakpoint
CREATE TABLE `creditos_transacoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conta` varchar(100) NOT NULL DEFAULT 'principal',
	`tipo` enum('credito','debito','ajuste') NOT NULL,
	`operacao` varchar(100) NOT NULL,
	`quantidade` int NOT NULL,
	`saldoApos` int NOT NULL,
	`descricao` text,
	`metadata` text,
	`userId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `creditos_transacoes_id` PRIMARY KEY(`id`)
);
