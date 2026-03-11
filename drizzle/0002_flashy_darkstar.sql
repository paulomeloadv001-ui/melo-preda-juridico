ALTER TABLE `clientes` MODIFY COLUMN `estado` varchar(100);--> statement-breakpoint
ALTER TABLE `processos` MODIFY COLUMN `faseAtual` varchar(100) DEFAULT 'Conhecimento';--> statement-breakpoint
ALTER TABLE `processos` MODIFY COLUMN `statusProcesso` varchar(100) DEFAULT 'Ativo';