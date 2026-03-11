import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, X } from "lucide-react";
import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";

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

      // Update status to uploading
      setFiles(prev => prev.map((f, idx) => idx === fileIndex ? { ...f, status: "uploading" } : f));

      try {
        // Convert to base64
        const buffer = await fileItem.file.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
        );

        // Update status to extracting
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

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Upload de Processos</h1>
        <p className="text-muted-foreground mt-1">Envie PDFs de processos judiciais para extração automática de dados via IA</p>
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
                  <div className="flex items-center gap-3">
                    {item.status === "pending" && <FileText className="h-4 w-4 text-muted-foreground" />}
                    {item.status === "uploading" && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                    {item.status === "extracting" && <Loader2 className="h-4 w-4 animate-spin text-[oklch(0.75_0.12_85)]" />}
                    {item.status === "done" && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                    {item.status === "error" && <AlertCircle className="h-4 w-4 text-red-500" />}
                    <div>
                      <p className="text-sm font-medium">{item.file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(item.file.size / 1024 / 1024).toFixed(1)} MB
                        {item.status === "uploading" && " — Enviando..."}
                        {item.status === "extracting" && " — Extraindo dados via IA..."}
                        {item.status === "done" && item.result && ` — ${item.result.clienteNome} (${item.result.cpf})`}
                        {item.status === "error" && ` — ${item.error}`}
                      </p>
                    </div>
                  </div>
                  {item.status === "pending" && (
                    <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); removeFile(index); }}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                  {item.status === "done" && item.result && (
                    <Badge variant="outline" className="text-xs">
                      {item.result.numeroCnj}
                    </Badge>
                  )}
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
    </div>
  );
}
