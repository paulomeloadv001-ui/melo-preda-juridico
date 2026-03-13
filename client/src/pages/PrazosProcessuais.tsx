import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Calendar, Clock, AlertTriangle, CheckCircle2, XCircle, Plus,
  ChevronLeft, ChevronRight, Filter, RefreshCw, Bell, Loader2, Trash2, Edit
} from "lucide-react";
import { toast } from "sonner";

const TIPOS_PRAZO = [
  { value: "recurso", label: "Recurso" },
  { value: "contestacao", label: "Contestação" },
  { value: "manifestacao", label: "Manifestação" },
  { value: "cumprimento", label: "Cumprimento" },
  { value: "audiencia", label: "Audiência" },
  { value: "pericia", label: "Perícia" },
  { value: "diligencia", label: "Diligência" },
  { value: "pagamento", label: "Pagamento" },
  { value: "levantamento", label: "Levantamento" },
  { value: "outro", label: "Outro" },
] as const;

const STATUS_COLORS: Record<string, string> = {
  pendente: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700",
  cumprido: "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700",
  vencido: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700",
  cancelado: "bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600",
};

const STATUS_ICONS: Record<string, any> = {
  pendente: Clock,
  cumprido: CheckCircle2,
  vencido: AlertTriangle,
  cancelado: XCircle,
};

function getDiasRestantes(dataVencimento: string | Date): number {
  const venc = new Date(dataVencimento);
  const agora = new Date();
  return Math.ceil((venc.getTime() - agora.getTime()) / (1000 * 60 * 60 * 24));
}

function getDiasLabel(dias: number): string {
  if (dias < 0) return `Vencido há ${Math.abs(dias)} dia(s)`;
  if (dias === 0) return "Vence HOJE";
  if (dias === 1) return "Vence AMANHÃ";
  return `${dias} dia(s) restantes`;
}

export default function PrazosProcessuais() {
  const [mesAtual, setMesAtual] = useState(() => new Date());
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [showCriarDialog, setShowCriarDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [prazoEditando, setPrazoEditando] = useState<any>(null);
  const [novoTitulo, setNovoTitulo] = useState("");
  const [novoTipo, setNovoTipo] = useState<string>("recurso");
  const [novaData, setNovaData] = useState("");
  const [novaDescricao, setNovaDescricao] = useState("");
  const [novasObservacoes, setNovasObservacoes] = useState("");
  const [novoDiasAntecedencia, setNovoDiasAntecedencia] = useState(3);
  const [clienteSelecionado, setClienteSelecionado] = useState<number | undefined>();
  const [processoSelecionado, setProcessoSelecionado] = useState<number | undefined>();

  const prazosQuery = trpc.prazos.listar.useQuery({});
  const clientesQuery = trpc.clientes.list.useQuery({});
  const criarMutation = trpc.prazos.criar.useMutation({
    onSuccess: () => {
      prazosQuery.refetch();
      setShowCriarDialog(false);
      resetForm();
      toast.success("Prazo cadastrado com sucesso!");
    },
    onError: (e) => toast.error(e.message),
  });
  const atualizarMutation = trpc.prazos.atualizar.useMutation({
    onSuccess: () => {
      prazosQuery.refetch();
      setShowEditDialog(false);
      toast.success("Prazo atualizado!");
    },
    onError: (e) => toast.error(e.message),
  });
  const excluirMutation = trpc.prazos.excluir.useMutation({
    onSuccess: () => {
      prazosQuery.refetch();
      toast.success("Prazo excluído!");
    },
    onError: (e) => toast.error(e.message),
  });
  const verificarMutation = trpc.prazos.verificarVencimentos.useMutation({
    onSuccess: (data) => {
      prazosQuery.refetch();
      toast.success(`Verificação concluída: ${data.notificacoesEnviadas} notificações, ${data.prazosVencidos} vencidos de ${data.totalVerificados} verificados`);
    },
  });

  // Buscar processos do cliente selecionado
  const perfilCliente = trpc.clientes.getFullProfile.useQuery(
    { id: clienteSelecionado! },
    { enabled: !!clienteSelecionado }
  );
  const processosDoCliente = perfilCliente.data?.processos || [];

  const resetForm = () => {
    setNovoTitulo("");
    setNovoTipo("recurso");
    setNovaData("");
    setNovaDescricao("");
    setNovasObservacoes("");
    setNovoDiasAntecedencia(3);
    setClienteSelecionado(undefined);
    setProcessoSelecionado(undefined);
  };

  // Filtrar prazos
  const prazosFiltrados = useMemo(() => {
    if (!prazosQuery.data) return [];
    let filtered = [...prazosQuery.data];
    if (filtroStatus !== "todos") {
      filtered = filtered.filter((p: any) => p.status === filtroStatus);
    }
    if (filtroTipo !== "todos") {
      filtered = filtered.filter((p: any) => p.tipo === filtroTipo);
    }
    return filtered;
  }, [prazosQuery.data, filtroStatus, filtroTipo]);

  // Estatísticas
  const stats = useMemo(() => {
    const all = prazosQuery.data || [];
    return {
      total: all.length,
      pendentes: all.filter((p: any) => p.status === "pendente").length,
      cumpridos: all.filter((p: any) => p.status === "cumprido").length,
      vencidos: all.filter((p: any) => p.status === "vencido").length,
      urgentes: all.filter((p: any) => {
        if (p.status !== "pendente") return false;
        const dias = getDiasRestantes(p.dataVencimento);
        return dias <= 3 && dias >= 0;
      }).length,
    };
  }, [prazosQuery.data]);

  // Calendário
  const diasDoMes = useMemo(() => {
    const ano = mesAtual.getFullYear();
    const mes = mesAtual.getMonth();
    const primeiroDia = new Date(ano, mes, 1);
    const ultimoDia = new Date(ano, mes + 1, 0);
    const diasAntes = primeiroDia.getDay(); // 0=domingo
    const totalDias = ultimoDia.getDate();

    const dias: Array<{ date: Date | null; prazos: any[] }> = [];

    // Dias vazios antes
    for (let i = 0; i < diasAntes; i++) {
      dias.push({ date: null, prazos: [] });
    }

    // Dias do mês
    for (let d = 1; d <= totalDias; d++) {
      const date = new Date(ano, mes, d);
      const prazosNoDia = (prazosQuery.data || []).filter((p: any) => {
        const pDate = new Date(p.dataVencimento);
        return pDate.getFullYear() === ano && pDate.getMonth() === mes && pDate.getDate() === d;
      });
      dias.push({ date, prazos: prazosNoDia });
    }

    return dias;
  }, [mesAtual, prazosQuery.data]);

  const mesAnterior = () => setMesAtual(new Date(mesAtual.getFullYear(), mesAtual.getMonth() - 1, 1));
  const mesProximo = () => setMesAtual(new Date(mesAtual.getFullYear(), mesAtual.getMonth() + 1, 1));
  const mesNome = mesAtual.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
            <Calendar className="h-6 w-6 text-amber-700 dark:text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Prazos Processuais</h1>
            <p className="text-sm text-muted-foreground">Controle de prazos com calendário e alertas automáticos</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => verificarMutation.mutate()}
            disabled={verificarMutation.isPending}
          >
            {verificarMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Bell className="h-4 w-4 mr-1" />}
            Verificar Vencimentos
          </Button>
          <Button size="sm" className="bg-amber-600 hover:bg-amber-700" onClick={() => setShowCriarDialog(true)}>
            <Plus className="h-4 w-4 mr-1" />Novo Prazo
          </Button>
        </div>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 dark:border-amber-800">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-amber-600">{stats.pendentes}</p>
            <p className="text-xs text-muted-foreground">Pendentes</p>
          </CardContent>
        </Card>
        <Card className="border-red-200 dark:border-red-800">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-red-600">{stats.urgentes}</p>
            <p className="text-xs text-muted-foreground">Urgentes (3d)</p>
          </CardContent>
        </Card>
        <Card className="border-green-200 dark:border-green-800">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{stats.cumpridos}</p>
            <p className="text-xs text-muted-foreground">Cumpridos</p>
          </CardContent>
        </Card>
        <Card className="border-red-200 dark:border-red-800">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-red-600">{stats.vencidos}</p>
            <p className="text-xs text-muted-foreground">Vencidos</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendário */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg capitalize">{mesNome}</CardTitle>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={mesAnterior}><ChevronLeft className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => setMesAtual(new Date())}>Hoje</Button>
                  <Button variant="ghost" size="icon" onClick={mesProximo}><ChevronRight className="h-4 w-4" /></Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Cabeçalho dias da semana */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
                  <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
                ))}
              </div>
              {/* Dias */}
              <div className="grid grid-cols-7 gap-1">
                {diasDoMes.map((dia, i) => {
                  if (!dia.date) return <div key={i} className="h-20 rounded-lg bg-muted/30" />;
                  const isHoje = dia.date.toDateString() === new Date().toDateString();
                  const temUrgente = dia.prazos.some((p: any) => p.status === "pendente" && getDiasRestantes(p.dataVencimento) <= 1);
                  const temPendente = dia.prazos.some((p: any) => p.status === "pendente");
                  const temVencido = dia.prazos.some((p: any) => p.status === "vencido");

                  return (
                    <div
                      key={i}
                      className={`h-20 rounded-lg border p-1 text-xs overflow-hidden transition-colors ${
                        isHoje ? "border-amber-500 bg-amber-50 dark:bg-amber-950/20" : "border-border hover:bg-accent/50"
                      }`}
                    >
                      <div className={`font-medium mb-0.5 ${isHoje ? "text-amber-700 dark:text-amber-400" : ""}`}>
                        {dia.date.getDate()}
                      </div>
                      <div className="space-y-0.5">
                        {dia.prazos.slice(0, 3).map((p: any, j: number) => (
                          <div
                            key={j}
                            className={`truncate rounded px-1 py-0.5 text-[10px] cursor-pointer ${
                              p.status === "vencido" ? "bg-red-200 text-red-800 dark:bg-red-900/50 dark:text-red-300" :
                              p.status === "cumprido" ? "bg-green-200 text-green-800 dark:bg-green-900/50 dark:text-green-300" :
                              temUrgente ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                              "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                            }`}
                            onClick={() => { setPrazoEditando(p); setShowEditDialog(true); }}
                            title={p.titulo}
                          >
                            {p.titulo}
                          </div>
                        ))}
                        {dia.prazos.length > 3 && (
                          <div className="text-[10px] text-muted-foreground text-center">+{dia.prazos.length - 3}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Lista de Prazos */}
        <div className="space-y-4">
          {/* Filtros */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-amber-600" />
                <CardTitle className="text-sm">Filtros</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os status</SelectItem>
                  <SelectItem value="pendente">Pendentes</SelectItem>
                  <SelectItem value="cumprido">Cumpridos</SelectItem>
                  <SelectItem value="vencido">Vencidos</SelectItem>
                  <SelectItem value="cancelado">Cancelados</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os tipos</SelectItem>
                  {TIPOS_PRAZO.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Lista */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{prazosFiltrados.length} prazo(s)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                <div className="space-y-1 p-3">
                  {prazosFiltrados.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Nenhum prazo encontrado</p>
                    </div>
                  ) : (
                    prazosFiltrados.map((prazo: any) => {
                      const dias = getDiasRestantes(prazo.dataVencimento);
                      const StatusIcon = STATUS_ICONS[prazo.status] || Clock;
                      const isUrgente = prazo.status === "pendente" && dias <= 3 && dias >= 0;

                      return (
                        <div
                          key={prazo.id}
                          className={`p-3 rounded-lg border cursor-pointer hover:bg-accent/50 transition-colors ${
                            isUrgente ? "border-red-300 dark:border-red-700" : ""
                          }`}
                          onClick={() => { setPrazoEditando(prazo); setShowEditDialog(true); }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <StatusIcon className={`h-3.5 w-3.5 flex-shrink-0 ${
                                  prazo.status === "vencido" ? "text-red-600" :
                                  prazo.status === "cumprido" ? "text-green-600" :
                                  isUrgente ? "text-red-500" : "text-amber-600"
                                }`} />
                                <span className="text-sm font-medium truncate">{prazo.titulo}</span>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[prazo.status]}`}>
                                  {prazo.status}
                                </Badge>
                                <Badge variant="outline" className="text-[10px]">
                                  {TIPOS_PRAZO.find(t => t.value === prazo.tipo)?.label || prazo.tipo}
                                </Badge>
                              </div>
                              {prazo.nomeCliente && (
                                <p className="text-[11px] text-muted-foreground mt-1 truncate">{prazo.nomeCliente}</p>
                              )}
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-xs font-medium">
                                {new Date(prazo.dataVencimento).toLocaleDateString("pt-BR")}
                              </p>
                              <p className={`text-[10px] ${
                                dias < 0 ? "text-red-600 font-bold" :
                                dias <= 1 ? "text-red-500 font-bold" :
                                dias <= 3 ? "text-amber-600 font-medium" :
                                "text-muted-foreground"
                              }`}>
                                {prazo.status === "pendente" ? getDiasLabel(dias) : ""}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dialog Criar Prazo */}
      <Dialog open={showCriarDialog} onOpenChange={setShowCriarDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-amber-600" />Novo Prazo Processual
            </DialogTitle>
            <DialogDescription>Cadastre um novo prazo para acompanhamento</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Título do Prazo</Label>
              <Input value={novoTitulo} onChange={(e) => setNovoTitulo(e.target.value)} placeholder="Ex: Contrarrazões de Apelação" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Tipo</Label>
                <Select value={novoTipo} onValueChange={setNovoTipo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPOS_PRAZO.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Data de Vencimento</Label>
                <Input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Cliente</Label>
                <Select
                  value={clienteSelecionado?.toString() || "none"}
                  onValueChange={(v) => { setClienteSelecionado(v === "none" ? undefined : Number(v)); setProcessoSelecionado(undefined); }}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Selecione o cliente</SelectItem>
                    {clientesQuery.data?.map((c: any) => (
                      <SelectItem key={c.id} value={c.id.toString()}>{c.nomeCompleto}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Processo</Label>
                <Select
                  value={processoSelecionado?.toString() || "none"}
                  onValueChange={(v) => setProcessoSelecionado(v === "none" ? undefined : Number(v))}
                  disabled={!clienteSelecionado}
                >
                  <SelectTrigger><SelectValue placeholder={clienteSelecionado ? "Selecione" : "Selecione cliente primeiro"} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Selecione o processo</SelectItem>
                    {processosDoCliente.map((p: any) => (
                      <SelectItem key={p.id} value={p.id.toString()}>{p.numeroCnj} — {p.tipoAcao?.substring(0, 30)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Dias de antecedência para alerta</Label>
              <Input type="number" min={1} max={30} value={novoDiasAntecedencia} onChange={(e) => setNovoDiasAntecedencia(Number(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs">Descrição</Label>
              <Textarea value={novaDescricao} onChange={(e) => setNovaDescricao(e.target.value)} placeholder="Detalhes do prazo..." className="min-h-[60px]" />
            </div>
            <div>
              <Label className="text-xs">Observações</Label>
              <Textarea value={novasObservacoes} onChange={(e) => setNovasObservacoes(e.target.value)} placeholder="Observações adicionais..." className="min-h-[60px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCriarDialog(false); resetForm(); }}>Cancelar</Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700"
              disabled={!novoTitulo || !novaData || !clienteSelecionado || !processoSelecionado || criarMutation.isPending}
              onClick={() => {
                criarMutation.mutate({
                  titulo: novoTitulo,
                  tipo: novoTipo as any,
                  dataVencimento: novaData,
                  processoId: processoSelecionado!,
                  clienteId: clienteSelecionado!,
                  diasAntecedencia: novoDiasAntecedencia,
                  descricao: novaDescricao || undefined,
                  observacoes: novasObservacoes || undefined,
                });
              }}
            >
              {criarMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
              Cadastrar Prazo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Editar/Visualizar Prazo */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5 text-amber-600" />Detalhes do Prazo
            </DialogTitle>
            <DialogDescription>{prazoEditando?.titulo}</DialogDescription>
          </DialogHeader>
          {prazoEditando && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Tipo</Label>
                  <p className="text-sm font-medium">{TIPOS_PRAZO.find(t => t.value === prazoEditando.tipo)?.label}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Vencimento</Label>
                  <p className="text-sm font-medium">{new Date(prazoEditando.dataVencimento).toLocaleDateString("pt-BR")}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <Badge className={STATUS_COLORS[prazoEditando.status]}>{prazoEditando.status}</Badge>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Situação</Label>
                  <p className={`text-sm font-medium ${getDiasRestantes(prazoEditando.dataVencimento) <= 1 ? "text-red-600" : ""}`}>
                    {getDiasLabel(getDiasRestantes(prazoEditando.dataVencimento))}
                  </p>
                </div>
              </div>
              {prazoEditando.nomeCliente && (
                <div>
                  <Label className="text-xs text-muted-foreground">Cliente</Label>
                  <p className="text-sm">{prazoEditando.nomeCliente}</p>
                </div>
              )}
              {prazoEditando.numeroCnj && (
                <div>
                  <Label className="text-xs text-muted-foreground">Processo</Label>
                  <p className="text-sm font-mono">{prazoEditando.numeroCnj}</p>
                </div>
              )}
              {prazoEditando.descricao && (
                <div>
                  <Label className="text-xs text-muted-foreground">Descrição</Label>
                  <p className="text-sm">{prazoEditando.descricao}</p>
                </div>
              )}
              {prazoEditando.observacoes && (
                <div>
                  <Label className="text-xs text-muted-foreground">Observações</Label>
                  <p className="text-sm">{prazoEditando.observacoes}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (prazoEditando) {
                  excluirMutation.mutate({ id: prazoEditando.id });
                  setShowEditDialog(false);
                }
              }}
            >
              <Trash2 className="h-4 w-4 mr-1" />Excluir
            </Button>
            {prazoEditando?.status === "pendente" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    atualizarMutation.mutate({ id: prazoEditando.id, status: "cancelado" });
                  }}
                >
                  <XCircle className="h-4 w-4 mr-1" />Cancelar Prazo
                </Button>
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => {
                    atualizarMutation.mutate({ id: prazoEditando.id, status: "cumprido" });
                  }}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" />Marcar Cumprido
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
