import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, FileText, Scale, DollarSign } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { data: stats, isLoading } = trpc.clientes.stats.useQuery();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  };

  if (isLoading) {
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
    { title: "Total de Clientes", value: stats?.totalClientes ?? 0, icon: Users, color: "text-[oklch(0.75_0.12_85)]" },
    { title: "Total de Processos", value: stats?.totalProcessos ?? 0, icon: FileText, color: "text-[oklch(0.55_0.12_85)]" },
    { title: "Processos Ativos", value: stats?.processosAtivos ?? 0, icon: Scale, color: "text-[oklch(0.55_0.15_145)]" },
    { title: "Valor Total em Causas", value: formatCurrency(stats?.valorTotalCausas ?? 0), icon: DollarSign, color: "text-[oklch(0.75_0.12_85)]" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Painel Geral</h1>
        <p className="text-muted-foreground mt-1">Visão geral do escritório Melo &amp; Preda Advogados</p>
      </div>

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

      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Bem-vindo ao Sistema Jurídico Integrado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Utilize o menu lateral para navegar entre as funcionalidades:</p>
          <ul className="space-y-2 ml-4">
            <li className="flex items-center gap-2"><FileText className="h-4 w-4 text-[oklch(0.75_0.12_85)]" /> <strong className="text-foreground">Upload de Processos</strong> — Envie PDFs e extraia dados automaticamente via IA</li>
            <li className="flex items-center gap-2"><Users className="h-4 w-4 text-[oklch(0.75_0.12_85)]" /> <strong className="text-foreground">Clientes</strong> — Banco de dados completo por CPF</li>
            <li className="flex items-center gap-2"><Scale className="h-4 w-4 text-[oklch(0.75_0.12_85)]" /> <strong className="text-foreground">Banco de Conhecimentos</strong> — Teses, jurisprudências e estratégias</li>
            <li className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-[oklch(0.75_0.12_85)]" /> <strong className="text-foreground">Exportação em Massa</strong> — Exporte dados para integração externa</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
