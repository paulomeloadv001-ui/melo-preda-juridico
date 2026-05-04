import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { RefreshCw, Plug, Globe, Bell, FileText, Webhook, Search, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { toast } from "sonner";

export default function Conectores() {
  const [selectedConector, setSelectedConector] = useState<any>(null);
  
  const { data: conectores, isLoading, refetch } = trpc.conectores.listar.useQuery();
  const { data: stats } = trpc.conectores.stats.useQuery();
  const { data: intimacoesData } = trpc.intimacoesRouter.listar.useQuery();
  const { data: intimacoesStats } = trpc.intimacoesRouter.stats.useQuery();

  const tipoIcons: Record<string, any> = {
    monitoramento: <Bell className="w-4 h-4" />,
    consulta: <Search className="w-4 h-4" />,
    intimacoes: <AlertTriangle className="w-4 h-4" />,
    diarios: <FileText className="w-4 h-4" />,
    distribuicao: <Globe className="w-4 h-4" />,
    webhook: <Webhook className="w-4 h-4" />,
  };

  const tipoCores: Record<string, string> = {
    monitoramento: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    consulta: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    intimacoes: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    diarios: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    distribuicao: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    webhook: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  };

  const statusCores: Record<string, string> = {
    pendente: "bg-yellow-100 text-yellow-800",
    lida: "bg-blue-100 text-blue-800",
    respondida: "bg-green-100 text-green-800",
    vencida: "bg-red-100 text-red-800",
    cancelada: "bg-gray-100 text-gray-800",
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Conectores & Intimações</h1>
          <p className="text-muted-foreground mt-1">APIs integradas e alimentação inteligente de processos</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { refetch(); toast.success("Atualizado!"); }}>
          <RefreshCw className="w-4 h-4 mr-2" /> Atualizar
        </Button>
      </div>

      {/* Cards de estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><Plug className="w-5 h-5 text-primary" /></div>
              <div>
                <p className="text-2xl font-bold">{stats?.total || 0}</p>
                <p className="text-xs text-muted-foreground">Conectores Ativos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900"><AlertTriangle className="w-5 h-5 text-red-600" /></div>
              <div>
                <p className="text-2xl font-bold">{intimacoesStats?.pendentes || 0}</p>
                <p className="text-xs text-muted-foreground">Intimações Pendentes</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900"><Clock className="w-5 h-5 text-orange-600" /></div>
              <div>
                <p className="text-2xl font-bold">{intimacoesStats?.urgentes || 0}</p>
                <p className="text-xs text-muted-foreground">Urgentes</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900"><CheckCircle className="w-5 h-5 text-green-600" /></div>
              <div>
                <p className="text-2xl font-bold">{intimacoesStats?.total || 0}</p>
                <p className="text-xs text-muted-foreground">Total Intimações</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="conectores" className="w-full">
        <TabsList>
          <TabsTrigger value="conectores">APIs Conectadas ({stats?.total || 0})</TabsTrigger>
          <TabsTrigger value="intimacoes">Intimações ({intimacoesStats?.total || 0})</TabsTrigger>
          <TabsTrigger value="documentacao">Documentação</TabsTrigger>
        </TabsList>

        {/* Aba Conectores */}
        <TabsContent value="conectores" className="mt-4">
          <div className="grid grid-cols-1 gap-3">
            {conectores?.map((conector: any) => (
              <Card key={conector.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedConector(conector)}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-muted">
                        {tipoIcons[conector.tipo] || <Plug className="w-4 h-4" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{conector.metodo}</span>
                          <code className="text-xs bg-muted px-2 py-0.5 rounded">{conector.endpoint}</code>
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{conector.descricao}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={tipoCores[conector.tipo] || ""}>{conector.tipo}</Badge>
                      {conector.ativo ? (
                        <Badge variant="outline" className="text-green-600 border-green-300">Ativo</Badge>
                      ) : (
                        <Badge variant="outline" className="text-red-600 border-red-300">Inativo</Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Aba Intimações */}
        <TabsContent value="intimacoes" className="mt-4">
          {intimacoesData && intimacoesData.length > 0 ? (
            <div className="space-y-3">
              {intimacoesData.map((intimacao: any) => (
                <Card key={intimacao.id}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${intimacao.prioridade === 'urgente' ? 'bg-red-100' : 'bg-yellow-100'}`}>
                          <AlertTriangle className={`w-4 h-4 ${intimacao.prioridade === 'urgente' ? 'text-red-600' : 'text-yellow-600'}`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium capitalize">{intimacao.tipo}</span>
                            {intimacao.numeroCnj && <code className="text-xs bg-muted px-2 py-0.5 rounded">{intimacao.numeroCnj}</code>}
                          </div>
                          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">
                            {intimacao.conteudo || `${intimacao.tribunal || ''} - ${intimacao.vara || ''}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={statusCores[intimacao.status] || ""}>{intimacao.status}</Badge>
                        <Badge variant="outline">{intimacao.origem || 'Manual'}</Badge>
                        {intimacao.prazoFinal && (
                          <span className="text-xs text-muted-foreground">
                            Prazo: {new Date(intimacao.prazoFinal).toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Bell className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">Nenhuma intimação registrada</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  As intimações serão alimentadas automaticamente via webhook do JusBrasil ou inseridas manualmente.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Aba Documentação */}
        <TabsContent value="documentacao" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Documentação dos Conectores JusBrasil</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(stats?.porTipo || {}).map(([tipo, qtd]) => (
                  <Card key={tipo}>
                    <CardContent className="py-4">
                      <div className="flex items-center gap-3">
                        {tipoIcons[tipo] || <Plug className="w-4 h-4" />}
                        <div>
                          <p className="font-medium capitalize">{tipo}</p>
                          <p className="text-sm text-muted-foreground">{qtd as number} endpoint{(qtd as number) > 1 ? 's' : ''}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="mt-6 p-4 bg-muted rounded-lg">
                <h4 className="font-medium mb-2">Como funciona a alimentação inteligente:</h4>
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                  <li><strong>Monitoramento:</strong> Processos são registrados para monitoramento via API</li>
                  <li><strong>Webhook:</strong> JusBrasil envia eventos (movimentações, publicações) automaticamente</li>
                  <li><strong>Intimações:</strong> Sistema recebe e classifica intimações por prioridade</li>
                  <li><strong>Prazos:</strong> Prazos processuais são criados automaticamente a partir das intimações</li>
                  <li><strong>Linha do tempo:</strong> Cada processo exibe movimentações cronológicas estilo JusBrasil</li>
                </ol>
              </div>

              <div className="mt-4 p-4 bg-muted rounded-lg">
                <h4 className="font-medium mb-2">Endpoint de Webhook:</h4>
                <code className="text-xs bg-background p-2 rounded block">
                  POST /api/trpc/intimacoesRouter.receberWebhook
                </code>
                <p className="text-xs text-muted-foreground mt-2">
                  Configure este endpoint no painel JusBrasil para receber eventos automaticamente.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog de detalhes do conector */}
      {selectedConector && (
        <Dialog open={!!selectedConector} onOpenChange={() => setSelectedConector(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {tipoIcons[selectedConector.tipo]} {selectedConector.metodo} {selectedConector.endpoint}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <h4 className="font-medium text-sm text-muted-foreground">Descrição</h4>
                <p className="mt-1">{selectedConector.descricao}</p>
              </div>
              <div>
                <h4 className="font-medium text-sm text-muted-foreground">Base URL</h4>
                <code className="text-xs bg-muted p-2 rounded block mt-1">{selectedConector.baseUrl}</code>
              </div>
              <div>
                <h4 className="font-medium text-sm text-muted-foreground">Módulo</h4>
                <p className="mt-1 text-sm">{selectedConector.modulo}</p>
              </div>
              {selectedConector.parametros && (
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground">Parâmetros</h4>
                  <pre className="text-xs bg-muted p-3 rounded mt-1 overflow-x-auto">
                    {JSON.stringify(JSON.parse(selectedConector.parametros), null, 2)}
                  </pre>
                </div>
              )}
              {selectedConector.exemploRequest && (
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground">Exemplo Request</h4>
                  <pre className="text-xs bg-muted p-3 rounded mt-1 overflow-x-auto">
                    {JSON.stringify(JSON.parse(selectedConector.exemploRequest), null, 2)}
                  </pre>
                </div>
              )}
              {selectedConector.exemploResponse && (
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground">Exemplo Response</h4>
                  <pre className="text-xs bg-muted p-3 rounded mt-1 overflow-x-auto">
                    {JSON.stringify(JSON.parse(selectedConector.exemploResponse), null, 2)}
                  </pre>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Badge className={tipoCores[selectedConector.tipo] || ""}>{selectedConector.tipo}</Badge>
                <Badge variant="outline">{selectedConector.autenticacao}</Badge>
                {selectedConector.ativo ? (
                  <Badge variant="outline" className="text-green-600 border-green-300">Ativo</Badge>
                ) : (
                  <Badge variant="outline" className="text-red-600 border-red-300">Inativo</Badge>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
