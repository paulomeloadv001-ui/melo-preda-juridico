import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, X, FolderOpen, ExternalLink, ArrowRight, RefreshCw } from "lucide-react";
import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type FileItem = {
  file: File;
  status: "pending" | "uploading" | "extracting" | "done" | "error";
  result?: any;
  error?: string;
};

export default function UploadProcessos() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadMutation = trpc.processar.uploadPdf.useMutation();
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();

  const handleFileSelect = useCallback((selectedFiles: FileList | null) => {
    if (!selectedFiles) return;
    const newFiles: FileItem[] = Array.from(selectedFiles)
      .filter(f => f.type === "application/pdf")
      .map(f => ({ file: f, status: "pending" as const }));
    if (newFiles.length === 0) {
      toast.error("Selecione apenas arquivos PDF");
      return;
    }
    setFiles(prev => [...prev, ...newFiles]);
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

      setFiles(prev => prev.map((f, idx) => idx === fileIndex ? { ...f, status: "uploading" } : f));

      try {
        const buffer = await fileItem.file.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
        );

        setFiles(prev => prev.map((f, idx) => idx === fileIndex ? { ...f, status: "extracting" } : f));

        const result = await uploadMutation.mutateAsync({
          fileName: fileItem.file.name,
          fileBase64: base64,
          fileSize: fileItem.file.size,
        });

        setFiles(prev => prev.map((f, idx) => idx === fileIndex ? { ...f, status: "done", result } : f));
        toast.success(`${fileItem.file.name} processado com sucesso`);
      } catch (error: any) {
        setFiles(prev => prev.map((f, idx) => idx === fileIndex ? { ...f, status: "error", error: error.message } : f));
        toast.error(`Erro ao processar ${fileItem.file.name}`);
      }
    }

    setIsProcessing(false);
    utils.clientes.list.invalidate();
    utils.clientes.stats.invalidate();
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
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Upload de Processos</h1>
          <p className="text-muted-foreground mt-1">Envie PDFs de processos judiciais para extração automática de dados via IA</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { setFiles([]); utils.clientes.list.invalidate(); utils.clientes.stats.invalidate(); }}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Drop Zone */}
      <Card
        className="border-2 border-dashed hover:border-[oklch(0.75_0.12_85)] transition-colors cursor-pointer"
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Upload className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="font-semibold text-lg">Arraste PDFs aqui ou clique para selecionar</h3>
          <p className="text-muted-foreground text-sm mt-1">Aceita múltiplos arquivos PDF simultaneamente</p>
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
          <CardHeader className="flex flex-row items-center justify-between">
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
                    {item.status === "uploading" && <Loader2 className="h-4 w-4 animate-spin text-blue-500 shrink-0" />}
                    {item.status === "extracting" && <Loader2 className="h-4 w-4 animate-spin text-[oklch(0.75_0.12_85)] shrink-0" />}
                    {item.status === "done" && <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />}
                    {item.status === "error" && <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{item.file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(item.file.size / 1024 / 1024).toFixed(1)} MB
                        {item.status === "uploading" && " — Enviando..."}
                        {item.status === "extracting" && " — Extraindo dados via IA..."}
                        {item.status === "done" && item.result && ` — ${item.result.clienteNome} (${item.result.cpf})`}
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
          <CardHeader>
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
