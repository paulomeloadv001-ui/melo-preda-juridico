import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Users, FileText, Scale, DollarSign, RefreshCw, Upload, Download,
  Shield, BookOpen, Briefcase, MapPin, TrendingUp, Gavel, Building2,
  ChevronRight, BarChart3, Target, Brain, Banknote, CheckCircle2, Clock, AlertCircle, Landmark, Receipt
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";

export default function Dashboard() {
  const stats = trpc.clientes.stats.useQuery();
  const analise = trpc.analise.visaoGeral.useQuery();
  const [, setLocation] = useLocation();
  const reprocessarFinanceiro = trpc.jobs.reprocessarFinanceiro.useMutation({
    onSuccess: (data) => {
      stats.refetch();
      alert(`Reprocessamento concluído!\n${data.message}`);
    },
    onError: (err) => alert(`Erro: ${err.message}`),
  });

  const formatCurrency = (value: number | string) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (isNaN(num)) return "R$ 0,00";
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num);
  };

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

  const est = analise.data?.estatisticas;
  const registros = analise.data?.registros || [];

  // Agrupar registros por categoria (categorias reais do banco)
  const perfilEscritorio = registros.filter(r => r.categoria === "institucional");
  const estatisticas = registros.filter(r => r.categoria === "estatisticas");
  const conhecimento = registros.filter(r => r.categoria === "conhecimento");
  const financeiro = registros.filter(r => r.categoria === "financeiro");
  const diagnostico = registros.filter(r => r.categoria === "diagnostico");

  const mainCards = [
    { title: "Clientes Ativos", value: est?.totalClientes ?? stats.data?.totalClientes ?? 0, icon: Users, color: "text-[oklch(0.75_0.12_85)]", bgColor: "bg-[oklch(0.75_0.12_85)]/10" },
    { title: "Processos Judiciais", value: est?.totalProcessos ?? stats.data?.totalProcessos ?? 0, icon: FileText, color: "text-[oklch(0.55_0.12_85)]", bgColor: "bg-[oklch(0.55_0.12_85)]/10" },
    { title: "Conhecimentos Jurídicos", value: est?.totalConhecimentos ?? 0, icon: Brain, color: "text-[oklch(0.55_0.15_145)]", bgColor: "bg-[oklch(0.55_0.15_145)]/10" },
    { title: "Estratégias Processuais", value: est?.totalEstrategias ?? 0, icon: Target, color: "text-[oklch(0.65_0.15_30)]", bgColor: "bg-[oklch(0.65_0.15_30)]/10" },
    { title: "Documentos Armazenados", value: est?.totalDocumentos ?? 0, icon: Briefcase, color: "text-[oklch(0.55_0.12_250)]", bgColor: "bg-[oklch(0.55_0.12_250)]/10" },
    { title: "Honorários Totais", value: formatCurrency(stats.data?.honorarios?.total ?? 0), icon: Banknote, color: "text-[oklch(0.55_0.15_145)]", bgColor: "bg-[oklch(0.55_0.15_145)]/10" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Visão Geral — Melo &amp; Preda Advogados</h1>
          <p className="text-muted-foreground mt-1">
            Banco de dados jurídico integrado com análise técnica aprofundada
          </p>
        </div>
        <Button variant="outline" onClick={() => { stats.refetch(); analise.refetch(); }} disabled={stats.isFetching || analise.isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${stats.isFetching || analise.isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Cards de Estatísticas em Tempo Real */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {mainCards.map((card, i) => (
          <Card key={i} className="border shadow-sm hover:shadow-md transition-shadow">
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

      {/* ==================== PAINEL FINANCEIRO CONSOLIDADO ==================== */}
      <Card className="border-2 border-[oklch(0.55_0.15_145)]/30 shadow-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-[oklch(0.55_0.15_145)]" />
            <CardTitle className="text-lg">Painel Financeiro — Honorários Advocatícios</CardTitle>
          </div>
          <CardDescription>Visão consolidada de honorários sucumbenciais, depósitos judiciais e alvarás de todos os processos</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Honorários Sucumbenciais */}
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

          {/* Depósitos e Alvarás */}
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
              <p className="text-xs mt-1">Depósitos judiciais, alvarás, honorários sucumbenciais e pagamentos</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => reprocessarFinanceiro.mutate()}
                disabled={reprocessarFinanceiro.isPending}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${reprocessarFinanceiro.isPending ? 'animate-spin' : ''}`} />
                {reprocessarFinanceiro.isPending ? 'Reprocessando... (pode levar alguns minutos)' : 'Reprocessar Dados Financeiros dos Processos Existentes'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Perfil do Escritório + Área de Atuação */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Perfil do Escritório */}
        <Card className="border shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-[oklch(0.75_0.12_85)]" />
              <CardTitle className="text-lg">Perfil do Escritório</CardTitle>
            </div>
            <CardDescription>Dados institucionais e identidade profissional</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {perfilEscritorio.length > 0 ? (
              perfilEscritorio.map((r, i) => (
                <div key={i} className="flex flex-col gap-1 p-3 rounded-lg bg-muted/50">
                  <span className="text-sm font-semibold text-[oklch(0.75_0.12_85)]">{r.titulo}</span>
                  <span className="text-sm text-muted-foreground leading-relaxed">{r.conteudo}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground italic">Dados do perfil serão preenchidos automaticamente com a análise dos processos.</p>
            )}
          </CardContent>
        </Card>

        {/* Área de Atuação */}
        <Card className="border shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-[oklch(0.75_0.12_85)]" />
              <CardTitle className="text-lg">Áreas de Atuação</CardTitle>
            </div>
            <CardDescription>Especialidades identificadas nos processos</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {estatisticas.length > 0 ? (
              estatisticas.map((r, i) => (
                <div key={i} className="flex flex-col gap-1 p-3 rounded-lg bg-muted/50">
                  <span className="text-sm font-semibold text-[oklch(0.75_0.12_85)]">{r.titulo}</span>
                  <span className="text-sm text-muted-foreground leading-relaxed">{r.conteudo}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground italic">Áreas de atuação serão identificadas com a análise dos processos.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tipos de Ação + Fases Processuais */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Tipos de Ação */}
        <Card className="border shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-[oklch(0.75_0.12_85)]" />
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
              <TrendingUp className="h-5 w-5 text-[oklch(0.75_0.12_85)]" />
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

      {/* Tese Jurídica Principal + Fundamentação Legal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Gavel className="h-5 w-5 text-[oklch(0.75_0.12_85)]" />
              <CardTitle className="text-lg">Teses Jurídicas Principais</CardTitle>
            </div>
            <CardDescription>Argumentação central utilizada nos processos</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {conhecimento.filter(r => r.titulo?.includes("Tese")).length > 0 ? (
              conhecimento.filter(r => r.titulo?.includes("Tese")).map((r, i) => (
                <div key={i} className="p-3 rounded-lg bg-muted/50 border-l-4 border-[oklch(0.75_0.12_85)]">
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
              <BookOpen className="h-5 w-5 text-[oklch(0.75_0.12_85)]" />
              <CardTitle className="text-lg">Fundamentação Legal</CardTitle>
            </div>
            <CardDescription>Base normativa e legislação aplicada</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {conhecimento.filter(r => r.titulo?.includes("Fundamentação")).length > 0 ? (
              conhecimento.filter(r => r.titulo?.includes("Fundamentação")).map((r, i) => (
                <div key={i} className="p-3 rounded-lg bg-muted/50 border-l-4 border-[oklch(0.55_0.15_145)]">
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
              <Target className="h-5 w-5 text-[oklch(0.75_0.12_85)]" />
              <CardTitle className="text-lg">Estratégias Processuais Avançadas</CardTitle>
            </div>
            <CardDescription>Padrões de atuação identificados nos processos</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {conhecimento.filter((r: any) => r.titulo?.includes("Estratégia") || r.titulo?.includes("Estilo")).map((r: any, i: number) => (
                <div key={i} className="p-3 rounded-lg bg-muted/50">
                  <span className="text-sm font-semibold text-[oklch(0.75_0.12_85)] block mb-1">{r.titulo}</span>
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
              <TrendingUp className="h-5 w-5 text-[oklch(0.55_0.15_145)]" />
              <CardTitle className="text-lg">Diagnóstico e Oportunidades</CardTitle>
            </div>
            <CardDescription>Análise de crescimento e potencial do banco de dados</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {diagnostico.map((r, i) => (
                <div key={i} className="p-3 rounded-lg bg-muted/50 border-l-4 border-[oklch(0.55_0.15_145)]">
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
              <MapPin className="h-5 w-5 text-[oklch(0.75_0.12_85)]" />
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

      {/* Guia do Fluxo de Trabalho */}
      <Card className="border shadow-sm border-[oklch(0.75_0.12_85)]/30">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ChevronRight className="h-5 w-5 text-[oklch(0.75_0.12_85)]" />
            <CardTitle className="text-lg">Fluxo de Trabalho — Passo a Passo</CardTitle>
          </div>
          <CardDescription>
            Siga esta sequência para processar um caso completo, desde o upload até o relatório final
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-0">
            {/* Passo 1 - Upload */}
            <div className="flex gap-4 cursor-pointer group" onClick={() => setLocation("/upload")}>
              <div className="flex flex-col items-center">
                <div className="w-10 h-10 rounded-full bg-[oklch(0.75_0.12_85)] text-white flex items-center justify-center font-bold text-sm shadow-md">1</div>
                <div className="w-0.5 h-full bg-[oklch(0.75_0.12_85)]/30 my-1" />
              </div>
              <div className="flex-1 pb-6 group-hover:bg-muted/30 rounded-lg p-3 -mt-1 transition-colors">
                <div className="flex items-center gap-2 mb-1">
                  <Upload className="h-4 w-4 text-[oklch(0.75_0.12_85)]" />
                  <h3 className="font-semibold text-sm">Upload de Processos</h3>
                  <Badge variant="outline" className="text-xs">Aba: Upload de Processos</Badge>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Faça upload do PDF do processo judicial (autos principais). O sistema extrai automaticamente via IA: dados do cliente (nome, CPF, endereço), número CNJ, tipo de ação, partes processuais, movimentações e teses jurídicas.
                </p>
                <p className="text-xs text-muted-foreground mt-1 italic">Também aceita upload de contracheque para extração de dados financeiros detalhados.</p>
              </div>
            </div>

            {/* Passo 2 - Clientes */}
            <div className="flex gap-4 cursor-pointer group" onClick={() => setLocation("/clientes")}>
              <div className="flex flex-col items-center">
                <div className="w-10 h-10 rounded-full bg-[oklch(0.65_0.12_85)] text-white flex items-center justify-center font-bold text-sm shadow-md">2</div>
                <div className="w-0.5 h-full bg-[oklch(0.75_0.12_85)]/30 my-1" />
              </div>
              <div className="flex-1 pb-6 group-hover:bg-muted/30 rounded-lg p-3 -mt-1 transition-colors">
                <div className="flex items-center gap-2 mb-1">
                  <Users className="h-4 w-4 text-[oklch(0.65_0.12_85)]" />
                  <h3 className="font-semibold text-sm">Banco de Clientes</h3>
                  <Badge variant="outline" className="text-xs">Aba: Clientes</Badge>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Após o upload, o cliente é cadastrado automaticamente (ou vinculado a um existente por CPF/nome). Acesse o perfil completo: dados pessoais, processos judiciais com vinculação (principal ↔ cumprimento de sentença), movimentações, partes processuais, dados financeiros e empréstimos consignados.
                </p>
              </div>
            </div>

            {/* Passo 3 - Conhecimentos */}
            <div className="flex gap-4 cursor-pointer group" onClick={() => setLocation("/conhecimentos")}>
              <div className="flex flex-col items-center">
                <div className="w-10 h-10 rounded-full bg-[oklch(0.55_0.15_145)] text-white flex items-center justify-center font-bold text-sm shadow-md">3</div>
                <div className="w-0.5 h-full bg-[oklch(0.75_0.12_85)]/30 my-1" />
              </div>
              <div className="flex-1 pb-6 group-hover:bg-muted/30 rounded-lg p-3 -mt-1 transition-colors">
                <div className="flex items-center gap-2 mb-1">
                  <Brain className="h-4 w-4 text-[oklch(0.55_0.15_145)]" />
                  <h3 className="font-semibold text-sm">Banco de Conhecimentos</h3>
                  <Badge variant="outline" className="text-xs">Aba: Conhecimentos</Badge>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  A IA extrai automaticamente teses jurídicas, jurisprudências e legislações de cada processo importado. Consulte, edite e adicione novos conhecimentos. Filtros por tipo (Tese, Jurisprudência, Legislação) e busca por texto.
                </p>
              </div>
            </div>

            {/* Passo 4 - Correção */}
            <div className="flex gap-4 cursor-pointer group" onClick={() => setLocation("/correcao")}>
              <div className="flex flex-col items-center">
                <div className="w-10 h-10 rounded-full bg-[oklch(0.65_0.15_30)] text-white flex items-center justify-center font-bold text-sm shadow-md">4</div>
                <div className="w-0.5 h-full bg-[oklch(0.75_0.12_85)]/30 my-1" />
              </div>
              <div className="flex-1 pb-6 group-hover:bg-muted/30 rounded-lg p-3 -mt-1 transition-colors">
                <div className="flex items-center gap-2 mb-1">
                  <Shield className="h-4 w-4 text-[oklch(0.65_0.15_30)]" />
                  <h3 className="font-semibold text-sm">Correção e Auditoria</h3>
                  <Badge variant="outline" className="text-xs">Aba: Correção / Deduplicação</Badge>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Verifique a saúde dos dados: CPFs pendentes, CNJs inválidos, processos sem movimentações, dados financeiros ausentes, clientes duplicados. A auditoria completa categoriza cada problema por severidade (crítico, alerta, informativo) com ações corretivas.
                </p>
              </div>
            </div>

            {/* Passo 5 - Relatórios */}
            <div className="flex gap-4 cursor-pointer group" onClick={() => setLocation("/relatorios")}>
              <div className="flex flex-col items-center">
                <div className="w-10 h-10 rounded-full bg-[oklch(0.55_0.12_250)] text-white flex items-center justify-center font-bold text-sm shadow-md">5</div>
                <div className="w-0.5 h-full bg-[oklch(0.75_0.12_85)]/30 my-1" />
              </div>
              <div className="flex-1 pb-6 group-hover:bg-muted/30 rounded-lg p-3 -mt-1 transition-colors">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="h-4 w-4 text-[oklch(0.55_0.12_250)]" />
                  <h3 className="font-semibold text-sm">Relatórios</h3>
                  <Badge variant="outline" className="text-xs">Aba: Relatórios</Badge>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Gere relatórios de Dados Cadastrais em tempo real. Cada relatório é atualizado automaticamente após cada importação. Exporte em PDF ou JSON. Visualize por cliente com detalhes de processos, dados financeiros e empréstimos.
                </p>
              </div>
            </div>

            {/* Passo 6 - Exportação */}
            <div className="flex gap-4 cursor-pointer group" onClick={() => setLocation("/exportacao")}>
              <div className="flex flex-col items-center">
                <div className="w-10 h-10 rounded-full bg-[oklch(0.45_0.12_250)] text-white flex items-center justify-center font-bold text-sm shadow-md">6</div>
                <div className="w-0.5 h-full bg-transparent my-1" />
              </div>
              <div className="flex-1 pb-2 group-hover:bg-muted/30 rounded-lg p-3 -mt-1 transition-colors">
                <div className="flex items-center gap-2 mb-1">
                  <Download className="h-4 w-4 text-[oklch(0.45_0.12_250)]" />
                  <h3 className="font-semibold text-sm">Exportação em Massa</h3>
                  <Badge variant="outline" className="text-xs">Aba: Exportação em Massa</Badge>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Exporte todos os dados do sistema em formato JSON ou CSV para integração com outros sistemas, backup ou análise externa. Inclui clientes, processos, conhecimentos, dados financeiros e movimentações.
                </p>
              </div>
            </div>
          </div>

          {/* Dica */}
          <div className="mt-4 p-3 rounded-lg bg-[oklch(0.75_0.12_85)]/5 border border-[oklch(0.75_0.12_85)]/20">
            <p className="text-xs text-muted-foreground">
              <strong>Dica:</strong> Para processos com dependência (ex: cumprimento provisório de sentença), faça upload dos autos principais primeiro e depois do processo dependente. O sistema vincula automaticamente pelo nome do cliente e número CNJ.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Ações Rápidas */}
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Ações Rápidas</CardTitle>
          <CardDescription>Acesse as funcionalidades do sistema</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" onClick={() => setLocation("/upload")}>
              <Upload className="h-6 w-6 text-[oklch(0.75_0.12_85)]" />
              <span className="text-sm font-medium">Importar Processos</span>
              <span className="text-xs text-muted-foreground">Upload de PDFs com extração IA</span>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" onClick={() => setLocation("/clientes")}>
              <Users className="h-6 w-6 text-[oklch(0.75_0.12_85)]" />
              <span className="text-sm font-medium">Banco de Clientes</span>
              <span className="text-xs text-muted-foreground">{est?.totalClientes || 0} clientes por CPF</span>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" onClick={() => setLocation("/exportacao")}>
              <Download className="h-6 w-6 text-[oklch(0.75_0.12_85)]" />
              <span className="text-sm font-medium">Exportar Dados</span>
              <span className="text-xs text-muted-foreground">JSON, CSV para integração</span>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" onClick={() => setLocation("/conhecimentos")}>
              <Brain className="h-6 w-6 text-[oklch(0.75_0.12_85)]" />
              <span className="text-sm font-medium">Conhecimentos</span>
              <span className="text-xs text-muted-foreground">{est?.totalConhecimentos || 0} registros jurídicos</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
