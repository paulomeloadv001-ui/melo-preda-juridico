/**
 * IMPORTADOR AUTOMÁTICO DE PUBLICAÇÕES PROJUDI VIA GMAIL
 * 
 * Objetivo claro: Conectar ao Gmail (paulo40559jus@gmail.com), buscar e-mails
 * de publicações/intimações do PROJUDI, extrair dados relevantes e importar
 * automaticamente para a tabela de publicações do sistema.
 * 
 * Regras:
 * - Excluir e-mails de verificação de código (apenas atos e publicações)
 * - Verificar duplicação antes de importar
 * - Priorizar via mais completa quando houver duplicidade
 * - Vincular automaticamente ao processo pelo número CNJ
 */

import { getDb } from "../db";
import { publicacoes, processos, clientes } from "../../drizzle/schema";
import { eq, sql, and, desc } from "drizzle-orm";

// Configuração do Gmail API
const GMAIL_CONFIG = {
  email: "paulo40559jus@gmail.com",
  // Credenciais OAuth2 configuradas via variáveis de ambiente
  clientId: process.env.GMAIL_CLIENT_ID || "",
  clientSecret: process.env.GMAIL_CLIENT_SECRET || "",
  refreshToken: process.env.GMAIL_REFRESH_TOKEN || "",
};

// Padrões para filtrar e-mails relevantes
const FILTROS_EMAIL = {
  // Remetentes do PROJUDI
  remetentesValidos: [
    "noreply@projudi.tjgo.jus.br",
    "projudi@tjgo.jus.br",
    "intimacao@projudi.tjgo.jus.br",
    "sistema@projudi.tjgo.jus.br",
    "naoresponda@tjgo.jus.br",
  ],
  // Assuntos que indicam publicação/intimação
  assuntosRelevantes: [
    "intimação",
    "publicação",
    "despacho",
    "sentença",
    "decisão",
    "ato processual",
    "movimentação",
    "citação",
    "notificação processual",
  ],
  // Assuntos para EXCLUIR (verificação de código, spam)
  assuntosExcluir: [
    "código de verificação",
    "verificação de segurança",
    "confirme seu e-mail",
    "redefinir senha",
    "alterar senha",
    "token de acesso",
  ],
};

// Regex para extrair número CNJ do corpo do e-mail
const REGEX_CNJ = /(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/g;
const REGEX_PROCESSO = /processo\s*(?:n[°º.]?\s*)?(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/gi;

export interface EmailProjudi {
  id: string;
  remetente: string;
  assunto: string;
  data: Date;
  corpo: string;
  numeroCnj: string | null;
  tipoPublicacao: string;
}

export interface ResultadoImportacao {
  totalEmails: number;
  importados: number;
  duplicados: number;
  excluidos: number;
  erros: number;
  detalhes: Array<{
    email: string;
    status: "importado" | "duplicado" | "excluido" | "erro";
    motivo?: string;
  }>;
}

/**
 * Obter token de acesso OAuth2 do Gmail
 */
async function obterTokenGmail(): Promise<string> {
  if (!GMAIL_CONFIG.clientId || !GMAIL_CONFIG.refreshToken) {
    throw new Error("Gmail não configurado. Configure GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET e GMAIL_REFRESH_TOKEN.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GMAIL_CONFIG.clientId,
      client_secret: GMAIL_CONFIG.clientSecret,
      refresh_token: GMAIL_CONFIG.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(`Erro ao obter token Gmail: ${response.status}`);
  }

  const data = await response.json() as { access_token: string };
  return data.access_token;
}

/**
 * Buscar e-mails do PROJUDI no Gmail
 */
async function buscarEmailsProjudi(diasAtras: number = 7): Promise<EmailProjudi[]> {
  const token = await obterTokenGmail();
  
  // Query para buscar e-mails do PROJUDI dos últimos N dias
  const dataInicio = new Date();
  dataInicio.setDate(dataInicio.getDate() - diasAtras);
  const afterDate = dataInicio.toISOString().split("T")[0].replace(/-/g, "/");
  
  // Buscar por remetentes do PROJUDI
  const query = `from:(${FILTROS_EMAIL.remetentesValidos.join(" OR ")}) after:${afterDate}`;
  
  const listResponse = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=50`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!listResponse.ok) {
    throw new Error(`Erro ao listar e-mails: ${listResponse.status}`);
  }

  const listData = await listResponse.json() as { messages?: Array<{ id: string }> };
  
  if (!listData.messages || listData.messages.length === 0) {
    return [];
  }

  const emails: EmailProjudi[] = [];

  for (const msg of listData.messages) {
    try {
      const msgResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!msgResponse.ok) continue;

      const msgData = await msgResponse.json() as any;
      const headers = msgData.payload?.headers || [];
      
      const remetente = headers.find((h: any) => h.name === "From")?.value || "";
      const assunto = headers.find((h: any) => h.name === "Subject")?.value || "";
      const dataStr = headers.find((h: any) => h.name === "Date")?.value || "";
      
      // Decodificar corpo do e-mail
      let corpo = "";
      if (msgData.payload?.body?.data) {
        corpo = Buffer.from(msgData.payload.body.data, "base64url").toString("utf-8");
      } else if (msgData.payload?.parts) {
        const textPart = msgData.payload.parts.find((p: any) => p.mimeType === "text/plain" || p.mimeType === "text/html");
        if (textPart?.body?.data) {
          corpo = Buffer.from(textPart.body.data, "base64url").toString("utf-8");
        }
      }

      // Extrair número CNJ
      const cnjMatch = corpo.match(REGEX_CNJ) || assunto.match(REGEX_CNJ);
      const numeroCnj = cnjMatch ? cnjMatch[0] : null;

      // Classificar tipo de publicação
      const tipoPublicacao = classificarTipoPublicacao(assunto, corpo);

      emails.push({
        id: msg.id,
        remetente,
        assunto,
        data: new Date(dataStr),
        corpo: corpo.substring(0, 5000), // Limitar tamanho
        numeroCnj,
        tipoPublicacao,
      });
    } catch (err) {
      // Ignorar e-mails com erro de parsing
      continue;
    }
  }

  return emails;
}

/**
 * Classificar tipo de publicação baseado no assunto e corpo
 */
function classificarTipoPublicacao(assunto: string, corpo: string): string {
  const texto = `${assunto} ${corpo}`.toLowerCase();
  
  if (texto.includes("intimação") || texto.includes("intimacao")) return "intimação";
  if (texto.includes("sentença") || texto.includes("sentenca")) return "sentença";
  if (texto.includes("despacho")) return "despacho";
  if (texto.includes("decisão") || texto.includes("decisao")) return "decisão";
  if (texto.includes("acórdão") || texto.includes("acordao")) return "acórdão";
  if (texto.includes("citação") || texto.includes("citacao")) return "citação";
  if (texto.includes("audiência") || texto.includes("audiencia")) return "audiência";
  if (texto.includes("alvará") || texto.includes("alvara")) return "alvará";
  if (texto.includes("mandado")) return "mandado";
  
  return "publicação";
}

/**
 * Verificar se e-mail deve ser excluído (verificação de código, spam)
 */
function deveExcluirEmail(assunto: string): boolean {
  const assuntoLower = assunto.toLowerCase();
  return FILTROS_EMAIL.assuntosExcluir.some(excluir => assuntoLower.includes(excluir));
}

/**
 * Verificar se publicação já foi importada (evitar duplicação)
 */
async function jaImportada(numeroCnj: string | null, data: Date, conteudo: string): Promise<boolean> {
  if (!numeroCnj) return false;
  const db = await getDb();
  if (!db) return false;
  // Verificar se já existe publicação com mesmo CNJ e mesma data
  const existente = await db.select({ id: publicacoes.id })
    .from(publicacoes)
    .where(
      and(
        eq(publicacoes.numeroCnj, numeroCnj),
        sql`DATE(${publicacoes.dataPublicacao}) = DATE(${data.toISOString()})`,
        eq(publicacoes.fonte, "gmail-projudi")
      )
    )
    .limit(1);

  return existente.length > 0;
}

/**
 * Vincular publicação ao processo e cliente pelo número CNJ
 */
async function vincularProcesso(numeroCnj: string): Promise<{ processoId: number | null; clienteId: number | null }> {
  if (!numeroCnj) return { processoId: null, clienteId: null };
  const db = await getDb();
  if (!db) return { processoId: null, clienteId: null };

  const [processo] = await db.select({
    id: processos.id,
    clienteId: processos.clienteId,
  })
    .from(processos)
    .where(eq(processos.numeroCnj, numeroCnj))
    .limit(1);

  if (processo) {
    return { processoId: processo.id, clienteId: processo.clienteId };
  }

  return { processoId: null, clienteId: null };
}

/**
 * Determinar urgência da publicação
 */
function determinarUrgencia(tipo: string, corpo: string): number {
  const textoLower = corpo.toLowerCase();
  
  // Urgência 2 (crítico): intimação com prazo curto, sentença, citação
  if (tipo === "citação" || tipo === "sentença") return 2;
  if (textoLower.includes("prazo de 5 dias") || textoLower.includes("prazo de 48 horas")) return 2;
  if (textoLower.includes("urgente") || textoLower.includes("imediato")) return 2;
  
  // Urgência 1 (urgente): intimação, despacho com prazo
  if (tipo === "intimação" || tipo === "decisão") return 1;
  if (textoLower.includes("prazo de 15 dias") || textoLower.includes("prazo de 10 dias")) return 1;
  
  // Urgência 0 (normal): demais
  return 0;
}

/**
 * FUNÇÃO PRINCIPAL: Importar publicações do PROJUDI via Gmail
 */
export async function importarPublicacoesProjudiGmail(diasAtras: number = 7): Promise<ResultadoImportacao> {
  const resultado: ResultadoImportacao = {
    totalEmails: 0,
    importados: 0,
    duplicados: 0,
    excluidos: 0,
    erros: 0,
    detalhes: [],
  };

  try {
    // 1. Buscar e-mails do PROJUDI
    const emails = await buscarEmailsProjudi(diasAtras);
    resultado.totalEmails = emails.length;

    // 2. Processar cada e-mail
    for (const email of emails) {
      try {
        // 2a. Verificar se deve excluir (verificação de código)
        if (deveExcluirEmail(email.assunto)) {
          resultado.excluidos++;
          resultado.detalhes.push({
            email: email.assunto,
            status: "excluido",
            motivo: "E-mail de verificação/código excluído",
          });
          continue;
        }

        // 2b. Verificar duplicação
        if (await jaImportada(email.numeroCnj, email.data, email.corpo)) {
          resultado.duplicados++;
          resultado.detalhes.push({
            email: email.assunto,
            status: "duplicado",
            motivo: `Já importado (CNJ: ${email.numeroCnj})`,
          });
          continue;
        }

        // 2c. Vincular ao processo
        const { processoId, clienteId } = await vincularProcesso(email.numeroCnj || "");

        // 2d. Determinar urgência
        const urgencia = determinarUrgencia(email.tipoPublicacao, email.corpo);

        // 2e. Inserir publicação no banco
        const db = await getDb();
        if (!db) throw new Error('DB indisponível');
        await db.insert(publicacoes).values({
          processoId,
          clienteId,
          numeroCnj: email.numeroCnj,
          fonte: "gmail-projudi",
          tipoPublicacao: email.tipoPublicacao,
          dataPublicacao: email.data,
          dataDisponibilizacao: email.data,
          conteudo: email.corpo,
          resumo: email.assunto,
          diarioOficial: "PROJUDI-TJGO (Gmail)",
          oabEncontrada: "GO40559",
          tratada: 0,
          urgencia,
          observacoes: `Importado automaticamente do Gmail em ${new Date().toISOString()}`,
          jsonOriginal: JSON.stringify({
            emailId: email.id,
            remetente: email.remetente,
            assunto: email.assunto,
          }),
        });

        resultado.importados++;
        resultado.detalhes.push({
          email: email.assunto,
          status: "importado",
          motivo: `CNJ: ${email.numeroCnj || "não identificado"} | Tipo: ${email.tipoPublicacao}`,
        });

      } catch (err: any) {
        resultado.erros++;
        resultado.detalhes.push({
          email: email.assunto,
          status: "erro",
          motivo: err.message,
        });
      }
    }

    return resultado;

  } catch (err: any) {
    throw new Error(`Falha na importação Gmail/PROJUDI: ${err.message}`);
  }
}

/**
 * Verificar se o Gmail está configurado
 */
export function isGmailConfigurado(): boolean {
  return !!(GMAIL_CONFIG.clientId && GMAIL_CONFIG.clientSecret && GMAIL_CONFIG.refreshToken);
}

/**
 * Status da integração Gmail/PROJUDI
 */
export function statusGmailProjudi(): {
  configurado: boolean;
  email: string;
  ultimaImportacao: string | null;
} {
  return {
    configurado: isGmailConfigurado(),
    email: GMAIL_CONFIG.email,
    ultimaImportacao: null, // Será preenchido via query ao banco
  };
}
