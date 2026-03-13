import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  RefreshCw, Wifi, WifiOff, Clock, CheckCircle2, XCircle, AlertTriangle,
  ArrowRightLeft, Search, Trash2, Play, Users, FileText, Scale, BookOpen,
  Target, DollarSign, Zap, Shield, Activity, BarChart3, Database
} from "lucide-react";

type SyncTipo = 'clientes' | 'processos' | 'movimentacoes' | 'conhecimentos' | 'estrategias' | 'financeiro' | 'completa';

const TIPOS_SYNC: { tipo: SyncTipo; label: string; icon: React.ReactNode; cor: string }[] = [
  { tipo: 'clientes', label: 'Clientes', icon: <Users className="h-4 w-4" />, cor: 'bg-blue-500' },
  { tipo: 'processos', label: 'Processos', icon: <FileText className="h-4 w-4" />, cor: 'bg-green-500' },
  { tipo: 'movimentacoes', label: 'Movimentações', icon: <Activity className="h-4 w-4" />, cor: 'bg-purple-500' },
  { tipo: 'conhecimentos', label: 'Conhecimentos', icon: <BookOpen className="h-4 w-4" />, cor: 'bg-amber-500' },
  { tipo: 'estrategias', label: 'Estratégias', icon: <Target className="h-4 w-4" />, cor: 'bg-rose-500' },
  { tipo: 'financeiro', label: 'Financeiro', icon: <DollarSign className="h-4 w-4" />, cor: 'bg-emerald-500' },
  { tipo: 'completa', label: 'Completa', icon: <Zap className="h-4 w-4" />, cor: 'bg-orange-500' },
];

function formatarData(data: string | Date | null | undefined): string {
  if (!data) return 'Nunca';
  const d = new Date(data);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatarDuracao(ms: number | null | undefined): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function Integracao() {
  const [cpfScore, setCpfScore] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<string>('');
  const [syncEmAndamento, setSyncEmAndamento] = useState<string | null>(null);

  // Queries
  const statusQuery = trpc.integracao.statusIntegracao.useQuery(undefined, { refetchInterval: 30000 });
  const historicoQuery = trpc.integracao.historicoSyncs.useQuery(
    { limite: 50, tipo: filtroTipo || undefined },
    { refetchInterval: 15000 }
  );
  const scoreQuery = trpc.integracao.consultarScorePainel.useQuery(
    { cpf: cpfScore },
    { enabled: cpfScore.length >= 11 }
  );

  // Mutations
  const syncManual = trpc.integracao.executarSyncManual.useMutation({
    onSuccess: (data) => {
      toast.success(`Sincronização concluída: ${data.tipo} — ${data.registros} registros em ${data.duracaoMs}ms`);
      setSyncEmAndamento(null);
      statusQuery.refetch();
      historicoQuery.refetch();
    },
    onError: (err) => {
      toast.error(`Erro na sincronização: ${err.message}`);
      setSyncEmAndamento(null);
    },
  });

  const limparLogs = trpc.integracao.limparLogsAntigos.useMutation({
    onSuccess: (data) => {
      toast.success(`Logs limpos: ${data.removidos} registros removidos`);
      historicoQuery.refetch();
    },
    onError: (err) => {
      toast.error(`Erro ao limpar logs: ${err.message}`);
    },
  });

  const status = statusQuery.data;
  const historico = historicoQuery.data || [];

  // Estatísticas do histórico
  const stats = useMemo(() => {
    const sucesso = historico.filter(h => h.status === 'sucesso').length;
    const erro = historico.filter(h => h.status === 'erro').length;
    const parcial = historico.filter(h => h.status === 'parcial').length;
    return { sucesso, erro, parcial, total: historico.length };
  }, [historico]);

  const handleSync = (tipo: SyncTipo) => {
    setSyncEmAndamento(tipo);
    syncManual.mutate({ tipo });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ArrowRightLeft className="h-6 w-6 text-orange-500" />
            Painel de Integração — JUSCONSIG 3.0
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitoramento e controle da sincronização Escritório → JUSCONSIG
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { statusQuery.refetch(); historicoQuery.refetch(); }}>
            <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={() => limparLogs.mutate({ diasManter: 90 })}
            disabled={limparLogs.isPending}>
            <Trash2 className="h-4 w-4 mr-1" /> Limpar Logs (+90d)
          </Button>
        </div>
      </div>

      {/* Status da Conexão */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Status da Conexão</p>
                <p className="text-lg font-bold mt-1">
                  {status?.apiKeyConfigurada ? (
                    <span className="flex items-center gap-1 text-green-600"><Wifi className="h-4 w-4" /> Configurada</span>
                  ) : (
                    <span className="flex items-center gap-1 text-red-600"><WifiOff className="h-4 w-4" /> Não Configurada</span>
                  )}
                </p>
              </div>
              <div className={`p-3 rounded-full ${status?.apiKeyConfigurada ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                <Shield className={`h-5 w-5 ${status?.apiKeyConfigurada ? 'text-green-600' : 'text-red-600'}`} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total de Syncs</p>
                <p className="text-2xl font-bold mt-1">{status?.totalSyncs || 0}</p>
              </div>
              <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/30">
                <Database className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Registros Sincronizados</p>
                <p className="text-2xl font-bold mt-1">{(status?.totalNovos || 0) + (status?.totalAtualizados || 0)}</p>
              </div>
              <div className="p-3 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                <BarChart3 className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Última Sync Completa</p>
                <p className="text-sm font-medium mt-1">{formatarData(status?.ultimaSyncCompleta)}</p>
              </div>
              <div className="p-3 rounded-full bg-amber-100 dark:bg-amber-900/30">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ações de Sincronização Manual */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="h-5 w-5 text-orange-500" />
            Sincronização Manual
          </CardTitle>
          <CardDescription>
            Dispare sincronizações individuais ou completa. Os dados ficam disponíveis para a JUSCONSIG 3.0 consumir via API.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {TIPOS_SYNC.map(({ tipo, label, icon, cor }) => (
              <Button
                key={tipo}
                variant={tipo === 'completa' ? 'default' : 'outline'}
                className={tipo === 'completa' ? 'bg-orange-600 hover:bg-orange-700' : ''}
                disabled={syncEmAndamento !== null}
                onClick={() => handleSync(tipo)}
              >
                {syncEmAndamento === tipo ? (
                  <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <span className="mr-1">{icon}</span>
                )}
                {label}
              </Button>
            ))}
          </div>
          {syncEmAndamento && (
            <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Sincronizando {syncEmAndamento}...
            </div>
          )}
        </CardContent>
      </Card>

      {/* Score Antifraude */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-red-500" />
            Consulta Score Antifraude
          </CardTitle>
          <CardDescription>
            Consulte o score de risco de um servidor público pelo CPF. Analisa processos, empréstimos e margem consignável.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 mb-4">
            <Input
              placeholder="Digite o CPF (apenas números)..."
              value={cpfScore}
              onChange={(e) => setCpfScore(e.target.value.replace(/\D/g, ''))}
              className="max-w-xs"
            />
            <Button variant="outline" onClick={() => scoreQuery.refetch()} disabled={cpfScore.length < 11}>
              <Search className="h-4 w-4 mr-1" /> Consultar
            </Button>
          </div>

          {scoreQuery.isLoading && cpfScore.length >= 11 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" /> Consultando...
            </div>
          )}

          {scoreQuery.data && 'encontrado' in scoreQuery.data && scoreQuery.data.encontrado && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">Cliente</p>
                  <p className="font-bold">{scoreQuery.data.cliente?.nome}</p>
                  <p className="text-sm">{scoreQuery.data.cliente?.profissao} — {scoreQuery.data.cliente?.orgao}</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">Processos</p>
                  <p className="font-bold">{scoreQuery.data.totalProcessos} total ({scoreQuery.data.processosAtivos} ativos)</p>
                  <p className="text-sm">Valor litigado: R$ {(scoreQuery.data.valorTotalLitigado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">Score de Risco</p>
                  <Badge variant={scoreQuery.data.scoreRisco === 'Baixo' ? 'default' : scoreQuery.data.scoreRisco === 'Medio' ? 'secondary' : 'destructive'}
                    className="text-lg px-3 py-1">
                    {scoreQuery.data.scoreRisco === 'Baixo' ? '🟢' : scoreQuery.data.scoreRisco === 'Medio' ? '🟡' : '🔴'} {scoreQuery.data.scoreRisco}
                  </Badge>
                </div>
              </div>

              {scoreQuery.data.flags && scoreQuery.data.flags.length > 0 && (
                <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <p className="text-sm font-bold text-red-700 dark:text-red-400 mb-2 flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4" /> Flags de Risco Identificadas
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {scoreQuery.data.flags.map((flag: string) => (
                      <Badge key={flag} variant="destructive" className="text-xs">{flag.replace(/_/g, ' ')}</Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">Empréstimos Consignados</p>
                  <p className="font-bold">{scoreQuery.data.totalEmprestimos}</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">Margem Consignável</p>
                  <p className="font-bold">R$ {(scoreQuery.data.margemConsignavel || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">Margem Disponível</p>
                  <p className="font-bold">R$ {(scoreQuery.data.margemDisponivel || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
              </div>
            </div>
          )}

          {scoreQuery.data && 'encontrado' in scoreQuery.data && !scoreQuery.data.encontrado && (
            <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <p className="text-sm text-amber-700 dark:text-amber-400 flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" /> {scoreQuery.data.mensagem || 'Cliente não encontrado com este CPF'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Histórico de Sincronizações */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-500" />
                Histórico de Sincronizações
              </CardTitle>
              <CardDescription>
                Últimas {historico.length} sincronizações registradas
                {stats.total > 0 && (
                  <span className="ml-2">
                    — <span className="text-green-600">{stats.sucesso} sucesso</span>
                    {stats.erro > 0 && <span className="text-red-600 ml-1">{stats.erro} erro</span>}
                    {stats.parcial > 0 && <span className="text-amber-600 ml-1">{stats.parcial} parcial</span>}
                  </span>
                )}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <select
                className="text-sm border rounded-md px-2 py-1 bg-background"
                value={filtroTipo}
                onChange={(e) => setFiltroTipo(e.target.value)}
              >
                <option value="">Todos os tipos</option>
                {TIPOS_SYNC.map(t => (
                  <option key={t.tipo} value={t.tipo}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {historico.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Database className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Nenhuma sincronização registrada ainda.</p>
              <p className="text-sm mt-1">Execute uma sincronização manual para começar.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3">Status</th>
                    <th className="text-left py-2 px-3">Tipo</th>
                    <th className="text-left py-2 px-3">Direção</th>
                    <th className="text-right py-2 px-3">Novos</th>
                    <th className="text-right py-2 px-3">Atualizados</th>
                    <th className="text-right py-2 px-3">Erros</th>
                    <th className="text-right py-2 px-3">Duração</th>
                    <th className="text-left py-2 px-3">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {historico.map((item) => (
                    <tr key={item.id} className="border-b hover:bg-muted/50">
                      <td className="py-2 px-3">
                        {item.status === 'sucesso' ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : item.status === 'erro' ? (
                          <XCircle className="h-4 w-4 text-red-600" />
                        ) : item.status === 'em_andamento' ? (
                          <RefreshCw className="h-4 w-4 text-blue-600 animate-spin" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <Badge variant="outline" className="text-xs capitalize">{item.tipo}</Badge>
                      </td>
                      <td className="py-2 px-3 text-xs text-muted-foreground">{item.direcao}</td>
                      <td className="py-2 px-3 text-right font-mono">{item.novos}</td>
                      <td className="py-2 px-3 text-right font-mono">{item.atualizados}</td>
                      <td className="py-2 px-3 text-right font-mono text-red-600">{item.erros > 0 ? item.erros : '-'}</td>
                      <td className="py-2 px-3 text-right font-mono text-muted-foreground">{formatarDuracao(item.duracaoMs)}</td>
                      <td className="py-2 px-3 text-xs text-muted-foreground">{formatarData(item.executadoEm)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Informações Técnicas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-gray-500" />
            Informações Técnicas da Integração
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-bold mb-2">Endpoints Disponíveis (7)</h3>
              <div className="space-y-1 text-sm">
                <p className="font-mono text-xs bg-muted p-1 rounded">integracao.clientesAtualizados</p>
                <p className="font-mono text-xs bg-muted p-1 rounded">integracao.processosAtualizados</p>
                <p className="font-mono text-xs bg-muted p-1 rounded">integracao.movimentacoesRecentes</p>
                <p className="font-mono text-xs bg-muted p-1 rounded">integracao.conhecimentosAtualizados</p>
                <p className="font-mono text-xs bg-muted p-1 rounded">integracao.estrategiasAtualizadas</p>
                <p className="font-mono text-xs bg-muted p-1 rounded">integracao.financeiroAtualizado</p>
                <p className="font-mono text-xs bg-muted p-1 rounded">integracao.dadosScoreServidor</p>
              </div>
            </div>
            <div>
              <h3 className="font-bold mb-2">Frequências de Sincronização</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between p-2 bg-muted/50 rounded">
                  <span>Processos + Movimentações</span>
                  <Badge variant="outline">1 hora</Badge>
                </div>
                <div className="flex justify-between p-2 bg-muted/50 rounded">
                  <span>Clientes + Financeiro</span>
                  <Badge variant="outline">6 horas</Badge>
                </div>
                <div className="flex justify-between p-2 bg-muted/50 rounded">
                  <span>Conhecimentos + Estratégias</span>
                  <Badge variant="outline">24 horas</Badge>
                </div>
                <div className="flex justify-between p-2 bg-muted/50 rounded">
                  <span>Sincronização Completa</span>
                  <Badge variant="outline">12 horas</Badge>
                </div>
              </div>
              <div className="mt-4">
                <h3 className="font-bold mb-2">Autenticação</h3>
                <p className="text-sm text-muted-foreground">
                  Header: <code className="bg-muted px-1 rounded">x-integration-key</code>
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  API Key: {status?.apiKeyConfigurada ? (
                    <Badge variant="default" className="bg-green-600">Configurada</Badge>
                  ) : (
                    <Badge variant="destructive">Não configurada</Badge>
                  )}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
