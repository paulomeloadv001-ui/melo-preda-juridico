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
import { getLoginUrl, getGoogleLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { trpc } from "@/lib/trpc";
import {
  LayoutDashboard, Users, Upload, LogOut, PanelLeft, Scale,
  Bell, Clock, AlertTriangle, DollarSign, FileText, CheckCircle, X, Trash2,
  Gavel, Calendar, Settings, ChevronDown, ChevronRight, Shield, Download,
  BookOpen, Database, ArrowRightLeft, ShieldCheck, ListChecks, UserCheck,
  FileBarChart, Wrench, FolderOpen, BarChart3
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";

// ==================== MENU STRUCTURE ====================
// Fluxo simplificado: 6 itens principais + Configurações colapsável
const menuItems = [
  { icon: LayoutDashboard, label: "Painel", path: "/" },
  { icon: Upload, label: "Importar", path: "/upload" },
  { icon: Users, label: "Clientes", path: "/clientes" },
  { icon: Gavel, label: "Petições", path: "/peticionamento" },
  { icon: Calendar, label: "Prazos", path: "/prazos" },
  { icon: FileBarChart, label: "Relatórios", path: "/relatorios" },
];

// Configurações (colapsável)
const configItems = [
  { icon: BookOpen, label: "Base Jurídica", path: "/conhecimentos" },
  { icon: Shield, label: "Auditoria", path: "/correcao" },
  { icon: Download, label: "Exportar", path: "/exportacao" },
  { icon: ShieldCheck, label: "Acessos", path: "/acessos" },
  { icon: BarChart3, label: "Painel Uploads", path: "/admin-uploads" },
];

// Flat list for route matching (includes all routes, even hidden ones)
const allItems = [
  ...menuItems,
  ...configItems,
  // Hidden routes (accessible via links but not in sidebar)
  { icon: FolderOpen, label: "Cliente", path: "/cliente" },
  { icon: FolderOpen, label: "Agente IA", path: "/agente" },
  { icon: ListChecks, label: "Jobs", path: "/jobs" },
  { icon: ArrowRightLeft, label: "Integração", path: "/integracao" },
  { icon: UserCheck, label: "Enriquecer", path: "/enriquecimento" },
  { icon: Database, label: "Preencher BD", path: "/preenchimento" },
  { icon: Bell, label: "Publicações", path: "/publicacoes" },
  { icon: FolderOpen, label: "Acompanhar", path: "/acompanhamento" },
  { icon: FolderOpen, label: "Métricas", path: "/metricas" },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 250;
const MIN_WIDTH = 220;
const MAX_WIDTH = 340;

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

// ==================== CONFIGURAÇÕES SUBMENU ====================
function ConfigSubmenu() {
  const [location, setLocation] = useLocation();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const visibleItems = configItems.filter(item => {
    if (item.path === '/acessos' && !isAdmin) return false;
    return true;
  });

  const isConfigActive = visibleItems.some(item => item.path === location);
  const [expanded, setExpanded] = useState(isConfigActive);

  useEffect(() => {
    if (isConfigActive) setExpanded(true);
  }, [isConfigActive]);

  if (isCollapsed) {
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
        <Settings className="h-3 w-3" />
        <span>Configurações</span>
        {expanded ? (
          <ChevronDown className="h-3 w-3 ml-auto" />
        ) : (
          <ChevronRight className="h-3 w-3 ml-auto" />
        )}
        {isConfigActive && !expanded && (
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
  const [, setLocation] = useLocation();
  const needsProfile = !loading && user && (user as any).profileCompleted === 0;

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  useEffect(() => {
    if (needsProfile) {
      setLocation('/completar-perfil');
    }
  }, [needsProfile, setLocation]);

  if (loading) {
    return <DashboardLayoutSkeleton />;
  }

  if (needsProfile) {
    return <DashboardLayoutSkeleton />;
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[oklch(0.15_0.01_60)]">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-4">
            <div className="h-20 w-20 rounded-full gold-gradient flex items-center justify-center shadow-lg shadow-[oklch(0.75_0.12_85)]/20">
              <Scale className="h-10 w-10 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white text-center">
              Melo &amp; Preda Advogados
            </h1>
            <p className="text-sm text-gray-400 text-center max-w-sm">
              Sistema Jurídico Integrado
            </p>
          </div>

          <div className="flex flex-col gap-3 w-full">
            <button
              onClick={() => {
                window.location.href = getGoogleLoginUrl();
              }}
              className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-white hover:bg-gray-50 text-gray-700 font-medium rounded-lg shadow-md hover:shadow-lg transition-all border border-gray-200"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Entrar com Google
            </button>

            <div className="flex items-center gap-3 my-1">
              <div className="flex-1 h-px bg-gray-600/30"></div>
              <span className="text-xs text-gray-500 uppercase tracking-wider">ou</span>
              <div className="flex-1 h-px bg-gray-600/30"></div>
            </div>

            <Button
              onClick={() => {
                window.location.href = getLoginUrl();
              }}
              size="lg"
              className="w-full gold-gradient text-white shadow-lg hover:shadow-xl transition-all"
            >
              Entrar com Email
            </Button>
          </div>

          <p className="text-xs text-gray-500 text-center mt-2">
            Acesso restrito a membros autorizados do escritório
          </p>
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
  const activeMenuItem = allItems.find(item => location.startsWith(item.path) && item.path !== "/" ) || allItems.find(item => item.path === location);
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
            <SidebarGroup className="py-0">
              <SidebarMenu className="px-1 gap-0">
                {menuItems.map(item => {
                  const isActive = location === item.path;
                  return (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        isActive={isActive}
                        onClick={() => setLocation(item.path)}
                        tooltip={item.label}
                        className="h-9 transition-all font-normal text-[13px]"
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

            {/* Configurações colapsável */}
            <ConfigSubmenu />
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
