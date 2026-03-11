CREATE TABLE `historico_correcoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tipo` varchar(100) NOT NULL,
	`acao` varchar(255) NOT NULL,
	`detalhes` text,
	`itensAfetados` int DEFAULT 0,
	`statusCorrecao` enum('sucesso','parcial','erro') NOT NULL DEFAULT 'sucesso',
	`executadoPor` varchar(255),
	`dadosAntes` json,
	`dadosDepois` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `historico_correcoes_id` PRIMARY KEY(`id`)
);
