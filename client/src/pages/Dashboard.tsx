import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Users, FileText, Scale, DollarSign, RefreshCw, Upload, Download,
  Shield, BookOpen, Briefcase, MapPin, TrendingUp, Gavel, Building2,
  ChevronRight, BarChart3, Target, Brain, Banknote, CheckCircle2, Clock, AlertCircle, Landmark, Receipt,
  ExternalLink, Calendar, Bell, Search, Radar, Activity, PieChart, Globe, Zap, ArrowRightLeft
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";
import { useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart as RechartsPieChart, Pie, Cell, Legend, AreaChart, Area, LineChart, Line
} from "recharts";

const CORES_GRAFICO = [
  "#2563eb", "#16a34a", "#ea580c", "#9333ea", "#0891b2",
  "#dc2626", "#ca8a04", "#4f46e5", "#059669", "#d946ef"
];

const CORES_STATUS = {
  "pago_levantado": "#16a34a",
  "depositado_a_levantar": "#ca8a04",
  "pendente": "#dc2626",
  "parcial": "#ea580c",
  "cancelado": "#6b7280",
};

export default function Dashboard() {
  const stats = trpc.clientes.stats.useQuery();
  const analise = trpc.analise.visaoGeral.useQuery();
  const evolucao = trpc.dashboard.evolucao.useQuery();
  const [, setLocation] = useLocation();
  const [varreduraAtiva, setVarreduraAtiva] = useState(false);
  const [varreduraResult, setVarreduraResult] = useState<any>(null);

  const reprocessarFinanceiro = trpc.jobs.reprocessarFinanceiro.useMutation({
    onSuccess: (data) => {
      stats.refetch();
      alert(`Reprocessamento concluído!\n${data.message}`);
    },
    onError: (err) => alert(`Erro: ${err.message}`),
  });

  const varreduraDataJud = trpc.dashboard.varreduraDataJud.useMutation({
    onSuccess: (data) => {
      setVarreduraAtiva(false);
      setVarreduraResult(data);
      stats.refetch();
      analise.refetch();
      evolucao.refetch();
    },
    onError: (err) => {
      setVarreduraAtiva(false);
      alert(`Erro na varredura: ${err.message}`);
    },
  });

  const formatCurrency = (value: number | string) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (isNaN(num)) return "R$ 0,00";
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num);
  };

  const formatMes = (mes: string) => {
    if (!mes) return "";
    const [ano, m] = mes.split("-");
    const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return `${meses[parseInt(m) - 1]}/${ano?.slice(2)}`;
  };

  const est = analise.data?.estatisticas;
  const registros = analise.data?.registros || [];
  const evol = evolucao.data;

  // Todos os useMemo ANTES de qualquer return condicional (regras de hooks do React)
  const dadosPizza = useMemo(() => {
    return (evol?.processosPorTipo || []).map((p, i) => ({
      name: p.tipo?.length > 25 ? p.tipo.substring(0, 22) + "..." : p.tipo,
      value: p.count,
      fill: CORES_GRAFICO[i % CORES_GRAFICO.length],
    }));
  }, [evol?.processosPorTipo]);

  const dadosHonorarios = useMemo(() => {
    return (evol?.honorariosPorStatus || []).map(h => ({
      name: h.status === "pago_levantado" ? "Pago" : h.status === "depositado_a_levantar" ? "Dep./A Levantar" : h.status === "pendente" ? "Pendente" : h.status === "parcial" ? "Parcial" : h.status === "cancelado" ? "Cancelado" : h.status,
      total: h.total,
      count: h.count,
      fill: (CORES_STATUS as any)[h.status] || "#6b7280",
    }));
  }, [evol?.honorariosPorStatus]);

  const dadosMovimentacoes = useMemo(() => {
    return (evol?.movimentacoesPorMes || []).map(m => ({
      mes: formatMes(m.mes),
      movimentacoes: m.count,
    }));
  }, [evol?.movimentacoesPorMes]);

  const dadosStatus = useMemo(() => {
    return (evol?.processosPorStatus || []).map((p, i) => ({
      name: p.status?.length > 20 ? p.status.substring(0, 17) + "..." : p.status,
      value: p.count,
      fill: CORES_GRAFICO[i % CORES_GRAFICO.length],
    }));
  }, [evol?.processosPorStatus]);

  const dadosClientes = useMemo(() => {
    return (evol?.clientesPorMes || []).map(c => ({
      mes: formatMes(c.mes),
      clientes: c.count,
    }));
  }, [evol?.clientesPorMes]);

  const isLoading = stats.isLoading || analise.isLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Painel Geral</h1>
          <p className="text-muted-foreground mt-1">Carregando visão geral...</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-40 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  const perfilEscritorio = registros.filter(r => r.categoria === "institucional");
  const estatisticas = registros.filter(r => r.categoria === "estatisticas");
  const conhecimento = registros.filter(r => r.categoria === "conhecimento");
  const diagnostico = registros.filter(r => r.categoria === "diagnostico");

  const mainCards = [
    { title: "Clientes Ativos", value: est?.totalClientes ?? stats.data?.totalClientes ?? 0, icon: Users, color: "text-blue-600", bgColor: "bg-blue-500/10", link: "/clientes" },
    { title: "Processos Judiciais", value: est?.totalProcessos ?? stats.data?.totalProcessos ?? 0, icon: FileText, color: "text-amber-600", bgColor: "bg-amber-500/10", link: "/clientes" },
    { title: "Conhecimentos Jurídicos", value: est?.totalConhecimentos ?? 0, icon: Brain, color: "text-emerald-600", bgColor: "bg-emerald-500/10", link: "/conhecimentos" },
    { title: "Estratégias Processuais", value: est?.totalEstrategias ?? 0, icon: Target, color: "text-red-600", bgColor: "bg-red-500/10", link: "/conhecimentos" },
    { title: "Documentos Armazenados", value: est?.totalDocumentos ?? 0, icon: Briefcase, color: "text-purple-600", bgColor: "bg-purple-500/10", link: "/exportacao" },
    { title: "Honorários Totais", value: formatCurrency(stats.data?.honorarios?.total ?? 0), icon: Banknote, color: "text-emerald-600", bgColor: "bg-emerald-500/10", link: "/relatorios" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Visão Geral — Melo &amp; Preda Advogados</h1>
          <p className="text-muted-foreground mt-1">
            Banco de dados jurídico integrado com análise técnica aprofundada
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => { stats.refetch(); analise.refetch(); evolucao.refetch(); }} disabled={stats.isFetching || analise.isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${stats.isFetching || analise.isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button
            variant="default"
            size="sm"
            className="bg-blue-600 hover:bg-blue-700"
            onClick={() => { setVarreduraAtiva(true); varreduraDataJud.mutate(); }}
            disabled={varreduraAtiva || varreduraDataJud.isPending}
          >
            <Radar className={`h-4 w-4 mr-2 ${varreduraAtiva ? "animate-spin" : ""}`} />
            {varreduraAtiva ? "Varrendo DataJud..." : "Varredura DataJud"}
          </Button>
        </div>
      </div>

      {/* Boas-vindas e Visão do Projeto */}
      <Card className="border-0 bg-gradient-to-r from-amber-900/20 via-amber-800/10 to-transparent">
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="flex-1 space-y-3">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Scale className="h-6 w-6 text-amber-500" />
                Sistema Jurídico Integrado
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Plataforma de intensificação de análise técnica e aprofundada de processos judiciais com peticionamento
                técnico fundamentado, formatado no papel timbrado do escritório Melo &amp; Preda Advogados.
                Integração com DataJud, Projudi, PJe e JUSCONSIG 3.0 para automação completa do fluxo processual.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Badge variant="outline" className="text-xs bg-amber-500/10 border-amber-500/30"><Upload className="h-3 w-3 mr-1" /> Importação Automática</Badge>
                <Badge variant="outline" className="text-xs bg-blue-500/10 border-blue-500/30"><Brain className="h-3 w-3 mr-1" /> Análise por IA</Badge>
                <Badge variant="outline" className="text-xs bg-emerald-500/10 border-emerald-500/30"><FileText className="h-3 w-3 mr-1" /> Peticionamento</Badge>
                <Badge variant="outline" className="text-xs bg-purple-500/10 border-purple-500/30"><ArrowRightLeft className="h-3 w-3 mr-1" /> Integração JUSCONSIG</Badge>
              </div>
            </div>
            <div className="flex flex-col gap-2 min-w-[200px]">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fluxo de Automação</span>
              <div className="space-y-1.5">
                {[
                  { step: "1", label: "Upload de processos (PDF/lote)", color: "bg-amber-500" },
                  { step: "2", label: "Extração e análise por IA", color: "bg-blue-500" },
                  { step: "3", label: "Geração de estratégias e petições", color: "bg-emerald-500" },
                  { step: "4", label: "Varredura DataJud + PJe", color: "bg-purple-500" },
                  { step: "5", label: "Sincronização JUSCONSIG 3.0", color: "bg-red-500" },
                ].map(item => (
                  <div key={item.step} className="flex items-center gap-2">
                    <span className={`${item.color} text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center`}>{item.step}</span>
                    <span className="text-xs text-muted-foreground">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resultado da Varredura */}
      {varreduraResult && (
        <Card className="border-2 border-blue-500/30 bg-blue-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Radar className="h-5 w-5 text-blue-600" />
              <span className="font-semibold text-sm">Varredura DataJud concluída:</span>
              <Badge variant="outline">{varreduraResult.consultados} processos consultados</Badge>
              <Badge variant={varreduraResult.novasMovimentacoes > 0 ? "default" : "outline"} className={varreduraResult.novasMovimentacoes > 0 ? "bg-green-600" : ""}>
                {varreduraResult.novasMovimentacoes} novas movimentações
              </Badge>
              {varreduraResult.erros > 0 && <Badge variant="destructive">{varreduraResult.erros} erros</Badge>}
              <Button variant="ghost" size="sm" onClick={() => setVarreduraResult(null)}>Fechar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cards de Estatísticas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {mainCards.map((card, i) => (
          <Card key={i} className="border shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => setLocation(card.link)}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
              <div className={`p-2 rounded-lg ${card.bgColor}`}>
                <card.icon className={`h-5 w-5 ${card.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ==================== GRÁFICOS DE EVOLUÇÃO TEMPORAL ==================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Gráfico: Movimentações por Mês */}
        <Card className="border shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-600" />
              <CardTitle className="text-lg">Movimentações Processuais</CardTitle>
            </div>
            <CardDescription>Evolução mensal das movimentações registradas</CardDescription>
          </CardHeader>
          <CardContent>
            {dadosMovimentacoes.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={dadosMovimentacoes}>
                  <defs>
                    <linearGradient id="colorMov" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value: number) => [`${value} movimentações`, "Total"]} />
                  <Area type="monotone" dataKey="movimentacoes" stroke="#2563eb" fillOpacity={1} fill="url(#colorMov)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">
                <Activity className="h-8 w-8 mr-2 opacity-30" /> Sem dados de movimentações ainda
              </div>
            )}
          </CardContent>
        </Card>

        {/* Gráfico: Processos por Tipo de Ação (Pizza) */}
        <Card className="border shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <PieChart className="h-5 w-5 text-purple-600" />
              <CardTitle className="text-lg">Processos por Tipo de Ação</CardTitle>
            </div>
            <CardDescription>Distribuição por natureza processual</CardDescription>
          </CardHeader>
          <CardContent>
            {dadosPizza.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <RechartsPieChart>
                  <Pie data={dadosPizza} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`} labelLine={true}>
                    {dadosPizza.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => [`${value} processos`, "Quantidade"]} />
                </RechartsPieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">
                <PieChart className="h-8 w-8 mr-2 opacity-30" /> Sem dados de processos ainda
              </div>
            )}
          </CardContent>
        </Card>

        {/* Gráfico: Honorários por Status */}
        <Card className="border shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-emerald-600" />
              <CardTitle className="text-lg">Honorários por Status</CardTitle>
            </div>
            <CardDescription>Valores em reais por situação de pagamento</CardDescription>
          </CardHeader>
          <CardContent>
            {dadosHonorarios.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={dadosHonorarios}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: number) => [formatCurrency(value), "Valor"]} />
                  <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                    {dadosHonorarios.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">
                <Banknote className="h-8 w-8 mr-2 opacity-30" /> Sem dados de honorários ainda
              </div>
            )}
          </CardContent>
        </Card>

        {/* Gráfico: Clientes por Mês */}
        <Card className="border shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-amber-600" />
              <CardTitle className="text-lg">Evolução de Clientes</CardTitle>
            </div>
            <CardDescription>Novos clientes cadastrados por mês</CardDescription>
          </CardHeader>
          <CardContent>
            {dadosClientes.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={dadosClientes}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value: number) => [`${value} clientes`, "Novos"]} />
                  <Line type="monotone" dataKey="clientes" stroke="#ea580c" strokeWidth={2} dot={{ fill: "#ea580c", r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">
                <Users className="h-8 w-8 mr-2 opacity-30" /> Sem dados de clientes ainda
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ==================== PAINEL FINANCEIRO CONSOLIDADO ==================== */}
      <Card className="border-2 border-emerald-500/30 shadow-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-emerald-600" />
            <CardTitle className="text-lg">Painel Financeiro — Honorários Advocatícios</CardTitle>
          </div>
          <CardDescription>Visão consolidada de honorários sucumbenciais, depósitos judiciais e alvarás de todos os processos</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Banknote className="h-4 w-4" /> Honorários Advocatícios Sucumbenciais
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="border rounded-lg p-4 bg-green-500/5">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase">Pagos / Levantados</span>
                </div>
                <p className="text-2xl font-bold text-green-700 dark:text-green-400">{formatCurrency(stats.data?.honorarios?.pagosLevantados ?? 0)}</p>
              </div>
              <div className="border rounded-lg p-4 bg-amber-500/5">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-amber-600" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase">Depositados / A Levantar</span>
                </div>
                <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{formatCurrency(stats.data?.honorarios?.depositadosALevantar ?? 0)}</p>
              </div>
              <div className="border rounded-lg p-4 bg-red-500/5">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase">Pendentes</span>
                </div>
                <p className="text-2xl font-bold text-red-700 dark:text-red-400">{formatCurrency(stats.data?.honorarios?.pendentes ?? 0)}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Landmark className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-semibold">Depósitos Judiciais</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Depositado</span>
                  <span className="font-medium">{formatCurrency(stats.data?.depositos?.total ?? 0)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-green-600">Levantados</span>
                  <span className="font-medium text-green-600">{formatCurrency(stats.data?.depositos?.levantados ?? 0)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-amber-600">A Levantar</span>
                  <span className="font-medium text-amber-600">{formatCurrency(stats.data?.depositos?.aLevantar ?? 0)}</span>
                </div>
                <Progress value={(stats.data?.depositos?.total ?? 0) > 0 ? ((stats.data?.depositos?.levantados ?? 0) / (stats.data?.depositos?.total ?? 1)) * 100 : 0} className="h-2" />
              </div>
            </div>
            <div className="border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Receipt className="h-4 w-4 text-purple-600" />
                <span className="text-sm font-semibold">Alvarás de Levantamento</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total em Alvarás</span>
                  <span className="font-medium">{formatCurrency(stats.data?.alvaras?.total ?? 0)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-green-600">Levantados</span>
                  <span className="font-medium text-green-600">{formatCurrency(stats.data?.alvaras?.levantados ?? 0)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-amber-600">Pendentes</span>
                  <span className="font-medium text-amber-600">{formatCurrency(stats.data?.alvaras?.pendentes ?? 0)}</span>
                </div>
                <Progress value={(stats.data?.alvaras?.total ?? 0) > 0 ? ((stats.data?.alvaras?.levantados ?? 0) / (stats.data?.alvaras?.total ?? 1)) * 100 : 0} className="h-2" />
              </div>
            </div>
          </div>

          {(stats.data?.honorarios?.total ?? 0) === 0 && (stats.data?.depositos?.total ?? 0) === 0 && (
            <div className="text-center py-4 text-muted-foreground">
              <Banknote className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Os dados financeiros serão extraídos automaticamente ao importar processos</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => reprocessarFinanceiro.mutate()}
                disabled={reprocessarFinanceiro.isPending}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${reprocessarFinanceiro.isPending ? 'animate-spin' : ''}`} />
                {reprocessarFinanceiro.isPending ? 'Reprocessando...' : 'Reprocessar Dados Financeiros'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ==================== LINKS PARA ÓRGÃOS JURÍDICOS ==================== */}
      {/* Quadros de Órgãos com Links Específicos para Serviços */}
      <Card className="border shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-blue-600" />
            <CardTitle className="text-lg">Órgãos e Sistemas Jurídicos</CardTitle>
          </div>
          <CardDescription>Acesso rápido aos portais e serviços específicos de cada órgão</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* TJ-GO */}
            <div className="rounded-xl border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-teal-500/10"><Landmark className="h-5 w-5 text-teal-600" /></div>
                <div>
                  <span className="text-sm font-bold block">TJ-GO</span>
                  <span className="text-[10px] text-muted-foreground">Tribunal de Justiça de Goiás</span>
                </div>
              </div>
              <div className="space-y-1">
                <a href="https://www.tjgo.jus.br" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"><ExternalLink className="h-3 w-3" /> Portal Principal</a>
                <a href="https://pje.tjgo.jus.br" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"><ExternalLink className="h-3 w-3" /> PJe - Processo Eletrônico</a>
                <a href="https://projudi.tjgo.jus.br" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"><ExternalLink className="h-3 w-3" /> Projudi</a>
                <a href="https://www.tjgo.jus.br/jurisprudencia" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"><ExternalLink className="h-3 w-3" /> Jurisprudência TJ-GO</a>
                <a href="https://www.tjgo.jus.br/index.php/consulta-processual" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"><ExternalLink className="h-3 w-3" /> Consulta Processual</a>
              </div>
            </div>
            {/* CNJ */}
            <div className="rounded-xl border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-blue-500/10"><Gavel className="h-5 w-5 text-blue-600" /></div>
                <div>
                  <span className="text-sm font-bold block">CNJ</span>
                  <span className="text-[10px] text-muted-foreground">Conselho Nacional de Justiça</span>
                </div>
              </div>
              <div className="space-y-1">
                <a href="https://www.cnj.jus.br" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"><ExternalLink className="h-3 w-3" /> Portal CNJ</a>
                <a href="https://datajud-wiki.cnj.jus.br" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"><ExternalLink className="h-3 w-3" /> DataJud - Base Nacional</a>
                <a href="https://www.cnj.jus.br/poder-judiciario/consulta-processual-cnj/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"><ExternalLink className="h-3 w-3" /> Consulta Processual CNJ</a>
                <a href="https://paineis.cnj.jus.br" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"><ExternalLink className="h-3 w-3" /> Painéis Estatísticos</a>
                <a href="https://atos.cnj.jus.br/atos" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"><ExternalLink className="h-3 w-3" /> Atos Normativos</a>
              </div>
            </div>
            {/* Receita Federal */}
            <div className="rounded-xl border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-green-500/10"><Building2 className="h-5 w-5 text-green-600" /></div>
                <div>
                  <span className="text-sm font-bold block">Receita Federal</span>
                  <span className="text-[10px] text-muted-foreground">Consultas e Certidões</span>
                </div>
              </div>
              <div className="space-y-1">
                <a href="https://www.gov.br/receitafederal" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"><ExternalLink className="h-3 w-3" /> Portal Receita Federal</a>
                <a href="https://servicos.receita.fazenda.gov.br/Servicos/CPF/ConsultaSituacao/ConsultaPublica.asp" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"><ExternalLink className="h-3 w-3" /> Consulta CPF</a>
                <a href="https://solucoes.receita.fazenda.gov.br/Servicos/cnpjreva/cnpjreva_solicitacao.asp" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"><ExternalLink className="h-3 w-3" /> Cartão CNPJ</a>
                <a href="https://solucoes.receita.fazenda.gov.br/Servicos/certidaointernet/PF/Emitir" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"><ExternalLink className="h-3 w-3" /> CND Pessoa Física</a>
                <a href="https://cav.receita.fazenda.gov.br" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"><ExternalLink className="h-3 w-3" /> e-CAC</a>
              </div>
            </div>
            {/* STJ */}
            <div className="rounded-xl border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-indigo-500/10"><BookOpen className="h-5 w-5 text-indigo-600" /></div>
                <div>
                  <span className="text-sm font-bold block">STJ</span>
                  <span className="text-[10px] text-muted-foreground">Superior Tribunal de Justiça</span>
                </div>
              </div>
              <div className="space-y-1">
                <a href="https://www.stj.jus.br" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"><ExternalLink className="h-3 w-3" /> Portal STJ</a>
                <a href="https://scon.stj.jus.br/SCON/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"><ExternalLink className="h-3 w-3" /> Jurisprudência STJ</a>
                <a href="https://www.stj.jus.br/sites/portalp/Paginas/Comunicacao/Noticias/Sumulas.aspx" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"><ExternalLink className="h-3 w-3" /> Súmulas STJ</a>
                <a href="https://processo.stj.jus.br/processo/pesquisa/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"><ExternalLink className="h-3 w-3" /> Consulta Processual</a>
              </div>
            </div>
            {/* OAB-GO */}
            <div className="rounded-xl border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-orange-500/10"><Shield className="h-5 w-5 text-orange-600" /></div>
                <div>
                  <span className="text-sm font-bold block">OAB-GO</span>
                  <span className="text-[10px] text-muted-foreground">Ordem dos Advogados - Goiás</span>
                </div>
              </div>
              <div className="space-y-1">
                <a href="https://www.oabgo.org.br" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"><ExternalLink className="h-3 w-3" /> Portal OAB-GO</a>
                <a href="https://cna.oab.org.br" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"><ExternalLink className="h-3 w-3" /> CNA - Cadastro Nacional</a>
                <a href="https://www.oabgo.org.br/oab-go/anuidade/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"><ExternalLink className="h-3 w-3" /> Anuidade OAB</a>
                <a href="https://www.oabgo.org.br/oab-go/servicos/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"><ExternalLink className="h-3 w-3" /> Serviços OAB</a>
              </div>
            </div>
            {/* Outros Portais */}
            <div className="rounded-xl border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-purple-500/10"><Scale className="h-5 w-5 text-purple-600" /></div>
                <div>
                  <span className="text-sm font-bold block">Outros Portais</span>
                  <span className="text-[10px] text-muted-foreground">Serviços complementares</span>
                </div>
              </div>
              <div className="space-y-1">
                <a href="https://www.planalto.gov.br/ccivil_03/leis/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"><ExternalLink className="h-3 w-3" /> Legislação Federal</a>
                <a href="https://www.jusbrasil.com.br" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"><ExternalLink className="h-3 w-3" /> JusBrasil</a>
                <a href="https://www.gabinetedigital.go.gov.br/legisla-web/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"><ExternalLink className="h-3 w-3" /> Legislação GO</a>
                <a href="https://sei.go.gov.br" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"><ExternalLink className="h-3 w-3" /> SEI Goiás</a>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Processos por Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Tipos de Ação */}
        <Card className="border shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-600" />
              <CardTitle className="text-lg">Tipos de Ação Judicial</CardTitle>
            </div>
            <CardDescription>Distribuição por natureza da ação</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(est?.tiposAcao || []).map((t: any, i: number) => {
              const total = est?.totalProcessos || 1;
              const perc = Math.round((t.count / total) * 100);
              return (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium truncate max-w-[70%]">{t.tipo || "Não classificado"}</span>
                    <span className="text-muted-foreground">{t.count} ({perc}%)</span>
                  </div>
                  <Progress value={perc} className="h-2" />
                </div>
              );
            })}
            {(!est?.tiposAcao || est.tiposAcao.length === 0) && (
              <p className="text-sm text-muted-foreground italic">Importe processos para ver a distribuição.</p>
            )}
          </CardContent>
        </Card>

        {/* Fases Processuais */}
        <Card className="border shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
              <CardTitle className="text-lg">Fases Processuais</CardTitle>
            </div>
            <CardDescription>Status atual dos processos</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(est?.fases || []).map((f: any, i: number) => {
              const total = est?.totalProcessos || 1;
              const perc = Math.round((f.count / total) * 100);
              return (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{f.fase || "Indefinida"}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{f.count}</span>
                    <span className="text-xs text-muted-foreground">({perc}%)</span>
                  </div>
                </div>
              );
            })}
            {(!est?.fases || est.fases.length === 0) && (
              <p className="text-sm text-muted-foreground italic">Importe processos para ver as fases.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Perfil do Escritório + Área de Atuação */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-600" />
              <CardTitle className="text-lg">Perfil do Escritório</CardTitle>
            </div>
            <CardDescription>Dados institucionais e identidade profissional</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {perfilEscritorio.length > 0 ? (
              perfilEscritorio.map((r, i) => (
                <div key={i} className="flex flex-col gap-1 p-3 rounded-lg bg-muted/50">
                  <span className="text-sm font-semibold text-blue-600">{r.titulo}</span>
                  <span className="text-sm text-muted-foreground leading-relaxed">{r.conteudo}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground italic">Dados do perfil serão preenchidos automaticamente com a análise dos processos.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-amber-600" />
              <CardTitle className="text-lg">Áreas de Atuação</CardTitle>
            </div>
            <CardDescription>Especialidades identificadas nos processos</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {estatisticas.length > 0 ? (
              estatisticas.map((r, i) => (
                <div key={i} className="flex flex-col gap-1 p-3 rounded-lg bg-muted/50">
                  <span className="text-sm font-semibold text-amber-600">{r.titulo}</span>
                  <span className="text-sm text-muted-foreground leading-relaxed">{r.conteudo}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground italic">Áreas de atuação serão identificadas com a análise dos processos.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Teses + Fundamentação */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Gavel className="h-5 w-5 text-blue-600" />
              <CardTitle className="text-lg">Teses Jurídicas Principais</CardTitle>
            </div>
            <CardDescription>Argumentação central utilizada nos processos</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {conhecimento.filter(r => r.titulo?.includes("Tese")).length > 0 ? (
              conhecimento.filter(r => r.titulo?.includes("Tese")).map((r, i) => (
                <div key={i} className="p-3 rounded-lg bg-muted/50 border-l-4 border-blue-600">
                  <span className="text-sm font-semibold block mb-1">{r.titulo}</span>
                  <span className="text-sm text-muted-foreground leading-relaxed">{r.conteudo}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground italic">Teses serão identificadas com a análise dos processos.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-emerald-600" />
              <CardTitle className="text-lg">Fundamentação Legal</CardTitle>
            </div>
            <CardDescription>Base normativa e legislação aplicada</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {conhecimento.filter(r => r.titulo?.includes("Fundamentação")).length > 0 ? (
              conhecimento.filter(r => r.titulo?.includes("Fundamentação")).map((r, i) => (
                <div key={i} className="p-3 rounded-lg bg-muted/50 border-l-4 border-emerald-600">
                  <span className="text-sm font-semibold block mb-1">{r.titulo}</span>
                  <span className="text-sm text-muted-foreground leading-relaxed">{r.conteudo}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground italic">Fundamentação será extraída dos processos.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Estratégias Processuais */}
      {conhecimento.filter(r => r.titulo?.includes("Estratégia") || r.titulo?.includes("Estilo")).length > 0 && (
        <Card className="border shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-red-600" />
              <CardTitle className="text-lg">Estratégias Processuais Avançadas</CardTitle>
            </div>
            <CardDescription>Padrões de atuação identificados nos processos</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {conhecimento.filter((r: any) => r.titulo?.includes("Estratégia") || r.titulo?.includes("Estilo")).map((r: any, i: number) => (
                <div key={i} className="p-3 rounded-lg bg-muted/50">
                  <span className="text-sm font-semibold text-red-600 block mb-1">{r.titulo}</span>
                  <span className="text-sm text-muted-foreground leading-relaxed">{r.conteudo}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Diagnóstico e Oportunidades */}
      {diagnostico.length > 0 && (
        <Card className="border shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
              <CardTitle className="text-lg">Diagnóstico e Oportunidades</CardTitle>
            </div>
            <CardDescription>Análise de crescimento e potencial do banco de dados</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {diagnostico.map((r, i) => (
                <div key={i} className="p-3 rounded-lg bg-muted/50 border-l-4 border-emerald-600">
                  <span className="text-sm font-semibold block mb-1">{r.titulo}</span>
                  <span className="text-sm text-muted-foreground leading-relaxed">{r.conteudo}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Distribuição Geográfica */}
      {est?.cidades && est.cidades.length > 0 && (
        <Card className="border shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-blue-600" />
              <CardTitle className="text-lg">Distribuição Geográfica dos Clientes</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {est.cidades.map((c: any, i: number) => (
                <Badge key={i} variant="outline" className="text-sm py-1 px-3">
                  {c.cidade}: {c.count} {c.count === 1 ? "cliente" : "clientes"}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* ==================== AÇÕES RÁPIDAS EXPANDIDAS ==================== */}
      <Card className="border shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-600" />
            <CardTitle className="text-lg">Ações Rápidas</CardTitle>
          </div>
          <CardDescription>Acesse todas as funcionalidades do sistema</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" onClick={() => setLocation("/upload")}>
              <Upload className="h-6 w-6 text-blue-600" />
              <span className="text-sm font-medium">Importar Processos</span>
              <span className="text-xs text-muted-foreground">Upload de PDFs com extração IA</span>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" onClick={() => setLocation("/clientes")}>
              <Users className="h-6 w-6 text-amber-600" />
              <span className="text-sm font-medium">Banco de Clientes</span>
              <span className="text-xs text-muted-foreground">{est?.totalClientes || 0} clientes cadastrados</span>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" onClick={() => setLocation("/prazos")}>
              <Calendar className="h-6 w-6 text-red-600" />
              <span className="text-sm font-medium">Prazos Processuais</span>
              <span className="text-xs text-muted-foreground">Calendário e alertas</span>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" onClick={() => setLocation("/acompanhamento")}>
              <Radar className="h-6 w-6 text-purple-600" />
              <span className="text-sm font-medium">Acompanhamento PJe</span>
              <span className="text-xs text-muted-foreground">Consulta DataJud/CNJ</span>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" onClick={() => setLocation("/agente-ia")}>
              <Brain className="h-6 w-6 text-emerald-600" />
              <span className="text-sm font-medium">Agente Jurídico IA</span>
              <span className="text-xs text-muted-foreground">Chat e petições inteligentes</span>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" onClick={() => setLocation("/relatorios")}>
              <FileText className="h-6 w-6 text-teal-600" />
              <span className="text-sm font-medium">Relatórios</span>
              <span className="text-xs text-muted-foreground">6 tipos com exportação PDF</span>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" onClick={() => setLocation("/conhecimentos")}>
              <BookOpen className="h-6 w-6 text-indigo-600" />
              <span className="text-sm font-medium">Conhecimentos</span>
              <span className="text-xs text-muted-foreground">{est?.totalConhecimentos || 0} registros jurídicos</span>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" onClick={() => setLocation("/exportacao")}>
              <Download className="h-6 w-6 text-gray-600" />
              <span className="text-sm font-medium">Exportar Dados</span>
              <span className="text-xs text-muted-foreground">JSON, CSV para integração</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Guia do Fluxo de Trabalho */}
      <Card className="border shadow-sm border-blue-500/30">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ChevronRight className="h-5 w-5 text-blue-600" />
            <CardTitle className="text-lg">Fluxo de Trabalho — Passo a Passo</CardTitle>
          </div>
          <CardDescription>
            Siga esta sequência para processar um caso completo, desde o upload até o relatório final
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-0">
            {[
              { step: 1, icon: Upload, title: "Upload de Processos", badge: "Upload de Processos", desc: "Faça upload do PDF do processo judicial. O sistema extrai automaticamente via IA: dados do cliente, número CNJ, tipo de ação, partes processuais, movimentações e teses jurídicas.", link: "/upload", color: "bg-blue-600" },
              { step: 2, icon: Users, title: "Banco de Clientes", badge: "Clientes", desc: "Após o upload, o cliente é cadastrado automaticamente. Acesse o perfil completo: dados pessoais, processos judiciais com vinculação, movimentações, dados financeiros e empréstimos.", link: "/clientes", color: "bg-amber-600" },
              { step: 3, icon: Brain, title: "Banco de Conhecimentos", badge: "Conhecimentos", desc: "A IA extrai automaticamente teses jurídicas, jurisprudências e legislações de cada processo importado. Consulte, edite e adicione novos conhecimentos.", link: "/conhecimentos", color: "bg-emerald-600" },
              { step: 4, icon: Shield, title: "Correção e Auditoria", badge: "Correção / Deduplicação", desc: "Verifique a saúde dos dados: CPFs pendentes, CNJs inválidos, processos sem movimentações, clientes duplicados. Auditoria completa com ações corretivas.", link: "/correcao", color: "bg-red-600" },
              { step: 5, icon: FileText, title: "Relatórios", badge: "Relatórios", desc: "Gere relatórios individualizados em 6 categorias: Cadastral, Processual, Financeiro, Honorários, Conhecimentos e Prazos. Exporte em PDF ou JSON.", link: "/relatorios", color: "bg-purple-600" },
              { step: 6, icon: Download, title: "Exportação em Massa", badge: "Exportação em Massa", desc: "Exporte todos os dados do sistema em formato JSON ou CSV para integração com outros sistemas, backup ou análise externa.", link: "/exportacao", color: "bg-gray-600" },
            ].map((item, idx) => (
              <div key={idx} className="flex gap-4 cursor-pointer group" onClick={() => setLocation(item.link)}>
                <div className="flex flex-col items-center">
                  <div className={`w-10 h-10 rounded-full ${item.color} text-white flex items-center justify-center font-bold text-sm shadow-md`}>{item.step}</div>
                  {idx < 5 && <div className="w-0.5 h-full bg-blue-500/30 my-1" />}
                </div>
                <div className="flex-1 pb-6 group-hover:bg-muted/30 rounded-lg p-3 -mt-1 transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <item.icon className={`h-4 w-4`} />
                    <h3 className="font-semibold text-sm">{item.title}</h3>
                    <Badge variant="outline" className="text-xs">{item.badge}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
            <p className="text-xs text-muted-foreground">
              <strong>Dica:</strong> Para processos com dependência (ex: cumprimento provisório de sentença), faça upload dos autos principais primeiro e depois do processo dependente. O sistema vincula automaticamente pelo nome do cliente e número CNJ.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Atividade Recente */}
      <Card className="border shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-600" />
              <CardTitle className="text-lg">Atividade Recente</CardTitle>
            </div>
            <Badge variant="outline" className="text-xs">
              <Clock className="h-3 w-3 mr-1" /> Últimas ações
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { icon: Users, text: `${est?.totalClientes ?? 0} clientes cadastrados no sistema`, time: "Base atual", color: "text-blue-600", bg: "bg-blue-500/10" },
              { icon: FileText, text: `${est?.totalProcessos ?? 0} processos judiciais importados e analisados`, time: "Base atual", color: "text-amber-600", bg: "bg-amber-500/10" },
              { icon: Brain, text: `${est?.totalConhecimentos ?? 0} conhecimentos jurídicos extraídos por IA`, time: "Base atual", color: "text-emerald-600", bg: "bg-emerald-500/10" },
              { icon: Target, text: `${est?.totalEstrategias ?? 0} estratégias processuais geradas`, time: "Base atual", color: "text-red-600", bg: "bg-red-500/10" },
              { icon: Banknote, text: `Honorários totais: ${formatCurrency(stats.data?.honorarios?.total ?? 0)}`, time: "Acumulado", color: "text-emerald-600", bg: "bg-emerald-500/10" },
              { icon: Briefcase, text: `${est?.totalDocumentos ?? 0} documentos armazenados no S3`, time: "Base atual", color: "text-purple-600", bg: "bg-purple-500/10" },
            ].map((item, idx) => (
              <div key={idx} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30 transition-colors">
                <div className={`p-1.5 rounded-lg ${item.bg}`}>
                  <item.icon className={`h-4 w-4 ${item.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm">{item.text}</span>
                </div>
                <Badge variant="outline" className="text-[10px] shrink-0">{item.time}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
