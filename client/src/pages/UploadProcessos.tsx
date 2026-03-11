import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Upload, FileText, CheckCircle2, AlertCircle, Loader2, X,
  FolderOpen, ExternalLink, ArrowRight, RefreshCw,
  Receipt, TrendingUp, TrendingDown, DollarSign, AlertTriangle, Wallet
} from "lucide-react";
import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type FileItem = {
  file: File;
  status: "pending" | "uploading" | "extracting" | "done" | "error";
  result?: any;
  error?: string;
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
        let friendlyError = error.message || "Erro desconhecido";
        if (friendlyError.includes("Data too long")) {
          friendlyError = "Dados extraídos excedem limite do campo. Tente novamente.";
        } else if (friendlyError.includes("Duplicate entry")) {
          friendlyError = "Processo ou cliente já cadastrado no sistema.";
        } else if (friendlyError.includes("Failed query")) {
          friendlyError = "Erro ao salvar no banco de dados. Verifique os dados do PDF.";
        } else if (friendlyError.includes("AI extraction") || friendlyError.includes("invokeLLM")) {
          friendlyError = "Falha na extração via IA. O PDF pode estar em formato não suportado.";
        } else if (friendlyError.includes("Network") || friendlyError.includes("fetch")) {
          friendlyError = "Erro de conexão. Verifique sua internet e tente novamente.";
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
        toast.success(`Contracheque de ${result.clienteNome} processado com sucesso`);
      } catch (error: any) {
        let friendlyError = error.message || "Erro desconhecido";
        if (friendlyError.includes("identificar o CPF")) {
          friendlyError = "Não foi possível identificar o CPF do servidor no contracheque.";
        } else if (friendlyError.includes("Data too long")) {
          friendlyError = "Dados excedem limite do campo.";
        } else if (friendlyError.includes("Falha na extração")) {
          friendlyError = "Falha na extração via IA. Verifique se o PDF é um contracheque válido.";
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
                    {item.status === "uploading" && <Loader2 className="h-4 w-4 animate-spin text-blue-500 shrink-0" />}
                    {item.status === "extracting" && <Loader2 className="h-4 w-4 animate-spin text-blue-600 shrink-0" />}
                    {item.status === "done" && <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />}
                    {item.status === "error" && <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{item.file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(item.file.size / 1024 / 1024).toFixed(1)} MB
                        {item.status === "uploading" && " — Enviando..."}
                        {item.status === "extracting" && " — Extraindo dados financeiros via IA..."}
                        {item.status === "done" && item.result && ` — ${item.result.clienteNome} (Ref: ${item.result.referencia})`}
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

      <Tabs defaultValue="processos" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="processos" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Processos Judiciais
          </TabsTrigger>
          <TabsTrigger value="contracheque" className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Contracheque
          </TabsTrigger>
        </TabsList>

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
