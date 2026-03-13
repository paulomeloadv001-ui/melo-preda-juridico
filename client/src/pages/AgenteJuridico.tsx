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
import { Loader2, Send, Bot, User, Scale, BookOpen, Gavel, FileText, Search, Sparkles, Brain, RefreshCw, Trash2, Download, FilePlus, Copy, Check, MessageSquare, Zap, Target, Calculator, ClipboardList, ChevronRight, History, AlertTriangle, Shield } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Streamdown } from "streamdown";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ModoChat = "chat" | "analise" | "peticao" | "estrategia" | "calculo";

const modos: { id: ModoChat; label: string; icon: any; desc: string; color: string }[] = [
  { id: "chat", label: "Consulta", icon: MessageSquare, desc: "Consulta jurídica geral", color: "text-blue-600" },
  { id: "analise", label: "Análise", icon: Target, desc: "Análise técnica aprofundada", color: "text-purple-600" },
  { id: "peticao", label: "Petição", icon: FileText, desc: "Gerar petição completa", color: "text-amber-600" },
  { id: "estrategia", label: "Estratégia", icon: Shield, desc: "Estratégia processual", color: "text-green-600" },
  { id: "calculo", label: "Cálculo", icon: Calculator, desc: "Cálculos judiciais", color: "text-red-600" },
];

export default function AgenteJuridico() {
  const [mensagem, setMensagem] = useState("");
  const [historico, setHistorico] = useState<ChatMessage[]>([]);
  const [clienteId, setClienteId] = useState<number | undefined>();
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
  const [peticaoGerada, setPeticaoGerada] = useState<{peticao: string; url: string; tipoPeticao: string; cliente: string; processo: string} | null>(null);
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
        historico: historico,
        clienteId,
        processoId,
        modo,
        sessaoId,
      });
      setHistorico([...novoHistorico, { role: "assistant", content: result.resposta }]);
      if (result.sessaoId) setSessaoId(result.sessaoId);
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
      "Qual a melhor estratégia para cumprimento provisório de honorários?",
      "Analise a tese de abusividade de consignações para servidor público",
      "Qual a jurisprudência do TJ-GO sobre limite de 35%?",
      "Como funciona a coisa julgada progressiva em honorários?",
    ],
    analise: [
      "Faça uma análise técnica completa deste processo",
      "Identifique os pontos fortes e fracos do caso",
      "Quais as chances de êxito nesta demanda?",
      "Analise a viabilidade de recurso neste caso",
    ],
    peticao: [
      "Elabore um cumprimento provisório de sentença para este caso",
      "Gere um agravo de instrumento contra o indeferimento da tutela",
      "Redija embargos de declaração com efeitos infringentes",
      "Prepare uma exceção de pré-executividade",
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
            <h1 className="text-2xl font-bold tracking-tight">Agente Jurídico Expert</h1>
            <p className="text-sm text-muted-foreground">
              Sistema inteligente com expertise completa do escritório Melo & Preda
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Chat Principal */}
        <div className="lg:col-span-2">
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
                            <div className="prose prose-sm dark:prose-invert max-w-none">
                              <Streamdown>{msg.content}</Streamdown>
                            </div>
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
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {modo === "analise" ? "Analisando processo..." :
                             modo === "peticao" ? "Elaborando petição..." :
                             modo === "estrategia" ? "Montando estratégia..." :
                             modo === "calculo" ? "Calculando valores..." :
                             "Consultando base de conhecimento..."}
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
                      "Agravo de Instrumento",
                      "Cumprimento Provisório de Sentença",
                      "Cumprimento Definitivo de Sentença",
                      "Contrarrazões de Apelação",
                      "Embargos de Declaração",
                      "Exceção de Pré-Executividade",
                      "Impugnação ao Cumprimento",
                      "Querela Nullitatis",
                      "Obrigação de Fazer",
                      "Petição Simples",
                    ].map((tipo) => (
                      <button
                        key={tipo}
                        onClick={() => { setTipoPeticao(tipo); setShowPeticaoDialog(true); }}
                        className="w-full flex items-center gap-2 text-left text-xs p-1.5 rounded hover:bg-accent transition-colors group"
                      >
                        <FileText className="h-3 w-3 text-amber-600 flex-shrink-0" />
                        <span className="flex-1">{tipo}</span>
                        <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Atalhos por Modo */}
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
                      { icon: BookOpen, label: "Teses centrais do escritório", query: "Liste todas as teses centrais do escritório com fundamentos legais e jurisprudência" },
                      { icon: Gavel, label: "Jurisprudência âncora", query: "Quais são as jurisprudências âncora do escritório? Detalhe cada uma com número, relator e ementa" },
                      { icon: Shield, label: "Estratégias avançadas", query: "Descreva todas as 8 estratégias processuais avançadas do escritório com detalhes de quando usar cada uma" },
                      { icon: Scale, label: "Legislação fundamental", query: "Liste toda a legislação fundamental utilizada pelo escritório com artigos específicos" },
                      { icon: Calculator, label: "Fórmula de cálculo judicial", query: "Explique a fórmula completa de cálculo de débito judicial: IPCA + juros + multa art. 523 + honorários" },
                      { icon: AlertTriangle, label: "Checklist de análise", query: "Qual o checklist completo para análise técnica de um processo?" },
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
                  className="bg-amber-600 hover:bg-amber-700"
                  onClick={() => {
                    const blob = new Blob([peticaoGerada.peticao], { type: 'text/markdown' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${peticaoGerada.tipoPeticao.replace(/\s+/g, '_')}_${peticaoGerada.cliente.replace(/\s+/g, '_')}.md`;
                    a.click();
                    URL.revokeObjectURL(url);
                    toast.success("Download iniciado!");
                  }}
                >
                  <Download className="h-4 w-4 mr-1" />Download
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
