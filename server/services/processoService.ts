/**
 * SERVIÇO DE PROCESSO — Melo Advogados
 * 
 * Módulo centralizado para processamento de PDFs de processos judiciais.
 * Elimina duplicação: toda lógica de extração, análise e persistência
 * de dados processuais está aqui.
 */
import { invokeLLM } from "../_core/llm";
import { getDb } from "../db";
import {
  clientes, processos, documentos, emprestimosConsignados, dadosFinanceiros
} from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { storagePut } from "../storage";
import { createHash } from "crypto";

// ==================== PROMPT DE EXTRAÇÃO ====================
const PROMPT_EXTRACAO_PROCESSO = `Você é um assistente jurídico especializado em análise de processos judiciais brasileiros.
Analise o texto extraído de um processo judicial e extraia TODOS os dados estruturados possíveis.

REGRAS CRÍTICAS PARA IDENTIFICAÇÃO DO CLIENTE:
- O escritório é Melo Advogados, do Dr. PAULO DA SILVA MELO FILHO (OAB/GO 40.559)
- O CLIENTE é SEMPRE a parte que o Dr. Paulo Melo representa no processo
- Para identificar o cliente: procure quem outorgou procuração ao Dr. Paulo Melo ou quem ele representa como advogado
- O cliente NUNCA é um banco (Bradesco, Itaú, Santander, Caixa, Inter, Pan, Safra, BB, BRB, etc.)
- O cliente NUNCA é o advogado da parte contrária
- Se o Dr. Paulo Melo representa o AUTOR, o cliente é o autor (pessoa física/jurídica que não é banco)
- Se o Dr. Paulo Melo representa o RÉU, o cliente é o réu (pessoa física/jurídica que não é banco)

REGRAS PARA DADOS FINANCEIROS:
- Extraia TODOS os empréstimos consignados mencionados
- Identifique valores de parcelas, taxas de juros, saldos devedores
- Calcule margem consignável se houver dados de remuneração (35% do líquido - Lei 16.898/2010 GO)
- Identifique TODOS os depósitos judiciais mencionados
- Identifique TODOS os alvarás de levantamento expedidos ou cumpridos
- Identifique TODOS os honorários advocatícios sucumbenciais

Retorne um JSON com esta estrutura:
{
  "processo": {
    "numeroProcesso": "string (formato CNJ: NNNNNNN-DD.AAAA.J.TR.OOOO)",
    "tipoAcao": "string",
    "vara": "string ou null",
    "comarca": "string ou null",
    "tribunal": "string ou null",
    "fase": "string (Conhecimento, Recurso, Cumprimento de Sentença, Execução, Arquivado)",
    "valorCausa": "number ou null",
    "dataDistribuicao": "string ou null (DD/MM/YYYY)",
    "objeto": "string (resumo do pedido)"
  },
  "cliente": {
    "nomeCompleto": "string",
    "cpf": "string ou null",
    "rg": "string ou null",
    "cargo": "string ou null",
    "orgaoEmpregador": "string ou null",
    "vinculoFuncional": "string ou null",
    "polo": "Autor ou Réu"
  },
  "parteContraria": {
    "nome": "string",
    "tipo": "Banco, Empresa, Pessoa Física, Órgão Público",
    "cnpjCpf": "string ou null"
  },
  "dadosFinanceiros": {
    "remuneracaoBruta": "number ou null",
    "remuneracaoLiquida": "number ou null",
    "margemConsignavel": "number ou null",
    "totalConsignacoes": "number ou null",
    "margemDisponivel": "number ou null"
  },
  "emprestimos": [
    {
      "banco": "string",
      "contrato": "string ou null",
      "valorParcela": "number ou null",
      "totalParcelas": "number ou null",
      "parcelasRestantes": "number ou null",
      "taxaJuros": "number ou null",
      "saldoDevedor": "number ou null",
      "rubrica": "string ou null"
    }
  ],
  "depositosJudiciais": [
    {
      "valor": "number",
      "data": "string ou null",
      "descricao": "string"
    }
  ],
  "alvaras": [
    {
      "valor": "number",
      "data": "string ou null",
      "beneficiario": "string",
      "status": "Expedido ou Cumprido"
    }
  ],
  "honorarios": {
    "tipo": "Sucumbenciais ou Contratuais",
    "percentual": "number ou null",
    "valorFixado": "number ou null",
    "status": "Fixado, Pago, A Pagar"
  },
  "decisoes": [
    {
      "tipo": "Sentença, Decisão Interlocutória, Acórdão, Despacho",
      "data": "string ou null",
      "resumo": "string"
    }
  ]
}`;

// ==================== INTERFACE DE RESULTADO ====================
export interface ResultadoProcessamento {
  success: boolean;
  clienteId: number;
  processoId: number;
  dadosExtraidos: any;
  documentoUrl: string;
}

// ==================== FUNÇÃO PRINCIPAL ====================

/**
 * Processar PDF de processo judicial — função centralizada
 * Usada tanto pelo upload individual quanto pelo processamento em lote
 */
export async function processarProcessoPdf(input: {
  fileName: string;
  fileBase64: string;
  fileSize: number;
  clienteId?: number;
  jobId?: number;
  onProgress?: (progresso: number, msg: string) => Promise<void>;
}): Promise<ResultadoProcessamento> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const progress = input.onProgress || (async () => {});

  // 1. Verificar duplicado por hash
  const pdfBuffer = Buffer.from(input.fileBase64, "base64");
  const fileHash = createHash('sha256').update(pdfBuffer).digest('hex');
  const docExistente = await db.select().from(documentos).where(eq(documentos.fileHash, fileHash)).limit(1);
  if (docExistente.length > 0) {
    await db.delete(documentos).where(eq(documentos.id, docExistente[0].id));
    console.log(`[Processo] Duplicado detectado ("${docExistente[0].nomeArquivo}") - substituindo.`);
  }

  await progress(10, 'Extraindo texto do PDF...');

  // 2. Extrair texto do PDF
  let textoExtraido = "";
  try {
    const pdfParse = (await import("pdf-parse") as any).default || (await import("pdf-parse"));
    const pdfData = await pdfParse(pdfBuffer);
    textoExtraido = pdfData.text || "";
  } catch { textoExtraido = ""; }

  if (!textoExtraido.trim()) {
    throw new Error("Não foi possível extrair texto do PDF. Verifique se o arquivo é um PDF válido.");
  }

  await progress(20, 'Analisando dados com IA...');

  // 3. Extrair dados via IA
  const textoTruncado = textoExtraido.substring(0, 50000);
  let dadosExtraidos: any = {};
  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: "Você é um extrator de dados processuais. Responda APENAS com JSON válido, sem markdown." },
        { role: "user", content: `${PROMPT_EXTRACAO_PROCESSO}\n\nTEXTO DO PROCESSO:\n${textoTruncado}` }
      ],
      responseFormat: { type: "json_object" },
    });
    const content = result.choices[0]?.message?.content;
    const textContent = typeof content === "string" ? content : Array.isArray(content) ? content.map((c: any) => c.type === "text" ? c.text : "").join("") : "";
    dadosExtraidos = JSON.parse(textContent);
  } catch (e: any) {
    console.error("AI extraction error (processo):", e);
    throw new Error("Falha na extração de dados do processo via IA");
  }

  await progress(50, 'Persistindo dados no banco...');

  // 4. Encontrar ou criar cliente
  let clienteId = input.clienteId || 0;
  const cpf = dadosExtraidos.cliente?.cpf;
  const nome = dadosExtraidos.cliente?.nomeCompleto || input.fileName.replace(".pdf", "");

  if (clienteId) {
    // Atualizar cliente existente com dados do processo
    const cli = dadosExtraidos.cliente || {};
    const updateData: Record<string, any> = {};
    if (cli.cargo) updateData.cargo = cli.cargo;
    if (cli.orgaoEmpregador) updateData.orgaoEmpregador = cli.orgaoEmpregador;
    if (cli.vinculoFuncional) updateData.vinculoFuncional = cli.vinculoFuncional;
    if (cli.rg) updateData.rg = cli.rg;
    if (Object.keys(updateData).length > 0) {
      await db.update(clientes).set(updateData).where(eq(clientes.id, clienteId));
    }
  } else if (cpf) {
    const existing = await db.select().from(clientes).where(eq(clientes.cpfCnpj, cpf)).limit(1);
    if (existing.length > 0) {
      clienteId = existing[0].id;
      // MERGE INTELIGENTE
      const cli = dadosExtraidos.cliente || {};
      const exC = existing[0];
      await db.update(clientes).set({
        rg: cli.rg || exC.rg,
        cargo: cli.cargo || exC.cargo,
        orgaoEmpregador: cli.orgaoEmpregador || exC.orgaoEmpregador,
        vinculoFuncional: cli.vinculoFuncional || exC.vinculoFuncional,
        profissao: cli.cargo || exC.profissao,
      }).where(eq(clientes.id, clienteId));
    } else {
      // Criar novo cliente
      const cli = dadosExtraidos.cliente || {};
      const [inserted] = await db.insert(clientes).values({
        cpfCnpj: cpf,
        nomeCompleto: nome,
        tipoPessoa: "PF",
        rg: cli.rg || null,
        cargo: cli.cargo || null,
        orgaoEmpregador: cli.orgaoEmpregador || null,
        vinculoFuncional: cli.vinculoFuncional || null,
        profissao: cli.cargo || "Servidor Público",
      }).$returningId();
      clienteId = inserted.id;
    }
  } else {
    // Criar cliente apenas com nome
    const [inserted] = await db.insert(clientes).values({
      nomeCompleto: nome,
      tipoPessoa: "PF",
    }).$returningId();
    clienteId = inserted.id;
  }

  await progress(70, 'Registrando processo...');

  // 5. Criar ou atualizar processo
  const proc = dadosExtraidos.processo || {};
  const numProcesso = proc.numeroProcesso || null;

  let processoId = 0;
  if (numProcesso) {
    const existingProc = await db.select().from(processos).where(eq(processos.numeroCnj, numProcesso)).limit(1);
    if (existingProc.length > 0) {
      processoId = existingProc[0].id;
      await db.update(processos).set({
        tipoAcao: proc.tipoAcao || existingProc[0].tipoAcao,
        faseAtual: proc.fase || existingProc[0].faseAtual,
        valorCausa: proc.valorCausa ? String(proc.valorCausa) : existingProc[0].valorCausa,
        vara: proc.vara || existingProc[0].vara,
        comarca: proc.comarca || existingProc[0].comarca,
        tribunal: proc.tribunal || existingProc[0].tribunal,
        assunto: proc.objeto || existingProc[0].assunto,
      }).where(eq(processos.id, processoId));
    } else {
      const [insertedProc] = await db.insert(processos).values({
        clienteId,
        numeroCnj: numProcesso,
        tipoAcao: proc.tipoAcao || null,
        faseAtual: proc.fase || "Conhecimento",
        valorCausa: proc.valorCausa ? String(proc.valorCausa) : null,
        vara: proc.vara || null,
        comarca: proc.comarca || null,
        tribunal: proc.tribunal || null,
        assunto: proc.objeto || null,
        poloAtivo: nome,
        poloPassivo: dadosExtraidos.parteContraria?.nome || null,
      }).$returningId();
      processoId = insertedProc.id;
    }
  } else {
    const [insertedProc] = await db.insert(processos).values({
      clienteId,
      numeroCnj: `PEND_${Date.now().toString(36)}`,
      tipoAcao: proc.tipoAcao || null,
      faseAtual: proc.fase || "Conhecimento",
      valorCausa: proc.valorCausa ? String(proc.valorCausa) : null,
      poloAtivo: nome,
    }).$returningId();
    processoId = insertedProc.id;
  }

  await progress(85, 'Salvando documento no S3...');

  // 6. Upload do PDF ao S3
  const clienteCpf = cpf || `PEND_${Date.now().toString(36)}`;
  const folder = `clientes/${nome.replace(/\s+/g, '_')}_${clienteCpf}`;
  const pdfKey = `${folder}/processos/${input.fileName}`;
  const { url, key } = await storagePut(pdfKey, pdfBuffer, "application/pdf");

  // 7. Registrar documento
  await db.insert(documentos).values({
    clienteId,
    processoId,
    tipo: "Processo",
    nomeArquivo: input.fileName,
    storageKey: key,
    storageUrl: url,
    tamanho: input.fileSize,
    mimeType: "application/pdf",
    fileHash,
  });

  // 8. Persistir empréstimos se houver
  if (dadosExtraidos.emprestimos?.length) {
    for (const emp of dadosExtraidos.emprestimos) {
      await db.insert(emprestimosConsignados).values({
        clienteId,
        banco: emp.banco,
        rubrica: emp.rubrica || null,
        contrato: emp.contrato || null,
        valorParcela: emp.valorParcela ? String(emp.valorParcela) : null,
        valorTotal: emp.saldoDevedor ? String(emp.saldoDevedor) : null,
        totalParcelas: emp.totalParcelas || null,
        parcelasRestantes: emp.parcelasRestantes || null,
        taxaJuros: emp.taxaJuros ? String(emp.taxaJuros) : null,
        status: "Ativo",
      });
    }
  }

  // 9. Persistir dados financeiros se houver
  if (dadosExtraidos.dadosFinanceiros?.remuneracaoLiquida) {
    const fin = dadosExtraidos.dadosFinanceiros;
    const existingFin = await db.select().from(dadosFinanceiros).where(eq(dadosFinanceiros.clienteId, clienteId)).limit(1);
    const payload = {
      remuneracaoBruta: fin.remuneracaoBruta ? String(fin.remuneracaoBruta) : null,
      remuneracaoLiquida: String(fin.remuneracaoLiquida),
      margemConsignavelValor: fin.margemConsignavel ? String(fin.margemConsignavel) : null,
      totalConsignacoes: fin.totalConsignacoes ? String(fin.totalConsignacoes) : null,
      margemDisponivel: fin.margemDisponivel ? String(fin.margemDisponivel) : null,
    };
    if (existingFin.length > 0) {
      await db.update(dadosFinanceiros).set(payload).where(eq(dadosFinanceiros.clienteId, clienteId));
    } else {
      await db.insert(dadosFinanceiros).values({ clienteId, ...payload });
    }
  }

  await progress(100, 'Processamento concluído!');

  return {
    success: true,
    clienteId,
    processoId,
    dadosExtraidos,
    documentoUrl: url,
  };
}
