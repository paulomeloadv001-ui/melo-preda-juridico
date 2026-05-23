/**
 * SERVIÇO DE CONTRACHEQUE — Melo Advogados
 * 
 * Módulo centralizado para processamento de contracheques.
 * Elimina duplicação: toda lógica de extração, análise e persistência
 * de dados financeiros de contracheques está aqui.
 */
import { invokeLLM } from "../_core/llm";
import { getDb } from "../db";
import {
  clientes, dadosFinanceiros, emprestimosConsignados, documentos
} from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { storagePut } from "../storage";
import { createHash } from "crypto";

// ==================== PROMPT DE EXTRAÇÃO ====================
const PROMPT_EXTRACAO_CONTRACHEQUE = `Você é um assistente especializado em análise de contracheques e demonstrativos de pagamento de servidores públicos brasileiros.
Analise o texto extraído de um contracheque/demonstrativo de pagamento e extraia TODOS os dados financeiros detalhados.

REGRAS IMPORTANTES:
- Identifique o NOME COMPLETO e CPF do servidor/beneficiário
- Extraia TODOS os valores de remuneração (bruta, líquida, descontos)
- Identifique CADA empréstimo consignado individualmente (banco, rubrica, contrato, parcela, total de parcelas)
- Calcule a margem consignável (35% do líquido para servidores de GO - Lei Estadual 16.898/2010)
- Some TODOS os descontos de empréstimos consignados para obter o total de consignações
- Calcule a margem disponível = margem consignável - total de consignações
- Se margem disponível < 0, a margem está excedida
- Valores monetários devem ser números sem formatação (ex: 4871.50)
- Identifique o órgão empregador, cargo, vínculo funcional
- Identifique o mês/ano de referência do contracheque

Retorne um JSON com esta estrutura exata:
{
  "servidor": {
    "nomeCompleto": "string",
    "cpf": "string ou null",
    "rg": "string ou null",
    "cargo": "string ou null",
    "orgaoEmpregador": "string ou null",
    "vinculoFuncional": "string ou null (Efetivo, Comissionado, Aposentado, Pensionista)",
    "lotacao": "string ou null",
    "matricula": "string ou null"
  },
  "referencia": {
    "mesAno": "string (MM/YYYY)",
    "dataCredito": "string ou null (DD/MM/YYYY)"
  },
  "remuneracao": {
    "remuneracaoBruta": "number",
    "descontoIrrf": "number ou null",
    "descontoPrevidencia": "number ou null",
    "outrosDescontos": "number ou null",
    "totalDescontos": "number",
    "remuneracaoLiquida": "number"
  },
  "margemConsignavel": {
    "percentual": 35,
    "valorMargem": "number (35% do líquido)",
    "totalConsignacoes": "number (soma de todas as parcelas de empréstimos)",
    "margemDisponivel": "number (valorMargem - totalConsignacoes)",
    "margemExcedida": "boolean",
    "valorExcedente": "number ou 0"
  },
  "emprestimosConsignados": [
    {
      "banco": "string (nome da instituição financeira)",
      "rubrica": "string ou null (código da rubrica no contracheque)",
      "contrato": "string ou null",
      "valorParcela": "number",
      "totalParcelas": "number ou null",
      "parcelasRestantes": "number ou null",
      "valorTotal": "number ou null",
      "taxaJuros": "number ou null"
    }
  ],
  "outrasRubricas": [
    {
      "descricao": "string",
      "tipo": "Provento ou Desconto",
      "valor": "number"
    }
  ]
}`;

// ==================== INTERFACE DE RESULTADO ====================
export interface ResultadoContracheque {
  success: boolean;
  clienteId: number;
  resumoFinanceiro: {
    remuneracaoBruta: number;
    remuneracaoLiquida: number;
    margemConsignavel: number;
    margemDisponivel: number;
    margemExcedida: boolean;
    totalConsignacoes: number;
    totalEmprestimos: number;
    scoreRisco: string;
  };
  documentoUrl: string;
}

// ==================== FUNÇÃO PRINCIPAL ====================
export async function processarContracheque(input: {
  fileName: string;
  fileBase64: string;
  fileSize: number;
  clienteId?: number;
}): Promise<ResultadoContracheque> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 1. Extrair texto do PDF
  const buffer = Buffer.from(input.fileBase64, "base64");
  const pdfParse = (await import("pdf-parse")) as any;
  let textoExtraido = "";
  try {
    const pdfData = await pdfParse(buffer);
    textoExtraido = pdfData.text.substring(0, 50000);
  } catch (e) {
    textoExtraido = "Erro na extração de texto do PDF";
  }

  // 2. Extrair dados financeiros via IA
  let dadosExtraidos: any = {};
  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: "Você é um extrator de dados financeiros de contracheques. Responda APENAS com JSON válido, sem markdown." },
        { role: "user", content: `${PROMPT_EXTRACAO_CONTRACHEQUE}\n\nTEXTO DO CONTRACHEQUE:\n${textoExtraido}` }
      ],
      responseFormat: { type: "json_object" },
    });
    const content = result.choices[0]?.message?.content;
    const textContent = typeof content === "string" ? content : Array.isArray(content) ? content.map((c: any) => c.type === "text" ? c.text : "").join("") : "";
    dadosExtraidos = JSON.parse(textContent);
  } catch (e) {
    console.error("AI extraction error (contracheque):", e);
    throw new Error("Falha na extração de dados do contracheque via IA");
  }

  // 3. Encontrar ou criar cliente
  let clienteId = input.clienteId || 0;
  const cpf = dadosExtraidos.servidor?.cpf;
  const nome = dadosExtraidos.servidor?.nomeCompleto || input.fileName.replace(".pdf", "");

  if (clienteId) {
    // Atualizar cliente existente com dados do contracheque
    const serv = dadosExtraidos.servidor || {};
    const updateData: Record<string, any> = {};
    if (serv.cargo) updateData.cargo = serv.cargo;
    if (serv.orgaoEmpregador) updateData.orgaoEmpregador = serv.orgaoEmpregador;
    if (serv.vinculoFuncional) updateData.vinculoFuncional = serv.vinculoFuncional;
    if (serv.rg) updateData.rg = serv.rg;
    if (Object.keys(updateData).length > 0) {
      await db.update(clientes).set(updateData).where(eq(clientes.id, clienteId));
    }
  } else if (cpf) {
    const existing = await db.select().from(clientes).where(eq(clientes.cpfCnpj, cpf)).limit(1);
    if (existing.length > 0) {
      clienteId = existing[0].id;
      // MERGE INTELIGENTE: preenche campos vazios
      const serv = dadosExtraidos.servidor || {};
      const exC = existing[0];
      await db.update(clientes).set({
        rg: serv.rg || exC.rg,
        cargo: serv.cargo || exC.cargo,
        orgaoEmpregador: serv.orgaoEmpregador || exC.orgaoEmpregador,
        vinculoFuncional: serv.vinculoFuncional || exC.vinculoFuncional,
        profissao: serv.cargo || exC.profissao,
      }).where(eq(clientes.id, clienteId));
    } else {
      // Criar novo cliente
      const serv = dadosExtraidos.servidor || {};
      const [inserted] = await db.insert(clientes).values({
        cpfCnpj: cpf,
        nomeCompleto: nome,
        tipoPessoa: "PF",
        rg: serv.rg || null,
        cargo: serv.cargo || null,
        orgaoEmpregador: serv.orgaoEmpregador || null,
        vinculoFuncional: serv.vinculoFuncional || null,
        profissao: serv.cargo || "Servidor Público",
      }).$returningId();
      clienteId = inserted.id;
    }
  } else {
    throw new Error("Não foi possível identificar o CPF do servidor no contracheque");
  }

  // 4. Upload do PDF ao S3
  const clienteCpf = cpf || `PEND_${Date.now().toString(36)}`;
  const folder = `clientes/${nome.replace(/\s+/g, '_')}_${clienteCpf}`;
  const ref = dadosExtraidos.referencia?.mesAno?.replace("/", "_") || "sem_ref";
  const pdfKey = `${folder}/contracheques/${ref}_${input.fileName}`;
  const { url, key } = await storagePut(pdfKey, buffer, "application/pdf");

  // 5. Registrar documento (com deduplicação por hash)
  const contrachequeHash = createHash('sha256').update(buffer).digest('hex');
  const contrachequeExistente = await db.select().from(documentos).where(eq(documentos.fileHash, contrachequeHash)).limit(1);
  if (contrachequeExistente.length > 0) {
    await db.delete(documentos).where(eq(documentos.id, contrachequeExistente[0].id));
  }
  await db.insert(documentos).values({
    clienteId,
    tipo: "Contracheque",
    nomeArquivo: input.fileName,
    storageKey: key,
    storageUrl: url,
    tamanho: input.fileSize,
    mimeType: "application/pdf",
    fileHash: contrachequeHash,
  });

  // 6. Persistir dados financeiros
  const rem = dadosExtraidos.remuneracao || {};
  const marg = dadosExtraidos.margemConsignavel || {};
  const remuneracaoBruta = rem.remuneracaoBruta || 0;
  const remuneracaoLiquida = rem.remuneracaoLiquida || 0;
  const descontoIrrf = rem.descontoIrrf || 0;
  const descontoPrevidencia = rem.descontoPrevidencia || 0;
  const outrosDescontos = rem.outrosDescontos || 0;
  const margemPerc = marg.percentual || 35;
  const margemValor = marg.valorMargem || (remuneracaoLiquida * 0.35);
  const totalConsignacoes = marg.totalConsignacoes || 0;
  const margemDisponivel = marg.margemDisponivel ?? (margemValor - totalConsignacoes);
  const margemExcedida = margemDisponivel < 0 ? 1 : 0;
  const valorExcedente = margemExcedida ? Math.abs(margemDisponivel) : 0;
  const aptoEmprestimo = margemDisponivel > 0 ? 1 : 0;
  const scoreRisco = margemExcedida ? "Alto" : (margemDisponivel < margemValor * 0.1 ? "Medio" : "Baixo");

  const dadosFinanceirosPayload = {
    remuneracaoBruta: String(remuneracaoBruta),
    remuneracaoLiquida: String(remuneracaoLiquida),
    descontoIrrf: String(descontoIrrf),
    descontoPrevidencia: String(descontoPrevidencia),
    outrosDescontos: String(outrosDescontos),
    margemConsignavelPerc: String(margemPerc),
    margemConsignavelValor: String(margemValor),
    totalConsignacoes: String(totalConsignacoes),
    margemDisponivel: String(margemDisponivel),
    margemExcedida,
    valorExcedente: String(valorExcedente),
    aptoEmprestimo,
    scoreRisco: scoreRisco as "Baixo" | "Medio" | "Alto",
    fonteRenda: dadosExtraidos.servidor?.orgaoEmpregador || "Servidor Público",
    dataReferencia: dadosExtraidos.referencia?.mesAno || null,
  };

  const existingFin = await db.select().from(dadosFinanceiros).where(eq(dadosFinanceiros.clienteId, clienteId)).limit(1);
  if (existingFin.length > 0) {
    await db.update(dadosFinanceiros).set(dadosFinanceirosPayload).where(eq(dadosFinanceiros.clienteId, clienteId));
  } else {
    await db.insert(dadosFinanceiros).values({ clienteId, ...dadosFinanceirosPayload });
  }

  // 7. Persistir empréstimos consignados
  if (dadosExtraidos.emprestimosConsignados?.length) {
    await db.delete(emprestimosConsignados).where(eq(emprestimosConsignados.clienteId, clienteId));
    for (const emp of dadosExtraidos.emprestimosConsignados) {
      await db.insert(emprestimosConsignados).values({
        clienteId,
        banco: emp.banco,
        rubrica: emp.rubrica,
        contrato: emp.contrato,
        valorParcela: emp.valorParcela ? String(emp.valorParcela) : null,
        valorTotal: emp.valorTotal ? String(emp.valorTotal) : null,
        totalParcelas: emp.totalParcelas,
        parcelasRestantes: emp.parcelasRestantes,
        taxaJuros: emp.taxaJuros ? String(emp.taxaJuros) : null,
        status: "Ativo",
      });
    }
  }

  return {
    success: true,
    clienteId,
    resumoFinanceiro: {
      remuneracaoBruta,
      remuneracaoLiquida,
      margemConsignavel: margemValor,
      margemDisponivel,
      margemExcedida: !!margemExcedida,
      totalConsignacoes,
      totalEmprestimos: dadosExtraidos.emprestimosConsignados?.length || 0,
      scoreRisco,
    },
    documentoUrl: url,
  };
}
