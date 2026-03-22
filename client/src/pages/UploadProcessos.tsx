import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch as SwitchUI } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Upload, FileText, CheckCircle2, AlertCircle, Loader2, X,
  FolderOpen, ExternalLink, ArrowRight, RefreshCw,
  Receipt, TrendingUp, TrendingDown, DollarSign, AlertTriangle, Wallet,
  Layers, Zap, Settings2, BarChart3, BookOpen, Shield, Users, Clock,
  PackageCheck, FileStack
} from "lucide-react";
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { compressPdf, formatBytes, type CompressionResult } from "@/lib/pdfCompressor";
import { uploadFileChunked, needsChunkedUpload, fileToBase64, formatFileSize } from "@/lib/chunkedUpload";

type FileItem = {
  file: File;
  status: "pending" | "compressing" | "uploading" | "extracting" | "done" | "error";
  uploadProgress?: number;
  result?: any;
  error?: string;
  compression?: CompressionResult;
  compressionProgress?: number;
};

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

// ==================== UPLOAD DE PROCESSOS ====================
function ProcessoUpload() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadMutation = trpc.processar.uploadPdf.useMutation();
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();


  const handleFileSelect = useCallback((selectedFiles: FileList | null) => {
    if (!selectedFiles) return;
    const pdfFiles = Array.from(selectedFiles).filter(f => f.type === "application/pdf");
    if (pdfFiles.length === 0) {
      toast.error("Selecione apenas arquivos PDF");
      return;
    }
    // Sem limite de tamanho - upload chunked suporta qualquer tamanho
    setFiles(prev => [...prev, ...pdfFiles.map(f => ({ file: f, status: "pending" as const }))]);
  }, []);

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const processFiles = async () => {
    setIsProcessing(true);
    const pendingFiles = files.filter(f => f.status === "pending");

    for (let i = 0; i < pendingFiles.length; i++) {
      const fileItem = pendingFiles[i];
      const fileIndex = files.findIndex(f => f === fileItem);

      setFiles(prev => prev.map((f, idx) => idx === fileIndex ? { ...f, status: "compressing", compressionProgress: 0 } : f));

      try {
        // Comprimir PDF antes do envio
        const compression = await compressPdf(fileItem.file, {
          imageQuality: 0.65,
          imageScale: 0.85,
          onProgress: (pct) => {
            setFiles(prev => prev.map((f, idx) => idx === fileIndex ? { ...f, compressionProgress: pct } : f));
          },
        });

        if (compression.savedPercent > 0) {
          toast.info(`${fileItem.file.name}: comprimido de ${formatBytes(compression.originalSize)} para ${formatBytes(compression.compressedSize)} (-${compression.savedPercent}%)`);
        }

        setFiles(prev => prev.map((f, idx) => idx === fileIndex ? { ...f, status: "uploading", compression, uploadProgress: 0 } : f));

        let base64: string;
        let finalSize: number;

        // Arquivos >5MB: upload chunked (sem limite de tamanho)
        if (needsChunkedUpload(compression.compressedFile)) {
          const chunkedResult = await uploadFileChunked(compression.compressedFile, {
            tipo: 'processo',
            onProgress: (p) => {
              setFiles(prev => prev.map((f, idx) => idx === fileIndex ? { ...f, uploadProgress: p } : f));
            },
          });
          base64 = chunkedResult.fileBase64;
          finalSize = chunkedResult.fileSize;
        } else {
          base64 = compression.compressedBase64;
          finalSize = compression.compressedSize;
        }

        setFiles(prev => prev.map((f, idx) => idx === fileIndex ? { ...f, status: "extracting" } : f));

        const result = await uploadMutation.mutateAsync({
          fileName: fileItem.file.name,
          fileBase64: base64,
          fileSize: finalSize,
        });

        setFiles(prev => prev.map((f, idx) => idx === fileIndex ? { ...f, status: "done", result } : f));
        toast.success(`${fileItem.file.name} processado com sucesso`);
      } catch (error: any) {
        let friendlyError = error.message || "Erro desconhecido";
        if (friendlyError.includes("TIMEOUT") || friendlyError.includes("demorou mais") || friendlyError.includes("processando sua solicita")) {
          // Timeout - o processamento pode ter concluído em background
          friendlyError = "O processamento demorou mais que o esperado, mas pode ter sido concluído. Verifique a aba Clientes.";
          // Marcar como possível sucesso
          setFiles(prev => prev.map((f, idx) => idx === fileIndex ? { ...f, status: "done", result: { timeout: true, message: 'Processamento em background' } } : f));
          toast.warning(`${fileItem.file.name}: processamento pode ter concluído em background. Verifique a aba Clientes.`);
          continue;
        } else if (friendlyError.includes("grande demais") || friendlyError.includes("413")) {
          friendlyError = "Erro no envio do arquivo. Tente novamente.";
        } else if (friendlyError.includes("Data too long")) {
          friendlyError = "Dados extraídos excedem limite do campo. Tente novamente.";
        } else if (friendlyError.includes("Duplicate entry")) {
          friendlyError = "Processo ou cliente já cadastrado no sistema.";
        } else if (friendlyError.includes("Failed query")) {
          friendlyError = "Erro ao salvar no banco de dados. Verifique os dados do PDF.";
        } else if (friendlyError.includes("AI extraction") || friendlyError.includes("invokeLLM")) {
          friendlyError = "Falha na extração via IA. O PDF pode estar em formato não suportado.";
        } else if (friendlyError.includes("Network") || friendlyError.includes("fetch")) {
          friendlyError = "Erro de conexão. Verifique sua internet e tente novamente.";
        } else if (friendlyError.includes("resposta inesperada")) {
          friendlyError = "Erro de comunicação com o servidor. Tente novamente.";
        } else if (friendlyError.length > 120) {
          friendlyError = friendlyError.substring(0, 120) + "...";
        }
        setFiles(prev => prev.map((f, idx) => idx === fileIndex ? { ...f, status: "error", error: friendlyError } : f));
        toast.error(`Erro ao processar ${fileItem.file.name}: ${friendlyError}`);
      }
    }

    setIsProcessing(false);
    utils.clientes.list.invalidate();
    utils.clientes.stats.invalidate();

    // Redirecionar automaticamente para Clientes após processamento bem-sucedido
    const successCount = files.filter(f => f.status === "done").length;
    if (successCount > 0) {
      toast.success(`${successCount} processo(s) importado(s) com sucesso! Redirecionando para Clientes...`, { duration: 3000 });
      setTimeout(() => setLocation('/clientes'), 2500);
    }
  };

  const totalFiles = files.length;
  const doneFiles = files.filter(f => f.status === "done").length;
  const errorFiles = files.filter(f => f.status === "error").length;
  const progress = totalFiles > 0 ? Math.round((doneFiles / totalFiles) * 100) : 0;
  const completedResults = files.filter(f => f.status === "done" && f.result).map(f => f.result);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <Card
        className="border-2 border-dashed hover:border-[oklch(0.75_0.12_85)] transition-colors cursor-pointer"
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        <CardContent className="flex flex-col items-center justify-center py-10">
          <Upload className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <h3 className="font-semibold text-base">Arraste PDFs de processos aqui ou clique para selecionar</h3>
          <p className="text-muted-foreground text-sm mt-1">Aceita múltiplos arquivos PDF de qualquer tamanho</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            multiple
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files)}
          />
        </CardContent>
      </Card>

      {/* File List */}
      {files.length > 0 && (
        <Card className="border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between py-3">
            <div>
              <CardTitle className="text-base">Fila de Processamento ({totalFiles} arquivos)</CardTitle>
              {isProcessing && <Progress value={progress} className="mt-2 h-2" />}
            </div>
            <div className="flex gap-2">
              {doneFiles > 0 && <Badge variant="default" className="bg-green-600">{doneFiles} concluídos</Badge>}
              {errorFiles > 0 && <Badge variant="destructive">{errorFiles} erros</Badge>}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {files.map((item, index) => (
                <div key={index} className="flex items-center justify-between border rounded-lg p-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {item.status === "pending" && <FileText className="h-4 w-4 text-muted-foreground shrink-0" />}
                    {item.status === "compressing" && <Loader2 className="h-4 w-4 animate-spin text-purple-500 shrink-0" />}
                    {item.status === "uploading" && <Loader2 className="h-4 w-4 animate-spin text-blue-500 shrink-0" />}
                    {item.status === "extracting" && <Loader2 className="h-4 w-4 animate-spin text-[oklch(0.75_0.12_85)] shrink-0" />}
                    {item.status === "done" && <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />}
                    {item.status === "error" && <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{item.file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatBytes(item.file.size)}
                        {item.status === "compressing" && ` — Comprimindo PDF... ${item.compressionProgress || 0}%`}
                        {item.status === "uploading" && (
                          item.uploadProgress != null && item.uploadProgress < 100
                            ? ` — Enviando... ${item.uploadProgress}%`
                            : item.compression && item.compression.savedPercent > 0
                              ? ` — Enviando (${formatBytes(item.compression.compressedSize)}, -${item.compression.savedPercent}%)...`
                              : " — Enviando..."
                        )}
                        {item.status === "extracting" && " — Extraindo dados via IA..."}
                        {item.status === "done" && item.result && (
                          <>{` — ${item.result.clienteNome} (${item.result.cpf})`}{item.compression && item.compression.savedPercent > 0 && <span className="text-green-600 font-medium ml-1">(-{item.compression.savedPercent}%)</span>}</>
                        )}
                        {item.status === "error" && ` — ${item.error}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {item.status === "pending" && (
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); removeFile(index); }}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                    {item.status === "error" && (
                      <Button variant="ghost" size="sm" onClick={() => {
                        setFiles(prev => prev.map((f, idx) => idx === index ? { ...f, status: "pending", error: undefined } : f));
                        toast.info(`${item.file.name} adicionado novamente à fila`);
                      }}>
                        <RefreshCw className="h-3 w-3 mr-1" /> Tentar Novamente
                      </Button>
                    )}
                    {item.status === "done" && item.result && (
                      <Button variant="ghost" size="sm" onClick={() => setLocation(`/cliente/${item.result.clienteId}`)}>
                        Ver Perfil <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3 mt-4">
              <Button
                onClick={processFiles}
                disabled={isProcessing || files.filter(f => f.status === "pending").length === 0}
                className="gold-gradient text-white"
              >
                {isProcessing ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processando...</>
                ) : (
                  <><Upload className="h-4 w-4 mr-2" /> Processar {files.filter(f => f.status === "pending").length} Arquivo(s)</>
                )}
              </Button>
              <Button variant="outline" onClick={() => setFiles([])} disabled={isProcessing}>
                Limpar Fila
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resultados - Pastas Geradas */}
      {completedResults.length > 0 && (
        <Card className="border-2 border-green-200 shadow-sm bg-green-50/50">
          <CardHeader className="py-3">
            <CardTitle className="text-base flex items-center gap-2 text-green-800">
              <FolderOpen className="h-4 w-4" /> Pastas de Clientes Geradas ({completedResults.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {completedResults.map((result, idx) => (
                <div key={idx} className="border border-green-200 rounded-lg p-4 bg-white space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold text-sm">{result.clienteNome}</h4>
                      <p className="text-xs text-muted-foreground font-mono">CPF: {result.cpf} | Processo: {result.numeroCnj}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setLocation(`/cliente/${result.clienteId}`)}>
                      Ver Perfil <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </div>
                  {result.pastaCliente && (
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                        <FolderOpen className="h-3 w-3" /> {result.pastaCliente}/
                      </p>
                      {result.arquivosPasta && (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                          {Object.entries(result.arquivosPasta).map(([name, url]) => (
                            <a key={name} href={url as string} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1.5 text-xs text-[oklch(0.55_0.12_85)] hover:underline p-1.5 rounded hover:bg-white transition-colors">
                              <FileText className="h-3 w-3 shrink-0" />
                              <span className="truncate">{name}</span>
                              <ExternalLink className="h-2.5 w-2.5 shrink-0 ml-auto" />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ==================== UPLOAD DE CONTRACHEQUE ====================
function ContrachequeUpload() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadMutation = trpc.processar.uploadContracheque.useMutation();
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();


  const handleFileSelect = useCallback((selectedFiles: FileList | null) => {
    if (!selectedFiles) return;
    const pdfFiles = Array.from(selectedFiles).filter(f => f.type === "application/pdf");
    if (pdfFiles.length === 0) {
      toast.error("Selecione apenas arquivos PDF");
      return;
    }
    // Sem limite de tamanho - upload chunked suporta qualquer tamanho
    setFiles(prev => [...prev, ...pdfFiles.map(f => ({ file: f, status: "pending" as const }))]);
  }, []);

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const processFiles = async () => {
    setIsProcessing(true);
    const pendingFiles = files.filter(f => f.status === "pending");

    for (let i = 0; i < pendingFiles.length; i++) {
      const fileItem = pendingFiles[i];
      const fileIndex = files.findIndex(f => f === fileItem);

      setFiles(prev => prev.map((f, idx) => idx === fileIndex ? { ...f, status: "compressing", compressionProgress: 0 } : f));

      try {
        // Comprimir PDF antes do envio
        const compression = await compressPdf(fileItem.file, {
          imageQuality: 0.65,
          imageScale: 0.85,
          onProgress: (pct) => {
            setFiles(prev => prev.map((f, idx) => idx === fileIndex ? { ...f, compressionProgress: pct } : f));
          },
        });

        if (compression.savedPercent > 0) {
          toast.info(`${fileItem.file.name}: comprimido de ${formatBytes(compression.originalSize)} para ${formatBytes(compression.compressedSize)} (-${compression.savedPercent}%)`);
        }

        setFiles(prev => prev.map((f, idx) => idx === fileIndex ? { ...f, status: "uploading", compression, uploadProgress: 0 } : f));

        let base64: string;
        let finalSize: number;

        // Arquivos >5MB: upload chunked (sem limite de tamanho)
        if (needsChunkedUpload(compression.compressedFile)) {
          const chunkedResult = await uploadFileChunked(compression.compressedFile, {
            tipo: 'contracheque',
            onProgress: (p) => {
              setFiles(prev => prev.map((f, idx) => idx === fileIndex ? { ...f, uploadProgress: p } : f));
            },
          });
          base64 = chunkedResult.fileBase64;
          finalSize = chunkedResult.fileSize;
        } else {
          base64 = compression.compressedBase64;
          finalSize = compression.compressedSize;
        }

        setFiles(prev => prev.map((f, idx) => idx === fileIndex ? { ...f, status: "extracting" } : f));

        const result = await uploadMutation.mutateAsync({
          fileName: fileItem.file.name,
          fileBase64: base64,
          fileSize: finalSize,
        });

        setFiles(prev => prev.map((f, idx) => idx === fileIndex ? { ...f, status: "done", result } : f));
        toast.success(`Contracheque de ${result.clienteNome} processado com sucesso`);
      } catch (error: any) {
        let friendlyError = error.message || "Erro desconhecido";
        if (friendlyError.includes("grande demais") || friendlyError.includes("413")) {
          friendlyError = "Erro no envio. Tente novamente.";
        } else if (friendlyError.includes("identificar o CPF")) {
          friendlyError = "Não foi possível identificar o CPF do servidor no contracheque.";
        } else if (friendlyError.includes("Data too long")) {
          friendlyError = "Dados excedem limite do campo.";
        } else if (friendlyError.includes("Falha na extração")) {
          friendlyError = "Falha na extração via IA. Verifique se o PDF é um contracheque válido.";
        } else if (friendlyError.includes("resposta inesperada")) {
          friendlyError = "Erro de comunicação com o servidor. Tente novamente.";
        } else if (friendlyError.length > 120) {
          friendlyError = friendlyError.substring(0, 120) + "...";
        }
        setFiles(prev => prev.map((f, idx) => idx === fileIndex ? { ...f, status: "error", error: friendlyError } : f));
        toast.error(`Erro: ${friendlyError}`);
      }
    }

    setIsProcessing(false);
    utils.clientes.list.invalidate();
    utils.clientes.stats.invalidate();

    // Redirecionar automaticamente para Clientes após processamento bem-sucedido
    const successCount = files.filter(f => f.status === "done").length;
    if (successCount > 0) {
      toast.success(`${successCount} contracheque(s) processado(s)! Redirecionando para Clientes...`, { duration: 3000 });
      setTimeout(() => setLocation('/clientes'), 2500);
    }
  };

  const totalFiles = files.length;
  const doneFiles = files.filter(f => f.status === "done").length;
  const errorFiles = files.filter(f => f.status === "error").length;
  const progress = totalFiles > 0 ? Math.round((doneFiles / totalFiles) * 100) : 0;
  const completedResults = files.filter(f => f.status === "done" && f.result).map(f => f.result);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  return (
    <div className="space-y-4">
      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
        <Receipt className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
        <div>
          <h4 className="font-medium text-sm text-blue-900">Upload de Contracheque / Demonstrativo de Pagamento</h4>
          <p className="text-xs text-blue-700 mt-1">
            O sistema extrai automaticamente: remuneração bruta/líquida, descontos (IRRF, previdência),
            cada empréstimo consignado com rubrica e parcela, cálculo de margem consignável (35% conforme Lei Estadual 16.898/2010),
            margem disponível e indicação de margem excedida.
          </p>
        </div>
      </div>

      {/* Drop Zone */}
      <Card
        className="border-2 border-dashed hover:border-blue-400 transition-colors cursor-pointer"
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        <CardContent className="flex flex-col items-center justify-center py-10">
          <Receipt className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <h3 className="font-semibold text-base">Arraste contracheques PDF aqui ou clique para selecionar</h3>
          <p className="text-muted-foreground text-sm mt-1">Demonstrativos de pagamento de servidores públicos</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            multiple
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files)}
          />
        </CardContent>
      </Card>

      {/* File List */}
      {files.length > 0 && (
        <Card className="border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between py-3">
            <div>
              <CardTitle className="text-base">Fila de Processamento ({totalFiles} contracheques)</CardTitle>
              {isProcessing && <Progress value={progress} className="mt-2 h-2" />}
            </div>
            <div className="flex gap-2">
              {doneFiles > 0 && <Badge variant="default" className="bg-green-600">{doneFiles} concluídos</Badge>}
              {errorFiles > 0 && <Badge variant="destructive">{errorFiles} erros</Badge>}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {files.map((item, index) => (
                <div key={index} className="flex items-center justify-between border rounded-lg p-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {item.status === "pending" && <Receipt className="h-4 w-4 text-muted-foreground shrink-0" />}
                    {item.status === "compressing" && <Loader2 className="h-4 w-4 animate-spin text-purple-500 shrink-0" />}
                    {item.status === "uploading" && <Loader2 className="h-4 w-4 animate-spin text-blue-500 shrink-0" />}
                    {item.status === "extracting" && <Loader2 className="h-4 w-4 animate-spin text-blue-600 shrink-0" />}
                    {item.status === "done" && <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />}
                    {item.status === "error" && <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{item.file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatBytes(item.file.size)}
                        {item.status === "compressing" && ` — Comprimindo PDF... ${item.compressionProgress || 0}%`}
                        {item.status === "uploading" && (item.compression && item.compression.savedPercent > 0
                          ? ` — Enviando (${formatBytes(item.compression.compressedSize)}, -${item.compression.savedPercent}%)...`
                          : " — Enviando...")}
                        {item.status === "extracting" && " — Extraindo dados financeiros via IA..."}
                        {item.status === "done" && item.result && (
                          <>{` — ${item.result.clienteNome} (Ref: ${item.result.referencia})`}{item.compression && item.compression.savedPercent > 0 && <span className="text-green-600 font-medium ml-1">(-{item.compression.savedPercent}%)</span>}</>
                        )}
                        {item.status === "error" && ` — ${item.error}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {item.status === "pending" && (
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); removeFile(index); }}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                    {item.status === "error" && (
                      <Button variant="ghost" size="sm" onClick={() => {
                        setFiles(prev => prev.map((f, idx) => idx === index ? { ...f, status: "pending", error: undefined } : f));
                      }}>
                        <RefreshCw className="h-3 w-3 mr-1" /> Tentar Novamente
                      </Button>
                    )}
                    {item.status === "done" && item.result && (
                      <Button variant="ghost" size="sm" onClick={() => setLocation(`/cliente/${item.result.clienteId}`)}>
                        Ver Perfil <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3 mt-4">
              <Button
                onClick={processFiles}
                disabled={isProcessing || files.filter(f => f.status === "pending").length === 0}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isProcessing ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processando...</>
                ) : (
                  <><Receipt className="h-4 w-4 mr-2" /> Processar {files.filter(f => f.status === "pending").length} Contracheque(s)</>
                )}
              </Button>
              <Button variant="outline" onClick={() => setFiles([])} disabled={isProcessing}>
                Limpar Fila
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resultados Financeiros */}
      {completedResults.length > 0 && (
        <div className="space-y-4">
          {completedResults.map((result, idx) => (
            <Card key={idx} className="border-2 border-blue-200 shadow-sm">
              <CardHeader className="py-3 bg-blue-50/50">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-blue-600" />
                      {result.clienteNome}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      CPF: {result.cpf} | Referência: {result.referencia}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setLocation(`/cliente/${result.clienteId}`)}>
                    Ver Perfil <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                {/* Resumo Financeiro */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                    <div className="flex items-center gap-1.5 text-xs text-green-700 mb-1">
                      <TrendingUp className="h-3 w-3" /> Remuneração Bruta
                    </div>
                    <p className="font-bold text-sm text-green-900">{formatCurrency(result.resumoFinanceiro?.remuneracaoBruta)}</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                    <div className="flex items-center gap-1.5 text-xs text-blue-700 mb-1">
                      <DollarSign className="h-3 w-3" /> Remuneração Líquida
                    </div>
                    <p className="font-bold text-sm text-blue-900">{formatCurrency(result.resumoFinanceiro?.remuneracaoLiquida)}</p>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                    <div className="flex items-center gap-1.5 text-xs text-amber-700 mb-1">
                      <Wallet className="h-3 w-3" /> Margem Consignável (35%)
                    </div>
                    <p className="font-bold text-sm text-amber-900">{formatCurrency(result.resumoFinanceiro?.margemConsignavel)}</p>
                  </div>
                  <div className={`rounded-lg p-3 border ${result.resumoFinanceiro?.margemExcedida
                    ? "bg-red-50 border-red-200"
                    : "bg-emerald-50 border-emerald-200"
                  }`}>
                    <div className={`flex items-center gap-1.5 text-xs mb-1 ${result.resumoFinanceiro?.margemExcedida ? "text-red-700" : "text-emerald-700"}`}>
                      {result.resumoFinanceiro?.margemExcedida
                        ? <><AlertTriangle className="h-3 w-3" /> Margem EXCEDIDA</>
                        : <><TrendingUp className="h-3 w-3" /> Margem Disponível</>
                      }
                    </div>
                    <p className={`font-bold text-sm ${result.resumoFinanceiro?.margemExcedida ? "text-red-900" : "text-emerald-900"}`}>
                      {result.resumoFinanceiro?.margemExcedida
                        ? `- ${formatCurrency(result.resumoFinanceiro?.valorExcedente)}`
                        : formatCurrency(result.resumoFinanceiro?.margemDisponivel)
                      }
                    </p>
                  </div>
                </div>

                {/* Status Badges */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <Badge variant={result.resumoFinanceiro?.aptoEmprestimo ? "default" : "destructive"}>
                    {result.resumoFinanceiro?.aptoEmprestimo ? "Apto para Empréstimo" : "Inapto para Empréstimo"}
                  </Badge>
                  <Badge variant="outline">
                    Score de Risco: {result.resumoFinanceiro?.scoreRisco || "N/A"}
                  </Badge>
                  <Badge variant="outline">
                    {result.resumoFinanceiro?.totalEmprestimos || 0} Empréstimo(s) Consignado(s)
                  </Badge>
                  <Badge variant="outline">
                    Total Consignações: {formatCurrency(result.resumoFinanceiro?.totalConsignacoes)}
                  </Badge>
                </div>

                {/* Empréstimos Detalhados */}
                {result.emprestimos && result.emprestimos.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                      <TrendingDown className="h-3.5 w-3.5 text-red-500" /> Empréstimos Consignados Identificados
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="bg-gray-50 border-b">
                            <th className="text-left p-2 font-medium">Banco</th>
                            <th className="text-left p-2 font-medium">Rubrica</th>
                            <th className="text-left p-2 font-medium">Contrato</th>
                            <th className="text-right p-2 font-medium">Parcela</th>
                            <th className="text-right p-2 font-medium">Total Parcelas</th>
                            <th className="text-right p-2 font-medium">Valor Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.emprestimos.map((emp: any, empIdx: number) => (
                            <tr key={empIdx} className="border-b hover:bg-gray-50">
                              <td className="p-2 font-medium">{emp.banco || "—"}</td>
                              <td className="p-2 text-muted-foreground">{emp.rubrica || "—"}</td>
                              <td className="p-2 text-muted-foreground font-mono">{emp.contrato || "—"}</td>
                              <td className="p-2 text-right font-medium text-red-600">{formatCurrency(emp.valorParcela)}</td>
                              <td className="p-2 text-right">{emp.totalParcelas || "—"}</td>
                              <td className="p-2 text-right">{formatCurrency(emp.valorTotal)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== IMPORTAÇÃO EM LOTE ====================
type LoteFileItem = {
  file: File;
  tipoDetectado: 'processo' | 'contracheque' | 'auto';
  tipoManual?: 'processo' | 'contracheque';
  status: 'pending' | 'compressing' | 'uploading' | 'queued' | 'processing' | 'done' | 'error';
};

function detectarTipoDocumento(fileName: string): 'processo' | 'contracheque' {
  const nome = fileName.toLowerCase();
  if (nome.includes('contracheque') || nome.includes('demonstrativo') || nome.includes('holerite') || nome.includes('pagamento') || nome.includes('folha')) {
    return 'contracheque';
  }
  return 'processo';
}

function ImportacaoLote() {
  const [files, setFiles] = useState<LoteFileItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [masterJobId, setMasterJobId] = useState<number | null>(null);
  const [loteId, setLoteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, setLocation] = useLocation();

  // Opções de importação
  const [opcoes, setOpcoes] = useState({
    gerarConhecimentos: true,
    gerarRelatorios: true,
    deduplicarAutomatico: true,
    gerarPastaCliente: true,
  });

  const uploadArquivoMutation = trpc.jobs.uploadArquivoLote.useMutation();
  const iniciarLoteMutation = trpc.jobs.iniciarLote.useMutation();
  const { data: statusLote, refetch: refetchStatus } = trpc.jobs.statusLote.useQuery(
    { masterJobId: masterJobId! },
    { enabled: !!masterJobId, refetchInterval: masterJobId ? 2000 : false }
  );
  const utils = trpc.useUtils();

  // Parar polling quando lote concluir
  useEffect(() => {
    if (statusLote?.master?.status === 'concluido' || statusLote?.master?.status === 'erro') {
      setIsProcessing(false);
      if (statusLote.master.status === 'concluido') {
        toast.success('Importação em lote concluída! Redirecionando para Clientes...');
        utils.clientes.list.invalidate();
        utils.clientes.stats.invalidate();
        utils.conhecimentosRouter.list.invalidate();
        // Redirecionar automaticamente para Clientes após 3 segundos
        setTimeout(() => setLocation('/clientes'), 3000);
      }
    }
  }, [statusLote?.master?.status]);


  const handleFileSelect = useCallback((selectedFiles: FileList | null) => {
    if (!selectedFiles) return;
    const pdfFiles = Array.from(selectedFiles).filter(f => f.type === 'application/pdf');
    if (pdfFiles.length === 0) {
      toast.error('Selecione apenas arquivos PDF');
      return;
    }
    // Sem limite de tamanho - upload chunked suporta qualquer tamanho
    const newFiles: LoteFileItem[] = pdfFiles.map(f => ({
      file: f,
      tipoDetectado: detectarTipoDocumento(f.name),
      status: 'pending' as const,
    }));
    setFiles(prev => [...prev, ...newFiles]);
    toast.success(`${pdfFiles.length} arquivo(s) adicionado(s) à fila`);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const alterarTipo = (index: number, tipo: 'processo' | 'contracheque') => {
    setFiles(prev => prev.map((f, i) => i === index ? { ...f, tipoManual: tipo } : f));
  };

  const iniciarImportacao = async () => {
    const pendingFiles = files.filter(f => f.status === 'pending');
    if (pendingFiles.length === 0) {
      toast.error('Nenhum arquivo pendente para importar');
      return;
    }

    setIsProcessing(true);
    setFiles(prev => prev.map(f => f.status === 'pending' ? { ...f, status: 'queued' } : f));
    const newLoteId = `LOTE_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    setLoteId(newLoteId);

    try {
      // Enviar cada arquivo INDIVIDUALMENTE (evita PayloadTooLarge)
      const jobIds: number[] = [];
      const arquivosNomes: string[] = [];
      for (let i = 0; i < pendingFiles.length; i++) {
        const item = pendingFiles[i];
        setFiles(prev => prev.map(f => f.file === item.file ? { ...f, status: 'compressing' as const } : f));
        toast.info(`Comprimindo ${i + 1}/${pendingFiles.length}: ${item.file.name}`);

        // Comprimir PDF antes do envio
        const compression = await compressPdf(item.file, {
          imageQuality: 0.65,
          imageScale: 0.85,
        });

        if (compression.savedPercent > 0) {
          toast.info(`${item.file.name}: comprimido -${compression.savedPercent}% (${formatBytes(compression.originalSize)} → ${formatBytes(compression.compressedSize)})`);
        }

        setFiles(prev => prev.map(f => f.file === item.file ? { ...f, status: 'uploading' as const } : f));

        let base64: string;
        let finalSize: number;

        // Arquivos >5MB: upload chunked (sem limite de tamanho)
        if (needsChunkedUpload(compression.compressedFile)) {
          const chunkedResult = await uploadFileChunked(compression.compressedFile, {
            tipo: (item.tipoManual || item.tipoDetectado) as any || 'processo',
            onProgress: (p) => {
              setFiles(prev => prev.map(f => f.file === item.file ? { ...f, uploadProgress: p } : f));
            },
          });
          base64 = chunkedResult.fileBase64;
          finalSize = chunkedResult.fileSize;
        } else {
          base64 = compression.compressedBase64;
          finalSize = compression.compressedSize;
        }

        try {
          const result = await uploadArquivoMutation.mutateAsync({
            fileName: item.file.name,
            fileBase64: base64,
            fileSize: finalSize,
            tipoDocumento: (item.tipoManual || item.tipoDetectado) as 'processo' | 'contracheque' | 'auto',
            loteId: newLoteId,
            masterJobId: 0,
            posicaoNoLote: i + 1,
            totalNoLote: pendingFiles.length,
            opcoes: { ...opcoes, prioridade: 0 },
          });

          jobIds.push(result.jobId);
          arquivosNomes.push(item.file.name);
          setFiles(prev => prev.map(f => f.file === item.file ? { ...f, status: 'queued' } : f));
        } catch (uploadError: any) {
          const msg = uploadError.message || 'Erro desconhecido';
          const friendlyMsg = msg.includes('grande demais') || msg.includes('413')
            ? 'Arquivo grande demais para envio. Tente comprimir o PDF.'
            : msg.length > 80 ? msg.substring(0, 80) + '...' : msg;
          setFiles(prev => prev.map(f => f.file === item.file ? { ...f, status: 'error' as const, erro: friendlyMsg } : f));
          toast.error(`Erro ao enviar ${item.file.name}: ${friendlyMsg}`);
        }
      }

      // Verificar se pelo menos 1 arquivo foi enviado com sucesso
      if (jobIds.length === 0) {
        toast.error('Nenhum arquivo foi enviado com sucesso. Verifique os arquivos e tente novamente.');
        setIsProcessing(false);
        return;
      }

      // Todos os arquivos enviados, agora criar o lote master e iniciar processamento
      toast.info('Todos os arquivos enviados. Iniciando processamento em lote...');
      const loteResult = await iniciarLoteMutation.mutateAsync({
        loteId: newLoteId,
        jobIds,
        totalArquivos: pendingFiles.length,
        arquivosNomes,
        opcoes: { ...opcoes, prioridade: 0 },
      });

      setMasterJobId(loteResult.masterJobId);
      toast.success(`${loteResult.total} arquivo(s) enviados para processamento em lote`);
    } catch (error: any) {
      toast.error(`Erro ao iniciar importação: ${error.message}`);
      setIsProcessing(false);
      setFiles(prev => prev.map(f => (f.status === 'queued' || f.status === 'uploading') ? { ...f, status: 'pending' } : f));
    }
  };

  const resetarLote = () => {
    setFiles([]);
    setMasterJobId(null);
    setLoteId(null);
    setIsProcessing(false);
  };

  const totalFiles = files.length;
  const processos = files.filter(f => (f.tipoManual || f.tipoDetectado) === 'processo');
  const contracheques = files.filter(f => (f.tipoManual || f.tipoDetectado) === 'contracheque');

  // Resumo do lote
  const resumoLote = statusLote?.resumo;
  const masterStatus = statusLote?.master?.status;
  const masterProgresso = statusLote?.master?.progresso || 0;
  const masterMsg = statusLote?.master?.mensagemProgresso || '';

  return (
    <div className="space-y-4">
      {/* Banner Informativo */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
        <Layers className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
        <div>
          <h4 className="font-medium text-sm text-amber-900">Importação em Lote — Fluxo Automatizado Completo</h4>
          <p className="text-xs text-amber-700 mt-1">
            Arraste dezenas ou centenas de PDFs de uma vez. O sistema detecta automaticamente o tipo de cada documento
            (processo judicial ou contracheque), processa em sequência via fila de trabalhos, extrai dados via IA,
            gera conhecimentos jurídicos, atualiza relatórios e deduplica automaticamente.
          </p>
        </div>
      </div>

      {/* Opções de Importação */}
      {!isProcessing && !masterJobId && (
        <Card className="border shadow-sm">
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              Opções do Lote
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center gap-2">
                <SwitchUI checked={opcoes.gerarConhecimentos} onCheckedChange={(v) => setOpcoes(p => ({ ...p, gerarConhecimentos: v }))} id="opt-conhecimentos" />
                <Label htmlFor="opt-conhecimentos" className="text-xs cursor-pointer">
                  <BookOpen className="h-3 w-3 inline mr-1" /> Gerar Conhecimentos
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <SwitchUI checked={opcoes.gerarRelatorios} onCheckedChange={(v) => setOpcoes(p => ({ ...p, gerarRelatorios: v }))} id="opt-relatorios" />
                <Label htmlFor="opt-relatorios" className="text-xs cursor-pointer">
                  <BarChart3 className="h-3 w-3 inline mr-1" /> Atualizar Relatórios
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <SwitchUI checked={opcoes.deduplicarAutomatico} onCheckedChange={(v) => setOpcoes(p => ({ ...p, deduplicarAutomatico: v }))} id="opt-dedup" />
                <Label htmlFor="opt-dedup" className="text-xs cursor-pointer">
                  <Shield className="h-3 w-3 inline mr-1" /> Deduplicar Automático
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <SwitchUI checked={opcoes.gerarPastaCliente} onCheckedChange={(v) => setOpcoes(p => ({ ...p, gerarPastaCliente: v }))} id="opt-pasta" />
                <Label htmlFor="opt-pasta" className="text-xs cursor-pointer">
                  <FolderOpen className="h-3 w-3 inline mr-1" /> Gerar Pasta Cliente
                </Label>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Drop Zone */}
      {!isProcessing && !masterJobId && (
        <Card
          className="border-2 border-dashed hover:border-amber-400 transition-colors cursor-pointer bg-gradient-to-b from-white to-amber-50/30"
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="h-16 w-16 rounded-full bg-amber-100 flex items-center justify-center mb-4">
              <FileStack className="h-8 w-8 text-amber-600" />
            </div>
            <h3 className="font-semibold text-lg">Arraste todos os PDFs aqui ou clique para selecionar</h3>
            <p className="text-muted-foreground text-sm mt-1">Processos judiciais e contracheques misturados — o sistema detecta automaticamente</p>
            <div className="flex gap-4 mt-4">
              <Badge variant="outline" className="gap-1"><FileText className="h-3 w-3" /> Processos</Badge>
              <Badge variant="outline" className="gap-1"><Receipt className="h-3 w-3" /> Contracheques</Badge>
              <Badge variant="outline" className="gap-1"><Zap className="h-3 w-3" /> Detecção Automática</Badge>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              multiple
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files)}
            />
          </CardContent>
        </Card>
      )}

      {/* Lista de Arquivos Selecionados */}
      {files.length > 0 && !masterJobId && (
        <Card className="border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between py-3">
            <div>
              <CardTitle className="text-base">
                Fila de Importação ({totalFiles} arquivo{totalFiles !== 1 ? 's' : ''})
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {processos.length} processo(s) | {contracheques.length} contracheque(s)
              </p>
            </div>
            <div className="flex gap-2">
              <Badge variant="default" className="bg-blue-600 gap-1">
                <FileText className="h-3 w-3" /> {processos.length} Processos
              </Badge>
              <Badge variant="default" className="bg-green-600 gap-1">
                <Receipt className="h-3 w-3" /> {contracheques.length} Contracheques
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {files.map((item, index) => (
                <div key={index} className="flex items-center justify-between border rounded-lg p-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {(item.tipoManual || item.tipoDetectado) === 'processo'
                      ? <FileText className="h-4 w-4 text-blue-500 shrink-0" />
                      : <Receipt className="h-4 w-4 text-green-500 shrink-0" />
                    }
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{item.file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(item.file.size / 1024 / 1024).toFixed(1)} MB —
                        Detectado: <span className="font-medium">{item.tipoDetectado === 'processo' ? 'Processo Judicial' : 'Contracheque'}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      className="text-xs border rounded px-2 py-1 bg-white"
                      value={item.tipoManual || item.tipoDetectado}
                      onChange={(e) => alterarTipo(index, e.target.value as 'processo' | 'contracheque')}
                    >
                      <option value="processo">Processo</option>
                      <option value="contracheque">Contracheque</option>
                    </select>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeFile(index)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3 mt-4 pt-4 border-t">
              <Button
                onClick={iniciarImportacao}
                disabled={isProcessing || files.filter(f => f.status === 'pending').length === 0}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                <Zap className="h-4 w-4 mr-2" />
                Iniciar Importação em Lote ({files.filter(f => f.status === 'pending').length} arquivo{files.filter(f => f.status === 'pending').length !== 1 ? 's' : ''})
              </Button>
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" /> Adicionar Mais
              </Button>
              <Button variant="outline" onClick={() => setFiles([])}>
                Limpar Fila
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Painel de Monitoramento em Tempo Real */}
      {masterJobId && statusLote && (
        <div className="space-y-4">
          {/* Progresso Geral */}
          <Card className={`border-2 shadow-sm ${
            masterStatus === 'concluido' ? 'border-green-300 bg-green-50/30' :
            masterStatus === 'erro' ? 'border-red-300 bg-red-50/30' :
            'border-amber-300 bg-amber-50/30'
          }`}>
            <CardHeader className="py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  {masterStatus === 'concluido' ? (
                    <><PackageCheck className="h-5 w-5 text-green-600" /> Importação Concluída</>
                  ) : masterStatus === 'erro' ? (
                    <><AlertCircle className="h-5 w-5 text-red-600" /> Erro na Importação</>
                  ) : (
                    <><Loader2 className="h-5 w-5 text-amber-600 animate-spin" /> Processando Lote...</>
                  )}
                </CardTitle>
                <Badge variant="outline" className="text-xs font-mono">{loteId}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{masterMsg}</span>
                  <span className="font-bold text-lg">{masterProgresso}%</span>
                </div>
                <Progress value={masterProgresso} className="h-3" />

                {/* Stats do Lote */}
                {resumoLote && (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
                    <div className="bg-white rounded-lg p-3 border text-center">
                      <p className="text-xs text-muted-foreground">Total</p>
                      <p className="text-xl font-bold">{resumoLote.total}</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border text-center">
                      <p className="text-xs text-green-600">Concluídos</p>
                      <p className="text-xl font-bold text-green-600">{resumoLote.concluidos}</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border text-center">
                      <p className="text-xs text-blue-600">Processando</p>
                      <p className="text-xl font-bold text-blue-600">{resumoLote.processando}</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border text-center">
                      <p className="text-xs text-yellow-600">Pendentes</p>
                      <p className="text-xl font-bold text-yellow-600">{resumoLote.pendentes}</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border text-center">
                      <p className="text-xs text-red-600">Erros</p>
                      <p className="text-xl font-bold text-red-600">{resumoLote.erros}</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Detalhes dos Jobs Individuais */}
          {statusLote.filhos && statusLote.filhos.length > 0 && (
            <Card className="border shadow-sm">
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Detalhes do Processamento</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {statusLote.filhos.map((job: any) => (
                    <div key={job.id} className={`flex items-center justify-between border rounded-lg p-3 transition-all ${
                      job.status === 'processando' ? 'bg-blue-50/50 border-blue-200' :
                      job.status === 'concluido' ? 'bg-green-50/50 border-green-200' :
                      job.status === 'erro' ? 'bg-red-50/50 border-red-200' :
                      'bg-gray-50/50'
                    }`}>
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {job.status === 'pendente' && <Clock className="h-4 w-4 text-gray-400 shrink-0" />}
                        {job.status === 'processando' && <Loader2 className="h-4 w-4 text-blue-500 animate-spin shrink-0" />}
                        {job.status === 'concluido' && <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />}
                        {job.status === 'erro' && <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />}
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{job.titulo?.replace('[Lote] ', '')}</p>
                          <p className="text-xs text-muted-foreground">
                            {job.status === 'processando' && (job.mensagemProgresso || 'Processando...')}
                            {job.status === 'concluido' && 'Processado com sucesso'}
                            {job.status === 'erro' && (job.erroDetalhes || 'Erro no processamento')}
                            {job.status === 'pendente' && 'Aguardando na fila'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-xs">
                          {job.tipo === 'importacao_pdf' ? 'Processo' : 'Contracheque'}
                        </Badge>
                        {job.status === 'processando' && (
                          <span className="text-xs font-medium text-blue-600">{job.progresso || 0}%</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Resumo Final */}
          {masterStatus === 'concluido' && resumoLote && (
            <Card className="border-2 border-green-300 shadow-sm">
              <CardHeader className="py-3 bg-green-50/50">
                <CardTitle className="text-base flex items-center gap-2">
                  <PackageCheck className="h-5 w-5 text-green-600" />
                  Resumo da Importação em Lote
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="bg-green-50 rounded-lg p-4 border border-green-200 text-center">
                    <CheckCircle2 className="h-6 w-6 text-green-600 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-green-700">{resumoLote.concluidos}</p>
                    <p className="text-xs text-green-600">Processados com Sucesso</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-200 text-center">
                    <Users className="h-6 w-6 text-blue-600 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-blue-700">{resumoLote.clientesImportados}</p>
                    <p className="text-xs text-blue-600">Clientes Identificados</p>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-4 border border-amber-200 text-center">
                    <FileText className="h-6 w-6 text-amber-600 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-amber-700">{resumoLote.processosImportados}</p>
                    <p className="text-xs text-amber-600">Processos Importados</p>
                  </div>
                  {resumoLote.erros > 0 && (
                    <div className="bg-red-50 rounded-lg p-4 border border-red-200 text-center">
                      <AlertCircle className="h-6 w-6 text-red-600 mx-auto mb-1" />
                      <p className="text-2xl font-bold text-red-700">{resumoLote.erros}</p>
                      <p className="text-xs text-red-600">Erros</p>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 mb-4">
                  {opcoes.gerarConhecimentos && <Badge variant="default" className="bg-purple-600 gap-1"><BookOpen className="h-3 w-3" /> Conhecimentos Gerados</Badge>}
                  {opcoes.gerarRelatorios && <Badge variant="default" className="bg-blue-600 gap-1"><BarChart3 className="h-3 w-3" /> Relatórios Atualizados</Badge>}
                  {opcoes.deduplicarAutomatico && <Badge variant="default" className="bg-green-600 gap-1"><Shield className="h-3 w-3" /> Deduplicado</Badge>}
                  {opcoes.gerarPastaCliente && <Badge variant="default" className="bg-amber-600 gap-1"><FolderOpen className="h-3 w-3" /> Pastas Geradas</Badge>}
                </div>

                <div className="flex gap-3">
                  <Button onClick={() => setLocation('/clientes')} className="bg-blue-600 hover:bg-blue-700 text-white">
                    <Users className="h-4 w-4 mr-2" /> Ver Clientes
                  </Button>
                  <Button variant="outline" onClick={() => setLocation('/conhecimentos')}>
                    <BookOpen className="h-4 w-4 mr-2" /> Ver Conhecimentos
                  </Button>
                  <Button variant="outline" onClick={() => setLocation('/relatorios')}>
                    <BarChart3 className="h-4 w-4 mr-2" /> Ver Relatórios
                  </Button>
                  <Button variant="outline" onClick={resetarLote}>
                    <RefreshCw className="h-4 w-4 mr-2" /> Nova Importação
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ==================== PÁGINA PRINCIPAL ====================
export default function UploadProcessos() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Upload de Documentos</h1>
          <p className="text-muted-foreground mt-1">Importe processos judiciais e contracheques para extração automática de dados via IA</p>
        </div>
      </div>

      <Tabs defaultValue="lote" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-lg">
          <TabsTrigger value="lote" className="flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Importação em Lote
          </TabsTrigger>
          <TabsTrigger value="processos" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Processo Individual
          </TabsTrigger>
          <TabsTrigger value="contracheque" className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Contracheque
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lote" className="mt-4">
          <ImportacaoLote />
        </TabsContent>

        <TabsContent value="processos" className="mt-4">
          <ProcessoUpload />
        </TabsContent>

        <TabsContent value="contracheque" className="mt-4">
          <ContrachequeUpload />
        </TabsContent>
      </Tabs>
    </div>
  );
}
