/**
 * Gerador de Petições DOCX com Timbrado Melo & Preda Advogados
 * 
 * Gera documentos .docx com:
 * - Cabeçalho: brasão dourado + nome do escritório + barra vertical
 * - Rodapé: endereço + barras dourada e preta
 * - Formatação: Times New Roman, espaçamento 1.5, recuo 2cm
 * - Estilo assertivo e combativo do escritório
 */

import {
  Document, Packer, Paragraph, TextRun, Header, Footer,
  Table, TableRow, TableCell, WidthType, AlignmentType,
  HeadingLevel, BorderStyle, ImageRun, ShadingType,
  convertInchesToTwip, convertMillimetersToTwip,
  PageNumber, NumberFormat, TabStopPosition, TabStopType,
  TableLayoutType,
} from 'docx';

const BRASAO_URL = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663391769032/4imSnKhwnzycXmSWcGeMqe/brasao_melo_preda_c82beb2c.png';
const GOLD = 'B8860B';
const GRAY = '595959';
const LIGHT_GRAY = '888888';

/**
 * Faz download da imagem do brasão e retorna como Buffer
 */
async function fetchBrasaoImage(): Promise<Buffer> {
  const response = await fetch(BRASAO_URL);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Converte texto Markdown da petição em parágrafos DOCX formatados
 */
function markdownToParagraphs(markdown: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const lines = markdown.split('\n');
  
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    
    // Pular linhas vazias (adicionar espaço)
    if (!line) {
      i++;
      continue;
    }
    
    // Headings
    if (line.startsWith('# ')) {
      paragraphs.push(new Paragraph({
        children: [new TextRun({
          text: line.replace(/^# /, '').replace(/\*\*/g, ''),
          bold: true,
          font: 'Times New Roman',
          size: 28, // 14pt
          color: '000000',
        })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 240, after: 120 },
      }));
    } else if (line.startsWith('## ')) {
      paragraphs.push(new Paragraph({
        children: [new TextRun({
          text: line.replace(/^## /, '').replace(/\*\*/g, ''),
          bold: true,
          font: 'Times New Roman',
          size: 26, // 13pt
          color: '000000',
        })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 100 },
      }));
    } else if (line.startsWith('### ')) {
      paragraphs.push(new Paragraph({
        children: [new TextRun({
          text: line.replace(/^### /, '').replace(/\*\*/g, ''),
          bold: true,
          font: 'Times New Roman',
          size: 26, // 13pt
          color: '000000',
        })],
        alignment: AlignmentType.JUSTIFIED,
        spacing: { before: 200, after: 80 },
      }));
    }
    // Citações (blockquote)
    else if (line.startsWith('> ')) {
      const quoteText = line.replace(/^> /, '').replace(/\*\*/g, '');
      paragraphs.push(new Paragraph({
        children: [new TextRun({
          text: quoteText,
          italics: true,
          bold: true,
          font: 'Times New Roman',
          size: 24, // 12pt
        })],
        alignment: AlignmentType.JUSTIFIED,
        indent: { left: convertMillimetersToTwip(40) },
        spacing: { before: 60, after: 60, line: 240 },
      }));
    }
    // Linhas de separação
    else if (line.match(/^[-_*]{3,}$/)) {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: '' })],
        spacing: { before: 120, after: 120 },
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 6, color: GOLD },
        },
      }));
    }
    // Parágrafos normais (com suporte a bold/italic inline)
    else {
      const runs = parseInlineFormatting(line);
      
      // Verificar se é um item de lista
      const isListItem = line.match(/^[-•]\s/) || line.match(/^\d+[.)]\s/) || line.match(/^[a-z]\)\s/);
      const isSectionHeader = line.match(/^[IVX]+\s*[—–-]\s/) || line.match(/^[IVX]+\.\s/);
      
      if (isSectionHeader) {
        paragraphs.push(new Paragraph({
          children: runs.map(r => new TextRun({
            ...r,
            bold: true,
            font: 'Times New Roman',
            size: 26,
          })),
          alignment: AlignmentType.JUSTIFIED,
          spacing: { before: 240, after: 120 },
        }));
      } else if (isListItem) {
        const cleanLine = line.replace(/^[-•]\s/, '').replace(/^\d+[.)]\s/, '').replace(/^[a-z]\)\s/, '');
        const prefix = line.match(/^([-•]\s|\d+[.)]\s|[a-z]\)\s)/)?.[0] || '';
        paragraphs.push(new Paragraph({
          children: [
            new TextRun({ text: prefix, bold: true, font: 'Times New Roman', size: 26 }),
            ...parseInlineFormatting(cleanLine).map(r => new TextRun({
              ...r,
              font: 'Times New Roman',
              size: 26,
            })),
          ],
          alignment: AlignmentType.JUSTIFIED,
          indent: { left: convertMillimetersToTwip(10), hanging: convertMillimetersToTwip(5) },
          spacing: { before: 40, after: 40, line: 360 },
        }));
      } else {
        paragraphs.push(new Paragraph({
          children: runs.map(r => new TextRun({
            ...r,
            font: 'Times New Roman',
            size: 26, // 13pt
          })),
          alignment: AlignmentType.JUSTIFIED,
          indent: { firstLine: convertMillimetersToTwip(20) },
          spacing: { line: 360 }, // 1.5 line spacing
        }));
      }
    }
    
    i++;
  }
  
  return paragraphs;
}

/**
 * Parseia formatação inline (bold, italic) do Markdown
 */
function parseInlineFormatting(text: string): Array<{ text: string; bold?: boolean; italics?: boolean }> {
  const runs: Array<{ text: string; bold?: boolean; italics?: boolean }> = [];
  
  // Regex para bold+italic, bold, italic
  const regex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|([^*]+))/g;
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    if (match[2]) {
      // ***bold italic***
      runs.push({ text: match[2], bold: true, italics: true });
    } else if (match[3]) {
      // **bold**
      runs.push({ text: match[3], bold: true });
    } else if (match[4]) {
      // *italic*
      runs.push({ text: match[4], italics: true });
    } else if (match[5]) {
      // plain text
      runs.push({ text: match[5] });
    }
  }
  
  if (runs.length === 0) {
    runs.push({ text });
  }
  
  return runs;
}

/**
 * Gera o documento DOCX completo com timbrado
 */
export async function gerarPeticaoDocx(
  conteudoMarkdown: string,
  titulo?: string
): Promise<Buffer> {
  // Baixar brasão
  let brasaoBuffer: Buffer;
  try {
    brasaoBuffer = await fetchBrasaoImage();
  } catch (e) {
    console.error('Erro ao baixar brasão:', e);
    // Criar um buffer vazio se falhar
    brasaoBuffer = Buffer.alloc(0);
  }

  // Converter markdown em parágrafos
  const contentParagraphs = markdownToParagraphs(conteudoMarkdown);

  // Criar cabeçalho com brasão
  const headerChildren: any[] = [];
  
  if (brasaoBuffer.length > 0) {
    // Cabeçalho com brasão + texto
    headerChildren.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        rows: [
          new TableRow({
            children: [
              // Coluna do brasão
              new TableCell({
                width: { size: 20, type: WidthType.PERCENTAGE },
                borders: {
                  top: { style: BorderStyle.NONE, size: 0 },
                  bottom: { style: BorderStyle.NONE, size: 0 },
                  left: { style: BorderStyle.NONE, size: 0 },
                  right: { style: BorderStyle.NONE, size: 0 },
                },
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
              // Barra vertical dourada
              new TableCell({
                width: { size: 2, type: WidthType.PERCENTAGE },
                shading: { type: ShadingType.SOLID, color: GOLD, fill: GOLD },
                borders: {
                  top: { style: BorderStyle.NONE, size: 0 },
                  bottom: { style: BorderStyle.NONE, size: 0 },
                  left: { style: BorderStyle.NONE, size: 0 },
                  right: { style: BorderStyle.NONE, size: 0 },
                },
                children: [new Paragraph({ children: [new TextRun({ text: ' ' })] })],
              }),
              // Texto do escritório
              new TableCell({
                width: { size: 78, type: WidthType.PERCENTAGE },
                borders: {
                  top: { style: BorderStyle.NONE, size: 0 },
                  bottom: { style: BorderStyle.NONE, size: 0 },
                  left: { style: BorderStyle.NONE, size: 0 },
                  right: { style: BorderStyle.NONE, size: 0 },
                },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: 'MELO & PREDA',
                        bold: true,
                        font: 'Times New Roman',
                        size: 44, // 22pt
                        color: GOLD,
                      }),
                    ],
                    spacing: { after: 0 },
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: 'A D V O G A D O S',
                        font: 'Times New Roman',
                        size: 22, // 11pt
                        color: GRAY,
                      }),
                    ],
                    spacing: { before: 0 },
                  }),
                ],
              }),
            ],
          }),
        ],
      })
    );
  } else {
    // Fallback sem brasão
    headerChildren.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'MELO & PREDA ADVOGADOS',
            bold: true,
            font: 'Times New Roman',
            size: 36,
            color: GOLD,
          }),
        ],
        alignment: AlignmentType.CENTER,
      })
    );
  }

  // Criar rodapé
  const footerChildren = [
    new Paragraph({
      children: [
        new TextRun({
          text: 'Rua 22, n\u00BA 661, Oeste, Goi\u00E2nia/GO \u2022 CEP 74.120-130 \u2022 (62) 99274-2541',
          font: 'Times New Roman',
          size: 18, // 9pt
          color: LIGHT_GRAY,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
    }),
    // Barra dourada
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          height: { value: 40, rule: 'exact' as any },
          children: [
            new TableCell({
              shading: { type: ShadingType.SOLID, color: GOLD, fill: GOLD },
              borders: {
                top: { style: BorderStyle.NONE, size: 0 },
                bottom: { style: BorderStyle.NONE, size: 0 },
                left: { style: BorderStyle.NONE, size: 0 },
                right: { style: BorderStyle.NONE, size: 0 },
              },
              children: [new Paragraph({ children: [new TextRun({ text: ' ', size: 4 })] })],
            }),
          ],
        }),
      ],
    }),
    // Barra preta
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          height: { value: 20, rule: 'exact' as any },
          children: [
            new TableCell({
              shading: { type: ShadingType.SOLID, color: '000000', fill: '000000' },
              borders: {
                top: { style: BorderStyle.NONE, size: 0 },
                bottom: { style: BorderStyle.NONE, size: 0 },
                left: { style: BorderStyle.NONE, size: 0 },
                right: { style: BorderStyle.NONE, size: 0 },
              },
              children: [new Paragraph({ children: [new TextRun({ text: ' ', size: 2 })] })],
            }),
          ],
        }),
      ],
    }),
  ];

  // Criar documento
  const doc = new Document({
    title: titulo || 'Peti\u00E7\u00E3o - Melo & Preda Advogados',
    creator: 'Melo & Preda Advogados - OAB/GO 40.559',
    description: 'Peti\u00E7\u00E3o gerada automaticamente pelo Sistema Jur\u00EDdico Integrado',
    styles: {
      default: {
        document: {
          run: {
            font: 'Times New Roman',
            size: 26, // 13pt
          },
          paragraph: {
            spacing: { line: 360 },
          },
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
      headers: {
        default: new Header({ children: headerChildren }),
      },
      footers: {
        default: new Footer({ children: footerChildren }),
      },
      children: contentParagraphs,
    }],
  });

  // Gerar buffer
  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}
