import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity, RefreshCw, Database, Cloud, Brain, Globe, Shield, Server,
  CheckCircle2, AlertTriangle, XCircle, HelpCircle, Clock, Wifi,
  Users, FileText, BookOpen, Briefcase, Layers
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'online':
      return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200"><CheckCircle2 className="w-3 h-3 mr-1" />Online</Badge>;
    case 'degradado':
      return <Badge className="bg-amber-100 text-amber-800 border-amber-200"><AlertTriangle className="w-3 h-3 mr-1" />Degradado</Badge>;
    case 'offline':
      return <Badge className="bg-red-100 text-red-800 border-red-200"><XCircle className="w-3 h-3 mr-1" />Offline</Badge>;
    case 'nao_configurado':
      return <Badge className="bg-gray-100 text-gray-600 border-gray-200"><HelpCircle className="w-3 h-3 mr-1" />Não Configurado</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function StatusGeralBanner({ status }: { status: string }) {
  const config = {
    operacional: { icon: CheckCircle2, label: 'Todos os Sistemas Operacionais', bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-800', iconColor: 'text-emerald-600' },
    degradado: { icon: AlertTriangle, label: 'Alguns Serviços Degradados', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800', iconColor: 'text-amber-600' },
    critico: { icon: XCircle, label: 'Serviços Críticos Offline', bg: 'bg-red-50 border-red-200', text: 'text-red-800', iconColor: 'text-red-600' },
  }[status] || { icon: HelpCircle, label: 'Verificando...', bg: 'bg-gray-50 border-gray-200', text: 'text-gray-800', iconColor: 'text-gray-600' };

  const Icon = config.icon;
  return (
    <div className={`${config.bg} border rounded-xl p-6 flex items-center gap-4`}>
      <div className={`p-3 rounded-full ${config.bg}`}>
        <Icon className={`w-8 h-8 ${config.iconColor}`} />
      </div>
      <div>
        <h2 className={`text-xl font-bold ${config.text}`}>{config.label}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Última verificação: {new Date().toLocaleString('pt-BR')}
        </p>
      </div>
    </div>
  );
}

function ServicoIcon({ categoria }: { categoria: string }) {
  switch (categoria) {
    case 'Infraestrutura': return <Server className="w-5 h-5 text-blue-600" />;
    case 'Inteligência Artificial': return <Brain className="w-5 h-5 text-purple-600" />;
    case 'APIs Externas': return <Globe className="w-5 h-5 text-orange-600" />;
    default: return <Activity className="w-5 h-5 text-gray-600" />;
  }
}

function MetricaCard({ icon: Icon, label, valor, cor }: { icon: any; label: string; valor: number; cor: string }) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/30 border">
      <div className={`p-2 rounded-lg ${cor}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold">{valor.toLocaleString('pt-BR')}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export default function StatusSistema() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const healthCheck = trpc.statusSistema.healthCheck.useQuery(undefined, {
    refetchInterval: 60000, // Auto-refresh a cada 60s
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await healthCheck.refetch();
    setIsRefreshing(false);
    toast.success("Status atualizado!");
  };

  if (healthCheck.isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Status do Sistema</h1>
            <p className="text-muted-foreground">Monitoramento em tempo real</p>
          </div>
        </div>
        <Skeleton className="h-24 w-full rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-32 rounded-lg" />)}
        </div>
      </div>
    );
  }

  const data = healthCheck.data;
  if (!data) {
    return (
      <div className="text-center py-12">
        <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-semibold">Erro ao verificar status</h2>
        <p className="text-muted-foreground mt-2">Não foi possível conectar ao servidor.</p>
        <Button onClick={handleRefresh} className="mt-4">Tentar Novamente</Button>
      </div>
    );
  }

  // Agrupar serviços por categoria
  const categorias = data.servicos.reduce((acc, s) => {
    if (!acc[s.categoria]) acc[s.categoria] = [];
    acc[s.categoria].push(s);
    return acc;
  }, {} as Record<string, typeof data.servicos>);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            Status do Sistema
          </h1>
          <p className="text-muted-foreground">Monitoramento em tempo real das integrações e serviços</p>
        </div>
        <Button
          onClick={handleRefresh}
          variant="outline"
          disabled={isRefreshing}
          className="gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Banner de Status Geral */}
      <StatusGeralBanner status={data.statusGeral} />

      {/* Resumo Rápido */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <div>
            <p className="text-lg font-bold text-emerald-800">{data.resumo.online}</p>
            <p className="text-xs text-emerald-600">Online</p>
          </div>
        </div>
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
          <AlertTriangle className="w-5 h-5 text-amber-600" />
          <div>
            <p className="text-lg font-bold text-amber-800">{data.resumo.degradado}</p>
            <p className="text-xs text-amber-600">Degradados</p>
          </div>
        </div>
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
          <XCircle className="w-5 h-5 text-red-600" />
          <div>
            <p className="text-lg font-bold text-red-800">{data.resumo.offline}</p>
            <p className="text-xs text-red-600">Offline</p>
          </div>
        </div>
        <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200">
          <Wifi className="w-5 h-5 text-blue-600" />
          <div>
            <p className="text-lg font-bold text-blue-800">{data.resumo.totalServicos}</p>
            <p className="text-xs text-blue-600">Total Serviços</p>
          </div>
        </div>
      </div>

      {/* Serviços por Categoria */}
      <div className="space-y-4">
        {Object.entries(categorias).map(([categoria, servicos]) => (
          <Card key={categoria}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ServicoIcon categoria={categoria} />
                {categoria}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {servicos.map((servico, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border">
                    <div className="flex items-center gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full ${
                        servico.status === 'online' ? 'bg-emerald-500 animate-pulse' :
                        servico.status === 'degradado' ? 'bg-amber-500' :
                        servico.status === 'offline' ? 'bg-red-500' : 'bg-gray-400'
                      }`} />
                      <div>
                        <p className="font-medium text-sm">{servico.servico}</p>
                        <p className="text-xs text-muted-foreground">{servico.mensagem}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {servico.latencia !== null && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {servico.latencia}ms
                        </span>
                      )}
                      <StatusBadge status={servico.status} />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Métricas do Banco de Dados */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-600" />
            Métricas do Banco de Dados
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <MetricaCard icon={Users} label="Clientes" valor={data.metricas.clientes} cor="bg-blue-600" />
            <MetricaCard icon={Briefcase} label="Processos" valor={data.metricas.processos} cor="bg-emerald-600" />
            <MetricaCard icon={FileText} label="Documentos" valor={data.metricas.documentos} cor="bg-purple-600" />
            <MetricaCard icon={BookOpen} label="Conhecimentos" valor={data.metricas.conhecimentos} cor="bg-orange-600" />
            <MetricaCard icon={Layers} label="Jobs Total" valor={data.metricas.jobs} cor="bg-gray-600" />
            <MetricaCard icon={Clock} label="Jobs Pendentes" valor={data.metricas.jobsPendentes} cor="bg-amber-600" />
          </div>
        </CardContent>
      </Card>

      {/* Informações do Sistema */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-5 h-5 text-green-600" />
            Informações do Sistema
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <div className="flex justify-between p-2 rounded bg-muted/30">
                <span className="text-muted-foreground">Plataforma</span>
                <span className="font-medium">Melo & Preda - Sistema Jurídico Integrado</span>
              </div>
              <div className="flex justify-between p-2 rounded bg-muted/30">
                <span className="text-muted-foreground">Versão</span>
                <span className="font-medium">2.0.0</span>
              </div>
              <div className="flex justify-between p-2 rounded bg-muted/30">
                <span className="text-muted-foreground">Ambiente</span>
                <span className="font-medium">Produção (Cloud Run)</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between p-2 rounded bg-muted/30">
                <span className="text-muted-foreground">Banco de Dados</span>
                <span className="font-medium">TiDB Serverless</span>
              </div>
              <div className="flex justify-between p-2 rounded bg-muted/30">
                <span className="text-muted-foreground">Storage</span>
                <span className="font-medium">AWS S3 + CloudFront CDN</span>
              </div>
              <div className="flex justify-between p-2 rounded bg-muted/30">
                <span className="text-muted-foreground">Auto-refresh</span>
                <span className="font-medium">A cada 60 segundos</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
