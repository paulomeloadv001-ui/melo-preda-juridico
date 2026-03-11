CREATE TABLE `access_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nomeCompleto` varchar(255) NOT NULL,
	`cpf` varchar(20) NOT NULL,
	`email` varchar(320) NOT NULL,
	`celular` varchar(20) NOT NULL,
	`motivo` text,
	`status` enum('pendente','aprovado','rejeitado') NOT NULL DEFAULT 'pendente',
	`aprovadoPor` int,
	`aprovadoEm` timestamp,
	`observacoesAdmin` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `access_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`cpf` varchar(20),
	`celular` varchar(20),
	`cargo` varchar(100),
	`oab` varchar(30),
	`permissoes` text,
	`ativo` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_profiles_id` PRIMARY KEY(`id`)
);
