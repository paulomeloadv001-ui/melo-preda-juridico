import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Search, RefreshCw, Globe, Clock, Scale, Building2, FileText, AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Loader2, Gavel, Eye } from "lucide-react";
import { toast } from "sonner";

function formatarCNJ(num: string): string {
  const n = num.replace(/[^0-9]/g, '');
  if (n.length === 20) {
    return `${n.slice(0,7)}-${n.slice(7,9)}.${n.slice(9,13)}.${n.slice(13,14)}.${n.slice(14,16)}.${n.slice(16,20)}`;
  }
  return num;
}

function formatarData(d: string | null | undefined): string {
  if (!d) return 'N/A';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) {
      // Formato YYYYMMDDHHMMSS
      if (d.length === 14) {
        return `${d.slice(6,8)}/${d.slice(4,6)}/${d.slice(0,4)}`;
      }
      return d;
    }
    return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return d; }
}

export default function AcompanhamentoPJe() {
  const [numeroCnj, setNumeroCnj] = useState("");
  const [resultado, setResultado] = useState<any>(null);
  const [expandido, setExpandido] = useState(false);
  const [movsVisiveis, setMovsVisiveis] = useState(20);
  const [resultadosLote, setResultadosLote] = useState<any[]>([]);
  const [processoSelecionado, setProcessoSelecionado] = useState<string | null>(null);

  const consultarMut = trpc.datajud.consultarProcesso.useMutation({
    onSuccess: (data) => {
      setResultado(data);
      setMovsVisiveis(20);
      if (data.encontrado) {
        toast.success("Processo encontrado!", { description: `${data.totalMovimentos} movimentações carregadas` });
      } else {
        toast.error("Processo não encontrado", { description: "Verifique o número CNJ" });
      }
    },
    onError: (err) => {
      toast.error("Erro na consulta", { description: err.message });
    },
  });

  const consultarTodosMut = trpc.datajud.consultarTodosProcessos.useMutation({
    onSuccess: (data) => {
      setResultadosLote(data.resultados);
      toast.success("Varredura concluída!", { description: `${data.total} processos consultados na API DataJud` });
    },
    onError: (err) => {
      toast.error("Erro na varredura", { description: err.message });
    },
  });

  const handleConsultar = () => {
    if (!numeroCnj.trim()) return;
    setResultado(null);
    consultarMut.mutate({ numeroCnj: numeroCnj.trim() });
  };

  const handleConsultarDeResultado = (cnj: string) => {
    setNumeroCnj(cnj);
    setProcessoSelecionado(cnj);
    setResultado(null);
    consultarMut.mutate({ numeroCnj: cnj });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Globe className="h-6 w-6 text-blue-600" />
            Acompanhamento Processual - PJe/DataJud
          </h1>
          <p className="text-muted-foreground mt-1">
            Consulta em tempo real via API Pública do CNJ (DataJud) — Todos os tribunais do Brasil
          </p>
        </div>
      </div>

      {/* Consulta Individual */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Consulta por Número CNJ
          </CardTitle>
          <CardDescription>
            Digite o número do processo (com ou sem pontuação) para consultar movimentações em tempo real
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Input
              placeholder="Ex: 5380169-54.2025.8.09.0051 ou 53801695420258090051"
              value={numeroCnj}
              onChange={(e) => setNumeroCnj(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConsultar()}
              className="flex-1"
            />
            <Button onClick={handleConsultar} disabled={consultarMut.isPending || !numeroCnj.trim()}>
              {consultarMut.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Consultando...</>
              ) : (
                <><Search className="h-4 w-4 mr-2" /> Consultar</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Varredura em Lote */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Varredura em Lote — Todos os Processos Cadastrados
          </CardTitle>
          <CardDescription>
            Consulta automática de todos os processos do escritório na API DataJud para verificar atualizações
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Button 
              onClick={() => consultarTodosMut.mutate()} 
              disabled={consultarTodosMut.isPending}
              variant="outline"
              className="bg-blue-50 hover:bg-blue-100 border-blue-200"
            >
              {consultarTodosMut.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Consultando processos...</>
              ) : (
                <><RefreshCw className="h-4 w-4 mr-2" /> Iniciar Varredura</>
              )}
            </Button>
            {resultadosLote.length > 0 && (
              <Badge variant="secondary" className="text-sm">
                {resultadosLote.length} processos encontrados
              </Badge>
            )}
          </div>

          {/* Resultados da Varredura */}
          {resultadosLote.length > 0 && (
            <div className="mt-4 space-y-2">
              <h4 className="font-semibold text-sm text-muted-foreground">Resultados da Varredura:</h4>
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-3 font-medium">Processo</th>
                      <th className="text-left p-3 font-medium">Classe</th>
                      <th className="text-left p-3 font-medium">Órgão Julgador</th>
                      <th className="text-center p-3 font-medium">Movimentações</th>
                      <th className="text-left p-3 font-medium">Último Movimento</th>
                      <th className="text-center p-3 font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultadosLote.map((r, i) => (
                      <tr key={i} className="border-t hover:bg-muted/30">
                        <td className="p-3 font-mono text-xs">{formatarCNJ(r.numeroCnj || '')}</td>
                        <td className="p-3">{r.classe || 'N/A'}</td>
                        <td className="p-3 text-xs">{r.orgaoJulgador || 'N/A'}</td>
                        <td className="p-3 text-center">
                          <Badge variant="secondary">{r.totalMovimentos}</Badge>
                        </td>
                        <td className="p-3 text-xs">
                          {r.ultimoMovimento ? (
                            <div>
                              <span className="font-medium">{r.ultimoMovimento.nome}</span>
                              <br />
                              <span className="text-muted-foreground">{formatarData(r.ultimoMovimento.dataHora)}</span>
                            </div>
                          ) : 'N/A'}
                        </td>
                        <td className="p-3 text-center">
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => handleConsultarDeResultado(r.numeroCnj)}
                          >
                            <Eye className="h-4 w-4 mr-1" /> Ver
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resultado da Consulta Individual */}
      {resultado && resultado.encontrado && (
        <div className="space-y-4">
          {/* Dados do Processo */}
          <Card className="border-blue-200 bg-blue-50/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Scale className="h-5 w-5 text-blue-600" />
                Dados do Processo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Número CNJ</label>
                  <p className="font-mono text-sm font-bold">{formatarCNJ(resultado.processo.numeroProcesso)}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Classe Processual</label>
                  <p className="text-sm">{resultado.processo.classe}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Tribunal</label>
                  <p className="text-sm">{resultado.processo.tribunal} — {resultado.processo.grau}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Órgão Julgador</label>
                  <p className="text-sm">{resultado.processo.orgaoJulgador}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Sistema / Formato</label>
                  <p className="text-sm">{resultado.processo.sistema} — {resultado.processo.formato}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Data de Ajuizamento</label>
                  <p className="text-sm">{formatarData(resultado.processo.dataAjuizamento)}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Última Atualização</label>
                  <p className="text-sm">{formatarData(resultado.processo.dataUltimaAtualizacao)}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Assuntos</label>
                  <p className="text-sm">{resultado.processo.assuntos || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Total de Movimentações</label>
                  <Badge className="bg-blue-600">{resultado.totalMovimentos}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Timeline de Movimentações */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Movimentações Processuais ({resultado.totalMovimentos})
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setExpandido(!expandido)}>
                  {expandido ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  {expandido ? 'Recolher' : 'Expandir Tudo'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
                
                <div className="space-y-4">
                  {resultado.movimentos.slice(0, expandido ? undefined : movsVisiveis).map((mov: any, i: number) => {
                    const isRecente = i < 5;
                    const isSentenca = mov.nome?.toLowerCase().includes('senten') || mov.nome?.toLowerCase().includes('decisão') || mov.nome?.toLowerCase().includes('julgamento');
                    const isIntimacao = mov.nome?.toLowerCase().includes('intima') || mov.nome?.toLowerCase().includes('cita');
                    
                    return (
                      <div key={i} className="relative pl-10">
                        {/* Timeline dot */}
                        <div className={`absolute left-2.5 w-3 h-3 rounded-full border-2 ${
                          isSentenca ? 'bg-red-500 border-red-300' :
                          isIntimacao ? 'bg-yellow-500 border-yellow-300' :
                          isRecente ? 'bg-blue-500 border-blue-300' :
                          'bg-gray-300 border-gray-200'
                        }`} />
                        
                        <div className={`p-3 rounded-lg border ${
                          isRecente ? 'bg-blue-50/50 border-blue-100' : 'bg-background'
                        }`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                {isSentenca && <Gavel className="h-4 w-4 text-red-500" />}
                                {isIntimacao && <AlertCircle className="h-4 w-4 text-yellow-500" />}
                                <span className="font-medium text-sm">{mov.nome}</span>
                                <Badge variant="outline" className="text-xs">Cód. {mov.codigo}</Badge>
                              </div>
                              {mov.complementos && (
                                <p className="text-xs text-muted-foreground mt-1">{mov.complementos}</p>
                              )}
                              {mov.orgaoJulgador && (
                                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                  <Building2 className="h-3 w-3" /> {mov.orgaoJulgador}
                                </p>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {formatarData(mov.dataHora)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {!expandido && resultado.movimentos.length > movsVisiveis && (
                  <div className="mt-4 text-center">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setMovsVisiveis(prev => prev + 20)}
                    >
                      Carregar mais ({resultado.movimentos.length - movsVisiveis} restantes)
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {resultado && !resultado.encontrado && (
        <Card className="border-yellow-200 bg-yellow-50/30">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-8 w-8 text-yellow-600" />
              <div>
                <h3 className="font-semibold">Processo não encontrado</h3>
                <p className="text-sm text-muted-foreground">
                  O número CNJ informado não retornou resultados na API DataJud. 
                  Verifique se o número está correto e se o processo é público (não sigiloso).
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info Card */}
      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="text-sm text-muted-foreground space-y-1">
              <p><strong>Fonte dos dados:</strong> API Pública do DataJud — Conselho Nacional de Justiça (CNJ)</p>
              <p><strong>Cobertura:</strong> Todos os tribunais estaduais, federais, trabalhistas, eleitorais e militares do Brasil</p>
              <p><strong>Atualização:</strong> Os dados são atualizados periodicamente pelos tribunais. Pode haver atraso de até 48h nas movimentações mais recentes.</p>
              <p><strong>Limitação:</strong> Processos em segredo de justiça não são retornados pela API pública.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
