CREATE TABLE `relatorios` (
	`id` int AUTO_INCREMENT NOT NULL,
	`titulo` varchar(500) NOT NULL,
	`categoria` varchar(100) NOT NULL,
	`subcategoria` varchar(255),
	`descricao` text,
	`tipoRelatorio` varchar(100) NOT NULL,
	`formato` varchar(20) DEFAULT 'PDF',
	`storageKey` varchar(500),
	`storageUrl` text,
	`tamanho` int,
	`dadosJson` json,
	`geradoPor` varchar(100) DEFAULT 'Sistema',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `relatorios_id` PRIMARY KEY(`id`)
);
