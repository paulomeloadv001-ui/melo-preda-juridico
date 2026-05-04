import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Coins, TrendingDown, TrendingUp, AlertTriangle, RefreshCw, Trash2, Search, Plus, Settings } from "lucide-react";
import { toast } from "sonner";

export default function Creditos() {

  const [tab, setTab] = useState<"saldo" | "operacoes" | "historico" | "varredura">("saldo");
  const [qtdRecarga, setQtdRecarga] = useState("");

  const saldo = trpc.creditos.saldo.useQuery();
  const operacoes = trpc.creditos.operacoes.useQuery();
  const historico = trpc.creditos.historico.useQuery({ limite: 50, tipo: "todos" });

  const adicionarMut = trpc.creditos.adicionar.useMutation({
    onSuccess: (data) => {
      toast.success(`Créditos adicionados! Novo saldo: ${data.novoSaldo}`);
      saldo.refetch();
      historico.refetch();
      setQtdRecarga("");
    },
    onError: (e) => toast.error(e.message),
  });

  const atualizarCustoMut = trpc.creditos.atualizarCusto.useMutation({
    onSuccess: () => { toast.success("Custo atualizado"); operacoes.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  // Varredura
  const [varreduraResult, setVarreduraResult] = useState<any>(null);
  const [varreduraLoading, setVarreduraLoading] = useState(false);
  const executarVarredura = trpc.varredura.executar.useMutation({
    onSuccess: (data) => { setVarreduraResult(data); setVarreduraLoading(false); },
    onError: (e) => { toast.error(e.message); setVarreduraLoading(false); },
  });
  const limparDuplicatas = trpc.varredura.limparDuplicatas.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.removidos} registro(s) removido(s)`);
      executarVarredura.mutate();
    },
    onError: (e) => toast.error(e.message),
  });

  const s = saldo.data;

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Créditos & Varredura</h1>
          <p className="text-muted-foreground">Controle de consumo interno e integridade dos dados</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-2">
        {[
          { key: "saldo", label: "Saldo & Recarga", icon: Coins },
          { key: "operacoes", label: "Custos por Operação", icon: Settings },
          { key: "historico", label: "Histórico", icon: TrendingDown },
          { key: "varredura", label: "Varredura Anti-Duplicidade", icon: Search },
        ].map((t) => (
          <Button key={t.key} variant={tab === t.key ? "default" : "ghost"} size="sm" onClick={() => setTab(t.key as any)}>
            <t.icon className="h-4 w-4 mr-1" /> {t.label}
          </Button>
        ))}
      </div>

      {/* TAB: SALDO */}
      {tab === "saldo" && (
        <div className="space-y-6">
          {/* Cards de saldo */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-100"><Coins className="h-5 w-5 text-green-600" /></div>
                  <div>
                    <p className="text-sm text-muted-foreground">Saldo Atual</p>
                    <p className="text-2xl font-bold">{s?.saldoAtual?.toLocaleString() ?? "..."}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-100"><TrendingUp className="h-5 w-5 text-blue-600" /></div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Adicionado</p>
                    <p className="text-2xl font-bold">{s?.totalAdicionado?.toLocaleString() ?? "..."}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-red-100"><TrendingDown className="h-5 w-5 text-red-600" /></div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Consumido</p>
                    <p className="text-2xl font-bold">{s?.totalConsumido?.toLocaleString() ?? "..."}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-yellow-100"><AlertTriangle className="h-5 w-5 text-yellow-600" /></div>
                  <div>
                    <p className="text-sm text-muted-foreground">% Usado</p>
                    <p className="text-2xl font-bold">{s?.percentualUsado ?? 0}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Barra de progresso */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex justify-between text-sm mb-2">
                <span>Consumo</span>
                <span>{s?.totalConsumido?.toLocaleString() ?? 0} / {s?.totalAdicionado?.toLocaleString() ?? 0}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div
                  className={`h-4 rounded-full transition-all ${(s?.percentualUsado ?? 0) > 80 ? 'bg-red-500' : (s?.percentualUsado ?? 0) > 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
                  style={{ width: `${Math.min(s?.percentualUsado ?? 0, 100)}%` }}
                />
              </div>
              {s && s.saldoAtual <= (s.limiteAlerta ?? 500) && (
                <p className="text-sm text-red-500 mt-2 flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" /> Saldo abaixo do limite de alerta ({s.limiteAlerta} créditos)
                </p>
              )}
            </CardContent>
          </Card>

          {/* Recarga */}
          <Card>
            <CardHeader><CardTitle className="text-lg">Adicionar Créditos</CardTitle></CardHeader>
            <CardContent>
              <div className="flex gap-3 items-center">
                <Input type="number" placeholder="Quantidade" value={qtdRecarga} onChange={(e) => setQtdRecarga(e.target.value)} className="w-48" />
                <Button onClick={() => { if (Number(qtdRecarga) > 0) adicionarMut.mutate({ quantidade: Number(qtdRecarga) }); }} disabled={adicionarMut.isPending || !qtdRecarga}>
                  <Plus className="h-4 w-4 mr-1" /> Recarregar
                </Button>
                {[1000, 5000, 10000].map((v) => (
                  <Button key={v} variant="outline" size="sm" onClick={() => adicionarMut.mutate({ quantidade: v })}>
                    +{v.toLocaleString()}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB: OPERAÇÕES */}
      {tab === "operacoes" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between">
              Custo por Operação
              <Button variant="ghost" size="sm" onClick={() => operacoes.refetch()}><RefreshCw className="h-4 w-4" /></Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <div className="grid grid-cols-5 gap-4 text-sm font-medium text-muted-foreground pb-2 border-b">
                <span>Operação</span><span>Descrição</span><span>Categoria</span><span>Custo</span><span>Status</span>
              </div>
              {operacoes.data?.map((op) => (
                <div key={op.id} className="grid grid-cols-5 gap-4 py-2 items-center text-sm border-b border-border/50">
                  <span className="font-mono text-xs">{op.operacao}</span>
                  <span>{op.descricao}</span>
                  <Badge variant="outline" className="w-fit">{op.categoria}</Badge>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      defaultValue={op.custoPorUso}
                      className="w-20 h-7 text-sm"
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== op.custoPorUso) atualizarCustoMut.mutate({ operacao: op.operacao, custoPorUso: v });
                      }}
                    />
                    <span className="text-muted-foreground">cr</span>
                  </div>
                  <Badge variant={op.ativo ? "default" : "secondary"}>{op.ativo ? "Ativo" : "Inativo"}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* TAB: HISTÓRICO */}
      {tab === "historico" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between">
              Histórico de Transações
              <Button variant="ghost" size="sm" onClick={() => historico.refetch()}><RefreshCw className="h-4 w-4" /></Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {historico.data?.length === 0 && <p className="text-muted-foreground text-center py-8">Nenhuma transação registrada ainda</p>}
            <div className="space-y-1 max-h-[500px] overflow-y-auto">
              {historico.data?.map((t) => (
                <div key={t.id} className="flex items-center justify-between py-2 border-b border-border/50">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${t.tipo === 'credito' ? 'bg-green-500' : t.tipo === 'debito' ? 'bg-red-500' : 'bg-yellow-500'}`} />
                    <div>
                      <p className="text-sm font-medium">{t.operacao}</p>
                      <p className="text-xs text-muted-foreground">{t.descricao}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${t.tipo === 'credito' ? 'text-green-600' : 'text-red-600'}`}>
                      {t.tipo === 'credito' ? '+' : '-'}{Math.abs(t.quantidade)}
                    </p>
                    <p className="text-xs text-muted-foreground">Saldo: {t.saldoApos}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* TAB: VARREDURA */}
      {tab === "varredura" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                Varredura Anti-Duplicidade
                <Button onClick={() => { setVarreduraLoading(true); executarVarredura.mutate(); }} disabled={varreduraLoading}>
                  <Search className="h-4 w-4 mr-1" /> {varreduraLoading ? "Analisando..." : "Executar Varredura"}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Analisa todos os registros do banco de dados para identificar duplicidades em clientes, processos, prazos, documentos e conhecimentos.
              </p>

              {varreduraResult && (
                <div className="space-y-4">
                  {/* Resumo */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="p-3 bg-muted rounded-lg text-center">
                      <p className="text-2xl font-bold">{varreduraResult.resumo.totalProblemas}</p>
                      <p className="text-xs text-muted-foreground">Problemas</p>
                    </div>
                    <div className="p-3 bg-muted rounded-lg text-center">
                      <p className="text-2xl font-bold">{varreduraResult.resumo.totalRegistros.clientes}</p>
                      <p className="text-xs text-muted-foreground">Clientes</p>
                    </div>
                    <div className="p-3 bg-muted rounded-lg text-center">
                      <p className="text-2xl font-bold">{varreduraResult.resumo.totalRegistros.processos}</p>
                      <p className="text-xs text-muted-foreground">Processos</p>
                    </div>
                    <div className="p-3 bg-muted rounded-lg text-center">
                      <p className="text-2xl font-bold">{varreduraResult.resumo.totalRegistros.documentos}</p>
                      <p className="text-xs text-muted-foreground">Documentos</p>
                    </div>
                  </div>

                  {/* Lista de problemas */}
                  {varreduraResult.problemas.length === 0 ? (
                    <div className="text-center py-8 text-green-600">
                      <p className="text-lg font-medium">Nenhuma duplicidade encontrada!</p>
                      <p className="text-sm text-muted-foreground">Todos os dados estão únicos e organizados.</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                      {varreduraResult.problemas.map((p: any, i: number) => (
                        <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Badge variant={p.tipo.includes('duplicado') ? 'destructive' : 'secondary'} className="text-xs">
                                {p.tipo.replace('_', ' ')}
                              </Badge>
                              <span className="text-sm">{p.descricao}</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">{p.sugestao}</p>
                          </div>
                          {['prazo_duplicado', 'documento_duplicado', 'conhecimento_duplicado', 'processo_duplicado'].includes(p.tipo) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500 hover:text-red-700"
                              onClick={() => limparDuplicatas.mutate({ tipo: p.tipo, ids: p.ids })}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">Executado em: {new Date(varreduraResult.executadoEm).toLocaleString('pt-BR')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
