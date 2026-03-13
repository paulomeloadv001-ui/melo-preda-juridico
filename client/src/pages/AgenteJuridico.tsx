import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2, Send, Bot, User, Scale, BookOpen, Gavel, FileText, Search, Sparkles, Brain, RefreshCw, Trash2, Download, FilePlus, Copy, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Streamdown } from "streamdown";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export default function AgenteJuridico() {
  const [mensagem, setMensagem] = useState("");
  const [historico, setHistorico] = useState<ChatMessage[]>([]);
  const [clienteId, setClienteId] = useState<number | undefined>();
  const [processoId, setProcessoId] = useState<number | undefined>();
  const [termoBusca, setTermoBusca] = useState("");
  const [categoriaBusca, setCategoriaBusca] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const chatMutation = trpc.agente.chat.useMutation();
  const gerarPeticaoMutation = trpc.agente.gerarPeticao.useMutation();
  const [showPeticaoDialog, setShowPeticaoDialog] = useState(false);
  const [tipoPeticao, setTipoPeticao] = useState("");
  const [instrucoesPeticao, setInstrucoesPeticao] = useState("");
  const [peticaoGerada, setPeticaoGerada] = useState<{peticao: string; url: string; tipoPeticao: string; cliente: string; processo: string} | null>(null);
  const [copied, setCopied] = useState(false);
  const estatisticas = trpc.agente.estatisticas.useQuery();
  const busca = trpc.agente.buscarConhecimento.useQuery(
    { termo: termoBusca, categoria: categoriaBusca && categoriaBusca !== "todas" ? categoriaBusca as any : undefined },
    { enabled: termoBusca.length >= 2 }
  );

  // Buscar clientes e processos para contexto
  const clientesQuery = trpc.clientes.list.useQuery({});
  const [processosDoCliente, setProcessosDoCliente] = useState<any[]>([]);

  // Buscar processos do cliente selecionado via perfil
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
      });
      setHistorico([...novoHistorico, { role: "assistant", content: result.resposta }]);
    } catch (error: any) {
      setHistorico([
        ...novoHistorico,
        { role: "assistant", content: `Erro ao processar: ${error.message || "Tente novamente."}` },
      ]);
    }
  };

  const limparChat = () => {
    setHistorico([]);
    setClienteId(undefined);
    setProcessoId(undefined);
  };

  const sugestoes = [
    "Qual a melhor estratégia para cumprimento provisório de honorários?",
    "Analise a tese de abusividade de consignações para servidor público",
    "Quais os fundamentos para agravo de instrumento contra indeferimento de alvará?",
    "Como calcular o débito judicial com IPCA, juros e multa do art. 523?",
    "Qual a jurisprudência do TJ-GO sobre limite de 35% em consignações?",
    "Monte uma estratégia para exceção de pré-executividade",
  ];

  const stats = estatisticas.data;

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
            <Brain className="h-6 w-6 text-amber-700 dark:text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Agente Jurídico IA</h1>
            <p className="text-sm text-muted-foreground">
              Assistente inteligente com base de conhecimento completa do escritório
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => estatisticas.refetch()}>
          <RefreshCw className="h-4 w-4 mr-1" />
          Atualizar
        </Button>
      </div>

      {/* Estatísticas da Base */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Card className="border-amber-200 dark:border-amber-800">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-blue-600">{stats.teses}</p>
              <p className="text-xs text-muted-foreground">Teses</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-purple-600">{stats.jurisprudencias}</p>
              <p className="text-xs text-muted-foreground">Jurisprud.</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-green-600">{stats.estrategias}</p>
              <p className="text-xs text-muted-foreground">Estratégias</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-red-600">{stats.legislacoes}</p>
              <p className="text-xs text-muted-foreground">Legislação</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-orange-600">{stats.modelos}</p>
              <p className="text-xs text-muted-foreground">Modelos</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chat Principal */}
        <div className="lg:col-span-2">
          <Card className="h-[700px] flex flex-col">
            <CardHeader className="pb-3 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Scale className="h-5 w-5 text-amber-600" />
                  <CardTitle className="text-lg">Chat Jurídico</CardTitle>
                </div>
                <Button variant="ghost" size="sm" onClick={limparChat}>
                  <Trash2 className="h-4 w-4 mr-1" />
                  Limpar
                </Button>
              </div>
              {/* Seletores de contexto */}
              <div className="flex gap-2 mt-2">
                <Select
                  value={clienteId?.toString() || "none"}
                  onValueChange={(v) => setClienteId(v === "none" ? undefined : Number(v))}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Contexto: Cliente" />
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
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Contexto: Processo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Todos os processos</SelectItem>
                      {processosDoCliente.map((p: any) => (
                        <SelectItem key={p.id} value={p.id.toString()}>
                          {p.numeroCnj} — {p.tipoAcao?.substring(0, 30)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </CardHeader>

            <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
              {/* Mensagens */}
              <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                {historico.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center space-y-6 py-8">
                    <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-full">
                      <Bot className="h-12 w-12 text-amber-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold mb-1">Agente Jurídico Expert</h3>
                      <p className="text-sm text-muted-foreground max-w-md">
                        Assistente com acesso a {stats?.total || 0} conhecimentos do escritório.
                        Selecione um cliente/processo para contexto específico ou pergunte diretamente.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 w-full max-w-lg">
                      {sugestoes.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => { setMensagem(s); }}
                          className="text-left text-xs p-3 rounded-lg border hover:bg-accent hover:text-accent-foreground transition-colors"
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
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                            <Scale className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                          </div>
                        )}
                        <div
                          className={`max-w-[80%] rounded-lg p-3 ${
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
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                            <User className="h-4 w-4 text-primary-foreground" />
                          </div>
                        )}
                      </div>
                    ))}
                    {chatMutation.isPending && (
                      <div className="flex gap-3 justify-start">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                          <Scale className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                        </div>
                        <div className="bg-muted rounded-lg p-3">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Analisando com base de conhecimento...
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
                    placeholder="Pergunte sobre estratégias, teses, jurisprudência, cálculos..."
                    className="min-h-[44px] max-h-[120px] resize-none"
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
                {clienteId && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Contexto ativo: {clientesQuery.data?.find((c: any) => c.id === clienteId)?.nomeCompleto}
                    {processoId && ` — Processo ${processosDoCliente.find((p: any) => p.id === processoId)?.numeroCnj}`}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Painel Lateral - Busca na Base */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Search className="h-5 w-5 text-amber-600" />
                <CardTitle className="text-lg">Buscar na Base</CardTitle>
              </div>
              <CardDescription>Pesquise teses, jurisprudência, estratégias e modelos</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                value={termoBusca}
                onChange={(e) => setTermoBusca(e.target.value)}
                placeholder="Buscar conhecimento..."
                className="h-9"
              />
              <Select value={categoriaBusca || "todas"} onValueChange={setCategoriaBusca}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as categorias</SelectItem>
                  <SelectItem value="Tese">Teses</SelectItem>
                  <SelectItem value="Jurisprudencia">Jurisprudência</SelectItem>
                  <SelectItem value="Estrategia">Estratégias</SelectItem>
                  <SelectItem value="Legislacao">Legislação</SelectItem>
                  <SelectItem value="Modelo">Modelos</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Resultados da busca */}
          {termoBusca.length >= 2 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  {busca.isLoading ? "Buscando..." : `${busca.data?.length || 0} resultados`}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <div className="space-y-2">
                    {busca.data?.map((item: any) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          setMensagem(`Explique em detalhes sobre: ${item.titulo}`);
                        }}
                        className="w-full text-left p-3 rounded-lg border hover:bg-accent transition-colors"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Badge
                            variant="outline"
                            className={
                              item.categoria === "Tese"
                                ? "border-blue-300 text-blue-700 dark:text-blue-400"
                                : item.categoria === "Jurisprudencia"
                                ? "border-purple-300 text-purple-700 dark:text-purple-400"
                                : item.categoria === "Estrategia"
                                ? "border-green-300 text-green-700 dark:text-green-400"
                                : item.categoria === "Legislacao"
                                ? "border-red-300 text-red-700 dark:text-red-400"
                                : "border-orange-300 text-orange-700 dark:text-orange-400"
                            }
                          >
                            {item.categoria === "Jurisprudencia" ? "Jurisp." : item.categoria}
                          </Badge>
                          {item.tribunal && (
                            <span className="text-xs text-muted-foreground">{item.tribunal}</span>
                          )}
                        </div>
                        <p className="text-xs font-medium line-clamp-2">{item.titulo}</p>
                        {item.conteudo && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                            {item.conteudo.substring(0, 120)}...
                          </p>
                        )}
                      </button>
                    ))}
                    {busca.data?.length === 0 && !busca.isLoading && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Nenhum resultado encontrado
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {/* Gerar Petição */}
          <Card className="border-amber-200 dark:border-amber-800">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <FilePlus className="h-4 w-4 text-amber-600" />
                <CardTitle className="text-sm">Gerar Petição</CardTitle>
              </div>
              <CardDescription className="text-xs">Gere petições completas com timbrado do escritório</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
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
                    className="w-full flex items-center gap-2 text-left text-xs p-2 rounded hover:bg-accent transition-colors"
                  >
                    <FileText className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
                    {tipo}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Atalhos rápidos */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Gavel className="h-4 w-4 text-amber-600" />
                <CardTitle className="text-sm">Atalhos Rápidos</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {[
                  { icon: BookOpen, label: "Teses do escritório", query: "Liste todas as teses centrais do escritório com fundamentos" },
                  { icon: Gavel, label: "Jurisprudência âncora", query: "Quais são as jurisprudências âncora utilizadas pelo escritório?" },
                  { icon: FileText, label: "Modelos de petição", query: "Quais modelos de petição estão disponíveis na base?" },
                  { icon: Scale, label: "Estratégias avançadas", query: "Descreva as estratégias processuais avançadas disponíveis" },
                ].map((item, i) => (
                  <button
                    key={i}
                    onClick={() => setMensagem(item.query)}
                    className="w-full flex items-center gap-2 text-left text-xs p-2 rounded hover:bg-accent transition-colors"
                  >
                    <item.icon className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
                    {item.label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dialog de Geração de Petição */}
      <Dialog open={showPeticaoDialog} onOpenChange={setShowPeticaoDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FilePlus className="h-5 w-5 text-amber-600" />
              Gerar {tipoPeticao}
            </DialogTitle>
            <DialogDescription>
              {peticaoGerada ? 'Petição gerada com sucesso' : 'Configure e gere a petição com base no contexto do processo'}
            </DialogDescription>
          </DialogHeader>

          {!peticaoGerada ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Cliente (contexto)</Label>
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
                    <Label className="text-xs">Processo (contexto)</Label>
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
              <div>
                <Label className="text-xs">Instruções adicionais (opcional)</Label>
                <Textarea
                  value={instrucoesPeticao}
                  onChange={(e) => setInstrucoesPeticao(e.target.value)}
                  placeholder="Ex: Focar na tese de preclução lógica, incluir pedido de tutela de urgência..."
                  className="min-h-[80px]"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setShowPeticaoDialog(false); setPeticaoGerada(null); setInstrucoesPeticao(""); }}>
                  Cancelar
                </Button>
                <Button
                  className="bg-amber-600 hover:bg-amber-700"
                  disabled={gerarPeticaoMutation.isPending}
                  onClick={async () => {
                    try {
                      const result = await gerarPeticaoMutation.mutateAsync({
                        tipoPeticao,
                        clienteId,
                        processoId,
                        instrucoes: instrucoesPeticao || undefined,
                      });
                      setPeticaoGerada(result);
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
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
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
                  <RefreshCw className="h-4 w-4 mr-1" />Nova Petição
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
    </div>
  );
}
