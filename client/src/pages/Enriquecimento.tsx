import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Users, Search, CheckCircle, AlertTriangle, Edit, Save, X,
  FileSearch, BarChart3, RefreshCw, ArrowUpDown
} from "lucide-react";

export default function Enriquecimento() {
  const [busca, setBusca] = useState("");
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [cpfInput, setCpfInput] = useState("");
  const [ordenacao, setOrdenacao] = useState<"nome" | "id">("nome");

  const { data: pendentes, isLoading, refetch } = trpc.enriquecimento.clientesPendentes.useQuery();
  const { data: stats } = trpc.enriquecimento.estatisticas.useQuery();

  const atualizarCpf = trpc.enriquecimento.atualizarCpf.useMutation({
    onSuccess: (data) => {
      toast.success(`CPF atualizado: ${data.cpfNormalizado}`);
      setEditandoId(null);
      setCpfInput("");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const extrairCpf = trpc.enriquecimento.extrairCpfDosProcessos.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.corrigidos} CPFs extraídos dos processos. ${data.naoEncontrados} não encontrados.`);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const clientesFiltrados = useMemo(() => {
    if (!pendentes?.clientes) return [];
    let lista = pendentes.clientes;
    if (busca) {
      const b = busca.toLowerCase();
      lista = lista.filter(c =>
        c.nomeCompleto.toLowerCase().includes(b) ||
        c.cpfCnpj.toLowerCase().includes(b)
      );
    }
    if (ordenacao === "id") {
      lista = [...lista].sort((a, b) => a.id - b.id);
    }
    return lista;
  }, [pendentes?.clientes, busca, ordenacao]);

  const formatarCpf = (value: string) => {
    const nums = value.replace(/\D/g, "");
    if (nums.length <= 11) {
      return nums.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    }
    return nums.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  };

  const handleSalvarCpf = (clienteId: number) => {
    const cpfLimpo = cpfInput.replace(/\D/g, "");
    if (cpfLimpo.length !== 11 && cpfLimpo.length !== 14) {
      toast.error("CPF deve ter 11 dígitos ou CNPJ 14 dígitos");
      return;
    }
    atualizarCpf.mutate({ clienteId, cpfCnpj: cpfLimpo });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Enriquecimento Cadastral</h1>
          <p className="text-muted-foreground">
            Completar dados de clientes com CPF/CNPJ pendente
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => extrairCpf.mutate()}
            disabled={extrairCpf.isPending}
          >
            <FileSearch className="h-4 w-4 mr-2" />
            {extrairCpf.isPending ? "Extraindo..." : "Extrair CPFs dos Processos"}
          </Button>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Estatísticas */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Users className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Clientes</p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Com CPF</p>
                  <p className="text-2xl font-bold">{stats.comCpf}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-yellow-500/10">
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Sem CPF</p>
                  <p className="text-2xl font-bold">{stats.semCpf}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <BarChart3 className="h-5 w-5 text-purple-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Completude CPF</p>
                  <p className="text-2xl font-bold">{stats.percentualCpf}%</p>
                </div>
              </div>
              <Progress value={stats.percentualCpf} className="mt-2" />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Completude por campo */}
      {stats && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Completude por Campo</CardTitle>
            <CardDescription>Percentual de clientes com cada campo preenchido</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
              {Object.entries(stats.completude).map(([campo, qtd]) => {
                const pct = stats.total > 0 ? Math.round((qtd / stats.total) * 100) : 0;
                const labels: Record<string, string> = {
                  rg: "RG", profissao: "Profissão", cargo: "Cargo",
                  orgaoEmpregador: "Órgão/Empregador", endereco: "Endereço",
                  cidade: "Cidade", estado: "Estado", cep: "CEP",
                  telefone: "Telefone", email: "E-mail",
                  dataNascimento: "Data Nasc.", estadoCivil: "Estado Civil",
                };
                return (
                  <div key={campo} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{labels[campo] || campo}</span>
                      <span className="font-medium">{pct}%</span>
                    </div>
                    <Progress value={pct} className="h-2" />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista de clientes pendentes */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-lg">
                Clientes com CPF Pendente ({pendentes?.total || 0})
              </CardTitle>
              <CardDescription>
                Clique no ícone de edição para inserir o CPF/CNPJ correto
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-9 w-64"
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOrdenacao(o => o === "nome" ? "id" : "nome")}
                title={`Ordenar por ${ordenacao === "nome" ? "ID" : "Nome"}`}
              >
                <ArrowUpDown className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {clientesFiltrados.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {busca ? "Nenhum cliente encontrado para a busca" : "Todos os clientes possuem CPF cadastrado!"}
              </div>
            ) : (
              clientesFiltrados.map((cliente) => (
                <div
                  key={cliente.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="p-2 rounded-full bg-yellow-500/10">
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{cliente.nomeCompleto}</p>
                      <div className="flex gap-2 items-center text-xs text-muted-foreground">
                        <span>ID: {cliente.id}</span>
                        {cliente.profissao && <span>• {cliente.profissao}</span>}
                        {cliente.orgaoEmpregador && <span>• {cliente.orgaoEmpregador}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    {editandoId === cliente.id ? (
                      <>
                        <Input
                          placeholder="000.000.000-00"
                          value={cpfInput}
                          onChange={(e) => setCpfInput(formatarCpf(e.target.value))}
                          className="w-44"
                          maxLength={18}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSalvarCpf(cliente.id);
                            if (e.key === "Escape") { setEditandoId(null); setCpfInput(""); }
                          }}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleSalvarCpf(cliente.id)}
                          disabled={atualizarCpf.isPending}
                        >
                          <Save className="h-4 w-4 text-green-500" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => { setEditandoId(null); setCpfInput(""); }}
                        >
                          <X className="h-4 w-4 text-red-500" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Badge variant="outline" className="text-yellow-600 border-yellow-300 bg-yellow-50 dark:bg-yellow-950/30">
                          PENDENTE
                        </Badge>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => { setEditandoId(cliente.id); setCpfInput(""); }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
