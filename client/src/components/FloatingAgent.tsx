import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Bot, Send, X, Minimize2, Maximize2, Loader2, User,
  Wrench, CheckCircle2, XCircle, ChevronRight, Sparkles,
  Scale, FileText, Search, BarChart3, Gavel, Brain,
  Users, FolderOpen, AlertTriangle, BookOpen, Zap,
  RefreshCw, Download, Calendar, Bell
} from "lucide-react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import { useLocation } from "wouter";

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

const TOOL_LABELS: Record<string, string> = {
  buscar_cliente: "Buscar Cliente",
  buscar_processo: "Buscar Processo",
  diagnosticar_banco: "Diagnosticar Banco",
  listar_duplicados: "Listar Duplicados",
  merge_clientes: "Merge Clientes",
  remover_registro: "Remover Registro",
  completar_movimentacoes: "Completar Movimentações",
  analisar_processo_tecnico: "Análise Técnica",
  gerar_peticao: "Gerar Petição",
  atualizar_dados_cliente: "Atualizar Cliente",
  atualizar_dados_processo: "Atualizar Processo",
  consultar_estatisticas: "Estatísticas",
  editar_peticao: "Editar Petição",
  listar_peticoes: "Listar Petições",
};

// Contexto inteligente por página
interface PageContext {
  titulo: string;
  descricao: string;
  sugestoes: string[];
  modo: "chat" | "analise" | "peticao" | "estrategia" | "calculo";
  icone: typeof Scale;
}

function getPageContext(path: string): PageContext {
  if (path.startsWith("/cliente/")) {
    const id = path.split("/")[2];
    return {
      titulo: "Pasta do Cliente",
      descricao: `Analisando cliente #${id}. Posso gerar petições, analisar processos, buscar dados financeiros ou organizar a pasta.`,
      sugestoes: [
        "Analise todos os processos deste cliente",
        "Gere petição de cumprimento de sentença",
        "Calcule débitos atualizados",
        "Quais estratégias recomenda?",
        "Resuma a situação financeira completa",
      ],
      modo: "analise",
      icone: FolderOpen,
    };
  }

  const contexts: Record<string, PageContext> = {
    "/": {
      titulo: "Painel Geral",
      descricao: "Visão geral do escritório. Posso analisar métricas, identificar prazos urgentes, diagnosticar o banco ou gerar relatórios.",
      sugestoes: [
        "Diagnóstico completo do banco de dados",
        "Quais prazos vencem esta semana?",
        "Resumo financeiro do escritório",
        "Listar processos sem estratégia definida",
      ],
      modo: "chat",
      icone: BarChart3,
    },
    "/upload": {
      titulo: "Upload de Processos",
      descricao: "Área de importação. Após o upload, analiso o processo a fundo, extraio todos os dados e alimento o banco de conhecimentos.",
      sugestoes: [
        "Como funciona o fluxo de importação?",
        "Quais dados são extraídos do PDF?",
        "Verificar status dos últimos uploads",
      ],
      modo: "chat",
      icone: FileText,
    },
    "/clientes": {
      titulo: "Lista de Clientes",
      descricao: "Gerenciamento de clientes. Posso buscar duplicados, completar dados, gerar relatórios individuais ou fazer merge de cadastros.",
      sugestoes: [
        "Buscar clientes com dados incompletos",
        "Listar clientes duplicados",
        "Qual cliente tem mais processos?",
        "Gerar relatório de todos os clientes",
      ],
      modo: "chat",
      icone: Users,
    },
    "/peticionamento": {
      titulo: "Peticionamento",
      descricao: "Centro de petições. Já estudei todos os processos do escritório. Diga o cliente e o tipo de petição que deseja.",
      sugestoes: [
        "Gerar petição de cumprimento de sentença",
        "Criar embargos à execução",
        "Elaborar recurso de apelação",
        "Petição de revisão de contrato",
        "Listar petições já geradas",
      ],
      modo: "peticao",
      icone: Gavel,
    },
    "/conhecimentos": {
      titulo: "Base Jurídica",
      descricao: "Banco de conhecimentos do escritório. Posso buscar teses, jurisprudências, estratégias ou adicionar novos conhecimentos.",
      sugestoes: [
        "Quais teses temos cadastradas?",
        "Buscar jurisprudência sobre consignados",
        "Listar estratégias processuais",
        "Resumo da base de conhecimentos",
      ],
      modo: "chat",
      icone: BookOpen,
    },
    "/conectores": {
      titulo: "Conectores & PROJUDI",
      descricao: "Painel de integrações. Posso verificar status das APIs (DataJud, JusBrasil, JusConsig), monitorar o PROJUDI e alimentar dados automaticamente.",
      sugestoes: [
        "Verificar publicações pendentes no PROJUDI",
        "Consultar movimentações via DataJud",
        "Status de todas as APIs integradas",
        "Checar processos parados há mais de 30 dias",
      ],
      modo: "analise",
      icone: Zap,
    },
    "/prazos": {
      titulo: "Prazos Processuais",
      descricao: "Controle de prazos. Posso verificar prazos urgentes, gerar alertas e recomendar ações para cada prazo.",
      sugestoes: [
        "Quais prazos vencem nos próximos 5 dias?",
        "Listar prazos vencidos sem cumprimento",
        "Gerar alerta de prazos urgentes",
      ],
      modo: "chat",
      icone: Calendar,
    },
    "/publicacoes": {
      titulo: "Publicações",
      descricao: "Monitoramento de publicações. Posso verificar novas publicações, gerar prazos automáticos e integrar com a pasta do cliente.",
      sugestoes: [
        "Buscar novas publicações no DATAJUD",
        "Quais publicações não foram tratadas?",
        "Gerar prazos para publicações pendentes",
      ],
      modo: "chat",
      icone: Bell,
    },
    "/relatorios": {
      titulo: "Relatórios",
      descricao: "Geração de relatórios. Posso criar relatórios individuais por cliente, processuais ou financeiros do escritório.",
      sugestoes: [
        "Gerar relatório financeiro geral",
        "Relatório de processos por fase",
        "Estatísticas do escritório",
      ],
      modo: "chat",
      icone: BarChart3,
    },
    "/correcao": {
      titulo: "Correção de Dados",
      descricao: "Manutenção do banco. Posso diagnosticar problemas, corrigir duplicados, normalizar CPFs e limpar dados inconsistentes.",
      sugestoes: [
        "Diagnóstico completo do banco",
        "Buscar e corrigir duplicados",
        "Normalizar todos os CPFs",
      ],
      modo: "chat",
      icone: Wrench,
    },
    "/status": {
      titulo: "Status do Sistema",
      descricao: "Monitoramento da saúde da plataforma. Posso verificar APIs, banco de dados, storage e integrações.",
      sugestoes: [
        "Verificar saúde de todas as APIs",
        "Diagnóstico do banco de dados",
        "Status do storage S3",
      ],
      modo: "chat",
      icone: Wrench,
    },
  };

  return contexts[path] || {
    titulo: "Agente IA Jurídico",
    descricao: "Agente completo do escritório Melo & Preda. Posso analisar processos, gerar petições, buscar dados e executar ações no sistema.",
    sugestoes: [
      "Diagnóstico do banco de dados",
      "Buscar cliente por nome",
      "Analisar processo",
      "Gerar petição",
    ],
    modo: "chat" as const,
    icone: Scale,
  };
}

function MiniToolActions({ acoes }: { acoes: ToolAction[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!acoes || acoes.length === 0) return null;

  return (
    <div className="mt-1.5 border border-amber-200/50 dark:border-amber-800/50 rounded overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-2 py-1 bg-amber-50/50 dark:bg-amber-900/10 hover:bg-amber-100/50 transition-colors"
      >
        <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1">
          <Wrench className="h-2.5 w-2.5" />
          {acoes.length} ação(ões) executada(s)
        </span>
        <div className="flex items-center gap-0.5">
          {acoes.map((a, i) => (
            <span key={i}>
              {a.sucesso ? (
                <CheckCircle2 className="h-2.5 w-2.5 text-green-500" />
              ) : (
                <XCircle className="h-2.5 w-2.5 text-red-500" />
              )}
            </span>
          ))}
          <ChevronRight className={`h-2.5 w-2.5 text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </div>
      </button>
      {expanded && (
        <div className="px-2 py-1 space-y-0.5 bg-white dark:bg-gray-900 max-h-40 overflow-y-auto">
          {acoes.map((a, i) => (
            <div key={i} className="flex items-center gap-1 text-[10px]">
              {a.sucesso ? (
                <CheckCircle2 className="h-2.5 w-2.5 text-green-500 shrink-0" />
              ) : (
                <XCircle className="h-2.5 w-2.5 text-red-500 shrink-0" />
              )}
              <span className="font-medium truncate">{TOOL_LABELS[a.tool] || a.tool}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FloatingAgent() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [historico, setHistorico] = useState<ChatMessage[]>([]);
  const [sessaoId] = useState(`floating_${Date.now()}`);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [location] = useLocation();

  // Contexto inteligente da página atual
  const pageContext = useMemo(() => getPageContext(location), [location]);

  // Extrair clienteId e processoId da URL quando estiver na pasta do cliente
  const clienteIdFromUrl = useMemo(() => {
    const match = location.match(/^\/cliente\/(\d+)/);
    return match ? parseInt(match[1]) : undefined;
  }, [location]);

  const chatMutation = trpc.agente.chat.useMutation();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [historico, chatMutation.isPending]);

  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);

  const enviarMensagem = useCallback(async (msgOverride?: string) => {
    const msg = msgOverride || mensagem;
    if (!msg.trim() || chatMutation.isPending) return;

    const novaMensagem: ChatMessage = { role: "user", content: msg };
    const novoHistorico = [...historico, novaMensagem];
    setHistorico(novoHistorico);
    setMensagem("");

    try {
      const result = await chatMutation.mutateAsync({
        mensagem: msg,
        historico: historico.map(h => ({ role: h.role, content: h.content })),
        modo: pageContext.modo,
        sessaoId,
        clienteId: clienteIdFromUrl,
      });
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: result.resposta,
        acoesExecutadas: (result as any).acoesExecutadas || [],
        totalTools: (result as any).totalTools || 0,
      };
      setHistorico([...novoHistorico, assistantMsg]);
      if ((result as any).totalTools > 0) {
        toast.success(`Agente executou ${(result as any).totalTools} ação(ões)`);
      }
    } catch (error: any) {
      setHistorico([
        ...novoHistorico,
        { role: "assistant", content: `Erro: ${error.message || "Tente novamente."}` },
      ]);
    }
  }, [mensagem, historico, chatMutation, sessaoId, pageContext.modo, clienteIdFromUrl]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviarMensagem();
    }
  };

  const limparHistorico = () => {
    setHistorico([]);
    toast.info("Conversa reiniciada");
  };

  // Botão flutuante
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-16 h-16 rounded-full shadow-2xl hover:shadow-amber-500/25 hover:scale-110 transition-all flex items-center justify-center group overflow-hidden"
        title="Agente IA Jurídico — Melo & Preda"
        style={{
          background: 'linear-gradient(135deg, #b8860b 0%, #daa520 50%, #b8860b 100%)',
        }}
      >
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
        <Scale className="h-7 w-7 text-white drop-shadow-md group-hover:hidden relative z-10" />
        <Bot className="h-7 w-7 text-white drop-shadow-md hidden group-hover:block relative z-10" />
        {historico.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 rounded-full text-[10px] flex items-center justify-center font-bold text-white shadow-md z-20">
            {historico.filter(h => h.role === "assistant").length}
          </span>
        )}
        <div className="absolute inset-0 rounded-full border-2 border-white/20" />
      </button>
    );
  }

  const panelWidth = isMaximized ? "w-[650px]" : "w-[420px]";
  const panelHeight = isMaximized ? "h-[700px]" : "h-[560px]";
  const PageIcon = pageContext.icone;

  return (
    <div className={`fixed bottom-6 right-6 z-50 ${panelWidth} ${panelHeight} bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-300`}>
      {/* Header com gradiente dourado */}
      <div className="shrink-0" style={{ background: 'linear-gradient(135deg, #8B6914 0%, #B8860B 40%, #DAA520 70%, #B8860B 100%)' }}>
        <div className="flex items-center justify-between px-4 py-2.5 text-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center backdrop-blur-sm">
              <Scale className="h-4.5 w-4.5" />
            </div>
            <div>
              <h3 className="text-sm font-bold leading-tight tracking-wide">MELO & PREDA</h3>
              <p className="text-[10px] opacity-75 font-medium">Agente IA Jurídico Expert</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={limparHistorico}
              className="p-1.5 hover:bg-white/15 rounded-lg transition-colors"
              title="Nova conversa"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setIsMaximized(!isMaximized)}
              className="p-1.5 hover:bg-white/15 rounded-lg transition-colors"
              title={isMaximized ? "Reduzir" : "Expandir"}
            >
              {isMaximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 hover:bg-white/15 rounded-lg transition-colors"
              title="Fechar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {/* Barra de contexto da página */}
        <div className="px-4 pb-2 flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/10 backdrop-blur-sm">
            <PageIcon className="h-3 w-3 text-white/80" />
            <span className="text-[10px] text-white/80 font-medium">{pageContext.titulo}</span>
          </div>
          {clienteIdFromUrl && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 backdrop-blur-sm">
              <FolderOpen className="h-3 w-3 text-white/80" />
              <span className="text-[10px] text-white/80 font-medium">Cliente #{clienteIdFromUrl}</span>
            </div>
          )}
        </div>
      </div>

      {/* Área de mensagens */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3" ref={scrollRef}>
        {historico.length === 0 && (
          <div className="flex flex-col h-full">
            {/* Boas-vindas */}
            <div className="text-center px-4 pt-3 pb-2">
              <div className="w-12 h-12 rounded-2xl mx-auto mb-2 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #B8860B20, #DAA52030)' }}>
                <Sparkles className="h-6 w-6 text-amber-600" />
              </div>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                {pageContext.descricao}
              </p>
            </div>

            {/* Sugestões inteligentes */}
            <div className="mt-auto px-1 pb-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2 px-1">
                Sugestões para esta página
              </p>
              <div className="space-y-1.5">
                {pageContext.sugestoes.map((sug) => (
                  <button
                    key={sug}
                    onClick={() => enviarMensagem(sug)}
                    className="w-full text-left text-xs px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-900 hover:bg-amber-50 dark:hover:bg-amber-900/20 text-gray-700 dark:text-gray-300 hover:text-amber-800 dark:hover:text-amber-400 transition-all border border-transparent hover:border-amber-200 dark:hover:border-amber-800/50 flex items-center gap-2"
                  >
                    <Zap className="h-3 w-3 text-amber-500 shrink-0" />
                    <span>{sug}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {historico.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'linear-gradient(135deg, #B8860B20, #DAA52030)' }}>
                <Scale className="h-3.5 w-3.5 text-amber-700" />
              </div>
            )}
            <div className={`max-w-[85%] ${msg.role === "user"
              ? "rounded-2xl rounded-br-sm px-3 py-2 text-white"
              : "bg-gray-50 dark:bg-gray-900 rounded-2xl rounded-bl-sm px-3 py-2"
            }`}
            style={msg.role === "user" ? { background: 'linear-gradient(135deg, #B8860B, #DAA520)' } : undefined}
            >
              {msg.role === "assistant" ? (
                <div className="text-xs prose prose-sm dark:prose-invert max-w-none [&_p]:my-0.5 [&_ul]:my-0.5 [&_li]:my-0 [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs">
                  <Streamdown>{msg.content}</Streamdown>
                </div>
              ) : (
                <p className="text-xs">{msg.content}</p>
              )}
              {msg.acoesExecutadas && msg.acoesExecutadas.length > 0 && (
                <MiniToolActions acoes={msg.acoesExecutadas} />
              )}
            </div>
            {msg.role === "user" && (
              <div className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0 mt-0.5">
                <User className="h-3.5 w-3.5 text-gray-500" />
              </div>
            )}
          </div>
        ))}

        {chatMutation.isPending && (
          <div className="flex gap-2 items-start">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, #B8860B20, #DAA52030)' }}>
              <Scale className="h-3.5 w-3.5 text-amber-700" />
            </div>
            <div className="bg-gray-50 dark:bg-gray-900 rounded-2xl rounded-bl-sm px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600" />
                <span className="text-xs text-muted-foreground">Analisando e executando...</span>
              </div>
              <div className="flex gap-1 mt-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="shrink-0 border-t border-gray-100 dark:border-gray-800 p-3 bg-gray-50/50 dark:bg-gray-900/50">
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Comando para o Agente (${pageContext.titulo})...`}
            className="min-h-[40px] max-h-[100px] text-xs resize-none flex-1 rounded-xl border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 focus:border-amber-400 focus:ring-amber-400/20"
            rows={1}
          />
          <Button
            onClick={() => enviarMensagem()}
            disabled={!mensagem.trim() || chatMutation.isPending}
            size="sm"
            className="h-10 w-10 rounded-xl shrink-0 text-white shadow-md hover:shadow-lg transition-all"
            style={{ background: 'linear-gradient(135deg, #B8860B, #DAA520)' }}
          >
            {chatMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <div className="flex items-center justify-between mt-1.5 px-1">
          <span className="text-[9px] text-muted-foreground">
            Enter para enviar · Shift+Enter para nova linha
          </span>
          <span className="text-[9px] text-amber-600/70 font-medium">
            Modo: {pageContext.modo.toUpperCase()}
          </span>
        </div>
      </div>
    </div>
  );
}
