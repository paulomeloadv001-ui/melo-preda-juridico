CREATE TABLE `analise_geral` (
	`id` int AUTO_INCREMENT NOT NULL,
	`chave` varchar(100) NOT NULL,
	`titulo` varchar(255) NOT NULL,
	`categoria` varchar(100) NOT NULL,
	`conteudo` text NOT NULL,
	`dados` json,
	`ordem` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `analise_geral_id` PRIMARY KEY(`id`),
	CONSTRAINT `analise_geral_chave_unique` UNIQUE(`chave`)
);
