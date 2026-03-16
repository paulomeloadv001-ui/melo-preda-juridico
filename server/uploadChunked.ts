/**
 * Upload Chunked - Melo & Preda Advogados
 * 
 * Sistema de upload em partes para arquivos de qualquer tamanho.
 * O arquivo é dividido em chunks de 4MB no frontend, enviados via multipart/form-data,
 * e montados no servidor antes de processar.
 * 
 * Fluxo:
 * 1. POST /api/upload/iniciar   → Cria sessão de upload, retorna uploadId
 * 2. POST /api/upload/chunk     → Envia chunk (multipart) com uploadId + chunkIndex
 * 3. POST /api/upload/finalizar → Monta arquivo final, faz upload para S3, retorna URL
 */
import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { storagePut } from './storage';

const router = Router();

// Diretório temporário para chunks
const TEMP_DIR = path.join('/tmp', 'upload-chunks');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Multer configurado para salvar chunks em disco (sem limite de tamanho)
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, TEMP_DIR),
    filename: (_req, _file, cb) => cb(null, `chunk_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB por chunk (margem)
});

// Sessões de upload ativas (em memória, limpa após 1h)
interface UploadSession {
  id: string;
  fileName: string;
  fileSize: number;
  totalChunks: number;
  receivedChunks: Map<number, string>; // chunkIndex → filePath
  createdAt: number;
  tipo: 'processo' | 'contracheque' | 'auto';
  clienteId?: number;
}

const sessions = new Map<string, UploadSession>();

// Limpar sessões expiradas a cada 10 minutos
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of Array.from(sessions.entries())) {
    if (now - session.createdAt > 3600000) { // 1 hora
      // Limpar arquivos temporários
      for (const filePath of Array.from(session.receivedChunks.values())) {
        try { fs.unlinkSync(filePath); } catch {}
      }
      sessions.delete(id);
    }
  }
}, 600000);

/**
 * POST /api/upload/iniciar
 * Body JSON: { fileName, fileSize, totalChunks, tipo?, clienteId? }
 * Retorna: { uploadId, chunkSize }
 */
router.post('/iniciar', (req: Request, res: Response) => {
  try {
    const { fileName, fileSize, totalChunks, tipo, clienteId } = req.body;
    
    if (!fileName || !fileSize || !totalChunks) {
      res.status(400).json({ error: 'Campos obrigatórios: fileName, fileSize, totalChunks' });
      return;
    }

    const uploadId = crypto.randomBytes(16).toString('hex');
    
    sessions.set(uploadId, {
      id: uploadId,
      fileName,
      fileSize,
      totalChunks,
      receivedChunks: new Map(),
      createdAt: Date.now(),
      tipo: tipo || 'auto',
      clienteId,
    });

    console.log(`[Upload Chunked] Sessão iniciada: ${uploadId} — ${fileName} (${(fileSize / 1024 / 1024).toFixed(1)} MB, ${totalChunks} chunks)`);

    res.json({ 
      uploadId, 
      chunkSize: 4 * 1024 * 1024, // 4MB
      message: `Upload iniciado para ${fileName}` 
    });
  } catch (err: any) {
    console.error('[Upload Chunked] Erro ao iniciar:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/upload/chunk
 * Multipart: file (chunk binary) + uploadId + chunkIndex
 * Retorna: { received, total, progress }
 */
router.post('/chunk', upload.single('chunk'), (req: Request, res: Response) => {
  try {
    const { uploadId, chunkIndex } = req.body;
    const file = req.file;

    if (!uploadId || chunkIndex === undefined || !file) {
      res.status(400).json({ error: 'Campos obrigatórios: uploadId, chunkIndex, chunk (file)' });
      return;
    }

    const session = sessions.get(uploadId);
    if (!session) {
      res.status(404).json({ error: 'Sessão de upload não encontrada ou expirada' });
      return;
    }

    const idx = parseInt(chunkIndex, 10);
    session.receivedChunks.set(idx, file.path);

    const received = session.receivedChunks.size;
    const progress = Math.round((received / session.totalChunks) * 100);

    res.json({
      received,
      total: session.totalChunks,
      progress,
      message: `Chunk ${idx + 1}/${session.totalChunks} recebido`,
    });
  } catch (err: any) {
    console.error('[Upload Chunked] Erro ao receber chunk:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/upload/finalizar
 * Body JSON: { uploadId }
 * Retorna: { url, fileKey, fileSize, fileName }
 * 
 * Monta o arquivo final a partir dos chunks, faz upload para S3, limpa temp.
 */
router.post('/finalizar', async (req: Request, res: Response) => {
  try {
    const { uploadId } = req.body;

    if (!uploadId) {
      res.status(400).json({ error: 'Campo obrigatório: uploadId' });
      return;
    }

    const session = sessions.get(uploadId);
    if (!session) {
      res.status(404).json({ error: 'Sessão de upload não encontrada ou expirada' });
      return;
    }

    // Verificar se todos os chunks foram recebidos
    if (session.receivedChunks.size < session.totalChunks) {
      res.status(400).json({ 
        error: `Faltam chunks: recebidos ${session.receivedChunks.size}/${session.totalChunks}`,
        received: session.receivedChunks.size,
        total: session.totalChunks,
      });
      return;
    }

    console.log(`[Upload Chunked] Montando arquivo: ${session.fileName} (${session.totalChunks} chunks)`);

    // Montar arquivo final na ordem correta
    const finalPath = path.join(TEMP_DIR, `final_${uploadId}_${session.fileName}`);
    const writeStream = fs.createWriteStream(finalPath);

    for (let i = 0; i < session.totalChunks; i++) {
      const chunkPath = session.receivedChunks.get(i);
      if (!chunkPath || !fs.existsSync(chunkPath)) {
        writeStream.close();
        try { fs.unlinkSync(finalPath); } catch {}
        res.status(400).json({ error: `Chunk ${i} não encontrado` });
        return;
      }
      const chunkData = fs.readFileSync(chunkPath);
      writeStream.write(chunkData);
    }

    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
      writeStream.end();
    });

    // Ler arquivo final e fazer upload para S3
    const fileBuffer = fs.readFileSync(finalPath);
    const suffix = crypto.randomBytes(4).toString('hex');
    const safeFileName = session.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const s3Key = `uploads/${Date.now()}_${suffix}_${safeFileName}`;

    const { key, url } = await storagePut(s3Key, fileBuffer, 'application/pdf');

    console.log(`[Upload Chunked] Arquivo enviado para S3: ${key} (${(fileBuffer.length / 1024 / 1024).toFixed(1)} MB)`);

    // Converter para base64 para compatibilidade com as rotas existentes de processamento
    const fileBase64 = fileBuffer.toString('base64');

    // Limpar arquivos temporários
    Array.from(session.receivedChunks.values()).forEach(chunkPath => {
      try { fs.unlinkSync(chunkPath); } catch {}
    });
    try { fs.unlinkSync(finalPath); } catch {}
    sessions.delete(uploadId);

    res.json({
      url,
      fileKey: key,
      fileSize: fileBuffer.length,
      fileName: session.fileName,
      fileBase64, // Para compatibilidade com processamento existente
      tipo: session.tipo,
      clienteId: session.clienteId,
      message: `Upload completo: ${session.fileName} (${(fileBuffer.length / 1024 / 1024).toFixed(1)} MB)`,
    });
  } catch (err: any) {
    console.error('[Upload Chunked] Erro ao finalizar:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/upload/status/:uploadId
 * Retorna progresso da sessão de upload
 */
router.get('/status/:uploadId', (req: Request, res: Response) => {
  const session = sessions.get(req.params.uploadId);
  if (!session) {
    res.status(404).json({ error: 'Sessão não encontrada' });
    return;
  }

  res.json({
    uploadId: session.id,
    fileName: session.fileName,
    fileSize: session.fileSize,
    totalChunks: session.totalChunks,
    receivedChunks: session.receivedChunks.size,
    progress: Math.round((session.receivedChunks.size / session.totalChunks) * 100),
    tipo: session.tipo,
  });
});

export const uploadChunkedRouter = router;
