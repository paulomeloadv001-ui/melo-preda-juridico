import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import {
  FileText, RefreshCw, Trash2, Download, FileBarChart, Users, Scale,
  ChevronDown, ChevronRight, Eye, Pencil, FolderOpen, Clock, CheckCircle2,
  Building2, Briefcase, CreditCard, AlertCircle, TrendingUp, TrendingDown,
  ShieldCheck, ShieldAlert, Percent, Landmark, MapPin, Gavel
} from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

function formatCpf(cpf: string): string {
  if (!cpf || cpf.length !== 11) return cpf;
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

function formatCurrency(val: string | null | undefined): string {
  if (!val) return "—";
  const num = parseFloat(val);
  if (isNaN(num)) return val;
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Relatorios() {
  const [activeSection, setActiveSection] = useState<string>("cadastral_pf");
  const [expandedClients, setExpandedClients] = useState<Set<number>>(new Set());
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editId, setEditId] = useState<number | null>(null);

  // Dados em tempo real do banco
  const dadosRealtime = trpc.relatorios.dadosCadastraisRealtime.useQuery(undefined, {
    refetchInterval: 30000, // Atualiza a cada 30 segundos
  });

  // Lista de relatórios gerados
  const relatoriosList = trpc.relatorios.list.useQuery(undefined, {
    placeholderData: (prev) => prev,
  });

  // Categorias disponíveis
  const categorias = trpc.relatorios.categorias.useQuery();

  // Dados de Margem Consignável
  const dadosMargem = trpc.relatorios.dadosMargemRealtime.useQuery(undefined, {
    refetchInterval: 30000,
    enabled: activeSection === 'financeiro_margem',
  });

  // Dados de Panorama Processual
  const dadosPanorama = trpc.relatorios.dadosPanoramaRealtime.useQuery(undefined, {
    refetchInterval: 30000,
    enabled: activeSection === 'processual_geral',
  });

  // Mutations
  const gerarCadastral = trpc.relatorios.gerarCadastral.useMutation({
    onSuccess: (data) => {
      toast.success(`Relatório gerado com sucesso! ${data.totalClientes} clientes, ${data.totalProcessos} processos.`);
      dadosRealtime.refetch();
      relatoriosList.refetch();
    },
    onError: (e) => toast.error(`Erro ao gerar relatório: ${e.message}`),
  });

  const gerarMargem = trpc.relatorios.gerarMargemConsignavel.useMutation({
    onSuccess: (data) => {
      toast.success(`Relatório de margem gerado! ${data.totalClientes} clientes analisados.`);
      dadosMargem.refetch();
      relatoriosList.refetch();
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const gerarPanorama = trpc.relatorios.gerarPanoramaProcessual.useMutation({
    onSuccess: (data) => {
      toast.success(`Panorama gerado! ${data.totalProcessos} processos analisados.`);
      dadosPanorama.refetch();
      relatoriosList.refetch();
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const deleteRelatorio = trpc.relatorios.delete.useMutation({
    onSuccess: () => {
      toast.success("Relatório excluído");
      relatoriosList.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateRelatorio = trpc.relatorios.update.useMutation({
    onSuccess: () => {
      toast.success("Relatório atualizado");
      relatoriosList.refetch();
      setEditDialogOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleClient = (id: number) => {
    setExpandedClients(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    if (!dadosRealtime.data?.clientes) return;
    setExpandedClients(new Set(dadosRealtime.data.clientes.map(c => c.id)));
  };

  const collapseAll = () => {
    setExpandedClients(new Set());
  };

  const handleExportPdf = () => {
    if (!dadosRealtime.data?.clientes) return toast.error("Nenhum dado para exportar");

    // Gerar HTML para impressão como PDF
    const clientes = dadosRealtime.data.clientes;
    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Relatório de Dados Cadastrais - Melo & Preda Advogados</title>
  <style>
    @page { margin: 2cm; size: A4; }
    body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.6; color: #1a1a1a; }
    .header { text-align: center; border-bottom: 3px double #8B7355; padding-bottom: 15px; margin-bottom: 25px; }
    .header h1 { font-size: 16pt; font-weight: bold; color: #2c1810; margin: 0; letter-spacing: 2px; }
    .header h2 { font-size: 13pt; color: #8B7355; margin: 5px 0 0; font-weight: normal; }
    .header .date { font-size: 10pt; color: #666; margin-top: 8px; }
    .summary { background: #f8f5f0; border: 1px solid #d4c5a9; padding: 15px; margin-bottom: 25px; border-radius: 4px; }
    .summary h3 { margin: 0 0 10px; color: #2c1810; font-size: 13pt; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
    .summary-item { text-align: center; }
    .summary-item .value { font-size: 18pt; font-weight: bold; color: #8B7355; }
    .summary-item .label { font-size: 9pt; color: #666; }
    .client-section { page-break-inside: avoid; margin-bottom: 20px; border: 1px solid #e0d8c8; border-radius: 4px; }
    .client-header { background: #2c1810; color: white; padding: 10px 15px; font-weight: bold; font-size: 12pt; }
    .client-body { padding: 15px; }
    .field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px 20px; }
    .field { margin-bottom: 3px; }
    .field-label { font-weight: bold; color: #555; font-size: 10pt; }
    .field-value { color: #1a1a1a; }
    .process-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 10pt; }
    .process-table th { background: #f0ebe0; border: 1px solid #d4c5a9; padding: 6px 8px; text-align: left; font-weight: bold; }
    .process-table td { border: 1px solid #d4c5a9; padding: 6px 8px; }
    .footer { text-align: center; border-top: 2px solid #8B7355; padding-top: 10px; margin-top: 30px; font-size: 9pt; color: #888; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 9pt; font-weight: bold; }
    .badge-ativo { background: #d4edda; color: #155724; }
    .badge-inativo { background: #f8d7da; color: #721c24; }
  </style>
</head>
<body>
  <div class="header">
    <h1>MELO & PREDA ADVOGADOS</h1>
    <h2>Relatório de Dados Cadastrais — Clientes Pessoa Física</h2>
    <div class="date">Gerado em: ${new Date().toLocaleString('pt-BR')}</div>
  </div>

  <div class="summary">
    <h3>Resumo Geral</h3>
    <div class="summary-grid">
      <div class="summary-item">
        <div class="value">${dadosRealtime.data.totalClientesPF}</div>
        <div class="label">Clientes PF</div>
      </div>
      <div class="summary-item">
        <div class="value">${dadosRealtime.data.totalProcessos}</div>
        <div class="label">Processos</div>
      </div>
      <div class="summary-item">
        <div class="value">${dadosRealtime.data.totalEmprestimos}</div>
        <div class="label">Empréstimos</div>
      </div>
      <div class="summary-item">
        <div class="value">${formatCurrency(dadosRealtime.data.valorTotalCausas)}</div>
        <div class="label">Valor Total</div>
      </div>
    </div>
  </div>

  ${clientes.map((cli, idx) => `
    <div class="client-section">
      <div class="client-header">${idx + 1}. ${cli.nomeCompleto}</div>
      <div class="client-body">
        <div class="field-grid">
          <div class="field"><span class="field-label">CPF:</span> <span class="field-value">${formatCpf(cli.cpfCnpj)}</span></div>
          <div class="field"><span class="field-label">RG:</span> <span class="field-value">${cli.rg || '—'}</span></div>
          <div class="field"><span class="field-label">Profissão:</span> <span class="field-value">${cli.profissao || '—'}</span></div>
          <div class="field"><span class="field-label">Cargo:</span> <span class="field-value">${cli.cargo || '—'}</span></div>
          <div class="field"><span class="field-label">Órgão Empregador:</span> <span class="field-value">${cli.orgaoEmpregador || '—'}</span></div>
          <div class="field"><span class="field-label">Vínculo Funcional:</span> <span class="field-value">${cli.vinculoFuncional || '—'}</span></div>
          <div class="field"><span class="field-label">Cidade/UF:</span> <span class="field-value">${cli.cidade || '—'}${cli.estado ? '/' + cli.estado : ''}</span></div>
          <div class="field"><span class="field-label">Telefone:</span> <span class="field-value">${cli.telefone || '—'}</span></div>
        </div>
        ${cli.processos.length > 0 ? `
          <table class="process-table">
            <thead>
              <tr>
                <th>Nº CNJ</th>
                <th>Tribunal/Vara</th>
                <th>Tipo de Ação</th>
                <th>Fase</th>
                <th>Status</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              ${cli.processos.map(p => `
                <tr>
                  <td>${p.numeroCnj || '—'}</td>
                  <td>${p.tribunal || '—'}${p.vara ? ' / ' + p.vara : ''}</td>
                  <td>${p.tipoAcao || '—'}</td>
                  <td>${p.faseAtual || '—'}</td>
                  <td><span class="badge ${p.statusProcesso === 'Ativo' ? 'badge-ativo' : 'badge-inativo'}">${p.statusProcesso || '—'}</span></td>
                  <td>${formatCurrency(p.valorCausa)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : '<p style="color: #999; font-style: italic; margin-top: 8px;">Nenhum processo vinculado</p>'}
        ${cli.dadosFinanceiros ? `
          <div style="margin-top: 10px; padding: 8px; background: #f8f5f0; border-radius: 4px; font-size: 10pt;">
            <strong>Dados Financeiros:</strong>
            Remuneração Bruta: ${formatCurrency(cli.dadosFinanceiros.remuneracaoBruta)} |
            Remuneração Líquida: ${formatCurrency(cli.dadosFinanceiros.remuneracaoLiquida)} |
            Fonte: ${cli.dadosFinanceiros.fonteRenda || '—'}
          </div>
        ` : ''}
      </div>
    </div>
  `).join('')}

  <div class="footer">
    <p>MELO & PREDA ADVOGADOS — Sistema Jurídico Integrado</p>
    <p>Documento gerado automaticamente em ${new Date().toLocaleString('pt-BR')}</p>
  </div>
</body>
</html>`;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.print();
      }, 500);
    }
  };

  const handleExportJson = () => {
    if (!dadosRealtime.data) return toast.error("Nenhum dado");
    const blob = new Blob([JSON.stringify(dadosRealtime.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio_cadastral_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("JSON exportado");
  };

  const openEditDialog = (id: number, titulo: string, descricao: string) => {
    setEditId(id);
    setEditTitle(titulo);
    setEditDescription(descricao);
    setEditDialogOpen(true);
  };

  const data = dadosRealtime.data;
  const reports = Array.isArray(relatoriosList.data) ? relatoriosList.data : [];
  const cats = categorias.data || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileBarChart className="h-6 w-6 text-[oklch(0.75_0.12_85)]" />
            Relatórios
          </h1>
          <p className="text-muted-foreground mt-1">
            Relatórios dinâmicos gerados em tempo real a partir do banco de dados
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { dadosRealtime.refetch(); relatoriosList.refetch(); }} disabled={dadosRealtime.isFetching}>
            <RefreshCw className={`h-4 w-4 mr-1 ${dadosRealtime.isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Categorias de Relatórios */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cats.map((cat) => (
          <Card
            key={cat.id}
            className={`cursor-pointer transition-all hover:shadow-md ${activeSection.startsWith(cat.id) ? "ring-2 ring-[oklch(0.75_0.12_85)] shadow-md" : "border"}`}
            onClick={() => setActiveSection(cat.subcategorias[0]?.id || cat.id)}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                {cat.id === "cadastral" && <Users className="h-4 w-4 text-[oklch(0.75_0.12_85)]" />}
                {cat.id === "financeiro" && <CreditCard className="h-4 w-4 text-green-600" />}
                {cat.id === "processual" && <Scale className="h-4 w-4 text-blue-600" />}
                {cat.titulo}
              </CardTitle>
              <CardDescription className="text-xs">{cat.descricao}</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {cat.subcategorias.map((sub) => (
                <div
                  key={sub.id}
                  className={`flex items-center gap-2 py-1.5 px-2 rounded text-xs cursor-pointer transition-colors ${activeSection === sub.id ? "bg-[oklch(0.75_0.12_85)]/10 text-[oklch(0.55_0.12_85)] font-medium" : "text-muted-foreground hover:bg-muted"}`}
                  onClick={(e) => { e.stopPropagation(); setActiveSection(sub.id); }}
                >
                  {activeSection === sub.id ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  {sub.titulo}
                  {sub.descricao.includes("em breve") && <Badge variant="outline" className="text-[10px] px-1 py-0">Em breve</Badge>}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Seção Ativa: Relatório de Dados Cadastrais */}
      {activeSection === "cadastral_pf" && (
        <div className="space-y-4">
          {/* Barra de ações do relatório */}
          <Card className="border-[oklch(0.75_0.12_85)]/30 bg-gradient-to-r from-[oklch(0.98_0.01_85)] to-white">
            <CardContent className="py-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-[oklch(0.75_0.12_85)]/10 flex items-center justify-center">
                    <FileText className="h-5 w-5 text-[oklch(0.65_0.12_85)]" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">Relatório de Dados Cadastrais — Clientes PF</h3>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {data?.ultimoRelatorioGerado
                        ? `Último gerado: ${new Date(data.ultimoRelatorioGerado).toLocaleString('pt-BR')}`
                        : "Nenhum relatório gerado ainda"}
                      {data && (
                        <span className="ml-2">
                          • {data.totalClientesPF} clientes • {data.totalProcessos} processos
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    onClick={() => gerarCadastral.mutate()}
                    disabled={gerarCadastral.isPending}
                    className="bg-[oklch(0.55_0.12_85)] hover:bg-[oklch(0.50_0.12_85)] text-white"
                  >
                    {gerarCadastral.isPending ? (
                      <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                    )}
                    Gerar Relatório
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExportPdf}>
                    <Download className="h-4 w-4 mr-1" />
                    Exportar PDF
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExportJson}>
                    <FileText className="h-4 w-4 mr-1" />
                    Exportar JSON
                  </Button>
                  {reports.find(r => r.tipoRelatorio === "cadastral_pf") && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const r = reports.find(r => r.tipoRelatorio === "cadastral_pf");
                          if (r) openEditDialog(r.id, r.titulo, r.descricao || "");
                        }}
                      >
                        <Pencil className="h-4 w-4 mr-1" />
                        Editar
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4 mr-1" />
                            Excluir
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir relatório?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Isso excluirá o registro do relatório cadastral. Os dados dos clientes no banco permanecem intactos. Você poderá gerar um novo relatório a qualquer momento.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground"
                              onClick={() => {
                                const r = reports.find(r => r.tipoRelatorio === "cadastral_pf");
                                if (r) deleteRelatorio.mutate({ id: r.id });
                              }}
                            >
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Resumo estatístico */}
          {dadosRealtime.isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
            </div>
          ) : data ? (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Card className="border shadow-sm">
                <CardContent className="py-4 text-center">
                  <Users className="h-5 w-5 mx-auto text-[oklch(0.75_0.12_85)] mb-1" />
                  <div className="text-2xl font-bold">{data.totalClientesPF}</div>
                  <div className="text-xs text-muted-foreground">Clientes PF</div>
                </CardContent>
              </Card>
              <Card className="border shadow-sm">
                <CardContent className="py-4 text-center">
                  <Scale className="h-5 w-5 mx-auto text-blue-500 mb-1" />
                  <div className="text-2xl font-bold">{data.totalProcessos}</div>
                  <div className="text-xs text-muted-foreground">Processos</div>
                </CardContent>
              </Card>
              <Card className="border shadow-sm">
                <CardContent className="py-4 text-center">
                  <CreditCard className="h-5 w-5 mx-auto text-green-500 mb-1" />
                  <div className="text-2xl font-bold">{data.totalEmprestimos}</div>
                  <div className="text-xs text-muted-foreground">Empréstimos</div>
                </CardContent>
              </Card>
              <Card className="border shadow-sm">
                <CardContent className="py-4 text-center">
                  <Building2 className="h-5 w-5 mx-auto text-purple-500 mb-1" />
                  <div className="text-2xl font-bold">{data.totalClientesGeral}</div>
                  <div className="text-xs text-muted-foreground">Total Clientes</div>
                </CardContent>
              </Card>
              <Card className="border shadow-sm">
                <CardContent className="py-4 text-center">
                  <Briefcase className="h-5 w-5 mx-auto text-amber-500 mb-1" />
                  <div className="text-2xl font-bold text-sm">{formatCurrency(data.valorTotalCausas)}</div>
                  <div className="text-xs text-muted-foreground">Valor Total</div>
                </CardContent>
              </Card>
            </div>
          ) : null}

          {/* Controles de exibição */}
          {data && data.clientes.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Exibindo <strong>{data.clientes.length}</strong> clientes pessoa física em tempo real
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={expandAll} className="text-xs">
                  <Eye className="h-3 w-3 mr-1" />
                  Expandir Todos
                </Button>
                <Button variant="ghost" size="sm" onClick={collapseAll} className="text-xs">
                  <FolderOpen className="h-3 w-3 mr-1" />
                  Recolher Todos
                </Button>
              </div>
            </div>
          )}

          {/* Tabela de clientes em tempo real */}
          {dadosRealtime.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}
            </div>
          ) : data && data.clientes.length > 0 ? (
            <div className="space-y-2">
              {data.clientes.map((cli, idx) => {
                const isExpanded = expandedClients.has(cli.id);
                return (
                  <Card key={cli.id} className="border shadow-sm overflow-hidden">
                    {/* Cabeçalho do cliente - clicável */}
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => toggleClient(cli.id)}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                        <div className="h-8 w-8 rounded-full bg-[oklch(0.75_0.12_85)]/10 flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-[oklch(0.55_0.12_85)]">{idx + 1}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{cli.nomeCompleto}</p>
                          <p className="text-xs text-muted-foreground">
                            CPF: {formatCpf(cli.cpfCnpj)}
                            {cli.orgaoEmpregador && ` • ${cli.orgaoEmpregador}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-xs">
                          {cli.totalProcessos} processo{cli.totalProcessos !== 1 ? 's' : ''}
                        </Badge>
                        {cli.processosAtivos > 0 && (
                          <Badge className="bg-green-100 text-green-800 text-xs">
                            {cli.processosAtivos} ativo{cli.processosAtivos !== 1 ? 's' : ''}
                          </Badge>
                        )}
                        {cli.totalEmprestimos > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {cli.totalEmprestimos} empréstimo{cli.totalEmprestimos !== 1 ? 's' : ''}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Detalhes expandidos */}
                    {isExpanded && (
                      <div className="border-t bg-muted/20 px-4 py-3 space-y-3">
                        {/* Dados pessoais */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                          <div>
                            <span className="font-medium text-muted-foreground">Profissão:</span>
                            <p>{cli.profissao || "—"}</p>
                          </div>
                          <div>
                            <span className="font-medium text-muted-foreground">Cargo:</span>
                            <p>{cli.cargo || "—"}</p>
                          </div>
                          <div>
                            <span className="font-medium text-muted-foreground">Órgão:</span>
                            <p>{cli.orgaoEmpregador || "—"}</p>
                          </div>
                          <div>
                            <span className="font-medium text-muted-foreground">Vínculo:</span>
                            <p>{cli.vinculoFuncional || "—"}</p>
                          </div>
                          <div>
                            <span className="font-medium text-muted-foreground">Cidade/UF:</span>
                            <p>{cli.cidade || "—"}{cli.estado ? `/${cli.estado}` : ""}</p>
                          </div>
                          <div>
                            <span className="font-medium text-muted-foreground">Endereço:</span>
                            <p className="truncate">{cli.endereco || "—"}</p>
                          </div>
                          <div>
                            <span className="font-medium text-muted-foreground">Telefone:</span>
                            <p>{cli.telefone || "—"}</p>
                          </div>
                          <div>
                            <span className="font-medium text-muted-foreground">E-mail:</span>
                            <p>{cli.email || "—"}</p>
                          </div>
                        </div>

                        {/* Dados financeiros */}
                        {cli.dadosFinanceiros && (
                          <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                            <p className="text-xs font-semibold text-green-800 mb-1 flex items-center gap-1">
                              <CreditCard className="h-3 w-3" />
                              Dados Financeiros
                            </p>
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              <div>
                                <span className="text-green-600">Rem. Bruta:</span>
                                <p className="font-medium">{formatCurrency(cli.dadosFinanceiros.remuneracaoBruta)}</p>
                              </div>
                              <div>
                                <span className="text-green-600">Rem. Líquida:</span>
                                <p className="font-medium">{formatCurrency(cli.dadosFinanceiros.remuneracaoLiquida)}</p>
                              </div>
                              <div>
                                <span className="text-green-600">Fonte:</span>
                                <p className="font-medium">{cli.dadosFinanceiros.fonteRenda || "—"}</p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Processos */}
                        {cli.processos.length > 0 && (
                          <div className="overflow-x-auto">
                            <Table className="text-xs">
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-xs py-2">Nº CNJ</TableHead>
                                  <TableHead className="text-xs py-2">Tribunal/Vara</TableHead>
                                  <TableHead className="text-xs py-2">Tipo de Ação</TableHead>
                                  <TableHead className="text-xs py-2">Fase</TableHead>
                                  <TableHead className="text-xs py-2">Status</TableHead>
                                  <TableHead className="text-xs py-2">Valor</TableHead>
                                  <TableHead className="text-xs py-2">Polo Passivo</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {cli.processos.map((p, pidx) => (
                                  <TableRow key={pidx}>
                                    <TableCell className="py-1.5 font-mono text-xs">{p.numeroCnj || "—"}</TableCell>
                                    <TableCell className="py-1.5">{p.tribunal || "—"}{p.vara ? ` / ${p.vara}` : ""}</TableCell>
                                    <TableCell className="py-1.5">{p.tipoAcao || "—"}</TableCell>
                                    <TableCell className="py-1.5">{p.faseAtual || "—"}</TableCell>
                                    <TableCell className="py-1.5">
                                      <Badge className={`text-[10px] ${p.statusProcesso === "Ativo" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
                                        {p.statusProcesso || "—"}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="py-1.5">{formatCurrency(p.valorCausa)}</TableCell>
                                    <TableCell className="py-1.5 max-w-[200px] truncate">{p.poloPassivo || "—"}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <AlertCircle className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="font-semibold text-lg">Nenhum dado cadastral disponível</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  Faça upload de processos para que os dados cadastrais sejam automaticamente extraídos e exibidos aqui
                </p>
              </CardContent>
            </Card>
          )}

          {/* Histórico de relatórios gerados */}
          {reports.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Relatórios Gerados
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {reports.map((r) => (
                    <div key={r.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="h-4 w-4 text-[oklch(0.75_0.12_85)] shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{r.titulo}</p>
                          <p className="text-xs text-muted-foreground truncate">{r.descricao}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-xs">{r.formato}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {r.updatedAt ? new Date(r.updatedAt).toLocaleString('pt-BR') : "—"}
                        </span>
                        {r.storageUrl && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.open(r.storageUrl!, '_blank')}>
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ==================== RELATÓRIO MARGEM CONSIGNÁVEL ==================== */}
      {activeSection === "financeiro_margem" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Percent className="h-5 w-5 text-[oklch(0.55_0.15_145)]" />
                Relatório de Margem Consignável
              </h2>
              <p className="text-sm text-muted-foreground">Análise financeira detalhada por cliente com margem disponível</p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => gerarMargem.mutate()}
                disabled={gerarMargem.isPending}
                className="bg-[oklch(0.55_0.15_145)] hover:bg-[oklch(0.50_0.15_145)] text-white"
              >
                {gerarMargem.isPending ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Gerando...</> : <><FileBarChart className="h-4 w-4 mr-2" />Gerar Relatório</>}
              </Button>
            </div>
          </div>

          {dadosMargem.isLoading ? (
            <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>
          ) : dadosMargem.data && dadosMargem.data.clientes.length > 0 ? (
            <>
              {/* Resumo */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="border shadow-sm">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">Clientes com Dados</p>
                    <p className="text-2xl font-bold">{dadosMargem.data.clientesComDados}</p>
                  </CardContent>
                </Card>
                <Card className="border shadow-sm">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">Comprometimento Médio</p>
                    <p className={`text-2xl font-bold ${(dadosMargem.data.mediaComprometimento || 0) > 35 ? 'text-red-600' : (dadosMargem.data.mediaComprometimento || 0) > 20 ? 'text-amber-600' : 'text-green-600'}`}>{(dadosMargem.data.mediaComprometimento || 0).toFixed(1)}%</p>
                  </CardContent>
                </Card>
                <Card className="border shadow-sm">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">Total Consignações</p>
                    <p className="text-lg font-bold">{formatCurrency(String(dadosMargem.data.totalConsignacoes || 0))}</p>
                  </CardContent>
                </Card>
                <Card className="border shadow-sm">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">Rem. Bruta Total</p>
                    <p className="text-lg font-bold">{formatCurrency(String(dadosMargem.data.totalRemuneracaoLiquida || 0))}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Tabela de clientes */}
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Cliente</TableHead>
                          <TableHead className="text-xs text-right">Rem. Bruta</TableHead>
                          <TableHead className="text-xs text-right">Rem. Líquida</TableHead>
                          <TableHead className="text-xs text-right">Total Consig.</TableHead>
                          <TableHead className="text-xs text-right">Margem %</TableHead>
                          <TableHead className="text-xs text-right">Margem R$</TableHead>
                          <TableHead className="text-xs text-center">Empréstimos</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dadosMargem.data.clientes.map((cli: any) => {
                          const margPerc = parseFloat(cli.margemPerc || '0');
                          const statusColor = margPerc > 20 ? 'text-green-600' : margPerc > 5 ? 'text-amber-600' : 'text-red-600';
                          const statusIcon = margPerc > 20 ? <TrendingUp className="h-3 w-3" /> : margPerc > 5 ? <ShieldAlert className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />;
                          const statusLabel = margPerc > 20 ? 'Saudável' : margPerc > 5 ? 'Atenção' : 'Comprometida';
                          return (
                            <TableRow key={cli.id}>
                              <TableCell className="py-2">
                                <p className="text-sm font-medium">{cli.nomeCompleto}</p>
                                <p className="text-xs text-muted-foreground">{cli.orgaoEmpregador || cli.profissao || '—'}</p>
                              </TableCell>
                              <TableCell className="py-2 text-right font-mono text-sm">{formatCurrency(cli.remuneracaoBruta)}</TableCell>
                              <TableCell className="py-2 text-right font-mono text-sm">{formatCurrency(cli.remuneracaoLiquida)}</TableCell>
                              <TableCell className="py-2 text-right font-mono text-sm">{formatCurrency(cli.totalConsignacoes)}</TableCell>
                              <TableCell className={`py-2 text-right font-bold text-sm ${statusColor}`}>{margPerc.toFixed(1)}%</TableCell>
                              <TableCell className="py-2 text-right font-mono text-sm">{formatCurrency(cli.margemValor)}</TableCell>
                              <TableCell className="py-2 text-center">
                                <Badge variant="outline" className="text-xs">{cli.totalEmprestimos || 0}</Badge>
                              </TableCell>
                              <TableCell className="py-2">
                                <Badge variant="outline" className={`text-xs ${statusColor}`}>
                                  {statusIcon} <span className="ml-1">{statusLabel}</span>
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Percent className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="font-semibold text-lg">Nenhum dado de margem disponível</h3>
                <p className="text-muted-foreground text-sm mt-1">Importe contracheques para extrair dados financeiros</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ==================== PANORAMA PROCESSUAL ==================== */}
      {activeSection === "processual_geral" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Gavel className="h-5 w-5 text-[oklch(0.55_0.12_250)]" />
                Panorama Processual
              </h2>
              <p className="text-sm text-muted-foreground">Visão consolidada de todos os processos com fases, valores e status</p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => gerarPanorama.mutate()}
                disabled={gerarPanorama.isPending}
                className="bg-[oklch(0.55_0.12_250)] hover:bg-[oklch(0.50_0.12_250)] text-white"
              >
                {gerarPanorama.isPending ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Gerando...</> : <><Gavel className="h-4 w-4 mr-2" />Gerar Relatório</>}
              </Button>
            </div>
          </div>

          {dadosPanorama.isLoading ? (
            <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>
          ) : dadosPanorama.data ? (
            <>
              {/* Resumo */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="border shadow-sm">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">Total Processos</p>
                    <p className="text-2xl font-bold">{dadosPanorama.data.totalProcessos}</p>
                  </CardContent>
                </Card>
                <Card className="border shadow-sm">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">Ativos</p>
                    <p className="text-2xl font-bold text-green-600">{dadosPanorama.data.porStatus?.find((s: any) => s.status === 'Ativo')?.qtd || 0}</p>
                  </CardContent>
                </Card>
                <Card className="border shadow-sm">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">Valor Total</p>
                    <p className="text-lg font-bold">{formatCurrency(String(dadosPanorama.data.valorTotal || 0))}</p>
                  </CardContent>
                </Card>
                <Card className="border shadow-sm">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">Tribunais</p>
                    <p className="text-2xl font-bold">{dadosPanorama.data.porTribunal?.length || 0}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Distribuição por fase e tipo */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {dadosPanorama.data.porFase && dadosPanorama.data.porFase.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold">Distribuição por Fase</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {dadosPanorama.data.porFase.map((f: any, i: number) => (
                        <div key={i} className="flex items-center justify-between p-2 rounded bg-muted/50">
                          <span className="text-sm">{f.fase || 'Indefinida'}</span>
                          <Badge variant="outline" className="text-xs">{f.qtd}</Badge>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
                {dadosPanorama.data.porTipoAcao && dadosPanorama.data.porTipoAcao.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold">Distribuição por Tipo de Ação</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {dadosPanorama.data.porTipoAcao.map((t: any, i: number) => (
                        <div key={i} className="flex items-center justify-between p-2 rounded bg-muted/50">
                          <span className="text-sm truncate max-w-[60%]">{t.tipo || 'Não classificado'}</span>
                          <Badge variant="outline" className="text-xs">{t.qtd}</Badge>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Tabela de processos */}
              {dadosPanorama.data.processos && dadosPanorama.data.processos.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold">Todos os Processos ({dadosPanorama.data.processos.length})</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Cliente</TableHead>
                            <TableHead className="text-xs">Nº CNJ</TableHead>
                            <TableHead className="text-xs">Tipo Ação</TableHead>
                            <TableHead className="text-xs">Tribunal</TableHead>
                            <TableHead className="text-xs">Fase</TableHead>
                            <TableHead className="text-xs">Status</TableHead>
                            <TableHead className="text-xs text-right">Valor Causa</TableHead>
                            <TableHead className="text-xs text-right">Condenação</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {dadosPanorama.data.processos.map((p: any) => (
                            <TableRow key={p.id}>
                              <TableCell className="py-2 text-sm font-medium">{p.clienteNome || '—'}</TableCell>
                              <TableCell className="py-2 font-mono text-xs">{p.numeroCnj || '—'}</TableCell>
                              <TableCell className="py-2 text-xs">{p.tipoAcao || '—'}</TableCell>
                              <TableCell className="py-2 text-xs">{p.tribunal || '—'}</TableCell>
                              <TableCell className="py-2 text-xs">{p.faseAtual || '—'}</TableCell>
                              <TableCell className="py-2">
                                <Badge className={`text-[10px] ${p.statusProcesso === 'Ativo' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                                  {p.statusProcesso || '—'}
                                </Badge>
                              </TableCell>
                              <TableCell className="py-2 text-right font-mono text-xs">{formatCurrency(p.valorCausa)}</TableCell>
                              <TableCell className="py-2 text-right font-mono text-xs">{formatCurrency(p.valorCondenacao)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Gavel className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="font-semibold text-lg">Nenhum processo importado</h3>
                <p className="text-muted-foreground text-sm mt-1">Importe processos para gerar o panorama processual</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Dialog de edição */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Relatório</DialogTitle>
            <DialogDescription>
              Altere o título e a descrição do relatório
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">Título</label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Descrição</label>
              <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (editId) updateRelatorio.mutate({ id: editId, titulo: editTitle, descricao: editDescription });
              }}
              disabled={updateRelatorio.isPending}
              className="bg-[oklch(0.55_0.12_85)] hover:bg-[oklch(0.50_0.12_85)] text-white"
            >
              {updateRelatorio.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
