import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Database, Calendar, Brain, DollarSign, RefreshCw, CheckCircle2,
  AlertTriangle, Loader2, Zap, ArrowRight, BarChart3
} from "lucide-react";

export default function PreenchimentoDB() {
  const [executando, setExecutando] = useState<string | null>(null);

  const statusQuery = trpc.preenchimento.statusPreenchimento.useQuery(undefined, {
    refetchInterval: executando ? 3000 : 30000,
  });

  const gerarPrazos = trpc.preenchimento.gerarPrazos.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.mensagem}`);
      statusQuery.refetch();
      setExecutando(null);
    },
    onError: (err) => {
      toast.error(`Erro ao gerar prazos: ${err.message}`);
      setExecutando(null);
    },
  });

  const gerarEstrategias = trpc.preenchimento.gerarEstrategias.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.mensagem}`);
      statusQuery.refetch();
      setExecutando(null);
    },
    onError: (err) => {
      toast.error(`Erro ao gerar estratégias: ${err.message}`);
      setExecutando(null);
    },
  });

  const gerarFinanceiro = trpc.preenchimento.gerarFinanceiro.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.mensagem}`);
      statusQuery.refetch();
      setExecutando(null);
    },
    onError: (err) => {
      toast.error(`Erro ao gerar dados financeiros: ${err.message}`);
      setExecutando(null);
    },
  });

  const status = statusQuery.data;
  const isLoading = statusQuery.isLoading;

  const handleGerarPrazos = () => {
    setExecutando('prazos');
    gerarPrazos.mutate();
  };

  const handleGerarEstrategias = () => {
    setExecutando('estrategias');
    gerarEstrategias.mutate();
  };

  const handleGerarFinanceiro = () => {
    setExecutando('financeiro');
    gerarFinanceiro.mutate();
  };

  const handleGerarTudo = async () => {
    setExecutando('tudo');
    try {
      await gerarPrazos.mutateAsync();
      await gerarFinanceiro.mutateAsync();
      await gerarEstrategias.mutateAsync();
      toast.success("Preenchimento completo executado com sucesso!");
    } catch (err) {
      toast.error("Erro durante o preenchimento automático");
    } finally {
      setExecutando(null);
      statusQuery.refetch();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Carregando status do banco...</span>
      </div>
    );
  }

  const completudeGeral = status ? Math.round(
    (status.completude.estrategias + status.completude.financeiro + status.completude.prazos + status.completude.cpf) / 4
  ) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Database className="h-7 w-7 text-primary" />
            Preenchimento Automático do Banco de Dados
          </h1>
          <p className="text-muted-foreground mt-1">
            Preencha automaticamente prazos, estratégias e dados financeiros para todos os processos
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => statusQuery.refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
          </Button>
          <Button
            onClick={handleGerarTudo}
            disabled={executando !== null}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
          >
            {executando === 'tudo' ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Executando...</>
            ) : (
              <><Zap className="h-4 w-4 mr-1" /> Preencher Tudo</>
            )}
          </Button>
        </div>
      </div>

      {/* Completude Geral */}
      <Card className="border-2 border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Completude Geral do Banco de Dados
          </CardTitle>
          <CardDescription>
            {status?.totalProcessos || 0} processos | {status?.totalClientes || 0} clientes | {status?.totalEstrategias || 0} estratégias | {status?.totalPrazos || 0} prazos | {status?.totalFinanceiro || 0} registros financeiros
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Completude Geral</span>
              <span className="font-bold">{completudeGeral}%</span>
            </div>
            <Progress value={completudeGeral} className="h-4" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <div className="text-2xl font-bold text-blue-600">{status?.completude.estrategias || 0}%</div>
              <div className="text-xs text-muted-foreground">Estratégias</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <div className="text-2xl font-bold text-green-600">{status?.completude.financeiro || 0}%</div>
              <div className="text-xs text-muted-foreground">Financeiro</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <div className="text-2xl font-bold text-orange-600">{status?.completude.prazos || 0}%</div>
              <div className="text-xs text-muted-foreground">Prazos</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <div className="text-2xl font-bold text-purple-600">{status?.completude.cpf || 0}%</div>
              <div className="text-xs text-muted-foreground">CPF Clientes</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alertas */}
      {status && (status.cnjInvalido > 0 || status.cpfPendente > 0) && (
        <Card className="border-yellow-500/50 bg-yellow-500/5">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-700">Atenção - Dados incompletos detectados</p>
                <ul className="text-sm text-muted-foreground mt-1 space-y-1">
                  {status.cnjInvalido > 0 && <li>• {status.cnjInvalido} processos com CNJ inválido (prefixo "SEM_")</li>}
                  {status.cpfPendente > 0 && <li>• {status.cpfPendente} clientes sem CPF — use a página Enriquecimento Cadastral</li>}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cards de Preenchimento */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Prazos Processuais */}
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-400 to-orange-600" />
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Calendar className="h-5 w-5 text-orange-500" />
              Prazos Processuais
            </CardTitle>
            <CardDescription>
              Gerar prazos automáticos (manifestação, recurso, cumprimento) para processos ativos
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Processos sem prazo:</span>
              <Badge variant={status?.semPrazo === 0 ? "default" : "destructive"}>
                {status?.semPrazo || 0}
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Total de prazos:</span>
              <Badge variant="outline">{status?.totalPrazos || 0}</Badge>
            </div>
            <Progress value={status?.completude.prazos || 0} className="h-2" />
            <Button
              onClick={handleGerarPrazos}
              disabled={executando !== null || status?.semPrazo === 0}
              className="w-full"
              variant={status?.semPrazo === 0 ? "outline" : "default"}
            >
              {executando === 'prazos' ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Gerando prazos...</>
              ) : status?.semPrazo === 0 ? (
                <><CheckCircle2 className="h-4 w-4 mr-1" /> Completo</>
              ) : (
                <><Calendar className="h-4 w-4 mr-1" /> Gerar {(status?.semPrazo || 0) * 3} Prazos</>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Estratégias Processuais */}
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 to-blue-600" />
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Brain className="h-5 w-5 text-blue-500" />
              Estratégias via IA
            </CardTitle>
            <CardDescription>
              Gerar estratégias processuais completas via IA (tese, fundamentação, jurisprudência)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Processos sem estratégia:</span>
              <Badge variant={status?.semEstrategia === 0 ? "default" : "destructive"}>
                {status?.semEstrategia || 0}
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Total de estratégias:</span>
              <Badge variant="outline">{status?.totalEstrategias || 0}</Badge>
            </div>
            <Progress value={status?.completude.estrategias || 0} className="h-2" />
            <Button
              onClick={handleGerarEstrategias}
              disabled={executando !== null || status?.semEstrategia === 0}
              className="w-full"
              variant={status?.semEstrategia === 0 ? "outline" : "default"}
            >
              {executando === 'estrategias' || executando === 'tudo' ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Gerando via IA...</>
              ) : status?.semEstrategia === 0 ? (
                <><CheckCircle2 className="h-4 w-4 mr-1" /> Completo</>
              ) : (
                <><Brain className="h-4 w-4 mr-1" /> Gerar {status?.semEstrategia || 0} Estratégias</>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Dados Financeiros */}
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-400 to-green-600" />
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <DollarSign className="h-5 w-5 text-green-500" />
              Dados Financeiros
            </CardTitle>
            <CardDescription>
              Gerar honorários contratuais (20%) e sucumbenciais (10%) baseados no valor da causa
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Processos sem financeiro:</span>
              <Badge variant={status?.semFinanceiro === 0 ? "default" : "destructive"}>
                {status?.semFinanceiro || 0}
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Total de registros:</span>
              <Badge variant="outline">{status?.totalFinanceiro || 0}</Badge>
            </div>
            <Progress value={status?.completude.financeiro || 0} className="h-2" />
            <Button
              onClick={handleGerarFinanceiro}
              disabled={executando !== null || status?.semFinanceiro === 0}
              className="w-full"
              variant={status?.semFinanceiro === 0 ? "outline" : "default"}
            >
              {executando === 'financeiro' ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Gerando financeiro...</>
              ) : status?.semFinanceiro === 0 ? (
                <><CheckCircle2 className="h-4 w-4 mr-1" /> Completo</>
              ) : (
                <><DollarSign className="h-4 w-4 mr-1" /> Gerar Dados Financeiros</>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Fluxo de Dados */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowRight className="h-5 w-5 text-primary" />
            Fluxo Completo de Dados
          </CardTitle>
          <CardDescription>
            Sequência lógica do preenchimento de ponta a ponta
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {[
              { label: "Upload PDF", ok: true },
              { label: "Extração IA", ok: true },
              { label: "Cliente Criado", ok: (status?.totalClientes || 0) > 0 },
              { label: "Processo Criado", ok: (status?.totalProcessos || 0) > 0 },
              { label: "CPF Preenchido", ok: status?.completude.cpf === 100 },
              { label: "Estratégia IA", ok: status?.completude.estrategias === 100 },
              { label: "Prazos Gerados", ok: status?.completude.prazos === 100 },
              { label: "Financeiro", ok: status?.completude.financeiro === 100 },
              { label: "Relatórios", ok: true },
              { label: "Exportação", ok: true },
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1 ${
                  step.ok
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                }`}>
                  {step.ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                  {step.label}
                </div>
                {i < 9 && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
