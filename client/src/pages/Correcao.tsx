import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useState } from "react";
import {
  AlertTriangle, CheckCircle, RefreshCw, Merge, Shield, FileSearch,
  Users, Scale, XCircle, Info, ChevronDown, ChevronUp, ExternalLink,
  AlertCircle, Database, FileText, DollarSign, Eye
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

export default function Correcao() {
  const [activeTab, setActiveTab] = useState<'auditoria' | 'diagnostico' | 'merge'>('auditoria');
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [filtroSeveridade, setFiltroSeveridade] = useState<Severidade | 'todos'>('todos');

  // Queries e mutations
  const diagnostico = trpc.correcao.diagnostico.useQuery();
  const auditoria = trpc.correcao.auditoriaCompleta.useQuery();
  const normalizarCpfs = trpc.correcao.normalizarCpfs.useMutation({
    onSuccess: (data) => { toast.success(`${data.corrigidos} CPFs normalizados`); diagnostico.refetch(); auditoria.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const autoMerge = trpc.correcao.autoMerge.useMutation({
    onSuccess: (data) => { toast.success(`${data.totalMerges} clientes unificados`); diagnostico.refetch(); auditoria.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const deduplicarProcessos = trpc.correcao.deduplicarProcessos.useMutation({
    onSuccess: (data) => { toast.success(`${data.processosRemovidos} processos duplicados removidos`); diagnostico.refetch(); auditoria.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const mergeClientes = trpc.correcao.mergeClientes.useMutation({
    onSuccess: (data) => { toast.success(`Merge realizado: ${data.mantido.nome} mantido, ${data.removido.nome} removido`); diagnostico.refetch(); auditoria.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const atualizarCpf = trpc.correcao.atualizarCpf.useMutation({
    onSuccess: (data) => { toast.success(`CPF atualizado para ${data.cpfAtualizado}`); diagnostico.refetch(); auditoria.refetch(); setCpfEdit({}); },
    onError: (e) => toast.error(e.message),
  });

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

  // Agrupar erros por categoria
  const errosPorCategoria = errosFiltrados.reduce((acc, e) => {
    if (!acc[e.categoria]) acc[e.categoria] = [];
    acc[e.categoria].push(e);
    return acc;
  }, {} as Record<string, typeof errosFiltrados>);

  const diagData = diagnostico.data;
  const totalDiag = (diagData?.duplicados?.length || 0) + (diagData?.semCpf?.length || 0) + (diagData?.processosOrfaos?.length || 0);

  const tabs = [
    { id: 'auditoria' as const, label: 'Auditoria Completa', icon: Eye, badge: aud?.resumo?.total },
    { id: 'diagnostico' as const, label: 'Correção Rápida', icon: Shield, badge: totalDiag },
    { id: 'merge' as const, label: 'Merge Manual', icon: Merge },
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
            Painel inteligente de detecção e correção de todos os erros da plataforma
          </p>
        </div>
        <Button variant="outline" onClick={() => { diagnostico.refetch(); auditoria.refetch(); }} disabled={diagnostico.isLoading || auditoria.isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${(diagnostico.isLoading || auditoria.isLoading) ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
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

          {/* Saúde OK */}
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

          {/* Erros por Categoria */}
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

          {/* Ações Rápidas de Correção */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5" />
                Ações Automáticas de Correção
              </CardTitle>
              <CardDescription>
                Execute correções em massa. Cada ação é segura e preserva os dados mais completos.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="border rounded-lg p-4 space-y-3">
                  <h3 className="font-semibold text-sm">1. Normalizar CPFs</h3>
                  <p className="text-xs text-muted-foreground">Remove pontos, traços e barras de todos os CPFs.</p>
                  <Button onClick={() => normalizarCpfs.mutate()} disabled={normalizarCpfs.isPending} className="w-full" variant="outline">
                    {normalizarCpfs.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                    Normalizar CPFs
                  </Button>
                </div>
                <div className="border rounded-lg p-4 space-y-3">
                  <h3 className="font-semibold text-sm">2. Unificar Duplicados</h3>
                  <p className="text-xs text-muted-foreground">Detecta e unifica clientes com mesmo CPF automaticamente.</p>
                  <Button onClick={() => autoMerge.mutate()} disabled={autoMerge.isPending} className="w-full" variant="outline">
                    {autoMerge.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Merge className="h-4 w-4 mr-2" />}
                    Auto-Merge
                  </Button>
                </div>
                <div className="border rounded-lg p-4 space-y-3">
                  <h3 className="font-semibold text-sm">3. Deduplicar Processos</h3>
                  <p className="text-xs text-muted-foreground">Remove processos com mesmo CNJ, mantendo o mais recente.</p>
                  <Button onClick={() => deduplicarProcessos.mutate()} disabled={deduplicarProcessos.isPending} className="w-full" variant="outline">
                    {deduplicarProcessos.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <FileSearch className="h-4 w-4 mr-2" />}
                    Deduplicar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ==================== ABA DIAGNÓSTICO RÁPIDO ==================== */}
      {activeTab === 'diagnostico' && (
        <div className="space-y-6">
          {/* Resumo rápido */}
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

          {/* Clientes sem CPF */}
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

          {/* Clientes Duplicados */}
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

          {/* Processos Duplicados */}
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

          {/* Guia de uso */}
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
    </div>
  );
}
