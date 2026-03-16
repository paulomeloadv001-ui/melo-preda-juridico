CREATE TABLE `peticao_versoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`peticaoId` int NOT NULL,
	`versao` int NOT NULL,
	`conteudoVersao` text NOT NULL,
	`instrucoesVersao` text,
	`diffVersao` text,
	`docxUrlVersao` text,
	`criadoPorVersao` varchar(255),
	`createdAtVersao` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `peticao_versoes_id` PRIMARY KEY(`id`)
);
