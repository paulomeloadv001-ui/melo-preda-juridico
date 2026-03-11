import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  ShieldCheck, UserPlus, Clock, CheckCircle, XCircle,
  Users, Search, Filter, Eye, Trash2, Mail, Phone
} from "lucide-react";

// ==================== FORMULÁRIO PÚBLICO DE SOLICITAÇÃO ====================
export function SolicitarAcesso() {
  const [form, setForm] = useState({
    nomeCompleto: "",
    cpf: "",
    email: "",
    celular: "",
    motivo: "",
  });
  const [enviado, setEnviado] = useState(false);

  const solicitar = trpc.acessos.solicitar.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      setEnviado(true);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  function formatCPF(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }

  function formatCelular(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 2) return `(${digits}`;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }

  if (enviado) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Solicitação Enviada!</h2>
            <p className="text-muted-foreground">
              Sua solicitação de acesso foi enviada com sucesso. O administrador irá analisar e aprovar seu acesso em breve.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center">
            <ShieldCheck className="h-6 w-6 text-amber-700" />
          </div>
          <CardTitle className="text-xl">Solicitar Acesso</CardTitle>
          <CardDescription>
            Melo & Preda Advogados — Sistema Jurídico Integrado
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              solicitar.mutate(form);
            }}
            className="space-y-4"
          >
            <div>
              <label className="text-sm font-medium mb-1 block">Nome Completo *</label>
              <Input
                placeholder="Seu nome completo"
                value={form.nomeCompleto}
                onChange={(e) => setForm({ ...form, nomeCompleto: e.target.value })}
                required
                minLength={3}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">CPF *</label>
              <Input
                placeholder="000.000.000-00"
                value={form.cpf}
                onChange={(e) => setForm({ ...form, cpf: formatCPF(e.target.value) })}
                required
                maxLength={14}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Email *</label>
              <Input
                type="email"
                placeholder="seu@email.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Celular *</label>
              <Input
                placeholder="(62) 99999-9999"
                value={form.celular}
                onChange={(e) => setForm({ ...form, celular: formatCelular(e.target.value) })}
                required
                maxLength={15}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Motivo (opcional)</label>
              <Textarea
                placeholder="Descreva brevemente o motivo da solicitação de acesso..."
                value={form.motivo}
                onChange={(e) => setForm({ ...form, motivo: e.target.value })}
                rows={3}
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-amber-700 hover:bg-amber-800"
              disabled={solicitar.isPending}
            >
              {solicitar.isPending ? (
                <span className="flex items-center gap-2">
                  <Clock className="h-4 w-4 animate-spin" /> Enviando...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4" /> Enviar Solicitação
                </span>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ==================== PAINEL DE GESTÃO DE ACESSOS (ADMIN) ====================
export default function GestaoAcessos() {
  const { user } = useAuth();
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "pendente" | "aprovado" | "rejeitado">("todos");
  const [abaAtiva, setAbaAtiva] = useState<"solicitacoes" | "usuarios">("solicitacoes");
  const [observacoes, setObservacoes] = useState<Record<number, string>>({});

  const { data: solicitacoes, isLoading: loadingSol, refetch: refetchSol } = trpc.acessos.listar.useQuery(
    { status: filtroStatus },
    { refetchInterval: 10000 }
  );
  const { data: pendentes } = trpc.acessos.contarPendentes.useQuery(undefined, { refetchInterval: 10000 });
  const { data: usuarios, isLoading: loadingUsers, refetch: refetchUsers } = trpc.acessos.listarUsuarios.useQuery();

  const aprovar = trpc.acessos.aprovar.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      refetchSol();
    },
    onError: (err) => toast.error(err.message),
  });

  const rejeitar = trpc.acessos.rejeitar.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      refetchSol();
    },
    onError: (err) => toast.error(err.message),
  });

  const excluir = trpc.acessos.excluir.useMutation({
    onSuccess: () => {
      toast.success("Solicitação excluída");
      refetchSol();
    },
    onError: (err) => toast.error(err.message),
  });

  const atualizarPerfil = trpc.acessos.atualizarPerfil.useMutation({
    onSuccess: () => {
      toast.success("Perfil atualizado");
      refetchUsers();
    },
    onError: (err) => toast.error(err.message),
  });

  const statusBadge = (status: string) => {
    switch (status) {
      case "pendente": return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">Pendente</Badge>;
      case "aprovado": return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">Aprovado</Badge>;
      case "rejeitado": return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">Rejeitado</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-amber-700" />
            Gestão de Acessos
          </h1>
          <p className="text-muted-foreground mt-1">
            Gerencie solicitações de acesso e usuários do sistema
          </p>
        </div>
        {pendentes && pendentes.count > 0 && (
          <Badge className="bg-amber-600 text-white text-sm px-3 py-1">
            {pendentes.count} pendente{pendentes.count > 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {/* Abas */}
      <div className="flex gap-2 border-b pb-2">
        <Button
          variant={abaAtiva === "solicitacoes" ? "default" : "ghost"}
          size="sm"
          onClick={() => setAbaAtiva("solicitacoes")}
          className={abaAtiva === "solicitacoes" ? "bg-amber-700 hover:bg-amber-800" : ""}
        >
          <UserPlus className="h-4 w-4 mr-1" />
          Solicitações
          {pendentes && pendentes.count > 0 && (
            <span className="ml-1 bg-white text-amber-700 rounded-full px-1.5 text-xs font-bold">
              {pendentes.count}
            </span>
          )}
        </Button>
        <Button
          variant={abaAtiva === "usuarios" ? "default" : "ghost"}
          size="sm"
          onClick={() => setAbaAtiva("usuarios")}
          className={abaAtiva === "usuarios" ? "bg-amber-700 hover:bg-amber-800" : ""}
        >
          <Users className="h-4 w-4 mr-1" />
          Usuários do Sistema
        </Button>
      </div>

      {/* Aba Solicitações */}
      {abaAtiva === "solicitacoes" && (
        <div className="space-y-4">
          {/* Filtros */}
          <div className="flex gap-2 flex-wrap">
            {(["todos", "pendente", "aprovado", "rejeitado"] as const).map((s) => (
              <Button
                key={s}
                variant={filtroStatus === s ? "default" : "outline"}
                size="sm"
                onClick={() => setFiltroStatus(s)}
                className={filtroStatus === s ? "bg-amber-700 hover:bg-amber-800" : ""}
              >
                {s === "todos" ? "Todos" : s.charAt(0).toUpperCase() + s.slice(1)}
              </Button>
            ))}
          </div>

          {loadingSol ? (
            <div className="text-center py-8 text-muted-foreground">Carregando solicitações...</div>
          ) : !solicitacoes || solicitacoes.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Nenhuma solicitação {filtroStatus !== "todos" ? filtroStatus : ""} encontrada.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {solicitacoes.map((sol: any) => (
                <Card key={sol.id} className={sol.status === "pendente" ? "border-amber-300 bg-amber-50/30" : ""}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-lg">{sol.nomeCompleto}</h3>
                          {statusBadge(sol.status)}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <span className="font-medium">CPF:</span> {sol.cpf}
                          </div>
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Mail className="h-3.5 w-3.5" /> {sol.email}
                          </div>
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Phone className="h-3.5 w-3.5" /> {sol.celular}
                          </div>
                          <div className="text-muted-foreground">
                            <span className="font-medium">Data:</span>{" "}
                            {new Date(sol.createdAt).toLocaleDateString("pt-BR")} {new Date(sol.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>
                        {sol.motivo && (
                          <p className="text-sm bg-muted/50 p-2 rounded mt-1">
                            <span className="font-medium">Motivo:</span> {sol.motivo}
                          </p>
                        )}
                        {sol.observacoesAdmin && (
                          <p className="text-sm text-muted-foreground italic">
                            Obs. admin: {sol.observacoesAdmin}
                          </p>
                        )}
                      </div>

                      {sol.status === "pendente" && (
                        <div className="flex flex-col gap-2 min-w-[140px]">
                          <Input
                            placeholder="Observações..."
                            value={observacoes[sol.id] || ""}
                            onChange={(e) => setObservacoes({ ...observacoes, [sol.id]: e.target.value })}
                            className="text-xs"
                          />
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => aprovar.mutate({ id: sol.id, observacoes: observacoes[sol.id] })}
                            disabled={aprovar.isPending}
                          >
                            <CheckCircle className="h-3.5 w-3.5 mr-1" /> Aprovar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-300 text-red-600 hover:bg-red-50"
                            onClick={() => rejeitar.mutate({ id: sol.id, observacoes: observacoes[sol.id] })}
                            disabled={rejeitar.isPending}
                          >
                            <XCircle className="h-3.5 w-3.5 mr-1" /> Rejeitar
                          </Button>
                        </div>
                      )}

                      {sol.status !== "pendente" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-500 hover:text-red-700"
                          onClick={() => {
                            if (confirm("Excluir esta solicitação?")) {
                              excluir.mutate({ id: sol.id });
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Aba Usuários */}
      {abaAtiva === "usuarios" && (
        <div className="space-y-4">
          {loadingUsers ? (
            <div className="text-center py-8 text-muted-foreground">Carregando usuários...</div>
          ) : !usuarios || usuarios.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Nenhum usuário cadastrado no sistema.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {usuarios.map((u: any) => (
                <Card key={u.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{u.name || "Sem nome"}</h3>
                          <Badge variant="outline" className={u.role === "admin" ? "bg-amber-50 text-amber-700 border-amber-300" : ""}>
                            {u.role === "admin" ? "Administrador" : "Usuário"}
                          </Badge>
                          {u.ativo === 0 && (
                            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">Inativo</Badge>
                          )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-sm text-muted-foreground">
                          <div><Mail className="h-3.5 w-3.5 inline mr-1" />{u.email || "—"}</div>
                          <div><Phone className="h-3.5 w-3.5 inline mr-1" />{u.celular || "—"}</div>
                          <div>CPF: {u.cpf || "—"}</div>
                          <div>OAB: {u.oab || "—"}</div>
                          <div>Cargo: {u.cargo || "—"}</div>
                          <div>Último acesso: {u.lastSignedIn ? new Date(u.lastSignedIn).toLocaleDateString("pt-BR") : "—"}</div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {u.role !== "admin" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-amber-700 border-amber-300 hover:bg-amber-50"
                            onClick={() => atualizarPerfil.mutate({ userId: u.id, role: "admin" })}
                          >
                            Promover Admin
                          </Button>
                        )}
                        {u.role === "admin" && u.id !== user?.id && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => atualizarPerfil.mutate({ userId: u.id, role: "user" })}
                          >
                            Remover Admin
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant={u.ativo === 0 ? "default" : "outline"}
                          className={u.ativo === 0 ? "bg-green-600 hover:bg-green-700" : "text-red-600 border-red-300 hover:bg-red-50"}
                          onClick={() => atualizarPerfil.mutate({ userId: u.id, ativo: u.ativo === 0 ? 1 : 0 })}
                        >
                          {u.ativo === 0 ? "Ativar" : "Desativar"}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
