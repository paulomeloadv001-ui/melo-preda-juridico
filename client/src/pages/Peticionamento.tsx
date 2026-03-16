import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  FileText, Download, Plus, Search, Edit, Trash2, Copy,
  CheckCircle, Clock, FileCheck, Archive, Send, RefreshCw,
  ChevronRight, Loader2, Eye, RotateCcw, Paperclip, Upload, X,
  History, GitBranch, ArrowLeft, ChevronDown, ChevronUp, Diff
} from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  rascunho: { label: "Rascunho", color: "bg-yellow-100 text-yellow-800", icon: Edit },
  revisado: { label: "Revisado", color: "bg-blue-100 text-blue-800", icon: FileCheck },
  aprovado: { label: "Aprovado", color: "bg-green-100 text-green-800", icon: CheckCircle },
  protocolado: { label: "Protocolado", color: "bg-purple-100 text-purple-800", icon: Send },
  arquivado: { label: "Arquivado", color: "bg-gray-100 text-gray-800", icon: Archive },
};

export default function Peticionamento() {
  // Ler clienteId da URL query param (vindo do perfil do cliente)
  const urlParams = new URLSearchParams(window.location.search);
  const initialClienteId = urlParams.get('clienteId') ? Number(urlParams.get('clienteId')) : undefined;

  const [tab, setTab] = useState("gerar");
  const [busca, setBusca] = useState("");

  // Wizard state
  const [step, setStep] = useState(initialClienteId ? 1 : 1);
  const [tipoPeticao, setTipoPeticao] = useState("");
  const [clienteId, setClienteId] = useState<number | undefined>(initialClienteId);
  const [processoId, setProcessoId] = useState<number | undefined>();
  const [templateId, setTemplateId] = useState<number | undefined>();
  const [instrucoes, setInstrucoes] = useState("");
  const [gerando, setGerando] = useState(false);
  const [peticaoGerada, setPeticaoGerada] = useState<any>(null);

  // Dialog states
  const [editDialog, setEditDialog] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editConteudo, setEditConteudo] = useState("");
  const [editTitulo, setEditTitulo] = useState("");
  const [previewDialog, setPreviewDialog] = useState(false);
  const [previewConteudo, setPreviewConteudo] = useState("");
  const [previewTitulo, setPreviewTitulo] = useState("");
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [anexosDialog, setAnexosDialog] = useState(false);
  const [anexosPeticaoId, setAnexosPeticaoId] = useState<number | null>(null);
  const [uploadingAnexo, setUploadingAnexo] = useState(false);

  // Queries
  const { data: tipos } = trpc.agente.tiposPeticao.useQuery();
  const { data: templates } = trpc.agente.listarTemplates.useQuery();
  const { data: clientes } = trpc.clientes.list.useQuery({});
  const { data: peticoes, refetch: refetchPeticoes } = trpc.agente.listarPeticoes.useQuery({ limit: 100 });

  // Processos do cliente selecionado
  const { data: perfilCliente } = trpc.clientes.getFullProfile.useQuery(
    { id: clienteId! },
    { enabled: !!clienteId }
  );
  const processos = perfilCliente?.processos || [];

  // Mutations
  const gerarPeticao = trpc.agente.gerarPeticao.useMutation({
    onSuccess: (data) => {
      setPeticaoGerada(data);
      setGerando(false);
      setStep(5);
      refetchPeticoes();
      toast.success(`Petição gerada! ${data.tipoPeticao} — ${data.cliente}`);
    },
    onError: (err) => {
      setGerando(false);
      toast.error(`Erro ao gerar: ${err.message}`);
    },
  });

  const editarPeticao = trpc.agente.editarPeticao.useMutation({
    onSuccess: () => {
      setEditDialog(false);
      refetchPeticoes();
      toast.success("Petição atualizada!");
    },
  });

  const excluirPeticao = trpc.agente.excluirPeticao.useMutation({
    onSuccess: () => {
      setDeleteDialog(false);
      refetchPeticoes();
      toast.success("Petição excluída");
    },
  });

  const duplicarPeticao = trpc.agente.duplicarPeticao.useMutation({
    onSuccess: () => {
      refetchPeticoes();
      toast.success("Petição duplicada!");
    },
  });

  const regenerarDocx = trpc.agente.regenerarDocx.useMutation({
    onSuccess: (data) => {
      refetchPeticoes();
      if (data.docxUrl) {
        window.open(data.docxUrl, '_blank');
      }
      toast.success("DOCX regenerado! Download iniciado");
    },
    onError: (err) => {
      toast.error(`Erro ao gerar DOCX: ${err.message}`);
    },
  });

  const exportarDocx = trpc.agente.exportarDocx.useMutation({
    onSuccess: (data) => {
      if (data.docxUrl) window.open(data.docxUrl, '_blank');
      toast.success("DOCX pronto! Download iniciado");
    },
    onError: (err) => {
      toast.error(`Erro ao exportar: ${err.message}`);
    },
  });

  // Anexos
  const { data: anexos, refetch: refetchAnexos } = trpc.agente.listarAnexos.useQuery(
    { peticaoId: anexosPeticaoId! },
    { enabled: !!anexosPeticaoId }
  );

  const uploadAnexo = trpc.agente.uploadAnexo.useMutation({
    onSuccess: () => {
      refetchAnexos();
      toast.success("Anexo adicionado!");
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const excluirAnexo = trpc.agente.excluirAnexo.useMutation({
    onSuccess: () => {
      refetchAnexos();
      toast.success("Anexo removido");
    },
  });

  const handleUploadAnexo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !anexosPeticaoId) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx 10MB)");
      return;
    }
    setUploadingAnexo(true);
    try {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        uploadAnexo.mutate({
          peticaoId: anexosPeticaoId,
          nomeArquivo: file.name,
          tipoArquivo: file.type,
          tamanhoBytes: file.size,
          base64Data: base64,
        }, { onSettled: () => setUploadingAnexo(false) });
      };
      reader.readAsDataURL(file);
    } catch {
      setUploadingAnexo(false);
      toast.error("Erro ao ler arquivo");
    }
    e.target.value = '';
  };

  const openAnexos = (petId: number) => {
    setAnexosPeticaoId(petId);
    setAnexosDialog(true);
  };

  const atualizarStatus = trpc.agente.atualizarStatusPeticao.useMutation({
    onSuccess: () => {
      refetchPeticoes();
      toast.success("Status atualizado!");
    },
  });

  // Filtered petições
  const peticoesFiltradas = useMemo(() => {
    if (!peticoes) return [];
    if (!busca) return peticoes;
    const lower = busca.toLowerCase();
    return peticoes.filter((p: any) =>
      p.titulo?.toLowerCase().includes(lower) ||
      p.tipo?.toLowerCase().includes(lower) ||
      p.status?.toLowerCase().includes(lower)
    );
  }, [peticoes, busca]);

  // Handlers
  const handleGerar = () => {
    if (!tipoPeticao) {
      toast.error("Selecione o tipo de petição");
      return;
    }
    setGerando(true);
    gerarPeticao.mutate({
      tipoPeticao,
      templateId,
      clienteId,
      processoId,
      instrucoes: instrucoes || undefined,
    });
  };

  const forceDownload = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      if (blob.size === 0) throw new Error('Arquivo vazio');
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      toast.success(`Download concluído: ${filename}`);
    } catch (err) {
      console.error('Erro no download:', err);
      toast.error('Erro no download. Tentando método alternativo...');
      window.open(url, '_blank');
    }
  };

  const handleDownloadDocx = (pet: any) => {
    // Usar rota proxy do servidor para evitar problemas de CORS
    if (pet.id) {
      const proxyUrl = `/api/v1/download-docx/${pet.id}`;
      const filename = `${pet.titulo || 'peticao'}.docx`.replace(/[^a-zA-Z0-9À-ÿ\s._-]/g, '_');
      forceDownload(proxyUrl, filename);
    } else {
      regenerarDocx.mutate({ id: pet.id });
    }
  };

  const handlePreview = (pet: any) => {
    setPreviewConteudo(pet.conteudoTexto || '');
    setPreviewTitulo(pet.titulo || '');
    setPreviewDialog(true);
  };

  const handleEdit = (pet: any) => {
    setEditId(pet.id);
    setEditConteudo(pet.conteudoTexto || '');
    setEditTitulo(pet.titulo || '');
    setEditDialog(true);
  };

  const resetWizard = () => {
    setStep(1);
    setTipoPeticao("");
    setClienteId(undefined);
    setProcessoId(undefined);
    setTemplateId(undefined);
    setInstrucoes("");
    setPeticaoGerada(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-6 w-6 text-amber-600" />
            Peticionamento
          </h1>
          <p className="text-muted-foreground mt-1">
            Gere, edite, exporte e gerencie petições com timbrado oficial do escritório
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="text-sm">
            {peticoes?.length || 0} petições
          </Badge>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="gerar" className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> Gerar Nova Petição
          </TabsTrigger>
          <TabsTrigger value="historico" className="flex items-center gap-2">
            <FileText className="h-4 w-4" /> Histórico de Petições
          </TabsTrigger>
        </TabsList>

        {/* ==================== ABA GERAR ==================== */}
        <TabsContent value="gerar" className="space-y-4 mt-4">
          {/* Progress Steps */}
          <div className="flex items-center justify-center gap-2 mb-6">
            {[
              { n: 1, label: "Tipo" },
              { n: 2, label: "Cliente" },
              { n: 3, label: "Processo" },
              { n: 4, label: "Instruções" },
              { n: 5, label: "Resultado" },
            ].map((s, idx) => (
              <div key={s.n} className="flex items-center gap-2">
                <button
                  onClick={() => s.n < step && setStep(s.n)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    step === s.n
                      ? "bg-amber-600 text-white"
                      : step > s.n
                      ? "bg-green-100 text-green-800 cursor-pointer hover:bg-green-200"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {step > s.n ? <CheckCircle className="h-3.5 w-3.5" /> : null}
                  {s.n}. {s.label}
                </button>
                {idx < 4 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </div>
            ))}
          </div>

          {/* Step 1: Tipo de Petição */}
          {step === 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Selecione o Tipo de Petição</CardTitle>
                <CardDescription>Escolha o tipo de peça processual a ser gerada</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {tipos?.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => { setTipoPeticao(t.nome); setStep(2); }}
                      className={`p-4 rounded-lg border text-left transition-all hover:shadow-md ${
                        tipoPeticao === t.nome
                          ? "border-amber-500 bg-amber-50 dark:bg-amber-950"
                          : "border-border hover:border-amber-300"
                      }`}
                    >
                      <div className="font-medium text-sm">{t.nome}</div>
                      <div className="text-xs text-muted-foreground mt-1">{t.descricao}</div>
                    </button>
                  ))}
                </div>
                {templates && templates.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-sm font-medium mb-2">Templates Especializados (opcional)</h3>
                    <Select
                      value={templateId?.toString() || "none"}
                      onValueChange={(v) => setTemplateId(v === "none" ? undefined : Number(v))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Usar template base..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem template específico</SelectItem>
                        {templates.map((t) => (
                          <SelectItem key={t.id} value={t.id.toString()}>
                            {t.nome} — {t.tipo}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Step 2: Cliente */}
          {step === 2 && (
            <Card>
              <CardHeader>
                <CardTitle>Selecione o Cliente</CardTitle>
                <CardDescription>Vincule a petição a um cliente cadastrado (opcional)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[400px] overflow-y-auto">
                  <button
                    onClick={() => { setClienteId(undefined); setProcessoId(undefined); setStep(4); }}
                    className="p-4 rounded-lg border border-dashed border-muted-foreground/30 text-left hover:bg-muted transition-colors"
                  >
                    <div className="font-medium text-sm text-muted-foreground">Sem cliente vinculado</div>
                    <div className="text-xs text-muted-foreground mt-1">Gerar petição avulsa</div>
                  </button>
                  {clientes?.map((c: any) => (
                    <button
                      key={c.id}
                      onClick={() => { setClienteId(c.id); setStep(3); }}
                      className={`p-4 rounded-lg border text-left transition-all hover:shadow-md ${
                        clienteId === c.id
                          ? "border-amber-500 bg-amber-50 dark:bg-amber-950"
                          : "border-border hover:border-amber-300"
                      }`}
                    >
                      <div className="font-medium text-sm">{c.nomeCompleto}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {c.cpfCnpj || c.rg || "Sem documento"}
                      </div>
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(1)}>Voltar</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Processo */}
          {step === 3 && (
            <Card>
              <CardHeader>
                <CardTitle>Selecione o Processo</CardTitle>
                <CardDescription>Vincule a petição a um processo do cliente (opcional)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto">
                  <button
                    onClick={() => { setProcessoId(undefined); setStep(4); }}
                    className="p-4 rounded-lg border border-dashed border-muted-foreground/30 text-left hover:bg-muted transition-colors"
                  >
                    <div className="font-medium text-sm text-muted-foreground">Sem processo vinculado</div>
                    <div className="text-xs text-muted-foreground mt-1">Gerar petição sem processo específico</div>
                  </button>
                  {processos?.map((p: any) => (
                    <button
                      key={p.id}
                      onClick={() => { setProcessoId(p.id); setStep(4); }}
                      className={`p-4 rounded-lg border text-left transition-all hover:shadow-md ${
                        processoId === p.id
                          ? "border-amber-500 bg-amber-50 dark:bg-amber-950"
                          : "border-border hover:border-amber-300"
                      }`}
                    >
                      <div className="font-medium text-sm">{p.numeroCnj || `Processo #${p.id}`}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {p.tipoAcao || "Tipo não definido"} • {p.status || "Em andamento"}
                      </div>
                      {p.vara && (
                        <div className="text-xs text-muted-foreground">{p.vara}</div>
                      )}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(2)}>Voltar</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 4: Instruções e Gerar */}
          {step === 4 && (
            <Card>
              <CardHeader>
                <CardTitle>Instruções para Geração</CardTitle>
                <CardDescription>
                  Adicione instruções específicas ou deixe em branco para usar o padrão do escritório
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
                  <div>
                    <span className="text-xs text-muted-foreground">Tipo</span>
                    <p className="font-medium text-sm">{tipoPeticao || "Não selecionado"}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Cliente</span>
                    <p className="font-medium text-sm">
                      {clienteId
                        ? clientes?.find((c: any) => c.id === clienteId)?.nomeCompleto || `ID ${clienteId}`
                        : "Avulsa"}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Processo</span>
                    <p className="font-medium text-sm">
                      {processoId
                        ? processos?.find((p: any) => p.id === processoId)?.numeroCnj || `ID ${processoId}`
                        : "Nenhum"}
                    </p>
                  </div>
                </div>

                <Textarea
                  placeholder="Instruções adicionais para a IA (ex: focar na tese de prescrição, incluir jurisprudência do STJ sobre consignado, mencionar art. 6º do CDC...)"
                  value={instrucoes}
                  onChange={(e) => setInstrucoes(e.target.value)}
                  rows={5}
                  className="resize-none"
                />

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(clienteId ? 3 : 2)}>Voltar</Button>
                  <Button
                    onClick={handleGerar}
                    disabled={gerando || !tipoPeticao}
                    className="bg-amber-600 hover:bg-amber-700 text-white flex-1"
                  >
                    {gerando ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Gerando petição com IA...
                      </>
                    ) : (
                      <>
                        <FileText className="h-4 w-4 mr-2" />
                        Gerar Petição com Timbrado
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 5: Resultado */}
          {step === 5 && peticaoGerada && (
            <div className="space-y-4">
              <Card className="border-green-200 bg-green-50/50 dark:bg-green-950/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-green-800 dark:text-green-200">
                    <CheckCircle className="h-5 w-5" />
                    Petição Gerada com Sucesso!
                  </CardTitle>
                  <CardDescription>
                    {peticaoGerada.tipoPeticao} — {peticaoGerada.cliente}
                    {peticaoGerada.processo && ` • ${peticaoGerada.processo}`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {peticaoGerada.docxUrl && (
                      <Button
                        onClick={() => {
                          const filename = `${peticaoGerada.tipoPeticao || 'peticao'}_${peticaoGerada.cliente || ''}.docx`.replace(/[^a-zA-Z0-9À-ÿ\s._-]/g, '_');
                          // Se temos o ID da petição, usar proxy do servidor
                          if (peticaoGerada.id) {
                            forceDownload(`/api/v1/download-docx/${peticaoGerada.id}`, filename);
                          } else {
                            forceDownload(peticaoGerada.docxUrl, filename);
                          }
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Baixar DOCX com Timbrado
                      </Button>
                    )}
                    {peticaoGerada.url && (
                      <Button variant="outline" onClick={() => window.open(peticaoGerada.url, '_blank')}>
                        <FileText className="h-4 w-4 mr-2" />
                        Ver Texto Original
                      </Button>
                    )}
                    <Button variant="outline" onClick={() => {
                      setPreviewConteudo(peticaoGerada.peticao);
                      setPreviewTitulo(peticaoGerada.tipoPeticao);
                      setPreviewDialog(true);
                    }}>
                      <Eye className="h-4 w-4 mr-2" />
                      Visualizar
                    </Button>
                    <Button variant="outline" onClick={resetWizard}>
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Nova Petição
                    </Button>
                  </div>

                  {/* Preview inline */}
                  <div className="max-h-[500px] overflow-y-auto border rounded-lg p-6 bg-white dark:bg-background">
                    <pre className="whitespace-pre-wrap font-serif text-sm leading-relaxed">
                      {peticaoGerada.peticao}
                    </pre>
                  </div>
                </CardContent>
              </Card>

              {/* Refinamento Iterativo */}
              {peticaoGerada.id && <RefinamentoPanel peticaoId={peticaoGerada.id} onRefined={(data: any) => {
                setPeticaoGerada((prev: any) => ({
                  ...prev,
                  peticao: data.conteudoRefinado,
                  docxUrl: data.docxUrl,
                }));
              }} />}
            </div>
          )}
        </TabsContent>

        {/* ==================== ABA HISTÓRICO ==================== */}
        <TabsContent value="historico" className="space-y-4 mt-4">
          {/* Search */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por título, tipo ou status..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button variant="outline" onClick={() => refetchPeticoes()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {/* Petições List */}
          {peticoesFiltradas.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Nenhuma petição encontrada</p>
                <Button className="mt-4" onClick={() => setTab("gerar")}>
                  <Plus className="h-4 w-4 mr-2" /> Gerar primeira petição
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {peticoesFiltradas.map((pet: any) => {
                const statusCfg = STATUS_CONFIG[pet.status] || STATUS_CONFIG.rascunho;
                const StatusIcon = statusCfg.icon;
                let docxUrl = '';
                try {
                  const json = typeof pet.conteudoJson === 'string' ? JSON.parse(pet.conteudoJson) : pet.conteudoJson;
                  docxUrl = json?.docxUrl || '';
                } catch {}

                return (
                  <Card key={pet.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-medium text-sm truncate">{pet.titulo}</h3>
                            <Badge className={`${statusCfg.color} text-xs shrink-0`}>
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {statusCfg.label}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span>{pet.tipo}</span>
                            <span>•</span>
                            <span>{new Date(pet.createdAt).toLocaleDateString('pt-BR')}</span>
                            {pet.geradoPor && (
                              <>
                                <span>•</span>
                                <span>Por: {pet.geradoPor}</span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {/* Download DOCX */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownloadDocx(pet)}
                            disabled={regenerarDocx.isPending}
                            title="Baixar DOCX com timbrado"
                          >
                            {regenerarDocx.isPending ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Download className="h-3.5 w-3.5" />
                            )}
                          </Button>
                          {/* Preview */}
                          <Button variant="outline" size="sm" onClick={() => handlePreview(pet)} title="Visualizar">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {/* Editar */}
                          <Button variant="outline" size="sm" onClick={() => handleEdit(pet)} title="Editar">
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          {/* Duplicar */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => duplicarPeticao.mutate({ id: pet.id })}
                            title="Duplicar"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          {/* Status */}
                          <Select
                            value={pet.status}
                            onValueChange={(v) => atualizarStatus.mutate({ id: pet.id, status: v as any })}
                          >
                            <SelectTrigger className="w-[120px] h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="rascunho">Rascunho</SelectItem>
                              <SelectItem value="revisado">Revisado</SelectItem>
                              <SelectItem value="aprovado">Aprovado</SelectItem>
                              <SelectItem value="protocolado">Protocolado</SelectItem>
                              <SelectItem value="arquivado">Arquivado</SelectItem>
                            </SelectContent>
                          </Select>
                          {/* Anexos */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openAnexos(pet.id)}
                            title="Anexos"
                          >
                            <Paperclip className="h-3.5 w-3.5" />
                          </Button>
                          {/* Excluir */}
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => { setDeleteId(pet.id); setDeleteDialog(true); }}
                            title="Excluir"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ==================== DIALOGS ==================== */}
      {/* Preview Dialog */}
      <Dialog open={previewDialog} onOpenChange={setPreviewDialog}>
        <DialogContent className="max-w-4xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>{previewTitulo}</DialogTitle>
            <DialogDescription>Visualização da petição</DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[65vh] border rounded-lg p-6 bg-white dark:bg-background">
            <pre className="whitespace-pre-wrap font-serif text-sm leading-relaxed">
              {previewConteudo}
            </pre>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewDialog(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent className="max-w-4xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>Editar Petição</DialogTitle>
            <DialogDescription>Edite o conteúdo e regenere o DOCX com timbrado</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={editTitulo}
              onChange={(e) => setEditTitulo(e.target.value)}
              placeholder="Título da petição"
            />
            <Textarea
              value={editConteudo}
              onChange={(e) => setEditConteudo(e.target.value)}
              rows={20}
              className="font-mono text-sm resize-none"
              placeholder="Conteúdo da petição..."
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditDialog(false)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (editId) {
                  editarPeticao.mutate({
                    id: editId,
                    conteudoTexto: editConteudo,
                    titulo: editTitulo,
                  });
                }
              }}
              disabled={editarPeticao.isPending}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {editarPeticao.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar Alterações
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (editId) {
                  editarPeticao.mutate({
                    id: editId,
                    conteudoTexto: editConteudo,
                    titulo: editTitulo,
                  }, {
                    onSuccess: () => {
                      regenerarDocx.mutate({ id: editId! });
                    }
                  });
                }
              }}
              disabled={editarPeticao.isPending || regenerarDocx.isPending}
            >
              <Download className="h-4 w-4 mr-2" />
              Salvar e Gerar DOCX
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Anexos Dialog */}
      <Dialog open={anexosDialog} onOpenChange={setAnexosDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Paperclip className="h-5 w-5" />
              Anexos da Petição
            </DialogTitle>
            <DialogDescription>Gerencie documentos anexados a esta petição (procuração, contracheque, contratos, etc.)</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Upload */}
            <div className="flex items-center gap-2">
              <label className="flex-1">
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xls,.xlsx"
                  onChange={handleUploadAnexo}
                  disabled={uploadingAnexo}
                />
                <div className="flex items-center justify-center gap-2 border-2 border-dashed rounded-lg p-4 cursor-pointer hover:border-amber-500 hover:bg-amber-50/50 transition-colors">
                  {uploadingAnexo ? (
                    <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
                  ) : (
                    <Upload className="h-5 w-5 text-muted-foreground" />
                  )}
                  <span className="text-sm text-muted-foreground">
                    {uploadingAnexo ? 'Enviando...' : 'Clique para adicionar anexo (máx 10MB)'}
                  </span>
                </div>
              </label>
            </div>

            {/* Lista de anexos */}
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {(!anexos || anexos.length === 0) ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum anexo adicionado</p>
              ) : (
                anexos.map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-amber-600 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{a.nomeArquivo}</p>
                        <p className="text-xs text-muted-foreground">
                          {a.tipoArquivo} • {((a.tamanhoBytes || 0) / 1024).toFixed(0)} KB
                          • {new Date(a.createdAt).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(a.storageUrl, '_blank')}
                        title="Baixar"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => excluirAnexo.mutate({ id: a.id })}
                        title="Remover"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAnexosDialog(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir Petição</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir esta petição? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => deleteId && excluirPeticao.mutate({ id: deleteId })}
              disabled={excluirPeticao.isPending}
            >
              {excluirPeticao.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== COMPONENTE: REFINAMENTO ITERATIVO COM HISTÓRICO DE VERSÕES ====================
function RefinamentoPanel({ peticaoId, onRefined }: { peticaoId: number; onRefined: (data: any) => void }) {
  const [instrucoes, setInstrucoes] = useState("");
  const [abaAtiva, setAbaAtiva] = useState<'refinar' | 'versoes'>('refinar');
  const [versaoExpandida, setVersaoExpandida] = useState<number | null>(null);
  const [versaoComparando, setVersaoComparando] = useState<number | null>(null);

  // Buscar versões do banco
  const versoesQuery = trpc.agente.listarVersoes.useQuery({ peticaoId });
  const versoes = versoesQuery.data || [];

  const refinar = trpc.agente.refinarPeticao.useMutation({
    onSuccess: (data: any) => {
      toast.success(`Petição refinada! Versão ${data.versao} criada (${data.diff?.adicionados || 0} adições, ${data.diff?.removidos || 0} remoções)`);
      setInstrucoes("");
      versoesQuery.refetch();
      onRefined(data);
    },
    onError: (e) => toast.error(`Erro ao refinar: ${e.message}`),
  });

  const restaurar = trpc.agente.restaurarVersao.useMutation({
    onSuccess: (data: any) => {
      toast.success(`Versão ${data.versaoRestaurada} restaurada com sucesso!`);
      versoesQuery.refetch();
      onRefined({ conteudoRefinado: data.conteudo });
    },
    onError: (e) => toast.error(`Erro ao restaurar: ${e.message}`),
  });

  return (
    <Card className="border-amber-200 bg-amber-50/30 dark:bg-amber-950/10">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-amber-800 dark:text-amber-200 text-lg">
            <Edit className="h-5 w-5" />
            Refinamento Iterativo
          </CardTitle>
          <div className="flex gap-1 bg-amber-100 dark:bg-amber-900/30 rounded-lg p-0.5">
            <button
              onClick={() => setAbaAtiva('refinar')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                abaAtiva === 'refinar'
                  ? 'bg-white dark:bg-amber-800 text-amber-800 dark:text-amber-100 shadow-sm'
                  : 'text-amber-600 dark:text-amber-300 hover:text-amber-800'
              }`}
            >
              <RefreshCw className="h-3 w-3 inline mr-1" />Refinar
            </button>
            <button
              onClick={() => setAbaAtiva('versoes')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                abaAtiva === 'versoes'
                  ? 'bg-white dark:bg-amber-800 text-amber-800 dark:text-amber-100 shadow-sm'
                  : 'text-amber-600 dark:text-amber-300 hover:text-amber-800'
              }`}
            >
              <History className="h-3 w-3 inline mr-1" />Versões ({versoes.length})
            </button>
          </div>
        </div>
        <CardDescription>
          {abaAtiva === 'refinar'
            ? 'Instrua a IA sobre o que melhorar. Cada refinamento gera uma nova versão rastreável.'
            : 'Histórico completo de todas as versões com alterações detalhadas.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* ==================== ABA REFINAR ==================== */}
        {abaAtiva === 'refinar' && (
          <>
            {versoes.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-background rounded-lg px-3 py-2 border">
                <GitBranch className="h-3.5 w-3.5" />
                <span>Versão atual: <strong className="text-foreground">v{versoes[versoes.length - 1]?.versao || 1}</strong></span>
                <span className="mx-1">·</span>
                <span>{versoes.length} versão(ões) no histórico</span>
                {versoes.length > 1 && (
                  <>
                    <span className="mx-1">·</span>
                    <button onClick={() => setAbaAtiva('versoes')} className="text-amber-600 hover:underline font-medium">
                      Ver histórico
                    </button>
                  </>
                )}
              </div>
            )}
            <Textarea
              placeholder="Ex: Reforce a fundamentação sobre abusividade das consignações, adicione jurisprudência do STJ sobre margem consignável, melhore a conclusão pedindo tutela de urgência..."
              value={instrucoes}
              onChange={(e) => setInstrucoes(e.target.value)}
              rows={4}
              className="resize-none"
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {versoes.length > 1 ? `${versoes.length - 1} refinamento(s) realizado(s)` : 'Nenhum refinamento ainda'}
              </p>
              <Button
                onClick={() => refinar.mutate({ peticaoId, instrucoes })}
                disabled={refinar.isPending || instrucoes.length < 5}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {refinar.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Refinando...</>
                ) : (
                  <><RefreshCw className="h-4 w-4 mr-2" /> Refinar Petição</>
                )}
              </Button>
            </div>
          </>
        )}

        {/* ==================== ABA VERSÕES ==================== */}
        {abaAtiva === 'versoes' && (
          <div className="space-y-3">
            {versoesQuery.isLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando versões...
              </div>
            ) : versoes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <History className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Nenhuma versão registrada ainda.</p>
                <p className="text-xs">Refine a petição para criar o histórico de versões.</p>
              </div>
            ) : (
              <>
                {/* Timeline de versões */}
                <div className="relative">
                  {/* Linha vertical da timeline */}
                  <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-amber-200 dark:bg-amber-800" />
                  
                  {versoes.map((v: any, idx: number) => {
                    const isExpanded = versaoExpandida === v.id;
                    const isOriginal = v.versao === 1;
                    const isLatest = idx === versoes.length - 1;
                    const isRestauracao = v.diff?.restauracao;
                    const diff = v.diff || {};

                    return (
                      <div key={v.id} className="relative pl-10 pb-4">
                        {/* Marcador da timeline */}
                        <div className={`absolute left-2 w-5 h-5 rounded-full border-2 flex items-center justify-center text-[9px] font-bold ${
                          isLatest
                            ? 'bg-amber-500 border-amber-600 text-white'
                            : isOriginal
                            ? 'bg-blue-500 border-blue-600 text-white'
                            : isRestauracao
                            ? 'bg-purple-500 border-purple-600 text-white'
                            : 'bg-white dark:bg-gray-800 border-amber-300 text-amber-700'
                        }`}>
                          {v.versao}
                        </div>

                        {/* Card da versão */}
                        <div className={`border rounded-lg overflow-hidden transition-all ${
                          isLatest ? 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/20' : 'bg-background'
                        }`}>
                          {/* Header da versão */}
                          <button
                            onClick={() => setVersaoExpandida(isExpanded ? null : v.id)}
                            className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/30 transition-colors"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-semibold text-sm">v{v.versao}</span>
                              {isOriginal && <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-300 text-blue-600">Original</Badge>}
                              {isLatest && <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-400 text-amber-700">Atual</Badge>}
                              {isRestauracao && <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-purple-300 text-purple-600">Restauração</Badge>}
                              {!isOriginal && !isRestauracao && diff.adicionados !== undefined && (
                                <span className="text-[10px] text-muted-foreground">
                                  <span className="text-green-600">+{diff.adicionados}</span>
                                  <span className="mx-0.5">/</span>
                                  <span className="text-red-500">-{diff.removidos}</span>
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(v.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                              </span>
                              {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            </div>
                          </button>

                          {/* Conteúdo expandido */}
                          {isExpanded && (
                            <div className="border-t px-3 py-3 space-y-3">
                              {/* Instruções do refinamento */}
                              {v.instrucoes && (
                                <div className="bg-muted/40 rounded-md px-3 py-2">
                                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Instrução do advogado</p>
                                  <p className="text-sm">{v.instrucoes}</p>
                                </div>
                              )}

                              {/* Diff visual */}
                              {diff.detalhes && Array.isArray(diff.detalhes) && diff.detalhes.length > 0 && (
                                <div>
                                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Alterações nesta versão</p>
                                  <div className="border rounded-md overflow-hidden max-h-60 overflow-y-auto text-xs font-mono">
                                    {diff.detalhes.slice(0, 50).map((d: any, i: number) => (
                                      <div
                                        key={i}
                                        className={`px-3 py-1 border-b last:border-b-0 ${
                                          d.tipo === 'adicionado'
                                            ? 'bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-300'
                                            : d.tipo === 'removido'
                                            ? 'bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300 line-through'
                                            : 'text-muted-foreground'
                                        }`}
                                      >
                                        <span className="select-none mr-2 opacity-60">
                                          {d.tipo === 'adicionado' ? '+' : d.tipo === 'removido' ? '-' : ' '}
                                        </span>
                                        {d.texto.substring(0, 200)}{d.texto.length > 200 ? '...' : ''}
                                      </div>
                                    ))}
                                    {diff.detalhes.length > 50 && (
                                      <div className="px-3 py-1 text-center text-muted-foreground bg-muted/20">
                                        ... e mais {diff.detalhes.length - 50} linhas
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex gap-3 mt-1.5 text-[10px] text-muted-foreground">
                                    <span className="text-green-600">+{diff.adicionados} adicionadas</span>
                                    <span className="text-red-500">-{diff.removidos} removidas</span>
                                    <span>{diff.mantidos} mantidas</span>
                                  </div>
                                </div>
                              )}

                              {/* Preview do conteúdo */}
                              <div>
                                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Conteúdo da versão</p>
                                <div className="border rounded-md bg-muted/20 px-3 py-2 max-h-40 overflow-y-auto">
                                  <pre className="text-xs whitespace-pre-wrap font-sans">
                                    {v.conteudoTexto?.substring(0, 1000)}{(v.conteudoTexto?.length || 0) > 1000 ? '\n\n[... conteúdo completo disponível ao restaurar]' : ''}
                                  </pre>
                                </div>
                              </div>

                              {/* Ações */}
                              <div className="flex items-center gap-2 pt-1">
                                {!isLatest && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      if (confirm(`Restaurar versão ${v.versao}? O conteúdo atual será salvo como nova versão antes da restauração.`)) {
                                        restaurar.mutate({ peticaoId, versaoId: v.id });
                                      }
                                    }}
                                    disabled={restaurar.isPending}
                                    className="text-xs h-7"
                                  >
                                    {restaurar.isPending ? (
                                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                    ) : (
                                      <RotateCcw className="h-3 w-3 mr-1" />
                                    )}
                                    Restaurar v{v.versao}
                                  </Button>
                                )}
                                {v.docxUrl && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => window.open(v.docxUrl, '_blank')}
                                    className="text-xs h-7"
                                  >
                                    <Download className="h-3 w-3 mr-1" /> DOCX v{v.versao}
                                  </Button>
                                )}
                                {versoes.length > 1 && idx > 0 && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setVersaoComparando(versaoComparando === v.id ? null : v.id)}
                                    className="text-xs h-7"
                                  >
                                    <Eye className="h-3 w-3 mr-1" /> Comparar com v{versoes[idx - 1]?.versao}
                                  </Button>
                                )}
                              </div>

                              {/* Comparação lado a lado */}
                              {versaoComparando === v.id && idx > 0 && (
                                <div className="border-t pt-3">
                                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                                    Comparação: v{versoes[idx - 1]?.versao} → v{v.versao}
                                  </p>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="border rounded-md bg-red-50/30 dark:bg-red-950/10">
                                      <div className="px-2 py-1 border-b bg-red-100/50 dark:bg-red-900/20 text-[10px] font-medium text-red-700 dark:text-red-300">
                                        v{versoes[idx - 1]?.versao} (anterior)
                                      </div>
                                      <div className="px-2 py-1.5 max-h-32 overflow-y-auto">
                                        <pre className="text-[10px] whitespace-pre-wrap font-sans text-muted-foreground">
                                          {versoes[idx - 1]?.conteudoTexto?.substring(0, 500) || 'Sem conteúdo'}
                                        </pre>
                                      </div>
                                    </div>
                                    <div className="border rounded-md bg-green-50/30 dark:bg-green-950/10">
                                      <div className="px-2 py-1 border-b bg-green-100/50 dark:bg-green-900/20 text-[10px] font-medium text-green-700 dark:text-green-300">
                                        v{v.versao} (nova)
                                      </div>
                                      <div className="px-2 py-1.5 max-h-32 overflow-y-auto">
                                        <pre className="text-[10px] whitespace-pre-wrap font-sans text-muted-foreground">
                                          {v.conteudoTexto?.substring(0, 500) || 'Sem conteúdo'}
                                        </pre>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Resumo */}
                <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-3">
                  <span>{versoes.length} versão(ões) · Criada em {versoes[0] ? new Date(versoes[0].createdAt).toLocaleDateString('pt-BR') : '-'}</span>
                  <Button size="sm" variant="ghost" onClick={() => versoesQuery.refetch()} className="h-7 text-xs">
                    <RefreshCw className="h-3 w-3 mr-1" /> Atualizar
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
