import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Users, FileText, Scale, DollarSign, RefreshCw, Upload, Download,
  Shield, BookOpen, Briefcase, MapPin, TrendingUp, Gavel, Building2,
  ChevronRight, BarChart3, Target, Brain
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";

export default function Dashboard() {
  const stats = trpc.clientes.stats.useQuery();
  const analise = trpc.analise.visaoGeral.useQuery();
  const [, setLocation] = useLocation();

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
    { title: "Valor Total em Causas", value: formatCurrency(est?.valorTotalCausas ?? stats.data?.valorTotalCausas ?? 0), icon: DollarSign, color: "text-[oklch(0.75_0.12_85)]", bgColor: "bg-[oklch(0.75_0.12_85)]/10" },
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
