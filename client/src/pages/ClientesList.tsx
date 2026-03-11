import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, User, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

export default function ClientesList() {
  const [search, setSearch] = useState("");
  const [, setLocation] = useLocation();
  const { data: clientesList, isLoading } = trpc.clientes.list.useQuery(
    search ? { search } : undefined,
    { placeholderData: (prev) => prev }
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground mt-1">Banco de dados por CPF — {clientesList?.length ?? 0} registros</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou CPF..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
        </div>
      ) : !clientesList?.length ? (
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
          {clientesList.map((cli) => (
            <Card
              key={cli.id}
              className="border hover:shadow-md transition-all cursor-pointer group"
              onClick={() => setLocation(`/cliente/${cli.id}`)}
            >
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full gold-gradient flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {cli.nomeCompleto.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">{cli.nomeCompleto}</h3>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-muted-foreground font-mono">{cli.cpfCnpj}</span>
                      {cli.orgaoEmpregador && (
                        <Badge variant="secondary" className="text-xs">{cli.orgaoEmpregador}</Badge>
                      )}
                      {cli.cidade && cli.estado && (
                        <span className="text-xs text-muted-foreground">{cli.cidade}/{cli.estado}</span>
                      )}
                    </div>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
