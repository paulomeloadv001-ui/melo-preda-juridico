import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarGroup,
  SidebarGroupLabel,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { trpc } from "@/lib/trpc";
import {
  LayoutDashboard, Users, Upload, Download, BookOpen, LogOut, PanelLeft, Scale,
  Shield, FileBarChart, ListChecks, ShieldCheck, Bell, Clock, AlertTriangle,
  DollarSign, FileText, CheckCircle, X, Trash2, Brain, Calendar, Globe,
  ArrowRightLeft, UserCheck, TrendingUp, Database, ChevronDown, ChevronRight,
  Gavel, Settings, Wrench
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";

// ==================== MENU STRUCTURE ====================
// Reorganized: fewer groups, collapsible submenus, no overlapping labels
const menuGroups = [
  {
    label: "",
    items: [
      { icon: LayoutDashboard, label: "Painel", path: "/" },
      { icon: TrendingUp, label: "Métricas", path: "/metricas" },
      { icon: Upload, label: "Upload", path: "/upload" },
      { icon: Users, label: "Clientes", path: "/clientes" },
      { icon: Calendar, label: "Prazos", path: "/prazos" },
      { icon: Bell, label: "Publicações", path: "/publicacoes" },
      { icon: Globe, label: "Acompanhar", path: "/acompanhamento" },
    ]
  },
  {
    label: "Inteligência",
    items: [
      { icon: Brain, label: "Agente IA", path: "/agente" },
      { icon: Gavel, label: "Petições", path: "/peticionamento" },
      { icon: BookOpen, label: "Base Jurídica", path: "/conhecimentos" },
      { icon: FileBarChart, label: "Relatórios", path: "/relatorios" },
    ]
  },
];

// Collapsible "Ferramentas" submenu items
const ferramentasItems = [
  { icon: Shield, label: "Correção", path: "/correcao" },
  { icon: UserCheck, label: "Enriquecer", path: "/enriquecimento" },
  { icon: Download, label: "Exportar", path: "/exportacao" },
  { icon: Database, label: "Preencher BD", path: "/preenchimento" },
  { icon: ListChecks, label: "Fila de Jobs", path: "/jobs" },
  { icon: ArrowRightLeft, label: "JUSCONSIG", path: "/integracao" },
  { icon: ShieldCheck, label: "Acessos", path: "/acessos" },
];

// Flat list for route matching
const allItems = [
  ...menuGroups.flatMap(g => g.items),
  ...ferramentasItems,
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 230;
const MAX_WIDTH = 360;

function getNotifIcon(tipo: string) {
  switch (tipo) {
    case 'honorario_status': case 'honorario_novo': return DollarSign;
    case 'prazo_vencendo': return Clock;
    case 'prazo_vencido': return AlertTriangle;
    case 'importacao_concluida': return CheckCircle;
    case 'importacao_erro': return AlertTriangle;
    case 'correcao_executada': return Shield;
    case 'novo_cliente': return Users;
    case 'novo_processo': return FileText;
    default: return Bell;
  }
}

function getNotifColor(prioridade: string) {
  switch (prioridade) {
    case 'urgente': return 'text-red-400 bg-red-500/10';
    case 'alta': return 'text-amber-400 bg-amber-500/10';
    case 'normal': return 'text-blue-400 bg-blue-500/10';
    case 'baixa': return 'text-gray-400 bg-gray-500/10';
    default: return 'text-blue-400 bg-blue-500/10';
  }
}

function formatTimeAgo(date: Date | string) {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `${diffMin}min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d`;
  return d.toLocaleDateString('pt-BR');
}

// ==================== PAINEL DE NOTIFICAÇÕES ====================
function NotificacoesPanel() {
  const [aberto, setAberto] = useState(false);
  const [, setLocation] = useLocation();
  const panelRef = useRef<HTMLDivElement>(null);

  const { data: notifData, refetch } = trpc.notificacoes.listar.useQuery(
    { limite: 50 },
    { refetchInterval: 30000 }
  );
  const marcarLida = trpc.notificacoes.marcarComoLida.useMutation({ onSuccess: () => refetch() });
  const marcarTodasLidas = trpc.notificacoes.marcarTodasComoLidas.useMutation({ onSuccess: () => refetch() });
  const excluirNotif = trpc.notificacoes.excluir.useMutation({ onSuccess: () => refetch() });
  const limparLidas = trpc.notificacoes.limparLidas.useMutation({ onSuccess: () => refetch() });

  const totalNaoLidas = notifData?.totalNaoLidas || 0;
  const notificacoes = notifData?.notificacoes || [];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setAberto(false);
      }
    }
    if (aberto) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [aberto]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setAberto(!aberto)}
        className="relative h-9 w-9 flex items-center justify-center rounded-lg hover:bg-sidebar-accent/50 transition-colors"
        aria-label="Notificações"
      >
        <Bell className="h-5 w-5 text-sidebar-foreground/70" />
        {totalNaoLidas > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-5 min-w-5 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 animate-pulse">
            {totalNaoLidas > 99 ? '99+' : totalNaoLidas}
          </span>
        )}
      </button>

      {aberto && (
        <div className="fixed bottom-20 left-4 w-96 max-h-[70vh] bg-[oklch(0.2_0.01_60)] border border-[oklch(0.3_0.02_60)] rounded-xl shadow-2xl z-[200] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[oklch(0.3_0.02_60)]">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-[oklch(0.75_0.12_85)]" />
              <span className="font-semibold text-sm text-white">Notificações</span>
              {totalNaoLidas > 0 && (
                <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-medium">
                  {totalNaoLidas} nova(s)
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {totalNaoLidas > 0 && (
                <button
                  onClick={() => marcarTodasLidas.mutate()}
                  className="text-xs text-[oklch(0.75_0.12_85)] hover:underline px-2 py-1"
                  title="Marcar todas como lidas"
                >
                  Ler todas
                </button>
              )}
              {notificacoes.some((n: any) => n.lida === 1) && (
                <button
                  onClick={() => limparLidas.mutate()}
                  className="text-xs text-gray-400 hover:text-red-400 px-2 py-1"
                  title="Limpar lidas"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={() => setAberto(false)}
                className="text-gray-400 hover:text-white p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto flex-1">
            {notificacoes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4">
                <Bell className="h-10 w-10 text-gray-600 mb-3" />
                <p className="text-sm text-gray-400">Nenhuma notificação</p>
                <p className="text-xs text-gray-500 mt-1">As notificações aparecerão aqui</p>
              </div>
            ) : (
              notificacoes.map((n: any) => {
                const Icon = getNotifIcon(n.tipo);
                const colorClass = getNotifColor(n.prioridade);
                return (
                  <div
                    key={n.id}
                    className={`flex items-start gap-3 px-4 py-3 border-b border-[oklch(0.25_0.01_60)] hover:bg-[oklch(0.25_0.02_60)] transition-colors cursor-pointer ${
                      n.lida === 0 ? 'bg-[oklch(0.22_0.02_60)]' : ''
                    }`}
                    onClick={() => {
                      if (n.lida === 0) marcarLida.mutate({ id: n.id });
                      if (n.linkUrl) {
                        setLocation(n.linkUrl);
                        setAberto(false);
                      }
                    }}
                  >
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${colorClass}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm leading-tight ${n.lida === 0 ? 'font-semibold text-white' : 'text-gray-300'}`}>
                          {n.titulo}
                        </p>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[10px] text-gray-500">
                            {formatTimeAgo(n.createdAt)}
                          </span>
                          {n.lida === 0 && (
                            <div className="h-2 w-2 rounded-full bg-[oklch(0.75_0.12_85)]" />
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{n.mensagem}</p>
                      {n.prioridade === 'urgente' && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-red-400 mt-1">
                          <AlertTriangle className="h-3 w-3" /> Urgente
                        </span>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        excluirNotif.mutate({ id: n.id });
                      }}
                      className="text-gray-500 hover:text-red-400 p-1 shrink-0 opacity-0 hover:opacity-100 transition-opacity"
                      title="Excluir"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== COLLAPSIBLE FERRAMENTAS SUBMENU ====================
function FerramentasSubmenu() {
  const [location, setLocation] = useLocation();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  // Filtrar itens: Acessos só aparece para admin
  const visibleItems = ferramentasItems.filter(item => {
    if (item.path === '/acessos' && !isAdmin) return false;
    return true;
  });
  
  // Auto-expand if current route is in ferramentas
  const isFerramentaActive = visibleItems.some(item => item.path === location);
  const [expanded, setExpanded] = useState(isFerramentaActive);

  useEffect(() => {
    if (isFerramentaActive) setExpanded(true);
  }, [isFerramentaActive]);

  if (isCollapsed) {
    // When collapsed, show just the wrench icon
    return (
      <SidebarGroup className="py-0">
        <SidebarMenu className="gap-0">
          {visibleItems.map(item => {
            const isActive = location === item.path;
            return (
              <SidebarMenuItem key={item.path}>
                <SidebarMenuButton
                  isActive={isActive}
                  onClick={() => setLocation(item.path)}
                  tooltip={item.label}
                  className="h-8"
                >
                  <item.icon className={`h-4 w-4 shrink-0 ${isActive ? "text-[oklch(0.75_0.12_85)]" : ""}`} />
                  <span className="truncate">{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroup>
    );
  }

  return (
    <SidebarGroup className="py-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-4 py-1.5 text-[10px] uppercase tracking-widest text-sidebar-foreground/40 hover:text-sidebar-foreground/60 transition-colors"
      >
        <Wrench className="h-3 w-3" />
        <span>Ferramentas</span>
        {expanded ? (
          <ChevronDown className="h-3 w-3 ml-auto" />
        ) : (
          <ChevronRight className="h-3 w-3 ml-auto" />
        )}
        {isFerramentaActive && !expanded && (
          <div className="h-1.5 w-1.5 rounded-full bg-[oklch(0.75_0.12_85)] ml-1" />
        )}
      </button>
      {expanded && (
        <SidebarMenu className="px-1 gap-0">
          {visibleItems.map(item => {
            const isActive = location === item.path;
            return (
              <SidebarMenuItem key={item.path}>
                <SidebarMenuButton
                  isActive={isActive}
                  onClick={() => setLocation(item.path)}
                  tooltip={item.label}
                  className="h-7 text-[12px] pl-6"
                >
                  <item.icon className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-[oklch(0.75_0.12_85)]" : ""}`} />
                  <span className="truncate">{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      )}
    </SidebarGroup>
  );
}

// ==================== MAIN LAYOUT ====================
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />;
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[oklch(0.15_0.01_60)]">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-4">
            <div className="h-16 w-16 rounded-full gold-gradient flex items-center justify-center">
              <Scale className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white text-center">
              Melo &amp; Preda Advogados
            </h1>
            <p className="text-sm text-gray-400 text-center max-w-sm">
              Sistema Jurídico Integrado — Banco de Dados de Processos e Clientes
            </p>
          </div>
          <Button
            onClick={() => {
              window.location.href = getLoginUrl();
            }}
            size="lg"
            className="w-full gold-gradient text-white shadow-lg hover:shadow-xl transition-all"
          >
            Entrar no Sistema
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = allItems.find(item => item.path === location);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-14 justify-center">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-sidebar-accent rounded-lg transition-colors focus:outline-none shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-sidebar-foreground/70" />
              </button>
              {!isCollapsed ? (
                <div className="flex items-center gap-2 min-w-0">
                  <Scale className="h-5 w-5 text-[oklch(0.75_0.12_85)] shrink-0" />
                  <span className="font-semibold tracking-tight truncate text-sidebar-foreground text-sm">
                    Melo &amp; Preda
                  </span>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0 overflow-y-auto scrollbar-thin">
            {menuGroups.map((group, gi) => (
              <SidebarGroup key={gi} className="py-0">
                {group.label && (
                  <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-sidebar-foreground/40 px-4 py-1 h-auto">
                    {group.label}
                  </SidebarGroupLabel>
                )}
                <SidebarMenu className="px-1 gap-0">
                  {group.items.map(item => {
                    const isActive = location === item.path;
                    return (
                      <SidebarMenuItem key={item.path}>
                        <SidebarMenuButton
                          isActive={isActive}
                          onClick={() => setLocation(item.path)}
                          tooltip={item.label}
                          className="h-8 transition-all font-normal text-[13px]"
                        >
                          <item.icon
                            className={`h-4 w-4 shrink-0 ${isActive ? "text-[oklch(0.75_0.12_85)]" : ""}`}
                          />
                          <span className="truncate">{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroup>
            ))}

            {/* Collapsible Ferramentas submenu */}
            <FerramentasSubmenu />
          </SidebarContent>

          <SidebarFooter className="p-3">
            <div className="flex items-center justify-center mb-2 group-data-[collapsible=icon]:mb-0">
              <NotificacoesPanel />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-sidebar-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none">
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback className="text-xs font-medium bg-[oklch(0.75_0.12_85)] text-white">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none text-sidebar-foreground">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-sidebar-foreground/60 truncate mt-1.5">
                      {user?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sair</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-[oklch(0.75_0.12_85)]/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <span className="tracking-tight text-foreground">
                    {activeMenuItem?.label ?? "Menu"}
                  </span>
                </div>
              </div>
            </div>
            <NotificacoesPanel />
          </div>
        )}
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
    </>
  );
}
