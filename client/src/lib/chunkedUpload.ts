/**
 * Upload Chunked - Frontend Utility
 * 
 * Divide arquivos grandes em chunks de 4MB e envia via multipart/form-data.
 * Sem limite de tamanho. Progresso real por arquivo.
 * 
 * Uso:
 *   const result = await uploadFileChunked(file, { 
 *     tipo: 'processo',
 *     onProgress: (p) => setProgress(p) 
 *   });
 *   // result.fileBase64, result.url, result.fileName, result.fileSize
 */

const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB por chunk

export interface ChunkedUploadOptions {
  tipo?: 'processo' | 'contracheque' | 'auto';
  clienteId?: number;
  onProgress?: (progress: number) => void;
  onStatus?: (status: string) => void;
}

export interface ChunkedUploadResult {
  url: string;
  fileKey: string;
  fileSize: number;
  fileName: string;
  fileBase64: string;
  tipo: string;
  clienteId?: number;
}

/**
 * Upload de arquivo em chunks para o servidor.
 * Funciona para qualquer tamanho de arquivo.
 */
export async function uploadFileChunked(
  file: File,
  options: ChunkedUploadOptions = {}
): Promise<ChunkedUploadResult> {
  const { tipo = 'auto', clienteId, onProgress, onStatus } = options;
  
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  
  onStatus?.('Iniciando upload...');
  onProgress?.(0);

  // 1. Iniciar sessão de upload
  const initRes = await fetch('/api/upload/iniciar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      fileSize: file.size,
      totalChunks,
      tipo,
      clienteId,
    }),
  });

  if (!initRes.ok) {
    const err = await initRes.json().catch(() => ({ error: 'Erro ao iniciar upload' }));
    throw new Error(err.error || `Erro HTTP ${initRes.status}`);
  }

  const { uploadId } = await initRes.json();
  
  onStatus?.(`Enviando ${totalChunks} parte${totalChunks > 1 ? 's' : ''}...`);

  // 2. Enviar chunks sequencialmente
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);

    const formData = new FormData();
    formData.append('chunk', chunk, `chunk_${i}`);
    formData.append('uploadId', uploadId);
    formData.append('chunkIndex', String(i));

    let retries = 0;
    const maxRetries = 3;
    
    while (retries < maxRetries) {
      try {
        const chunkRes = await fetch('/api/upload/chunk', {
          method: 'POST',
          body: formData,
        });

        if (!chunkRes.ok) {
          const err = await chunkRes.json().catch(() => ({ error: 'Erro ao enviar parte' }));
          throw new Error(err.error || `Erro HTTP ${chunkRes.status}`);
        }

        const chunkData = await chunkRes.json();
        const progress = Math.round(((i + 1) / totalChunks) * 90); // 0-90% para chunks
        onProgress?.(progress);
        onStatus?.(`Enviando: ${i + 1}/${totalChunks} partes (${progress}%)`);
        break; // Sucesso, sai do retry loop
      } catch (err: any) {
        retries++;
        if (retries >= maxRetries) {
          throw new Error(`Falha ao enviar parte ${i + 1}/${totalChunks} após ${maxRetries} tentativas: ${err.message}`);
        }
        // Aguardar antes de retry (exponential backoff)
        await new Promise(r => setTimeout(r, 1000 * retries));
        onStatus?.(`Reenviando parte ${i + 1}/${totalChunks} (tentativa ${retries + 1})...`);
      }
    }
  }

  // 3. Finalizar upload (montar arquivo no servidor + S3)
  onStatus?.('Processando arquivo...');
  onProgress?.(92);

  // Finalizar com retry
  let finalRetries = 0;
  const maxFinalRetries = 3;
  while (finalRetries < maxFinalRetries) {
    try {
      const finalRes = await fetch('/api/upload/finalizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId }),
      });

      if (!finalRes.ok) {
        const err = await finalRes.json().catch(() => ({ error: 'Erro ao finalizar upload' }));
        throw new Error(err.error || `Erro HTTP ${finalRes.status}`);
      }

      const result = await finalRes.json();
      onProgress?.(100);
      onStatus?.('Upload completo!');

      return result as ChunkedUploadResult;
    } catch (err: any) {
      finalRetries++;
      if (finalRetries >= maxFinalRetries) {
        throw new Error(`Falha ao finalizar upload após ${maxFinalRetries} tentativas: ${err.message}`);
      }
      await new Promise(r => setTimeout(r, 2000 * finalRetries));
      onStatus?.(`Reenviando finalização (tentativa ${finalRetries + 1})...`);
    }
  }
  throw new Error('Falha inesperada ao finalizar upload');
}

/**
 * Formata tamanho de arquivo para exibição
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/**
 * Verifica se o arquivo precisa de upload chunked (>5MB) ou pode ir direto via base64
 */
export function needsChunkedUpload(file: File): boolean {
  return file.size > 5 * 1024 * 1024; // >5MB usa chunked
}

/**
 * Converte arquivo para base64 (para arquivos pequenos <5MB)
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]); // Remove data:...;base64, prefix
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
