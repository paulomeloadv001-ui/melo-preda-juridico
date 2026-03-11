import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, FileText, DollarSign, Scale, Download, ExternalLink, FolderOpen, BookOpen, Lightbulb, RefreshCw, Database } from "lucide-react";
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
  const { data: profile, isLoading, refetch } = trpc.clientes.getFullProfile.useQuery({ id: clienteId });
  const { data: pastaFiles, refetch: refetchPasta } = trpc.pasta.getFiles.useQuery({ clienteId });
  const generatePasta = trpc.pasta.generate.useMutation({
    onSuccess: () => {
      toast.success("Pasta do cliente gerada com sucesso!");
      refetchPasta();
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
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

  const { cliente, dadosFinanceiros, emprestimos, processos, documentos, conhecimentos } = profile;

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
        <div className="flex gap-2">
          <Button onClick={() => generatePasta.mutate({ clienteId })} variant="outline" size="sm" disabled={generatePasta.isPending}>
            {generatePasta.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <FolderOpen className="h-4 w-4 mr-2" />}
            Gerar Pasta
          </Button>
          <Button onClick={handleExportJson} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" /> Exportar JSON
          </Button>
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
              {emprestimos.map((emp) => (
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
              {processos.map((proc) => (
                <div key={proc.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-semibold text-sm">{proc.tipoAcao || "Processo"}</h4>
                      <p className="text-xs font-mono text-muted-foreground mt-0.5">{proc.numeroCnj}</p>
                    </div>
                    <div className="flex gap-2">
                      <Badge variant={proc.statusProcesso === "Ativo" ? "default" : "secondary"}>
                        {proc.statusProcesso}
                      </Badge>
                      <Badge variant="outline">{proc.faseAtual}</Badge>
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
                      {proc.estrategias.map((est) => (
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
                        {proc.partes.map((p) => (
                          <div key={p.id} className="flex justify-between text-sm">
                            <span>{p.nome} {p.cpfCnpj ? `(${p.cpfCnpj})` : ""}</span>
                            <Badge variant="outline" className="text-xs">{p.tipo} — {p.categoria || ""}</Badge>
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

      {/* Documentos */}
      {documentos && documentos.length > 0 && (
        <Card className="border shadow-sm">
          <CardHeader><CardTitle className="text-base">Documentos ({documentos.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {documentos.map((doc) => (
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
