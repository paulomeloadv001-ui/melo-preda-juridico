import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RefreshCw, Play, CheckCircle, XCircle, Clock, Zap, Database, Globe, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Integracoes() {
  const { toast } = useToast();
  const [executando, setExecutando] = useState<string | null>(null);

  // Buscar status das integrações
  const { data: status, isLoading, refetch } = useQuery({
    queryKey: ["integracoes-status"],
    queryFn: () => trpc.integracoes.status.query(),
    refetchInterval: 30000, // Atualizar a cada 30s
  });

  // Buscar histórico de execuções
  const { data: historico, refetch: refetchHistorico } = useQuery({
    queryKey: ["integracoes-historico"],
    queryFn: () => trpc.integracoes.cronHistorico.query(),
  });

  // Mutation: Executar todos os cron jobs
  const executarTodos = useMutation({
    mutationFn: () => trpc.integracoes.cronExecutarTodos.mutate(),
    onSuccess: (data) => {
      toast({ title: "Jobs executados", description: `${data.resultados.length} jobs processados com sucesso.` });
      refetch();
      refetchHistorico();
      setExecutando(null);
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
      setExecutando(null);
    },
  });

  // Mutation: Consultar folha GO
  const consultarFolha = useMutation({
    mutationFn: (nome: string) => trpc.integracoes.dadosAbertosGO.consultarFolha.mutate({ nomeServidor: nome }),
    onSuccess: (data) => {
      if (data.encontrado) {
        toast({ title: "Servidor encontrado!", description: `${data.servidor?.nome} - R$ ${data.servidor?.valorLiquido?.toFixed(2)}` });
      } else {
        toast({ title: "Não encontrado", description: data.mensagem, variant: "destructive" });
      }
    },
  });

  // Mutation: Atualizar movimentações DataJud
  const atualizarDatajud = useMutation({
    mutationFn: () => trpc.integracoes.cronAtualizarMovimentacoes.mutate(),
    onSuccess: (data) => {
      toast({ title: "Movimentações atualizadas", description: data.resumo });
      refetchHistorico();
      setExecutando(null);
    },
    onError: (err: any) => {
      toast({ title: "Erro DataJud", description: err.message, variant: "destructive" });
      setExecutando(null);
    },
  });

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Integrações Automáticas</h1>
          <p className="text-muted-foreground">
            Conexões com APIs externas para atualização automática de dados
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { refetch(); refetchHistorico(); }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
          <Button
            size="sm"
            onClick={() => { setExecutando("todos"); executarTodos.mutate(); }}
            disabled={executando !== null}
          >
            <Play className="h-4 w-4 mr-2" />
            {executando === "todos" ? "Executando..." : "Executar Todos"}
          </Button>
        </div>
      </div>

      <Separator />

      {/* Cards de Status das Integrações */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Dados Abertos GO */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Database className="h-4 w-4 text-blue-500" />
                Dados Abertos GO
              </CardTitle>
              <Badge variant="default" className="bg-green-100 text-green-800">
                <CheckCircle className="h-3 w-3 mr-1" />
                Ativo
              </Badge>
            </div>
            <CardDescription>Folha de pagamento pública do Estado de Goiás</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>Frequência:</strong> Mensal (dia 10)</p>
              <p><strong>Fonte:</strong> dadosabertos.go.gov.br</p>
              <p><strong>Credenciais:</strong> Não necessárias (dados públicos)</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-3"
              onClick={() => { setExecutando("folha"); consultarFolha.mutate("TESTE"); }}
              disabled={executando !== null}
            >
              <Zap className="h-3 w-3 mr-1" />
              Testar Conexão
            </Button>
          </CardContent>
        </Card>

        {/* DataJud CNJ */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Globe className="h-4 w-4 text-purple-500" />
                DataJud CNJ
              </CardTitle>
              <Badge
                variant={status?.integracoes?.datajud?.configurada ? "default" : "secondary"}
                className={status?.integracoes?.datajud?.configurada ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}
              >
                {status?.integracoes?.datajud?.configurada ? (
                  <><CheckCircle className="h-3 w-3 mr-1" />Ativo</>
                ) : (
                  <><Clock className="h-3 w-3 mr-1" />Pendente</>
                )}
              </Badge>
            </div>
            <CardDescription>Movimentações processuais via API Pública CNJ</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>Frequência:</strong> Diária (6h)</p>
              <p><strong>API:</strong> api-publica.datajud.cnj.jus.br</p>
              <p><strong>Credenciais:</strong> {status?.integracoes?.datajud?.configurada ? "Configurada" : "DATAJUD_API_KEY pendente"}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-3"
              onClick={() => { setExecutando("datajud"); atualizarDatajud.mutate(); }}
              disabled={executando !== null || !status?.integracoes?.datajud?.configurada}
            >
              <Zap className="h-3 w-3 mr-1" />
              Atualizar Movimentações
            </Button>
          </CardContent>
        </Card>

        {/* Celcoin */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Shield className="h-4 w-4 text-orange-500" />
                Celcoin / NeoConsig
              </CardTitle>
              <Badge
                variant={status?.integracoes?.celcoin?.configurada ? "default" : "secondary"}
                className={status?.integracoes?.celcoin?.configurada ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}
              >
                {status?.integracoes?.celcoin?.configurada ? (
                  <><CheckCircle className="h-3 w-3 mr-1" />Ativo</>
                ) : (
                  <><Clock className="h-3 w-3 mr-1" />Pendente</>
                )}
              </Badge>
            </div>
            <CardDescription>Margem consignável em tempo real</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>Frequência:</strong> Semanal (segunda, 8h)</p>
              <p><strong>API:</strong> api.celcoin.com.br</p>
              <p><strong>Credenciais:</strong> {status?.integracoes?.celcoin?.configurada ? "Configurada" : "CELCOIN_CLIENT_ID/SECRET pendente"}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-3"
              disabled={!status?.integracoes?.celcoin?.configurada}
            >
              <Zap className="h-3 w-3 mr-1" />
              Consultar Margem
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Cron Jobs Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Cron Jobs — Execuções Automáticas</CardTitle>
          <CardDescription>Status e histórico das tarefas automáticas agendadas</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 font-medium">Job</th>
                  <th className="text-left py-2 px-3 font-medium">Frequência</th>
                  <th className="text-left py-2 px-3 font-medium">Status</th>
                  <th className="text-left py-2 px-3 font-medium">Última Execução</th>
                  <th className="text-left py-2 px-3 font-medium">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {status?.cronJobs?.jobs?.map((job: any) => (
                  <tr key={job.nome} className="border-b hover:bg-muted/50">
                    <td className="py-2 px-3 font-medium">{job.descricao}</td>
                    <td className="py-2 px-3 text-muted-foreground">{job.frequencia}</td>
                    <td className="py-2 px-3">
                      {job.configurado ? (
                        <Badge variant="default" className="bg-green-100 text-green-800 text-xs">Configurado</Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 text-xs">Pendente</Badge>
                      )}
                    </td>
                    <td className="py-2 px-3 text-muted-foreground text-xs">
                      {job.ultimaExecucao?.fim ? new Date(job.ultimaExecucao.fim).toLocaleString('pt-BR') : 'Nunca executado'}
                    </td>
                    <td className="py-2 px-3 text-xs">
                      {job.ultimaExecucao?.sucesso === true && (
                        <span className="text-green-600 flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" /> {job.ultimaExecucao.resumo}
                        </span>
                      )}
                      {job.ultimaExecucao?.sucesso === false && (
                        <span className="text-red-600 flex items-center gap-1">
                          <XCircle className="h-3 w-3" /> {job.ultimaExecucao.resumo}
                        </span>
                      )}
                      {!job.ultimaExecucao && <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Histórico de Execuções */}
      {historico && historico.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Histórico de Execuções</CardTitle>
            <CardDescription>Últimas execuções dos cron jobs</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {historico.slice(-10).reverse().map((exec: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between py-2 px-3 rounded border text-sm">
                  <div className="flex items-center gap-2">
                    {exec.sucesso ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    <span className="font-medium">{exec.job}</span>
                  </div>
                  <span className="text-muted-foreground text-xs">{exec.resumo}</span>
                  <span className="text-muted-foreground text-xs">
                    {new Date(exec.fim).toLocaleString('pt-BR')} ({exec.duracao}ms)
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Webhooks */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Webhooks — Notificações Automáticas</CardTitle>
          <CardDescription>Endpoints para receber notificações de sistemas externos</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 font-medium">Endpoint</th>
                  <th className="text-left py-2 px-3 font-medium">Origem</th>
                  <th className="text-left py-2 px-3 font-medium">Evento</th>
                  <th className="text-left py-2 px-3 font-medium">Ação Automática</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b hover:bg-muted/50">
                  <td className="py-2 px-3 font-mono text-xs">POST /api/webhooks/neoconsig</td>
                  <td className="py-2 px-3">NEOCONSIG / Celcoin</td>
                  <td className="py-2 px-3">Margem alterada</td>
                  <td className="py-2 px-3 text-xs text-muted-foreground">Atualiza dados financeiros + notificação</td>
                </tr>
                <tr className="border-b hover:bg-muted/50">
                  <td className="py-2 px-3 font-mono text-xs">POST /api/webhooks/datajud</td>
                  <td className="py-2 px-3">DataJud / PJe</td>
                  <td className="py-2 px-3">Nova movimentação</td>
                  <td className="py-2 px-3 text-xs text-muted-foreground">Registra movimentação + alerta urgente</td>
                </tr>
                <tr className="border-b hover:bg-muted/50">
                  <td className="py-2 px-3 font-mono text-xs">POST /api/webhooks/banco</td>
                  <td className="py-2 px-3">Banco do Brasil / Caixa</td>
                  <td className="py-2 px-3">Depósito judicial</td>
                  <td className="py-2 px-3 text-xs text-muted-foreground">Registra financeiro + notificação</td>
                </tr>
                <tr className="border-b hover:bg-muted/50">
                  <td className="py-2 px-3 font-mono text-xs">POST /api/webhooks/intimacao</td>
                  <td className="py-2 px-3">PJe / PROJUDI / ESAJ</td>
                  <td className="py-2 px-3">Intimação eletrônica</td>
                  <td className="py-2 px-3 text-xs text-muted-foreground">Registra + calcula prazo + alerta urgente</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
