import { useState, useRef, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Send, Bot, User, Scale, BookOpen, Gavel, FileText, Search, Sparkles, Brain, RefreshCw, Trash2, Download, FilePlus, Copy, Check, MessageSquare, Zap, Target, Calculator, ClipboardList, ChevronRight, History, AlertTriangle, Shield, Wrench, CheckCircle2, XCircle, Activity, Database, Users, GitMerge, Eraser, Globe, BarChart3 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Streamdown } from "streamdown";

type ToolAction = {
  tool: string;
  args: any;
  resultado: string;
  sucesso: boolean;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  acoesExecutadas?: ToolAction[];
  totalTools?: number;
};

type ModoChat = "chat" | "analise" | "peticao" | "estrategia" | "calculo";

// Tool name to display info mapping
const TOOL_INFO: Record<string, { label: string; icon: any; color: string }> = {
  buscar_cliente: { label: "Buscar Cliente", icon: Users, color: "text-blue-600" },
  buscar_processo: { label: "Buscar Processo", icon: FileText, color: "text-purple-600" },
  diagnosticar_banco: { label: "Diagnosticar Banco", icon: Database, color: "text-orange-600" },
  listar_duplicados: { label: "Listar Duplicados", icon: Activity, color: "text-red-600" },
  merge_clientes: { label: "Merge Clientes", icon: GitMerge, color: "text-green-600" },
  remover_registro: { label: "Remover Registro", icon: Eraser, color: "text-red-600" },
  completar_movimentacoes: { label: "Completar Movimentações", icon: Globe, color: "text-cyan-600" },
  analisar_processo_tecnico: { label: "Análise Técnica", icon: Target, color: "text-purple-600" },
  gerar_peticao: { label: "Gerar Petição", icon: FileText, color: "text-amber-600" },
  atualizar_dados_cliente: { label: "Atualizar Cliente", icon: Users, color: "text-blue-600" },
  atualizar_dados_processo: { label: "Atualizar Processo", icon: Gavel, color: "text-purple-600" },
  consultar_estatisticas: { label: "Estatísticas", icon: BarChart3, color: "text-green-600" },
};

function ToolActionsPanel({ acoes }: { acoes: ToolAction[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!acoes || acoes.length === 0) return null;

  return (
    <div className="mt-2 border border-amber-200 dark:border-amber-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Wrench className="h-3.5 w-3.5 text-amber-600" />
          <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
            {acoes.length} ação(es) executada(s)
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {acoes.map((a, i) => {
            const info = TOOL_INFO[a.tool];
            const Icon = info?.icon || Wrench;
            return (
              <span key={i} title={`${info?.label || a.tool}: ${a.sucesso ? 'Sucesso' : 'Erro'}`}>
                {a.sucesso ? (
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                ) : (
                  <XCircle className="h-3 w-3 text-red-500" />
                )}
              </span>
            );
          })}
          <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </div>
      </button>
      {expanded && (
        <div className="px-3 py-2 space-y-1.5 bg-background">
          {acoes.map((acao, i) => {
            const info = TOOL_INFO[acao.tool];
            const Icon = info?.icon || Wrench;
            let resumoResultado = '';
            try {
              const parsed = JSON.parse(acao.resultado);
              if (parsed.erro) resumoResultado = `Erro: ${parsed.erro}`;
              else if (parsed.sucesso) resumoResultado = parsed.mensagem || parsed.resultado || 'Sucesso';
              else if (parsed.encontrados !== undefined) resumoResultado = `${parsed.encontrados} resultado(s)`;
              else resumoResultado = Object.keys(parsed).slice(0, 3).join(', ');
            } catch {
              resumoResultado = acao.resultado.substring(0, 100);
            }
            return (
              <div key={i} className="flex items-start gap-2 text-xs">
                <div className={`flex-shrink-0 mt-0.5 ${info?.color || 'text-muted-foreground'}`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">{info?.label || acao.tool}</span>
                    {acao.sucesso ? (
                      <Badge variant="outline" className="h-4 text-[9px] px-1 border-green-300 text-green-600">OK</Badge>
                    ) : (
                      <Badge variant="outline" className="h-4 text-[9px] px-1 border-red-300 text-red-600">ERRO</Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground truncate">{resumoResultado}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const modos: { id: ModoChat; label: string; icon: any; desc: string; color: string }[] = [
  { id: "chat", label: "Consulta", icon: MessageSquare, desc: "Consulta jurídica geral", color: "text-blue-600" },
  { id: "analise", label: "Análise", icon: Target, desc: "Análise técnica aprofundada", color: "text-purple-600" },
  { id: "peticao", label: "Petição", icon: FileText, desc: "Gerar petição completa", color: "text-amber-600" },
  { id: "estrategia", label: "Estratégia", icon: Shield, desc: "Estratégia processual", color: "text-green-600" },
  { id: "calculo", label: "Cálculo", icon: Calculator, desc: "Cálculos judiciais", color: "text-red-600" },
];

export default function AgenteJuridico() {
  // Ler clienteId da URL query param (vindo do perfil do cliente)
  const urlParams = new URLSearchParams(window.location.search);
  const initialClienteId = urlParams.get('clienteId') ? Number(urlParams.get('clienteId')) : undefined;

  const [mensagem, setMensagem] = useState("");
  const [historico, setHistorico] = useState<ChatMessage[]>([]);
  const [clienteId, setClienteId] = useState<number | undefined>(initialClienteId);
  const [processoId, setProcessoId] = useState<number | undefined>();
  const [modo, setModo] = useState<ModoChat>("chat");
  const [sessaoId, setSessaoId] = useState<string>(`sessao_${Date.now()}`);
  const [termoBusca, setTermoBusca] = useState("");
  const [categoriaBusca, setCategoriaBusca] = useState<string>("");
  const [activeTab, setActiveTab] = useState("chat");
  const scrollRef = useRef<HTMLDivElement>(null);

  const chatMutation = trpc.agente.chat.useMutation();
  const gerarPeticaoMutation = trpc.agente.gerarPeticao.useMutation();
  const analisarProcessoMutation = trpc.agente.analisarProcesso.useMutation();
  const [showPeticaoDialog, setShowPeticaoDialog] = useState(false);
  const [tipoPeticao, setTipoPeticao] = useState("");
  const [instrucoesPeticao, setInstrucoesPeticao] = useState("");
  const [peticaoGerada, setPeticaoGerada] = useState<{peticao: string; url: string; docxUrl?: string; tipoPeticao: string; cliente: string; processo: string} | null>(null);
  const exportarDocxMutation = trpc.agente.exportarDocx.useMutation();
  const [copied, setCopied] = useState(false);
  const [showAnaliseDialog, setShowAnaliseDialog] = useState(false);
  const [analiseResult, setAnaliseResult] = useState<{analise: string; processo: string; tipo: string} | null>(null);
  const [focoAnalise, setFocoAnalise] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | undefined>();

  const estatisticas = trpc.agente.estatisticas.useQuery();
  const templates = trpc.agente.listarTemplates.useQuery();
  const peticoesRecentes = trpc.agente.listarPeticoes.useQuery({ limit: 10 });
  const busca = trpc.agente.buscarConhecimento.useQuery(
    { termo: termoBusca, categoria: categoriaBusca && categoriaBusca !== "todas" ? categoriaBusca as any : undefined },
    { enabled: termoBusca.length >= 2 }
  );

  const clientesQuery = trpc.clientes.list.useQuery({});
  const [processosDoCliente, setProcessosDoCliente] = useState<any[]>([]);

  const perfilCliente = trpc.clientes.getFullProfile.useQuery(
    { id: clienteId! },
    { enabled: !!clienteId }
  );

  useEffect(() => {
    if (clienteId && perfilCliente.data?.processos) {
      setProcessosDoCliente(perfilCliente.data.processos);
    } else {
      setProcessosDoCliente([]);
      setProcessoId(undefined);
    }
  }, [clienteId, perfilCliente.data]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [historico, chatMutation.isPending]);

  const enviarMensagem = async () => {
    if (!mensagem.trim() || chatMutation.isPending) return;

    const novaMensagem: ChatMessage = { role: "user", content: mensagem };
    const novoHistorico = [...historico, novaMensagem];
    setHistorico(novoHistorico);
    setMensagem("");

    try {
      const result = await chatMutation.mutateAsync({
        mensagem: mensagem,
        historico: historico.map(h => ({ role: h.role, content: h.content })),
        clienteId,
        processoId,
        modo,
        sessaoId,
      });
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: result.resposta,
        acoesExecutadas: (result as any).acoesExecutadas || [],
        totalTools: (result as any).totalTools || 0,
      };
      setHistorico([...novoHistorico, assistantMsg]);
      if (result.sessaoId) setSessaoId(result.sessaoId);
      if ((result as any).totalTools > 0) {
        toast.success(`Agente executou ${(result as any).totalTools} ações no sistema`);
      }
    } catch (error: any) {
      setHistorico([
        ...novoHistorico,
        { role: "assistant", content: `Erro ao processar: ${error.message || "Tente novamente."}` },
      ]);
    }
  };

  const limparChat = () => {
    setHistorico([]);
    setSessaoId(`sessao_${Date.now()}`);
  };

  const executarAnalise = async () => {
    if (!processoId) {
      toast.error("Selecione um processo para análise");
      return;
    }
    try {
      const result = await analisarProcessoMutation.mutateAsync({
        processoId,
        focoAnalise: focoAnalise || undefined,
      });
      setAnaliseResult(result);
      toast.success("Análise técnica concluída!");
    } catch (error: any) {
      toast.error(error.message || "Erro ao analisar processo");
    }
  };

  const sugestoesPorModo: Record<ModoChat, string[]> = useMemo(() => ({
    chat: [
      "Faça um diagnóstico completo do banco de dados",
      "Busque e corrija todos os clientes duplicados",
      "Complete as movimentações de todos os processos via DataJud",
      "Qual a jurisprudência do TJ-GO sobre limite de 35%?",
    ],
    analise: [
      "Faça uma análise técnica completa deste processo",
      "Identifique os pontos fortes e fracos do caso",
      "Analise a viabilidade de recurso neste caso",
      "Busque este processo no DataJud e complete as movimentações",
    ],
    peticao: [
      "Gere um cumprimento provisório de sentença para este caso",
      "Gere um agravo de instrumento contra o indeferimento da tutela",
      "Gere embargos de declaração com efeitos infringentes",
      "Gere uma exceção de pré-executividade",
    ],
    estrategia: [
      "Monte uma estratégia completa para este processo",
      "Qual a melhor abordagem para pressionar acordo?",
      "Como refutar a tese adversária de prescrição?",
      "Estratégia para maximizar honorários neste caso",
    ],
    calculo: [
      "Calcule o débito judicial com IPCA, juros e multa do art. 523",
      "Qual o valor atualizado dos honorários de sucumbência?",
      "Calcule a margem consignável disponível do cliente",
      "Memória de cálculo para cumprimento de sentença",
    ],
  }), []);

  const stats = estatisticas.data;

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header Expert */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-900/40 dark:to-amber-800/30 rounded-xl shadow-sm">
            <Brain className="h-7 w-7 text-amber-700 dark:text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Agente Jurídico Executor</h1>
            <p className="text-sm text-muted-foreground">
              Executa ações reais: buscar, analisar, corrigir, gerar petições, merge, DataJud
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-green-300 text-green-700 dark:text-green-400 gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Online
          </Badge>
          <Button variant="outline" size="sm" onClick={() => { estatisticas.refetch(); peticoesRecentes.refetch(); }}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-3 md:grid-cols-9 gap-2">
          <Card className="border-amber-200 dark:border-amber-800 col-span-1">
            <CardContent className="p-2.5 text-center">
              <p className="text-xl font-bold text-amber-700 dark:text-amber-400">{stats.total}</p>
              <p className="text-[10px] text-muted-foreground">Conhecimentos</p>
            </CardContent>
          </Card>
          <Card><CardContent className="p-2.5 text-center"><p className="text-xl font-bold text-blue-600">{stats.teses}</p><p className="text-[10px] text-muted-foreground">Teses</p></CardContent></Card>
          <Card><CardContent className="p-2.5 text-center"><p className="text-xl font-bold text-purple-600">{stats.jurisprudencias}</p><p className="text-[10px] text-muted-foreground">Jurisp.</p></CardContent></Card>
          <Card><CardContent className="p-2.5 text-center"><p className="text-xl font-bold text-green-600">{stats.estrategias}</p><p className="text-[10px] text-muted-foreground">Estratégias</p></CardContent></Card>
          <Card><CardContent className="p-2.5 text-center"><p className="text-xl font-bold text-red-600">{stats.legislacoes}</p><p className="text-[10px] text-muted-foreground">Legislação</p></CardContent></Card>
          <Card><CardContent className="p-2.5 text-center"><p className="text-xl font-bold text-orange-600">{stats.modelos}</p><p className="text-[10px] text-muted-foreground">Modelos</p></CardContent></Card>
          <Card><CardContent className="p-2.5 text-center"><p className="text-xl font-bold text-cyan-600">{stats.templates}</p><p className="text-[10px] text-muted-foreground">Templates</p></CardContent></Card>
          <Card><CardContent className="p-2.5 text-center"><p className="text-xl font-bold text-pink-600">{stats.peticoesGeradas}</p><p className="text-[10px] text-muted-foreground">Petições</p></CardContent></Card>
          <Card><CardContent className="p-2.5 text-center"><p className="text-xl font-bold text-indigo-600">{stats.sessoes}</p><p className="text-[10px] text-muted-foreground">Sessões</p></CardContent></Card>
        </div>
      )}

      {/* Modo de Operação */}
      <div className="flex gap-1.5 p-1 bg-muted/50 rounded-lg">
        {modos.map((m) => (
          <button
            key={m.id}
            onClick={() => setModo(m.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              modo === m.id
                ? "bg-background shadow-sm border"
                : "hover:bg-background/50"
            }`}
          >
            <m.icon className={`h-3.5 w-3.5 ${modo === m.id ? m.color : "text-muted-foreground"}`} />
            {m.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        {/* Chat Principal */}
        <div>
          <Card className="h-[650px] flex flex-col">
            <CardHeader className="pb-2 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Scale className="h-5 w-5 text-amber-600" />
                  <CardTitle className="text-base">
                    {modos.find(m => m.id === modo)?.label || "Chat"} Jurídica
                  </CardTitle>
                  <Badge variant="secondary" className="text-[10px]">
                    {modos.find(m => m.id === modo)?.desc}
                  </Badge>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={limparChat} title="Nova conversa">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {/* Seletores de contexto */}
              <div className="flex gap-2 mt-1.5">
                <Select
                  value={clienteId?.toString() || "none"}
                  onValueChange={(v) => setClienteId(v === "none" ? undefined : Number(v))}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue placeholder="Cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem contexto de cliente</SelectItem>
                    {clientesQuery.data?.map((c: any) => (
                      <SelectItem key={c.id} value={c.id.toString()}>
                        {c.nomeCompleto}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {processosDoCliente.length > 0 && (
                  <Select
                    value={processoId?.toString() || "none"}
                    onValueChange={(v) => setProcessoId(v === "none" ? undefined : Number(v))}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="Processo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Todos os processos</SelectItem>
                      {processosDoCliente.map((p: any) => (
                        <SelectItem key={p.id} value={p.id.toString()}>
                          {p.numeroCnj} — {p.tipoAcao?.substring(0, 25)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {processoId && (modo === "analise") && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-purple-300 text-purple-700 hover:bg-purple-50"
                    onClick={() => setShowAnaliseDialog(true)}
                  >
                    <Target className="h-3 w-3 mr-1" />
                    Análise Completa
                  </Button>
                )}
              </div>
            </CardHeader>

            <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
              <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                {historico.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center space-y-5 py-6">
                    <div className="p-4 bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-800/10 rounded-full">
                      <Bot className="h-10 w-10 text-amber-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold mb-1">Agente Expert — Melo & Preda</h3>
                      <p className="text-xs text-muted-foreground max-w-md">
                        {stats?.total || 0} conhecimentos | {stats?.templates || 0} templates | {stats?.estrategias || 0} estratégias
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Modo: <span className="font-medium">{modos.find(m => m.id === modo)?.desc}</span>
                        {clienteId && ` | Cliente selecionado`}
                        {processoId && ` | Processo selecionado`}
                      </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 w-full max-w-lg">
                      {sugestoesPorModo[modo].map((s, i) => (
                        <button
                          key={i}
                          onClick={() => setMensagem(s)}
                          className="text-left text-xs p-2.5 rounded-lg border hover:bg-accent hover:text-accent-foreground transition-colors"
                        >
                          <Sparkles className="h-3 w-3 inline mr-1 text-amber-500" />
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {historico.map((msg, i) => (
                      <div
                        key={i}
                        className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                      >
                        {msg.role === "assistant" && (
                          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-900/30 dark:to-amber-800/20 flex items-center justify-center">
                            <Scale className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400" />
                          </div>
                        )}
                        <div
                          className={`max-w-[85%] rounded-lg p-3 ${
                            msg.role === "user"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted"
                          }`}
                        >
                          {msg.role === "assistant" ? (
                            <>
                              {msg.acoesExecutadas && msg.acoesExecutadas.length > 0 && (
                                <ToolActionsPanel acoes={msg.acoesExecutadas} />
                              )}
                              <div className="prose prose-sm dark:prose-invert max-w-none mt-1">
                                <Streamdown>{msg.content}</Streamdown>
                              </div>
                            </>
                          ) : (
                            <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                          )}
                        </div>
                        {msg.role === "user" && (
                          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary flex items-center justify-center">
                            <User className="h-3.5 w-3.5 text-primary-foreground" />
                          </div>
                        )}
                      </div>
                    ))}
                    {chatMutation.isPending && (
                      <div className="flex gap-3 justify-start">
                        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-900/30 dark:to-amber-800/20 flex items-center justify-center">
                          <Scale className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400" />
                        </div>
                        <div className="bg-muted rounded-lg p-3">
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>Processando...</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                              <Wrench className="h-3 w-3" />
                              <span>O agente pode executar ações no sistema (buscar, analisar, corrigir, gerar petições...)</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </ScrollArea>

              {/* Input */}
              <div className="border-t p-3">
                <div className="flex gap-2">
                  <Textarea
                    value={mensagem}
                    onChange={(e) => setMensagem(e.target.value)}
                    placeholder={
                      modo === "analise" ? "Descreva o que deseja analisar no processo..." :
                      modo === "peticao" ? "Descreva a petição que deseja gerar..." :
                      modo === "estrategia" ? "Descreva o cenário para a estratégia..." :
                      modo === "calculo" ? "Informe os valores e parâmetros para cálculo..." :
                      "Pergunte sobre teses, jurisprudência, estratégias..."
                    }
                    className="min-h-[44px] max-h-[100px] resize-none text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        enviarMensagem();
                      }
                    }}
                  />
                  <Button
                    onClick={enviarMensagem}
                    disabled={!mensagem.trim() || chatMutation.isPending}
                    className="bg-amber-600 hover:bg-amber-700"
                  >
                    {chatMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-[10px] text-muted-foreground">
                    Modo: {modos.find(m => m.id === modo)?.desc}
                    {clienteId && ` | ${clientesQuery.data?.find((c: any) => c.id === clienteId)?.nomeCompleto}`}
                    {processoId && ` | ${processosDoCliente.find((p: any) => p.id === processoId)?.numeroCnj}`}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{historico.length} mensagens</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Painel Lateral */}
        <div className="space-y-3">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full grid grid-cols-4">
              <TabsTrigger value="chat" className="text-xs">Ações</TabsTrigger>
              <TabsTrigger value="busca" className="text-xs">Busca</TabsTrigger>
              <TabsTrigger value="peticoes" className="text-xs">Petições</TabsTrigger>
              <TabsTrigger value="templates" className="text-xs">Templates</TabsTrigger>
            </TabsList>

            {/* Aba Ações Rápidas */}
            <TabsContent value="chat" className="space-y-3 mt-3">
              {/* Gerar Petição */}
              <Card className="border-amber-200 dark:border-amber-800">
                <CardHeader className="pb-2 pt-3">
                  <div className="flex items-center gap-2">
                    <FilePlus className="h-4 w-4 text-amber-600" />
                    <CardTitle className="text-sm">Gerar Petição</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-0.5">
                    {[
                      { short: "Agravo de Instrumento", full: "Agravo de Instrumento" },
                      { short: "Cumprimento Provisório", full: "Cumprimento Provisório de Sentença" },
                      { short: "Cumprimento Definitivo", full: "Cumprimento Definitivo de Sentença" },
                      { short: "Contrarrazões Apelação", full: "Contrarrazões de Apelação" },
                      { short: "Embargos Declaração", full: "Embargos de Declaração" },
                      { short: "Exceção Pré-Executividade", full: "Exceção de Pré-Executividade" },
                      { short: "Impugnação Cumprimento", full: "Impugnação ao Cumprimento" },
                      { short: "Querela Nullitatis", full: "Querela Nullitatis" },
                      { short: "Obrigação de Fazer", full: "Obrigação de Fazer" },
                      { short: "Petição Simples", full: "Petição Simples" },
                    ].map((tipo) => (
                      <button
                        key={tipo.full}
                        onClick={() => { setTipoPeticao(tipo.full); setShowPeticaoDialog(true); }}
                        title={tipo.full}
                        className="w-full flex items-center gap-2 text-left text-xs p-1.5 rounded hover:bg-accent transition-colors group"
                      >
                        <FileText className="h-3 w-3 text-amber-600 flex-shrink-0" />
                        <span className="flex-1 truncate">{tipo.short}</span>
                        <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Ações do Executor */}
              <Card className="border-green-200 dark:border-green-800">
                <CardHeader className="pb-2 pt-3">
                  <div className="flex items-center gap-2">
                    <Wrench className="h-4 w-4 text-green-600" />
                    <CardTitle className="text-sm">Ações do Executor</CardTitle>
                  </div>
                  <CardDescription className="text-[10px]">O agente executa ações reais no sistema</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-0.5">
                    {[
                      { icon: Database, label: "Diagnóstico completo", query: "Faça um diagnóstico completo do banco de dados: identifique duplicados, dados incompletos, processos sem movimentações e CPFs pendentes", color: "text-orange-600" },
                      { icon: GitMerge, label: "Corrigir duplicados", query: "Identifique todos os clientes duplicados e faça o merge automático mantendo o registro mais completo", color: "text-green-600" },
                      { icon: Globe, label: "Completar via DataJud", query: "Consulte o DataJud e complete as movimentações de todos os processos que estão desatualizados", color: "text-cyan-600" },
                      { icon: Target, label: "Analisar processo", query: "Faça uma análise técnica aprofundada do processo selecionado com teses, jurisprudência e estratégia", color: "text-purple-600" },
                      { icon: BarChart3, label: "Estatísticas gerais", query: "Mostre as estatísticas completas do escritório: clientes, processos, valores, prazos", color: "text-blue-600" },
                      { icon: Eraser, label: "Limpar dados incorretos", query: "Identifique e remova registros incorretos, duplicados ou inválidos do banco de dados", color: "text-red-600" },
                    ].map((item, i) => (
                      <button
                        key={i}
                        onClick={() => { setMensagem(item.query); setActiveTab("chat"); }}
                        className="w-full flex items-center gap-2 text-left text-xs p-1.5 rounded hover:bg-accent transition-colors group"
                      >
                        <item.icon className={`h-3 w-3 ${item.color} flex-shrink-0`} />
                        <span className="flex-1">{item.label}</span>
                        <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Atalhos Expert */}
              <Card>
                <CardHeader className="pb-2 pt-3">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-amber-600" />
                    <CardTitle className="text-sm">Atalhos Expert</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-0.5">
                    {[
                      { icon: BookOpen, label: "Teses centrais", query: "Liste todas as teses centrais do escritório com fundamentos legais e jurisprudência" },
                      { icon: Gavel, label: "Jurisprudência âncora", query: "Quais são as jurisprudências âncora do escritório?" },
                      { icon: Shield, label: "Estratégias avançadas", query: "Descreva todas as estratégias processuais avançadas do escritório" },
                      { icon: Calculator, label: "Fórmula de cálculo", query: "Explique a fórmula completa de cálculo de débito judicial" },
                    ].map((item, i) => (
                      <button
                        key={i}
                        onClick={() => setMensagem(item.query)}
                        className="w-full flex items-center gap-2 text-left text-xs p-1.5 rounded hover:bg-accent transition-colors group"
                      >
                        <item.icon className="h-3 w-3 text-amber-600 flex-shrink-0" />
                        <span className="flex-1">{item.label}</span>
                        <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Aba Busca */}
            <TabsContent value="busca" className="space-y-3 mt-3">
              <Card>
                <CardHeader className="pb-2 pt-3">
                  <div className="flex items-center gap-2">
                    <Search className="h-4 w-4 text-amber-600" />
                    <CardTitle className="text-sm">Buscar na Base</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 pt-0">
                  <Input
                    value={termoBusca}
                    onChange={(e) => setTermoBusca(e.target.value)}
                    placeholder="Buscar conhecimento..."
                    className="h-8 text-xs"
                  />
                  <Select value={categoriaBusca || "todas"} onValueChange={setCategoriaBusca}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas</SelectItem>
                      <SelectItem value="Tese">Teses</SelectItem>
                      <SelectItem value="Jurisprudencia">Jurisprudência</SelectItem>
                      <SelectItem value="Estrategia">Estratégias</SelectItem>
                      <SelectItem value="Legislacao">Legislação</SelectItem>
                      <SelectItem value="Modelo">Modelos</SelectItem>
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              {termoBusca.length >= 2 && (
                <Card>
                  <CardHeader className="pb-1 pt-2">
                    <CardTitle className="text-xs">
                      {busca.isLoading ? "Buscando..." : `${busca.data?.length || 0} resultados`}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <ScrollArea className="h-[450px]">
                      <div className="space-y-1.5">
                        {busca.data?.map((item: any) => (
                          <button
                            key={item.id}
                            onClick={() => setMensagem(`Explique em detalhes sobre: ${item.titulo}`)}
                            className="w-full text-left p-2 rounded-lg border hover:bg-accent transition-colors"
                          >
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <Badge
                                variant="outline"
                                className={`text-[10px] px-1.5 py-0 ${
                                  item.categoria === "Tese" ? "border-blue-300 text-blue-700" :
                                  item.categoria === "Jurisprudencia" ? "border-purple-300 text-purple-700" :
                                  item.categoria === "Estrategia" ? "border-green-300 text-green-700" :
                                  item.categoria === "Legislacao" ? "border-red-300 text-red-700" :
                                  "border-orange-300 text-orange-700"
                                }`}
                              >
                                {item.categoria === "Jurisprudencia" ? "Jurisp." : item.categoria}
                              </Badge>
                            </div>
                            <p className="text-[11px] font-medium line-clamp-2">{item.titulo}</p>
                            {item.conteudo && (
                              <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">
                                {item.conteudo.substring(0, 100)}...
                              </p>
                            )}
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Aba Petições Geradas */}
            <TabsContent value="peticoes" className="space-y-3 mt-3">
              <Card>
                <CardHeader className="pb-2 pt-3">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-amber-600" />
                    <CardTitle className="text-sm">Petições Geradas</CardTitle>
                  </div>
                  <CardDescription className="text-xs">{peticoesRecentes.data?.length || 0} petições recentes</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-1.5">
                      {peticoesRecentes.data?.map((p: any) => (
                        <div key={p.id} className="p-2 rounded-lg border hover:bg-accent/50 transition-colors">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-300 text-amber-700">
                              {p.tipo}
                            </Badge>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {p.status}
                            </Badge>
                          </div>
                          <p className="text-[11px] font-medium line-clamp-1">{p.titulo}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(p.createdAt).toLocaleDateString('pt-BR')}
                          </p>
                          {p.storageUrl && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 text-[10px] mt-0.5 p-0"
                              onClick={() => window.open(p.storageUrl, '_blank')}
                            >
                              <Download className="h-2.5 w-2.5 mr-0.5" />Baixar
                            </Button>
                          )}
                        </div>
                      ))}
                      {(!peticoesRecentes.data || peticoesRecentes.data.length === 0) && (
                        <p className="text-xs text-muted-foreground text-center py-4">
                          Nenhuma petição gerada ainda
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Aba Templates */}
            <TabsContent value="templates" className="space-y-3 mt-3">
              <Card>
                <CardHeader className="pb-2 pt-3">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-amber-600" />
                    <CardTitle className="text-sm">Templates Disponíveis</CardTitle>
                  </div>
                  <CardDescription className="text-xs">{templates.data?.length || 0} templates estruturados</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-2">
                      {templates.data?.map((t: any) => (
                        <div key={t.id} className="p-2.5 rounded-lg border hover:bg-accent/50 transition-colors">
                          <p className="text-xs font-medium">{t.nome}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{t.descricao}</p>
                          {t.tesesAplicaveis && (
                            <p className="text-[10px] text-blue-600 mt-0.5 line-clamp-1">
                              Teses: {t.tesesAplicaveis}
                            </p>
                          )}
                          <div className="flex gap-1 mt-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-5 text-[10px] px-2"
                              onClick={() => {
                                setSelectedTemplateId(t.id);
                                setTipoPeticao(t.nome);
                                setShowPeticaoDialog(true);
                              }}
                            >
                              <FilePlus className="h-2.5 w-2.5 mr-0.5" />Usar Template
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Dialog de Geração de Petição */}
      <Dialog open={showPeticaoDialog} onOpenChange={(open) => { setShowPeticaoDialog(open); if (!open) { setPeticaoGerada(null); setInstrucoesPeticao(""); setSelectedTemplateId(undefined); } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FilePlus className="h-5 w-5 text-amber-600" />
              Gerar {tipoPeticao}
            </DialogTitle>
            <DialogDescription>
              {peticaoGerada ? 'Petição gerada com sucesso — revise e faça download' : 'Configure o contexto e gere a petição com expertise do escritório'}
            </DialogDescription>
          </DialogHeader>

          {!peticaoGerada ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Cliente</Label>
                  <Select
                    value={clienteId?.toString() || "none"}
                    onValueChange={(v) => setClienteId(v === "none" ? undefined : Number(v))}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Selecione o cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem contexto</SelectItem>
                      {clientesQuery.data?.map((c: any) => (
                        <SelectItem key={c.id} value={c.id.toString()}>{c.nomeCompleto}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {processosDoCliente.length > 0 && (
                  <div>
                    <Label className="text-xs">Processo</Label>
                    <Select
                      value={processoId?.toString() || "none"}
                      onValueChange={(v) => setProcessoId(v === "none" ? undefined : Number(v))}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Selecione o processo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Todos</SelectItem>
                        {processosDoCliente.map((p: any) => (
                          <SelectItem key={p.id} value={p.id.toString()}>{p.numeroCnj}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              {selectedTemplateId && (
                <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    <FileText className="h-3 w-3 inline mr-1" />
                    Template estruturado selecionado — a petição seguirá o modelo padronizado
                  </p>
                </div>
              )}
              <div>
                <Label className="text-xs">Instruções adicionais (opcional)</Label>
                <Textarea
                  value={instrucoesPeticao}
                  onChange={(e) => setInstrucoesPeticao(e.target.value)}
                  placeholder="Ex: Focar na tese de preclução lógica, incluir pedido de tutela de urgência, enfatizar a natureza alimentar..."
                  className="min-h-[80px]"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setShowPeticaoDialog(false); setPeticaoGerada(null); setInstrucoesPeticao(""); setSelectedTemplateId(undefined); }}>
                  Cancelar
                </Button>
                <Button
                  className="bg-amber-600 hover:bg-amber-700"
                  disabled={gerarPeticaoMutation.isPending}
                  onClick={async () => {
                    try {
                      const result = await gerarPeticaoMutation.mutateAsync({
                        tipoPeticao,
                        templateId: selectedTemplateId,
                        clienteId,
                        processoId,
                        instrucoes: instrucoesPeticao || undefined,
                      });
                      setPeticaoGerada(result);
                      peticoesRecentes.refetch();
                      toast.success("Petição gerada com sucesso!");
                    } catch (error: any) {
                      toast.error(error.message || "Erro ao gerar petição");
                    }
                  }}
                >
                  {gerarPeticaoMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" />Gerando petição...</>
                  ) : (
                    <><FilePlus className="h-4 w-4 mr-2" />Gerar Petição</>
                  )}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="outline" className="border-amber-300 text-amber-700">{peticaoGerada.tipoPeticao}</Badge>
                {peticaoGerada.cliente !== 'Cliente' && <Badge variant="outline">{peticaoGerada.cliente}</Badge>}
                {peticaoGerada.processo && <Badge variant="outline" className="font-mono text-xs">{peticaoGerada.processo}</Badge>}
              </div>
              <div className="border rounded-lg p-4 max-h-[50vh] overflow-y-auto bg-white dark:bg-zinc-950">
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <Streamdown>{peticaoGerada.peticao}</Streamdown>
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => { setPeticaoGerada(null); setInstrucoesPeticao(""); }}>
                  <RefreshCw className="h-4 w-4 mr-1" />Nova
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(peticaoGerada.peticao);
                    setCopied(true);
                    toast.success("Petição copiada!");
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                  {copied ? 'Copiado!' : 'Copiar'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    const blob = new Blob([peticaoGerada.peticao], { type: 'text/markdown' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${peticaoGerada.tipoPeticao.replace(/\s+/g, '_')}_${peticaoGerada.cliente.replace(/\s+/g, '_')}.md`;
                    a.click();
                    URL.revokeObjectURL(url);
                    toast.success("Download MD iniciado!");
                  }}
                >
                  <Download className="h-4 w-4 mr-1" />Markdown
                </Button>
                <Button
                  className="bg-amber-600 hover:bg-amber-700"
                  disabled={exportarDocxMutation.isPending}
                  onClick={async () => {
                    if (peticaoGerada.docxUrl) {
                      window.open(peticaoGerada.docxUrl, '_blank');
                      toast.success("Download DOCX iniciado!");
                      return;
                    }
                    try {
                      const result = await exportarDocxMutation.mutateAsync({
                        conteudo: peticaoGerada.peticao,
                        titulo: `${peticaoGerada.tipoPeticao} \u2014 ${peticaoGerada.cliente}`,
                      });
                      if (result.docxUrl) {
                        setPeticaoGerada({ ...peticaoGerada, docxUrl: result.docxUrl });
                        window.open(result.docxUrl, '_blank');
                        toast.success("DOCX com timbrado gerado e baixado!");
                      }
                    } catch (e) {
                      toast.error("Erro ao gerar DOCX");
                    }
                  }}
                >
                  {exportarDocxMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileText className="h-4 w-4 mr-1" />}
                  {exportarDocxMutation.isPending ? 'Gerando...' : 'DOCX Timbrado'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog de Análise Técnica */}
      <Dialog open={showAnaliseDialog} onOpenChange={(open) => { setShowAnaliseDialog(open); if (!open) { setAnaliseResult(null); setFocoAnalise(""); } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-purple-600" />
              Análise Técnica Aprofundada
            </DialogTitle>
            <DialogDescription>
              {analiseResult ? `Análise do processo ${analiseResult.processo}` : 'Análise completa com identificação de teses, estratégias e riscos'}
            </DialogDescription>
          </DialogHeader>

          {!analiseResult ? (
            <div className="space-y-4">
              <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                <p className="text-xs text-purple-700 dark:text-purple-400">
                  Processo selecionado: <span className="font-medium">{processosDoCliente.find((p: any) => p.id === processoId)?.numeroCnj || 'Nenhum'}</span>
                </p>
              </div>
              <div>
                <Label className="text-xs">Foco da análise (opcional)</Label>
                <Textarea
                  value={focoAnalise}
                  onChange={(e) => setFocoAnalise(e.target.value)}
                  placeholder="Ex: Viabilidade de recurso, chances de tutela de urgência, cálculo de honorários..."
                  className="min-h-[60px]"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAnaliseDialog(false)}>Cancelar</Button>
                <Button
                  className="bg-purple-600 hover:bg-purple-700"
                  disabled={!processoId || analisarProcessoMutation.isPending}
                  onClick={executarAnalise}
                >
                  {analisarProcessoMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" />Analisando...</>
                  ) : (
                    <><Target className="h-4 w-4 mr-2" />Executar Análise</>
                  )}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-purple-300 text-purple-700">{analiseResult.tipo}</Badge>
                <Badge variant="outline" className="font-mono text-xs">{analiseResult.processo}</Badge>
              </div>
              <div className="border rounded-lg p-4 max-h-[55vh] overflow-y-auto bg-white dark:bg-zinc-950">
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <Streamdown>{analiseResult.analise}</Streamdown>
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setAnaliseResult(null)}>
                  <RefreshCw className="h-4 w-4 mr-1" />Nova Análise
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(analiseResult.analise);
                    toast.success("Análise copiada!");
                  }}
                >
                  <Copy className="h-4 w-4 mr-1" />Copiar
                </Button>
                <Button
                  className="bg-purple-600 hover:bg-purple-700"
                  onClick={() => {
                    const blob = new Blob([analiseResult.analise], { type: 'text/markdown' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `Analise_${analiseResult.processo.replace(/[^0-9]/g, '')}.md`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download className="h-4 w-4 mr-1" />Download
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
