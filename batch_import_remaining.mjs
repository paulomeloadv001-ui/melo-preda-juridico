/**
 * Batch Import Remaining - Processa PDFs que falharam na primeira rodada
 * Inclui: proc 2 (Natalicio), proc 9 (execução ana teonila), proc 12 (ana maria),
 * proc 16 (Cumprimento Maeve MJ), proc 17 (Cumprimento definitivo Maeve),
 * proc 18 (Cumprimento definitivo veraneide), proc 19 (Glayson Charles)
 */
import { readFileSync } from 'fs';
import 'dotenv/config';

const { getDb } = await import('./server/db.ts');
const { invokeLLM } = await import('./server/_core/llm.ts');
const { storagePut } = await import('./server/storage.ts');

import {
  clientes, processos, dadosFinanceiros, emprestimosConsignados,
  estrategias, partesProcessuais, conhecimentos, documentos
} from './drizzle/schema.ts';
import { eq, sql } from 'drizzle-orm';

function sanitizeName(name) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_").toUpperCase().substring(0, 60);
}
function clientFolderKey(nome, cpf) {
  return `clientes/${sanitizeName(nome)}_${cpf.replace(/[.\-\/]/g, "")}`;
}

const EXTRACTION_PROMPT = `Você é um assistente jurídico especializado em análise de processos judiciais brasileiros.
Analise o texto extraído de um processo judicial e extraia TODOS os dados estruturados possíveis.

REGRAS IMPORTANTES:
- Extraia CPF/CNPJ do AUTOR (polo ativo/cliente do escritório Melo & Preda), NÃO do réu
- Se o processo é uma execução onde o banco é autor, identifique o EXECUTADO como cliente
- Valores monetários devem ser números sem formatação (ex: 487150.30)
- Datas no formato DD/MM/YYYY
- Se não encontrar um campo, retorne null

Retorne JSON com esta estrutura:
{
  "cliente": {
    "cpfCnpj": "string ou null",
    "nomeCompleto": "string",
    "tipoPessoa": "PF ou PJ",
    "rg": "string ou null",
    "profissao": "string ou null",
    "cargo": "string ou null",
    "orgaoEmpregador": "string ou null",
    "vinculoFuncional": "string ou null",
    "endereco": "string ou null",
    "cidade": "string ou null",
    "estado": "string ou null",
    "cep": "string ou null",
    "nacionalidade": "string ou null"
  },
  "processo": {
    "numeroCnj": "string",
    "tribunal": "string ou null",
    "comarca": "string ou null",
    "vara": "string ou null",
    "tipoAcao": "string",
    "natureza": "string ou null",
    "classeProcessual": "string ou null",
    "assunto": "string ou null",
    "faseAtual": "Conhecimento|Cumprimento Provisorio|Cumprimento Definitivo|Execucao|Recurso|Arquivado|Suspenso",
    "statusProcesso": "Ativo|Sentenca Procedente|Sentenca Improcedente|Parcialmente Procedente|Acordo|Arquivado|Recurso Pendente",
    "valorCausa": null,
    "dataDistribuicao": "string ou null",
    "dataSentenca": "string ou null",
    "juiz": "string ou null",
    "poloAtivo": "string",
    "poloPassivo": "string (nomes separados por ;)",
    "advogadoAutor": "string ou null"
  },
  "financeiro": {
    "remuneracaoBruta": null,
    "remuneracaoLiquida": null,
    "margemConsignavelPerc": null,
    "margemConsignavelValor": null,
    "totalConsignacoes": null,
    "fonteRenda": "string ou null"
  },
  "emprestimos": [
    { "banco": "string", "contrato": "string ou null", "valorParcela": null, "valorTotal": null, "totalParcelas": null }
  ],
  "estrategia": {
    "tesePrincipal": "string",
    "fundamentacaoLegal": "string",
    "jurisprudenciaCitada": "string",
    "pontosFortes": "string",
    "riscosIdentificados": "string"
  },
  "sentenca": {
    "resultado": "string ou null",
    "valorCondenacao": null,
    "danosMorais": null,
    "danosMateriais": null,
    "restituicao": null,
    "honorariosPerc": null,
    "tutelaTipo": "string ou null",
    "tutelaStatus": "string ou null",
    "tutelaDescricao": "string ou null"
  },
  "partesPassivas": [
    { "nome": "string", "cpfCnpj": "string ou null", "categoria": "Banco|Empresa|Pessoa Fisica|Orgao Publico" }
  ]
}

TEXTO DO PROCESSO:
`;

const REMAINING = [
  { file: "/home/ubuntu/projects/escrit-rio-de-peticionamento-45ca57c5/processo completo natalicio = cumprimento provisorio.pdf", text: "/tmp/pdf_texts/proc_2.txt", note: "Natalicio - CPF falhou" },
  { file: "/home/ubuntu/projects/escrit-rio-de-peticionamento-45ca57c5/execução ana tenila.pdf", text: "/tmp/pdf_texts/proc_9.txt", note: "Execução Ana Teonila - IA confundiu autor" },
  { file: "/home/ubuntu/projects/escrit-rio-de-peticionamento-45ca57c5/processo ana maria - fazer cumprimento provisorio.pdf", text: "/tmp/pdf_texts/proc_12.txt", note: "Ana Maria - CPF pendente" },
  { file: "/home/ubuntu/projects/escrit-rio-de-peticionamento-45ca57c5/Cumprimento Sentença Maeve - MJ.pdf", text: "/tmp/pdf_texts/proc_16.txt", note: "Cumprimento Maeve MJ" },
  { file: "/home/ubuntu/projects/escrit-rio-de-peticionamento-45ca57c5/Cumprimento definitivo Maeve.pdf", text: "/tmp/pdf_texts/proc_17.txt", note: "Cumprimento definitivo Maeve" },
  { file: "/home/ubuntu/projects/escrit-rio-de-peticionamento-45ca57c5/Cumprimento definitivo veraneide.pdf", text: "/tmp/pdf_texts/proc_18.txt", note: "Cumprimento definitivo Veraneide" },
  { file: "/home/ubuntu/upload/PROCESSOCOMPLETOGLAYSONCHARLES.pdf", text: "/tmp/pdf_texts/proc_19.txt", note: "Glayson Charles" },
];

async function insertOrUpdateCliente(db, dados) {
  const cpf = dados.cpfCnpj;
  const nome = dados.nomeCompleto;
  
  if (cpf) {
    // Normalize CPF - remove dots, dashes
    const cpfNorm = cpf.replace(/[.\-\/]/g, "");
    // Check existing by normalized CPF
    const existing = await db.select().from(clientes).where(
      sql`REPLACE(REPLACE(REPLACE(${clientes.cpfCnpj}, '.', ''), '-', ''), '/', '') = ${cpfNorm}`
    ).limit(1);
    
    if (existing.length > 0) {
      const id = existing[0].id;
      console.log(`  Cliente existente: ID ${id} (${cpf})`);
      // Update missing fields
      await db.update(clientes).set({
        profissao: dados.profissao || existing[0].profissao,
        cargo: dados.cargo || existing[0].cargo,
        orgaoEmpregador: dados.orgaoEmpregador || existing[0].orgaoEmpregador,
        endereco: dados.endereco || existing[0].endereco,
        cidade: dados.cidade || existing[0].cidade,
        estado: dados.estado || existing[0].estado,
      }).where(eq(clientes.id, id));
      return id;
    }
  }
  
  const [inserted] = await db.insert(clientes).values({
    cpfCnpj: cpf || `SEM_CPF_${Date.now()}`,
    nomeCompleto: nome,
    tipoPessoa: dados.tipoPessoa === "PJ" ? "PJ" : "PF",
    rg: dados.rg,
    profissao: dados.profissao,
    cargo: dados.cargo,
    orgaoEmpregador: dados.orgaoEmpregador,
    vinculoFuncional: dados.vinculoFuncional,
    endereco: dados.endereco,
    cidade: dados.cidade,
    estado: dados.estado,
    cep: dados.cep,
    nacionalidade: dados.nacionalidade,
  }).$returningId();
  console.log(`  Novo cliente: ID ${inserted.id} (${cpf || 'SEM CPF'})`);
  return inserted.id;
}

async function main() {
  const db = await getDb();
  console.log(`Processando ${REMAINING.length} PDFs restantes...\n`);

  for (let i = 0; i < REMAINING.length; i++) {
    const item = REMAINING[i];
    const filename = item.file.split('/').pop();
    console.log(`\n[${i+1}/${REMAINING.length}] ${filename} (${item.note})`);

    const texto = readFileSync(item.text, 'utf-8').substring(0, 40000);
    console.log(`  Texto: ${texto.length} chars`);

    // IA extraction
    let dados;
    try {
      console.log(`  Extraindo via IA...`);
      const result = await invokeLLM({
        messages: [
          { role: "system", content: "Você é um extrator de dados jurídicos. Responda APENAS com JSON válido, sem markdown." },
          { role: "user", content: EXTRACTION_PROMPT + texto }
        ],
        responseFormat: { type: "json_object" },
      });
      const content = result.choices[0]?.message?.content;
      const textContent = typeof content === "string" ? content : Array.isArray(content) ? content.map(c => c.type === "text" ? c.text : "").join("") : "";
      dados = JSON.parse(textContent);
      console.log(`  IA OK: ${dados.cliente?.nomeCompleto || 'N/A'}`);
    } catch (e) {
      console.error(`  ERRO IA: ${e.message}`);
      continue;
    }

    // Insert client
    const clienteId = await insertOrUpdateCliente(db, dados.cliente || {});

    // Upload PDF
    const cpf = dados.cliente?.cpfCnpj || `SEM_CPF_${Date.now()}`;
    const nome = dados.cliente?.nomeCompleto || filename;
    const folder = clientFolderKey(nome, cpf);
    const pdfBuffer = readFileSync(item.file);
    let pdfUrl = "", pdfStorageKey = "";
    try {
      const uploaded = await storagePut(`${folder}/processos_pdf/${filename}`, pdfBuffer, "application/pdf");
      pdfUrl = uploaded.url;
      pdfStorageKey = uploaded.key;
      console.log(`  PDF uploaded`);
    } catch (e) { console.log(`  PDF upload falhou: ${e.message}`); }

    // Insert processo (dedup by CNJ)
    const numCnj = dados.processo?.numeroCnj || `SEM_NUMERO_${Date.now()}`;
    const existingProc = await db.select().from(processos).where(eq(processos.numeroCnj, numCnj)).limit(1);
    let processoId;

    if (existingProc.length > 0) {
      processoId = existingProc[0].id;
      console.log(`  Processo existente: ID ${processoId}`);
      await db.update(processos).set({
        faseAtual: dados.processo?.faseAtual || existingProc[0].faseAtual,
        pdfStorageKey: pdfStorageKey || existingProc[0].pdfStorageKey,
        pdfUrl: pdfUrl || existingProc[0].pdfUrl,
      }).where(eq(processos.id, processoId));
    } else {
      const proc = dados.processo || {};
      const sent = dados.sentenca || {};
      const [insertedProc] = await db.insert(processos).values({
        clienteId,
        numeroCnj: numCnj,
        tribunal: proc.tribunal,
        comarca: proc.comarca,
        vara: proc.vara,
        tipoAcao: proc.tipoAcao || "Não identificado",
        natureza: proc.natureza,
        classeProcessual: proc.classeProcessual,
        assunto: proc.assunto,
        faseAtual: proc.faseAtual || "Conhecimento",
        statusProcesso: proc.statusProcesso || "Ativo",
        valorCausa: proc.valorCausa ? String(proc.valorCausa) : null,
        dataDistribuicao: proc.dataDistribuicao,
        dataSentenca: proc.dataSentenca,
        juiz: proc.juiz,
        poloAtivo: proc.poloAtivo,
        poloPassivo: proc.poloPassivo,
        advogadoAutor: proc.advogadoAutor,
        valorCondenacao: sent.valorCondenacao ? String(sent.valorCondenacao) : null,
        danosMorais: sent.danosMorais ? String(sent.danosMorais) : null,
        danosMateriais: sent.danosMateriais ? String(sent.danosMateriais) : null,
        restituicao: sent.restituicao ? String(sent.restituicao) : null,
        honorariosPerc: sent.honorariosPerc ? String(sent.honorariosPerc) : null,
        tutelaTipo: sent.tutelaTipo,
        tutelaStatus: sent.tutelaStatus,
        tutelaDescricao: sent.tutelaDescricao,
        pdfStorageKey,
        pdfUrl,
        textoExtraido: texto.substring(0, 60000),
      }).$returningId();
      processoId = insertedProc.id;
      console.log(`  Novo processo: ID ${processoId} (${numCnj})`);
    }

    // Financial data
    if (dados.financeiro) {
      try {
        await db.insert(dadosFinanceiros).values({
          clienteId,
          remuneracaoBruta: dados.financeiro.remuneracaoBruta ? String(dados.financeiro.remuneracaoBruta) : null,
          remuneracaoLiquida: dados.financeiro.remuneracaoLiquida ? String(dados.financeiro.remuneracaoLiquida) : null,
          margemConsignavelPerc: dados.financeiro.margemConsignavelPerc ? String(dados.financeiro.margemConsignavelPerc) : null,
          margemConsignavelValor: dados.financeiro.margemConsignavelValor ? String(dados.financeiro.margemConsignavelValor) : null,
          totalConsignacoes: dados.financeiro.totalConsignacoes ? String(dados.financeiro.totalConsignacoes) : null,
          fonteRenda: dados.financeiro.fonteRenda,
        });
        console.log(`  Financeiro inserido`);
      } catch (e) { console.log(`  Financeiro: ${e.message}`); }
    }

    // Emprestimos
    if (dados.emprestimos?.length) {
      for (const emp of dados.emprestimos) {
        try {
          await db.insert(emprestimosConsignados).values({
            clienteId,
            banco: emp.banco,
            contrato: emp.contrato,
            valorParcela: emp.valorParcela ? String(emp.valorParcela) : null,
            valorTotal: emp.valorTotal ? String(emp.valorTotal) : null,
            totalParcelas: emp.totalParcelas,
          });
        } catch (e) { /* skip */ }
      }
      console.log(`  ${dados.emprestimos.length} empréstimos`);
    }

    // Estrategia
    if (dados.estrategia?.tesePrincipal) {
      try {
        await db.insert(estrategias).values({
          processoId,
          tesePrincipal: dados.estrategia.tesePrincipal,
          fundamentacaoLegal: dados.estrategia.fundamentacaoLegal,
          jurisprudenciaCitada: dados.estrategia.jurisprudenciaCitada,
          pontosFortes: dados.estrategia.pontosFortes,
          riscosIdentificados: dados.estrategia.riscosIdentificados,
        });
        console.log(`  Estratégia inserida`);
      } catch (e) { console.log(`  Estratégia: ${e.message}`); }
    }

    // Partes
    if (dados.partesPassivas?.length) {
      for (const parte of dados.partesPassivas) {
        try {
          await db.insert(partesProcessuais).values({
            processoId, nome: parte.nome, cpfCnpj: parte.cpfCnpj, tipo: "Reu", categoria: parte.categoria,
          });
        } catch (e) { /* skip */ }
      }
      console.log(`  ${dados.partesPassivas.length} partes passivas`);
    }

    // Documento
    try {
      await db.insert(documentos).values({
        processoId, clienteId, tipo: "Processo Completo", nomeArquivo: filename,
        storageKey: pdfStorageKey, storageUrl: pdfUrl, tamanho: pdfBuffer.length, mimeType: "application/pdf",
      });
    } catch (e) { /* skip */ }

    // Conhecimentos
    if (dados.estrategia?.tesePrincipal) {
      try { await db.insert(conhecimentos).values({ categoria: "Tese", titulo: `Tese: ${dados.processo?.tipoAcao || "Processo"} - ${nome}`, conteudo: dados.estrategia.tesePrincipal, tribunal: dados.processo?.tribunal, tipoAcao: dados.processo?.tipoAcao, processoOrigemId: processoId }); } catch (e) {}
      try { await db.insert(conhecimentos).values({ categoria: "Jurisprudencia", titulo: `Jurisprudência: ${dados.processo?.tipoAcao || "Processo"} - ${nome}`, conteudo: dados.estrategia.jurisprudenciaCitada || "N/A", tribunal: dados.processo?.tribunal, tipoAcao: dados.processo?.tipoAcao, processoOrigemId: processoId }); } catch (e) {}
      try { await db.insert(conhecimentos).values({ categoria: "Legislacao", titulo: `Fundamentação: ${dados.processo?.tipoAcao || "Processo"} - ${nome}`, conteudo: dados.estrategia.fundamentacaoLegal || "N/A", tribunal: dados.processo?.tribunal, tipoAcao: dados.processo?.tipoAcao, processoOrigemId: processoId }); } catch (e) {}
    }
    console.log(`  CONCLUÍDO`);
    
    if (i < REMAINING.length - 1) await new Promise(r => setTimeout(r, 1500));
  }

  // Final count
  const cc = await db.select({ count: sql`count(*)` }).from(clientes);
  const pp = await db.select({ count: sql`count(*)` }).from(processos);
  const kk = await db.select({ count: sql`count(*)` }).from(conhecimentos);
  console.log(`\n=== RESULTADO FINAL ===`);
  console.log(`Clientes: ${cc[0].count}`);
  console.log(`Processos: ${pp[0].count}`);
  console.log(`Conhecimentos: ${kk[0].count}`);
  
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
