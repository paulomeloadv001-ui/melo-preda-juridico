import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  RefreshCw, Trash2, RotateCcw, Clock, CheckCircle2,
  XCircle, Loader2, AlertTriangle, ListChecks, FileText
} from "lucide-react";

function statusBadge(status: string) {
  const map: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: any; label: string }> = {
    pendente: { variant: "secondary", icon: Clock, label: "Pendente" },
    processando: { variant: "default", icon: Loader2, label: "Processando" },
    concluido: { variant: "outline", icon: CheckCircle2, label: "Concluído" },
    erro: { variant: "destructive", icon: XCircle, label: "Erro" },
    cancelado: { variant: "secondary", icon: AlertTriangle, label: "Cancelado" },
  };
  const s = map[status] || map.pendente;
  const Icon = s.icon;
  return (
    <Badge variant={s.variant} className="gap-1">
      <Icon className={`h-3 w-3 ${status === 'processando' ? 'animate-spin' : ''}`} />
      {s.label}
    </Badge>
  );
}

function formatDate(d: string | Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
}

export default function Jobs() {
  const [filtroStatus, setFiltroStatus] = useState<string | undefined>(undefined);

  const { data: stats, refetch: refetchStats } = trpc.jobs.stats.useQuery();
  const { data: jobsList, refetch: refetchJobs } = trpc.jobs.list.useQuery(
    filtroStatus ? { status: filtroStatus } : undefined
  );

  const cancelarMut = trpc.jobs.cancelar.useMutation({
    onSuccess: () => { refetchJobs(); refetchStats(); toast.success("Job cancelado"); },
  });
  const reprocessarMut = trpc.jobs.reprocessar.useMutation({
    onSuccess: () => { refetchJobs(); refetchStats(); toast.success("Job reenviado para processamento"); },
  });
  const limparMut = trpc.jobs.limparConcluidos.useMutation({
    onSuccess: (data) => { refetchJobs(); refetchStats(); toast.success(`${data.removidos} jobs removidos`); },
  });

  // Polling automático quando há jobs processando
  const hasProcessing = stats?.processando && stats.processando > 0;
  useEffect(() => {
    if (!hasProcessing) return;
    const interval = setInterval(() => {
      refetchJobs();
      refetchStats();
    }, 3000);
    return () => clearInterval(interval);
  }, [hasProcessing, refetchJobs, refetchStats]);

  const handleRefresh = () => {
    refetchJobs();
    refetchStats();
    toast.success("Dados atualizados");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ListChecks className="h-6 w-6 text-amber-600" />
            Fila de Trabalhos
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitoramento em tempo real de importações e processamentos
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={() => limparMut.mutate()}
            disabled={!stats?.concluidos}>
            <Trash2 className="h-4 w-4 mr-1" /> Limpar Concluídos
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="cursor-pointer hover:ring-2 ring-amber-500/50 transition-all"
          onClick={() => setFiltroStatus(undefined)}>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-2xl font-bold">{stats?.total || 0}</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:ring-2 ring-yellow-500/50 transition-all"
          onClick={() => setFiltroStatus("pendente")}>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Pendentes</p>
            <p className="text-2xl font-bold text-yellow-600">{stats?.pendentes || 0}</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:ring-2 ring-blue-500/50 transition-all"
          onClick={() => setFiltroStatus("processando")}>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Processando</p>
            <p className="text-2xl font-bold text-blue-600">{stats?.processando || 0}</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:ring-2 ring-green-500/50 transition-all"
          onClick={() => setFiltroStatus("concluido")}>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Concluídos</p>
            <p className="text-2xl font-bold text-green-600">{stats?.concluidos || 0}</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:ring-2 ring-red-500/50 transition-all"
          onClick={() => setFiltroStatus("erro")}>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Erros</p>
            <p className="text-2xl font-bold text-red-600">{stats?.erros || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtro ativo */}
      {filtroStatus && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filtro:</span>
          {statusBadge(filtroStatus)}
          <Button variant="ghost" size="sm" onClick={() => setFiltroStatus(undefined)}>
            Limpar filtro
          </Button>
        </div>
      )}

      {/* Lista de Jobs */}
      <div className="space-y-3">
        {!jobsList?.length ? (
          <Card>
            <CardContent className="p-12 text-center">
              <ListChecks className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground">
                {filtroStatus ? "Nenhum job com este status" : "Nenhum trabalho na fila"}
              </p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Faça upload de processos ou contracheques para iniciar o processamento
              </p>
            </CardContent>
          </Card>
        ) : (
          jobsList.map((job: any) => (
            <Card key={job.id} className={`transition-all ${job.status === 'processando' ? 'ring-2 ring-blue-500/30 animate-pulse' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-medium truncate">{job.titulo || `Job #${job.id}`}</span>
                      {statusBadge(job.status)}
                      <Badge variant="outline" className="text-xs">
                        {job.tipo === 'importacao_pdf' ? 'Processo' : job.tipo === 'importacao_contracheque' ? 'Contracheque' : job.tipo}
                      </Badge>
                    </div>

                    {job.descricao && (
                      <p className="text-sm text-muted-foreground mb-2 truncate">{job.descricao}</p>
                    )}

                    {/* Barra de progresso */}
                    {(job.status === 'processando' || job.status === 'concluido') && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{job.mensagemProgresso || 'Processando...'}</span>
                          <span className="font-medium">{job.progresso || 0}%</span>
                        </div>
                        <Progress value={job.progresso || 0} className="h-2" />
                      </div>
                    )}

                    {/* Erro */}
                    {job.status === 'erro' && job.erroDetalhes && (
                      <div className="mt-2 p-2 bg-red-50 dark:bg-red-950/20 rounded text-sm text-red-700 dark:text-red-400">
                        {job.erroDetalhes}
                      </div>
                    )}

                    {/* Timestamps */}
                    <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                      <span>Criado: {formatDate(job.createdAt)}</span>
                      {job.iniciadoEm && <span>Iniciado: {formatDate(job.iniciadoEm)}</span>}
                      {job.concluidoEm && <span>Concluído: {formatDate(job.concluidoEm)}</span>}
                      {job.tentativas > 1 && <span>Tentativas: {job.tentativas}</span>}
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex gap-1 shrink-0">
                    {(job.status === 'pendente' || job.status === 'processando') && (
                      <Button variant="ghost" size="icon" className="h-8 w-8"
                        onClick={() => cancelarMut.mutate({ id: job.id })}
                        title="Cancelar">
                        <XCircle className="h-4 w-4 text-red-500" />
                      </Button>
                    )}
                    {job.status === 'erro' && (
                      <Button variant="ghost" size="icon" className="h-8 w-8"
                        onClick={() => reprocessarMut.mutate({ id: job.id })}
                        title="Reprocessar">
                        <RotateCcw className="h-4 w-4 text-blue-500" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Info de polling */}
      {hasProcessing && (
        <div className="text-center text-xs text-muted-foreground animate-pulse">
          Atualizando automaticamente a cada 3 segundos...
        </div>
      )}
    </div>
  );
}
