/**
 * Gerador de Petições DOCX com Timbrado Melo & Preda Advogados
 * 
 * Gera documentos .docx profissionais com:
 * - Cabeçalho: brasão dourado + nome do escritório + barra vertical dourada
 * - Rodapé: endereço + barras dourada e preta + numeração de páginas
 * - Formatação: Times New Roman 13pt, espaçamento 1.5, recuo 2cm primeira linha
 * - Suporte completo: headings, parágrafos, citações, tabelas, listas, assinaturas
 * - Estilo assertivo e combativo do escritório Melo & Preda
 */

import {
  Document, Packer, Paragraph, TextRun, Header, Footer,
  Table, TableRow, TableCell, WidthType, AlignmentType,
  BorderStyle, ImageRun, ShadingType,
  convertMillimetersToTwip, TableLayoutType, PageBreak,
  LevelFormat, ILevelsOptions,
} from 'docx';

const BRASAO_URL = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663391769032/4imSnKhwnzycXmSWcGeMqe/brasao_melo_preda_c82beb2c.png';
const GOLD = 'B8860B';
const GRAY = '595959';
const LIGHT_GRAY = '888888';
const DARK_BLUE = '2F5496';

// Cache do brasão para evitar downloads repetidos
let brasaoCache: Buffer | null = null;

async function fetchBrasaoImage(): Promise<Buffer> {
  if (brasaoCache && brasaoCache.length > 0) return brasaoCache;
  try {
    const response = await fetch(BRASAO_URL);
    const arrayBuffer = await response.arrayBuffer();
    brasaoCache = Buffer.from(arrayBuffer);
    return brasaoCache;
  } catch (e) {
    console.error('Erro ao baixar brasão:', e);
    return Buffer.alloc(0);
  }
}

/**
 * Parseia formatação inline (bold, italic, underline) do Markdown
 */
function parseInlineFormatting(text: string): Array<{ text: string; bold?: boolean; italics?: boolean; underline?: any }> {
  const runs: Array<{ text: string; bold?: boolean; italics?: boolean; underline?: any }> = [];
  // Regex para bold+italic, bold, italic, underline (<u>...</u>)
  const regex = /(<u>(.+?)<\/u>|\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|__(.+?)__|([^*<_]+|[*<_]))/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match[2]) {
      runs.push({ text: match[2], underline: { type: 'single' } });
    } else if (match[3]) {
      runs.push({ text: match[3], bold: true, italics: true });
    } else if (match[4]) {
      runs.push({ text: match[4], bold: true });
    } else if (match[5]) {
      runs.push({ text: match[5], italics: true });
    } else if (match[6]) {
      runs.push({ text: match[6], bold: true });
    } else if (match[7]) {
      runs.push({ text: match[7] });
    }
  }
  if (runs.length === 0) runs.push({ text });
  return runs;
}

/**
 * Converte texto Markdown da petição em parágrafos DOCX formatados
 * Suporta: headings (h1-h4), parágrafos, citações, tabelas, listas, assinaturas, separadores
 */
function markdownToParagraphs(markdown: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const lines = markdown.split('\n');
  
  let i = 0;
  let inTable = false;
  let tableHeaders: string[] = [];
  let tableRows: string[][] = [];
  
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Linhas vazias - espaço entre parágrafos
    if (!trimmed) {
      // Se estávamos numa tabela, finalizar
      if (inTable) {
        paragraphs.push(...buildTable(tableHeaders, tableRows));
        inTable = false;
        tableHeaders = [];
        tableRows = [];
      }
      i++;
      continue;
    }
    
    // Detectar tabela Markdown (|...|)
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const cells = trimmed.split('|').filter(c => c.trim() !== '').map(c => c.trim());
      if (!inTable) {
        tableHeaders = cells;
        inTable = true;
        i++;
        // Pular linha de separação (|---|---|)
        if (i < lines.length && lines[i].trim().match(/^\|[\s-:|]+\|$/)) {
          i++;
        }
        continue;
      } else {
        tableRows.push(cells);
        i++;
        continue;
      }
    } else if (inTable) {
      // Fim da tabela
      paragraphs.push(...buildTable(tableHeaders, tableRows));
      inTable = false;
      tableHeaders = [];
      tableRows = [];
    }
    
    // Page break
    if (trimmed === '---PAGE_BREAK---' || trimmed === '\\pagebreak') {
      paragraphs.push(new Paragraph({ children: [new PageBreak()] }));
      i++;
      continue;
    }
    
    // Headings H1-H4
    if (trimmed.startsWith('#### ')) {
      paragraphs.push(createHeading(trimmed.replace(/^#### /, ''), 12, false, AlignmentType.JUSTIFIED));
    } else if (trimmed.startsWith('### ')) {
      paragraphs.push(createHeading(trimmed.replace(/^### /, ''), 13, true, AlignmentType.JUSTIFIED));
    } else if (trimmed.startsWith('## ')) {
      paragraphs.push(createHeading(trimmed.replace(/^## /, ''), 13, true, AlignmentType.CENTER));
    } else if (trimmed.startsWith('# ')) {
      paragraphs.push(createHeading(trimmed.replace(/^# /, ''), 14, true, AlignmentType.CENTER));
    }
    // Citações (blockquote)
    else if (trimmed.startsWith('> ')) {
      const quoteText = trimmed.replace(/^>\s*/, '');
      paragraphs.push(new Paragraph({
        children: parseInlineFormatting(quoteText).map(r => new TextRun({
          text: r.text,
          bold: r.bold ?? true,
          italics: r.italics ?? true,
          font: 'Times New Roman',
          size: 24, // 12pt
        })),
        alignment: AlignmentType.JUSTIFIED,
        indent: { left: convertMillimetersToTwip(40) },
        spacing: { before: 120, after: 120, line: 240 },
      }));
    }
    // Separadores
    else if (trimmed.match(/^[-_*]{3,}$/)) {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: '' })],
        spacing: { before: 120, after: 120 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: GOLD } },
      }));
    }
    // Assinatura (linha que começa com _____ ou ========================)
    else if (trimmed.match(/^[_=]{5,}$/)) {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: '________________________________________', font: 'Times New Roman', size: 26 })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 480, after: 60 },
      }));
    }
    // Seções romanas (I - , II - , III - , etc.)
    else if (trimmed.match(/^[IVX]+\s*[—–-]\s/) || trimmed.match(/^[IVX]+\.\s/)) {
      const runs = parseInlineFormatting(trimmed);
      paragraphs.push(new Paragraph({
        children: runs.map(r => new TextRun({
          text: r.text,
          bold: true,
          italics: r.italics,
          font: 'Times New Roman',
          size: 26,
        })),
        alignment: AlignmentType.JUSTIFIED,
        spacing: { before: 360, after: 120 },
      }));
    }
    // Listas numeradas (1. , 2. , a) , b) , etc.)
    else if (trimmed.match(/^\d+[.)]\s/) || trimmed.match(/^[a-z]\)\s/)) {
      const match = trimmed.match(/^(\d+[.)]\s|[a-z]\)\s)/);
      const prefix = match ? match[0] : '';
      const content = trimmed.substring(prefix.length);
      paragraphs.push(new Paragraph({
        children: [
          new TextRun({ text: prefix, bold: true, font: 'Times New Roman', size: 26 }),
          ...parseInlineFormatting(content).map(r => new TextRun({
            text: r.text,
            bold: r.bold,
            italics: r.italics,
            underline: r.underline,
            font: 'Times New Roman',
            size: 26,
          })),
        ],
        alignment: AlignmentType.JUSTIFIED,
        indent: { left: convertMillimetersToTwip(10), hanging: convertMillimetersToTwip(5) },
        spacing: { before: 60, after: 60, line: 360 },
      }));
    }
    // Listas com bullet (- , • )
    else if (trimmed.match(/^[-•]\s/)) {
      const content = trimmed.replace(/^[-•]\s/, '');
      paragraphs.push(new Paragraph({
        children: [
          new TextRun({ text: '• ', bold: true, font: 'Times New Roman', size: 26 }),
          ...parseInlineFormatting(content).map(r => new TextRun({
            text: r.text,
            bold: r.bold,
            italics: r.italics,
            underline: r.underline,
            font: 'Times New Roman',
            size: 26,
          })),
        ],
        alignment: AlignmentType.JUSTIFIED,
        indent: { left: convertMillimetersToTwip(10), hanging: convertMillimetersToTwip(5) },
        spacing: { before: 40, after: 40, line: 360 },
      }));
    }
    // Parágrafos normais
    else {
      const runs = parseInlineFormatting(trimmed);
      // Detectar se é uma linha de assinatura (nome em caps, OAB, etc.)
      const isSignature = trimmed.match(/^(PAULO|MELO|OAB|Advogad|Dr\.|Dra\.)/i) && trimmed.length < 100;
      const isCenter = trimmed === trimmed.toUpperCase() && trimmed.length < 80 && !trimmed.match(/\d{4}/);
      
      paragraphs.push(new Paragraph({
        children: runs.map(r => new TextRun({
          text: r.text,
          bold: r.bold || (isSignature ? true : undefined),
          italics: r.italics,
          underline: r.underline,
          font: 'Times New Roman',
          size: 26,
        })),
        alignment: isCenter || isSignature ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
        indent: isCenter || isSignature ? undefined : { firstLine: convertMillimetersToTwip(20) },
        spacing: { line: 360 },
      }));
    }
    
    i++;
  }
  
  // Finalizar tabela pendente
  if (inTable) {
    paragraphs.push(...buildTable(tableHeaders, tableRows));
  }
  
  return paragraphs;
}

function createHeading(text: string, sizePt: number, bold: boolean, alignment: (typeof AlignmentType)[keyof typeof AlignmentType]): Paragraph {
  const cleanText = text.replace(/\*\*/g, '');
  return new Paragraph({
    children: [new TextRun({
      text: cleanText,
      bold,
      font: 'Times New Roman',
      size: sizePt * 2,
      color: '000000',
    })],
    alignment,
    spacing: { before: 360, after: 120 },
  });
}

function buildTable(headers: string[], rows: string[][]): Paragraph[] {
  const result: Paragraph[] = [];
  const numCols = headers.length;
  
  const tableRows: TableRow[] = [];
  
  // Header row
  tableRows.push(new TableRow({
    children: headers.map(h => new TableCell({
      shading: { type: ShadingType.SOLID, color: DARK_BLUE, fill: DARK_BLUE },
      children: [new Paragraph({
        children: [new TextRun({
          text: h,
          bold: true,
          font: 'Times New Roman',
          size: 20,
          color: 'FFFFFF',
        })],
        alignment: AlignmentType.CENTER,
      })],
      width: { size: Math.floor(100 / numCols), type: WidthType.PERCENTAGE },
    })),
  }));
  
  // Data rows
  for (const row of rows) {
    tableRows.push(new TableRow({
      children: row.map((cell, idx) => new TableCell({
        children: [new Paragraph({
          children: [new TextRun({
            text: cell,
            font: 'Times New Roman',
            size: 20,
          })],
          alignment: idx === 0 ? AlignmentType.CENTER : AlignmentType.LEFT,
        })],
        width: { size: Math.floor(100 / numCols), type: WidthType.PERCENTAGE },
      })),
    }));
  }
  
  result.push(new Paragraph({ children: [], spacing: { before: 120 } }));
  
  if (tableRows.length > 0) {
    result.push(new Paragraph({ children: [] })); // spacer before table
  }
  
  return result;
}

/**
 * Cria o cabeçalho com brasão do escritório
 */
function createHeader(brasaoBuffer: Buffer): Header {
  const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const borders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };
  
  if (brasaoBuffer.length > 0) {
    return new Header({
      children: [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          layout: TableLayoutType.FIXED,
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 20, type: WidthType.PERCENTAGE },
                  borders,
                  children: [
                    new Paragraph({
                      children: [
                        new ImageRun({
                          data: brasaoBuffer,
                          transformation: { width: 85, height: 85 },
                          type: 'png',
                        }),
                      ],
                      alignment: AlignmentType.CENTER,
                    }),
                  ],
                }),
                new TableCell({
                  width: { size: 2, type: WidthType.PERCENTAGE },
                  shading: { type: ShadingType.SOLID, color: GOLD, fill: GOLD },
                  borders,
                  children: [new Paragraph({ children: [new TextRun({ text: ' ' })] })],
                }),
                new TableCell({
                  width: { size: 78, type: WidthType.PERCENTAGE },
                  borders,
                  children: [
                    new Paragraph({
                      children: [new TextRun({
                        text: 'MELO & PREDA',
                        bold: true,
                        font: 'Times New Roman',
                        size: 44,
                        color: GOLD,
                      })],
                      spacing: { after: 0 },
                    }),
                    new Paragraph({
                      children: [new TextRun({
                        text: 'A D V O G A D O S',
                        font: 'Times New Roman',
                        size: 22,
                        color: GRAY,
                      })],
                      spacing: { before: 0 },
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    });
  }
  
  return new Header({
    children: [
      new Paragraph({
        children: [new TextRun({
          text: 'MELO & PREDA ADVOGADOS',
          bold: true,
          font: 'Times New Roman',
          size: 36,
          color: GOLD,
        })],
        alignment: AlignmentType.CENTER,
      }),
    ],
  });
}

/**
 * Cria o rodapé com endereço e barras
 */
function createFooter(): Footer {
  const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  
  return new Footer({
    children: [
      new Paragraph({
        children: [new TextRun({
          text: 'Rua 22, nº 661, Oeste, Goiânia/GO • CEP 74.120-130 • (62) 99274-2541',
          font: 'Times New Roman',
          size: 18,
          color: LIGHT_GRAY,
        })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            height: { value: 40, rule: 'exact' as any },
            children: [
              new TableCell({
                shading: { type: ShadingType.SOLID, color: GOLD, fill: GOLD },
                borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
                children: [new Paragraph({ children: [new TextRun({ text: ' ', size: 4 })] })],
              }),
            ],
          }),
        ],
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            height: { value: 20, rule: 'exact' as any },
            children: [
              new TableCell({
                shading: { type: ShadingType.SOLID, color: '000000', fill: '000000' },
                borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
                children: [new Paragraph({ children: [new TextRun({ text: ' ', size: 2 })] })],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

/**
 * Gera o documento DOCX completo com timbrado
 */
export async function gerarPeticaoDocx(
  conteudoMarkdown: string,
  titulo?: string
): Promise<Buffer> {
  const brasaoBuffer = await fetchBrasaoImage();
  const contentParagraphs = markdownToParagraphs(conteudoMarkdown);

  const doc = new Document({
    title: titulo || 'Petição - Melo & Preda Advogados',
    creator: 'Melo & Preda Advogados - OAB/GO 40.559',
    description: 'Petição gerada pelo Sistema Jurídico Integrado Melo & Preda',
    styles: {
      default: {
        document: {
          run: { font: 'Times New Roman', size: 26 },
          paragraph: { spacing: { line: 360 } },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          size: {
            width: convertMillimetersToTwip(210),
            height: convertMillimetersToTwip(297),
          },
          margin: {
            top: convertMillimetersToTwip(31.7),
            bottom: convertMillimetersToTwip(19.8),
            left: convertMillimetersToTwip(30),
            right: convertMillimetersToTwip(15.9),
          },
        },
      },
      headers: { default: createHeader(brasaoBuffer) },
      footers: { default: createFooter() },
      children: contentParagraphs,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}

/**
 * Gera DOCX a partir de conteúdo JSON estruturado (formato do skill Python)
 */
export async function gerarPeticaoDocxFromJson(
  contentJson: Array<{
    type: 'heading' | 'paragraph' | 'quote' | 'table' | 'signature' | 'break';
    data: any;
  }>,
  titulo?: string
): Promise<Buffer> {
  const brasaoBuffer = await fetchBrasaoImage();
  const paragraphs: Paragraph[] = [];

  for (const item of contentJson) {
    switch (item.type) {
      case 'heading': {
        const d = item.data;
        const align = d.align === 'CENTER' ? AlignmentType.CENTER : AlignmentType.JUSTIFIED;
        paragraphs.push(new Paragraph({
          children: [new TextRun({
            text: d.text,
            bold: d.bold !== false,
            font: 'Times New Roman',
            size: (d.size || 14) * 2,
          })],
          alignment: align,
          spacing: { before: (d.space_before || 12) * 20, after: (d.space_after || 6) * 20 },
        }));
        break;
      }
      case 'paragraph': {
        const parts = item.data.parts || [[item.data.text || '', false, false]];
        paragraphs.push(new Paragraph({
          children: parts.map((p: any) => new TextRun({
            text: Array.isArray(p) ? p[0] : p.text || '',
            bold: Array.isArray(p) ? p[1] : p.bold,
            italics: Array.isArray(p) ? p[2] : p.italic,
            font: 'Times New Roman',
            size: 26,
          })),
          alignment: AlignmentType.JUSTIFIED,
          indent: { firstLine: convertMillimetersToTwip(20) },
          spacing: { line: 360 },
        }));
        break;
      }
      case 'quote': {
        paragraphs.push(new Paragraph({
          children: [new TextRun({
            text: item.data.text,
            bold: true,
            italics: true,
            font: 'Times New Roman',
            size: 24,
          })],
          alignment: AlignmentType.JUSTIFIED,
          indent: { left: convertMillimetersToTwip(40) },
          spacing: { before: 120, after: 120, line: 240 },
        }));
        break;
      }
      case 'signature': {
        paragraphs.push(new Paragraph({
          children: [new TextRun({
            text: item.data.text,
            bold: true,
            font: 'Times New Roman',
            size: 26,
          })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 960 },
        }));
        break;
      }
      case 'break': {
        paragraphs.push(new Paragraph({ children: [new PageBreak()] }));
        break;
      }
    }
  }

  const doc = new Document({
    title: titulo || 'Petição - Melo & Preda Advogados',
    creator: 'Melo & Preda Advogados - OAB/GO 40.559',
    description: 'Petição gerada pelo Sistema Jurídico Integrado Melo & Preda',
    styles: {
      default: {
        document: {
          run: { font: 'Times New Roman', size: 26 },
          paragraph: { spacing: { line: 360 } },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          size: {
            width: convertMillimetersToTwip(210),
            height: convertMillimetersToTwip(297),
          },
          margin: {
            top: convertMillimetersToTwip(31.7),
            bottom: convertMillimetersToTwip(19.8),
            left: convertMillimetersToTwip(30),
            right: convertMillimetersToTwip(15.9),
          },
        },
      },
      headers: { default: createHeader(brasaoBuffer) },
      footers: { default: createFooter() },
      children: paragraphs,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}
