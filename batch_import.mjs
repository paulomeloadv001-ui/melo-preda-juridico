/**
 * Batch Import - Processa todos os PDFs de processos judiciais
 * Usa diretamente o banco de dados e LLM para inserir dados
 */
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import 'dotenv/config';

// Dynamic import of project modules
const { getDb } = await import('./server/db.ts');
const { invokeLLM } = await import('./server/_core/llm.ts');
const { storagePut } = await import('./server/storage.ts');

// Import schema
import {
  clientes, processos, dadosFinanceiros, emprestimosConsignados,
  estrategias, partesProcessuais, conhecimentos, documentos
} from './drizzle/schema.ts';
import { eq, desc, sql } from 'drizzle-orm';

function sanitizeName(name) {
  return name
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .replace(/\s+/g, "_")
    .toUpperCase()
    .substring(0, 60);
}

function clientFolderKey(nome, cpf) {
  const safeName = sanitizeName(nome);
  const safeCpf = cpf.replace(/[.\-\/]/g, "");
  return `clientes/${safeName}_${safeCpf}`;
}

const PDFS = [
  { file: "/home/ubuntu/projects/escrit-rio-de-peticionamento-45ca57c5/processo completo vanderson  - cumprimento provisorio.pdf", text: "/tmp/pdf_texts/proc_1.txt" },
  { file: "/home/ubuntu/projects/escrit-rio-de-peticionamento-45ca57c5/processo completo natalicio = cumprimento provisorio.pdf", text: "/tmp/pdf_texts/proc_2.txt" },
  { file: "/home/ubuntu/projects/escrit-rio-de-peticionamento-45ca57c5/inicial obrigação de fazer ariel.pdf", text: "/tmp/pdf_texts/proc_3.txt" },
  { file: "/home/ubuntu/projects/escrit-rio-de-peticionamento-45ca57c5/ariel atualizado.pdf", text: "/tmp/pdf_texts/proc_4.txt" },
  { file: "/home/ubuntu/projects/escrit-rio-de-peticionamento-45ca57c5/processo completo maria julia - cumprimento provisorio.pdf", text: "/tmp/pdf_texts/proc_5.txt" },
  { file: "/home/ubuntu/projects/escrit-rio-de-peticionamento-45ca57c5/processo completo osmair.pdf", text: "/tmp/pdf_texts/proc_6.txt" },
  { file: "/home/ubuntu/projects/escrit-rio-de-peticionamento-45ca57c5/processo completo irene.pdf", text: "/tmp/pdf_texts/proc_7.txt" },
  { file: "/home/ubuntu/projects/escrit-rio-de-peticionamento-45ca57c5/agravo completo ana teonila.pdf", text: "/tmp/pdf_texts/proc_8.txt" },
  { file: "/home/ubuntu/projects/escrit-rio-de-peticionamento-45ca57c5/execução ana tenila.pdf", text: "/tmp/pdf_texts/proc_9.txt" },
  { file: "/home/ubuntu/projects/escrit-rio-de-peticionamento-45ca57c5/processo completo maeve.pdf", text: "/tmp/pdf_texts/proc_10.txt" },
  { file: "/home/ubuntu/projects/escrit-rio-de-peticionamento-45ca57c5/processo completo stela - cumprimento de sentença.pdf", text: "/tmp/pdf_texts/proc_11.txt" },
  { file: "/home/ubuntu/projects/escrit-rio-de-peticionamento-45ca57c5/processo ana maria - fazer cumprimento provisorio.pdf", text: "/tmp/pdf_texts/proc_12.txt" },
  { file: "/home/ubuntu/projects/escrit-rio-de-peticionamento-45ca57c5/processo arquivado bradesco ana teonila.pdf", text: "/tmp/pdf_texts/proc_13.txt" },
  { file: "/home/ubuntu/projects/escrit-rio-de-peticionamento-45ca57c5/processo irene - cumprimento provisorio.pdf", text: "/tmp/pdf_texts/proc_14.txt" },
  { file: "/home/ubuntu/projects/escrit-rio-de-peticionamento-45ca57c5/cumprimento de sentneça ariel compleot.pdf", text: "/tmp/pdf_texts/proc_15.txt" },
  { file: "/home/ubuntu/projects/escrit-rio-de-peticionamento-45ca57c5/Cumprimento Sentença Maeve - MJ.pdf", text: "/tmp/pdf_texts/proc_16.txt" },
  { file: "/home/ubuntu/projects/escrit-rio-de-peticionamento-45ca57c5/Cumprimento definitivo Maeve.pdf", text: "/tmp/pdf_texts/proc_17.txt" },
  { file: "/home/ubuntu/projects/escrit-rio-de-peticionamento-45ca57c5/Cumprimento definitivo veraneide.pdf", text: "/tmp/pdf_texts/proc_18.txt" },
  { file: "/home/ubuntu/upload/PROCESSOCOMPLETOGLAYSONCHARLES.pdf", text: "/tmp/pdf_texts/proc_19.txt" },
];

const EXTRACTION_PROMPT = `Você é um assistente jurídico especializado em análise de processos judiciais brasileiros.
Analise o texto extraído de um processo judicial e extraia TODOS os dados estruturados possíveis.

REGRAS IMPORTANTES:
- Extraia CPF/CNPJ do AUTOR (polo ativo/cliente), não do advogado
- Se houver múltiplos CPFs, identifique qual pertence ao autor/cliente
- Valores monetários devem ser números sem formatação (ex: 487150.30)
- Datas no formato DD/MM/YYYY
- Se não encontrar um campo, retorne null
- Identifique a natureza da ação (cível, trabalhista, consumerista, etc.)
- Classifique se o processo está ativo ou inativo
- Extraia TODOS os empréstimos consignados mencionados

Retorne um JSON com esta estrutura exata:
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

async function processOnePdf(pdfInfo, index, total) {
  const filename = pdfInfo.file.split('/').pop();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[${index}/${total}] ${filename}`);
  console.log(`${'='.repeat(60)}`);

  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // 1. Read extracted text
  const textoExtraido = readFileSync(pdfInfo.text, 'utf-8').substring(0, 40000);
  console.log(`  Texto: ${textoExtraido.length} chars`);

  // 2. AI extraction
  let dadosExtraidos = {};
  try {
    console.log(`  Extraindo via IA...`);
    const result = await invokeLLM({
      messages: [
        { role: "system", content: "Você é um extrator de dados jurídicos. Responda APENAS com JSON válido, sem markdown." },
        { role: "user", content: EXTRACTION_PROMPT + textoExtraido }
      ],
      responseFormat: { type: "json_object" },
    });
    const content = result.choices[0]?.message?.content;
    const textContent = typeof content === "string" ? content : Array.isArray(content) ? content.map(c => c.type === "text" ? c.text : "").join("") : "";
    dadosExtraidos = JSON.parse(textContent);
    console.log(`  IA OK: ${dadosExtraidos.cliente?.nomeCompleto || 'Nome não encontrado'}`);
  } catch (e) {
    console.error(`  ERRO IA: ${e.message}`);
    return { success: false, error: e.message, filename };
  }

  // 3. Dedup client by CPF
  let clienteId;
  const cpf = dadosExtraidos.cliente?.cpfCnpj;
  const nome = dadosExtraidos.cliente?.nomeCompleto || filename.replace(".pdf", "");

  if (cpf) {
    const existing = await db.select().from(clientes).where(eq(clientes.cpfCnpj, cpf)).limit(1);
    if (existing.length > 0) {
      clienteId = existing[0].id;
      console.log(`  Cliente existente: ID ${clienteId} (${cpf})`);
      await db.update(clientes).set({
        profissao: dadosExtraidos.cliente?.profissao || existing[0].profissao,
        cargo: dadosExtraidos.cliente?.cargo || existing[0].cargo,
        orgaoEmpregador: dadosExtraidos.cliente?.orgaoEmpregador || existing[0].orgaoEmpregador,
        endereco: dadosExtraidos.cliente?.endereco || existing[0].endereco,
        cidade: dadosExtraidos.cliente?.cidade || existing[0].cidade,
        estado: dadosExtraidos.cliente?.estado || existing[0].estado,
        cep: dadosExtraidos.cliente?.cep || existing[0].cep,
      }).where(eq(clientes.id, clienteId));
    } else {
      const [inserted] = await db.insert(clientes).values({
        cpfCnpj: cpf,
        nomeCompleto: nome,
        tipoPessoa: dadosExtraidos.cliente?.tipoPessoa === "PJ" ? "PJ" : "PF",
        rg: dadosExtraidos.cliente?.rg,
        profissao: dadosExtraidos.cliente?.profissao,
        cargo: dadosExtraidos.cliente?.cargo,
        orgaoEmpregador: dadosExtraidos.cliente?.orgaoEmpregador,
        vinculoFuncional: dadosExtraidos.cliente?.vinculoFuncional,
        endereco: dadosExtraidos.cliente?.endereco,
        cidade: dadosExtraidos.cliente?.cidade,
        estado: dadosExtraidos.cliente?.estado,
        cep: dadosExtraidos.cliente?.cep,
        nacionalidade: dadosExtraidos.cliente?.nacionalidade,
      }).$returningId();
      clienteId = inserted.id;
      console.log(`  Novo cliente: ID ${clienteId} (${cpf})`);
    }
  } else {
    const [inserted] = await db.insert(clientes).values({
      cpfCnpj: `PENDENTE_${Date.now()}_${index}`,
      nomeCompleto: nome,
    }).$returningId();
    clienteId = inserted.id;
    console.log(`  Cliente sem CPF: ID ${clienteId}`);
  }

  // 4. Upload PDF to S3
  const clienteCpf = cpf || `PENDENTE_${Date.now()}`;
  const folder = clientFolderKey(nome, clienteCpf);
  const pdfBuffer = readFileSync(pdfInfo.file);
  const pdfKey = `${folder}/processos_pdf/${filename}`;
  let pdfUrl = "";
  let pdfStorageKey = "";
  try {
    const uploaded = await storagePut(pdfKey, pdfBuffer, "application/pdf");
    pdfUrl = uploaded.url;
    pdfStorageKey = uploaded.key;
    console.log(`  PDF uploaded: ${pdfKey}`);
  } catch (e) {
    console.log(`  PDF upload falhou: ${e.message}`);
  }

  // 5. Dedup processo by CNJ
  const numCnj = dadosExtraidos.processo?.numeroCnj || `SEM_NUMERO_${Date.now()}_${index}`;
  const existingProc = await db.select().from(processos).where(eq(processos.numeroCnj, numCnj)).limit(1);
  let processoId;

  if (existingProc.length > 0) {
    processoId = existingProc[0].id;
    console.log(`  Processo existente: ID ${processoId} (${numCnj})`);
    await db.update(processos).set({
      faseAtual: dadosExtraidos.processo?.faseAtual || existingProc[0].faseAtual,
      statusProcesso: dadosExtraidos.processo?.statusProcesso || existingProc[0].statusProcesso,
      pdfStorageKey,
      pdfUrl,
      textoExtraido: textoExtraido.substring(0, 60000),
    }).where(eq(processos.id, processoId));
  } else {
    const proc = dadosExtraidos.processo || {};
    const sent = dadosExtraidos.sentenca || {};
    const [insertedProc] = await db.insert(processos).values({
      clienteId,
      numeroCnj: numCnj,
      tribunal: proc.tribunal,
      comarca: proc.comarca,
      vara: proc.vara,
      tipoAcao: proc.tipoAcao,
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
      textoExtraido: textoExtraido.substring(0, 60000),
    }).$returningId();
    processoId = insertedProc.id;
    console.log(`  Novo processo: ID ${processoId} (${numCnj})`);
  }

  // 6. Financial data
  if (dadosExtraidos.financeiro) {
    const fin = dadosExtraidos.financeiro;
    try {
      await db.insert(dadosFinanceiros).values({
        clienteId,
        remuneracaoBruta: fin.remuneracaoBruta ? String(fin.remuneracaoBruta) : null,
        remuneracaoLiquida: fin.remuneracaoLiquida ? String(fin.remuneracaoLiquida) : null,
        margemConsignavelPerc: fin.margemConsignavelPerc ? String(fin.margemConsignavelPerc) : null,
        margemConsignavelValor: fin.margemConsignavelValor ? String(fin.margemConsignavelValor) : null,
        totalConsignacoes: fin.totalConsignacoes ? String(fin.totalConsignacoes) : null,
        fonteRenda: fin.fonteRenda,
      });
      console.log(`  Dados financeiros inseridos`);
    } catch (e) { console.log(`  Financeiro: ${e.message}`); }
  }

  // 7. Emprestimos
  if (dadosExtraidos.emprestimos?.length) {
    for (const emp of dadosExtraidos.emprestimos) {
      try {
        await db.insert(emprestimosConsignados).values({
          clienteId,
          banco: emp.banco,
          contrato: emp.contrato,
          valorParcela: emp.valorParcela ? String(emp.valorParcela) : null,
          valorTotal: emp.valorTotal ? String(emp.valorTotal) : null,
          totalParcelas: emp.totalParcelas,
        });
      } catch (e) { /* skip dups */ }
    }
    console.log(`  ${dadosExtraidos.emprestimos.length} empréstimos inseridos`);
  }

  // 8. Estrategia
  if (dadosExtraidos.estrategia?.tesePrincipal) {
    try {
      await db.insert(estrategias).values({
        processoId,
        tesePrincipal: dadosExtraidos.estrategia.tesePrincipal,
        fundamentacaoLegal: dadosExtraidos.estrategia.fundamentacaoLegal,
        jurisprudenciaCitada: dadosExtraidos.estrategia.jurisprudenciaCitada,
        pontosFortes: dadosExtraidos.estrategia.pontosFortes,
        riscosIdentificados: dadosExtraidos.estrategia.riscosIdentificados,
      });
      console.log(`  Estratégia inserida`);
    } catch (e) { console.log(`  Estratégia: ${e.message}`); }
  }

  // 9. Partes passivas
  if (dadosExtraidos.partesPassivas?.length) {
    for (const parte of dadosExtraidos.partesPassivas) {
      try {
        await db.insert(partesProcessuais).values({
          processoId,
          nome: parte.nome,
          cpfCnpj: parte.cpfCnpj,
          tipo: "Reu",
          categoria: parte.categoria,
        });
      } catch (e) { /* skip */ }
    }
    console.log(`  ${dadosExtraidos.partesPassivas.length} partes passivas inseridas`);
  }

  // 10. Document record
  try {
    await db.insert(documentos).values({
      processoId,
      clienteId,
      tipo: "Processo Completo",
      nomeArquivo: filename,
      storageKey: pdfStorageKey,
      storageUrl: pdfUrl,
      tamanho: pdfBuffer.length,
      mimeType: "application/pdf",
    });
    console.log(`  Documento registrado`);
  } catch (e) { console.log(`  Documento: ${e.message}`); }

  // 11. Knowledge
  if (dadosExtraidos.estrategia?.tesePrincipal) {
    try {
      await db.insert(conhecimentos).values({
        categoria: "Tese",
        titulo: `Tese: ${dadosExtraidos.processo?.tipoAcao || "Processo"} - ${nome}`,
        conteudo: dadosExtraidos.estrategia.tesePrincipal,
        tribunal: dadosExtraidos.processo?.tribunal,
        tipoAcao: dadosExtraidos.processo?.tipoAcao,
        processoOrigemId: processoId,
      });
    } catch (e) { /* skip */ }
  }
  if (dadosExtraidos.estrategia?.jurisprudenciaCitada) {
    try {
      await db.insert(conhecimentos).values({
        categoria: "Jurisprudencia",
        titulo: `Jurisprudência: ${dadosExtraidos.processo?.tipoAcao || "Processo"} - ${nome}`,
        conteudo: dadosExtraidos.estrategia.jurisprudenciaCitada,
        tribunal: dadosExtraidos.processo?.tribunal,
        tipoAcao: dadosExtraidos.processo?.tipoAcao,
        processoOrigemId: processoId,
      });
    } catch (e) { /* skip */ }
  }
  if (dadosExtraidos.estrategia?.fundamentacaoLegal) {
    try {
      await db.insert(conhecimentos).values({
        categoria: "Legislacao",
        titulo: `Fundamentação: ${dadosExtraidos.processo?.tipoAcao || "Processo"} - ${nome}`,
        conteudo: dadosExtraidos.estrategia.fundamentacaoLegal,
        tribunal: dadosExtraidos.processo?.tribunal,
        tipoAcao: dadosExtraidos.processo?.tipoAcao,
        processoOrigemId: processoId,
      });
    } catch (e) { /* skip */ }
  }
  console.log(`  Conhecimentos inseridos`);

  return { success: true, clienteId, processoId, nome, cpf: cpf || "PENDENTE", numCnj, filename };
}

// Main execution
async function main() {
  console.log(`\n${'#'.repeat(60)}`);
  console.log(`# IMPORTAÇÃO EM MASSA - ${PDFS.length} PROCESSOS`);
  console.log(`${'#'.repeat(60)}`);

  const results = [];
  for (let i = 0; i < PDFS.length; i++) {
    try {
      const r = await processOnePdf(PDFS[i], i + 1, PDFS.length);
      results.push(r);
    } catch (e) {
      console.error(`  ERRO FATAL: ${e.message}`);
      results.push({ success: false, error: e.message, filename: PDFS[i].file.split('/').pop() });
    }
    // Small delay between API calls
    if (i < PDFS.length - 1) await new Promise(r => setTimeout(r, 1000));
  }

  const ok = results.filter(r => r.success);
  const fail = results.filter(r => !r.success);

  console.log(`\n${'#'.repeat(60)}`);
  console.log(`# RESULTADO FINAL`);
  console.log(`# Sucesso: ${ok.length}/${PDFS.length}`);
  console.log(`# Falhas: ${fail.length}`);
  if (fail.length) {
    console.log(`# Falhas:`);
    fail.forEach(f => console.log(`#   - ${f.filename}: ${f.error}`));
  }
  console.log(`${'#'.repeat(60)}`);

  // Print summary table
  console.log(`\nClientes inseridos:`);
  const uniqueClients = new Map();
  ok.forEach(r => {
    if (!uniqueClients.has(r.cpf)) {
      uniqueClients.set(r.cpf, { nome: r.nome, cpf: r.cpf, processos: [r.numCnj] });
    } else {
      uniqueClients.get(r.cpf).processos.push(r.numCnj);
    }
  });
  uniqueClients.forEach((v, k) => {
    console.log(`  ${v.nome} (${v.cpf}) - ${v.processos.length} processo(s)`);
  });

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
