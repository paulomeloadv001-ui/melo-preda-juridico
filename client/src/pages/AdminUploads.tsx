import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  Upload, CheckCircle2, XCircle, Clock, Loader2, RefreshCw,
  Trash2, Eye, FileText, Users, Filter, BarChart3, AlertTriangle
} from "lucide-react";

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  concluido: { label: "Concluído", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
  processando: { label: "Processando", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: Loader2 },
  pendente: { label: "Pendente", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", icon: Clock },
  erro: { label: "Erro", color: "bg-red-500/20 text-red-400 border-red-500/30", icon: XCircle },
  cancelado: { label: "Cancelado", color: "bg-gray-500/20 text-gray-400 border-gray-500/30", icon: XCircle },
};

function formatDate(d: any) {
  if (!d) return "—";
  const date = new Date(d);
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatTimeAgo(d: any) {
  if (!d) return "";
  const now = Date.now();
  const diff = now - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}min atrás`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d atrás`;
  return formatDate(d);
}

export default function AdminUploads() {
  const [, setLocation] = useLocation();
  const [filtroStatus, setFiltroStatus] = useState<string | undefined>(undefined);
  const { data, isLoading, refetch } = trpc.jobs.uploadsAdmin.useQuery(
    { status: filtroStatus, limit: 100 }
  );

  const reprocessar = trpc.jobs.reprocessarUpload.useMutation({
    onSuccess: () => {
      toast.success("Upload marcado para reprocessamento");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const excluir = trpc.jobs.excluirUpload.useMutation({
    onSuccess: () => {
      toast.success("Upload excluído");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const uploads = data?.uploads || [];
  const stats = data?.stats || { total: 0, concluidos: 0, processando: 0, erros: 0, pendentes: 0 };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-[oklch(0.75_0.12_85)]" />
            Painel de Uploads
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Visualize todos os uploads de processos e contracheques com status em tempo real
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="sm" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </Button>
      </div>

      {/* Cards de Estatísticas */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card
          className={`cursor-pointer transition-all ${!filtroStatus ? "ring-2 ring-[oklch(0.75_0.12_85)]" : "hover:ring-1 hover:ring-gray-600"}`}
          onClick={() => setFiltroStatus(undefined)}
        >
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-white">{stats.total}</div>
            <div className="text-xs text-gray-400">Total</div>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition-all ${filtroStatus === "concluido" ? "ring-2 ring-emerald-500" : "hover:ring-1 hover:ring-gray-600"}`}
          onClick={() => setFiltroStatus(filtroStatus === "concluido" ? undefined : "concluido")}
        >
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-emerald-400">{stats.concluidos}</div>
            <div className="text-xs text-gray-400">Concluídos</div>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition-all ${filtroStatus === "processando" ? "ring-2 ring-blue-500" : "hover:ring-1 hover:ring-gray-600"}`}
          onClick={() => setFiltroStatus(filtroStatus === "processando" ? undefined : "processando")}
        >
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-400">{stats.processando}</div>
            <div className="text-xs text-gray-400">Processando</div>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition-all ${filtroStatus === "pendente" ? "ring-2 ring-yellow-500" : "hover:ring-1 hover:ring-gray-600"}`}
          onClick={() => setFiltroStatus(filtroStatus === "pendente" ? undefined : "pendente")}
        >
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-yellow-400">{stats.pendentes}</div>
            <div className="text-xs text-gray-400">Pendentes</div>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition-all ${filtroStatus === "erro" ? "ring-2 ring-red-500" : "hover:ring-1 hover:ring-gray-600"}`}
          onClick={() => setFiltroStatus(filtroStatus === "erro" ? undefined : "erro")}
        >
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-red-400">{stats.erros}</div>
            <div className="text-xs text-gray-400">Erros</div>
          </CardContent>
        </Card>
      </div>

      {/* Filtro ativo */}
      {filtroStatus && (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Filter className="h-4 w-4" />
          Filtrando por: <Badge variant="outline" className={statusConfig[filtroStatus]?.color}>{statusConfig[filtroStatus]?.label}</Badge>
          <Button variant="ghost" size="sm" onClick={() => setFiltroStatus(undefined)} className="text-xs">Limpar</Button>
        </div>
      )}

      {/* Tabela de Uploads */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Uploads ({uploads.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : uploads.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Upload className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum upload encontrado</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setLocation("/upload")}>
                Importar Processo
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-400">
                    <th className="text-left py-3 px-2">Data</th>
                    <th className="text-left py-3 px-2">Tipo</th>
                    <th className="text-left py-3 px-2">Título</th>
                    <th className="text-left py-3 px-2">Cliente</th>
                    <th className="text-left py-3 px-2">Processo</th>
                    <th className="text-left py-3 px-2">Status</th>
                    <th className="text-left py-3 px-2">Progresso</th>
                    <th className="text-right py-3 px-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {uploads.map((upload: any) => {
                    const cfg = statusConfig[upload.status] || statusConfig.pendente;
                    const StatusIcon = cfg.icon;
                    return (
                      <tr key={upload.id} className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
                        <td className="py-3 px-2">
                          <div className="text-gray-300 text-xs">{formatDate(upload.createdAt)}</div>
                          <div className="text-gray-500 text-xs">{formatTimeAgo(upload.createdAt)}</div>
                        </td>
                        <td className="py-3 px-2">
                          <Badge variant="outline" className="text-xs">
                            {upload.tipo === "importacao_pdf" ? "Processo" : upload.tipo === "importacao_contracheque" ? "Contracheque" : "Lote"}
                          </Badge>
                        </td>
                        <td className="py-3 px-2">
                          <div className="text-gray-200 max-w-[200px] truncate" title={upload.titulo}>
                            {upload.titulo}
                          </div>
                          {upload.descricao && (
                            <div className="text-gray-500 text-xs max-w-[200px] truncate" title={upload.descricao}>
                              {upload.descricao}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-2">
                          {upload.clienteNome ? (
                            <button
                              onClick={() => setLocation(`/cliente/${upload.clienteId}`)}
                              className="text-[oklch(0.75_0.12_85)] hover:underline text-left"
                            >
                              <div className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {upload.clienteNome}
                              </div>
                              {upload.clienteCpf && <div className="text-gray-500 text-xs">{upload.clienteCpf}</div>}
                            </button>
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
                        </td>
                        <td className="py-3 px-2">
                          {upload.numeroCnj ? (
                            <div>
                              <div className="text-gray-300 text-xs font-mono">{upload.numeroCnj}</div>
                              {upload.tipoAcao && <div className="text-gray-500 text-xs">{upload.tipoAcao}</div>}
                            </div>
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
                        </td>
                        <td className="py-3 px-2">
                          <Badge variant="outline" className={`gap-1 ${cfg.color}`}>
                            <StatusIcon className={`h-3 w-3 ${upload.status === "processando" ? "animate-spin" : ""}`} />
                            {cfg.label}
                          </Badge>
                          {upload.status === "erro" && upload.erroDetalhes && (
                            <div className="text-red-400 text-xs mt-1 max-w-[150px] truncate" title={upload.erroDetalhes}>
                              <AlertTriangle className="h-3 w-3 inline mr-1" />
                              {upload.erroDetalhes}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-2">
                          {upload.progresso !== null && upload.progresso !== undefined ? (
                            <div>
                              <div className="w-20 bg-gray-700 rounded-full h-2">
                                <div
                                  className={`h-2 rounded-full transition-all ${
                                    upload.status === "erro" ? "bg-red-500" :
                                    upload.status === "concluido" ? "bg-emerald-500" :
                                    "bg-blue-500"
                                  }`}
                                  style={{ width: `${Math.min(upload.progresso, 100)}%` }}
                                />
                              </div>
                              <div className="text-gray-500 text-xs mt-1">{upload.progresso}%</div>
                            </div>
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
                        </td>
                        <td className="py-3 px-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {upload.clienteId && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setLocation(`/cliente/${upload.clienteId}`)}
                                title="Ver pasta do cliente"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            )}
                            {upload.status === "erro" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => reprocessar.mutate({ jobId: upload.id })}
                                disabled={reprocessar.isPending}
                                title="Reprocessar"
                              >
                                <RefreshCw className={`h-4 w-4 text-yellow-400 ${reprocessar.isPending ? "animate-spin" : ""}`} />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (confirm("Excluir este registro de upload?")) {
                                  excluir.mutate({ jobId: upload.id });
                                }
                              }}
                              disabled={excluir.isPending}
                              title="Excluir"
                            >
                              <Trash2 className="h-4 w-4 text-red-400" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
