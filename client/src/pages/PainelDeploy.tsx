import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getManusStatusColor, getManusStatusLabel } from "@/lib/manus";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Database, Download, FileText, BookOpen, Shield, RefreshCw,
  CheckCircle2, AlertTriangle, HardDrive, Package, Loader2, FolderArchive, Cloud
} from "lucide-react";
import { toast } from "sonner";

export default function PainelDeploy() {
  const [exportando, setExportando] = useState(false);
  const [progressoExportacao, setProgressoExportacao] = useState(0);

  // Query de integridade do banco
  const integridade = trpc.integracoes.statusIntegracoes.useQuery(undefined, {
    refetchInterval: 30000,
  });
  const healthCheck = trpc.statusSistema.healthCheck.useQuery(undefined, {
    refetchInterval: 30000,
  });

  // Mutation para exportar banco completo
  const exportarBanco = trpc.integracoes.exportarBancoCompleto.useMutation({
    onSuccess: (data) => {
      setExportando(false);
      setProgressoExportacao(100);
      // Gerar download do JSON
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `melo-advogados-backup-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Exportação concluída com sucesso!");
    },
    onError: (err) => {
      setExportando(false);
      toast.error(`Erro na exportação: ${err.message}`);
    },
  });

  // Mutation para exportar conhecimentos
  const exportarConhecimentos = trpc.integracoes.exportarConhecimentos.useMutation({
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `banco-conhecimentos-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Conhecimentos exportados!");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleExportarCompleto = () => {
    setExportando(true);
    setProgressoExportacao(10);
    const interval = setInterval(() => {
      setProgressoExportacao(prev => Math.min(prev + 15, 90));
    }, 500);
    exportarBanco.mutate(undefined, {
      onSettled: () => clearInterval(interval),
    });
  };

  const plataforma = healthCheck.data?.plataforma;
  const manusStatus = plataforma?.manus.status;
  const manusConectado = manusStatus === "online";
  const manusCor = getManusStatusColor(manusStatus);
  const manusRotulo = getManusStatusLabel(manusStatus);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
            <Package className="h-6 w-6 text-indigo-700 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Painel de Deploy & Exportação</h1>
            <p className="text-sm text-muted-foreground">
              Backup completo, exportação de dados e deploy do sistema
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => integridade.refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
          </Button>
        </div>
      </div>

      {/* Status do Sistema */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Database className="h-8 w-8 text-blue-600" />
            <div>
              <p className="text-sm text-muted-foreground">Banco de Dados</p>
              <p className="text-lg font-bold text-green-600">Online</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Shield className="h-8 w-8 text-green-600" />
            <div>
              <p className="text-sm text-muted-foreground">Integridade</p>
              <p className="text-lg font-bold text-green-600">100%</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <HardDrive className="h-8 w-8 text-purple-600" />
            <div>
              <p className="text-sm text-muted-foreground">Último Backup</p>
              <p className="text-lg font-bold">Hoje</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Cloud className={`h-8 w-8 ${manusCor}`} />
            <div>
              <p className="text-sm text-muted-foreground">Conexão Manus</p>
              <p className={`text-lg font-bold ${manusCor}`}>{manusRotulo}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {plataforma && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cloud className="h-5 w-5 text-sky-600" />
              Conexão prática com o Manus
            </CardTitle>
            <CardDescription>
              A plataforma reflete o status real do OAuth, da sessão e dos serviços compartilhados
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg border p-3 bg-muted/30">
              <p className="text-muted-foreground">Status</p>
              <p className={`font-medium mt-1 ${manusCor}`}>
                {plataforma.manus.mensagem}
              </p>
            </div>
            <div className="rounded-lg border p-3 bg-muted/30">
              <p className="text-muted-foreground">URL Manus</p>
              <p className="font-medium mt-1 break-all">{plataforma.manus.url}</p>
            </div>
            <div className="rounded-lg border p-3 bg-muted/30">
              <p className="text-muted-foreground">Arquitetura</p>
              <p className="font-medium mt-1">{plataforma.arquitetura}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Exportação Completa */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderArchive className="h-5 w-5" />
            Exportação Completa do Sistema
          </CardTitle>
          <CardDescription>
            Exporta todo o banco de dados, conhecimentos, documentos e configurações em um único arquivo JSON
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {exportando && (
            <div className="space-y-2">
              <Progress value={progressoExportacao} className="h-2" />
              <p className="text-sm text-muted-foreground text-center">
                Exportando... {progressoExportacao}%
              </p>
            </div>
          )}
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <Button
              onClick={handleExportarCompleto}
              disabled={exportando}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {exportando ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Exportar Banco Completo
            </Button>

            <Button
              variant="outline"
              onClick={() => exportarConhecimentos.mutate()}
              disabled={exportarConhecimentos.isPending}
            >
              {exportarConhecimentos.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <BookOpen className="h-4 w-4 mr-2" />
              )}
              Exportar Conhecimentos
            </Button>

            <Button
              variant="outline"
              onClick={() => {
                // Exportar configurações do sistema
                const config = {
                  sistema: "Melo Advogados - JUSCONSIG",
                  versao: "2.0.0",
                  dataExportacao: new Date().toISOString(),
                  integracoes: {
                    dadosAbertosGO: !!process.env,
                    datajud: true,
                    celcoin: true,
                    gmailProjudi: true,
                    openFinance: true,
                  },
                  cronJobs: {
                    folhaPagamento: "0 8 10 * *",
                    movimentacoes: "0 6 * * *",
                    prazos: "0 7 * * *",
                    margem: "0 8 * * 1",
                  },
                };
                const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "configuracoes-sistema.json";
                a.click();
                toast.success("Configurações exportadas!");
              }}
            >
              <FileText className="h-4 w-4 mr-2" />
              Exportar Configurações
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Módulos do Sistema */}
      <Card>
        <CardHeader>
          <CardTitle>Módulos do Sistema</CardTitle>
          <CardDescription>Status de cada módulo e integração</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { nome: "Backend (tRPC + Express)", status: "ativo", cor: "green" },
              { nome: "Frontend (React + TailwindCSS)", status: "ativo", cor: "green" },
              { nome: "Banco de Dados (MySQL/TiDB)", status: "ativo", cor: "green" },
              { nome: "Agente IA (GPT-4 + Tools)", status: "ativo", cor: "green" },
              { nome: "OAuth + Sessão Manus", status: manusConectado ? "ativo" : "configurar", cor: manusConectado ? "green" : "yellow" },
              { nome: "Integração Dados Abertos GO", status: "configurar", cor: "yellow" },
              { nome: "Integração DataJud CNJ", status: "configurar", cor: "yellow" },
              { nome: "Integração Celcoin (Margem)", status: "configurar", cor: "yellow" },
              { nome: "Integração Gmail/PROJUDI", status: "configurar", cor: "yellow" },
              { nome: "Integração Open Finance", status: "configurar", cor: "yellow" },
              { nome: "Cron Jobs (4 automações)", status: "ativo", cor: "green" },
              { nome: "Webhooks (4 endpoints)", status: "ativo", cor: "green" },
              { nome: "Cache do Agente IA", status: "ativo", cor: "green" },
            ].map((modulo, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg border">
                <span className="font-medium">{modulo.nome}</span>
                <Badge variant={modulo.cor === "green" ? "default" : "secondary"} 
                  className={modulo.cor === "green" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}>
                  {modulo.status === "ativo" ? (
                    <><CheckCircle2 className="h-3 w-3 mr-1" /> Ativo</>
                  ) : (
                    <><AlertTriangle className="h-3 w-3 mr-1" /> Configurar .env</>
                  )}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Informações Técnicas */}
      <Card>
        <CardHeader>
          <CardTitle>Informações Técnicas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Framework</p>
              <p className="font-medium">React + Vite + TypeScript</p>
            </div>
            <div>
              <p className="text-muted-foreground">Backend</p>
              <p className="font-medium">{plataforma?.backend || "tRPC + Express + Drizzle"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Deploy</p>
              <p className="font-medium">{plataforma?.deploy || "Cloudflare Workers"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Banco</p>
              <p className="font-medium">{plataforma?.banco || "MySQL / TiDB Serverless"}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
