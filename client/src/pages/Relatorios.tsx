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
  ShieldCheck, ShieldAlert, Percent, Landmark, MapPin, Gavel,
  DollarSign, BookOpen, CalendarClock, FileDown, Printer
} from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

function formatCpf(cpf: string): string {
  if (!cpf || cpf.length !== 11) return cpf;
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

function formatCurrency(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return "—";
  const num = typeof val === 'number' ? val : parseFloat(val);
  if (isNaN(num)) return String(val);
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}

// ============ GERADOR DE PDF GENÉRICO ============
function gerarPdfHtml(titulo: string, subtitulo: string, conteudo: string): void {
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${titulo} - Melo & Preda Advogados</title>
  <style>
    @page { margin: 2cm; size: A4; }
    body { font-family: 'Times New Roman', serif; font-size: 11pt; line-height: 1.5; color: #1a1a1a; }
    .header { text-align: center; border-bottom: 3px double #8B7355; padding-bottom: 15px; margin-bottom: 25px; }
    .header h1 { font-size: 15pt; font-weight: bold; color: #2c1810; margin: 0; letter-spacing: 2px; }
    .header h2 { font-size: 12pt; color: #8B7355; margin: 5px 0 0; font-weight: normal; }
    .header .date { font-size: 9pt; color: #666; margin-top: 8px; }
    .summary { background: #f8f5f0; border: 1px solid #d4c5a9; padding: 12px 15px; margin-bottom: 20px; border-radius: 4px; }
    .summary h3 { margin: 0 0 8px; color: #2c1810; font-size: 12pt; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; }
    .summary-item { text-align: center; padding: 8px; background: white; border-radius: 4px; }
    .summary-item .value { font-size: 16pt; font-weight: bold; color: #8B7355; }
    .summary-item .label { font-size: 8pt; color: #666; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 9pt; }
    th { background: #2c1810; color: white; padding: 6px 8px; text-align: left; font-weight: bold; }
    td { border: 1px solid #d4c5a9; padding: 5px 8px; }
    tr:nth-child(even) { background: #f8f5f0; }
    .section { margin-bottom: 20px; page-break-inside: avoid; }
    .section-title { font-size: 13pt; font-weight: bold; color: #2c1810; border-bottom: 2px solid #8B7355; padding-bottom: 5px; margin-bottom: 10px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 8pt; font-weight: bold; }
    .badge-green { background: #d4edda; color: #155724; }
    .badge-red { background: #f8d7da; color: #721c24; }
    .badge-yellow { background: #fff3cd; color: #856404; }
    .badge-blue { background: #cce5ff; color: #004085; }
    .footer { text-align: center; border-top: 2px solid #8B7355; padding-top: 10px; margin-top: 30px; font-size: 8pt; color: #888; }
    .kpi-row { display: flex; gap: 10px; margin-bottom: 15px; flex-wrap: wrap; }
    .kpi-card { flex: 1; min-width: 100px; text-align: center; padding: 10px; border: 1px solid #d4c5a9; border-radius: 4px; background: #f8f5f0; }
    .kpi-card .kpi-val { font-size: 18pt; font-weight: bold; color: #2c1810; }
    .kpi-card .kpi-label { font-size: 8pt; color: #666; }
  </style>
</head>
<body>
  <div class="header">
    <h1>MELO & PREDA ADVOGADOS</h1>
    <h2>${titulo}</h2>
    <div class="date">${subtitulo} — Gerado em: ${new Date().toLocaleString('pt-BR')}</div>
  </div>
  ${conteudo}
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
    setTimeout(() => printWindow.print(), 500);
  }
}

// ============ TIPOS DE RELATÓRIO ============
interface ReportType {
  id: string;
  titulo: string;
  descricao: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}

const REPORT_TYPES: ReportType[] = [
  {
    id: "cadastral_pf",
    titulo: "Relatório Cadastral",
    descricao: "Dados cadastrais completos de todos os clientes pessoa física",
    icon: <Users className="h-6 w-6" />,
    color: "oklch(0.55 0.12 85)",
    bgColor: "oklch(0.98 0.01 85)",
  },
  {
    id: "financeiro_margem",
    titulo: "Relatório de Margem Consignável",
    descricao: "Análise de margem consignável e empréstimos por cliente",
    icon: <Percent className="h-6 w-6" />,
    color: "oklch(0.55 0.15 145)",
    bgColor: "oklch(0.98 0.01 145)",
  },
  {
    id: "processual_geral",
    titulo: "Relatório Processual",
    descricao: "Panorama completo de todos os processos, fases e valores",
    icon: <Gavel className="h-6 w-6" />,
    color: "oklch(0.55 0.12 250)",
    bgColor: "oklch(0.98 0.01 250)",
  },
  {
    id: "financeiro_honorarios",
    titulo: "Relatório de Honorários",
    descricao: "Honorários sucumbenciais, contratuais e movimentações financeiras",
    icon: <DollarSign className="h-6 w-6" />,
    color: "oklch(0.55 0.15 160)",
    bgColor: "oklch(0.98 0.01 160)",
  },
  {
    id: "base_conhecimento",
    titulo: "Relatório de Conhecimentos",
    descricao: "Base de conhecimento jurídico: teses, jurisprudências, estratégias",
    icon: <BookOpen className="h-6 w-6" />,
    color: "oklch(0.55 0.12 300)",
    bgColor: "oklch(0.98 0.01 300)",
  },
  {
    id: "prazos_processuais",
    titulo: "Relatório de Prazos",
    descricao: "Prazos processuais, vencimentos e alertas de urgência",
    icon: <CalendarClock className="h-6 w-6" />,
    color: "oklch(0.55 0.15 30)",
    bgColor: "oklch(0.98 0.01 30)",
  },
];

export default function Relatorios() {
  const [activeReport, setActiveReport] = useState<string | null>(null);
  const [expandedClients, setExpandedClients] = useState<Set<number>>(new Set());
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editId, setEditId] = useState<number | null>(null);

  // ===== QUERIES =====
  const dadosRealtime = trpc.relatorios.dadosCadastraisRealtime.useQuery(undefined, {
    refetchInterval: 30000,
    enabled: activeReport === 'cadastral_pf',
  });

  const dadosMargem = trpc.relatorios.dadosMargemRealtime.useQuery(undefined, {
    refetchInterval: 30000,
    enabled: activeReport === 'financeiro_margem',
  });

  const dadosPanorama = trpc.relatorios.dadosPanoramaRealtime.useQuery(undefined, {
    refetchInterval: 30000,
    enabled: activeReport === 'processual_geral',
  });

  const dadosHonorarios = trpc.relatorios.dadosHonorariosRealtime.useQuery(undefined, {
    refetchInterval: 30000,
    enabled: activeReport === 'financeiro_honorarios',
  });

  const dadosConhecimentos = trpc.relatorios.dadosConhecimentosRealtime.useQuery(undefined, {
    refetchInterval: 30000,
    enabled: activeReport === 'base_conhecimento',
  });

  const dadosPrazos = trpc.relatorios.dadosPrazosRealtime.useQuery(undefined, {
    refetchInterval: 30000,
    enabled: activeReport === 'prazos_processuais',
  });

  const relatoriosList = trpc.relatorios.list.useQuery(undefined, {
    placeholderData: (prev) => prev,
  });

  // ===== MUTATIONS =====
  const gerarCadastral = trpc.relatorios.gerarCadastral.useMutation({
    onSuccess: (data) => {
      toast.success(`Relatório cadastral gerado! ${data.totalClientes} clientes, ${data.totalProcessos} processos.`);
      dadosRealtime.refetch();
      relatoriosList.refetch();
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const gerarMargem = trpc.relatorios.gerarMargemConsignavel.useMutation({
    onSuccess: (data) => {
      toast.success(`Relatório de margem gerado! ${data.totalClientes} clientes.`);
      dadosMargem.refetch();
      relatoriosList.refetch();
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const gerarPanorama = trpc.relatorios.gerarPanoramaProcessual.useMutation({
    onSuccess: (data) => {
      toast.success(`Panorama processual gerado! ${data.totalProcessos} processos.`);
      dadosPanorama.refetch();
      relatoriosList.refetch();
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const gerarHonorarios = trpc.relatorios.gerarRelatorioHonorarios.useMutation({
    onSuccess: () => {
      toast.success("Relatório de honorários gerado!");
      dadosHonorarios.refetch();
      relatoriosList.refetch();
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const gerarConhecimentos = trpc.relatorios.gerarRelatorioConhecimentos.useMutation({
    onSuccess: () => {
      toast.success("Relatório de conhecimentos gerado!");
      dadosConhecimentos.refetch();
      relatoriosList.refetch();
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const gerarPrazosRel = trpc.relatorios.gerarRelatorioPrazos.useMutation({
    onSuccess: () => {
      toast.success("Relatório de prazos gerado!");
      dadosPrazos.refetch();
      relatoriosList.refetch();
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const deleteRelatorio = trpc.relatorios.delete.useMutation({
    onSuccess: () => { toast.success("Relatório excluído"); relatoriosList.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const updateRelatorio = trpc.relatorios.update.useMutation({
    onSuccess: () => { toast.success("Relatório atualizado"); relatoriosList.refetch(); setEditDialogOpen(false); },
    onError: (e) => toast.error(e.message),
  });

  // ===== HELPERS =====
  const toggleClient = (id: number) => {
    setExpandedClients(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const getMutationForType = (type: string) => {
    switch (type) {
      case 'cadastral_pf': return gerarCadastral;
      case 'financeiro_margem': return gerarMargem;
      case 'processual_geral': return gerarPanorama;
      case 'financeiro_honorarios': return gerarHonorarios;
      case 'base_conhecimento': return gerarConhecimentos;
      case 'prazos_processuais': return gerarPrazosRel;
      default: return null;
    }
  };

  const reports = Array.isArray(relatoriosList.data) ? relatoriosList.data : [];

  // ===== EXPORTAÇÃO PDF INDIVIDUAL =====
  const exportarCadastralPdf = () => {
    const data = dadosRealtime.data;
    if (!data?.clientes) return toast.error("Nenhum dado para exportar");
    const conteudo = `
      <div class="summary">
        <h3>Resumo Geral</h3>
        <div class="summary-grid">
          <div class="summary-item"><div class="value">${data.totalClientesPF}</div><div class="label">Clientes PF</div></div>
          <div class="summary-item"><div class="value">${data.totalProcessos}</div><div class="label">Processos</div></div>
          <div class="summary-item"><div class="value">${data.totalEmprestimos}</div><div class="label">Empréstimos</div></div>
          <div class="summary-item"><div class="value">${formatCurrency(data.valorTotalCausas)}</div><div class="label">Valor Total</div></div>
        </div>
      </div>
      ${data.clientes.map((cli: any, idx: number) => `
        <div class="section">
          <div class="section-title">${idx + 1}. ${cli.nomeCompleto}</div>
          <table>
            <tr><td style="width:25%;font-weight:bold">CPF</td><td>${formatCpf(cli.cpfCnpj)}</td><td style="width:25%;font-weight:bold">RG</td><td>${cli.rg || '—'}</td></tr>
            <tr><td style="font-weight:bold">Profissão</td><td>${cli.profissao || '—'}</td><td style="font-weight:bold">Cargo</td><td>${cli.cargo || '—'}</td></tr>
            <tr><td style="font-weight:bold">Órgão</td><td>${cli.orgaoEmpregador || '—'}</td><td style="font-weight:bold">Vínculo</td><td>${cli.vinculoFuncional || '—'}</td></tr>
            <tr><td style="font-weight:bold">Cidade/UF</td><td>${cli.cidade || '—'}${cli.estado ? '/' + cli.estado : ''}</td><td style="font-weight:bold">Telefone</td><td>${cli.telefone || '—'}</td></tr>
          </table>
          ${cli.processos?.length > 0 ? `
            <table>
              <tr><th>Nº CNJ</th><th>Tribunal/Vara</th><th>Tipo Ação</th><th>Fase</th><th>Status</th><th>Valor</th></tr>
              ${cli.processos.map((p: any) => `<tr><td>${p.numeroCnj || '—'}</td><td>${p.tribunal || '—'}${p.vara ? ' / ' + p.vara : ''}</td><td>${p.tipoAcao || '—'}</td><td>${p.faseAtual || '—'}</td><td><span class="badge ${p.statusProcesso === 'Ativo' ? 'badge-green' : 'badge-red'}">${p.statusProcesso || '—'}</span></td><td>${formatCurrency(p.valorCausa)}</td></tr>`).join('')}
            </table>
          ` : ''}
        </div>
      `).join('')}`;
    gerarPdfHtml("Relatório de Dados Cadastrais", "Clientes Pessoa Física", conteudo);
  };

  const exportarMargemPdf = () => {
    const data = dadosMargem.data;
    if (!data) return toast.error("Nenhum dado para exportar");
    const conteudo = `
      <div class="summary">
        <h3>Resumo da Margem Consignável</h3>
        <div class="summary-grid">
          <div class="summary-item"><div class="value">${data.totalClientes}</div><div class="label">Clientes</div></div>
          <div class="summary-item"><div class="value">${formatCurrency(data.totalMargemDisponivel)}</div><div class="label">Margem Disponível</div></div>
          <div class="summary-item"><div class="value">${formatCurrency(data.totalRemuneracaoLiquida)}</div><div class="label">Rem. Líquida Total</div></div>
          <div class="summary-item"><div class="value">${data.totalConsignacoes}</div><div class="label">Consignações</div></div>
        </div>
      </div>
      <table>
        <tr><th>Cliente</th><th>Rem. Bruta</th><th>Rem. Líquida</th><th>Margem (%)</th><th>Margem (R$)</th><th>Empréstimos</th><th>Status</th></tr>
        ${(data.clientes || []).map((cli: any) => {
          const margemPct = parseFloat(cli.margemPercentual || '0');
          const status = margemPct > 30 ? 'Comprometida' : margemPct > 15 ? 'Moderada' : 'Saudável';
          const badgeClass = margemPct > 30 ? 'badge-red' : margemPct > 15 ? 'badge-yellow' : 'badge-green';
          return `<tr><td>${cli.nomeCompleto}</td><td>${formatCurrency(cli.remuneracaoBruta)}</td><td>${formatCurrency(cli.remuneracaoLiquida)}</td><td>${cli.margemPercentual || '0'}%</td><td>${formatCurrency(cli.margemValor)}</td><td>${cli.totalEmprestimos || 0}</td><td><span class="badge ${badgeClass}">${status}</span></td></tr>`;
        }).join('')}
      </table>`;
    gerarPdfHtml("Relatório de Margem Consignável", "Análise Financeira de Clientes", conteudo);
  };

  const exportarProcessualPdf = () => {
    const data = dadosPanorama.data;
    if (!data) return toast.error("Nenhum dado para exportar");
    const conteudo = `
      <div class="summary">
        <h3>Panorama Processual</h3>
        <div class="summary-grid">
          <div class="summary-item"><div class="value">${data.totalProcessos}</div><div class="label">Total Processos</div></div>
          <div class="summary-item"><div class="value">${data.porStatus?.find((s: any) => s.status === 'Ativo')?.qtd || 0}</div><div class="label">Ativos</div></div>
          <div class="summary-item"><div class="value">${formatCurrency(String(data.valorTotal || 0))}</div><div class="label">Valor Total</div></div>
          <div class="summary-item"><div class="value">${data.porTribunal?.length || 0}</div><div class="label">Tribunais</div></div>
        </div>
      </div>
      ${data.porFase?.length ? `<div class="section"><div class="section-title">Distribuição por Fase</div><table><tr><th>Fase</th><th>Quantidade</th></tr>${data.porFase.map((f: any) => `<tr><td>${f.fase || 'Indefinida'}</td><td>${f.qtd}</td></tr>`).join('')}</table></div>` : ''}
      ${data.porTipoAcao?.length ? `<div class="section"><div class="section-title">Distribuição por Tipo de Ação</div><table><tr><th>Tipo</th><th>Quantidade</th></tr>${data.porTipoAcao.map((t: any) => `<tr><td>${t.tipo || 'Não classificado'}</td><td>${t.qtd}</td></tr>`).join('')}</table></div>` : ''}
      <div class="section">
        <div class="section-title">Todos os Processos</div>
        <table>
          <tr><th>Cliente</th><th>Nº CNJ</th><th>Tipo Ação</th><th>Tribunal</th><th>Fase</th><th>Status</th><th>Valor Causa</th></tr>
          ${(data.processos || []).map((p: any) => `<tr><td>${p.clienteNome || '—'}</td><td>${p.numeroCnj || '—'}</td><td>${p.tipoAcao || '—'}</td><td>${p.tribunal || '—'}</td><td>${p.faseAtual || '—'}</td><td><span class="badge ${p.statusProcesso === 'Ativo' ? 'badge-green' : 'badge-red'}">${p.statusProcesso || '—'}</span></td><td>${formatCurrency(p.valorCausa)}</td></tr>`).join('')}
        </table>
      </div>`;
    gerarPdfHtml("Panorama Processual", "Visão Consolidada de Processos", conteudo);
  };

  const exportarHonorariosPdf = () => {
    const data = dadosHonorarios.data;
    if (!data) return toast.error("Nenhum dado para exportar");
    const conteudo = `
      <div class="summary">
        <h3>Resumo de Honorários</h3>
        <div class="summary-grid">
          <div class="summary-item"><div class="value">${formatCurrency(data.totalGeral)}</div><div class="label">Total Honorários</div></div>
          <div class="summary-item"><div class="value">${formatCurrency(data.totalPago)}</div><div class="label">Pagos/Levantados</div></div>
          <div class="summary-item"><div class="value">${formatCurrency(data.totalDepositado)}</div><div class="label">Depositados</div></div>
          <div class="summary-item"><div class="value">${formatCurrency(data.totalPendente)}</div><div class="label">Pendentes</div></div>
        </div>
      </div>
      <div class="section">
        <div class="section-title">Movimentações Financeiras</div>
        <table>
          <tr><th>Cliente</th><th>Processo</th><th>Tipo</th><th>Valor</th><th>Status</th><th>Data</th></tr>
          ${(data.movimentacoes || []).map((m: any) => `<tr><td>${m.clienteNome || '—'}</td><td>${m.numeroCnj || '—'}</td><td>${m.tipo || '—'}</td><td>${formatCurrency(m.valor)}</td><td><span class="badge ${m.status === 'pago_levantado' ? 'badge-green' : m.status === 'depositado_a_levantar' ? 'badge-yellow' : 'badge-blue'}">${m.status || '—'}</span></td><td>${formatDate(m.data)}</td></tr>`).join('')}
        </table>
      </div>`;
    gerarPdfHtml("Relatório de Honorários", "Honorários Sucumbenciais e Contratuais", conteudo);
  };

  const exportarConhecimentosPdf = () => {
    const data = dadosConhecimentos.data;
    if (!data) return toast.error("Nenhum dado para exportar");
    const conteudo = `
      <div class="summary">
        <h3>Base de Conhecimento Jurídico</h3>
        <div class="summary-grid">
          <div class="summary-item"><div class="value">${data.totalConhecimentos}</div><div class="label">Total</div></div>
          ${(data.porCategoria || []).map((c: any) => `<div class="summary-item"><div class="value">${c.qtd}</div><div class="label">${c.categoria}</div></div>`).join('')}
        </div>
      </div>
      ${(data.porCategoria || []).map((cat: any) => `
        <div class="section">
          <div class="section-title">${cat.categoria} (${cat.qtd})</div>
          <table>
            <tr><th style="width:30%">Título</th><th>Conteúdo</th></tr>
            ${(data.conhecimentos || []).filter((k: any) => k.categoria === cat.categoria).map((k: any) => `<tr><td style="font-weight:bold">${k.titulo}</td><td>${(k.conteudo || '').substring(0, 300)}${(k.conteudo || '').length > 300 ? '...' : ''}</td></tr>`).join('')}
          </table>
        </div>
      `).join('')}`;
    gerarPdfHtml("Relatório de Conhecimentos Jurídicos", "Base de Conhecimento Reutilizável", conteudo);
  };

  const exportarPrazosPdf = () => {
    const data = dadosPrazos.data;
    if (!data) return toast.error("Nenhum dado para exportar");
    const conteudo = `
      <div class="summary">
        <h3>Prazos Processuais</h3>
        <div class="summary-grid">
          <div class="summary-item"><div class="value">${data.totalPrazos}</div><div class="label">Total</div></div>
          <div class="summary-item"><div class="value">${data.vencidos || 0}</div><div class="label">Vencidos</div></div>
          <div class="summary-item"><div class="value">${data.proximos7dias || 0}</div><div class="label">Próximos 7 dias</div></div>
          <div class="summary-item"><div class="value">${data.pendentes || 0}</div><div class="label">Pendentes</div></div>
        </div>
      </div>
      <div class="section">
        <div class="section-title">Todos os Prazos</div>
        <table>
          <tr><th>Processo</th><th>Tipo</th><th>Descrição</th><th>Data</th><th>Status</th></tr>
          ${(data.prazos || []).map((p: any) => {
            const isVencido = new Date(p.dataVencimento) < new Date() && p.statusPrazo !== 'cumprido';
            return `<tr><td>${p.processoNumero || '—'}</td><td>${p.tipo || '—'}</td><td>${p.descricaoPrazo || '—'}</td><td>${formatDate(p.dataVencimento)}</td><td><span class="badge ${p.statusPrazo === 'cumprido' ? 'badge-green' : isVencido ? 'badge-red' : 'badge-yellow'}">${p.statusPrazo === 'cumprido' ? 'Cumprido' : isVencido ? 'Vencido' : 'Pendente'}</span></td></tr>`;
          }).join('')}
        </table>
      </div>`;
    gerarPdfHtml("Relatório de Prazos Processuais", "Controle de Prazos e Vencimentos", conteudo);
  };

  const getExportFunction = (type: string) => {
    switch (type) {
      case 'cadastral_pf': return exportarCadastralPdf;
      case 'financeiro_margem': return exportarMargemPdf;
      case 'processual_geral': return exportarProcessualPdf;
      case 'financeiro_honorarios': return exportarHonorariosPdf;
      case 'base_conhecimento': return exportarConhecimentosPdf;
      case 'prazos_processuais': return exportarPrazosPdf;
      default: return null;
    }
  };

  const exportarJson = (type: string) => {
    let data: any = null;
    let filename = '';
    switch (type) {
      case 'cadastral_pf': data = dadosRealtime.data; filename = 'cadastral'; break;
      case 'financeiro_margem': data = dadosMargem.data; filename = 'margem'; break;
      case 'processual_geral': data = dadosPanorama.data; filename = 'processual'; break;
      case 'financeiro_honorarios': data = dadosHonorarios.data; filename = 'honorarios'; break;
      case 'base_conhecimento': data = dadosConhecimentos.data; filename = 'conhecimentos'; break;
      case 'prazos_processuais': data = dadosPrazos.data; filename = 'prazos'; break;
    }
    if (!data) return toast.error("Nenhum dado para exportar");
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio_${filename}_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("JSON exportado");
  };

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
            Relatórios individualizados com exportação PDF/JSON para cada categoria
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeReport && (
            <Button variant="outline" size="sm" onClick={() => setActiveReport(null)}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Voltar
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => relatoriosList.refetch()}>
            <RefreshCw className={`h-4 w-4 mr-1 ${relatoriosList.isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* ===== GRID DE CARDS DE RELATÓRIOS ===== */}
      {!activeReport && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {REPORT_TYPES.map((rt) => {
            const mutation = getMutationForType(rt.id);
            const isPending = mutation?.isPending || false;
            const existingReport = reports.find(r => r.tipoRelatorio === rt.id);

            return (
              <Card
                key={rt.id}
                className="group relative overflow-hidden border hover:shadow-lg transition-all duration-300 cursor-pointer"
                onClick={() => setActiveReport(rt.id)}
              >
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: `linear-gradient(135deg, ${rt.bgColor}, transparent)` }} />
                <CardHeader className="relative pb-3">
                  <div className="flex items-start justify-between">
                    <div className="h-12 w-12 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: `color-mix(in oklch, ${rt.color}, transparent 85%)` }}>
                      <div style={{ color: rt.color }}>{rt.icon}</div>
                    </div>
                    {existingReport && (
                      <Badge variant="outline" className="text-[10px]">
                        <CheckCircle2 className="h-3 w-3 mr-1 text-green-500" />
                        Gerado
                      </Badge>
                    )}
                  </div>
                  <CardTitle className="text-base font-bold">{rt.titulo}</CardTitle>
                  <CardDescription className="text-xs">{rt.descricao}</CardDescription>
                </CardHeader>
                <CardContent className="relative pt-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      size="sm"
                      className="text-white text-xs"
                      style={{ backgroundColor: rt.color }}
                      onClick={(e) => { e.stopPropagation(); mutation?.mutate(); }}
                      disabled={isPending}
                    >
                      {isPending ? <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                      Gerar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveReport(rt.id);
                        setTimeout(() => getExportFunction(rt.id)?.(), 1500);
                      }}
                    >
                      <FileDown className="h-3 w-3 mr-1" />
                      PDF
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={(e) => { e.stopPropagation(); setActiveReport(rt.id); setTimeout(() => exportarJson(rt.id), 1500); }}
                    >
                      <Download className="h-3 w-3 mr-1" />
                      JSON
                    </Button>
                  </div>
                  {existingReport && (
                    <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Último: {existingReport.updatedAt ? new Date(existingReport.updatedAt).toLocaleString('pt-BR') : '—'}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ===== RELATÓRIO ATIVO - DETALHES ===== */}
      {activeReport && (
        <div className="space-y-4">
          {/* Barra de ações do relatório ativo */}
          {(() => {
            const rt = REPORT_TYPES.find(r => r.id === activeReport);
            if (!rt) return null;
            const mutation = getMutationForType(activeReport);
            const isPending = mutation?.isPending || false;
            const exportFn = getExportFunction(activeReport);

            return (
              <Card className="border" style={{ borderColor: `color-mix(in oklch, ${rt.color}, transparent 70%)` }}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `color-mix(in oklch, ${rt.color}, transparent 85%)` }}>
                        <div style={{ color: rt.color }}>{rt.icon}</div>
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm">{rt.titulo}</h3>
                        <p className="text-xs text-muted-foreground">{rt.descricao}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        size="sm"
                        onClick={() => mutation?.mutate()}
                        disabled={isPending}
                        className="text-white"
                        style={{ backgroundColor: rt.color }}
                      >
                        {isPending ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                        Gerar Relatório
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => exportFn?.()}>
                        <Printer className="h-4 w-4 mr-1" />
                        Exportar PDF
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => exportarJson(activeReport)}>
                        <Download className="h-4 w-4 mr-1" />
                        Exportar JSON
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setActiveReport(null)}>
                        Voltar
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {/* ===== CONTEÚDO ESPECÍFICO DE CADA RELATÓRIO ===== */}

          {/* CADASTRAL */}
          {activeReport === 'cadastral_pf' && (
            <>
              {dadosRealtime.isLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>
              ) : dadosRealtime.data ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <Card className="border shadow-sm"><CardContent className="py-4 text-center"><Users className="h-5 w-5 mx-auto text-[oklch(0.75_0.12_85)] mb-1" /><div className="text-2xl font-bold">{dadosRealtime.data.totalClientesPF}</div><div className="text-xs text-muted-foreground">Clientes PF</div></CardContent></Card>
                    <Card className="border shadow-sm"><CardContent className="py-4 text-center"><Scale className="h-5 w-5 mx-auto text-blue-500 mb-1" /><div className="text-2xl font-bold">{dadosRealtime.data.totalProcessos}</div><div className="text-xs text-muted-foreground">Processos</div></CardContent></Card>
                    <Card className="border shadow-sm"><CardContent className="py-4 text-center"><CreditCard className="h-5 w-5 mx-auto text-green-500 mb-1" /><div className="text-2xl font-bold">{dadosRealtime.data.totalEmprestimos}</div><div className="text-xs text-muted-foreground">Empréstimos</div></CardContent></Card>
                    <Card className="border shadow-sm"><CardContent className="py-4 text-center"><Building2 className="h-5 w-5 mx-auto text-purple-500 mb-1" /><div className="text-2xl font-bold">{dadosRealtime.data.totalClientesGeral}</div><div className="text-xs text-muted-foreground">Total Clientes</div></CardContent></Card>
                    <Card className="border shadow-sm"><CardContent className="py-4 text-center"><Briefcase className="h-5 w-5 mx-auto text-amber-500 mb-1" /><div className="text-2xl font-bold text-sm">{formatCurrency(dadosRealtime.data.valorTotalCausas)}</div><div className="text-xs text-muted-foreground">Valor Total</div></CardContent></Card>
                  </div>
                  <div className="space-y-2">
                    {dadosRealtime.data.clientes.map((cli: any, idx: number) => {
                      const isExpanded = expandedClients.has(cli.id);
                      return (
                        <Card key={cli.id} className="border shadow-sm overflow-hidden">
                          <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => toggleClient(cli.id)}>
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                              <div className="h-8 w-8 rounded-full bg-[oklch(0.75_0.12_85)]/10 flex items-center justify-center shrink-0">
                                <span className="text-xs font-bold text-[oklch(0.55_0.12_85)]">{idx + 1}</span>
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-sm truncate">{cli.nomeCompleto}</p>
                                <p className="text-xs text-muted-foreground">CPF: {formatCpf(cli.cpfCnpj)}{cli.orgaoEmpregador && ` • ${cli.orgaoEmpregador}`}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge variant="outline" className="text-xs">{cli.totalProcessos} proc.</Badge>
                              {cli.processosAtivos > 0 && <Badge className="bg-green-100 text-green-800 text-xs">{cli.processosAtivos} ativo{cli.processosAtivos !== 1 ? 's' : ''}</Badge>}
                            </div>
                          </div>
                          {isExpanded && (
                            <div className="border-t bg-muted/20 px-4 py-3 space-y-3">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                <div><span className="font-medium text-muted-foreground">Profissão:</span><p>{cli.profissao || "—"}</p></div>
                                <div><span className="font-medium text-muted-foreground">Cargo:</span><p>{cli.cargo || "—"}</p></div>
                                <div><span className="font-medium text-muted-foreground">Órgão:</span><p>{cli.orgaoEmpregador || "—"}</p></div>
                                <div><span className="font-medium text-muted-foreground">Telefone:</span><p>{cli.telefone || "—"}</p></div>
                              </div>
                              {cli.processos?.length > 0 && (
                                <Table className="text-xs">
                                  <TableHeader><TableRow><TableHead className="text-xs py-2">Nº CNJ</TableHead><TableHead className="text-xs py-2">Tipo Ação</TableHead><TableHead className="text-xs py-2">Fase</TableHead><TableHead className="text-xs py-2">Status</TableHead><TableHead className="text-xs py-2">Valor</TableHead></TableRow></TableHeader>
                                  <TableBody>{cli.processos.map((p: any, pidx: number) => (
                                    <TableRow key={pidx}><TableCell className="py-1.5 font-mono">{p.numeroCnj || "—"}</TableCell><TableCell className="py-1.5">{p.tipoAcao || "—"}</TableCell><TableCell className="py-1.5">{p.faseAtual || "—"}</TableCell><TableCell className="py-1.5"><Badge className={`text-[10px] ${p.statusProcesso === "Ativo" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>{p.statusProcesso || "—"}</Badge></TableCell><TableCell className="py-1.5">{formatCurrency(p.valorCausa)}</TableCell></TableRow>
                                  ))}</TableBody>
                                </Table>
                              )}
                            </div>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                </>
              ) : (
                <Card className="border-dashed"><CardContent className="flex flex-col items-center justify-center py-12 text-center"><AlertCircle className="h-12 w-12 text-muted-foreground/50 mb-4" /><h3 className="font-semibold text-lg">Nenhum dado cadastral</h3><p className="text-muted-foreground text-sm mt-1">Importe processos para gerar dados</p></CardContent></Card>
              )}
            </>
          )}

          {/* MARGEM CONSIGNÁVEL */}
          {activeReport === 'financeiro_margem' && (
            <>
              {dadosMargem.isLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>
              ) : dadosMargem.data ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Card className="border shadow-sm"><CardContent className="py-4 text-center"><Users className="h-5 w-5 mx-auto text-green-500 mb-1" /><div className="text-2xl font-bold">{dadosMargem.data.totalClientes}</div><div className="text-xs text-muted-foreground">Clientes</div></CardContent></Card>
                    <Card className="border shadow-sm"><CardContent className="py-4 text-center"><TrendingUp className="h-5 w-5 mx-auto text-blue-500 mb-1" /><div className="text-lg font-bold">{formatCurrency(dadosMargem.data.totalMargemDisponivel)}</div><div className="text-xs text-muted-foreground">Margem Disponível</div></CardContent></Card>
                    <Card className="border shadow-sm"><CardContent className="py-4 text-center"><TrendingDown className="h-5 w-5 mx-auto text-amber-500 mb-1" /><div className="text-lg font-bold">{formatCurrency(dadosMargem.data.totalRemuneracaoLiquida)}</div><div className="text-xs text-muted-foreground">Rem. Líquida Total</div></CardContent></Card>
                    <Card className="border shadow-sm"><CardContent className="py-4 text-center"><CreditCard className="h-5 w-5 mx-auto text-red-500 mb-1" /><div className="text-2xl font-bold">{dadosMargem.data.totalConsignacoes}</div><div className="text-xs text-muted-foreground">Consignações</div></CardContent></Card>
                  </div>
                  <Card><CardContent className="p-0"><div className="overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead className="text-xs">Cliente</TableHead><TableHead className="text-xs text-right">Rem. Bruta</TableHead><TableHead className="text-xs text-right">Rem. Líquida</TableHead><TableHead className="text-xs text-right">Margem %</TableHead><TableHead className="text-xs text-right">Margem R$</TableHead><TableHead className="text-xs text-center">Empréstimos</TableHead><TableHead className="text-xs">Status</TableHead></TableRow></TableHeader>
                      <TableBody>{(dadosMargem.data.clientes || []).map((cli: any, i: number) => {
                        const pct = parseFloat(cli.margemPercentual || '0');
                        return (
                          <TableRow key={i}><TableCell className="py-2 text-sm font-medium">{cli.nomeCompleto}</TableCell><TableCell className="py-2 text-right font-mono text-sm">{formatCurrency(cli.remuneracaoBruta)}</TableCell><TableCell className="py-2 text-right font-mono text-sm">{formatCurrency(cli.remuneracaoLiquida)}</TableCell><TableCell className="py-2 text-right font-mono text-sm">{cli.margemPercentual || '0'}%</TableCell><TableCell className="py-2 text-right font-mono text-sm">{formatCurrency(cli.margemValor)}</TableCell><TableCell className="py-2 text-center"><Badge variant="outline" className="text-xs">{cli.totalEmprestimos || 0}</Badge></TableCell><TableCell className="py-2"><Badge variant="outline" className={`text-xs ${pct > 30 ? 'border-red-300 text-red-700' : pct > 15 ? 'border-yellow-300 text-yellow-700' : 'border-green-300 text-green-700'}`}>{pct > 30 ? 'Comprometida' : pct > 15 ? 'Moderada' : 'Saudável'}</Badge></TableCell></TableRow>
                        );
                      })}</TableBody>
                    </Table>
                  </div></CardContent></Card>
                </>
              ) : (
                <Card className="border-dashed"><CardContent className="flex flex-col items-center justify-center py-12 text-center"><Percent className="h-12 w-12 text-muted-foreground/50 mb-4" /><h3 className="font-semibold text-lg">Nenhum dado de margem</h3><p className="text-muted-foreground text-sm mt-1">Importe contracheques</p></CardContent></Card>
              )}
            </>
          )}

          {/* PANORAMA PROCESSUAL */}
          {activeReport === 'processual_geral' && (
            <>
              {dadosPanorama.isLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>
              ) : dadosPanorama.data ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Card className="border shadow-sm"><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Total Processos</p><p className="text-2xl font-bold">{dadosPanorama.data.totalProcessos}</p></CardContent></Card>
                    <Card className="border shadow-sm"><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Ativos</p><p className="text-2xl font-bold text-green-600">{dadosPanorama.data.porStatus?.find((s: any) => s.status === 'Ativo')?.qtd || 0}</p></CardContent></Card>
                    <Card className="border shadow-sm"><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Valor Total</p><p className="text-lg font-bold">{formatCurrency(String(dadosPanorama.data.valorTotal || 0))}</p></CardContent></Card>
                    <Card className="border shadow-sm"><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Tribunais</p><p className="text-2xl font-bold">{dadosPanorama.data.porTribunal?.length || 0}</p></CardContent></Card>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {dadosPanorama.data.porFase?.length > 0 && (
                      <Card><CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Por Fase</CardTitle></CardHeader><CardContent className="space-y-2">{dadosPanorama.data.porFase.map((f: any, i: number) => (<div key={i} className="flex items-center justify-between p-2 rounded bg-muted/50"><span className="text-sm">{f.fase || 'Indefinida'}</span><Badge variant="outline" className="text-xs">{f.qtd}</Badge></div>))}</CardContent></Card>
                    )}
                    {dadosPanorama.data.porTipoAcao?.length > 0 && (
                      <Card><CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Por Tipo de Ação</CardTitle></CardHeader><CardContent className="space-y-2">{dadosPanorama.data.porTipoAcao.map((t: any, i: number) => (<div key={i} className="flex items-center justify-between p-2 rounded bg-muted/50"><span className="text-sm truncate max-w-[60%]">{t.tipo || 'Não classificado'}</span><Badge variant="outline" className="text-xs">{t.qtd}</Badge></div>))}</CardContent></Card>
                    )}
                  </div>
                  {dadosPanorama.data.processos?.length > 0 && (
                    <Card><CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Todos os Processos ({dadosPanorama.data.processos.length})</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto">
                      <Table><TableHeader><TableRow><TableHead className="text-xs">Cliente</TableHead><TableHead className="text-xs">Nº CNJ</TableHead><TableHead className="text-xs">Tipo Ação</TableHead><TableHead className="text-xs">Fase</TableHead><TableHead className="text-xs">Status</TableHead><TableHead className="text-xs text-right">Valor</TableHead></TableRow></TableHeader>
                      <TableBody>{dadosPanorama.data.processos.map((p: any) => (<TableRow key={p.id}><TableCell className="py-2 text-sm font-medium">{p.clienteNome || '—'}</TableCell><TableCell className="py-2 font-mono text-xs">{p.numeroCnj || '—'}</TableCell><TableCell className="py-2 text-xs">{p.tipoAcao || '—'}</TableCell><TableCell className="py-2 text-xs">{p.faseAtual || '—'}</TableCell><TableCell className="py-2"><Badge className={`text-[10px] ${p.statusProcesso === 'Ativo' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{p.statusProcesso || '—'}</Badge></TableCell><TableCell className="py-2 text-right font-mono text-xs">{formatCurrency(p.valorCausa)}</TableCell></TableRow>))}</TableBody></Table>
                    </div></CardContent></Card>
                  )}
                </>
              ) : (
                <Card className="border-dashed"><CardContent className="flex flex-col items-center justify-center py-12 text-center"><Gavel className="h-12 w-12 text-muted-foreground/50 mb-4" /><h3 className="font-semibold text-lg">Nenhum processo</h3><p className="text-muted-foreground text-sm mt-1">Importe processos</p></CardContent></Card>
              )}
            </>
          )}

          {/* HONORÁRIOS */}
          {activeReport === 'financeiro_honorarios' && (
            <>
              {dadosHonorarios.isLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>
              ) : dadosHonorarios.data ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Card className="border shadow-sm"><CardContent className="py-4 text-center"><DollarSign className="h-5 w-5 mx-auto text-green-500 mb-1" /><div className="text-lg font-bold">{formatCurrency(dadosHonorarios.data.totalGeral)}</div><div className="text-xs text-muted-foreground">Total Honorários</div></CardContent></Card>
                    <Card className="border shadow-sm"><CardContent className="py-4 text-center"><CheckCircle2 className="h-5 w-5 mx-auto text-green-600 mb-1" /><div className="text-lg font-bold text-green-600">{formatCurrency(dadosHonorarios.data.totalPago)}</div><div className="text-xs text-muted-foreground">Pagos/Levantados</div></CardContent></Card>
                    <Card className="border shadow-sm"><CardContent className="py-4 text-center"><Clock className="h-5 w-5 mx-auto text-amber-500 mb-1" /><div className="text-lg font-bold text-amber-600">{formatCurrency(dadosHonorarios.data.totalDepositado)}</div><div className="text-xs text-muted-foreground">Depositados</div></CardContent></Card>
                    <Card className="border shadow-sm"><CardContent className="py-4 text-center"><AlertCircle className="h-5 w-5 mx-auto text-red-500 mb-1" /><div className="text-lg font-bold text-red-600">{formatCurrency(dadosHonorarios.data.totalPendente)}</div><div className="text-xs text-muted-foreground">Pendentes</div></CardContent></Card>
                  </div>
                  {dadosHonorarios.data.movimentacoes?.length > 0 && (
                    <Card><CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Movimentações Financeiras ({dadosHonorarios.data.movimentacoes.length})</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto">
                      <Table><TableHeader><TableRow><TableHead className="text-xs">Cliente</TableHead><TableHead className="text-xs">Processo</TableHead><TableHead className="text-xs">Tipo</TableHead><TableHead className="text-xs text-right">Valor</TableHead><TableHead className="text-xs">Status</TableHead><TableHead className="text-xs">Data</TableHead></TableRow></TableHeader>
                      <TableBody>{dadosHonorarios.data.movimentacoes.map((m: any, i: number) => (<TableRow key={i}><TableCell className="py-2 text-sm">{m.clienteNome || '—'}</TableCell><TableCell className="py-2 font-mono text-xs">{m.numeroCnj || '—'}</TableCell><TableCell className="py-2 text-xs">{m.tipo || '—'}</TableCell><TableCell className="py-2 text-right font-mono text-sm font-medium">{formatCurrency(m.valor)}</TableCell><TableCell className="py-2"><Badge className={`text-[10px] ${m.status === 'pago_levantado' ? 'bg-green-100 text-green-800' : m.status === 'depositado_a_levantar' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>{m.status === 'pago_levantado' ? 'Pago' : m.status === 'depositado_a_levantar' ? 'Depositado' : m.status || 'Pendente'}</Badge></TableCell><TableCell className="py-2 text-xs">{formatDate(m.data)}</TableCell></TableRow>))}</TableBody></Table>
                    </div></CardContent></Card>
                  )}
                </>
              ) : (
                <Card className="border-dashed"><CardContent className="flex flex-col items-center justify-center py-12 text-center"><DollarSign className="h-12 w-12 text-muted-foreground/50 mb-4" /><h3 className="font-semibold text-lg">Nenhum dado de honorários</h3><p className="text-muted-foreground text-sm mt-1">Importe processos com dados financeiros</p></CardContent></Card>
              )}
            </>
          )}

          {/* CONHECIMENTOS */}
          {activeReport === 'base_conhecimento' && (
            <>
              {dadosConhecimentos.isLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>
              ) : dadosConhecimentos.data ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    <Card className="border shadow-sm"><CardContent className="py-4 text-center"><BookOpen className="h-5 w-5 mx-auto text-purple-500 mb-1" /><div className="text-2xl font-bold">{dadosConhecimentos.data.totalConhecimentos}</div><div className="text-xs text-muted-foreground">Total</div></CardContent></Card>
                    {(dadosConhecimentos.data.porCategoria || []).map((c: any, i: number) => (
                      <Card key={i} className="border shadow-sm"><CardContent className="py-4 text-center"><div className="text-2xl font-bold">{c.qtd}</div><div className="text-xs text-muted-foreground capitalize">{c.categoria}</div></CardContent></Card>
                    ))}
                  </div>
                  {(dadosConhecimentos.data.porCategoria || []).map((cat: any, ci: number) => (
                    <Card key={ci}><CardHeader className="pb-3"><CardTitle className="text-sm font-semibold capitalize">{cat.categoria} ({cat.qtd})</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto">
                      <Table><TableHeader><TableRow><TableHead className="text-xs" style={{width:'30%'}}>Título</TableHead><TableHead className="text-xs">Conteúdo</TableHead></TableRow></TableHeader>
                      <TableBody>{(dadosConhecimentos.data?.conhecimentos || []).filter((k: any) => k.categoria === cat.categoria).slice(0, 20).map((k: any, ki: number) => (<TableRow key={ki}><TableCell className="py-2 text-sm font-medium align-top">{k.titulo}</TableCell><TableCell className="py-2 text-xs text-muted-foreground">{(k.conteudo || '').substring(0, 200)}{(k.conteudo || '').length > 200 ? '...' : ''}</TableCell></TableRow>))}</TableBody></Table>
                    </div></CardContent></Card>
                  ))}
                </>
              ) : (
                <Card className="border-dashed"><CardContent className="flex flex-col items-center justify-center py-12 text-center"><BookOpen className="h-12 w-12 text-muted-foreground/50 mb-4" /><h3 className="font-semibold text-lg">Nenhum conhecimento</h3><p className="text-muted-foreground text-sm mt-1">Importe processos para gerar conhecimentos</p></CardContent></Card>
              )}
            </>
          )}

          {/* PRAZOS */}
          {activeReport === 'prazos_processuais' && (
            <>
              {dadosPrazos.isLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>
              ) : dadosPrazos.data ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Card className="border shadow-sm"><CardContent className="py-4 text-center"><CalendarClock className="h-5 w-5 mx-auto text-blue-500 mb-1" /><div className="text-2xl font-bold">{dadosPrazos.data.totalPrazos}</div><div className="text-xs text-muted-foreground">Total Prazos</div></CardContent></Card>
                    <Card className="border shadow-sm border-red-200"><CardContent className="py-4 text-center"><AlertCircle className="h-5 w-5 mx-auto text-red-500 mb-1" /><div className="text-2xl font-bold text-red-600">{dadosPrazos.data.vencidos || 0}</div><div className="text-xs text-muted-foreground">Vencidos</div></CardContent></Card>
                    <Card className="border shadow-sm border-amber-200"><CardContent className="py-4 text-center"><Clock className="h-5 w-5 mx-auto text-amber-500 mb-1" /><div className="text-2xl font-bold text-amber-600">{dadosPrazos.data.proximos7dias || 0}</div><div className="text-xs text-muted-foreground">Próximos 7 dias</div></CardContent></Card>
                    <Card className="border shadow-sm border-green-200"><CardContent className="py-4 text-center"><CheckCircle2 className="h-5 w-5 mx-auto text-green-500 mb-1" /><div className="text-2xl font-bold text-green-600">{dadosPrazos.data.pendentes || 0}</div><div className="text-xs text-muted-foreground">Pendentes</div></CardContent></Card>
                  </div>
                  {dadosPrazos.data.prazos?.length > 0 && (
                    <Card><CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Todos os Prazos ({dadosPrazos.data.prazos.length})</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto">
                      <Table><TableHeader><TableRow><TableHead className="text-xs">Processo</TableHead><TableHead className="text-xs">Tipo</TableHead><TableHead className="text-xs">Descrição</TableHead><TableHead className="text-xs">Vencimento</TableHead><TableHead className="text-xs">Status</TableHead></TableRow></TableHeader>
                      <TableBody>{dadosPrazos.data.prazos.map((p: any, i: number) => {
                        const isVencido = new Date(p.dataVencimento) < new Date() && p.status !== 'cumprido';
                        return (<TableRow key={i} className={isVencido ? 'bg-red-50' : ''}><TableCell className="py-2 font-mono text-xs">{p.numeroCnj || '—'}</TableCell><TableCell className="py-2 text-xs">{p.tipo || '—'}</TableCell><TableCell className="py-2 text-xs max-w-[200px] truncate">{p.descricao || '—'}</TableCell><TableCell className="py-2 text-xs font-medium">{formatDate(p.dataVencimento)}</TableCell><TableCell className="py-2"><Badge className={`text-[10px] ${p.status === 'cumprido' ? 'bg-green-100 text-green-800' : isVencido ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{p.status === 'cumprido' ? 'Cumprido' : isVencido ? 'Vencido' : 'Pendente'}</Badge></TableCell></TableRow>);
                      })}</TableBody></Table>
                    </div></CardContent></Card>
                  )}
                </>
              ) : (
                <Card className="border-dashed"><CardContent className="flex flex-col items-center justify-center py-12 text-center"><CalendarClock className="h-12 w-12 text-muted-foreground/50 mb-4" /><h3 className="font-semibold text-lg">Nenhum prazo cadastrado</h3><p className="text-muted-foreground text-sm mt-1">Cadastre prazos processuais</p></CardContent></Card>
              )}
            </>
          )}
        </div>
      )}

      {/* Dialog de edição */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Relatório</DialogTitle>
            <DialogDescription>Altere o título e a descrição do relatório</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div><label className="text-sm font-medium">Título</label><Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} /></div>
            <div><label className="text-sm font-medium">Descrição</label><Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => { if (editId) updateRelatorio.mutate({ id: editId, titulo: editTitle, descricao: editDescription }); }} disabled={updateRelatorio.isPending} className="bg-[oklch(0.55_0.12_85)] hover:bg-[oklch(0.50_0.12_85)] text-white">{updateRelatorio.isPending ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Missing import for ChevronLeft
import { ChevronLeft } from "lucide-react";
