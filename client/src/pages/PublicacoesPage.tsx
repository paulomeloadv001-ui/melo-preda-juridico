import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Bell, CheckCircle, Clock, AlertTriangle, Search, RefreshCw, Shield, ExternalLink, Filter, Calendar } from "lucide-react";

export default function PublicacoesPage() {

  const [filtroFonte, setFiltroFonte] = useState<string>("todas");
  const [filtroTratada, setFiltroTratada] = useState<string>("todas");
  const [selectedPub, setSelectedPub] = useState<any>(null);
  const [observacoes, setObservacoes] = useState("");
  const [showPrazoDialog, setShowPrazoDialog] = useState(false);
  const [prazoData, setPrazoData] = useState({ tipoPrazo: "manifestacao", diasPrazo: 15, descricao: "" });

  const statsQuery = trpc.publicacoesRouter.stats.useQuery();
  const listQuery = trpc.publicacoesRouter.listar.useQuery({
    fonte: filtroFonte !== "todas" ? filtroFonte : undefined,
    tratada: filtroTratada === "tratadas" ? 1 : filtroTratada === "pendentes" ? 0 : undefined,
    limit: 100,
  });

  const utils = trpc.useUtils();

  const marcarTratada = trpc.publicacoesRouter.marcarTratada.useMutation({
    onSuccess: () => {
      toast.success("Publicação marcada como tratada");
      utils.publicacoesRouter.listar.invalidate();
      utils.publicacoesRouter.stats.invalidate();
      setSelectedPub(null);
      setObservacoes("");
    },
    onError: (e) => toast.error(e.message),
  });

  const gerarPrazo = trpc.publicacoesRouter.gerarPrazo.useMutation({
    onSuccess: (data) => {
      toast.success(`Prazo gerado! Vencimento: ${new Date(data.dataFim).toLocaleDateString('pt-BR')}`);
      utils.publicacoesRouter.listar.invalidate();
      utils.publicacoesRouter.stats.invalidate();
      setShowPrazoDialog(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const buscarDatajud = trpc.publicacoesRouter.buscarDatajud.useMutation({
    onSuccess: (data) => {
      toast.success(`Varredura DATAJUD: ${data.novasPublicacoes} novas publicações (${data.erros} erros)`);
      utils.publicacoesRouter.listar.invalidate();
      utils.publicacoesRouter.stats.invalidate();
    },
    onError: (e) => toast.error(`DATAJUD: ${e.message}`),
  });

  const buscarEscavador = trpc.publicacoesRouter.buscarEscavador.useMutation({
    onSuccess: (data: any) => {
      if (data.error) {
        toast.error(`Escavador: ${data.error}`);
      } else {
        toast.success(`Escavador: ${data.novasPublicacoes} novas publicações`);
      }
      utils.publicacoesRouter.listar.invalidate();
      utils.publicacoesRouter.stats.invalidate();
    },
    onError: (e) => toast.error(`Escavador: ${e.message}`),
  });

  const buscarJusbrasil = trpc.publicacoesRouter.buscarJusbrasil.useMutation({
    onSuccess: (data: any) => {
      if (data.error) {
        toast.error(`JusBrasil: ${data.error}`);
      } else {
        toast.success(`JusBrasil: ${data.novasPublicacoes} novas publicações`);
      }
      utils.publicacoesRouter.listar.invalidate();
      utils.publicacoesRouter.stats.invalidate();
    },
    onError: (e) => toast.error(`JusBrasil: ${e.message}`),
  });

  const stats = statsQuery.data;
  const publicacoesList = listQuery.data || [];

  const getUrgenciaBadge = (urgencia: number) => {
    if (urgencia >= 2) return <Badge variant="destructive" className="gap-1"><AlertTriangle className="w-3 h-3" /> Crítico</Badge>;
    if (urgencia >= 1) return <Badge className="bg-amber-500 text-white gap-1"><Clock className="w-3 h-3" /> Urgente</Badge>;
    return <Badge variant="secondary" className="gap-1">Normal</Badge>;
  };

  const getFonteBadge = (fonte: string) => {
    const colors: Record<string, string> = {
      datajud: "bg-blue-600 text-white",
      escavador: "bg-purple-600 text-white",
      jusbrasil: "bg-green-600 text-white",
      dje: "bg-orange-600 text-white",
      manual: "bg-gray-600 text-white",
    };
    return <Badge className={colors[fonte] || "bg-gray-500 text-white"}>{fonte.toUpperCase()}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Publicações e Intimações</h1>
          <p className="text-muted-foreground">Monitoramento multicamada: DATAJUD + Escavador + JusBrasil | OAB/GO 40.559</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{stats?.total || 0}</p>
              </div>
              <Bell className="w-8 h-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Não Tratadas</p>
                <p className="text-2xl font-bold text-amber-500">{stats?.naoTratadas || 0}</p>
              </div>
              <Clock className="w-8 h-8 text-amber-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Urgentes</p>
                <p className="text-2xl font-bold text-red-500">{stats?.urgentes || 0}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Por Fonte</p>
                <div className="flex gap-1 flex-wrap mt-1">
                  {stats?.porFonte?.map((f: any) => (
                    <span key={f.fonte} className="text-xs">{f.fonte}: {f.count}</span>
                  ))}
                </div>
              </div>
              <Search className="w-8 h-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Fontes de Monitoramento */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Shield className="w-5 h-5" /> Fontes de Monitoramento</CardTitle>
          <CardDescription>Clique para buscar publicações em cada fonte. DATAJUD é gratuito. Escavador e JusBrasil requerem API Key.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* DATAJUD */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  <span className="font-semibold">DATAJUD / CNJ</span>
                </div>
                <Badge variant="secondary" className="text-xs">Gratuito</Badge>
              </div>
              <p className="text-xs text-muted-foreground">API pública do CNJ. Busca movimentações por número de processo.</p>
              <Button
                onClick={() => buscarDatajud.mutate()}
                disabled={buscarDatajud.isPending}
                className="w-full"
                size="sm"
              >
                {buscarDatajud.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                Varredura DATAJUD
              </Button>
            </div>

            {/* Escavador */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-purple-500" />
                  <span className="font-semibold">Escavador</span>
                </div>
                <Badge variant="outline" className="text-xs">API Paga</Badge>
              </div>
              <p className="text-xs text-muted-foreground">Melhor para DJE. Monitora publicações por OAB no Diário Oficial.</p>
              <Button
                onClick={() => buscarEscavador.mutate()}
                disabled={buscarEscavador.isPending}
                className="w-full"
                size="sm"
                variant="outline"
              >
                {buscarEscavador.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                Varredura Escavador
              </Button>
            </div>

            {/* JusBrasil */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="font-semibold">JusBrasil</span>
                </div>
                <Badge variant="outline" className="text-xs">API Paga</Badge>
              </div>
              <p className="text-xs text-muted-foreground">Busca publicações em diários oficiais de todo o Brasil.</p>
              <Button
                onClick={() => buscarJusbrasil.mutate()}
                disabled={buscarJusbrasil.isPending}
                className="w-full"
                size="sm"
                variant="outline"
              >
                {buscarJusbrasil.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                Varredura JusBrasil
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filtros */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={filtroFonte} onValueChange={setFiltroFonte}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Fonte" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as fontes</SelectItem>
              <SelectItem value="datajud">DATAJUD</SelectItem>
              <SelectItem value="escavador">Escavador</SelectItem>
              <SelectItem value="jusbrasil">JusBrasil</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filtroTratada} onValueChange={setFiltroTratada}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              <SelectItem value="pendentes">Pendentes</SelectItem>
              <SelectItem value="tratadas">Tratadas</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="ghost" size="sm" onClick={() => { listQuery.refetch(); statsQuery.refetch(); }}>
          <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
        </Button>
      </div>

      {/* Lista de Publicações - Fila de Urgência */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Fila de Publicações
            <Badge variant="secondary">{publicacoesList.length}</Badge>
          </CardTitle>
          <CardDescription>Ordenação: Não tratadas primeiro, depois por urgência (crítico &gt; urgente &gt; normal), depois por data (mais recentes primeiro)</CardDescription>
        </CardHeader>
        <CardContent>
          {listQuery.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : publicacoesList.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Bell className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>Nenhuma publicação encontrada.</p>
              <p className="text-sm mt-2">Use os botões acima para buscar publicações nas fontes disponíveis.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {publicacoesList.map((pub: any) => (
                <div
                  key={pub.id}
                  className={`border rounded-lg p-4 transition-colors ${
                    pub.tratada ? 'opacity-60 bg-muted/30' : pub.urgencia >= 2 ? 'border-red-500/50 bg-red-50/5' : pub.urgencia >= 1 ? 'border-amber-500/30' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {getUrgenciaBadge(pub.urgencia)}
                        {getFonteBadge(pub.fonte)}
                        {pub.tipoPublicacao && <Badge variant="outline">{pub.tipoPublicacao}</Badge>}
                        {pub.tratada ? (
                          <Badge className="bg-green-600 text-white gap-1"><CheckCircle className="w-3 h-3" /> Tratada</Badge>
                        ) : null}
                        {pub.prazoGerado ? <Badge variant="outline" className="gap-1"><Calendar className="w-3 h-3" /> Prazo gerado</Badge> : null}
                      </div>
                      <div className="text-sm">
                        {pub.numeroCnj && <span className="font-mono text-xs mr-2">{pub.numeroCnj}</span>}
                        <span className="text-muted-foreground">
                          {new Date(pub.dataPublicacao).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-sm line-clamp-3">{pub.conteudo || pub.resumo || 'Sem conteúdo'}</p>
                      {pub.diarioOficial && <p className="text-xs text-muted-foreground">Diário: {pub.diarioOficial} {pub.caderno && `| Caderno: ${pub.caderno}`} {pub.pagina && `| Pág: ${pub.pagina}`}</p>}
                      {pub.tratadaPor && <p className="text-xs text-muted-foreground">Tratada por: {pub.tratadaPor} em {pub.tratadaEm ? new Date(pub.tratadaEm).toLocaleDateString('pt-BR') : ''}</p>}
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      {!pub.tratada && (
                        <>
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button size="sm" onClick={() => setSelectedPub(pub)}>
                                <CheckCircle className="w-4 h-4 mr-1" /> Tratar
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Marcar como Tratada</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div>
                                  <p className="text-sm font-medium mb-1">Publicação:</p>
                                  <p className="text-sm text-muted-foreground">{pub.conteudo?.substring(0, 200) || pub.resumo}</p>
                                </div>
                                <Textarea
                                  placeholder="Observações (opcional)..."
                                  value={observacoes}
                                  onChange={(e) => setObservacoes(e.target.value)}
                                  rows={3}
                                />
                              </div>
                              <DialogFooter>
                                <Button
                                  onClick={() => marcarTratada.mutate({ id: pub.id, observacoes })}
                                  disabled={marcarTratada.isPending}
                                >
                                  {marcarTratada.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                                  Confirmar
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>

                          {!pub.prazoGerado && (
                            <Dialog open={showPrazoDialog && selectedPub?.id === pub.id} onOpenChange={(open) => { setShowPrazoDialog(open); if (open) setSelectedPub(pub); }}>
                              <DialogTrigger asChild>
                                <Button size="sm" variant="outline" onClick={() => { setSelectedPub(pub); setShowPrazoDialog(true); }}>
                                  <Calendar className="w-4 h-4 mr-1" /> Gerar Prazo
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Gerar Prazo Processual</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4">
                                  <div>
                                    <label className="text-sm font-medium">Tipo de Prazo</label>
                                    <Select value={prazoData.tipoPrazo} onValueChange={(v) => setPrazoData(p => ({ ...p, tipoPrazo: v }))}>
                                      <SelectTrigger>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="recurso">Recurso</SelectItem>
                                        <SelectItem value="contestacao">Contestação</SelectItem>
                                        <SelectItem value="manifestacao">Manifestação</SelectItem>
                                        <SelectItem value="cumprimento">Cumprimento</SelectItem>
                                        <SelectItem value="audiencia">Audiência</SelectItem>
                                        <SelectItem value="diligencia">Diligência</SelectItem>
                                        <SelectItem value="pagamento">Pagamento</SelectItem>
                                        <SelectItem value="outro">Outro</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div>
                                    <label className="text-sm font-medium">Dias para Vencimento</label>
                                    <Input
                                      type="number"
                                      value={prazoData.diasPrazo}
                                      onChange={(e) => setPrazoData(p => ({ ...p, diasPrazo: Number(e.target.value) }))}
                                    />
                                  </div>
                                  <div>
                                    <label className="text-sm font-medium">Descrição</label>
                                    <Textarea
                                      value={prazoData.descricao}
                                      onChange={(e) => setPrazoData(p => ({ ...p, descricao: e.target.value }))}
                                      placeholder="Descrição do prazo..."
                                      rows={2}
                                    />
                                  </div>
                                </div>
                                <DialogFooter>
                                  <Button
                                    onClick={() => gerarPrazo.mutate({
                                      publicacaoId: pub.id,
                                      tipoPrazo: prazoData.tipoPrazo,
                                      diasPrazo: prazoData.diasPrazo,
                                      descricao: prazoData.descricao,
                                    })}
                                    disabled={gerarPrazo.isPending}
                                  >
                                    {gerarPrazo.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                                    Gerar Prazo
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                          )}
                        </>
                      )}
                    </div>
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
