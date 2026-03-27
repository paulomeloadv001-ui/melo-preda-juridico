import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, FileText, DollarSign, Scale, Download, ExternalLink, FolderOpen,
  BookOpen, Lightbulb, RefreshCw, Trash2, Upload, Link2, GitBranch, Banknote,
  Receipt, ArrowUpCircle, Clock, CheckCircle2, AlertCircle, Landmark, Edit,
  Plus, X, Save, Bot, FilePlus, User, MapPin, Phone, Mail, Briefcase, Building2,
  Calendar, Hash, ChevronDown, ChevronRight, FileDown, Gavel, Activity,
  Loader2, Sparkles, Eye, FileCheck, Send
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState, useMemo } from "react";
import { Progress } from "@/components/ui/progress";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

function InfoRow({ label, value, icon }: { label: string; value: string | null | undefined; icon?: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between py-2 text-sm border-b border-border/50 last:border-0">
      <span className="text-muted-foreground flex items-center gap-2">{icon}{label}</span>
      <span className="font-medium text-right max-w-[60%]">{value}</span>
    </div>
  );
}

function formatCurrency(v: string | number | null | undefined) {
  if (!v) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));
}

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function SectionHeader({ title, icon, count, children, defaultOpen = true }: {
  title: string; icon: React.ReactNode; count?: number; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="border shadow-sm">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-accent/30 transition-colors">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                {icon} {title} {count !== undefined && <Badge variant="secondary" className="text-xs ml-1">{count}</Badge>}
              </CardTitle>
              {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export default function ClientePerfil() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const clienteId = parseInt(params.id || "0");
  const { data: profile, isLoading, refetch } = trpc.clientes.getFullProfile.useQuery({ id: clienteId });
  const deleteCliente = trpc.clientes.delete.useMutation({
    onSuccess: () => { toast.success("Cliente excluído"); setLocation("/clientes"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteProcesso = trpc.processosRouter.delete.useMutation({
    onSuccess: () => { toast.success("Processo excluído"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const { data: pastaFiles, refetch: refetchPasta } = trpc.pasta.getFiles.useQuery({ clienteId });
  const { data: peticoesCliente, refetch: refetchPeticoes } = trpc.agente.listarPeticoes.useQuery({ clienteId, limit: 50 });
  const exportarDocx = trpc.agente.exportarDocx.useMutation({
    onSuccess: (data: any) => {
      if (data?.url) window.open(data.url, '_blank');
      toast.success('DOCX gerado com sucesso!');
    },
    onError: (e: any) => toast.error(`Erro: ${e.message}`),
  });
  const generatePasta = trpc.pasta.generate.useMutation({
    onSuccess: () => { toast.success("Pasta do cliente gerada!"); refetchPasta(); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });
  const atualizarStatus = trpc.clientes.atualizarStatusHonorario.useMutation({
    onSuccess: () => { toast.success("Status atualizado"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const atualizarStatusLote = trpc.clientes.atualizarStatusLote.useMutation({
    onSuccess: (d) => { toast.success(`${d.atualizados} movimentações atualizadas`); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const adicionarMovimentacao = trpc.clientes.adicionarMovimentacaoFinanceira.useMutation({
    onSuccess: () => { toast.success("Movimentação adicionada"); refetch(); setShowAddDialog(false); },
    onError: (e) => toast.error(e.message),
  });
  const excluirMovimentacao = trpc.clientes.excluirMovimentacaoFinanceira.useMutation({
    onSuccess: () => { toast.success("Movimentação excluída"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editStatus, setEditStatus] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // ===== PETIÇÃO INLINE: Estado para gerar petição direto na pasta =====
  const [showPeticaoWizard, setShowPeticaoWizard] = useState(false);
  const [peticaoTipo, setPeticaoTipo] = useState('');
  const [peticaoProcessoId, setPeticaoProcessoId] = useState<number | undefined>();
  const [peticaoInstrucoes, setPeticaoInstrucoes] = useState('');
  const [peticaoGerando, setPeticaoGerando] = useState(false);
  const [peticaoGerada, setPeticaoGerada] = useState<any>(null);

  const { data: tiposPeticao } = trpc.agente.tiposPeticao.useQuery();
  const gerarPeticaoInline = trpc.agente.gerarPeticao.useMutation({
    onSuccess: (data) => {
      setPeticaoGerada(data);
      setPeticaoGerando(false);
      refetchPeticoes();
      toast.success(`Petição gerada! ${data.tipoPeticao}`);
    },
    onError: (err) => {
      setPeticaoGerando(false);
      toast.error(`Erro ao gerar: ${err.message}`);
    },
  });
  const regenerarDocxInline = trpc.agente.regenerarDocx.useMutation({
    onSuccess: (data) => {
      refetchPeticoes();
      if (data.docxUrl) window.open(data.docxUrl, '_blank');
      toast.success('DOCX gerado! Download iniciado');
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const handleGerarPeticaoInline = () => {
    if (!peticaoTipo) { toast.error('Selecione o tipo de petição'); return; }
    setPeticaoGerando(true);
    gerarPeticaoInline.mutate({
      tipoPeticao: peticaoTipo,
      clienteId,
      processoId: peticaoProcessoId,
      instrucoes: peticaoInstrucoes || undefined,
    });
  };

  const resetPeticaoWizard = () => {
    setShowPeticaoWizard(false);
    setPeticaoTipo('');
    setPeticaoProcessoId(undefined);
    setPeticaoInstrucoes('');
    setPeticaoGerada(null);
  };
  const [newMov, setNewMov] = useState({
    tipo: 'honorarios_sucumbenciais' as any,
    status: 'pendente' as any,
    valor: 0,
    descricao: '',
    beneficiario: '',
    dataMovimentacao: '',
    fundamentoLegal: '',
    percentualHonorarios: 0,
  });

  if (isLoading) return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
  if (!profile) return (
    <div className="p-6 text-center">
      <p className="text-muted-foreground">Cliente não encontrado.</p>
      <Button variant="outline" className="mt-4" onClick={() => setLocation('/clientes')}>
        <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
      </Button>
    </div>
  );

  const { cliente, dadosFinanceiros, emprestimos, processos: processosComDetalhes, documentos, conhecimentos, movimentacoesFinanceiras, resumoFinanceiro } = profile;

  const totalProcessos = processosComDetalhes?.length || 0;
  const totalPeticoes = (peticoesCliente as any[])?.length || 0;
  const totalConhecimentos = conhecimentos?.length || 0;

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-5xl mx-auto">
      {/* ==================== HEADER ==================== */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation('/clientes')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">{cliente.nomeCompleto}</h1>
            <p className="text-sm text-muted-foreground font-mono">{cliente.cpfCnpj?.startsWith('PEND_') ? 'CPF pendente' : cliente.cpfCnpj}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
          </Button>
          <Button size="sm" variant="outline" onClick={() => setLocation(`/agente?clienteId=${clienteId}`)}>
            <Bot className="h-4 w-4 mr-1" /> Agente IA
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="destructive"><Trash2 className="h-4 w-4 mr-1" /> Excluir</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir cliente e todos os dados?</AlertDialogTitle>
                <AlertDialogDescription>Processos, petições, documentos e conhecimentos serão removidos permanentemente.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => deleteCliente.mutate({ id: clienteId })}>Excluir</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* ==================== RESUMO RÁPIDO ==================== */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border rounded-lg p-3 text-center">
          <Scale className="h-5 w-5 mx-auto mb-1 text-blue-600" />
          <p className="text-2xl font-bold">{totalProcessos}</p>
          <p className="text-xs text-muted-foreground">Processos</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <FileText className="h-5 w-5 mx-auto mb-1 text-amber-600" />
          <p className="text-2xl font-bold">{totalPeticoes}</p>
          <p className="text-xs text-muted-foreground">Petições</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <Banknote className="h-5 w-5 mx-auto mb-1 text-green-600" />
          <p className="text-2xl font-bold">{formatCurrency(resumoFinanceiro?.totalHonorariosSucumbenciais)}</p>
          <p className="text-xs text-muted-foreground">Honorários</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <BookOpen className="h-5 w-5 mx-auto mb-1 text-purple-600" />
          <p className="text-2xl font-bold">{totalConhecimentos}</p>
          <p className="text-xs text-muted-foreground">Conhecimentos</p>
        </div>
      </div>

      {/* ==================== PASTA DO CLIENTE (S3) ==================== */}
      {pastaFiles && pastaFiles.files && Object.keys(pastaFiles.files).length > 0 && (
        <Card className="border shadow-sm bg-[oklch(0.75_0.12_85)]/5">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-[oklch(0.75_0.12_85)]" /> Pasta do Cliente
              </CardTitle>
              <Button size="sm" variant="outline" onClick={() => generatePasta.mutate({ clienteId })} disabled={generatePasta.isPending}>
                {generatePasta.isPending ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                Regenerar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {Object.entries(pastaFiles.files).map(([name, url]) => (
                <a key={name} href={url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 border rounded-lg p-2.5 hover:bg-accent transition-colors text-sm bg-background">
                  <FileText className="h-4 w-4 text-[oklch(0.75_0.12_85)] shrink-0" />
                  <span className="truncate font-medium">{name}</span>
                  <ExternalLink className="h-3 w-3 ml-auto shrink-0 text-muted-foreground" />
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ==================== 1. DADOS PESSOAIS ==================== */}
      <SectionHeader title="Dados Pessoais" icon={<User className="h-4 w-4 text-blue-600" />} defaultOpen={true}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
          <div>
            <InfoRow label="Nome Completo" value={cliente.nomeCompleto} icon={<User className="h-3.5 w-3.5" />} />
            <InfoRow label="CPF/CNPJ" value={cliente.cpfCnpj?.startsWith('PEND_') ? null : cliente.cpfCnpj} icon={<Hash className="h-3.5 w-3.5" />} />
            <InfoRow label="RG" value={cliente.rg} icon={<Hash className="h-3.5 w-3.5" />} />
            <InfoRow label="Data de Nascimento" value={cliente.dataNascimento} icon={<Calendar className="h-3.5 w-3.5" />} />
            <InfoRow label="Nacionalidade" value={cliente.nacionalidade} icon={<MapPin className="h-3.5 w-3.5" />} />
            <InfoRow label="Estado Civil" value={cliente.estadoCivil} icon={<User className="h-3.5 w-3.5" />} />
          </div>
          <div>
            <InfoRow label="Profissão" value={cliente.profissao} icon={<Briefcase className="h-3.5 w-3.5" />} />
            <InfoRow label="Cargo" value={cliente.cargo} icon={<Briefcase className="h-3.5 w-3.5" />} />
            <InfoRow label="Órgão/Empregador" value={cliente.orgaoEmpregador} icon={<Building2 className="h-3.5 w-3.5" />} />
            <InfoRow label="Vínculo Funcional" value={cliente.vinculoFuncional} icon={<Link2 className="h-3.5 w-3.5" />} />
            <InfoRow label="Endereço" value={cliente.endereco} icon={<MapPin className="h-3.5 w-3.5" />} />
            <InfoRow label="Cidade/UF" value={cliente.cidade && cliente.estado ? `${cliente.cidade}/${cliente.estado}` : (cliente.cidade || cliente.estado)} icon={<MapPin className="h-3.5 w-3.5" />} />
            <InfoRow label="CEP" value={cliente.cep} icon={<MapPin className="h-3.5 w-3.5" />} />
            <InfoRow label="Telefone" value={cliente.telefone} icon={<Phone className="h-3.5 w-3.5" />} />
            <InfoRow label="E-mail" value={cliente.email} icon={<Mail className="h-3.5 w-3.5" />} />
          </div>
        </div>
        {/* Dados Financeiros do Contracheque */}
        {dadosFinanceiros && (
          <>
            <Separator className="my-4" />
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-600" /> Dados Financeiros (Contracheque)
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
              <div>
                <InfoRow label="Remuneração Bruta" value={formatCurrency(dadosFinanceiros.remuneracaoBruta)} />
                <InfoRow label="Remuneração Líquida" value={formatCurrency(dadosFinanceiros.remuneracaoLiquida)} />
                <InfoRow label="Margem Consignável (%)" value={dadosFinanceiros.margemConsignavelPerc ? `${dadosFinanceiros.margemConsignavelPerc}%` : null} />
                <InfoRow label="Margem Consignável (R$)" value={formatCurrency(dadosFinanceiros.margemConsignavelValor)} />
              </div>
              <div>
                <InfoRow label="Total Consignações" value={formatCurrency(dadosFinanceiros.totalConsignacoes)} />
                <InfoRow label="Margem Disponível" value={formatCurrency(dadosFinanceiros.margemDisponivel)} />
                <InfoRow label="Fonte de Renda" value={dadosFinanceiros.fonteRenda} />
                <InfoRow label="Score de Risco" value={dadosFinanceiros.scoreRisco} />
                <InfoRow label="Apto para Empréstimo" value={dadosFinanceiros.aptoEmprestimo ? "Sim" : "Não"} />
              </div>
            </div>
          </>
        )}
        {/* Empréstimos Consignados */}
        {emprestimos && emprestimos.length > 0 && (
          <>
            <Separator className="my-4" />
            <h4 className="text-sm font-semibold mb-3">Empréstimos Consignados ({emprestimos.length})</h4>
            <div className="space-y-2">
              {emprestimos.map((emp: any) => (
                <div key={emp.id} className="border rounded-lg p-3 text-sm grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div><span className="text-muted-foreground text-xs">Banco:</span> <span className="font-medium">{emp.banco || "—"}</span></div>
                  <div><span className="text-muted-foreground text-xs">Contrato:</span> <span className="font-medium">{emp.contrato || "—"}</span></div>
                  <div><span className="text-muted-foreground text-xs">Parcela:</span> <span className="font-medium">{formatCurrency(emp.valorParcela)}</span></div>
                  <div><span className="text-muted-foreground text-xs">Status:</span> <Badge variant={emp.status === "Ativo" ? "default" : "secondary"} className="text-xs ml-1">{emp.status}</Badge></div>
                </div>
              ))}
            </div>
          </>
        )}
      </SectionHeader>

      {/* ==================== 2. PROCESSOS ==================== */}
      <SectionHeader title="Processos" icon={<Scale className="h-4 w-4 text-blue-600" />} count={totalProcessos}>
        {(!processosComDetalhes || processosComDetalhes.length === 0) ? (
          <div className="text-center py-6 text-muted-foreground">
            <Scale className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhum processo vinculado</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setLocation('/upload')}>
              <Upload className="h-4 w-4 mr-1" /> Importar Processo
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {processosComDetalhes.map((proc: any) => (
              <ProcessoCard key={proc.id} proc={proc} onDelete={(id: number) => deleteProcesso.mutate({ id })} setLocation={setLocation} clienteId={clienteId} />
            ))}
          </div>
        )}
      </SectionHeader>

      {/* ==================== 3. PAINEL FINANCEIRO ==================== */}
      <SectionHeader title="Painel Financeiro" icon={<Banknote className="h-4 w-4 text-green-600" />} defaultOpen={resumoFinanceiro && resumoFinanceiro.totalHonorariosSucumbenciais > 0}>
        <FinanceiroSection
          resumoFinanceiro={resumoFinanceiro}
          movimentacoesFinanceiras={movimentacoesFinanceiras}
          clienteId={clienteId}
          showAddDialog={showAddDialog}
          setShowAddDialog={setShowAddDialog}
          editingId={editingId}
          setEditingId={setEditingId}
          editStatus={editStatus}
          setEditStatus={setEditStatus}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          newMov={newMov}
          setNewMov={setNewMov}
          atualizarStatus={atualizarStatus}
          atualizarStatusLote={atualizarStatusLote}
          adicionarMovimentacao={adicionarMovimentacao}
          excluirMovimentacao={excluirMovimentacao}
        />
      </SectionHeader>

      {/* ==================== 4. ANÁLISE + ESTRATÉGIA + PETIÇÃO (INTEGRADO) ==================== */}
      <SectionHeader title="Análise Processual & Petições" icon={<Sparkles className="h-4 w-4 text-amber-600" />} count={totalPeticoes}>
        {/* Botão para abrir wizard inline */}
        <div className="flex justify-between items-center mb-4">
          <p className="text-sm text-muted-foreground">Gere petições diretamente nesta pasta com base nos dados do cliente e processos.</p>
          <Button size="sm" className="bg-amber-600 hover:bg-amber-700" onClick={() => setShowPeticaoWizard(!showPeticaoWizard)}>
            {showPeticaoWizard ? <><X className="h-4 w-4 mr-1" /> Fechar</> : <><FilePlus className="h-4 w-4 mr-1" /> Gerar Petição</>}
          </Button>
        </div>

        {/* ===== WIZARD INLINE DE PETIÇÃO ===== */}
        {showPeticaoWizard && (
          <div className="border-2 border-amber-200 rounded-lg p-4 mb-4 bg-amber-50/30 dark:bg-amber-950/10 space-y-4">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-600" /> Gerar Nova Petição para {cliente.nomeCompleto}
            </h4>

            {/* Resultado da petição gerada */}
            {peticaoGerada ? (
              <div className="space-y-3">
                <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="font-semibold text-sm text-green-800 dark:text-green-200 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" /> Petição Gerada com Sucesso!
                    </h5>
                    <Badge variant="default" className="bg-green-600">{peticaoGerada.tipoPeticao}</Badge>
                  </div>
                  <p className="text-sm font-medium">{peticaoGerada.titulo || peticaoGerada.tipoPeticao}</p>
                  <p className="text-xs text-muted-foreground mt-1">Cliente: {peticaoGerada.cliente} | Processo: {peticaoGerada.processo || 'N/A'}</p>
                  <div className="flex gap-2 mt-3">
                    {peticaoGerada.docxUrl && (
                      <Button size="sm" variant="outline" onClick={() => {
                        const proxyUrl = `/api/v1/download-docx/${peticaoGerada.peticaoId}`;
                        const filename = `${peticaoGerada.titulo || 'peticao'}.docx`.replace(/[^a-zA-Z0-9\u00C0-\u00FF\s._-]/g, '_');
                        fetch(proxyUrl).then(r => r.blob()).then(blob => {
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url; a.download = filename;
                          document.body.appendChild(a); a.click();
                          document.body.removeChild(a); URL.revokeObjectURL(url);
                        }).catch(() => window.open(peticaoGerada.docxUrl, '_blank'));
                      }}>
                        <FileDown className="h-4 w-4 mr-1" /> Baixar DOCX
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => regenerarDocxInline.mutate({ id: peticaoGerada.peticaoId })} disabled={regenerarDocxInline.isPending}>
                      <RefreshCw className={`h-4 w-4 mr-1 ${regenerarDocxInline.isPending ? 'animate-spin' : ''}`} /> Regenerar DOCX
                    </Button>
                    <Button size="sm" variant="outline" onClick={resetPeticaoWizard}>
                      <Plus className="h-4 w-4 mr-1" /> Nova Petição
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Tipo de Petição */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Tipo de Petição</Label>
                  <Select value={peticaoTipo} onValueChange={setPeticaoTipo}>
                    <SelectTrigger><SelectValue placeholder="Selecione o tipo de petição..." /></SelectTrigger>
                    <SelectContent className="max-h-80">
                      {tiposPeticao?.map((t: any) => (
                        <SelectItem key={t.id} value={t.nome}>
                          <span className="text-xs text-muted-foreground mr-1">[{t.categoria}]</span> {t.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Processo vinculado */}
                {processosComDetalhes && processosComDetalhes.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Processo Vinculado</Label>
                    <Select value={peticaoProcessoId?.toString() || ''} onValueChange={(v) => setPeticaoProcessoId(v ? Number(v) : undefined)}>
                      <SelectTrigger><SelectValue placeholder="Selecione o processo (opcional)..." /></SelectTrigger>
                      <SelectContent>
                        {processosComDetalhes.map((p: any) => (
                          <SelectItem key={p.id} value={p.id.toString()}>
                            {p.numeroCnj} — {p.tipoAcao || 'Processo'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Instruções adicionais */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Instruções Adicionais (opcional)</Label>
                  <Textarea
                    placeholder="Ex: Incluir jurisprudência do STJ sobre abusividade de consignações, enfatizar superendividamento..."
                    value={peticaoInstrucoes}
                    onChange={(e) => setPeticaoInstrucoes(e.target.value)}
                    rows={3}
                  />
                </div>

                {/* Botão de gerar */}
                <div className="flex gap-2">
                  <Button
                    onClick={handleGerarPeticaoInline}
                    disabled={peticaoGerando || !peticaoTipo}
                    className="bg-amber-600 hover:bg-amber-700"
                  >
                    {peticaoGerando ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Gerando Petição com IA...</>
                    ) : (
                      <><Sparkles className="h-4 w-4 mr-2" /> Gerar Petição</>
                    )}
                  </Button>
                  <Button variant="outline" onClick={resetPeticaoWizard}>
                    Cancelar
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ===== LISTA DE PETIÇÕES GERADAS ===== */}
        {!peticoesCliente || (peticoesCliente as any[]).length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhuma petição gerada. Use o botão acima para gerar.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {(peticoesCliente as any[]).map((pet: any) => (
              <div key={pet.id} className="flex items-center justify-between border rounded-lg p-3 hover:bg-accent/50 transition-colors">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <FileText className="h-4 w-4 text-amber-600 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{pet.titulo}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className="text-[10px]">{pet.tipo}</Badge>
                      <Badge variant={pet.status === 'finalizada' ? 'default' : 'secondary'} className="text-[10px]">{pet.status}</Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(pet.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <Button variant="ghost" size="sm" title="Baixar DOCX"
                    onClick={() => {
                      const proxyUrl = `/api/v1/download-docx/${pet.id}`;
                      const filename = `${pet.titulo || 'peticao'}.docx`.replace(/[^a-zA-Z0-9\u00C0-\u00FF\s._-]/g, '_');
                      fetch(proxyUrl).then(r => r.blob()).then(blob => {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url; a.download = filename;
                        document.body.appendChild(a); a.click();
                        document.body.removeChild(a); URL.revokeObjectURL(url);
                      }).catch(() => toast.error('Erro no download'));
                    }}>
                    <FileDown className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" title="Regenerar DOCX" disabled={exportarDocx.isPending}
                    onClick={() => exportarDocx.mutate({ peticaoId: pet.id })}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionHeader>

      {/* ==================== 5. DOCUMENTOS ==================== */}
      <DocumentosSection clienteId={clienteId} documentos={documentos || []} refetch={refetch} />

      {/* ==================== 6. BANCO DE CONHECIMENTO ==================== */}
      <SectionHeader title="Banco de Conhecimento" icon={<BookOpen className="h-4 w-4 text-purple-600" />} count={totalConhecimentos} defaultOpen={totalConhecimentos > 0}>
        {(!conhecimentos || conhecimentos.length === 0) ? (
          <div className="text-center py-6 text-muted-foreground">
            <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhum conhecimento registrado. Importe processos para gerar automaticamente.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {conhecimentos.map((kn: any) => (
              <div key={kn.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{kn.titulo}</span>
                  <Badge variant="outline" className="text-xs">
                    {kn.categoria === "Tese" && <Lightbulb className="h-3 w-3 mr-1" />}
                    {kn.categoria === "Jurisprudencia" && <Scale className="h-3 w-3 mr-1" />}
                    {kn.categoria === "Legislacao" && <FileText className="h-3 w-3 mr-1" />}
                    {kn.categoria}
                  </Badge>
                </div>
                {kn.conteudo && <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">{kn.conteudo}</p>}
                {kn.tipoAcao && <p className="text-xs text-muted-foreground">Tipo: {kn.tipoAcao} | Tribunal: {kn.tribunal || "—"}</p>}
              </div>
            ))}
          </div>
        )}
      </SectionHeader>
    </div>
  );
}

// ==================== COMPONENTE: CARD DE PROCESSO ====================
function ProcessoCard({ proc, onDelete, setLocation, clienteId }: { proc: any; onDelete: (id: number) => void; setLocation: (path: string) => void; clienteId: number }) {
  const [expanded, setExpanded] = useState(false);
  const statusColors: Record<string, string> = {
    'Ativo': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    'Encerrado': 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
    'Suspenso': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    'Arquivado': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header do Processo */}
      <div className="p-4 cursor-pointer hover:bg-accent/30 transition-colors" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Gavel className="h-4 w-4 text-blue-600 flex-shrink-0" />
              <span className="font-mono text-sm font-bold">{proc.numeroCnj}</span>
              <Badge className={`text-xs ${statusColors[proc.statusProcesso] || statusColors['Ativo']}`}>{proc.statusProcesso || 'Ativo'}</Badge>
              {proc.processoOrigemId && <Badge variant="outline" className="text-xs"><GitBranch className="h-3 w-3 mr-1" />Dependente</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">{proc.tipoAcao || 'Tipo não identificado'}</p>
            <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
              {proc.tribunal && <span>{proc.tribunal}</span>}
              {proc.vara && <span>| {proc.vara}</span>}
              {proc.valorCausa && <span>| {formatCurrency(proc.valorCausa)}</span>}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </div>
        </div>
      </div>

      {/* Detalhes expandidos */}
      {expanded && (
        <div className="border-t p-4 space-y-4 bg-accent/10">
          {/* Dados do processo */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 text-sm">
            <InfoRow label="Fase Atual" value={proc.faseAtual} />
            <InfoRow label="Comarca" value={proc.comarca} />
            <InfoRow label="Classe" value={proc.classeProcessual} />
            <InfoRow label="Assunto" value={proc.assunto} />
            <InfoRow label="Distribuição" value={proc.dataDistribuicao} />
            <InfoRow label="Competência" value={proc.competencia} />
            {proc.valorCondenacao && <InfoRow label="Valor Condenação" value={formatCurrency(proc.valorCondenacao)} />}
            {proc.observacoes && <InfoRow label="Observações" value={proc.observacoes} />}
          </div>

          {/* Partes */}
          {proc.partes && proc.partes.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Partes</h5>
              <div className="space-y-1">
                {proc.partes.map((p: any) => (
                  <div key={p.id} className="flex items-center gap-2 text-sm">
                    <Badge variant="outline" className="text-[10px] w-24 justify-center">{p.tipo}</Badge>
                    <span className="font-medium">{p.nome}</span>
                    {p.cpfCnpj && <span className="text-xs text-muted-foreground">({p.cpfCnpj})</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Movimentações (Linha do Tempo) */}
          {proc.movimentacoes && proc.movimentacoes.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Movimentações ({proc.movimentacoes.length})</h5>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {proc.movimentacoes.slice(0, 10).map((mov: any, idx: number) => (
                  <div key={mov.id || idx} className="flex gap-3 text-sm">
                    <div className="flex flex-col items-center">
                      <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5" />
                      {idx < Math.min(proc.movimentacoes.length, 10) - 1 && <div className="w-0.5 flex-1 bg-border" />}
                    </div>
                    <div className="pb-2 flex-1">
                      <p className="font-medium text-xs">{mov.tipo || mov.descricao?.substring(0, 80)}</p>
                      {mov.descricao && mov.descricao !== mov.tipo && <p className="text-xs text-muted-foreground line-clamp-2">{mov.descricao}</p>}
                      <p className="text-[10px] text-muted-foreground mt-0.5">{mov.dataMovimentacao || formatDate(mov.createdAt)}</p>
                    </div>
                  </div>
                ))}
                {proc.movimentacoes.length > 10 && (
                  <p className="text-xs text-muted-foreground text-center">+ {proc.movimentacoes.length - 10} movimentações anteriores</p>
                )}
              </div>
            </div>
          )}

          {/* Estratégias */}
          {proc.estrategias && proc.estrategias.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Estratégias Processuais</h5>
              <div className="space-y-2">
                {proc.estrategias.map((e: any) => (
                  <div key={e.id} className="border rounded-lg p-2 text-sm">
                    <p className="font-medium">{e.titulo}</p>
                    {e.descricao && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{e.descricao}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ações do processo */}
          <div className="flex gap-2 pt-2 border-t">
            <Button size="sm" variant="outline" onClick={() => setLocation(`/peticionamento?clienteId=${clienteId}&processoId=${proc.id}`)}>
              <FilePlus className="h-4 w-4 mr-1" /> Gerar Petição
            </Button>
            <Button size="sm" variant="outline" onClick={() => setLocation(`/agente?clienteId=${clienteId}&processoId=${proc.id}`)}>
              <Bot className="h-4 w-4 mr-1" /> Analisar com IA
            </Button>
            {proc.pdfUrl && (
              <a href={proc.pdfUrl} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="outline"><Download className="h-4 w-4 mr-1" /> PDF Original</Button>
              </a>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="destructive"><Trash2 className="h-4 w-4 mr-1" /> Excluir</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir processo?</AlertDialogTitle>
                  <AlertDialogDescription>Movimentações, estratégias e partes serão removidos.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => onDelete(proc.id)}>Excluir</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== COMPONENTE: FINANCEIRO ====================
function FinanceiroSection({ resumoFinanceiro, movimentacoesFinanceiras, clienteId, showAddDialog, setShowAddDialog, editingId, setEditingId, editStatus, setEditStatus, selectedIds, setSelectedIds, newMov, setNewMov, atualizarStatus, atualizarStatusLote, adicionarMovimentacao, excluirMovimentacao }: any) {
  if (!resumoFinanceiro) return <p className="text-sm text-muted-foreground text-center py-4">Nenhum dado financeiro disponível.</p>;

  const tipoLabels: Record<string, string> = {
    deposito_judicial: 'Depósito Judicial', alvara_levantamento: 'Alvará Levantamento',
    honorarios_sucumbenciais: 'Hon. Sucumbenciais', honorarios_contratuais: 'Hon. Contratuais',
    pagamento: 'Pagamento', restituicao: 'Restituição', multa: 'Multa', custas: 'Custas',
  };
  const statusLabels: Record<string, { label: string; color: string }> = {
    pago_levantado: { label: 'Pago/Levantado', color: 'text-green-600 bg-green-50 dark:bg-green-950' },
    depositado_a_levantar: { label: 'Dep./A Levantar', color: 'text-amber-600 bg-amber-50 dark:bg-amber-950' },
    pendente: { label: 'Pendente', color: 'text-red-600 bg-red-50 dark:bg-red-950' },
    parcial: { label: 'Parcial', color: 'text-blue-600 bg-blue-50 dark:bg-blue-950' },
    cancelado: { label: 'Cancelado', color: 'text-gray-500 bg-gray-50 dark:bg-gray-900' },
  };

  return (
    <div className="space-y-4">
      {/* Cards resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border rounded-lg p-3 bg-green-500/5">
          <p className="text-xs text-muted-foreground uppercase font-semibold">Honorários Total</p>
          <p className="text-lg font-bold">{formatCurrency(resumoFinanceiro.totalHonorariosSucumbenciais)}</p>
        </div>
        <div className="border rounded-lg p-3 bg-green-500/5">
          <p className="text-xs text-muted-foreground uppercase font-semibold">Pagos/Levantados</p>
          <p className="text-lg font-bold text-green-600">{formatCurrency(resumoFinanceiro.honorariosPagosLevantados)}</p>
        </div>
        <div className="border rounded-lg p-3 bg-amber-500/5">
          <p className="text-xs text-muted-foreground uppercase font-semibold">A Levantar</p>
          <p className="text-lg font-bold text-amber-600">{formatCurrency(resumoFinanceiro.honorariosDepositadosALevantar)}</p>
        </div>
        <div className="border rounded-lg p-3 bg-red-500/5">
          <p className="text-xs text-muted-foreground uppercase font-semibold">Pendentes</p>
          <p className="text-lg font-bold text-red-600">{formatCurrency(resumoFinanceiro.honorariosPendentes)}</p>
        </div>
      </div>

      {/* Depósitos e Alvarás */}
      {(resumoFinanceiro.totalDepositos > 0 || resumoFinanceiro.totalAlvaras > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {resumoFinanceiro.totalDepositos > 0 && (
            <div className="border rounded-lg p-3">
              <p className="text-xs font-semibold mb-2 flex items-center gap-1"><Landmark className="h-3.5 w-3.5 text-blue-600" /> Depósitos Judiciais</p>
              <div className="text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="font-medium">{formatCurrency(resumoFinanceiro.totalDepositos)}</span></div>
                <div className="flex justify-between"><span className="text-green-600">Levantados</span><span className="font-medium text-green-600">{formatCurrency(resumoFinanceiro.depositosLevantados)}</span></div>
                <div className="flex justify-between"><span className="text-amber-600">A Levantar</span><span className="font-medium text-amber-600">{formatCurrency(resumoFinanceiro.depositosALevantar)}</span></div>
              </div>
              <Progress value={resumoFinanceiro.totalDepositos > 0 ? (resumoFinanceiro.depositosLevantados / resumoFinanceiro.totalDepositos) * 100 : 0} className="h-1.5 mt-2" />
            </div>
          )}
          {resumoFinanceiro.totalAlvaras > 0 && (
            <div className="border rounded-lg p-3">
              <p className="text-xs font-semibold mb-2 flex items-center gap-1"><Receipt className="h-3.5 w-3.5 text-purple-600" /> Alvarás</p>
              <div className="text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="font-medium">{formatCurrency(resumoFinanceiro.totalAlvaras)}</span></div>
                <div className="flex justify-between"><span className="text-green-600">Levantados</span><span className="font-medium text-green-600">{formatCurrency(resumoFinanceiro.alvarasLevantados)}</span></div>
                <div className="flex justify-between"><span className="text-amber-600">Pendentes</span><span className="font-medium text-amber-600">{formatCurrency(resumoFinanceiro.alvarasPendentes)}</span></div>
              </div>
              <Progress value={resumoFinanceiro.totalAlvaras > 0 ? (resumoFinanceiro.alvarasLevantados / resumoFinanceiro.totalAlvaras) * 100 : 0} className="h-1.5 mt-2" />
            </div>
          )}
        </div>
      )}

      {/* Tabela de movimentações */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold">Movimentações ({movimentacoesFinanceiras?.length || 0})</h4>
          <div className="flex gap-2">
            {selectedIds.length > 0 && (
              <Select onValueChange={(val) => { atualizarStatusLote.mutate({ movimentacaoIds: selectedIds, novoStatus: val as any }); setSelectedIds([]); }}>
                <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue placeholder={`Alterar ${selectedIds.length} selecionados`} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pago_levantado">Pago/Levantado</SelectItem>
                  <SelectItem value="depositado_a_levantar">Dep./A Levantar</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="parcial">Parcial</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="h-8"><Plus className="h-3.5 w-3.5 mr-1" /> Adicionar</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Adicionar Movimentação Financeira</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Tipo</Label>
                      <Select value={newMov.tipo} onValueChange={(v) => setNewMov((p: any) => ({ ...p, tipo: v }))}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="honorarios_sucumbenciais">Hon. Sucumbenciais</SelectItem>
                          <SelectItem value="honorarios_contratuais">Hon. Contratuais</SelectItem>
                          <SelectItem value="deposito_judicial">Depósito Judicial</SelectItem>
                          <SelectItem value="alvara_levantamento">Alvará Levantamento</SelectItem>
                          <SelectItem value="pagamento">Pagamento</SelectItem>
                          <SelectItem value="restituicao">Restituição</SelectItem>
                          <SelectItem value="multa">Multa</SelectItem>
                          <SelectItem value="custas">Custas</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Status</Label>
                      <Select value={newMov.status} onValueChange={(v) => setNewMov((p: any) => ({ ...p, status: v }))}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pago_levantado">Pago/Levantado</SelectItem>
                          <SelectItem value="depositado_a_levantar">Dep./A Levantar</SelectItem>
                          <SelectItem value="pendente">Pendente</SelectItem>
                          <SelectItem value="parcial">Parcial</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Valor (R$)</Label>
                      <Input type="number" step="0.01" className="mt-1" value={newMov.valor || ''} onChange={(e) => setNewMov((p: any) => ({ ...p, valor: parseFloat(e.target.value) || 0 }))} />
                    </div>
                    <div>
                      <Label className="text-xs">Data</Label>
                      <Input type="date" className="mt-1" value={newMov.dataMovimentacao} onChange={(e) => setNewMov((p: any) => ({ ...p, dataMovimentacao: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Descrição</Label>
                    <Textarea className="mt-1" rows={2} value={newMov.descricao} onChange={(e) => setNewMov((p: any) => ({ ...p, descricao: e.target.value }))} />
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
                  <Button onClick={() => adicionarMovimentacao.mutate({ ...newMov, clienteId })} disabled={adicionarMovimentacao.isPending || !newMov.valor || !newMov.descricao}>
                    {adicionarMovimentacao.isPending ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                    Salvar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {movimentacoesFinanceiras && movimentacoesFinanceiras.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 pr-2 w-8">
                    <input type="checkbox" className="rounded" checked={selectedIds.length === movimentacoesFinanceiras.length && movimentacoesFinanceiras.length > 0}
                      onChange={(e: any) => setSelectedIds(e.target.checked ? movimentacoesFinanceiras.map((m: any) => m.id) : [])} />
                  </th>
                  <th className="pb-2 pr-3 text-xs text-muted-foreground font-medium">Tipo</th>
                  <th className="pb-2 pr-3 text-xs text-muted-foreground font-medium">Status</th>
                  <th className="pb-2 pr-3 text-xs text-muted-foreground font-medium text-right">Valor</th>
                  <th className="pb-2 pr-3 text-xs text-muted-foreground font-medium">Data</th>
                  <th className="pb-2 pr-3 text-xs text-muted-foreground font-medium">Descrição</th>
                  <th className="pb-2 text-xs text-muted-foreground font-medium text-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {movimentacoesFinanceiras.map((mf: any) => {
                  const st = statusLabels[mf.status] || statusLabels.pendente;
                  const isEditing = editingId === mf.id;
                  return (
                    <tr key={mf.id} className={`border-b last:border-0 hover:bg-accent/50 ${selectedIds.includes(mf.id) ? 'bg-primary/5' : ''}`}>
                      <td className="py-2 pr-2">
                        <input type="checkbox" className="rounded" checked={selectedIds.includes(mf.id)}
                          onChange={(e: any) => setSelectedIds((prev: number[]) => e.target.checked ? [...prev, mf.id] : prev.filter((id: number) => id !== mf.id))} />
                      </td>
                      <td className="py-2 pr-3 text-xs font-medium">{tipoLabels[mf.tipo] || mf.tipo}</td>
                      <td className="py-2 pr-3">
                        {isEditing ? (
                          <Select value={editStatus} onValueChange={setEditStatus}>
                            <SelectTrigger className="h-7 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pago_levantado">Pago/Levantado</SelectItem>
                              <SelectItem value="depositado_a_levantar">Dep./A Levantar</SelectItem>
                              <SelectItem value="pendente">Pendente</SelectItem>
                              <SelectItem value="parcial">Parcial</SelectItem>
                              <SelectItem value="cancelado">Cancelado</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="outline" className={`text-xs cursor-pointer ${st.color}`}
                            onClick={() => { setEditingId(mf.id); setEditStatus(mf.status); }}>
                            {st.label}
                          </Badge>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono font-medium text-xs">{formatCurrency(mf.valor)}</td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">{mf.dataMovimentacao || '—'}</td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground max-w-[140px] truncate">{mf.descricao || '—'}</td>
                      <td className="py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {isEditing ? (
                            <>
                              <Button size="icon" variant="ghost" className="h-6 w-6" disabled={atualizarStatus.isPending}
                                onClick={() => { atualizarStatus.mutate({ movimentacaoId: mf.id, novoStatus: editStatus as any }); setEditingId(null); }}>
                                <Save className="h-3.5 w-3.5 text-green-600" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingId(null)}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setEditingId(mf.id); setEditStatus(mf.status); }}>
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Excluir movimentação?</AlertDialogTitle>
                                    <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction className="bg-destructive text-destructive-foreground"
                                      onClick={() => excluirMovimentacao.mutate({ id: mf.id })}>Excluir</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-4 text-muted-foreground">
            <p className="text-sm">Nenhuma movimentação financeira registrada</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== COMPONENTE: DOCUMENTOS ====================
function DocumentosSection({ clienteId, documentos, refetch }: { clienteId: number; documentos: any[]; refetch: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [analiseResult, setAnaliseResult] = useState<any>(null);

  const analisar = trpc.agente.analisarDocumentoCliente.useMutation({
    onSuccess: (data) => {
      toast.success('Documento analisado!');
      setAnaliseResult(data.analise);
      setUploading(false);
      refetch();
    },
    onError: (e) => {
      toast.error(`Erro: ${e.message}`);
      setUploading(false);
    },
  });

  const handleUploadAndAnalyze = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        analisar.mutate({ clienteId, nomeArquivo: file.name, documentoBase64: base64, tipoArquivo: file.type || 'application/pdf' });
      };
      reader.readAsDataURL(file);
    } catch {
      toast.error('Erro ao ler arquivo');
      setUploading(false);
    }
    e.target.value = '';
  };

  return (
    <SectionHeader title="Documentos" icon={<FolderOpen className="h-4 w-4 text-orange-600" />} count={documentos.length} defaultOpen={documentos.length > 0}>
      <div className="flex justify-end mb-3">
        <label>
          <input type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.png" onChange={handleUploadAndAnalyze} />
          <Button variant="outline" size="sm" asChild className="cursor-pointer">
            <span>
              {uploading || analisar.isPending ? (
                <><RefreshCw className="h-4 w-4 mr-1 animate-spin" /> Analisando...</>
              ) : (
                <><Upload className="h-4 w-4 mr-1" /> Upload + Análise IA</>
              )}
            </span>
          </Button>
        </label>
      </div>

      {analiseResult && (
        <div className="border rounded-lg p-4 bg-blue-50/50 dark:bg-blue-950/20 space-y-2 mb-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm flex items-center gap-2"><Bot className="h-4 w-4 text-blue-600" /> Resultado da Análise IA</h4>
            <Button variant="ghost" size="sm" onClick={() => setAnaliseResult(null)}><X className="h-4 w-4" /></Button>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-muted-foreground">Tipo:</span> <Badge variant="secondary">{analiseResult.tipo_documento}</Badge></div>
            {analiseResult.processo_relacionado && <div><span className="text-muted-foreground">Processo:</span> {analiseResult.processo_relacionado}</div>}
          </div>
          <p className="text-sm">{analiseResult.resumo}</p>
          {analiseResult.recomendacoes && <p className="text-xs text-muted-foreground"><span className="font-medium">Recomendações:</span> {analiseResult.recomendacoes}</p>}
        </div>
      )}

      {documentos.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">Nenhum documento. Use o botão acima para enviar e analisar automaticamente.</p>
      ) : (
        <div className="space-y-2">
          {documentos.map((doc: any) => (
            <div key={doc.id} className="flex items-center justify-between border rounded-lg p-3">
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{doc.nomeArquivo}</p>
                  <p className="text-xs text-muted-foreground">{doc.tipo} {doc.tamanho ? `— ${(doc.tamanho / 1024 / 1024).toFixed(1)} MB` : ''}</p>
                </div>
              </div>
              {doc.storageUrl && (
                <a href={doc.storageUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="ghost" size="sm"><Download className="h-4 w-4" /></Button>
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionHeader>
  );
}
