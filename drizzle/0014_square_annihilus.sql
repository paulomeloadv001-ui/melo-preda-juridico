CREATE TABLE `perfis_acesso` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(100) NOT NULL,
	`descricao` text,
	`cor` varchar(20) DEFAULT 'blue',
	`icone` varchar(50) DEFAULT 'User',
	`permissoes` text NOT NULL,
	`padrao` int NOT NULL DEFAULT 0,
	`criadoPor` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `perfis_acesso_id` PRIMARY KEY(`id`),
	CONSTRAINT `perfis_acesso_nome_unique` UNIQUE(`nome`)
);
