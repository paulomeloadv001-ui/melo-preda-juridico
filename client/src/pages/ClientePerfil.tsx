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
import { ArrowLeft, FileText, DollarSign, Scale, Download, ExternalLink, FolderOpen, BookOpen, Lightbulb, RefreshCw, Database, Trash2, Upload, Link2, GitBranch, Banknote, Receipt, ArrowUpCircle, ArrowDownCircle, Clock, CheckCircle2, AlertCircle, TrendingUp, Landmark, Edit, Plus, X, Save, MoreHorizontal, Bot, FilePlus } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right max-w-[60%]">{value}</span>
    </div>
  );
}

function formatCurrency(v: string | number | null | undefined) {
  if (!v) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));
}

export default function ClientePerfil() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const clienteId = parseInt(params.id || "0");
  const { data: profile, isLoading, isFetching, refetch } = trpc.clientes.getFullProfile.useQuery({ id: clienteId });
  const deleteCliente = trpc.clientes.delete.useMutation({
    onSuccess: () => { toast.success("Cliente excluído"); setLocation("/clientes"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteProcesso = trpc.processosRouter.delete.useMutation({
    onSuccess: () => { toast.success("Processo excluído"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const { data: pastaFiles, refetch: refetchPasta } = trpc.pasta.getFiles.useQuery({ clienteId });
  const generatePasta = trpc.pasta.generate.useMutation({
    onSuccess: () => {
      toast.success("Pasta do cliente gerada com sucesso!");
      refetchPasta();
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  // Mutations para honorários
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

  const handleExportJson = () => {
    if (!profile) return;
    const { ...exportData } = profile;
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cliente_${profile.cliente.cpfCnpj}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Cliente não encontrado</p>
        <Button variant="outline" className="mt-4" onClick={() => setLocation("/clientes")}>Voltar</Button>
      </div>
    );
  }

  const { cliente, dadosFinanceiros, emprestimos, processos, documentos, conhecimentos, movimentacoesFinanceiras, resumoFinanceiro } = profile as any;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/clientes")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{cliente.nomeCompleto}</h1>
            <p className="text-muted-foreground text-sm font-mono">{cliente.cpfCnpj}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button onClick={() => generatePasta.mutate({ clienteId })} variant="outline" size="sm" disabled={generatePasta.isPending}>
            {generatePasta.isPending ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <FolderOpen className="h-4 w-4 mr-1" />}
            Gerar Pasta
          </Button>
          <Button onClick={handleExportJson} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-1" /> Exportar JSON
          </Button>
          <Button variant="outline" size="sm" onClick={() => setLocation("/upload")}>
            <Upload className="h-4 w-4 mr-1" /> Importar Processo
          </Button>
          <Button variant="default" size="sm" className="bg-amber-600 hover:bg-amber-700" onClick={() => setLocation(`/peticionamento?clienteId=${clienteId}`)}>
            <FilePlus className="h-4 w-4 mr-1" /> Gerar Petição
          </Button>
          <Button variant="outline" size="sm" onClick={() => setLocation(`/agente?clienteId=${clienteId}`)}>
            <Bot className="h-4 w-4 mr-1" /> Agente IA
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4 mr-1" /> Excluir Cliente
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
                <AlertDialogDescription>
                  Isso excluirá permanentemente {profile?.cliente.nomeCompleto} e todos os processos, dados financeiros e documentos vinculados.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => deleteCliente.mutate({ id: clienteId })}>
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Pasta do Cliente no S3 */}
      {pastaFiles && Object.keys(pastaFiles.files).length > 0 && (
        <Card className="border-2 border-[oklch(0.75_0.12_85)]/30 shadow-sm bg-[oklch(0.75_0.12_85)]/5">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="h-4 w-4 text-[oklch(0.75_0.12_85)]" />
              Pasta do Cliente — {profile.pasta || ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">Arquivos gerados automaticamente com todos os dados do cliente para exportação e integração.</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {Object.entries(pastaFiles.files).map(([name, url]) => (
                <a key={name} href={url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 border rounded-lg p-2.5 hover:bg-accent transition-colors text-sm">
                  <FileText className="h-4 w-4 text-[oklch(0.75_0.12_85)] shrink-0" />
                  <span className="truncate font-medium">{name}</span>
                  <ExternalLink className="h-3 w-3 ml-auto shrink-0 text-muted-foreground" />
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dados Pessoais */}
      <Card className="border shadow-sm">
        <CardHeader><CardTitle className="text-base">Dados Pessoais</CardTitle></CardHeader>
        <CardContent className="space-y-0">
          <InfoRow label="Nome Completo" value={cliente.nomeCompleto} />
          <InfoRow label="CPF/CNPJ" value={cliente.cpfCnpj} />
          <InfoRow label="RG" value={cliente.rg} />
          <InfoRow label="Profissão" value={cliente.profissao} />
          <InfoRow label="Cargo" value={cliente.cargo} />
          <InfoRow label="Órgão/Empregador" value={cliente.orgaoEmpregador} />
          <InfoRow label="Vínculo Funcional" value={cliente.vinculoFuncional} />
          <InfoRow label="Endereço" value={cliente.endereco} />
          <InfoRow label="Cidade/UF" value={cliente.cidade && cliente.estado ? `${cliente.cidade}/${cliente.estado}` : null} />
          <InfoRow label="CEP" value={cliente.cep} />
          <InfoRow label="Telefone" value={cliente.telefone} />
          <InfoRow label="E-mail" value={cliente.email} />
          <InfoRow label="Nacionalidade" value={cliente.nacionalidade} />
          <InfoRow label="Estado Civil" value={cliente.estadoCivil} />
        </CardContent>
      </Card>

      {/* Dados Financeiros */}
      {dadosFinanceiros && (
        <Card className="border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-[oklch(0.75_0.12_85)]" /> Dados Financeiros
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            <InfoRow label="Remuneração Bruta" value={formatCurrency(dadosFinanceiros.remuneracaoBruta)} />
            <InfoRow label="Remuneração Líquida" value={formatCurrency(dadosFinanceiros.remuneracaoLiquida)} />
            <InfoRow label="Margem Consignável (%)" value={dadosFinanceiros.margemConsignavelPerc ? `${dadosFinanceiros.margemConsignavelPerc}%` : null} />
            <InfoRow label="Margem Consignável (R$)" value={formatCurrency(dadosFinanceiros.margemConsignavelValor)} />
            <InfoRow label="Total Consignações" value={formatCurrency(dadosFinanceiros.totalConsignacoes)} />
            <InfoRow label="Margem Disponível" value={formatCurrency(dadosFinanceiros.margemDisponivel)} />
            <InfoRow label="Fonte de Renda" value={dadosFinanceiros.fonteRenda} />
            <InfoRow label="Score de Risco" value={dadosFinanceiros.scoreRisco} />
            <InfoRow label="Apto para Empréstimo" value={dadosFinanceiros.aptoEmprestimo ? "Sim" : "Não"} />
          </CardContent>
        </Card>
      )}

      {/* Empréstimos Consignados */}
      {emprestimos && emprestimos.length > 0 && (
        <Card className="border shadow-sm">
          <CardHeader><CardTitle className="text-base">Empréstimos Consignados ({emprestimos.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {emprestimos.map((emp: any) => (
                <div key={emp.id} className="border rounded-lg p-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="font-medium">{emp.banco || "Banco não identificado"}</span>
                    <Badge variant={emp.status === "Ativo" ? "default" : "secondary"}>{emp.status}</Badge>
                  </div>
                  <InfoRow label="Contrato" value={emp.contrato} />
                  <InfoRow label="Parcela" value={formatCurrency(emp.valorParcela)} />
                  <InfoRow label="Valor Total" value={formatCurrency(emp.valorTotal)} />
                  <InfoRow label="Parcelas" value={emp.totalParcelas ? `${emp.parcelasRestantes ?? "?"}/${emp.totalParcelas}` : null} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Banco de Conhecimento Individual */}
      {conhecimentos && conhecimentos.length > 0 && (
        <Card className="border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-[oklch(0.75_0.12_85)]" /> Banco de Conhecimento ({conhecimentos.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
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
                  {kn.conteudo && <p className="text-sm text-muted-foreground leading-relaxed">{kn.conteudo}</p>}
                  {kn.tipoAcao && <p className="text-xs text-muted-foreground">Tipo: {kn.tipoAcao} | Tribunal: {kn.tribunal || "—"}</p>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Processos */}
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Scale className="h-4 w-4 text-[oklch(0.75_0.12_85)]" /> Processos Judiciais ({processos?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!processos?.length ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum processo vinculado</p>
          ) : (
            <div className="space-y-4">
              {processos.map((proc: any) => (
                <div key={proc.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-sm">{proc.tipoAcao || "Processo"}</h4>
                        {(proc as any).tipoVinculo && (
                          <Badge variant="outline" className="text-xs gap-1 border-blue-300 text-blue-700 dark:text-blue-400">
                            <GitBranch className="h-3 w-3" />
                            {(proc as any).tipoVinculo}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs font-mono text-muted-foreground mt-0.5">{proc.numeroCnj}</p>
                      {/* Vinculação com processo principal */}
                      {(proc as any).processoOrigemId && (() => {
                        const origem = processos?.find((p: any) => p.id === (proc as any).processoOrigemId);
                        return origem ? (
                          <div className="flex items-center gap-1.5 mt-1 text-xs text-blue-600 dark:text-blue-400">
                            <Link2 className="h-3 w-3" />
                            <span>Vinculado ao processo principal: <span className="font-mono font-medium">{origem.numeroCnj}</span></span>
                          </div>
                        ) : null;
                      })()}
                      {/* Processos dependentes deste */}
                      {(() => {
                        const dependentes = processos?.filter((p: any) => (p as any).processoOrigemId === proc.id) || [];
                        return dependentes.length > 0 ? (
                          <div className="mt-1 space-y-0.5">
                            {dependentes.map((dep: any) => (
                              <div key={dep.id} className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                                <GitBranch className="h-3 w-3" />
                                <span>Processo dependente: <span className="font-mono font-medium">{dep.numeroCnj}</span> ({dep.tipoVinculo || dep.tipoAcao})</span>
                              </div>
                            ))}
                          </div>
                        ) : null;
                      })()}
                    </div>
                    <div className="flex gap-2 items-center">
                      <Badge variant={proc.statusProcesso === "Ativo" ? "default" : "secondary"}>
                        {proc.statusProcesso}
                      </Badge>
                      <Badge variant="outline">{proc.faseAtual}</Badge>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir processo?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Isso excluirá o processo {proc.numeroCnj} e todos os dados vinculados (estratégias, partes, movimentações).
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => deleteProcesso.mutate({ id: proc.id })}>
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-2 gap-x-6">
                    <InfoRow label="Tribunal" value={proc.tribunal} />
                    <InfoRow label="Comarca" value={proc.comarca} />
                    <InfoRow label="Vara" value={proc.vara} />
                    <InfoRow label="Juiz" value={proc.juiz} />
                    <InfoRow label="Distribuição" value={proc.dataDistribuicao} />
                    <InfoRow label="Valor da Causa" value={formatCurrency(proc.valorCausa)} />
                    <InfoRow label="Polo Ativo" value={proc.poloAtivo} />
                    <InfoRow label="Polo Passivo" value={proc.poloPassivo} />
                    <InfoRow label="Danos Morais" value={formatCurrency(proc.danosMorais)} />
                    <InfoRow label="Danos Materiais" value={formatCurrency(proc.danosMateriais)} />
                    <InfoRow label="Restituição" value={formatCurrency(proc.restituicao)} />
                    <InfoRow label="Condenação" value={formatCurrency(proc.valorCondenacao)} />
                    <InfoRow label="Natureza" value={proc.natureza} />
                    <InfoRow label="Classe Processual" value={proc.classeProcessual} />
                  </div>

                  {proc.pdfUrl && (
                    <a href={proc.pdfUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-[oklch(0.75_0.12_85)] hover:underline mt-2">
                      <FileText className="h-3.5 w-3.5" /> Ver PDF Original <ExternalLink className="h-3 w-3" />
                    </a>
                  )}

                  {/* Estratégias */}
                  {proc.estrategias?.length > 0 && (
                    <div className="mt-3 border-t pt-3">
                      <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Estratégia Processual</h5>
                      {proc.estrategias.map((est: any) => (
                        <div key={est.id} className="space-y-2 text-sm">
                          {est.tesePrincipal && <div><span className="text-xs text-muted-foreground">Tese Principal:</span><p className="text-sm">{est.tesePrincipal}</p></div>}
                          {est.fundamentacaoLegal && <div><span className="text-xs text-muted-foreground">Fundamentação Legal:</span><p className="text-sm">{est.fundamentacaoLegal}</p></div>}
                          {est.jurisprudenciaCitada && <div><span className="text-xs text-muted-foreground">Jurisprudência:</span><p className="text-sm">{est.jurisprudenciaCitada}</p></div>}
                          {est.pontosFortes && <div><span className="text-xs text-muted-foreground">Pontos Fortes:</span><p className="text-sm">{est.pontosFortes}</p></div>}
                          {est.riscosIdentificados && <div><span className="text-xs text-muted-foreground">Riscos:</span><p className="text-sm">{est.riscosIdentificados}</p></div>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Partes */}
                  {proc.partes?.length > 0 && (
                    <div className="mt-3 border-t pt-3">
                      <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Partes Processuais</h5>
                      <div className="space-y-1">
                        {proc.partes.map((p: any) => (
                          <div key={p.id} className="flex justify-between text-sm">
                            <span>{p.nome} {p.cpfCnpj ? `(${p.cpfCnpj})` : ""}</span>
                            <Badge variant="outline" className="text-xs">{p.tipo} — {p.categoria || ""}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Movimentações Processuais */}
                  {proc.movimentacoes?.length > 0 && (
                    <div className="mt-3 border-t pt-3">
                      <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Movimentações Processuais ({proc.movimentacoes.length})</h5>
                      <div className="space-y-2">
                        {proc.movimentacoes.map((mov: any) => (
                          <div key={mov.id} className="flex items-start gap-3 text-sm border-l-2 border-[oklch(0.75_0.12_85)/30] pl-3 py-1">
                            <div className="shrink-0 w-20 text-xs text-muted-foreground font-mono">
                              {mov.data || "—"}
                            </div>
                            <div className="min-w-0">
                              <span className="font-medium text-xs">{mov.evento}</span>
                              {mov.descricao && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{mov.descricao}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ==================== ABA FINANCEIRO ==================== */}
      <Card className="border-2 border-[oklch(0.55_0.15_145)]/30 shadow-md">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Banknote className="h-5 w-5 text-[oklch(0.55_0.15_145)]" />
            Painel Financeiro
          </CardTitle>
          <p className="text-sm text-muted-foreground">Depósitos judiciais, alvarás, honorários e pagamentos extraídos dos processos</p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Resumo Financeiro em Cards */}
          {resumoFinanceiro && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Honorários Totais */}
              <div className="border rounded-lg p-4 bg-[oklch(0.55_0.15_145)]/5">
                <div className="flex items-center gap-2 mb-2">
                  <Banknote className="h-4 w-4 text-[oklch(0.55_0.15_145)]" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase">Honorários Total</span>
                </div>
                <p className="text-xl font-bold">{formatCurrency(resumoFinanceiro.totalHonorariosSucumbenciais)}</p>
              </div>
              {/* Honorários Pagos/Levantados */}
              <div className="border rounded-lg p-4 bg-green-500/5">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase">Pagos / Levantados</span>
                </div>
                <p className="text-xl font-bold text-green-700 dark:text-green-400">{formatCurrency(resumoFinanceiro.honorariosPagosLevantados)}</p>
              </div>
              {/* Honorários Depositados/A Levantar */}
              <div className="border rounded-lg p-4 bg-amber-500/5">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-amber-600" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase">Depositados / A Levantar</span>
                </div>
                <p className="text-xl font-bold text-amber-700 dark:text-amber-400">{formatCurrency(resumoFinanceiro.honorariosDepositadosALevantar)}</p>
              </div>
              {/* Honorários Pendentes */}
              <div className="border rounded-lg p-4 bg-red-500/5">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase">Pendentes</span>
                </div>
                <p className="text-xl font-bold text-red-700 dark:text-red-400">{formatCurrency(resumoFinanceiro.honorariosPendentes)}</p>
              </div>
            </div>
          )}

          {/* Depósitos e Alvarás */}
          {resumoFinanceiro && (resumoFinanceiro.totalDepositos > 0 || resumoFinanceiro.totalAlvaras > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {resumoFinanceiro.totalDepositos > 0 && (
                <div className="border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Landmark className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-semibold">Depósitos Judiciais</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total Depositado</span>
                      <span className="font-medium">{formatCurrency(resumoFinanceiro.totalDepositos)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-green-600">Levantados</span>
                      <span className="font-medium text-green-600">{formatCurrency(resumoFinanceiro.depositosLevantados)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-amber-600">A Levantar</span>
                      <span className="font-medium text-amber-600">{formatCurrency(resumoFinanceiro.depositosALevantar)}</span>
                    </div>
                    <Progress value={resumoFinanceiro.totalDepositos > 0 ? (resumoFinanceiro.depositosLevantados / resumoFinanceiro.totalDepositos) * 100 : 0} className="h-2" />
                  </div>
                </div>
              )}
              {resumoFinanceiro.totalAlvaras > 0 && (
                <div className="border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Receipt className="h-4 w-4 text-purple-600" />
                    <span className="text-sm font-semibold">Alvarás de Levantamento</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total em Alvarás</span>
                      <span className="font-medium">{formatCurrency(resumoFinanceiro.totalAlvaras)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-green-600">Levantados</span>
                      <span className="font-medium text-green-600">{formatCurrency(resumoFinanceiro.alvarasLevantados)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-amber-600">Pendentes</span>
                      <span className="font-medium text-amber-600">{formatCurrency(resumoFinanceiro.alvarasPendentes)}</span>
                    </div>
                    <Progress value={resumoFinanceiro.totalAlvaras > 0 ? (resumoFinanceiro.alvarasLevantados / resumoFinanceiro.totalAlvaras) * 100 : 0} className="h-2" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Outros valores */}
          {resumoFinanceiro && (resumoFinanceiro.totalPagamentos > 0 || resumoFinanceiro.totalRestituicoes > 0 || resumoFinanceiro.totalMultas > 0 || resumoFinanceiro.totalCustas > 0) && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {resumoFinanceiro.totalPagamentos > 0 && (
                <div className="border rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">Pagamentos</p>
                  <p className="text-sm font-bold">{formatCurrency(resumoFinanceiro.totalPagamentos)}</p>
                </div>
              )}
              {resumoFinanceiro.totalRestituicoes > 0 && (
                <div className="border rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">Restituições</p>
                  <p className="text-sm font-bold">{formatCurrency(resumoFinanceiro.totalRestituicoes)}</p>
                </div>
              )}
              {resumoFinanceiro.totalMultas > 0 && (
                <div className="border rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">Multas</p>
                  <p className="text-sm font-bold text-red-600">{formatCurrency(resumoFinanceiro.totalMultas)}</p>
                </div>
              )}
              {resumoFinanceiro.totalCustas > 0 && (
                <div className="border rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">Custas</p>
                  <p className="text-sm font-bold">{formatCurrency(resumoFinanceiro.totalCustas)}</p>
                </div>
              )}
            </div>
          )}

          {/* Tabela detalhada de movimentações financeiras com ações */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold">Detalhamento por Movimentação ({movimentacoesFinanceiras?.length || 0})</h4>
              <div className="flex gap-2">
                {selectedIds.length > 0 && (
                  <Select onValueChange={(val) => {
                    atualizarStatusLote.mutate({ movimentacaoIds: selectedIds, novoStatus: val as any });
                    setSelectedIds([]);
                  }}>
                    <SelectTrigger className="w-[200px] h-8 text-xs">
                      <SelectValue placeholder={`Alterar ${selectedIds.length} selecionados`} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pago_levantado">Marcar como Pago/Levantado</SelectItem>
                      <SelectItem value="depositado_a_levantar">Marcar como Dep./A Levantar</SelectItem>
                      <SelectItem value="pendente">Marcar como Pendente</SelectItem>
                      <SelectItem value="parcial">Marcar como Parcial</SelectItem>
                      <SelectItem value="cancelado">Marcar como Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="h-8">
                      <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Adicionar Movimentação Financeira</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Tipo</Label>
                          <Select value={newMov.tipo} onValueChange={(v) => setNewMov(p => ({ ...p, tipo: v }))}>
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
                          <Select value={newMov.status} onValueChange={(v) => setNewMov(p => ({ ...p, status: v }))}>
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
                          <Input type="number" step="0.01" className="mt-1" value={newMov.valor || ''}
                            onChange={(e) => setNewMov(p => ({ ...p, valor: parseFloat(e.target.value) || 0 }))} />
                        </div>
                        <div>
                          <Label className="text-xs">Data</Label>
                          <Input type="date" className="mt-1" value={newMov.dataMovimentacao}
                            onChange={(e) => setNewMov(p => ({ ...p, dataMovimentacao: e.target.value }))} />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">Descrição</Label>
                        <Textarea className="mt-1" rows={2} value={newMov.descricao}
                          onChange={(e) => setNewMov(p => ({ ...p, descricao: e.target.value }))} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Beneficiário</Label>
                          <Input className="mt-1" value={newMov.beneficiario}
                            onChange={(e) => setNewMov(p => ({ ...p, beneficiario: e.target.value }))} />
                        </div>
                        <div>
                          <Label className="text-xs">Fundamento Legal</Label>
                          <Input className="mt-1" value={newMov.fundamentoLegal}
                            onChange={(e) => setNewMov(p => ({ ...p, fundamentoLegal: e.target.value }))} />
                        </div>
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
                          onChange={(e) => setSelectedIds(e.target.checked ? movimentacoesFinanceiras.map((m: any) => m.id) : [])} />
                      </th>
                      <th className="pb-2 pr-3 text-xs text-muted-foreground font-medium">Tipo</th>
                      <th className="pb-2 pr-3 text-xs text-muted-foreground font-medium">Status</th>
                      <th className="pb-2 pr-3 text-xs text-muted-foreground font-medium text-right">Valor</th>
                      <th className="pb-2 pr-3 text-xs text-muted-foreground font-medium text-right">Levantado</th>
                      <th className="pb-2 pr-3 text-xs text-muted-foreground font-medium">Data</th>
                      <th className="pb-2 pr-3 text-xs text-muted-foreground font-medium">Descrição</th>
                      <th className="pb-2 text-xs text-muted-foreground font-medium text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimentacoesFinanceiras.map((mf: any) => {
                      const tipoLabels: Record<string, string> = {
                        deposito_judicial: 'Depósito Judicial',
                        alvara_levantamento: 'Alvará Levantamento',
                        honorarios_sucumbenciais: 'Hon. Sucumbenciais',
                        honorarios_contratuais: 'Hon. Contratuais',
                        pagamento: 'Pagamento',
                        restituicao: 'Restituição',
                        multa: 'Multa',
                        custas: 'Custas',
                      };
                      const statusLabels: Record<string, { label: string; color: string }> = {
                        pago_levantado: { label: 'Pago/Levantado', color: 'text-green-600 bg-green-50 dark:bg-green-950' },
                        depositado_a_levantar: { label: 'Dep./A Levantar', color: 'text-amber-600 bg-amber-50 dark:bg-amber-950' },
                        pendente: { label: 'Pendente', color: 'text-red-600 bg-red-50 dark:bg-red-950' },
                        parcial: { label: 'Parcial', color: 'text-blue-600 bg-blue-50 dark:bg-blue-950' },
                        cancelado: { label: 'Cancelado', color: 'text-gray-500 bg-gray-50 dark:bg-gray-900' },
                      };
                      const st = statusLabels[mf.status] || statusLabels.pendente;
                      const isEditing = editingId === mf.id;
                      return (
                        <tr key={mf.id} className={`border-b last:border-0 hover:bg-accent/50 ${selectedIds.includes(mf.id) ? 'bg-primary/5' : ''}`}>
                          <td className="py-2.5 pr-2">
                            <input type="checkbox" className="rounded" checked={selectedIds.includes(mf.id)}
                              onChange={(e) => setSelectedIds(prev => e.target.checked ? [...prev, mf.id] : prev.filter(id => id !== mf.id))} />
                          </td>
                          <td className="py-2.5 pr-3">
                            <span className="font-medium text-xs">{tipoLabels[mf.tipo] || mf.tipo}</span>
                          </td>
                          <td className="py-2.5 pr-3">
                            {isEditing ? (
                              <Select value={editStatus} onValueChange={setEditStatus}>
                                <SelectTrigger className="h-7 w-[150px] text-xs"><SelectValue /></SelectTrigger>
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
                          <td className="py-2.5 pr-3 text-right font-mono font-medium text-xs">{formatCurrency(mf.valor)}</td>
                          <td className="py-2.5 pr-3 text-right font-mono text-xs">
                            {mf.valorLevantado ? formatCurrency(mf.valorLevantado) : '—'}
                          </td>
                          <td className="py-2.5 pr-3 text-xs text-muted-foreground">{mf.dataMovimentacao || '—'}</td>
                          <td className="py-2.5 pr-3 text-xs text-muted-foreground max-w-[160px] truncate">{mf.descricao || '—'}</td>
                          <td className="py-2.5 text-center">
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
                                  <Button size="icon" variant="ghost" className="h-6 w-6"
                                    onClick={() => { setEditingId(mf.id); setEditStatus(mf.status); }}>
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
              <div className="text-center py-6 text-muted-foreground">
                <Banknote className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhuma movimentação financeira registrada</p>
                <p className="text-xs mt-1">Clique em "Adicionar" ou importe processos para extrair dados financeiros automaticamente</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Documentos */}
      {documentos && documentos.length > 0 && (
        <Card className="border shadow-sm">
          <CardHeader><CardTitle className="text-base">Documentos ({documentos.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {documentos.map((doc: any) => (
                <div key={doc.id} className="flex items-center justify-between border rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{doc.nomeArquivo}</p>
                      <p className="text-xs text-muted-foreground">{doc.tipo} — {doc.tamanho ? `${(doc.tamanho / 1024 / 1024).toFixed(1)} MB` : ""}</p>
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
