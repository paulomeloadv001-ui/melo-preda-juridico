import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { BookOpen, Scale, Lightbulb, FileText, RefreshCw, Trash2, Download, Search, Filter } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const categoriaConfig: Record<string, { label: string; icon: any; color: string }> = {
  Jurisprudencia: { label: "Jurisprudência", icon: Scale, color: "bg-blue-100 text-blue-800" },
  Tese: { label: "Tese", icon: Lightbulb, color: "bg-amber-100 text-amber-800" },
  Estrategia: { label: "Estratégia", icon: BookOpen, color: "bg-green-100 text-green-800" },
  Legislacao: { label: "Legislação", icon: FileText, color: "bg-purple-100 text-purple-800" },
  Modelo: { label: "Modelo", icon: FileText, color: "bg-gray-100 text-gray-800" },
};

const categorias = ["Todas", "Jurisprudencia", "Tese", "Estrategia", "Legislacao", "Modelo"];

export default function Conhecimentos() {
  const [search, setSearch] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("Todas");

  const queryInput = search
    ? { search }
    : filtroCategoria !== "Todas"
      ? { categoria: filtroCategoria }
      : undefined;

  const conhecimentosList = trpc.conhecimentosRouter.list.useQuery(queryInput, {
    placeholderData: (prev) => prev,
  });

  const deleteConhecimento = trpc.conhecimentosRouter.delete.useMutation({
    onSuccess: () => {
      toast.success("Conhecimento excluído");
      conhecimentosList.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleExport = () => {
    const data = conhecimentosList.data;
    if (!data || !Array.isArray(data) || data.length === 0) return toast.error("Nada para exportar");
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `conhecimentos_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exportação concluída");
  };

  const list = Array.isArray(conhecimentosList.data) ? conhecimentosList.data : [];

  return (
    <div className="space-y-6">
      {/* Header com botões */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-[oklch(0.75_0.12_85)]" />
            Banco de Conhecimentos
          </h1>
          <p className="text-muted-foreground mt-1">
            Teses, jurisprudências, estratégias e modelos — {list.length} registros
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => conhecimentosList.refetch()} disabled={conhecimentosList.isFetching}>
            <RefreshCw className={`h-4 w-4 mr-1 ${conhecimentosList.isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1" />
            Exportar JSON
          </Button>
        </div>
      </div>

      {/* Busca e Filtros */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por título ou conteúdo..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setFiltroCategoria("Todas"); }}
            className="pl-10"
          />
        </div>
        <div className="flex gap-1 items-center">
          <Filter className="h-4 w-4 text-muted-foreground mr-1" />
          {categorias.map((cat) => (
            <Button
              key={cat}
              variant={filtroCategoria === cat ? "default" : "outline"}
              size="sm"
              className="text-xs"
              onClick={() => { setFiltroCategoria(cat); setSearch(""); }}
            >
              {cat === "Todas" ? "Todas" : categoriaConfig[cat]?.label || cat}
            </Button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {conhecimentosList.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full rounded-lg" />)}
        </div>
      ) : list.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <BookOpen className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="font-semibold text-lg">Nenhum conhecimento encontrado</h3>
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
                    <div className="flex gap-2 items-center">
                      <Badge className={config.color}>{config.label}</Badge>
                      {item.tribunal && <Badge variant="outline">{item.tribunal}</Badge>}
                      {item.tipoAcao && <Badge variant="secondary">{item.tipoAcao}</Badge>}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir conhecimento?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Isso excluirá permanentemente este registro do banco de conhecimentos.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => deleteConhecimento.mutate({ id: item.id })}>
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
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
