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
  ChevronRight, Loader2, Eye, RotateCcw
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
