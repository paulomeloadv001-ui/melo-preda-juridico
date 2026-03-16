/**
 * Compressor de PDF no browser usando pdf-lib + Canvas API.
 * 
 * Estratégia:
 * 1. Carrega o PDF com pdf-lib
 * 2. Percorre todas as páginas buscando imagens embutidas (XObject Image)
 * 3. Extrai cada imagem, re-renderiza no Canvas com qualidade reduzida
 * 4. Substitui a imagem original pela versão comprimida (JPEG)
 * 5. Salva o PDF otimizado
 * 
 * Para PDFs sem imagens (texto puro), aplica apenas a re-serialização
 * que remove metadados desnecessários e otimiza streams.
 */

import { PDFDocument, PDFName, PDFRawStream, PDFRef, PDFStream, PDFDict, PDFArray } from 'pdf-lib';

export interface CompressionResult {
  originalSize: number;
  compressedSize: number;
  savedBytes: number;
  savedPercent: number;
  compressedBase64: string;
  compressedFile: File;
}

export interface CompressionOptions {
  /** Qualidade JPEG: 0.0 a 1.0 (padrão: 0.65) */
  imageQuality?: number;
  /** Escala de redimensionamento: 0.0 a 1.0 (padrão: 0.85) */
  imageScale?: number;
  /** Tamanho mínimo de imagem em bytes para comprimir (padrão: 50KB) */
  minImageSize?: number;
  /** Callback de progresso (0-100) */
  onProgress?: (percent: number) => void;
}

/**
 * Comprime uma imagem usando o Canvas API do browser.
 */
async function compressImageViaCanvas(
  imageBytes: Uint8Array,
  mimeType: string,
  quality: number,
  scale: number
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const blob = new Blob([imageBytes as BlobPart], { type: mimeType });
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const targetWidth = Math.max(1, Math.round(img.width * scale));
      const targetHeight = Math.max(1, Math.round(img.height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Não foi possível criar contexto Canvas'));
        return;
      }

      // Fundo branco para transparência (JPEG não suporta alpha)
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, targetWidth, targetHeight);
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      canvas.toBlob(
        (resultBlob) => {
          if (!resultBlob) {
            reject(new Error('Falha ao converter canvas para blob'));
            return;
          }
          resultBlob.arrayBuffer().then(buffer => {
            resolve(new Uint8Array(buffer));
            // Limpar canvas da memória
            canvas.width = 0;
            canvas.height = 0;
          });
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      // Se não conseguir carregar a imagem, retorna os bytes originais
      resolve(imageBytes);
    };

    img.src = url;
  });
}

/**
 * Extrai imagens de um PDFDict (Resources) e retorna referências para compressão.
 */
function findImageObjects(pdfDoc: PDFDocument): Array<{ ref: PDFRef; stream: PDFRawStream; width: number; height: number }> {
  const images: Array<{ ref: PDFRef; stream: PDFRawStream; width: number; height: number }> = [];

  // Percorrer todos os objetos indiretos do PDF
  const enumeratedObjects = pdfDoc.context.enumerateIndirectObjects();

  for (const [ref, obj] of enumeratedObjects) {
    if (obj instanceof PDFRawStream || obj instanceof PDFStream) {
      const dict = obj.dict;
      if (!dict) continue;

      const type = dict.get(PDFName.of('Type'));
      const subtype = dict.get(PDFName.of('Subtype'));

      // Verificar se é um XObject Image
      if (subtype && subtype.toString() === '/Image') {
        const widthObj = dict.get(PDFName.of('Width'));
        const heightObj = dict.get(PDFName.of('Height'));

        if (widthObj && heightObj) {
          const width = parseInt(widthObj.toString(), 10);
          const height = parseInt(heightObj.toString(), 10);

          if (width > 0 && height > 0 && obj instanceof PDFRawStream) {
            images.push({ ref, stream: obj, width, height });
          }
        }
      }
    }
  }

  return images;
}

/**
 * Tenta decodificar os bytes brutos de uma imagem do PDF.
 * PDFs podem usar vários filtros (FlateDecode, DCTDecode, etc.)
 */
function getImageBytesAndType(stream: PDFRawStream): { bytes: Uint8Array; mimeType: string } | null {
  try {
    const dict = stream.dict;
    const filter = dict.get(PDFName.of('Filter'));
    const filterStr = filter ? filter.toString() : '';

    // DCTDecode = JPEG nativo - já está comprimido, podemos re-comprimir com menor qualidade
    if (filterStr.includes('DCTDecode')) {
      return { bytes: stream.contents, mimeType: 'image/jpeg' };
    }

    // JPXDecode = JPEG2000 - já comprimido, pular
    if (filterStr.includes('JPXDecode')) {
      return null;
    }

    // FlateDecode = dados comprimidos com zlib, pode ser PNG-like
    // Para simplificar, tentamos tratar como imagem raw
    if (filterStr.includes('FlateDecode')) {
      // Não conseguimos decodificar FlateDecode facilmente no browser sem pako
      // Mas podemos tentar criar uma imagem a partir dos dados brutos
      return null;
    }

    // Sem filtro = dados raw
    if (!filterStr || filterStr === '') {
      return { bytes: stream.contents, mimeType: 'image/bmp' };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Comprime um arquivo PDF no browser.
 * 
 * @param file - O arquivo PDF original
 * @param options - Opções de compressão
 * @returns Resultado da compressão com o arquivo comprimido
 */
export async function compressPdf(
  file: File,
  options: CompressionOptions = {}
): Promise<CompressionResult> {
  const {
    imageQuality = 0.65,
    imageScale = 0.85,
    minImageSize = 50 * 1024, // 50KB
    onProgress,
  } = options;

  onProgress?.(5);

  // 1. Ler o arquivo como ArrayBuffer
  const originalBytes = new Uint8Array(await file.arrayBuffer());
  const originalSize = originalBytes.length;

  onProgress?.(10);

  // 2. Carregar o PDF
  let pdfDoc: PDFDocument;
  try {
    pdfDoc = await PDFDocument.load(originalBytes, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
  } catch (err) {
    // Se não conseguir carregar (PDF protegido, corrompido, etc.), retorna original
    const base64 = arrayBufferToBase64(originalBytes);
    return {
      originalSize,
      compressedSize: originalSize,
      savedBytes: 0,
      savedPercent: 0,
      compressedBase64: base64,
      compressedFile: file,
    };
  }

  onProgress?.(20);

  // 3. Encontrar todas as imagens no PDF
  const imageObjects = findImageObjects(pdfDoc);

  onProgress?.(30);

  // 4. Comprimir cada imagem JPEG encontrada
  let compressedCount = 0;
  const totalImages = imageObjects.length;

  for (let i = 0; i < imageObjects.length; i++) {
    const imgObj = imageObjects[i];
    const imageData = getImageBytesAndType(imgObj.stream);

    if (!imageData) {
      // Não conseguimos extrair, pular
      continue;
    }

    // Só comprimir imagens acima do tamanho mínimo
    if (imageData.bytes.length < minImageSize) {
      continue;
    }

    try {
      // Comprimir via Canvas
      const compressedBytes = await compressImageViaCanvas(
        imageData.bytes,
        imageData.mimeType,
        imageQuality,
        imageScale
      );

      // Só substituir se realmente ficou menor
      if (compressedBytes.length < imageData.bytes.length * 0.95) {
        // Embedar a nova imagem JPEG no PDF
        const newImage = await pdfDoc.embedJpg(compressedBytes);

        // Substituir o stream da imagem original
        // Acessar o ref e substituir no contexto
        const newImageRef = (newImage as any).ref;
        if (newImageRef) {
          // Copiar o objeto da nova imagem para a referência antiga
          const newObj = pdfDoc.context.lookup(newImageRef);
          if (newObj) {
            pdfDoc.context.assign(imgObj.ref, newObj);
            compressedCount++;
          }
        }
      }
    } catch {
      // Erro ao comprimir esta imagem específica, pular
      continue;
    }

    // Atualizar progresso (30% a 80% para compressão de imagens)
    const imageProgress = 30 + Math.round(((i + 1) / totalImages) * 50);
    onProgress?.(Math.min(imageProgress, 80));
  }

  onProgress?.(85);

  // 5. Salvar o PDF otimizado
  // useObjectStreams ajuda a reduzir tamanho mesmo sem imagens
  let savedBytes: Uint8Array;
  try {
    savedBytes = await pdfDoc.save({
      useObjectStreams: true,
      addDefaultPage: false,
    });
  } catch {
    // Fallback: salvar sem objectStreams
    try {
      savedBytes = await pdfDoc.save({
        addDefaultPage: false,
      });
    } catch {
      // Se falhar completamente, retorna original
      const base64 = arrayBufferToBase64(originalBytes);
      return {
        originalSize,
        compressedSize: originalSize,
        savedBytes: 0,
        savedPercent: 0,
        compressedBase64: base64,
        compressedFile: file,
      };
    }
  }

  onProgress?.(90);

  const compressedSize = savedBytes.length;

  // Se o "comprimido" ficou maior, usar o original
  if (compressedSize >= originalSize) {
    const base64 = arrayBufferToBase64(originalBytes);
    onProgress?.(100);
    return {
      originalSize,
      compressedSize: originalSize,
      savedBytes: 0,
      savedPercent: 0,
      compressedBase64: base64,
      compressedFile: file,
    };
  }

  // 6. Converter para base64
  const base64 = arrayBufferToBase64(savedBytes);

  onProgress?.(95);

  // 7. Criar novo File
  const compressedFile = new File([savedBytes as BlobPart], file.name, {
    type: 'application/pdf',
    lastModified: Date.now(),
  });

  onProgress?.(100);

  const saved = originalSize - compressedSize;
  const savedPercent = Math.round((saved / originalSize) * 100);

  return {
    originalSize,
    compressedSize,
    savedBytes: saved,
    savedPercent,
    compressedBase64: base64,
    compressedFile,
  };
}

/**
 * Converte Uint8Array para base64 string de forma eficiente.
 */
function arrayBufferToBase64(bytes: Uint8Array): string {
  // Processar em chunks para evitar stack overflow em arquivos grandes
  const CHUNK_SIZE = 32768;
  let result = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length));
    result += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(result);
}

/**
 * Formata bytes para exibição legível (KB, MB, GB).
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
