# Melo & Preda — Arquitetura da Plataforma Jurídica

Visual style: Professional, dark theme with gold/amber accents. Clean corporate design with the Melo & Preda brand identity. Use icons and diagrams. Serif font for headings, sans-serif for body.

---

## Slide 1: Capa

# Melo & Preda — Sistema Jurídico Integrado
## Arquitetura Completa: Backend & Frontend

Dr. Paulo Roberto de Melo Filho — OAB/GO 40.559

Plataforma de análise técnica e aprofundada de processos judiciais com peticionamento fundamentado, integração com IA e automação completa.

Março 2026

---

## Slide 2: A plataforma processa 2.132 registros em 30 tabelas com 17 módulos funcionais

### Visão Geral em Números

A plataforma Melo & Preda é um sistema jurídico completo que integra gestão de clientes, processos, peticionamento via IA e controle financeiro em uma única solução.

| Indicador | Valor |
|---|---|
| Clientes Ativos | 78 |
| Processos Judiciais | 109 |
| Estratégias Processuais | 115 |
| Conhecimentos Jurídicos | 96 |
| Prazos Processuais | 318 |
| Tabelas no Banco | 30 |
| Total de Registros | 2.132 |
| Módulos Funcionais | 17 |

---

## Slide 3: Stack tecnológico combina React 19, tRPC 11 e MySQL com tipagem ponta a ponta

### Tecnologias Utilizadas

O sistema utiliza uma stack moderna com tipagem end-to-end, garantindo segurança e produtividade no desenvolvimento.

**Frontend:** React 19 + Tailwind CSS 4 + shadcn/ui + Wouter + Recharts + Lucide Icons

**Backend:** Express 4 + tRPC 11 + Drizzle ORM + Superjson + Zod

**Banco de Dados:** MySQL 8 (TiDB) — 30 tabelas, 622 linhas de schema

**IA:** LLM OpenAI-compatible — extração de PDFs, geração de petições, estratégias, agente conversacional

**Infraestrutura:** Node.js 22 + Vite + Vitest (183 testes) + S3 Storage

---

## Slide 4: O backend possui 8.049 linhas de código com 80+ procedures em 17 routers tRPC

### Arquitetura do Backend

O backend é construído sobre tRPC, eliminando a necessidade de REST routes manuais. Cada procedure é tipada de ponta a ponta com Zod para validação de entrada e Drizzle ORM para queries.

**Estrutura de arquivos:**

- `server/routers.ts` — 8.049 linhas, 17 routers, 80+ procedures
- `server/db.ts` — 92 linhas, query helpers reutilizáveis
- `server/_core/` — Framework: OAuth, contexto, LLM, storage, notificações
- `drizzle/schema.ts` — 622 linhas, 30 tabelas com relações

**Níveis de proteção:**

- `publicProcedure` — Rotas públicas (login, status)
- `protectedProcedure` — Requer autenticação (maioria das rotas)
- `adminProcedure` — Apenas administradores (31 rotas sensíveis)

---

## Slide 5: 17 routers cobrem todo o fluxo jurídico — de upload de PDF até geração de petição

### Mapa de Routers do Backend

Cada router encapsula um domínio funcional completo com procedures de leitura, escrita e ações especializadas.

| Router | Função Principal | Procedures |
|---|---|---|
| auth | Autenticação OAuth + sessão | me, logout |
| clientes | CRUD completo de clientes | list, get, create, update, delete |
| processos | Gestão de processos judiciais | list, get, create, update, delete, classificar |
| financeiro | Dados financeiros e margem | list, get, create, update |
| emprestimos | Empréstimos consignados | list, get, create, update |
| estrategias | Estratégias via IA | list, get, create, gerar |
| conhecimentos | Base jurídica | list, get, create, update, delete |
| peticionamento | Petições via IA | list, get, gerar, download |
| prazos | Prazos processuais | list, get, create, verificar |
| agente | Agente IA conversacional | chat, historico, config |
| relatorios | Relatórios analíticos | list, get, gerar (6 tipos) |
| acessos | Gestão de usuários | users, permissions, convites, audit |
| upload | Upload e extração de PDFs | processar, extrair |
| correcao | Correção e limpeza de dados | executar, historico |
| integracao | API JUSCONSIG 3.0 | sync, status |
| jobs | Fila de tarefas background | list, get, create, update |
| system | Notificações e stats | notifyOwner, stats |

---

## Slide 6: O Agente IA carrega panorama global de 78 clientes e 109 processos em cada conversa

### Integração com Inteligência Artificial

O sistema utiliza LLM em 5 pontos críticos do fluxo, com o Agente IA tendo acesso completo a todos os dados do escritório em tempo real.

**1. Extração de PDFs** — Upload de processos com extração automática de dados (cliente, CNJ, partes, valores, movimentações)

**2. Geração de Estratégias** — Análise processual com tese, fundamentação, jurisprudência, riscos e recomendação

**3. Peticionamento** — Geração de petições completas usando 5 templates (Agravo, Cumprimento, Querela Nullitatis, Obrigação de Fazer, Embargos)

**4. Classificação Automática** — Classificação de tipos de ação processual via IA

**5. Agente Conversacional** — Carrega panorama global (78 clientes, 109 processos, R$ 79.8M em causas, 96 conhecimentos, 115 estratégias) + base de conhecimentos completa sem truncamento

---

## Slide 7: O frontend possui 21 páginas e 59 componentes organizados em DashboardLayout

### Arquitetura do Frontend

O frontend é uma SPA React 19 com Tailwind CSS 4, organizada em DashboardLayout com sidebar de navegação e 17 módulos acessíveis.

**Estrutura:**

- `client/src/pages/` — 21 páginas (.tsx)
- `client/src/components/` — 59 componentes reutilizáveis
- `client/src/components/ui/` — shadcn/ui (Button, Card, Dialog, Table, Select, Tabs, etc.)
- `client/src/lib/trpc.ts` — Cliente tRPC tipado
- `client/src/App.tsx` — Roteamento com Wouter
- `client/src/index.css` — Tema global com variáveis CSS

**Design System:** Cores quentes com fundo claro, acentos em dourado/âmbar. Tipografia profissional. Componentes shadcn/ui para consistência visual.

---

## Slide 8: Navegação organizada em 4 seções — Painel, Inteligência, Ferramentas e Gestão

### Mapa de Páginas do Frontend

A sidebar organiza os 17 módulos em seções lógicas que refletem o fluxo de trabalho do escritório.

**PAINEL:** Dashboard (Home) — Visão geral com métricas, cards de KPI e atalhos rápidos | Métricas — Análise detalhada com gráficos Recharts | Upload — Importação de PDFs com extração IA | Clientes — Lista e perfil individual com processos | Prazos — Controle de vencimentos com alertas | Acompanhamento — Monitoramento PJe

**INTELIGÊNCIA:** Agente IA — Chat conversacional com conhecimento total | Petições — Geração via IA com 5 templates | Base Jurídica — 96 conhecimentos categorizados | Relatórios — 6 tipos de relatório analítico

**FERRAMENTAS:** Correção — Limpeza e normalização de dados | Enriquecimento — Preenchimento automático de CPFs | Exportação — Export em múltiplos formatos | Preenchimento BD — Geração automática de estratégias e prazos | Fila de Jobs — Monitoramento de tarefas | JUSCONSIG — Integração API

**GESTÃO:** Acessos — Usuários, permissões, convites, auditoria

---

## Slide 9: Fluxo de dados tipado de ponta a ponta — do schema ao componente React

### Fluxo de Dados End-to-End

O tRPC garante tipagem completa desde o banco de dados até o componente React, eliminando erros de integração.

**Camada 1 — Schema (Drizzle):** `drizzle/schema.ts` define 30 tabelas com tipos TypeScript. Cada tabela gera tipos de inserção e seleção automaticamente.

**Camada 2 — Query Helpers (db.ts):** Funções reutilizáveis que encapsulam queries Drizzle. Retornam dados tipados diretamente.

**Camada 3 — Procedures (routers.ts):** tRPC procedures com validação Zod na entrada. `protectedProcedure` injeta `ctx.user`. Superjson serializa Date, Decimal automaticamente.

**Camada 4 — Frontend (trpc hooks):** `trpc.clientes.list.useQuery()` retorna dados tipados. `trpc.estrategias.gerar.useMutation()` para ações. Optimistic updates para UX instantânea.

---

## Slide 10: O banco de dados possui 30 tabelas com 622 linhas de schema Drizzle

### Modelo de Dados

O schema Drizzle define 30 tabelas organizadas em 7 domínios funcionais, com relações e constraints.

**Autenticação (6 tabelas):** users, user_profiles, user_permissions, access_requests, convites, audit_log

**Clientes e Processos (4 tabelas):** clientes, processos, partes_processuais, movimentacoes

**Financeiro (3 tabelas):** dados_financeiros, emprestimos_consignados, movimentacoes_financeiras

**Jurídico (5 tabelas):** estrategias, conhecimentos, cumprimentos_sentenca, prazos_processuais, analise_geral

**Peticionamento (3 tabelas):** templates_peticao, peticoes_geradas, anexos_peticao

**IA e Documentos (3 tabelas):** agente_ia_config, agente_ia_historico, documentos

**Sistema (6 tabelas):** jobs, sync_log, historico_correcoes, notificacoes, relatorios, __drizzle_migrations

---

## Slide 11: Sistema de segurança com 3 níveis de acesso e 31 rotas protegidas por adminProcedure

### Segurança e Controle de Acesso

A plataforma implementa controle de acesso em 3 camadas: autenticação OAuth, autorização por papel e permissões granulares por módulo.

**Camada 1 — Autenticação:** OAuth 2.0 com cookie de sessão JWT. Login via Manus OAuth Portal.

**Camada 2 — Autorização por Papel:** 3 níveis: admin, user, viewer. 31 rotas sensíveis protegidas com `adminProcedure` (delete, merge, correções em lote).

**Camada 3 — Permissões Granulares:** 16 módulos x 4 flags (visualizar, editar, excluir, exportar). Tabela `user_permissions` com configuração individual por usuário.

**Auditoria:** Log completo de ações com user_id, ação, detalhes, IP e timestamp. Sistema de convites com token e expiração. Solicitações de acesso com aprovação/rejeição.

---

## Slide 12: Plataforma 100% exportável — 9 pacotes desacoplados prontos para servidor externo

### Exportação e Deploy

A plataforma foi projetada para ser completamente portável, com 9 pacotes desacoplados prontos para reutilização em qualquer servidor externo.

| Pacote | Conteúdo | Tamanho |
|---|---|---|
| Banco de Dados | 30 tabelas SQL + JSON | 1.9 MB |
| Base Conhecimentos | 96 conhecimentos jurídicos | 234 KB |
| Agente IA | Configs, prompts, templates | 81 KB |
| Clientes | 78 fichas individuais | 790 KB |
| Backend | tRPC + Express + Drizzle | 131 KB |
| Frontend | React 19 + Tailwind 4 | 221 KB |
| Schema | Drizzle ORM + migrations | 56 KB |
| Deploy | Docker + scripts + .env | 8.3 KB |
| Documentação | README + Panorama | 5.4 KB |

**Deploy:** Docker Compose (MySQL + App) ou manual (Node.js 22 + MySQL 8). Instruções completas no README.

---

## Slide 13: 183 testes automatizados garantem a integridade de todos os módulos

### Qualidade e Testes

O sistema possui cobertura de testes com Vitest em 11 arquivos de teste, validando autenticação, CRUD, permissões, IA e integrações.

**11 arquivos de teste:**

- `auth.logout.test.ts` — Autenticação e sessão
- `acessos.test.ts` — 47 testes de gestão de acessos e permissões
- `clientes.test.ts` — CRUD de clientes
- `processos.test.ts` — CRUD de processos
- `estrategias.test.ts` — Geração de estratégias via IA
- `conhecimentos.test.ts` — Base de conhecimentos
- `peticionamento.test.ts` — Geração de petições
- `prazos.test.ts` — Prazos processuais
- `relatorios.test.ts` — Relatórios analíticos
- `upload.test.ts` — Upload e extração de PDFs
- `integracao.test.ts` — Integração JUSCONSIG

**Resultado:** 183/183 testes passando em 40 segundos. Cobertura de rotas públicas, protegidas e administrativas.

---

## Slide 14: Encerramento

# Melo & Preda — Sistema Jurídico Integrado

## Plataforma completa, desacoplada e pronta para escalar

8.049 linhas de backend | 21 páginas | 30 tabelas | 183 testes | 17 módulos | IA integrada

Uma solução jurídica de ponta a ponta: do upload do PDF à petição fundamentada, com inteligência artificial que estudou cada processo do escritório.

Dr. Paulo Roberto de Melo Filho — OAB/GO 40.559
Melo & Preda Advogados
