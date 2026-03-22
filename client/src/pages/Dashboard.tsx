import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users, FileText, DollarSign, Upload, Gavel, Calendar,
  ChevronRight, Brain, Banknote, CheckCircle2, Clock, AlertCircle,
  RefreshCw, ArrowRight, FolderOpen, TrendingUp
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";
import { useMemo } from "react";

const formatCurrency = (value: number | string) => {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num);
};

export default function Dashboard() {
  const stats = trpc.clientes.stats.useQuery();
  const recentClientes = trpc.clientes.list.useQuery({});
  const recentPeticoes = trpc.agente.listarPeticoes.useQuery({ limit: 5 });
  const prazos = trpc.prazos.listar.useQuery({ status: "pendente" });
  const [, setLocation] = useLocation();

  const isLoading = stats.isLoading;

  // Últimos 5 clientes
  const ultimosClientes = useMemo(() => {
    return (recentClientes.data || []).slice(0, 5);
  }, [recentClientes.data]);

  // Prazos próximos (7 dias)
  const prazosProximos = useMemo(() => {
    const agora = new Date();
    const em7dias = new Date(agora.getTime() + 7 * 24 * 60 * 60 * 1000);
    return (prazos.data || [])
      .filter((p: any) => {
        const dt = new Date(p.dataLimite);
        return dt >= agora && dt <= em7dias;
      })
      .slice(0, 5);
  }, [prazos.data]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Painel</h1>
          <p className="text-muted-foreground mt-1">Carregando...</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  const totalClientes = stats.data?.totalClientes ?? 0;
  const totalProcessos = stats.data?.totalProcessos ?? 0;
  const honorariosTotal = stats.data?.honorarios?.total ?? 0;
  const honorariosPagos = stats.data?.honorarios?.pagosLevantados ?? 0;
  const honorariosPendentes = stats.data?.honorarios?.pendentes ?? 0;
  const honorariosDeposit = stats.data?.honorarios?.depositadosALevantar ?? 0;

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Painel</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Melo &amp; Preda Advogados
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { stats.refetch(); recentClientes.refetch(); recentPeticoes.refetch(); prazos.refetch(); }}
          disabled={stats.isFetching}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${stats.isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Cards de números */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation("/clientes")}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Clientes</p>
                <p className="text-3xl font-bold mt-1">{totalClientes}</p>
              </div>
              <div className="p-3 rounded-xl bg-blue-500/10">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation("/clientes")}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Processos</p>
                <p className="text-3xl font-bold mt-1">{totalProcessos}</p>
              </div>
              <div className="p-3 rounded-xl bg-amber-500/10">
                <FileText className="h-6 w-6 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation("/relatorios")}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Honorários</p>
                <p className="text-xl font-bold mt-1">{formatCurrency(honorariosTotal)}</p>
              </div>
              <div className="p-3 rounded-xl bg-emerald-500/10">
                <Banknote className="h-6 w-6 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation("/peticionamento")}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Petições</p>
                <p className="text-3xl font-bold mt-1">{recentPeticoes.data?.length ?? 0}</p>
              </div>
              <div className="p-3 rounded-xl bg-purple-500/10">
                <Gavel className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ações rápidas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Button
          variant="outline"
          className="h-auto py-4 flex flex-col items-center gap-2 hover:border-blue-500/50 hover:bg-blue-500/5"
          onClick={() => setLocation("/upload")}
        >
          <Upload className="h-5 w-5 text-blue-600" />
          <span className="text-sm font-medium">Importar Processo</span>
        </Button>
        <Button
          variant="outline"
          className="h-auto py-4 flex flex-col items-center gap-2 hover:border-amber-500/50 hover:bg-amber-500/5"
          onClick={() => setLocation("/peticionamento")}
        >
          <Gavel className="h-5 w-5 text-amber-600" />
          <span className="text-sm font-medium">Nova Petição</span>
        </Button>
        <Button
          variant="outline"
          className="h-auto py-4 flex flex-col items-center gap-2 hover:border-red-500/50 hover:bg-red-500/5"
          onClick={() => setLocation("/prazos")}
        >
          <Calendar className="h-5 w-5 text-red-600" />
          <span className="text-sm font-medium">Ver Prazos</span>
        </Button>
        <Button
          variant="outline"
          className="h-auto py-4 flex flex-col items-center gap-2 hover:border-emerald-500/50 hover:bg-emerald-500/5"
          onClick={() => setLocation("/relatorios")}
        >
          <TrendingUp className="h-5 w-5 text-emerald-600" />
          <span className="text-sm font-medium">Relatórios</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Honorários */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-emerald-600" />
              Honorários
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-green-500/5 border border-green-500/20">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-sm">Pagos / Levantados</span>
              </div>
              <span className="font-semibold text-green-700 dark:text-green-400">{formatCurrency(honorariosPagos)}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-600" />
                <span className="text-sm">Depositados / A Levantar</span>
              </div>
              <span className="font-semibold text-amber-700 dark:text-amber-400">{formatCurrency(honorariosDeposit)}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-red-500/5 border border-red-500/20">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <span className="text-sm">Pendentes</span>
              </div>
              <span className="font-semibold text-red-700 dark:text-red-400">{formatCurrency(honorariosPendentes)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Prazos próximos */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4 text-red-600" />
                Prazos Próximos
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setLocation("/prazos")} className="text-xs">
                Ver todos <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {prazosProximos.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <Calendar className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhum prazo nos próximos 7 dias</p>
              </div>
            ) : (
              <div className="space-y-2">
                {prazosProximos.map((p: any) => {
                  const dt = new Date(p.dataLimite);
                  const dias = Math.ceil((dt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                  const urgente = dias <= 2;
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${urgente ? 'border-red-500/30 bg-red-500/5' : 'border-border'}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{p.descricao || p.tipo}</p>
                        <p className="text-xs text-muted-foreground">{p.numeroCnj || 'Processo'}</p>
                      </div>
                      <Badge variant={urgente ? "destructive" : "outline"} className="text-xs shrink-0 ml-2">
                        {dias === 0 ? 'Hoje' : dias === 1 ? 'Amanhã' : `${dias} dias`}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Últimos clientes */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-600" />
              Últimos Clientes
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setLocation("/clientes")} className="text-xs">
              Ver todos <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {ultimosClientes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhum cliente cadastrado</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setLocation("/upload")}>
                <Upload className="h-4 w-4 mr-2" /> Importar primeiro processo
              </Button>
            </div>
          ) : (
            <div className="space-y-1">
              {ultimosClientes.map((c: any) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => setLocation(`/cliente/${c.id}`)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
                      <span className="text-sm font-semibold text-blue-600">
                        {c.nomeCompleto?.charAt(0)?.toUpperCase() || '?'}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{c.nomeCompleto}</p>
                      <p className="text-xs text-muted-foreground">{c.cpfCnpj || 'CPF pendente'}</p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Últimas petições */}
      {(recentPeticoes.data?.length ?? 0) > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Gavel className="h-4 w-4 text-amber-600" />
                Últimas Petições
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setLocation("/peticionamento")} className="text-xs">
                Ver todas <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {(recentPeticoes.data || []).slice(0, 5).map((p: any) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => setLocation("/peticionamento")}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{p.tipoPeticao || 'Petição'}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.nomeCliente || 'Cliente'}</p>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0 ml-2">
                    {p.status === 'aprovada' ? 'Aprovada' : p.status === 'rascunho' ? 'Rascunho' : 'Gerada'}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
