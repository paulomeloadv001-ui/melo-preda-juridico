import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, FileText, Scale, DollarSign, RefreshCw, Upload, Download, Shield } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";

export default function Dashboard() {
  const stats = trpc.clientes.stats.useQuery();
  const [, setLocation] = useLocation();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  };

  if (stats.isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Painel Geral</h1>
          <p className="text-muted-foreground mt-1">Visão geral do escritório</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  const cards = [
    { title: "Total de Clientes", value: stats.data?.totalClientes ?? 0, icon: Users, color: "text-[oklch(0.75_0.12_85)]" },
    { title: "Total de Processos", value: stats.data?.totalProcessos ?? 0, icon: FileText, color: "text-[oklch(0.55_0.12_85)]" },
    { title: "Processos Ativos", value: stats.data?.processosAtivos ?? 0, icon: Scale, color: "text-[oklch(0.55_0.15_145)]" },
    { title: "Valor Total em Causas", value: formatCurrency(stats.data?.valorTotalCausas ?? 0), icon: DollarSign, color: "text-[oklch(0.75_0.12_85)]" },
  ];

  return (
    <div className="space-y-6">
      {/* Header com botão Atualizar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Painel Geral</h1>
          <p className="text-muted-foreground mt-1">Visão geral do escritório Melo &amp; Preda Advogados</p>
        </div>
        <Button variant="outline" onClick={() => stats.refetch()} disabled={stats.isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${stats.isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Cards de estatísticas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card, i) => (
          <Card key={i} className="border shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
              <card.icon className={`h-5 w-5 ${card.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Ações Rápidas */}
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Ações Rápidas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" onClick={() => setLocation("/upload")}>
              <Upload className="h-6 w-6 text-[oklch(0.75_0.12_85)]" />
              <span className="text-sm font-medium">Importar Processos</span>
              <span className="text-xs text-muted-foreground">Upload de PDFs</span>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" onClick={() => setLocation("/clientes")}>
              <Users className="h-6 w-6 text-[oklch(0.75_0.12_85)]" />
              <span className="text-sm font-medium">Ver Clientes</span>
              <span className="text-xs text-muted-foreground">Banco de dados por CPF</span>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" onClick={() => setLocation("/exportacao")}>
              <Download className="h-6 w-6 text-[oklch(0.75_0.12_85)]" />
              <span className="text-sm font-medium">Exportar Dados</span>
              <span className="text-xs text-muted-foreground">JSON, CSV, Excel</span>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" onClick={() => setLocation("/correcao")}>
              <Shield className="h-6 w-6 text-[oklch(0.75_0.12_85)]" />
              <span className="text-sm font-medium">Correção</span>
              <span className="text-xs text-muted-foreground">Deduplicação e limpeza</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
