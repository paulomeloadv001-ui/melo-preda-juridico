import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useState } from "react";
import { AlertTriangle, CheckCircle, RefreshCw, Merge, Shield, FileSearch, Users, Scale } from "lucide-react";

export default function Correcao() {
  const diagnostico = trpc.correcao.diagnostico.useQuery();
  const normalizarCpfs = trpc.correcao.normalizarCpfs.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.corrigidos} CPFs normalizados`);
      diagnostico.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const autoMerge = trpc.correcao.autoMerge.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.totalMerges} clientes unificados`);
      diagnostico.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const deduplicarProcessos = trpc.correcao.deduplicarProcessos.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.processosRemovidos} processos duplicados removidos`);
      diagnostico.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const mergeClientes = trpc.correcao.mergeClientes.useMutation({
    onSuccess: (data) => {
      toast.success(`Merge realizado: ${data.mantido.nome} mantido, ${data.removido.nome} removido`);
      diagnostico.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const atualizarCpf = trpc.correcao.atualizarCpf.useMutation({
    onSuccess: (data) => {
      toast.success(`CPF atualizado para ${data.cpfAtualizado}`);
      diagnostico.refetch();
      setCpfEdit({});
    },
    onError: (e) => toast.error(e.message),
  });

  const [cpfEdit, setCpfEdit] = useState<Record<number, string>>({});
  const [mergeIds, setMergeIds] = useState<{ manter: number; remover: number }>({ manter: 0, remover: 0 });

  const data = diagnostico.data;
  const totalProblemas = (data?.duplicados?.length || 0) + (data?.semCpf?.length || 0) + (data?.processosOrfaos?.length || 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="h-6 w-6 text-amber-500" />
            Correção e Deduplicação
          </h1>
          <p className="text-muted-foreground mt-1">
            Identifique e corrija duplicidades, normalize CPFs e unifique registros de clientes
          </p>
        </div>
        <Button variant="outline" onClick={() => diagnostico.refetch()} disabled={diagnostico.isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${diagnostico.isLoading ? "animate-spin" : ""}`} />
          Atualizar Diagnóstico
        </Button>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className={`border-l-4 ${(data?.duplicados?.length || 0) > 0 ? "border-l-red-500" : "border-l-green-500"}`}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Users className={`h-8 w-8 ${(data?.duplicados?.length || 0) > 0 ? "text-red-500" : "text-green-500"}`} />
              <div>
                <p className="text-2xl font-bold">{data?.duplicados?.length || 0}</p>
                <p className="text-sm text-muted-foreground">CPFs Duplicados</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={`border-l-4 ${(data?.semCpf?.length || 0) > 0 ? "border-l-amber-500" : "border-l-green-500"}`}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className={`h-8 w-8 ${(data?.semCpf?.length || 0) > 0 ? "text-amber-500" : "text-green-500"}`} />
              <div>
                <p className="text-2xl font-bold">{data?.semCpf?.length || 0}</p>
                <p className="text-sm text-muted-foreground">Clientes sem CPF</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={`border-l-4 ${(data?.processosOrfaos?.length || 0) > 0 ? "border-l-orange-500" : "border-l-green-500"}`}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Scale className={`h-8 w-8 ${(data?.processosOrfaos?.length || 0) > 0 ? "text-orange-500" : "text-green-500"}`} />
              <div>
                <p className="text-2xl font-bold">{data?.processosOrfaos?.length || 0}</p>
                <p className="text-sm text-muted-foreground">Processos Duplicados</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ações Automáticas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Ações Automáticas de Correção
          </CardTitle>
          <CardDescription>
            Execute correções em massa com um clique. Cada ação é segura e preserva os dados mais completos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border rounded-lg p-4 space-y-3">
              <h3 className="font-semibold text-sm">1. Normalizar CPFs</h3>
              <p className="text-xs text-muted-foreground">Remove pontos, traços e barras de todos os CPFs para padronizar o formato.</p>
              <Button
                onClick={() => normalizarCpfs.mutate()}
                disabled={normalizarCpfs.isPending}
                className="w-full"
                variant="outline"
              >
                {normalizarCpfs.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                Normalizar CPFs
              </Button>
            </div>
            <div className="border rounded-lg p-4 space-y-3">
              <h3 className="font-semibold text-sm">2. Unificar Clientes Duplicados</h3>
              <p className="text-xs text-muted-foreground">Detecta clientes com mesmo CPF e unifica automaticamente, mantendo o mais antigo e movendo todos os processos.</p>
              <Button
                onClick={() => autoMerge.mutate()}
                disabled={autoMerge.isPending}
                className="w-full"
                variant="outline"
              >
                {autoMerge.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Merge className="h-4 w-4 mr-2" />}
                Auto-Merge Duplicados
              </Button>
            </div>
            <div className="border rounded-lg p-4 space-y-3">
              <h3 className="font-semibold text-sm">3. Deduplicar Processos</h3>
              <p className="text-xs text-muted-foreground">Remove processos com mesmo número CNJ, mantendo o mais recente e movendo dados vinculados.</p>
              <Button
                onClick={() => deduplicarProcessos.mutate()}
                disabled={deduplicarProcessos.isPending}
                className="w-full"
                variant="outline"
              >
                {deduplicarProcessos.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <FileSearch className="h-4 w-4 mr-2" />}
                Deduplicar Processos
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Status Geral */}
      {totalProblemas === 0 && !diagnostico.isLoading && (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="pt-6 flex items-center gap-3">
            <CheckCircle className="h-8 w-8 text-green-500" />
            <div>
              <p className="font-semibold text-green-700">Banco de dados limpo</p>
              <p className="text-sm text-muted-foreground">Nenhuma duplicidade ou inconsistência encontrada. Todos os clientes estão corretamente identificados por CPF.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Clientes Duplicados */}
      {(data?.duplicados?.length || 0) > 0 && (
        <Card className="border-red-500/30">
          <CardHeader>
            <CardTitle className="text-red-600 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Clientes com CPF Duplicado ({data?.duplicados?.length})
            </CardTitle>
            <CardDescription>
              Estes clientes possuem o mesmo CPF normalizado. Use "Auto-Merge" acima ou faça merge manual abaixo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data?.duplicados?.map((dup, i) => (
              <div key={i} className="border rounded-lg p-4 space-y-2">
                <p className="font-mono text-sm font-semibold">CPF: {dup.cpfNormalizado}</p>
                <div className="space-y-1">
                  {dup.clientes.map((cli) => (
                    <div key={cli.id} className="flex items-center justify-between bg-muted/50 rounded p-2 text-sm">
                      <span>ID {cli.id} — <strong>{cli.nome}</strong> (CPF original: {cli.cpfOriginal})</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Clientes sem CPF */}
      {(data?.semCpf?.length || 0) > 0 && (
        <Card className="border-amber-500/30">
          <CardHeader>
            <CardTitle className="text-amber-600 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Clientes sem CPF Válido ({data?.semCpf?.length})
            </CardTitle>
            <CardDescription>
              Insira o CPF correto para cada cliente abaixo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data?.semCpf?.map((cli) => (
              <div key={cli.id} className="flex items-center gap-3 border rounded-lg p-3">
                <div className="flex-1">
                  <p className="font-semibold text-sm">ID {cli.id} — {cli.nome}</p>
                  <p className="text-xs text-muted-foreground">CPF atual: {cli.cpfAtual}</p>
                </div>
                <Input
                  placeholder="Novo CPF (apenas números)"
                  className="w-48"
                  value={cpfEdit[cli.id] || ""}
                  onChange={(e) => setCpfEdit({ ...cpfEdit, [cli.id]: e.target.value })}
                />
                <Button
                  size="sm"
                  onClick={() => {
                    if (!cpfEdit[cli.id]) return toast.error("Digite o CPF");
                    atualizarCpf.mutate({ clienteId: cli.id, novoCpf: cpfEdit[cli.id] });
                  }}
                  disabled={atualizarCpf.isPending}
                >
                  Salvar
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Processos Duplicados */}
      {(data?.processosOrfaos?.length || 0) > 0 && (
        <Card className="border-orange-500/30">
          <CardHeader>
            <CardTitle className="text-orange-600 flex items-center gap-2">
              <Scale className="h-5 w-5" />
              Processos com CNJ Duplicado ({data?.processosOrfaos?.length})
            </CardTitle>
            <CardDescription>
              Use "Deduplicar Processos" acima para resolver automaticamente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data?.processosOrfaos?.map((dup, i) => (
              <div key={i} className="border rounded-lg p-3 space-y-1">
                <p className="font-mono text-sm font-semibold">CNJ: {dup.numeroCnj}</p>
                {dup.processos.map((p) => (
                  <div key={p.id} className="text-sm bg-muted/50 rounded p-2">
                    ID {p.id} — Cliente ID {p.clienteId} — {p.tipoAcao} — Fase: {p.fase}
                  </div>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Merge Manual */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Merge className="h-5 w-5" />
            Merge Manual de Clientes
          </CardTitle>
          <CardDescription>
            Informe os IDs dos clientes para unificar manualmente. O cliente "Manter" receberá todos os processos e dados do cliente "Remover".
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">ID Manter</label>
              <Input
                type="number"
                placeholder="ID do cliente a manter"
                value={mergeIds.manter || ""}
                onChange={(e) => setMergeIds({ ...mergeIds, manter: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">ID Remover</label>
              <Input
                type="number"
                placeholder="ID do cliente a remover"
                value={mergeIds.remover || ""}
                onChange={(e) => setMergeIds({ ...mergeIds, remover: parseInt(e.target.value) || 0 })}
              />
            </div>
            <Button
              onClick={() => {
                if (!mergeIds.manter || !mergeIds.remover) return toast.error("Informe ambos os IDs");
                mergeClientes.mutate({ manterClienteId: mergeIds.manter, removerClienteId: mergeIds.remover });
              }}
              disabled={mergeClientes.isPending}
            >
              {mergeClientes.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Merge className="h-4 w-4 mr-2" />}
              Executar Merge
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
