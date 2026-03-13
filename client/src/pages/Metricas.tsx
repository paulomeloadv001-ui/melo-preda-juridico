import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";
import {
  TrendingUp, Users, FileText, Scale, Clock, CheckCircle,
  AlertTriangle, DollarSign, BarChart3, Activity, RefreshCw, Briefcase
} from "lucide-react";

const CORES = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#ec4899", "#14b8a6", "#f97316", "#6366f1",
  "#84cc16", "#d946ef"
];

function formatarMoeda(valor: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
}

export default function Metricas() {
  const [periodo, setPeriodo] = useState<"7d" | "30d" | "90d" | "365d" | "tudo">("30d");

  const { data: metricas, isLoading: loadingMetricas } = trpc.metricas.geral.useQuery();
  const { data: produtividade, isLoading: loadingProd } = trpc.metricas.produtividade.useQuery({ periodo });

  const isLoading = loadingMetricas || loadingProd;

  // Dados para gráfico de tipo de ação
  const dadosTipoAcao = useMemo(() => {
    if (!metricas?.porTipoAcao) return [];
    return metricas.porTipoAcao.slice(0, 10).map((item, i) => ({
      name: item.tipo.length > 25 ? item.tipo.substring(0, 25) + "..." : item.tipo,
      value: item.qtd,
      fill: CORES[i % CORES.length],
    }));
  }, [metricas?.porTipoAcao]);

  // Dados para gráfico de status
  const dadosStatus = useMemo(() => {
    if (!metricas?.porStatus) return [];
    return metricas.porStatus.map((item, i) => ({
      name: item.status,
      value: item.qtd,
      fill: CORES[i % CORES.length],
    }));
  }, [metricas?.porStatus]);

  // Dados para gráfico de honorários
  const dadosHonorarios = useMemo(() => {
    if (!metricas?.honorarios?.honorariosPorStatus) return [];
    return metricas.honorarios.honorariosPorStatus.map((item, i) => ({
      name: item.status.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
      valor: item.valor,
      quantidade: item.quantidade,
      fill: CORES[i % CORES.length],
    }));
  }, [metricas?.honorarios]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!metricas) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Não foi possível carregar as métricas.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Métricas de Produtividade</h1>
          <p className="text-muted-foreground">
            Visão analítica completa do escritório
          </p>
        </div>
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {(["7d", "30d", "90d", "365d", "tudo"] as const).map((p) => (
            <Button
              key={p}
              variant={periodo === p ? "default" : "ghost"}
              size="sm"
              onClick={() => setPeriodo(p)}
            >
              {p === "7d" ? "7 dias" : p === "30d" ? "30 dias" : p === "90d" ? "90 dias" : p === "365d" ? "1 ano" : "Tudo"}
            </Button>
          ))}
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-8">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">Clientes</span>
            </div>
            <p className="text-xl font-bold mt-1">{metricas.resumo.totalClientes}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-green-500" />
              <span className="text-xs text-muted-foreground">Processos</span>
            </div>
            <p className="text-xl font-bold mt-1">{metricas.resumo.totalProcessos}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-purple-500" />
              <span className="text-xs text-muted-foreground">Conhecimentos</span>
            </div>
            <p className="text-xl font-bold mt-1">{metricas.resumo.totalConhecimentos}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-orange-500" />
              <span className="text-xs text-muted-foreground">Relatórios</span>
            </div>
            <p className="text-xl font-bold mt-1">{metricas.resumo.totalRelatorios}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-cyan-500" />
              <span className="text-xs text-muted-foreground">Estratégias</span>
            </div>
            <p className="text-xl font-bold mt-1">{metricas.resumo.totalEstrategias}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-red-500" />
              <span className="text-xs text-muted-foreground">Prazos</span>
            </div>
            <p className="text-xl font-bold mt-1">{metricas.resumo.totalPrazos}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-500" />
              <span className="text-xs text-muted-foreground">Jobs</span>
            </div>
            <p className="text-xl font-bold mt-1">{metricas.resumo.totalJobs}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-amber-500" />
              <span className="text-xs text-muted-foreground">Empréstimos</span>
            </div>
            <p className="text-xl font-bold mt-1">{metricas.resumo.totalEmprestimos}</p>
          </CardContent>
        </Card>
      </div>

      {/* Indicadores de performance */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Taxa Cumprimento Prazos</span>
              <Badge variant={metricas.prazos.taxaCumprimento >= 80 ? "default" : "destructive"}>
                {metricas.prazos.taxaCumprimento}%
              </Badge>
            </div>
            <div className="flex gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <CheckCircle className="h-3 w-3 text-green-500" /> {metricas.prazos.cumpridos} cumpridos
              </span>
              <span className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-red-500" /> {metricas.prazos.vencidos} vencidos
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3 text-yellow-500" /> {metricas.prazos.pendentes} pendentes
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Taxa Sucesso Jobs</span>
              <Badge variant={metricas.jobs.taxaSucesso >= 90 ? "default" : "destructive"}>
                {metricas.jobs.taxaSucesso}%
              </Badge>
            </div>
            <div className="flex gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <CheckCircle className="h-3 w-3 text-green-500" /> {metricas.jobs.concluidos} concluídos
              </span>
              <span className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-red-500" /> {metricas.jobs.erros} erros
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Honorários</span>
              <Badge variant="outline">
                <DollarSign className="h-3 w-3 mr-1" />
                {formatarMoeda(metricas.honorarios.valorPago + metricas.honorarios.valorALevantar)}
              </Badge>
            </div>
            <div className="flex gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <CheckCircle className="h-3 w-3 text-green-500" /> Pago: {formatarMoeda(metricas.honorarios.valorPago)}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3 text-yellow-500" /> A levantar: {formatarMoeda(metricas.honorarios.valorALevantar)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <Tabs defaultValue="evolucao" className="space-y-4">
        <TabsList>
          <TabsTrigger value="evolucao">Evolução Mensal</TabsTrigger>
          <TabsTrigger value="tipos">Tipos de Ação</TabsTrigger>
          <TabsTrigger value="status">Status Processos</TabsTrigger>
          <TabsTrigger value="honorarios">Honorários</TabsTrigger>
          <TabsTrigger value="produtividade">Produtividade</TabsTrigger>
        </TabsList>

        <TabsContent value="evolucao">
          <Card>
            <CardHeader>
              <CardTitle>Evolução Mensal (Últimos 12 meses)</CardTitle>
              <CardDescription>Novos registros por mês: clientes, processos, conhecimentos e relatórios</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={metricas.evolucaoMensal}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="clientes" name="Clientes" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} />
                  <Area type="monotone" dataKey="processos" name="Processos" stroke="#10b981" fill="#10b981" fillOpacity={0.2} />
                  <Area type="monotone" dataKey="conhecimentos" name="Conhecimentos" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} />
                  <Area type="monotone" dataKey="relatorios" name="Relatórios" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tipos">
          <Card>
            <CardHeader>
              <CardTitle>Processos por Tipo de Ação</CardTitle>
              <CardDescription>Top 10 tipos de ação processual mais frequentes</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                <ResponsiveContainer width="100%" height={350}>
                  <PieChart>
                    <Pie
                      data={dadosTipoAcao}
                      cx="50%"
                      cy="50%"
                      outerRadius={120}
                      dataKey="value"
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      labelLine={false}
                    >
                      {dadosTipoAcao.map((_, i) => (
                        <Cell key={i} fill={CORES[i % CORES.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={dadosTipoAcao} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" width={180} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="value" name="Quantidade">
                      {dadosTipoAcao.map((_, i) => (
                        <Cell key={i} fill={CORES[i % CORES.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="status">
          <Card>
            <CardHeader>
              <CardTitle>Processos por Status</CardTitle>
              <CardDescription>Distribuição dos processos por status atual</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                <ResponsiveContainer width="100%" height={350}>
                  <PieChart>
                    <Pie
                      data={dadosStatus}
                      cx="50%"
                      cy="50%"
                      outerRadius={120}
                      dataKey="value"
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    >
                      {dadosStatus.map((_, i) => (
                        <Cell key={i} fill={CORES[i % CORES.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-3">
                  {dadosStatus.map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.fill }} />
                        <span className="text-sm font-medium">{item.name}</span>
                      </div>
                      <Badge variant="outline">{item.value}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="honorarios">
          <Card>
            <CardHeader>
              <CardTitle>Honorários por Status</CardTitle>
              <CardDescription>Valores de honorários e cumprimentos por categoria</CardDescription>
            </CardHeader>
            <CardContent>
              {dadosHonorarios.length > 0 ? (
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={dadosHonorarios}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(value: number) => formatarMoeda(value)} />
                    <Legend />
                    <Bar dataKey="valor" name="Valor (R$)">
                      {dadosHonorarios.map((_, i) => (
                        <Cell key={i} fill={CORES[i % CORES.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  Nenhum dado de honorários registrado ainda.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="produtividade">
          <Card>
            <CardHeader>
              <CardTitle>Produtividade no Período</CardTitle>
              <CardDescription>
                {produtividade ? `${produtividade.totalJobs} jobs no período • Tempo médio: ${produtividade.tempoMedioFormatado}` : "Carregando..."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {produtividade && produtividade.porDia.length > 0 ? (
                <>
                  <div className="grid gap-4 md:grid-cols-4 mb-6">
                    <div className="p-3 rounded-lg border text-center">
                      <p className="text-xs text-muted-foreground">Total Jobs</p>
                      <p className="text-xl font-bold">{produtividade.totalJobs}</p>
                    </div>
                    <div className="p-3 rounded-lg border text-center">
                      <p className="text-xs text-muted-foreground">Importações</p>
                      <p className="text-xl font-bold text-blue-500">{produtividade.importacoes}</p>
                    </div>
                    <div className="p-3 rounded-lg border text-center">
                      <p className="text-xs text-muted-foreground">Relatórios</p>
                      <p className="text-xl font-bold text-green-500">{produtividade.relatoriosGerados}</p>
                    </div>
                    <div className="p-3 rounded-lg border text-center">
                      <p className="text-xs text-muted-foreground">Tempo Médio</p>
                      <p className="text-xl font-bold text-purple-500">{produtividade.tempoMedioFormatado}</p>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={350}>
                    <LineChart data={produtividade.porDia}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="dia" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="importacoes" name="Importações" stroke="#3b82f6" strokeWidth={2} />
                      <Line type="monotone" dataKey="relatorios" name="Relatórios" stroke="#10b981" strokeWidth={2} />
                      <Line type="monotone" dataKey="exportacoes" name="Exportações" stroke="#f59e0b" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  Nenhum job registrado no período selecionado.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
