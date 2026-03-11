import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Scale, Lightbulb, FileText } from "lucide-react";

const categoriaConfig: Record<string, { label: string; icon: any; color: string }> = {
  Jurisprudencia: { label: "Jurisprudência", icon: Scale, color: "bg-blue-100 text-blue-800" },
  Tese: { label: "Tese", icon: Lightbulb, color: "bg-amber-100 text-amber-800" },
  Estrategia: { label: "Estratégia", icon: BookOpen, color: "bg-green-100 text-green-800" },
  Legislacao: { label: "Legislação", icon: FileText, color: "bg-purple-100 text-purple-800" },
  Modelo: { label: "Modelo", icon: FileText, color: "bg-gray-100 text-gray-800" },
};

export default function Conhecimentos() {
  const { data: conhecimentosList, isLoading } = trpc.exportar.conhecimentosJson.useQuery();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Banco de Conhecimentos</h1>
          <p className="text-muted-foreground mt-1">Carregando...</p>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full rounded-lg" />)}
        </div>
      </div>
    );
  }

  const list = conhecimentosList ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Banco de Conhecimentos</h1>
        <p className="text-muted-foreground mt-1">
          Teses, jurisprudências, estratégias e modelos extraídos dos processos — {list.length} registros
        </p>
      </div>

      {list.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <BookOpen className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="font-semibold text-lg">Banco de conhecimentos vazio</h3>
            <p className="text-muted-foreground text-sm mt-1">
              Faça upload de processos para que as teses e estratégias sejam automaticamente extraídas
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {list.map((item) => {
            const config = categoriaConfig[item.categoria] || categoriaConfig.Modelo;
            const Icon = config.icon;
            return (
              <Card key={item.id} className="border shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      {item.titulo}
                    </CardTitle>
                    <div className="flex gap-2">
                      <Badge className={config.color}>{config.label}</Badge>
                      {item.tribunal && <Badge variant="outline">{item.tribunal}</Badge>}
                      {item.tipoAcao && <Badge variant="secondary">{item.tipoAcao}</Badge>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.conteudo}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
