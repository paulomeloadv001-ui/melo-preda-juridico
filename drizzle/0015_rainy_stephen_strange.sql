ALTER TABLE `documentos` ADD `fileHash` varchar(64);--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `especialidade` varchar(255);--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `fotoUrl` text;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `bio` text;--> statement-breakpoint
ALTER TABLE `users` ADD `profileCompleted` int DEFAULT 0 NOT NULL;