# Análise processual completa e estratégia executiva

**Processo:** 5758322-28.2025.8.09.0051  
**Autos principais:** 5243879-66.2024.8.09.0051  
**Órgão julgador:** 1ª Vara Cível da Comarca de Aparecida de Goiânia/GO  
**Exequente:** Paulo da Silva Melo Filho  
**Executados remanescentes:** Banco Bradesco S.A. e Banco Santander (Brasil) S.A.  
**Objeto:** cumprimento de sentença de honorários advocatícios sucumbenciais  
**Fonte integral:** exportação do PROJUDI com 365 páginas, contendo os Eventos 1 a 167, extraída em 01/09/2026.  
**Hash SHA-256 do PDF-fonte:** `a6cbd7719f67117322acb82f16e3a673211d24f3dc7532c9becad81dfda7aa1d`  
**Data de corte:** 01/09/2026

## 1. Conclusão executiva

O processo já aparecia nas habilidades e bases conectadas, mas **não estava incorporado de forma completa e confiável**. A habilidade `melo-preda-master` continha somente uma referência de monitoramento ao número 5758322.28; os arquivos compartilhados `Untitled (43)` e `Untitled (49)` registravam apenas uma publicação de abril de 2026. No backup GitHub, o repositório `melo-preda-juridico` e sua cópia `peti-o` classificavam incorretamente o feito como **superendividamento em fase de conhecimento**, e o `monitor-projudi-pro` possuía referências técnicas e movimentações, sem dossiê jurídico integral. A presente análise substitui esses registros incompletos como fonte de verdade do caso.

A leitura integral confirma que a penhora de **R$ 51.460,16** realizada no Banco Bradesco no Evento 47 **não pode ser tratada como crédito do exequente**: a decisão do Evento 98 reconheceu a nulidade da intimação, determinou o desbloqueio, e o Agravo de Instrumento nº 5418578-65.2026.8.09.0051 manteve essa solução. A decisão saneadora do Evento 159 reiterou a restituição ao Bradesco e mandou renovar sua intimação para pagamento voluntário.

O Bradesco foi intimado em 06/08/2026 (Evento 165) e depositou apenas **R$ 20.310,15** em 18/08/2026, juntando o comprovante no Evento 167. O pagamento foi **parcial** porque: (i) calculou somente 1/3 de R$ 60.930,46; (ii) ignorou a majoração recursal dos honorários do título de 10% para 15%; (iii) ignorou a solidariedade reconhecida no próprio processo; e (iv) não alcançou o saldo global do crédito após os abatimentos. Como o pagamento ocorreu dentro do prazo renovado, a estratégia tecnicamente mais segura é aplicar a multa de 10% e os honorários de 10% do art. 523, §§ 1º e 2º, do CPC apenas sobre o restante não pago.

Com base na atualização de julho de 2026 apresentada pelo próprio Bradesco, ajustada para refletir o título de 15%, o crédito-base é de **R$ 91.395,69**. Abatidos os valores efetivamente recebidos ou depositados em juízo — **R$ 19.765,92**, **R$ 12.119,17**, **R$ 12.278,26** e **R$ 20.310,15** —, resta principal de **R$ 26.922,19**. Acrescidos multa e honorários de 10% sobre esse remanescente, o saldo executivo mínimo em 01/09/2026 é de **R$ 32.306,63**, sem prejuízo de correção e juros posteriores.

Existem dois valores incontroversos que devem ser liberados imediatamente: **R$ 12.278,26 + rendimentos**, depositados pelo Santander no Evento 135, cujo alvará foi expressamente determinado no Evento 159, item “c”; e **R$ 20.310,15 + rendimentos**, depositados pelo Bradesco e juntados no Evento 167. Esses depósitos totalizam nominalmente **R$ 32.588,41**, mas não substituem a penhora do saldo de R$ 32.306,63, porque já foram abatidos na memória de cálculo. A nova ordem SISBAJUD, portanto, não causa excesso.

## 2. Diagnóstico da base de conhecimento preexistente

| Base verificada | Situação encontrada | Avaliação |
|---|---|---|
| `melo-preda-master/references/base_conhecimento.md` | Número 5758322.28 em lista de intimações pendentes de abril de 2026 | Índice simples, sem análise de mérito, eventos posteriores ou cálculos |
| Projeto compartilhado — `Untitled (43)` | Publicação de 16/04/2026 e orientação genérica para analisar | Incompleto |
| Projeto compartilhado — `Untitled (49)` | Relatório diário contendo o processo entre 14 publicações | Monitoramento, não conhecimento processual consolidado |
| GitHub — `melo-preda-juridico` / `peti-o` | Cadastro como “Superendividamento”, fase “Conhecimento”, além de análise incompatível com os autos | **Materialmente incorreto** |
| GitHub — `monitor-projudi-pro` | Ocorrências em testes, scripts, consultas e relatório de monitoramento | Útil para automação, mas sem dossiê jurídico integral |
| PDF anexo de 01/09/2026 | Autos completos até o Evento 167 | Fonte primária adotada |

> **Diretriz de uso futuro:** qualquer registro que trate o processo 5758322-28.2025.8.09.0051 como ação de superendividamento deve ser desconsiderado. O feito é cumprimento de sentença de honorários sucumbenciais, derivado dos autos 5243879-66.2024.8.09.0051.

## 3. Título executivo e regime de responsabilidade

Nos autos principais, os honorários sucumbenciais foram fixados inicialmente em 10% sobre o valor atualizado da causa. O julgamento das apelações manteve o resultado e majorou a verba para **15%**, nos termos do art. 85, § 11, do CPC. A base de cálculo adotada pelas partes é o valor atualizado da causa.

O título não distribuiu expressamente a responsabilidade proporcional entre os litisconsortes vencidos. Nessa situação, o art. 87, § 2º, do CPC estabelece a responsabilidade solidária. A magistrada e as manifestações anteriores do exequente também trataram Bradesco e Santander como devedores remanescentes do saldo, após a quitação específica conferida à Caixa.

A quitação da Caixa foi homologada no Evento 81 e alcançou somente sua participação. Ela não fracionou retroativamente a obrigação dos executados remanescentes e não transformou o crédito global em três dívidas estanques. O pagamento de 1/3 pelo Bradesco, portanto, é mero pagamento parcial, com direito de regresso a ser resolvido entre os coobrigados, sem prejuízo do direito do credor de exigir a integralidade do saldo de qualquer deles.

## 4. Cronologia processual crítica

| Marco | Data | Conteúdo e efeito |
|---|---:|---|
| Ajuizamento do cumprimento | 17/09/2025 | Cobrança de honorários sucumbenciais contra Caixa, Bradesco e Santander |
| Intimações iniciais | nov./2025 | Executados intimados para pagamento; posteriormente reconhecido vício específico quanto ao Bradesco |
| Primeira decisão de penhora | Evento 32 | Autorizada pesquisa e constrição de ativos via SISBAJUD |
| Bloqueio Bradesco | Eventos 46/47 | R$ 51.460,16 bloqueados, mas a constrição seria posteriormente desconstituída |
| Primeiro alvará Caixa | Eventos 41/59 | Levantamento efetivo de R$ 19.765,92 |
| Decisão Evento 69 | 31/03/2026 | Reconheceu preclusão então atribuída ao Bradesco e determinou levantamento; superada depois pela nulidade |
| Depósito complementar Caixa | Evento 78 | Depósito nominal de R$ 11.853,42 |
| Decisão Evento 81 | 17/04/2026 | Homologou quitação da Caixa; determinou alvará do depósito complementar e prosseguimento contra Bradesco e Santander |
| Decisão Evento 98 | 14/04/2026 | Reconheceu nulidade da intimação do Bradesco; anulou atos relativos ao banco e determinou desbloqueio de R$ 51.460,16 |
| Trânsito em julgado dos autos principais | 30/04/2026 | Consolidou o título, inclusive a majoração recursal para 15% |
| Depósito Santander | Eventos 133/135 | R$ 12.278,26 depositados voluntariamente |
| Agravo do exequente | AI 5418578-65.2026.8.09.0051 | TJGO manteve a nulidade e a devolução do bloqueio do Bradesco |
| Segundo alvará Caixa | Eventos 153/158 | Alvará de R$ 12.119,17 cumprido em 04/08/2026 |
| Decisão saneadora | Evento 159, 06/08/2026 | Rejeitou impugnação do Santander; determinou seu alvará; confirmou devolução ao Bradesco; renovou intimação do Bradesco por 15 dias |
| Intimação do Bradesco | Evento 165, 06/08/2026 | Intimação efetivada no advogado indicado |
| Petição estranha ao feito | Evento 166, 18/08/2026 | Santander juntou peça sobre crédito consignado e repactuação, materialmente alheia a este cumprimento |
| Pagamento Bradesco | 18/08/2026; juntada no Evento 167 em 31/08/2026 | R$ 20.310,15, equivalentes a 1/3 do valor de R$ 60.930,46 calculado pelo banco |

## 5. Situação individual dos depósitos e alvarás

| Origem | Valor nominal/efetivo | Situação em 01/09/2026 | Tratamento no cálculo |
|---|---:|---|---|
| Caixa — primeiro depósito | R$ 19.765,92 | Alvará cumprido (Evento 59) | Abatido |
| Caixa — depósito complementar | R$ 12.119,17 | Alvará expedido no Evento 153 e cumprido no Evento 158 | Abatido pelo valor efetivo do alvará |
| Bradesco — antiga penhora SISBAJUD | R$ 51.460,16 | **Devolvida/desbloqueada** por força dos Eventos 98 e 159 e do acórdão do AI | **Não abatido e não requerido** |
| Santander — depósito voluntário | R$ 12.278,26 + rendimentos | Incontroverso; alvará determinado no Evento 159, item “c”; sem alvará cumprido nos autos exportados | Abatido para evitar excesso; pedir expedição/cumprimento imediato |
| Bradesco — pagamento parcial | R$ 20.310,15 + rendimentos | Depositado em 18/08/2026 e juntado no Evento 167; ainda sem ordem de levantamento nos autos exportados | Abatido para evitar excesso; pedir alvará imediato |

### 5.1. Falha específica quanto ao alvará do Santander

A certidão do Evento 149 afirmou que havia alvará eletrônico aguardando assinatura da magistrada. Porém, o alvará expedido no Evento 153 e cumprido no Evento 158 foi o segundo alvará da Caixa, no valor de R$ 12.119,17. A decisão do Evento 159 voltou a determinar expressamente a expedição de alvará do Santander. Até o Evento 167, não há prova de sua expedição ou cumprimento.

Assim, deve-se pedir: (i) certificação do saldo atualizado da conta judicial vinculada ao depósito do Evento 135; (ii) expedição, assinatura e transmissão do alvará; e (iii) transferência à conta bancária já informada nos autos.

### 5.2. Pagamento parcial do Bradesco

O Bradesco apresentou uma planilha com os seguintes parâmetros: valor singelo de R$ 58.403,04; INPC até julho de 2026; valor atualizado de R$ 60.930,46; nenhuma multa; nenhum honorário executivo. Em seguida depositou 1/3, isto é, R$ 20.310,15.

A conta é insuficiente porque o valor de R$ 58.403,04 correspondia aos honorários originários de 10%. Como o título foi majorado para 15%, o valor de julho deve ser multiplicado por 1,5, alcançando R$ 91.395,69. Também não há distribuição expressa por réu no título; logo, o rateio unilateral de 1/3 é incompatível com o art. 87, § 2º, do CPC.

O comprovante TED do Evento 167 contém referências internas aos autos principais e à “19ª Vara Cível Ambiental/Goiânia”, enquanto a guia judicial identifica corretamente este cumprimento e a 1ª Vara Cível de Aparecida de Goiânia. A guia também identifica o autor material dos autos principais, Hélio Rodrigues Soares. Para eliminar dúvida operacional, convém requerer que a UPJ certifique a vinculação do identificador `081250000032116745` a este processo antes da expedição do alvará.

## 6. Memória financeira consolidada

### 6.1. Crédito do título atualizado até julho de 2026

| Componente | Fórmula | Valor |
|---|---:|---:|
| Honorários originários de 10%, atualizados pelo Bradesco | Base informada no Evento 167 | R$ 60.930,46 |
| Majoração recursal adicional de 5 pontos percentuais | R$ 60.930,46 × 50% | R$ 30.465,23 |
| Honorários sucumbenciais do título a 15% | R$ 60.930,46 × 1,5 | **R$ 91.395,69** |

### 6.2. Abatimentos

| Pagamento ou depósito | Valor abatido |
|---|---:|
| Caixa — primeiro alvará efetivamente recebido | R$ 19.765,92 |
| Caixa — segundo alvará efetivamente cumprido | R$ 12.119,17 |
| Santander — depósito incontroverso pendente de alvará | R$ 12.278,26 |
| Bradesco — depósito parcial pendente de alvará | R$ 20.310,15 |
| **Total abatido** | **R$ 64.473,50** |

### 6.3. Saldo executivo

| Componente | Valor |
|---|---:|
| Crédito do título a 15% | R$ 91.395,69 |
| (-) pagamentos e depósitos considerados | R$ 64.473,50 |
| Principal remanescente | **R$ 26.922,19** |
| Multa do art. 523, §§ 1º e 2º, CPC — 10% | R$ 2.692,22 |
| Honorários executivos do art. 523, §§ 1º e 2º, CPC — 10% | R$ 2.692,22 |
| **Saldo indicado para nova penhora** | **R$ 32.306,63** |

**Premissa conservadora adotada:** embora os atos anteriores já tenham discutido penalidades do art. 523, o cálculo atual não duplica encargos. Aplica a multa e os honorários somente sobre o saldo que restou após o pagamento parcial efetuado dentro do prazo renovado do Bradesco, conforme o art. 523, § 2º, do CPC.

**Atualização posterior:** o saldo deve continuar acrescido de correção monetária e juros até a efetiva satisfação. Como o índice diário/oficial da contadoria não está reproduzido integralmente no PDF, a planilha usa a data-base do cálculo do próprio Bradesco e explicita a necessidade de atualização pela contadoria ou pelo índice judicial adotado no TJGO.

## 7. Fundamentos jurídicos centrais

### 7.1. Solidariedade e impossibilidade de rateio unilateral

O art. 87, § 2º, do CPC determina que, ausente distribuição expressa da responsabilidade na sentença, os litisconsortes vencidos respondem solidariamente pelas despesas e honorários. O art. 275 do Código Civil permite ao credor exigir de um, de alguns ou de todos os devedores, parcial ou totalmente, a dívida comum. O depósito de 1/3 não extingue a obrigação do Bradesco perante o credor.

### 7.2. Pagamento parcial e encargos sobre o restante

O art. 523, § 2º, do CPC dispõe que, efetuado pagamento parcial no prazo, a multa e os honorários do § 1º incidem sobre o restante. O STJ reafirmou a regra no REsp 1.693.784/DF: o pagamento tempestivo, porém parcial, conduz à incidência das duas verbas sobre o remanescente a ser pago por qualquer litisconsorte. O REsp 1.757.033/DF, Rel. Min. Ricardo Villas Bôas Cueva, Terceira Turma, julgado em 09/10/2018, DJe 15/10/2018, também esclarece que multa e honorários possuem a mesma base — o débito não pago — sem incidência de honorários sobre a própria multa.

### 7.3. Penhora eletrônica imediata

Nos termos do art. 523, § 3º, do CPC, não havendo pagamento integral, seguem-se os atos de penhora e expropriação. O art. 854 autoriza a indisponibilidade eletrônica de ativos sem prévia ciência do executado, limitada ao valor da execução. Como Santander e Bradesco respondem pelo saldo e ambos já foram validamente intimados, cabe nova ordem SISBAJUD, preferencialmente com reiteração automática, limitada a R$ 32.306,63, atualizável.

### 7.4. Liberação imediata dos valores incontroversos

O art. 906, parágrafo único, do CPC permite a substituição do mandado de levantamento por transferência eletrônica para a conta indicada pelo exequente. O depósito do Santander foi declarado incontroverso no Evento 159; o depósito do Bradesco foi apresentado pelo próprio executado como cumprimento. Não existe utilidade em manter as duas quantias em conta judicial enquanto subsiste saldo remanescente.

Os honorários pertencem ao advogado e têm natureza alimentar, conforme o art. 85, § 14, do CPC e a Súmula Vinculante 47 do STF. Essa natureza reforça a urgência material do cumprimento de ordens de levantamento já proferidas.

## 8. Pendências objetivas a reiterar

1. **Expedir e cumprir o alvará do Santander**, no valor de R$ 12.278,26 acrescido dos rendimentos, já determinado no Evento 159, item “c”.
2. **Expedir alvará do novo depósito do Bradesco**, no valor de R$ 20.310,15 acrescido dos rendimentos, após certificação de sua vinculação à conta judicial correta.
3. **Certificar a situação de todas as contas judiciais**, com saldo, identificador, instituição depositária e eventual alvará pendente.
4. **Realizar nova penhora SISBAJUD** contra Bradesco e Santander pelo saldo de R$ 32.306,63, com reiteração automática, sem duplicar os depósitos já abatidos.
5. **Desconsiderar o Evento 166** para fins deste cumprimento, pois trata de contrato consignado e repactuação estranhos ao objeto.
6. **Não reiterar o alvará dos antigos R$ 51.460,16**, porque a constrição foi anulada e restituída ao Bradesco.
7. **Não reconhecer quitação do Bradesco** pelo depósito de R$ 20.310,15, pois se trata de pagamento parcial.
8. **Adequar a classe processual para cumprimento definitivo**, caso a serventia ainda mantenha a etiqueta de cumprimento provisório após o trânsito em julgado dos autos principais.

## 9. Estratégia da manifestação

A manifestação deve ser respeitosa, mas firme. O ponto central não é reabrir o debate sobre a antiga penhora de R$ 51.460,16, já encerrado pelo acórdão, mas demonstrar que a decisão saneadora do Evento 159 foi cumprida apenas parcialmente: houve novo depósito do Bradesco, porém persiste alvará do Santander sem execução e não houve satisfação integral da obrigação.

A peça deve abrir com um quadro operacional para evitar nova confusão da UPJ: valores efetivamente recebidos, depósitos pendentes de levantamento e saldo a penhorar. Em seguida, deve mostrar que o Bradesco calculou 1/3 de uma base de 10%, apesar do título majorado para 15% e da solidariedade. A memória deve abater antecipadamente os dois depósitos pendentes, deixando claro que alvarás e penhora são providências cumulativas, mas não geram duplicidade.

A redação não deve acusar pessoalmente a magistrada ou os servidores. Deve registrar objetivamente que as ordens ainda não foram materializadas e que as reiterações anteriores não produziram o cumprimento integral. Essa formulação preserva a firmeza do pedido sem criar resistência institucional desnecessária.

## 10. Próximo gatilho de atualização

Este dossiê deve ser atualizado quando ocorrer qualquer dos seguintes eventos: (i) expedição ou cumprimento dos alvarás do Santander e do Bradesco; (ii) decisão sobre o saldo e os encargos; (iii) retorno do SISBAJUD; (iv) impugnação dos novos cálculos; ou (v) efetivo pagamento integral. Todo novo valor recebido deve ser abatido na data do crédito, mantendo separados **valor depositado**, **valor levantado** e **saldo penhorado**.

## 11. Fontes oficiais verificadas

1. [Código de Processo Civil — arts. 85, 87, 523, 524, 854 e 906](https://normas.leg.br/?urn=urn:lex:br:federal:lei:2015-03-16;13105), acesso em 01/09/2026.
2. [REsp 1.757.033/DF — Superior Tribunal de Justiça](https://www.stj.jus.br/websecstj/cgi/revista/REJ.cgi/ATC?seq=87749502&tipo=91&nreg=201801903491&SeqCgrmaSessao=&CodOrgaoJgdr=&dt=20181015&formato=PDF&salvar=false), Rel. Min. Ricardo Villas Bôas Cueva, Terceira Turma, DJe 15/10/2018.
3. [Súmula Vinculante 47 — Supremo Tribunal Federal](https://portal.stf.jus.br/jurisprudencia/sumariosumulas.asp?base=26&sumula=2504), acesso em 01/09/2026.

---

**Status do conhecimento:** validado contra os autos completos até o Evento 167.  
**Regra de precedência:** esta análise prevalece sobre os registros legados que classificam o processo como superendividamento ou fase de conhecimento.
