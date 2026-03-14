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
import { Search, User, ChevronRight, RefreshCw, Trash2, Upload, Download, Filter, ChevronLeft, FilePlus, Bot } from "lucide-react";
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

const ITEMS_PER_PAGE = 20;

export default function ClientesList() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [page, setPage] = useState(1);
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

  // Filtrar por status (clientes com CPF válido vs pendentes)
  const filteredClientes = useMemo(() => {
    if (!clientesList.data) return [];
    let filtered = clientesList.data;
    if (statusFilter === "completos") {
      filtered = filtered.filter((c: any) => c.cpfCnpj && c.cpfCnpj.length >= 11 && !c.cpfCnpj.startsWith("PEND"));
    } else if (statusFilter === "pendentes") {
      filtered = filtered.filter((c: any) => !c.cpfCnpj || c.cpfCnpj.length < 11 || c.cpfCnpj.startsWith("PEND"));
    }
    return filtered;
  }, [clientesList.data, statusFilter]);

  // Paginação
  const totalPages = Math.ceil(filteredClientes.length / ITEMS_PER_PAGE);
  const paginatedClientes = filteredClientes.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  // Contadores
  const totalClientes = clientesList.data?.length ?? 0;
  const completosCount = clientesList.data?.filter((c: any) => c.cpfCnpj && c.cpfCnpj.length >= 11 && !c.cpfCnpj.startsWith("PEND")).length ?? 0;
  const pendentesCount = totalClientes - completosCount;

  return (
    <div className="space-y-6">
      {/* Header com botões */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground mt-1">
            {filteredClientes.length} de {totalClientes} registros
            {statusFilter !== "todos" && ` (${statusFilter === "completos" ? "completos" : "pendentes"})`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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
            Exportar
          </Button>
        </div>
      </div>

      {/* Busca + Filtros */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou CPF..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-10"
          />
        </div>
        <div className="flex gap-1">
          <Button
            variant={statusFilter === "todos" ? "default" : "outline"}
            size="sm"
            onClick={() => { setStatusFilter("todos"); setPage(1); }}
            className={statusFilter === "todos" ? "bg-amber-600 hover:bg-amber-700" : ""}
          >
            <Filter className="h-3.5 w-3.5 mr-1" />
            Todos ({totalClientes})
          </Button>
          <Button
            variant={statusFilter === "completos" ? "default" : "outline"}
            size="sm"
            onClick={() => { setStatusFilter("completos"); setPage(1); }}
            className={statusFilter === "completos" ? "bg-green-600 hover:bg-green-700" : ""}
          >
            Completos ({completosCount})
          </Button>
          <Button
            variant={statusFilter === "pendentes" ? "default" : "outline"}
            size="sm"
            onClick={() => { setStatusFilter("pendentes"); setPage(1); }}
            className={statusFilter === "pendentes" ? "bg-yellow-600 hover:bg-yellow-700" : ""}
          >
            Pendentes ({pendentesCount})
          </Button>
        </div>
      </div>

      {clientesList.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
        </div>
      ) : !filteredClientes.length ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <User className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="font-semibold text-lg">
              {statusFilter !== "todos" ? "Nenhum cliente neste filtro" : "Nenhum cliente cadastrado"}
            </h3>
            <p className="text-muted-foreground text-sm mt-1">
              {statusFilter !== "todos"
                ? "Tente outro filtro ou busca"
                : "Faça upload de processos para alimentar o banco de dados"}
            </p>
            {statusFilter === "todos" && (
              <Button className="mt-4 gold-gradient text-white" onClick={() => setLocation("/upload")}>
                Importar Processos
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-2">
            {paginatedClientes.map((cli: any) => {
              const isPendente = !cli.cpfCnpj || cli.cpfCnpj.length < 11 || cli.cpfCnpj.startsWith("PEND");
              return (
                <Card key={cli.id} className={`border hover:shadow-md transition-all group ${isPendente ? "border-yellow-200 dark:border-yellow-900" : ""}`}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div
                      className="flex items-center gap-4 flex-1 cursor-pointer min-w-0"
                      onClick={() => setLocation(`/cliente/${cli.id}`)}
                    >
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 ${isPendente ? "bg-yellow-500" : "gold-gradient"}`}>
                        {cli.nomeCompleto.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-sm truncate">{cli.nomeCompleto}</h3>
                          {isPendente && <Badge variant="outline" className="text-[10px] text-yellow-600 border-yellow-300 shrink-0">Pendente</Badge>}
                        </div>
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
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                    </div>
                    {/* Ações rápidas */}
                    <div className="flex items-center gap-1 ml-2 shrink-0">
                      <Button
                        variant="ghost" size="icon"
                        className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                        title="Gerar Petição"
                        onClick={(e) => { e.stopPropagation(); setLocation(`/peticionamento?clienteId=${cli.id}`); }}
                      >
                        <FilePlus className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        title="Agente IA"
                        onClick={(e) => { e.stopPropagation(); setLocation(`/agente?clienteId=${cli.id}`); }}
                      >
                        <Bot className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={(e) => e.stopPropagation()}>
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
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-muted-foreground">
                Mostrando {(page - 1) * ITEMS_PER_PAGE + 1}-{Math.min(page * ITEMS_PER_PAGE, filteredClientes.length)} de {filteredClientes.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline" size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                </Button>
                <div className="flex gap-1">
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (page <= 3) {
                      pageNum = i + 1;
                    } else if (page >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = page - 2 + i;
                    }
                    return (
                      <Button
                        key={pageNum}
                        variant={page === pageNum ? "default" : "outline"}
                        size="sm"
                        className={`w-8 h-8 p-0 ${page === pageNum ? "bg-amber-600 hover:bg-amber-700" : ""}`}
                        onClick={() => setPage(pageNum)}
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>
                <Button
                  variant="outline" size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Próximo <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
