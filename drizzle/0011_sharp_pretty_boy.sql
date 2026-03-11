CREATE TABLE `notificacoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tipoNotif` enum('honorario_status','honorario_novo','prazo_vencendo','prazo_vencido','importacao_concluida','importacao_erro','correcao_executada','novo_cliente','novo_processo','acesso_solicitado','sistema') NOT NULL,
	`prioridadeNotif` enum('baixa','normal','alta','urgente') NOT NULL DEFAULT 'normal',
	`tituloNotif` varchar(500) NOT NULL,
	`mensagemNotif` text NOT NULL,
	`clienteIdNotif` int,
	`processoIdNotif` int,
	`movFinanceiraIdNotif` int,
	`prazoIdNotif` int,
	`linkUrl` varchar(500),
	`lidaNotif` int NOT NULL DEFAULT 0,
	`lidaEm` timestamp,
	`icone` varchar(50),
	`corNotif` varchar(20),
	`dadosExtras` json,
	`createdAtNotif` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notificacoes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `prazos_processuais` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processoIdPrazo` int NOT NULL,
	`clienteIdPrazo` int NOT NULL,
	`tipoPrazo` enum('recurso','contestacao','manifestacao','cumprimento','audiencia','pericia','diligencia','pagamento','levantamento','outro') NOT NULL,
	`tituloPrazo` varchar(500) NOT NULL,
	`descricaoPrazo` text,
	`dataVencimento` timestamp NOT NULL,
	`diasAntecedencia` int DEFAULT 3,
	`statusPrazo` enum('pendente','cumprido','vencido','cancelado') NOT NULL DEFAULT 'pendente',
	`notificacaoEnviada` int DEFAULT 0,
	`observacoesPrazo` text,
	`createdAtPrazo` timestamp NOT NULL DEFAULT (now()),
	`updatedAtPrazo` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `prazos_processuais_id` PRIMARY KEY(`id`)
);
