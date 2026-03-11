import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Database, FileText, BookOpen, Loader2, Users, FolderOpen, ExternalLink, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function downloadJson(data: any, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function jsonToCsv(data: any[]): string {
  if (!data.length) return "";
  const flattenObj = (obj: any, prefix = ""): Record<string, string> => {
    const result: Record<string, string> = {};
    for (const key in obj) {
      const val = obj[key];
      const newKey = prefix ? `${prefix}.${key}` : key;
      if (val && typeof val === "object" && !Array.isArray(val) && !(val instanceof Date)) {
        Object.assign(result, flattenObj(val, newKey));
      } else {
        result[newKey] = val === null || val === undefined ? "" : String(val);
      }
    }
    return result;
  };
  const flatData = data.map(d => flattenObj(d));
  const headers = Array.from(new Set(flatData.flatMap(d => Object.keys(d))));
  const csvRows = [headers.join(",")];
  for (const row of flatData) {
    csvRows.push(headers.map(h => {
      const val = row[h] || "";
      return val.includes(",") || val.includes('"') || val.includes("\n") ? `"${val.replace(/"/g, '""')}"` : val;
    }).join(","));
  }
  return csvRows.join("\n");
}

function downloadCsv(data: any[], filename: string) {
  const csv = jsonToCsv(data);
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Exportacao() {
  const [loadingType, setLoadingType] = useState<string | null>(null);
  const { data: clientesList } = trpc.clientes.list.useQuery();
  const { data: stats } = trpc.clientes.stats.useQuery();
  const exportAllMutation = trpc.exportar.todosClientesJson.useQuery(undefined, { enabled: false });
  const exportKnowledgeMutation = trpc.exportar.conhecimentosJson.useQuery(undefined, { enabled: false });
  const generatePasta = trpc.pasta.generate.useMutation();

  const handleExportAllJson = async () => {
    setLoadingType("all-json");
    try {
      const result = await exportAllMutation.refetch();
      if (result.data) {
        downloadJson(result.data, `melo_preda_banco_completo_${Date.now()}.json`);
        toast.success("Banco de dados completo exportado em JSON");
      }
    } catch (e) {
      toast.error("Erro na exportação");
    }
    setLoadingType(null);
  };

  const handleExportAllCsv = async () => {
    setLoadingType("all-csv");
    try {
      const result = await exportAllMutation.refetch();
      if (result.data && (result.data as any).dados) {
        const flatData = (result.data as any).dados.map((d: any) => ({
          pasta: d.pasta,
          cpfCnpj: d.cliente.cpfCnpj,
          nomeCompleto: d.cliente.nomeCompleto,
          profissao: d.cliente.profissao,
          cargo: d.cliente.cargo,
          orgaoEmpregador: d.cliente.orgaoEmpregador,
          cidade: d.cliente.cidade,
          estado: d.cliente.estado,
          telefone: d.cliente.telefone,
          email: d.cliente.email,
          totalProcessos: d.processos?.length ?? 0,
          processosAtivos: d.processos?.filter((p: any) => p.statusProcesso === "Ativo").length ?? 0,
          remuneracaoBruta: d.dadosFinanceiros?.[0]?.remuneracaoBruta ?? "",
          remuneracaoLiquida: d.dadosFinanceiros?.[0]?.remuneracaoLiquida ?? "",
          margemConsignavel: d.dadosFinanceiros?.[0]?.margemConsignavelValor ?? "",
          totalEmprestimos: d.emprestimos?.length ?? 0,
        }));
        downloadCsv(flatData, `melo_preda_clientes_${Date.now()}.csv`);
        toast.success("Dados exportados em CSV");
      }
    } catch (e) {
      toast.error("Erro na exportação CSV");
    }
    setLoadingType(null);
  };

  const handleExportKnowledge = async () => {
    setLoadingType("knowledge");
    try {
      const result = await exportKnowledgeMutation.refetch();
      if (result.data) {
        downloadJson(result.data, `melo_preda_conhecimentos_${Date.now()}.json`);
        toast.success("Banco de conhecimentos exportado");
      }
    } catch (e) {
      toast.error("Erro na exportação");
    }
    setLoadingType(null);
  };

  const handleExportClienteIndividual = async (clienteId: number, nome: string) => {
    setLoadingType(`cli-${clienteId}`);
    try {
      const res = await fetch(`/api/trpc/exportar.clienteJson?input=${encodeURIComponent(JSON.stringify({ json: { clienteId } }))}`);
      const json = await res.json();
      const data = json?.result?.data?.json;
      if (data) {
        downloadJson(data, `cliente_${nome.replace(/\s/g, "_")}_${Date.now()}.json`);
        toast.success(`Dados de ${nome} exportados`);
      }
    } catch (e) {
      toast.error("Erro na exportação individual");
    }
    setLoadingType(null);
  };

  const handleGeneratePasta = async (clienteId: number, nome: string) => {
    setLoadingType(`pasta-${clienteId}`);
    try {
      const result = await generatePasta.mutateAsync({ clienteId });
      if (result?.files) {
        toast.success(`Pasta de ${nome} gerada com sucesso! ${Object.keys(result.files).length} arquivos.`);
      }
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`);
    }
    setLoadingType(null);
  };

  const handleGenerateAllPastas = async () => {
    if (!clientesList?.length) return;
    setLoadingType("all-pastas");
    let success = 0;
    let errors = 0;
    for (const cli of clientesList) {
      try {
        await generatePasta.mutateAsync({ clienteId: cli.id });
        success++;
      } catch {
        errors++;
      }
    }
    toast.success(`Pastas geradas: ${success} sucesso, ${errors} erros`);
    setLoadingType(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Exportação em Massa</h1>
        <p className="text-muted-foreground mt-1">Exporte dados do banco para integração com outros sistemas e projetos</p>
      </div>

      {/* Geração de Pastas em Massa */}
      <Card className="border-2 border-[oklch(0.75_0.12_85)]/30 shadow-sm bg-[oklch(0.75_0.12_85)]/5">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-[oklch(0.75_0.12_85)]" /> Gerar Pastas de Todos os Clientes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Gera uma pasta individual para cada cliente no armazenamento com todos os arquivos JSON (ficha, processos, financeiro, conhecimentos, documentos e banco completo). Ideal para integração em massa com outros sistemas.
          </p>
          <div className="flex items-center justify-between">
            <Badge variant="secondary">{stats?.totalClientes ?? 0} clientes</Badge>
            <Button onClick={handleGenerateAllPastas} disabled={loadingType !== null} size="sm" className="gold-gradient text-white">
              {loadingType === "all-pastas" ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Gerando...</> : <><FolderOpen className="h-4 w-4 mr-2" /> Gerar Todas as Pastas</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Exportação Completa */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="h-4 w-4 text-[oklch(0.75_0.12_85)]" /> Banco Completo (JSON)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Exporta todos os clientes, processos, dados financeiros, empréstimos, estratégias e documentos em formato JSON estruturado.
            </p>
            <div className="flex items-center justify-between">
              <Badge variant="secondary">{stats?.totalClientes ?? 0} clientes</Badge>
              <Button onClick={handleExportAllJson} disabled={loadingType !== null} size="sm" className="gold-gradient text-white">
                {loadingType === "all-json" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
                JSON
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-[oklch(0.75_0.12_85)]" /> Planilha de Clientes (CSV)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Exporta dados resumidos dos clientes em CSV para importação em Excel, Google Sheets ou sistemas de CRM.
            </p>
            <div className="flex items-center justify-between">
              <Badge variant="secondary">Pronto para Excel</Badge>
              <Button onClick={handleExportAllCsv} disabled={loadingType !== null} size="sm" variant="outline">
                {loadingType === "all-csv" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
                CSV
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-[oklch(0.75_0.12_85)]" /> Banco de Conhecimentos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Exporta teses, jurisprudências, estratégias e modelos extraídos dos processos para reutilização.
            </p>
            <div className="flex items-center justify-between">
              <Badge variant="secondary">Teses e Estratégias</Badge>
              <Button onClick={handleExportKnowledge} disabled={loadingType !== null} size="sm" variant="outline">
                {loadingType === "knowledge" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
                JSON
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Exportação Individual por Cliente */}
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-[oklch(0.75_0.12_85)]" /> Exportação Individual por Cliente
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!clientesList?.length ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum cliente no banco de dados</p>
          ) : (
            <div className="space-y-2">
              {clientesList.map((cli) => (
                <div key={cli.id} className="flex items-center justify-between border rounded-lg p-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-full gold-gradient flex items-center justify-center text-white font-bold text-xs shrink-0">
                      {cli.nomeCompleto.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{cli.nomeCompleto}</p>
                      <p className="text-xs text-muted-foreground font-mono">{cli.cpfCnpj}</p>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleGeneratePasta(cli.id, cli.nomeCompleto)}
                      disabled={loadingType !== null}
                      title="Gerar Pasta S3"
                    >
                      {loadingType === `pasta-${cli.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleExportClienteIndividual(cli.id, cli.nomeCompleto)}
                      disabled={loadingType !== null}
                      title="Baixar JSON"
                    >
                      {loadingType === `cli-${cli.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
