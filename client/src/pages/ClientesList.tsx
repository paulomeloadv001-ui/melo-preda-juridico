import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Search, User, ChevronRight, RefreshCw, Trash2, Upload, Download } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function ClientesList() {
  const [search, setSearch] = useState("");
  const [, setLocation] = useLocation();
  const clientesList = trpc.clientes.list.useQuery(
    search ? { search } : undefined,
    { placeholderData: (prev) => prev }
  );
  const deleteCliente = trpc.clientes.delete.useMutation({
    onSuccess: (data) => {
      toast.success(`Cliente excluído (ID ${data.deletedId})`);
      clientesList.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const exportAll = trpc.exportar.todosClientesJson.useQuery(undefined, { enabled: false });

  const handleExportAll = async () => {
    const result = await exportAll.refetch();
    if (result.data) {
      const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `clientes_export_${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Exportação concluída");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header com botões */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground mt-1">Banco de dados por CPF — {clientesList.data?.length ?? 0} registros</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => clientesList.refetch()} disabled={clientesList.isFetching}>
            <RefreshCw className={`h-4 w-4 mr-1 ${clientesList.isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={() => setLocation("/upload")}>
            <Upload className="h-4 w-4 mr-1" />
            Importar
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportAll} disabled={exportAll.isFetching}>
            <Download className={`h-4 w-4 mr-1 ${exportAll.isFetching ? "animate-spin" : ""}`} />
            Exportar Todos
          </Button>
        </div>
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou CPF..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {clientesList.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
        </div>
      ) : !clientesList.data?.length ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <User className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="font-semibold text-lg">Nenhum cliente cadastrado</h3>
            <p className="text-muted-foreground text-sm mt-1">Faça upload de processos para alimentar o banco de dados</p>
            <Button className="mt-4 gold-gradient text-white" onClick={() => setLocation("/upload")}>
              Importar Processos
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {clientesList.data.map((cli) => (
            <Card key={cli.id} className="border hover:shadow-md transition-all group">
              <CardContent className="flex items-center justify-between p-4">
                <div
                  className="flex items-center gap-4 flex-1 cursor-pointer"
                  onClick={() => setLocation(`/cliente/${cli.id}`)}
                >
                  <div className="h-10 w-10 rounded-full gold-gradient flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {cli.nomeCompleto.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-sm">{cli.nomeCompleto}</h3>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-xs text-muted-foreground font-mono">{cli.cpfCnpj}</span>
                      {cli.orgaoEmpregador && (
                        <Badge variant="secondary" className="text-xs">{cli.orgaoEmpregador}</Badge>
                      )}
                      {cli.cidade && cli.estado && (
                        <span className="text-xs text-muted-foreground">{cli.cidade}/{cli.estado}</span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
                {/* Botão Excluir */}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="ml-2 text-muted-foreground hover:text-destructive shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Isso excluirá permanentemente <strong>{cli.nomeCompleto}</strong> (CPF: {cli.cpfCnpj}) e todos os processos, dados financeiros e documentos vinculados. Esta ação não pode ser desfeita.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => deleteCliente.mutate({ id: cli.id })}
                      >
                        Excluir
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
