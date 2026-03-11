import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useState } from "react";
import {
  AlertTriangle, CheckCircle, RefreshCw, Merge, Shield, FileSearch,
  Users, Scale, XCircle, Info, ChevronDown, ChevronUp, ExternalLink,
  AlertCircle, Database, FileText, DollarSign, Eye, Play, Clock,
  Activity, TrendingUp, Zap, History, BarChart3, ArrowRight
} from "lucide-react";
import { Link } from "wouter";

type Severidade = 'critico' | 'alerta' | 'info';

const severidadeConfig: Record<Severidade, { label: string; color: string; bg: string; icon: typeof AlertTriangle }> = {
  critico: { label: 'Crítico', color: 'text-red-600', bg: 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800', icon: XCircle },
  alerta: { label: 'Alerta', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800', icon: AlertTriangle },
  info: { label: 'Informativo', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800', icon: Info },
};

const categoriaIcons: Record<string, typeof Database> = {
  'Dados Cadastrais': Users,
  'Duplicidades': Merge,
  'Processos': Scale,
  'Dados Financeiros': DollarSign,
  'Documentos': FileText,
};

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 80 ? 'text-green-500' : score >= 60 ? 'text-amber-500' : 'text-red-500';
  const bgColor = score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-amber-500' : 'bg-red-500';
  const label = score >= 80 ? 'Excelente' : score >= 60 ? 'Regular' : 'Crítico';
  const circumference = 2 * Math.PI * 45;
  const dashOffset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-32 h-32">
        <svg className="w-32 h-32 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/20" />
          <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="8"
            className={color}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1s ease-in-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-3xl font-bold ${color}`}>{score}</span>
          <span className="text-xs text-muted-foreground">/100</span>
        </div>
      </div>
      <span className={`text-sm font-semibold px-3 py-1 rounded-full ${bgColor}/10 ${color}`}>{label}</span>
    </div>
  );
}

export default function Correcao() {
  const [activeTab, setActiveTab] = useState<'painel' | 'auditoria' | 'diagnostico' | 'merge' | 'historico'>('painel');
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [filtroSeveridade, setFiltroSeveridade] = useState<Severidade | 'todos'>('todos');
  const [executandoTodas, setExecutandoTodas] = useState(false);
  const [resultadoCorrecao, setResultadoCorrecao] = useState<any>(null);

  // Queries e mutations
  const diagnostico = trpc.correcao.diagnostico.useQuery();
  const auditoria = trpc.correcao.auditoriaCompleta.useQuery();
  const scoreSaude = trpc.correcao.scoreSaude.useQuery();
  const historico = trpc.correcao.historico.useQuery();

  const normalizarCpfs = trpc.correcao.normalizarCpfs.useMutation({
    onSuccess: (data) => { toast.success(`${data.corrigidos} CPFs normalizados`); refetchAll(); },
    onError: (e) => toast.error(e.message),
  });
  const autoMerge = trpc.correcao.autoMerge.useMutation({
    onSuccess: (data) => { toast.success(`${data.totalMerges} clientes unificados`); refetchAll(); },
    onError: (e) => toast.error(e.message),
  });
  const deduplicarProcessos = trpc.correcao.deduplicarProcessos.useMutation({
    onSuccess: (data) => { toast.success(`${data.processosRemovidos} processos duplicados removidos`); refetchAll(); },
    onError: (e) => toast.error(e.message),
  });
  const executarTodas = trpc.correcao.executarTodasCorrecoes.useMutation({
    onSuccess: (data) => {
      setExecutandoTodas(false);
      setResultadoCorrecao(data);
      toast.success(`Correção completa: ${data.totalAfetados} itens corrigidos`);
      refetchAll();
    },
    onError: (e) => { setExecutandoTodas(false); toast.error(e.message); },
  });
  const mergeClientes = trpc.correcao.mergeClientes.useMutation({
    onSuccess: (data) => { toast.success(`Merge realizado: ${data.mantido.nome} mantido, ${data.removido.nome} removido`); refetchAll(); },
    onError: (e) => toast.error(e.message),
  });
  const atualizarCpf = trpc.correcao.atualizarCpf.useMutation({
    onSuccess: (data) => { toast.success(`CPF atualizado para ${data.cpfAtualizado}`); refetchAll(); setCpfEdit({}); },
    onError: (e) => toast.error(e.message),
  });

  const refetchAll = () => {
    diagnostico.refetch();
    auditoria.refetch();
    scoreSaude.refetch();
    historico.refetch();
  };

  const [cpfEdit, setCpfEdit] = useState<Record<number, string>>({});
  const [mergeIds, setMergeIds] = useState<{ manter: number; remover: number }>({ manter: 0, remover: 0 });

  const toggleCat = (cat: string) => {
    const next = new Set(expandedCats);
    if (next.has(cat)) next.delete(cat); else next.add(cat);
    setExpandedCats(next);
  };

  const aud = auditoria.data;
  const errosFiltrados = filtroSeveridade === 'todos'
    ? (aud?.erros || [])
    : (aud?.erros || []).filter(e => e.severidade === filtroSeveridade);

  const errosPorCategoria = errosFiltrados.reduce((acc, e) => {
    if (!acc[e.categoria]) acc[e.categoria] = [];
    acc[e.categoria].push(e);
    return acc;
  }, {} as Record<string, typeof errosFiltrados>);

  const diagData = diagnostico.data;
  const totalDiag = (diagData?.duplicados?.length || 0) + (diagData?.semCpf?.length || 0) + (diagData?.processosOrfaos?.length || 0);
  const scoreData = scoreSaude.data;
  const histData = historico.data || [];

  const tabs = [
    { id: 'painel' as const, label: 'Painel de Controle', icon: Activity },
    { id: 'auditoria' as const, label: 'Auditoria Completa', icon: Eye, badge: aud?.resumo?.total },
    { id: 'diagnostico' as const, label: 'Correção Rápida', icon: Shield, badge: totalDiag },
    { id: 'merge' as const, label: 'Merge Manual', icon: Merge },
    { id: 'historico' as const, label: 'Histórico', icon: History, badge: histData.length },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="h-6 w-6 text-amber-500" />
            Correção e Auditoria
          </h1>
          <p className="text-muted-foreground mt-1">
            Painel inteligente de detecção e correção automática de dados
          </p>
        </div>
        <Button variant="outline" onClick={refetchAll} disabled={diagnostico.isLoading || auditoria.isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${(diagnostico.isLoading || auditoria.isLoading) ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b pb-0 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-amber-500 text-amber-600'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === tab.id ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' : 'bg-muted text-muted-foreground'
              }`}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ==================== ABA PAINEL DE CONTROLE ==================== */}
      {activeTab === 'painel' && (
        <div className="space-y-6">
          {/* Score de Saúde + Resumo */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Score Gauge */}
            <Card className="lg:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-amber-500" />
                  Score de Saúde dos Dados
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center py-4">
                {scoreData ? (
                  <ScoreGauge score={scoreData.score} />
                ) : (
                  <div className="w-32 h-32 rounded-full border-8 border-muted animate-pulse" />
                )}
              </CardContent>
            </Card>

            {/* Detalhes do Score */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-amber-500" />
                  Detalhamento por Categoria
                </CardTitle>
                <CardDescription>Cada categoria contribui com um peso diferente para o score total</CardDescription>
              </CardHeader>
              <CardContent>
                {scoreData?.detalhes && (
                  <div className="space-y-2.5">
                    {[
                      { key: 'cpfsValidos', label: 'CPFs Válidos', icon: Users },
                      { key: 'semDuplicados', label: 'Sem Duplicados', icon: Merge },
                      { key: 'contato', label: 'Dados de Contato', icon: Users },
                      { key: 'financeiro', label: 'Dados Financeiros', icon: DollarSign },
                      { key: 'movimentacoes', label: 'Movimentações', icon: Activity },
                      { key: 'estrategias', label: 'Estratégias', icon: Scale },
                      { key: 'documentos', label: 'Documentos', icon: FileText },
                      { key: 'cnjsValidos', label: 'CNJs Válidos', icon: FileSearch },
                      { key: 'valorCausa', label: 'Valor da Causa', icon: DollarSign },
                      { key: 'endereco', label: 'Endereços', icon: Users },
                    ].map(({ key, label, icon: Icon }) => {
                      const d = (scoreData.detalhes as any)[key];
                      if (!d) return null;
                      const pct = d.peso > 0 ? (d.score / d.peso) * 100 : 0;
                      const barColor = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
                      return (
                        <div key={key} className="flex items-center gap-3">
                          <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="text-sm w-36 flex-shrink-0 truncate">{label}</span>
                          <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs font-mono text-muted-foreground w-16 text-right flex-shrink-0">
                            {d.score}/{d.peso}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Botão Executar Todas as Correções */}
          <Card className="border-amber-500/30 bg-gradient-to-r from-amber-50/50 to-orange-50/50 dark:from-amber-950/20 dark:to-orange-950/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-xl bg-amber-500/10 flex items-center justify-center">
                    <Zap className="h-7 w-7 text-amber-500" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">Executar Todas as Correções</h3>
                    <p className="text-sm text-muted-foreground">Normalizar CPFs → Auto-Merge Duplicados → Deduplicar Processos</p>
                  </div>
                </div>
                <Button
                  size="lg"
                  className="bg-amber-500 hover:bg-amber-600 text-white gap-2"
                  onClick={() => { setExecutandoTodas(true); setResultadoCorrecao(null); executarTodas.mutate(); }}
                  disabled={executandoTodas || executarTodas.isPending}
                >
                  {executandoTodas ? (
                    <><RefreshCw className="h-5 w-5 animate-spin" /> Executando...</>
                  ) : (
                    <><Play className="h-5 w-5" /> Executar Agora</>
                  )}
                </Button>
              </div>

              {/* Pipeline visual */}
              {executandoTodas && (
                <div className="mt-6 flex items-center justify-center gap-2">
                  {['Normalizar CPFs', 'Auto-Merge', 'Deduplicar'].map((step, i) => (
                    <div key={step} className="flex items-center gap-2">
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800">
                        <RefreshCw className="h-4 w-4 animate-spin text-amber-600" />
                        <span className="text-sm font-medium text-amber-700 dark:text-amber-300">{step}</span>
                      </div>
                      {i < 2 && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  ))}
                </div>
              )}

              {/* Resultado da correção */}
              {resultadoCorrecao && (
                <div className="mt-6 space-y-3">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <span className="font-semibold text-green-700 dark:text-green-400">
                      Correção concluída — {resultadoCorrecao.totalAfetados} itens corrigidos
                    </span>
                  </div>
                  {resultadoCorrecao.resultados?.map((r: any, i: number) => (
                    <div key={i} className={`flex items-center gap-3 p-3 rounded-lg border ${
                      r.status === 'sucesso' ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800' :
                      'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800'
                    }`}>
                      {r.status === 'sucesso' ? (
                        <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                      )}
                      <div className="flex-1">
                        <p className="font-semibold text-sm">{r.etapa}</p>
                        <p className="text-xs text-muted-foreground">{r.detalhes}</p>
                      </div>
                      <span className="text-sm font-mono font-bold">{r.itensAfetados}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cards de Ações Individuais */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="hover:border-blue-500/50 transition-colors">
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <CheckCircle className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Normalizar CPFs</h3>
                    <p className="text-xs text-muted-foreground">Remove pontos, traços e barras</p>
                  </div>
                </div>
                <Button onClick={() => normalizarCpfs.mutate()} disabled={normalizarCpfs.isPending} className="w-full" variant="outline">
                  {normalizarCpfs.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                  Executar
                </Button>
              </CardContent>
            </Card>
            <Card className="hover:border-purple-500/50 transition-colors">
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                    <Merge className="h-5 w-5 text-purple-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Auto-Merge</h3>
                    <p className="text-xs text-muted-foreground">Unifica clientes com mesmo CPF</p>
                  </div>
                </div>
                <Button onClick={() => autoMerge.mutate()} disabled={autoMerge.isPending} className="w-full" variant="outline">
                  {autoMerge.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                  Executar
                </Button>
              </CardContent>
            </Card>
            <Card className="hover:border-orange-500/50 transition-colors">
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                    <FileSearch className="h-5 w-5 text-orange-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Deduplicar Processos</h3>
                    <p className="text-xs text-muted-foreground">Remove processos com CNJ duplicado</p>
                  </div>
                </div>
                <Button onClick={() => deduplicarProcessos.mutate()} disabled={deduplicarProcessos.isPending} className="w-full" variant="outline">
                  {deduplicarProcessos.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                  Executar
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Últimas Correções */}
          {histData.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  Últimas Correções
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {histData.slice(0, 5).map((h: any) => (
                    <div key={h.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20">
                      {h.status === 'sucesso' ? (
                        <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                      ) : h.status === 'parcial' ? (
                        <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                      )}
                      <div className="flex-1">
                        <p className="text-sm font-medium">{h.acao}</p>
                        <p className="text-xs text-muted-foreground">{new Date(h.createdAt).toLocaleString('pt-BR')}</p>
                      </div>
                      <span className="text-sm font-mono">{h.itensAfetados} itens</span>
                    </div>
                  ))}
                </div>
                {histData.length > 5 && (
                  <Button variant="ghost" className="w-full mt-3 text-sm" onClick={() => setActiveTab('historico')}>
                    Ver histórico completo <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ==================== ABA AUDITORIA COMPLETA ==================== */}
      {activeTab === 'auditoria' && (
        <div className="space-y-6">
          {/* Resumo de Saúde */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="border-l-4 border-l-foreground/20 cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => setFiltroSeveridade('todos')}>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <Database className={`h-8 w-8 ${filtroSeveridade === 'todos' ? 'text-amber-500' : 'text-muted-foreground'}`} />
                  <div>
                    <p className="text-2xl font-bold">{aud?.resumo?.total || 0}</p>
                    <p className="text-sm text-muted-foreground">Total de Problemas</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className={`border-l-4 border-l-red-500 cursor-pointer hover:bg-muted/30 transition-colors ${filtroSeveridade === 'critico' ? 'ring-2 ring-red-500/30' : ''}`}
              onClick={() => setFiltroSeveridade(filtroSeveridade === 'critico' ? 'todos' : 'critico')}>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <XCircle className="h-8 w-8 text-red-500" />
                  <div>
                    <p className="text-2xl font-bold">{aud?.resumo?.criticos || 0}</p>
                    <p className="text-sm text-muted-foreground">Críticos</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className={`border-l-4 border-l-amber-500 cursor-pointer hover:bg-muted/30 transition-colors ${filtroSeveridade === 'alerta' ? 'ring-2 ring-amber-500/30' : ''}`}
              onClick={() => setFiltroSeveridade(filtroSeveridade === 'alerta' ? 'todos' : 'alerta')}>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-8 w-8 text-amber-500" />
                  <div>
                    <p className="text-2xl font-bold">{aud?.resumo?.alertas || 0}</p>
                    <p className="text-sm text-muted-foreground">Alertas</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className={`border-l-4 border-l-blue-500 cursor-pointer hover:bg-muted/30 transition-colors ${filtroSeveridade === 'info' ? 'ring-2 ring-blue-500/30' : ''}`}
              onClick={() => setFiltroSeveridade(filtroSeveridade === 'info' ? 'todos' : 'info')}>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <Info className="h-8 w-8 text-blue-500" />
                  <div>
                    <p className="text-2xl font-bold">{aud?.resumo?.info || 0}</p>
                    <p className="text-sm text-muted-foreground">Informativos</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {(aud?.resumo?.total || 0) === 0 && !auditoria.isLoading && (
            <Card className="border-green-500/30 bg-green-500/5">
              <CardContent className="pt-6 flex items-center gap-3">
                <CheckCircle className="h-8 w-8 text-green-500" />
                <div>
                  <p className="font-semibold text-green-700 dark:text-green-400">Plataforma saudável</p>
                  <p className="text-sm text-muted-foreground">Nenhum problema detectado. Todos os dados estão consistentes e completos.</p>
                </div>
              </CardContent>
            </Card>
          )}

          {Object.entries(errosPorCategoria).map(([categoria, erros]) => {
            const CatIcon = categoriaIcons[categoria] || Database;
            const isExpanded = expandedCats.has(categoria);
            const criticos = erros.filter(e => e.severidade === 'critico').length;
            const alertas = erros.filter(e => e.severidade === 'alerta').length;
            const infos = erros.filter(e => e.severidade === 'info').length;

            return (
              <Card key={categoria}>
                <CardHeader
                  className="cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => toggleCat(categoria)}
                >
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <CatIcon className="h-5 w-5 text-amber-500" />
                      {categoria}
                      <span className="text-sm font-normal text-muted-foreground">({erros.length} {erros.length === 1 ? 'problema' : 'problemas'})</span>
                    </CardTitle>
                    <div className="flex items-center gap-3">
                      <div className="flex gap-2 text-xs">
                        {criticos > 0 && <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">{criticos} crítico{criticos > 1 ? 's' : ''}</span>}
                        {alertas > 0 && <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">{alertas} alerta{alertas > 1 ? 's' : ''}</span>}
                        {infos > 0 && <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">{infos} info{infos > 1 ? 's' : ''}</span>}
                      </div>
                      {isExpanded ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
                    </div>
                  </div>
                </CardHeader>
                {isExpanded && (
                  <CardContent className="space-y-3 pt-0">
                    {erros.map((erro) => {
                      const config = severidadeConfig[erro.severidade as Severidade];
                      const SevIcon = config.icon;
                      return (
                        <div key={erro.id} className={`border rounded-lg p-4 ${config.bg}`}>
                          <div className="flex items-start gap-3">
                            <SevIcon className={`h-5 w-5 mt-0.5 flex-shrink-0 ${config.color}`} />
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center justify-between">
                                <h4 className="font-semibold text-sm">{erro.titulo}</h4>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  erro.severidade === 'critico' ? 'bg-red-200 text-red-800 dark:bg-red-800 dark:text-red-200' :
                                  erro.severidade === 'alerta' ? 'bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-200' :
                                  'bg-blue-200 text-blue-800 dark:bg-blue-800 dark:text-blue-200'
                                }`}>
                                  {config.label}
                                </span>
                              </div>
                              <p className="text-sm text-muted-foreground">{erro.descricao}</p>
                              <div className="flex items-center justify-between pt-1">
                                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                  <AlertCircle className="h-3 w-3" />
                                  Ação: {erro.acao}
                                </p>
                                {erro.entidadeId && erro.entidade === 'cliente' && (
                                  <Link href={`/cliente/${erro.entidadeId}`}>
                                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                                      <ExternalLink className="h-3 w-3" />
                                      Ver Cliente
                                    </Button>
                                  </Link>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ==================== ABA DIAGNÓSTICO RÁPIDO ==================== */}
      {activeTab === 'diagnostico' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className={`border-l-4 ${(diagData?.duplicados?.length || 0) > 0 ? "border-l-red-500" : "border-l-green-500"}`}>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <Users className={`h-8 w-8 ${(diagData?.duplicados?.length || 0) > 0 ? "text-red-500" : "text-green-500"}`} />
                  <div>
                    <p className="text-2xl font-bold">{diagData?.duplicados?.length || 0}</p>
                    <p className="text-sm text-muted-foreground">CPFs Duplicados</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className={`border-l-4 ${(diagData?.semCpf?.length || 0) > 0 ? "border-l-amber-500" : "border-l-green-500"}`}>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle className={`h-8 w-8 ${(diagData?.semCpf?.length || 0) > 0 ? "text-amber-500" : "text-green-500"}`} />
                  <div>
                    <p className="text-2xl font-bold">{diagData?.semCpf?.length || 0}</p>
                    <p className="text-sm text-muted-foreground">Clientes sem CPF</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className={`border-l-4 ${(diagData?.processosOrfaos?.length || 0) > 0 ? "border-l-orange-500" : "border-l-green-500"}`}>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <Scale className={`h-8 w-8 ${(diagData?.processosOrfaos?.length || 0) > 0 ? "text-orange-500" : "text-green-500"}`} />
                  <div>
                    <p className="text-2xl font-bold">{diagData?.processosOrfaos?.length || 0}</p>
                    <p className="text-sm text-muted-foreground">Processos Duplicados</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {totalDiag === 0 && !diagnostico.isLoading && (
            <Card className="border-green-500/30 bg-green-500/5">
              <CardContent className="pt-6 flex items-center gap-3">
                <CheckCircle className="h-8 w-8 text-green-500" />
                <div>
                  <p className="font-semibold text-green-700 dark:text-green-400">Banco de dados limpo</p>
                  <p className="text-sm text-muted-foreground">Nenhuma duplicidade ou inconsistência encontrada.</p>
                </div>
              </CardContent>
            </Card>
          )}

          {(diagData?.semCpf?.length || 0) > 0 && (
            <Card className="border-amber-500/30">
              <CardHeader>
                <CardTitle className="text-amber-600 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Clientes sem CPF Válido ({diagData?.semCpf?.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {diagData?.semCpf?.map((cli) => (
                  <div key={cli.id} className="flex items-center gap-3 border rounded-lg p-3">
                    <div className="flex-1">
                      <p className="font-semibold text-sm">ID {cli.id} — {cli.nome}</p>
                      <p className="text-xs text-muted-foreground">CPF atual: {cli.cpfAtual}</p>
                    </div>
                    <Input
                      placeholder="Novo CPF"
                      className="w-48"
                      value={cpfEdit[cli.id] || ""}
                      onChange={(e) => setCpfEdit({ ...cpfEdit, [cli.id]: e.target.value })}
                    />
                    <Button size="sm" onClick={() => {
                      if (!cpfEdit[cli.id]) return toast.error("Digite o CPF");
                      atualizarCpf.mutate({ clienteId: cli.id, novoCpf: cpfEdit[cli.id] });
                    }} disabled={atualizarCpf.isPending}>
                      Salvar
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {(diagData?.duplicados?.length || 0) > 0 && (
            <Card className="border-red-500/30">
              <CardHeader>
                <CardTitle className="text-red-600 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Clientes com CPF Duplicado ({diagData?.duplicados?.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {diagData?.duplicados?.map((dup, i) => (
                  <div key={i} className="border rounded-lg p-4 space-y-2">
                    <p className="font-mono text-sm font-semibold">CPF: {dup.cpfNormalizado}</p>
                    {dup.clientes.map((cli) => (
                      <div key={cli.id} className="flex items-center justify-between bg-muted/50 rounded p-2 text-sm">
                        <span>ID {cli.id} — <strong>{cli.nome}</strong></span>
                      </div>
                    ))}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {(diagData?.processosOrfaos?.length || 0) > 0 && (
            <Card className="border-orange-500/30">
              <CardHeader>
                <CardTitle className="text-orange-600 flex items-center gap-2">
                  <Scale className="h-5 w-5" />
                  Processos com CNJ Duplicado ({diagData?.processosOrfaos?.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {diagData?.processosOrfaos?.map((dup, i) => (
                  <div key={i} className="border rounded-lg p-3 space-y-1">
                    <p className="font-mono text-sm font-semibold">CNJ: {dup.numeroCnj}</p>
                    {dup.processos.map((p) => (
                      <div key={p.id} className="text-sm bg-muted/50 rounded p-2">
                        ID {p.id} — Cliente ID {p.clienteId} — {p.tipoAcao} — Fase: {p.fase}
                      </div>
                    ))}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ==================== ABA MERGE MANUAL ==================== */}
      {activeTab === 'merge' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Merge className="h-5 w-5" />
                Merge Manual de Clientes
              </CardTitle>
              <CardDescription>
                Informe os IDs dos clientes para unificar manualmente. O cliente "Manter" receberá todos os processos e dados do cliente "Remover".
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">ID Manter</label>
                  <Input type="number" placeholder="ID do cliente a manter" value={mergeIds.manter || ""} onChange={(e) => setMergeIds({ ...mergeIds, manter: parseInt(e.target.value) || 0 })} />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">ID Remover</label>
                  <Input type="number" placeholder="ID do cliente a remover" value={mergeIds.remover || ""} onChange={(e) => setMergeIds({ ...mergeIds, remover: parseInt(e.target.value) || 0 })} />
                </div>
                <Button onClick={() => {
                  if (!mergeIds.manter || !mergeIds.remover) return toast.error("Informe ambos os IDs");
                  mergeClientes.mutate({ manterClienteId: mergeIds.manter, removerClienteId: mergeIds.remover });
                }} disabled={mergeClientes.isPending}>
                  {mergeClientes.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Merge className="h-4 w-4 mr-2" />}
                  Executar Merge
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-blue-500/20 bg-blue-50/30 dark:bg-blue-950/10">
            <CardContent className="pt-6">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Info className="h-4 w-4 text-blue-500" />
                Como usar o Merge Manual
              </h3>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p><strong>1.</strong> Identifique os IDs dos clientes duplicados na aba "Correção Rápida" ou "Auditoria Completa".</p>
                <p><strong>2.</strong> No campo "ID Manter", insira o ID do cliente que deseja preservar (geralmente o mais antigo ou com dados mais completos).</p>
                <p><strong>3.</strong> No campo "ID Remover", insira o ID do cliente duplicado que será excluído.</p>
                <p><strong>4.</strong> Clique em "Executar Merge". O sistema moverá todos os processos, dados financeiros, empréstimos e documentos para o cliente mantido.</p>
                <p><strong>5.</strong> Campos vazios do cliente mantido serão preenchidos com dados do cliente removido, se disponíveis.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ==================== ABA HISTÓRICO ==================== */}
      {activeTab === 'historico' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5 text-amber-500" />
                Histórico de Correções
              </CardTitle>
              <CardDescription>
                Registro de todas as correções automáticas e manuais executadas no sistema
              </CardDescription>
            </CardHeader>
            <CardContent>
              {histData.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">Nenhuma correção executada ainda</p>
                  <p className="text-sm mt-1">Execute correções no Painel de Controle para ver o histórico aqui.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {histData.map((h: any) => (
                    <div key={h.id} className="border rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {h.status === 'sucesso' ? (
                            <CheckCircle className="h-5 w-5 text-green-500" />
                          ) : h.status === 'parcial' ? (
                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                          ) : (
                            <XCircle className="h-5 w-5 text-red-500" />
                          )}
                          <div>
                            <p className="font-semibold text-sm">{h.acao}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(h.createdAt).toLocaleString('pt-BR')} — {h.executadoPor || 'Sistema'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            h.status === 'sucesso' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                            h.status === 'parcial' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' :
                            'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                          }`}>
                            {h.status === 'sucesso' ? 'Sucesso' : h.status === 'parcial' ? 'Parcial' : 'Erro'}
                          </span>
                          <span className="text-sm font-mono font-bold">{h.itensAfetados} itens</span>
                        </div>
                      </div>
                      {h.detalhes && (
                        <div className="bg-muted/30 rounded p-3 text-xs text-muted-foreground whitespace-pre-wrap">
                          {h.detalhes}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
