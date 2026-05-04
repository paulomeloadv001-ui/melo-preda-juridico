import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import ClientesList from "./pages/ClientesList";
import ClientePerfil from "./pages/ClientePerfil";
import UploadProcessos from "./pages/UploadProcessos";
import Exportacao from "./pages/Exportacao";
import Conhecimentos from "./pages/Conhecimentos";
import Correcao from "./pages/Correcao";
import Relatorios from "./pages/Relatorios";
import Jobs from "./pages/Jobs";
import GestaoAcessos, { SolicitarAcesso } from "./pages/GestaoAcessos";
import AgenteJuridico from "./pages/AgenteJuridico";
import Peticionamento from "./pages/Peticionamento";
import PrazosProcessuais from "./pages/PrazosProcessuais";
import AcompanhamentoPJe from "./pages/AcompanhamentoPJe";
import Integracao from "./pages/Integracao";
import Enriquecimento from "./pages/Enriquecimento";
import Metricas from "./pages/Metricas";
import PreenchimentoDB from "./pages/PreenchimentoDB";
import PublicacoesPage from "./pages/PublicacoesPage";
import FloatingAgent from "./components/FloatingAgent";
import CompletarPerfil from "./pages/CompletarPerfil";
import AdminUploads from "./pages/AdminUploads";
import StatusSistema from "./pages/StatusSistema";
import Conectores from "./pages/Conectores";

function Router() {
  return (
    <Switch>
      {/* Rota pública - Formulário de Solicitação de Acesso */}
      <Route path="/solicitar-acesso" component={SolicitarAcesso} />

      {/* Rota de completar perfil - primeiro login */}
      <Route path="/completar-perfil" component={CompletarPerfil} />

      {/* Rotas protegidas dentro do DashboardLayout */}
      <Route>
        <DashboardLayout>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/clientes" component={ClientesList} />
            <Route path="/cliente/:id" component={ClientePerfil} />
            <Route path="/upload" component={UploadProcessos} />
            <Route path="/exportacao" component={Exportacao} />
            <Route path="/conhecimentos" component={Conhecimentos} />
            <Route path="/relatorios" component={Relatorios} />
            <Route path="/correcao" component={Correcao} />
            <Route path="/jobs" component={Jobs} />
            <Route path="/agente" component={AgenteJuridico} />
            <Route path="/peticionamento" component={Peticionamento} />
            <Route path="/prazos" component={PrazosProcessuais} />
            <Route path="/acompanhamento" component={AcompanhamentoPJe} />
            <Route path="/integracao" component={Integracao} />
            <Route path="/enriquecimento" component={Enriquecimento} />
            <Route path="/metricas" component={Metricas} />
            <Route path="/preenchimento" component={PreenchimentoDB} />
            <Route path="/publicacoes" component={PublicacoesPage} />
            <Route path="/acessos" component={GestaoAcessos} />
            <Route path="/admin-uploads" component={AdminUploads} />
            <Route path="/status" component={StatusSistema} />
            <Route path="/conectores" component={Conectores} />
            <Route path="/404" component={NotFound} />
            <Route component={NotFound} />
          </Switch>
        </DashboardLayout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
          <FloatingAgent />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
