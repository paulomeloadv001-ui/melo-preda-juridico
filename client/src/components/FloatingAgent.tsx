import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Bot, Send, X, Minimize2, Maximize2, Loader2, User,
  Wrench, CheckCircle2, XCircle, ChevronRight, Sparkles,
  MessageSquare, Scale
} from "lucide-react";
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
};

function MiniToolActions({ acoes }: { acoes: ToolAction[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!acoes || acoes.length === 0) return null;

  return (
    <div className="mt-1.5 border border-amber-200 dark:border-amber-800 rounded overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-2 py-1 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 transition-colors"
      >
        <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1">
          <Wrench className="h-2.5 w-2.5" />
          {acoes.length} ação(es)
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
        <div className="px-2 py-1 space-y-0.5 bg-white dark:bg-gray-900 max-h-32 overflow-y-auto">
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

  const enviarMensagem = useCallback(async () => {
    if (!mensagem.trim() || chatMutation.isPending) return;

    const novaMensagem: ChatMessage = { role: "user", content: mensagem };
    const novoHistorico = [...historico, novaMensagem];
    setHistorico(novoHistorico);
    setMensagem("");

    try {
      const result = await chatMutation.mutateAsync({
        mensagem: mensagem,
        historico: historico.map(h => ({ role: h.role, content: h.content })),
        modo: "chat",
        sessaoId,
      });
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: result.resposta,
        acoesExecutadas: (result as any).acoesExecutadas || [],
        totalTools: (result as any).totalTools || 0,
      };
      setHistorico([...novoHistorico, assistantMsg]);
      if ((result as any).totalTools > 0) {
        toast.success(`Agente executou ${(result as any).totalTools} ações`);
      }
    } catch (error: any) {
      setHistorico([
        ...novoHistorico,
        { role: "assistant", content: `Erro: ${error.message || "Tente novamente."}` },
      ]);
    }
  }, [mensagem, historico, chatMutation, sessaoId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviarMensagem();
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-amber-500 to-amber-700 text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center group"
        title="Agente IA Jurídico"
      >
        <Scale className="h-6 w-6 group-hover:hidden" />
        <Bot className="h-6 w-6 hidden group-hover:block" />
        {historico.length > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[10px] flex items-center justify-center font-bold">
            {historico.filter(h => h.role === "assistant").length}
          </span>
        )}
      </button>
    );
  }

  const panelWidth = isMaximized ? "w-[600px]" : "w-[380px]";
  const panelHeight = isMaximized ? "h-[600px]" : "h-[480px]";

  return (
    <div className={`fixed bottom-6 right-6 z-50 ${panelWidth} ${panelHeight} bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-200`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-amber-600 to-amber-800 text-white shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          <div>
            <h3 className="text-sm font-bold leading-tight">Agente IA Executor</h3>
            <p className="text-[10px] opacity-80">Melo & Preda Advogados</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMaximized(!isMaximized)}
            className="p-1 hover:bg-white/20 rounded transition-colors"
            title={isMaximized ? "Minimizar" : "Maximizar"}
          >
            {isMaximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 hover:bg-white/20 rounded transition-colors"
            title="Fechar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3" ref={scrollRef}>
        {historico.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <Sparkles className="h-10 w-10 text-amber-500 mb-3" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Agente IA com habilidades completas
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Analiso processos, gero petições, busco dados, corrijo duplicados e executo qualquer ação no sistema.
            </p>
            <div className="flex flex-wrap gap-1.5 mt-3 justify-center">
              {[
                "Diagnóstico do banco",
                "Buscar duplicados",
                "Analisar processo",
              ].map((sug) => (
                <button
                  key={sug}
                  onClick={() => {
                    setMensagem(sug);
                    setTimeout(() => enviarMensagem(), 100);
                  }}
                  className="text-[10px] px-2 py-1 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 transition-colors border border-amber-200 dark:border-amber-800"
                >
                  {sug}
                </button>
              ))}
            </div>
          </div>
        )}

        {historico.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="h-3.5 w-3.5 text-amber-700" />
              </div>
            )}
            <div className={`max-w-[85%] ${msg.role === "user"
              ? "bg-amber-600 text-white rounded-2xl rounded-br-sm px-3 py-2"
              : "bg-gray-100 dark:bg-gray-900 rounded-2xl rounded-bl-sm px-3 py-2"
            }`}>
              {msg.role === "assistant" ? (
                <div className="text-xs prose prose-sm dark:prose-invert max-w-none [&_p]:my-0.5 [&_ul]:my-0.5 [&_li]:my-0">
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
              <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center shrink-0 mt-0.5">
                <User className="h-3.5 w-3.5" />
              </div>
            )}
          </div>
        ))}

        {chatMutation.isPending && (
          <div className="flex gap-2 items-start">
            <div className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
              <Bot className="h-3.5 w-3.5 text-amber-700" />
            </div>
            <div className="bg-gray-100 dark:bg-gray-900 rounded-2xl rounded-bl-sm px-3 py-2">
              <div className="flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin text-amber-600" />
                <span className="text-xs text-muted-foreground">Executando...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-gray-200 dark:border-gray-800 p-2.5">
        <div className="flex gap-1.5">
          <Textarea
            ref={textareaRef}
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pergunte ao agente..."
            className="min-h-[36px] max-h-[80px] text-xs resize-none flex-1 rounded-xl border-gray-300 dark:border-gray-700"
            rows={1}
          />
          <Button
            onClick={enviarMensagem}
            disabled={!mensagem.trim() || chatMutation.isPending}
            size="sm"
            className="h-9 w-9 rounded-xl bg-amber-600 hover:bg-amber-700 shrink-0"
          >
            {chatMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
