import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  ShieldCheck, UserPlus, Clock, CheckCircle, XCircle,
  Users, Search, Trash2, Mail, Phone, Shield, Key,
  Link2, Copy, History, AlertTriangle, Eye, Edit, Download,
  RefreshCw, ChevronDown, ChevronUp, UserCog, Send, Crown,
  GraduationCap, Scale, ClipboardList, Banknote, Plus, Save, Palette
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
              <Input placeholder="Seu nome completo" value={form.nomeCompleto}
                onChange={(e) => setForm({ ...form, nomeCompleto: e.target.value })} required minLength={3} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">CPF *</label>
              <Input placeholder="000.000.000-00" value={form.cpf}
                onChange={(e) => setForm({ ...form, cpf: formatCPF(e.target.value) })} required maxLength={14} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Email *</label>
              <Input type="email" placeholder="seu@email.com" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Celular *</label>
              <Input placeholder="(62) 99999-9999" value={form.celular}
                onChange={(e) => setForm({ ...form, celular: formatCelular(e.target.value) })} required maxLength={15} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Motivo (opcional)</label>
              <Textarea placeholder="Descreva brevemente o motivo..." value={form.motivo}
                onChange={(e) => setForm({ ...form, motivo: e.target.value })} rows={3} />
            </div>
            <Button type="submit" className="w-full bg-amber-700 hover:bg-amber-800" disabled={solicitar.isPending}>
              {solicitar.isPending ? (
                <span className="flex items-center gap-2"><Clock className="h-4 w-4 animate-spin" /> Enviando...</span>
              ) : (
                <span className="flex items-center gap-2"><UserPlus className="h-4 w-4" /> Enviar Solicitação</span>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ==================== PAINEL DE GESTÃO DE ACESSOS (ADMIN) ====================
type AbaType = "solicitacoes" | "usuarios" | "permissoes" | "perfis" | "convites" | "auditoria";

export default function GestaoAcessos() {
  const { user } = useAuth();
  const [abaAtiva, setAbaAtiva] = useState<AbaType>("solicitacoes");

  const abas: { id: AbaType; label: string; icon: React.ReactNode }[] = [
    { id: "solicitacoes", label: "Solicitações", icon: <UserPlus className="h-4 w-4" /> },
    { id: "usuarios", label: "Usuários", icon: <Users className="h-4 w-4" /> },
    { id: "permissoes", label: "Permissões", icon: <Shield className="h-4 w-4" /> },
    { id: "perfis", label: "Perfis de Acesso", icon: <Crown className="h-4 w-4" /> },
    { id: "convites", label: "Convites", icon: <Send className="h-4 w-4" /> },
    { id: "auditoria", label: "Auditoria", icon: <History className="h-4 w-4" /> },
  ];

  const { data: pendentes } = trpc.acessos.contarPendentes.useQuery(undefined, { refetchInterval: 10000 });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-amber-700" />
            Gestão de Acessos
          </h1>
          <p className="text-muted-foreground mt-1">
            Gerencie usuários, permissões, convites e auditoria do sistema
          </p>
        </div>
        {pendentes && pendentes.count > 0 && (
          <Badge className="bg-amber-600 text-white text-sm px-3 py-1">
            {pendentes.count} pendente{pendentes.count > 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {/* Abas */}
      <div className="flex gap-1 border-b pb-0 overflow-x-auto">
        {abas.map((aba) => (
          <button
            key={aba.id}
            onClick={() => setAbaAtiva(aba.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              abaAtiva === aba.id
                ? "border-amber-700 text-amber-700"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
            }`}
          >
            {aba.icon}
            {aba.label}
            {aba.id === "solicitacoes" && pendentes && pendentes.count > 0 && (
              <span className="ml-1 bg-amber-600 text-white rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none">
                {pendentes.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Conteúdo das abas */}
      {abaAtiva === "solicitacoes" && <TabSolicitacoes />}
      {abaAtiva === "usuarios" && <TabUsuarios currentUserId={user?.id} />}
      {abaAtiva === "permissoes" && <TabPermissoes />}
      {abaAtiva === "perfis" && <TabPerfis />}
      {abaAtiva === "convites" && <TabConvites />}
      {abaAtiva === "auditoria" && <TabAuditoria />}
    </div>
  );
}

// ==================== ABA: SOLICITAÇÕES ====================
function TabSolicitacoes() {
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "pendente" | "aprovado" | "rejeitado">("todos");
  const [observacoes, setObservacoes] = useState<Record<number, string>>({});

  const { data: solicitacoes, isLoading, refetch } = trpc.acessos.listar.useQuery(
    { status: filtroStatus },
    { refetchInterval: 10000 }
  );

  const aprovar = trpc.acessos.aprovar.useMutation({
    onSuccess: (data) => { toast.success(data.message); refetch(); },
    onError: (err) => toast.error(err.message),
  });
  const rejeitar = trpc.acessos.rejeitar.useMutation({
    onSuccess: (data) => { toast.success(data.message); refetch(); },
    onError: (err) => toast.error(err.message),
  });
  const excluir = trpc.acessos.excluir.useMutation({
    onSuccess: () => { toast.success("Solicitação excluída"); refetch(); },
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
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {(["todos", "pendente", "aprovado", "rejeitado"] as const).map((s) => (
          <Button key={s} variant={filtroStatus === s ? "default" : "outline"} size="sm"
            onClick={() => setFiltroStatus(s)}
            className={filtroStatus === s ? "bg-amber-700 hover:bg-amber-800" : ""}>
            {s === "todos" ? "Todos" : s.charAt(0).toUpperCase() + s.slice(1)}
          </Button>
        ))}
        <Button size="sm" variant="ghost" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando solicitações...</div>
      ) : !solicitacoes || solicitacoes.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">
          Nenhuma solicitação {filtroStatus !== "todos" ? filtroStatus : ""} encontrada.
        </CardContent></Card>
      ) : (
        <div className="grid gap-3">
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
                      <p className="text-sm bg-muted/50 p-2 rounded"><span className="font-medium">Motivo:</span> {sol.motivo}</p>
                    )}
                    {sol.observacoesAdmin && (
                      <p className="text-sm text-muted-foreground italic">Obs. admin: {sol.observacoesAdmin}</p>
                    )}
                  </div>
                  {sol.status === "pendente" && (
                    <div className="flex flex-col gap-2 min-w-[140px]">
                      <Input placeholder="Observações..." value={observacoes[sol.id] || ""}
                        onChange={(e) => setObservacoes({ ...observacoes, [sol.id]: e.target.value })} className="text-xs" />
                      <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => aprovar.mutate({ id: sol.id, observacoes: observacoes[sol.id] })} disabled={aprovar.isPending}>
                        <CheckCircle className="h-3.5 w-3.5 mr-1" /> Aprovar
                      </Button>
                      <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50"
                        onClick={() => rejeitar.mutate({ id: sol.id, observacoes: observacoes[sol.id] })} disabled={rejeitar.isPending}>
                        <XCircle className="h-3.5 w-3.5 mr-1" /> Rejeitar
                      </Button>
                    </div>
                  )}
                  {sol.status !== "pendente" && (
                    <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700"
                      onClick={() => { if (confirm("Excluir esta solicitação?")) excluir.mutate({ id: sol.id }); }}>
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
  );
}

// ==================== ABA: USUÁRIOS ====================
function TabUsuarios({ currentUserId }: { currentUserId?: number }) {
  const { data: usuarios, isLoading, refetch } = trpc.acessos.listarUsuarios.useQuery();
  const [editando, setEditando] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  const atualizarPerfil = trpc.acessos.atualizarPerfil.useMutation({
    onSuccess: () => { toast.success("Perfil atualizado"); refetch(); setEditando(null); },
    onError: (err) => toast.error(err.message),
  });
  const desativar = trpc.acessos.desativarUsuario.useMutation({
    onSuccess: () => { toast.success("Usuário desativado"); refetch(); },
    onError: (err) => toast.error(err.message),
  });
  const reativar = trpc.acessos.reativarUsuario.useMutation({
    onSuccess: () => { toast.success("Usuário reativado"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) return <div className="text-center py-8 text-muted-foreground">Carregando usuários...</div>;
  if (!usuarios || usuarios.length === 0) return (
    <Card><CardContent className="py-8 text-center text-muted-foreground">Nenhum usuário cadastrado.</CardContent></Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{usuarios.length} usuário(s) no sistema</p>
        <Button size="sm" variant="ghost" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
        </Button>
      </div>
      <div className="grid gap-3">
        {usuarios.map((u: any) => (
          <Card key={u.id} className={u.ativo === 0 ? "opacity-60" : ""}>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold">{u.name || "Sem nome"}</h3>
                    <Badge variant="outline" className={u.role === "admin" ? "bg-amber-50 text-amber-700 border-amber-300" : "bg-blue-50 text-blue-700 border-blue-300"}>
                      {u.role === "admin" ? "Administrador" : "Usuário"}
                    </Badge>
                    {u.ativo === 0 && <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">Inativo</Badge>}
                    {u.id === currentUserId && <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">Você</Badge>}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 text-sm text-muted-foreground">
                    <div><Mail className="h-3.5 w-3.5 inline mr-1" />{u.email || "—"}</div>
                    <div><Phone className="h-3.5 w-3.5 inline mr-1" />{u.celular || "—"}</div>
                    <div>CPF: {u.cpf || "—"}</div>
                    <div>OAB: {u.oab || "—"}</div>
                    <div>Cargo: {u.cargo || "—"}</div>
                    <div>Último acesso: {u.lastSignedIn ? new Date(u.lastSignedIn).toLocaleDateString("pt-BR") : "—"}</div>
                  </div>
                  {u.permissoes && u.permissoes.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {u.permissoes.map((p: any) => (
                        <Badge key={p.id} variant="secondary" className="text-[10px]">
                          {p.modulo}: {p.podeEditar ? "Editar" : "Ver"}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* Formulário de edição inline */}
                  {editando === u.id && (
                    <div className="mt-3 p-3 bg-muted/50 rounded-lg space-y-3">
                      <h4 className="text-sm font-semibold flex items-center gap-1"><Edit className="h-3.5 w-3.5" /> Editar Perfil</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-muted-foreground">CPF</label>
                          <Input size={1} value={editForm.cpf || ""} onChange={(e) => setEditForm({ ...editForm, cpf: e.target.value })} placeholder="CPF" className="h-8 text-sm" />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">Celular</label>
                          <Input size={1} value={editForm.celular || ""} onChange={(e) => setEditForm({ ...editForm, celular: e.target.value })} placeholder="Celular" className="h-8 text-sm" />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">Cargo</label>
                          <Input size={1} value={editForm.cargo || ""} onChange={(e) => setEditForm({ ...editForm, cargo: e.target.value })} placeholder="Cargo" className="h-8 text-sm" />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">OAB</label>
                          <Input size={1} value={editForm.oab || ""} onChange={(e) => setEditForm({ ...editForm, oab: e.target.value })} placeholder="OAB" className="h-8 text-sm" />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" className="bg-amber-700 hover:bg-amber-800"
                          onClick={() => atualizarPerfil.mutate({ userId: u.id, ...editForm })} disabled={atualizarPerfil.isPending}>
                          <CheckCircle className="h-3.5 w-3.5 mr-1" /> Salvar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1.5 min-w-[120px]">
                  <Button size="sm" variant="outline" className="text-xs"
                    onClick={() => { setEditando(editando === u.id ? null : u.id); setEditForm({ cpf: u.cpf || "", celular: u.celular || "", cargo: u.cargo || "", oab: u.oab || "" }); }}>
                    <Edit className="h-3 w-3 mr-1" /> {editando === u.id ? "Fechar" : "Editar"}
                  </Button>
                  {u.role !== "admin" && (
                    <Button size="sm" variant="outline" className="text-xs text-amber-700 border-amber-300 hover:bg-amber-50"
                      onClick={() => atualizarPerfil.mutate({ userId: u.id, role: "admin" })}>
                      <Shield className="h-3 w-3 mr-1" /> Promover
                    </Button>
                  )}
                  {u.role === "admin" && u.id !== currentUserId && (
                    <Button size="sm" variant="outline" className="text-xs"
                      onClick={() => atualizarPerfil.mutate({ userId: u.id, role: "user" })}>
                      Rebaixar
                    </Button>
                  )}
                  {u.id !== currentUserId && (
                    u.ativo === 0 ? (
                      <Button size="sm" className="text-xs bg-green-600 hover:bg-green-700"
                        onClick={() => reativar.mutate({ userId: u.id })}>
                        Reativar
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="text-xs text-red-600 border-red-300 hover:bg-red-50"
                        onClick={() => { if (confirm(`Desativar ${u.name}?`)) desativar.mutate({ userId: u.id }); }}>
                        Desativar
                      </Button>
                    )
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ==================== ABA: PERMISSÕES ====================
function TabPermissoes() {
  const { data: usuarios } = trpc.acessos.listarUsuarios.useQuery();
  const { data: modulos } = trpc.acessos.modulosDisponiveis.useQuery();
  const [selectedUser, setSelectedUser] = useState<number | null>(null);
  const { data: permsUser, refetch: refetchPerms } = trpc.acessos.listarPermissoes.useQuery(
    { userId: selectedUser! },
    { enabled: !!selectedUser }
  );

  const definirLote = trpc.acessos.definirPermissoesLote.useMutation({
    onSuccess: () => { toast.success("Permissões salvas com sucesso"); refetchPerms(); },
    onError: (err) => toast.error(err.message),
  });

  const [localPerms, setLocalPerms] = useState<Record<string, { podeVisualizar: number; podeEditar: number; podeExcluir: number; podeExportar: number }>>({});

  // Sincronizar permissões locais quando mudam
  const permsMap = useMemo(() => {
    const map: Record<string, any> = {};
    if (permsUser) {
      for (const p of permsUser) {
        map[p.modulo] = { podeVisualizar: p.podeVisualizar, podeEditar: p.podeEditar, podeExcluir: p.podeExcluir, podeExportar: p.podeExportar };
      }
    }
    return map;
  }, [permsUser]);

  const selectedUserData = usuarios?.find((u: any) => u.id === selectedUser);

  function togglePerm(modulo: string, campo: string) {
    const current = localPerms[modulo] || permsMap[modulo] || { podeVisualizar: 0, podeEditar: 0, podeExcluir: 0, podeExportar: 0 };
    setLocalPerms({
      ...localPerms,
      [modulo]: { ...current, [campo]: current[campo as keyof typeof current] ? 0 : 1 },
    });
  }

  function getPerm(modulo: string, campo: string) {
    const local = localPerms[modulo];
    if (local) return local[campo as keyof typeof local];
    const saved = permsMap[modulo];
    if (saved) return saved[campo as keyof typeof saved];
    return 0;
  }

  function salvarPermissoes() {
    if (!selectedUser || !modulos) return;
    const permissoes = modulos.map((m: any) => ({
      modulo: m.id,
      podeVisualizar: getPerm(m.id, "podeVisualizar") as number,
      podeEditar: getPerm(m.id, "podeEditar") as number,
      podeExcluir: getPerm(m.id, "podeExcluir") as number,
      podeExportar: getPerm(m.id, "podeExportar") as number,
    }));
    definirLote.mutate({ userId: selectedUser, permissoes });
  }

  function marcarTodos(campo: string, valor: number) {
    if (!modulos) return;
    const newPerms = { ...localPerms };
    for (const m of modulos) {
      const current = newPerms[m.id] || permsMap[m.id] || { podeVisualizar: 0, podeEditar: 0, podeExcluir: 0, podeExportar: 0 };
      newPerms[m.id] = { ...current, [campo]: valor };
    }
    setLocalPerms(newPerms);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4 text-amber-700" /> Permissões Granulares por Módulo
          </CardTitle>
          <CardDescription>Selecione um usuário para configurar suas permissões de acesso a cada módulo do sistema.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 items-end flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium mb-1 block">Usuário</label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                value={selectedUser || ""}
                onChange={(e) => { setSelectedUser(Number(e.target.value) || null); setLocalPerms({}); }}
              >
                <option value="">Selecione um usuário...</option>
                {usuarios?.map((u: any) => (
                  <option key={u.id} value={u.id}>{u.name || u.email || `ID ${u.id}`} {u.role === "admin" ? "(Admin)" : "(Usuário)"} {u.ativo === 0 ? "- Inativo" : ""}</option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedUser && selectedUserData && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Permissões de {selectedUserData.name || "Usuário"}
              </CardTitle>
              <div className="flex gap-2 flex-wrap">
                <AplicarPerfilDropdown userId={selectedUser} onApplied={() => { refetchPerms(); setLocalPerms({}); }} />
                <Button size="sm" variant="outline" onClick={() => marcarTodos("podeVisualizar", 1)} className="text-xs">
                  <Eye className="h-3 w-3 mr-1" /> Liberar Visualização
                </Button>
                <Button size="sm" className="bg-amber-700 hover:bg-amber-800 text-xs"
                  onClick={salvarPermissoes} disabled={definirLote.isPending}>
                  <CheckCircle className="h-3 w-3 mr-1" /> Salvar Permissões
                </Button>
              </div>
            </div>
            <CardDescription>
              Administradores possuem acesso total automaticamente. Configure permissões apenas para usuários comuns.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 font-medium">Módulo</th>
                    <th className="text-center py-2 px-2 font-medium w-24">
                      <div className="flex flex-col items-center"><Eye className="h-3.5 w-3.5 mb-0.5" /><span className="text-[10px]">Visualizar</span></div>
                    </th>
                    <th className="text-center py-2 px-2 font-medium w-24">
                      <div className="flex flex-col items-center"><Edit className="h-3.5 w-3.5 mb-0.5" /><span className="text-[10px]">Editar</span></div>
                    </th>
                    <th className="text-center py-2 px-2 font-medium w-24">
                      <div className="flex flex-col items-center"><Trash2 className="h-3.5 w-3.5 mb-0.5" /><span className="text-[10px]">Excluir</span></div>
                    </th>
                    <th className="text-center py-2 px-2 font-medium w-24">
                      <div className="flex flex-col items-center"><Download className="h-3.5 w-3.5 mb-0.5" /><span className="text-[10px]">Exportar</span></div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {modulos?.map((m: any) => (
                    <tr key={m.id} className="border-b hover:bg-muted/30">
                      <td className="py-2 px-2">
                        <div className="font-medium">{m.nome}</div>
                        <div className="text-[11px] text-muted-foreground">{m.descricao}</div>
                      </td>
                      <td className="text-center py-2 px-2">
                        <Switch checked={!!getPerm(m.id, "podeVisualizar")} onCheckedChange={() => togglePerm(m.id, "podeVisualizar")} />
                      </td>
                      <td className="text-center py-2 px-2">
                        <Switch checked={!!getPerm(m.id, "podeEditar")} onCheckedChange={() => togglePerm(m.id, "podeEditar")} />
                      </td>
                      <td className="text-center py-2 px-2">
                        <Switch checked={!!getPerm(m.id, "podeExcluir")} onCheckedChange={() => togglePerm(m.id, "podeExcluir")} />
                      </td>
                      <td className="text-center py-2 px-2">
                        <Switch checked={!!getPerm(m.id, "podeExportar")} onCheckedChange={() => togglePerm(m.id, "podeExportar")} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ==================== COMPONENTE: APLICAR PERFIL DROPDOWN ====================
function AplicarPerfilDropdown({ userId, onApplied }: { userId: number; onApplied: () => void }) {
  const { data: perfis } = trpc.acessos.listarPerfis.useQuery();
  const aplicar = trpc.acessos.aplicarPerfil.useMutation({
    onSuccess: (data) => { toast.success(data.message); onApplied(); },
    onError: (err) => toast.error(err.message),
  });
  const [open, setOpen] = useState(false);

  const iconMap: Record<string, React.ReactNode> = {
    Crown: <Crown className="h-3.5 w-3.5" />,
    Scale: <Scale className="h-3.5 w-3.5" />,
    GraduationCap: <GraduationCap className="h-3.5 w-3.5" />,
    ClipboardList: <ClipboardList className="h-3.5 w-3.5" />,
    Banknote: <Banknote className="h-3.5 w-3.5" />,
    User: <UserCog className="h-3.5 w-3.5" />,
  };

  const corMap: Record<string, string> = {
    amber: "bg-amber-100 text-amber-800",
    blue: "bg-blue-100 text-blue-800",
    green: "bg-green-100 text-green-800",
    purple: "bg-purple-100 text-purple-800",
    emerald: "bg-emerald-100 text-emerald-800",
  };

  return (
    <div className="relative">
      <Button size="sm" variant="outline" className="text-xs" onClick={() => setOpen(!open)}>
        <Crown className="h-3 w-3 mr-1" /> Aplicar Perfil
        <ChevronDown className="h-3 w-3 ml-1" />
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-popover border rounded-md shadow-lg min-w-[240px] p-1">
          {perfis?.map((p: any) => (
            <button
              key={p.id}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted rounded-sm text-left"
              onClick={() => { aplicar.mutate({ userId, perfilId: p.id }); setOpen(false); }}
            >
              <span className={`p-1 rounded ${corMap[p.cor] || "bg-gray-100 text-gray-800"}`}>
                {iconMap[p.icone || "User"] || <UserCog className="h-3.5 w-3.5" />}
              </span>
              <div>
                <div className="font-medium">{p.nome}</div>
                <div className="text-[10px] text-muted-foreground">{p.descricao?.substring(0, 50)}</div>
              </div>
            </button>
          ))}
          {(!perfis || perfis.length === 0) && (
            <div className="px-3 py-2 text-sm text-muted-foreground">Nenhum perfil cadastrado</div>
          )}
        </div>
      )}
    </div>
  );
}

// ==================== ABA: PERFIS DE ACESSO ====================
function TabPerfis() {
  const { data: perfis, isLoading, refetch } = trpc.acessos.listarPerfis.useQuery();
  const { data: modulos } = trpc.acessos.modulosDisponiveis.useQuery();
  const [editando, setEditando] = useState<number | null>(null);
  const [criando, setCriando] = useState(false);
  const [form, setForm] = useState({ nome: "", descricao: "", cor: "blue", icone: "User" });
  const [permsEdit, setPermsEdit] = useState<Record<string, { podeVisualizar: number; podeEditar: number; podeExcluir: number; podeExportar: number }>>({});

  const criar = trpc.acessos.criarPerfil.useMutation({
    onSuccess: (data) => { toast.success(data.message); refetch(); setCriando(false); resetForm(); },
    onError: (err) => toast.error(err.message),
  });
  const editar = trpc.acessos.editarPerfil.useMutation({
    onSuccess: () => { toast.success("Perfil atualizado"); refetch(); setEditando(null); },
    onError: (err) => toast.error(err.message),
  });
  const excluir = trpc.acessos.excluirPerfil.useMutation({
    onSuccess: (data) => { toast.success(data.message); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const cores = [
    { id: "amber", label: "Dourado", cls: "bg-amber-500" },
    { id: "blue", label: "Azul", cls: "bg-blue-500" },
    { id: "green", label: "Verde", cls: "bg-green-500" },
    { id: "purple", label: "Roxo", cls: "bg-purple-500" },
    { id: "emerald", label: "Esmeralda", cls: "bg-emerald-500" },
    { id: "red", label: "Vermelho", cls: "bg-red-500" },
    { id: "slate", label: "Cinza", cls: "bg-slate-500" },
  ];

  const icones = [
    { id: "Crown", label: "Coroa", icon: <Crown className="h-4 w-4" /> },
    { id: "Scale", label: "Balança", icon: <Scale className="h-4 w-4" /> },
    { id: "GraduationCap", label: "Formatura", icon: <GraduationCap className="h-4 w-4" /> },
    { id: "ClipboardList", label: "Prancheta", icon: <ClipboardList className="h-4 w-4" /> },
    { id: "Banknote", label: "Dinheiro", icon: <Banknote className="h-4 w-4" /> },
    { id: "Shield", label: "Escudo", icon: <Shield className="h-4 w-4" /> },
    { id: "UserCog", label: "Usuário", icon: <UserCog className="h-4 w-4" /> },
  ];

  const iconMap: Record<string, React.ReactNode> = Object.fromEntries(icones.map(i => [i.id, i.icon]));
  const corMap: Record<string, string> = {
    amber: "bg-amber-100 text-amber-800 border-amber-300",
    blue: "bg-blue-100 text-blue-800 border-blue-300",
    green: "bg-green-100 text-green-800 border-green-300",
    purple: "bg-purple-100 text-purple-800 border-purple-300",
    emerald: "bg-emerald-100 text-emerald-800 border-emerald-300",
    red: "bg-red-100 text-red-800 border-red-300",
    slate: "bg-slate-100 text-slate-800 border-slate-300",
  };

  function resetForm() {
    setForm({ nome: "", descricao: "", cor: "blue", icone: "User" });
    setPermsEdit({});
  }

  function iniciarEdicao(perfil: any) {
    setEditando(perfil.id);
    setForm({ nome: perfil.nome, descricao: perfil.descricao || "", cor: perfil.cor || "blue", icone: perfil.icone || "User" });
    try {
      setPermsEdit(JSON.parse(perfil.permissoes));
    } catch {
      setPermsEdit({});
    }
  }

  function iniciarCriacao() {
    setCriando(true);
    resetForm();
    // Inicializar todas as permissões como desligadas
    if (modulos) {
      const p: Record<string, any> = {};
      for (const m of modulos) p[m.id] = { podeVisualizar: 0, podeEditar: 0, podeExcluir: 0, podeExportar: 0 };
      setPermsEdit(p);
    }
  }

  function togglePermEdit(modulo: string, campo: string) {
    const current = permsEdit[modulo] || { podeVisualizar: 0, podeEditar: 0, podeExcluir: 0, podeExportar: 0 };
    setPermsEdit({ ...permsEdit, [modulo]: { ...current, [campo]: current[campo as keyof typeof current] ? 0 : 1 } });
  }

  function salvarPerfil() {
    const permStr = JSON.stringify(permsEdit);
    if (editando) {
      editar.mutate({ id: editando, nome: form.nome, descricao: form.descricao, cor: form.cor, icone: form.icone, permissoes: permStr });
    } else {
      criar.mutate({ nome: form.nome, descricao: form.descricao, cor: form.cor, icone: form.icone, permissoes: permStr });
    }
  }

  function marcarTodosEdit(campo: string, valor: number) {
    if (!modulos) return;
    const newPerms = { ...permsEdit };
    for (const m of modulos) {
      const current = newPerms[m.id] || { podeVisualizar: 0, podeEditar: 0, podeExcluir: 0, podeExportar: 0 };
      newPerms[m.id] = { ...current, [campo]: valor };
    }
    setPermsEdit(newPerms);
  }

  function contarPermissoes(permsJson: string): { total: number; ativos: number } {
    try {
      const p = JSON.parse(permsJson);
      let total = 0, ativos = 0;
      for (const mod of Object.values(p) as any[]) {
        for (const v of Object.values(mod) as number[]) {
          total++;
          if (v) ativos++;
        }
      }
      return { total, ativos };
    } catch { return { total: 0, ativos: 0 }; }
  }

  const isEditing = editando !== null || criando;

  return (
    <div className="space-y-4">
      {/* Lista de perfis */}
      {!isEditing && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Crown className="h-5 w-5 text-amber-700" /> Perfis de Acesso
              </h3>
              <p className="text-sm text-muted-foreground">Templates de permissões reutilizáveis para configurar acessos rapidamente.</p>
            </div>
            <Button onClick={iniciarCriacao} className="bg-amber-700 hover:bg-amber-800">
              <Plus className="h-4 w-4 mr-1" /> Novo Perfil
            </Button>
          </div>

          {isLoading && <div className="text-center py-8 text-muted-foreground">Carregando perfis...</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {perfis?.map((perfil: any) => {
              const { total, ativos } = contarPermissoes(perfil.permissoes);
              const pct = total > 0 ? Math.round((ativos / total) * 100) : 0;
              return (
                <Card key={perfil.id} className="relative overflow-hidden">
                  <div className={`absolute top-0 left-0 right-0 h-1 ${cores.find(c => c.id === perfil.cor)?.cls || "bg-blue-500"}`} />
                  <CardHeader className="pb-2 pt-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`p-1.5 rounded ${corMap[perfil.cor] || "bg-gray-100 text-gray-800 border-gray-300"} border`}>
                          {iconMap[perfil.icone] || <UserCog className="h-4 w-4" />}
                        </span>
                        <div>
                          <CardTitle className="text-sm">{perfil.nome}</CardTitle>
                          {perfil.padrao === 1 && <Badge variant="outline" className="text-[9px] mt-0.5">Padrão</Badge>}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => iniciarEdicao(perfil)}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        {perfil.padrao !== 1 && (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                            onClick={() => { if (confirm(`Excluir perfil "${perfil.nome}"?`)) excluir.mutate({ id: perfil.id }); }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pb-3">
                    <p className="text-xs text-muted-foreground mb-3">{perfil.descricao || "Sem descrição"}</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${cores.find(c => c.id === perfil.cor)?.cls || "bg-blue-500"}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-medium text-muted-foreground">{ativos}/{total}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">{pct}% das permissões ativas</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Editor de perfil */}
      {isEditing && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                {editando ? <Edit className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {editando ? "Editar Perfil" : "Novo Perfil de Acesso"}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => { setEditando(null); setCriando(false); resetForm(); }}>
                <XCircle className="h-4 w-4 mr-1" /> Cancelar
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Dados do perfil */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Nome do Perfil *</label>
                <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Advogado Sênior" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Descrição</label>
                <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Breve descrição do perfil" />
              </div>
            </div>

            {/* Cor e Ícone */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block flex items-center gap-1"><Palette className="h-3.5 w-3.5" /> Cor</label>
                <div className="flex gap-2 flex-wrap">
                  {cores.map((c) => (
                    <button key={c.id} onClick={() => setForm({ ...form, cor: c.id })}
                      className={`w-8 h-8 rounded-full ${c.cls} border-2 transition-all ${
                        form.cor === c.id ? "border-foreground scale-110 ring-2 ring-offset-2 ring-foreground/20" : "border-transparent hover:scale-105"
                      }`} title={c.label} />
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Ícone</label>
                <div className="flex gap-2 flex-wrap">
                  {icones.map((i) => (
                    <button key={i.id} onClick={() => setForm({ ...form, icone: i.id })}
                      className={`p-2 rounded border transition-all ${
                        form.icone === i.id ? "border-amber-700 bg-amber-50 text-amber-800" : "border-muted hover:border-foreground/30"
                      }`} title={i.label}>
                      {i.icon}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Tabela de permissões */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Permissões por Módulo</label>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" className="text-[10px] h-6 px-2" onClick={() => marcarTodosEdit("podeVisualizar", 1)}>Todos Visualizar</Button>
                  <Button size="sm" variant="outline" className="text-[10px] h-6 px-2" onClick={() => marcarTodosEdit("podeEditar", 1)}>Todos Editar</Button>
                  <Button size="sm" variant="outline" className="text-[10px] h-6 px-2 text-red-600" onClick={() => {
                    if (modulos) {
                      const p: Record<string, any> = {};
                      for (const m of modulos) p[m.id] = { podeVisualizar: 0, podeEditar: 0, podeExcluir: 0, podeExportar: 0 };
                      setPermsEdit(p);
                    }
                  }}>Limpar Tudo</Button>
                </div>
              </div>
              <div className="overflow-x-auto border rounded-md">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left py-2 px-3 font-medium">Módulo</th>
                      <th className="text-center py-2 px-2 font-medium w-20"><div className="flex flex-col items-center"><Eye className="h-3 w-3 mb-0.5" /><span className="text-[9px]">Ver</span></div></th>
                      <th className="text-center py-2 px-2 font-medium w-20"><div className="flex flex-col items-center"><Edit className="h-3 w-3 mb-0.5" /><span className="text-[9px]">Editar</span></div></th>
                      <th className="text-center py-2 px-2 font-medium w-20"><div className="flex flex-col items-center"><Trash2 className="h-3 w-3 mb-0.5" /><span className="text-[9px]">Excluir</span></div></th>
                      <th className="text-center py-2 px-2 font-medium w-20"><div className="flex flex-col items-center"><Download className="h-3 w-3 mb-0.5" /><span className="text-[9px]">Exportar</span></div></th>
                    </tr>
                  </thead>
                  <tbody>
                    {modulos?.map((m: any) => (
                      <tr key={m.id} className="border-b hover:bg-muted/20">
                        <td className="py-1.5 px-3">
                          <div className="font-medium text-xs">{m.nome}</div>
                          <div className="text-[10px] text-muted-foreground">{m.descricao}</div>
                        </td>
                        <td className="text-center py-1.5 px-2"><Switch checked={!!(permsEdit[m.id]?.podeVisualizar)} onCheckedChange={() => togglePermEdit(m.id, "podeVisualizar")} /></td>
                        <td className="text-center py-1.5 px-2"><Switch checked={!!(permsEdit[m.id]?.podeEditar)} onCheckedChange={() => togglePermEdit(m.id, "podeEditar")} /></td>
                        <td className="text-center py-1.5 px-2"><Switch checked={!!(permsEdit[m.id]?.podeExcluir)} onCheckedChange={() => togglePermEdit(m.id, "podeExcluir")} /></td>
                        <td className="text-center py-1.5 px-2"><Switch checked={!!(permsEdit[m.id]?.podeExportar)} onCheckedChange={() => togglePermEdit(m.id, "podeExportar")} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setEditando(null); setCriando(false); resetForm(); }}>Cancelar</Button>
              <Button className="bg-amber-700 hover:bg-amber-800" onClick={salvarPerfil}
                disabled={!form.nome || criar.isPending || editar.isPending}>
                <Save className="h-4 w-4 mr-1" /> {editando ? "Salvar Alterações" : "Criar Perfil"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ==================== ABA: CONVITES ====================
function TabConvites() {
  const [showForm, setShowForm] = useState(false);
  const [formConvite, setFormConvite] = useState({ email: "", nome: "", role: "user" as "user" | "admin", diasValidade: 7 });

  const { data: convitesList, isLoading, refetch } = trpc.acessos.listarConvites.useQuery();
  const criarConvite = trpc.acessos.criarConvite.useMutation({
    onSuccess: (data) => {
      toast.success(`Convite criado! Token: ${data.token.substring(0, 12)}...`);
      refetch();
      setShowForm(false);
      setFormConvite({ email: "", nome: "", role: "user", diasValidade: 7 });
    },
    onError: (err) => toast.error(err.message),
  });
  const revogar = trpc.acessos.revogarConvite.useMutation({
    onSuccess: () => { toast.success("Convite revogado"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  function copiarLink(token: string) {
    const link = `${window.location.origin}/solicitar-acesso?convite=${token}`;
    navigator.clipboard.writeText(link);
    toast.success("Link copiado para a área de transferência!");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Crie convites para novos usuários acessarem o sistema.
        </p>
        <Button size="sm" className="bg-amber-700 hover:bg-amber-800" onClick={() => setShowForm(!showForm)}>
          <UserPlus className="h-4 w-4 mr-1" /> Novo Convite
        </Button>
      </div>

      {showForm && (
        <Card className="border-amber-300">
          <CardContent className="pt-4 space-y-3">
            <h4 className="font-semibold flex items-center gap-2"><Send className="h-4 w-4 text-amber-700" /> Criar Convite</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Email *</label>
                <Input placeholder="email@exemplo.com" value={formConvite.email}
                  onChange={(e) => setFormConvite({ ...formConvite, email: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Nome</label>
                <Input placeholder="Nome do convidado" value={formConvite.nome}
                  onChange={(e) => setFormConvite({ ...formConvite, nome: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Papel</label>
                <select className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                  value={formConvite.role} onChange={(e) => setFormConvite({ ...formConvite, role: e.target.value as "user" | "admin" })}>
                  <option value="user">Usuário</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Validade (dias)</label>
                <Input type="number" min={1} max={90} value={formConvite.diasValidade}
                  onChange={(e) => setFormConvite({ ...formConvite, diasValidade: Number(e.target.value) })} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="bg-amber-700 hover:bg-amber-800"
                onClick={() => criarConvite.mutate(formConvite)} disabled={criarConvite.isPending || !formConvite.email}>
                <Send className="h-3.5 w-3.5 mr-1" /> Criar Convite
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando convites...</div>
      ) : !convitesList || convitesList.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">
          Nenhum convite criado ainda. Clique em "Novo Convite" para começar.
        </CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {convitesList.map((conv: any) => {
            const expirado = new Date(conv.expiraEm) < new Date();
            return (
              <Card key={conv.id} className={conv.usado ? "opacity-60" : expirado ? "border-red-300 opacity-70" : "border-green-300"}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold">{conv.nome || conv.email}</h3>
                        <Badge variant="outline" className={conv.role === "admin" ? "bg-amber-50 text-amber-700 border-amber-300" : "bg-blue-50 text-blue-700 border-blue-300"}>
                          {conv.role === "admin" ? "Admin" : "Usuário"}
                        </Badge>
                        {conv.usado ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">Utilizado</Badge>
                        ) : expirado ? (
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">Expirado</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">Ativo</Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground space-y-0.5">
                        <div><Mail className="h-3.5 w-3.5 inline mr-1" />{conv.email}</div>
                        <div>Criado: {new Date(conv.createdAt).toLocaleDateString("pt-BR")} — Expira: {new Date(conv.expiraEm).toLocaleDateString("pt-BR")}</div>
                        <div className="font-mono text-[11px] bg-muted/50 px-2 py-0.5 rounded inline-block">
                          Token: {conv.token.substring(0, 20)}...
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {!conv.usado && !expirado && (
                        <Button size="sm" variant="outline" className="text-xs" onClick={() => copiarLink(conv.token)}>
                          <Copy className="h-3 w-3 mr-1" /> Copiar Link
                        </Button>
                      )}
                      {!conv.usado && (
                        <Button size="sm" variant="outline" className="text-xs text-red-600 border-red-300 hover:bg-red-50"
                          onClick={() => { if (confirm("Revogar este convite?")) revogar.mutate({ id: conv.id }); }}>
                          <XCircle className="h-3 w-3 mr-1" /> Revogar
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ==================== ABA: AUDITORIA ====================
function TabAuditoria() {
  const [filtroModulo, setFiltroModulo] = useState<string>("");
  const { data: logs, isLoading, refetch } = trpc.acessos.listarAuditoria.useQuery(
    { limite: 100, modulo: filtroModulo || undefined }
  );
  const { data: stats } = trpc.acessos.estatisticasAuditoria.useQuery();

  const acaoLabel = (acao: string) => {
    const map: Record<string, { label: string; color: string }> = {
      aprovar_acesso: { label: "Aprovar Acesso", color: "bg-green-50 text-green-700 border-green-300" },
      rejeitar_acesso: { label: "Rejeitar Acesso", color: "bg-red-50 text-red-700 border-red-300" },
      excluir_solicitacao: { label: "Excluir Solicitação", color: "bg-red-50 text-red-700 border-red-300" },
      atualizar_perfil_usuario: { label: "Atualizar Perfil", color: "bg-blue-50 text-blue-700 border-blue-300" },
      desativar_usuario: { label: "Desativar Usuário", color: "bg-red-50 text-red-700 border-red-300" },
      reativar_usuario: { label: "Reativar Usuário", color: "bg-green-50 text-green-700 border-green-300" },
      definir_permissao: { label: "Definir Permissão", color: "bg-amber-50 text-amber-700 border-amber-300" },
      definir_permissoes_lote: { label: "Permissões em Lote", color: "bg-amber-50 text-amber-700 border-amber-300" },
      criar_convite: { label: "Criar Convite", color: "bg-blue-50 text-blue-700 border-blue-300" },
      revogar_convite: { label: "Revogar Convite", color: "bg-red-50 text-red-700 border-red-300" },
      excluir_cliente: { label: "Excluir Cliente", color: "bg-red-50 text-red-700 border-red-300" },
    };
    return map[acao] || { label: acao, color: "bg-gray-50 text-gray-700 border-gray-300" };
  };

  return (
    <div className="space-y-4">
      {/* Cards de estatísticas */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card>
            <CardContent className="pt-4 text-center">
              <div className="text-2xl font-bold text-amber-700">{stats.total}</div>
              <div className="text-sm text-muted-foreground">Total de Ações</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <div className="text-2xl font-bold text-blue-700">{stats.porModulo?.length || 0}</div>
              <div className="text-sm text-muted-foreground">Módulos Auditados</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <div className="text-2xl font-bold text-green-700">{stats.porAcao?.length || 0}</div>
              <div className="text-sm text-muted-foreground">Tipos de Ação</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap items-center">
        <select
          className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
          value={filtroModulo}
          onChange={(e) => setFiltroModulo(e.target.value)}
        >
          <option value="">Todos os módulos</option>
          <option value="acessos">Acessos</option>
          <option value="clientes">Clientes</option>
          <option value="processos">Processos</option>
          <option value="peticionamento">Peticionamento</option>
          <option value="integracao">Integração</option>
        </select>
        <Button size="sm" variant="ghost" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando log de auditoria...</div>
      ) : !logs || logs.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">
          Nenhum registro de auditoria encontrado.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {logs.map((log: any) => {
            const { label, color } = acaoLabel(log.acao);
            let detalhes: any = {};
            try { detalhes = JSON.parse(log.detalhes || "{}"); } catch {}
            return (
              <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
                <div className="mt-0.5">
                  <History className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={color}>{label}</Badge>
                    <Badge variant="secondary" className="text-[10px]">{log.modulo}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(log.createdAt).toLocaleDateString("pt-BR")} {new Date(log.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  {Object.keys(detalhes).length > 0 && (
                    <div className="text-xs text-muted-foreground mt-1 font-mono bg-muted/30 px-2 py-1 rounded">
                      {Object.entries(detalhes).map(([k, v]) => (
                        <span key={k} className="mr-3">{k}: {typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-xs text-muted-foreground whitespace-nowrap">
                  User #{log.userId}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
