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
import PrazosProcessuais from "./pages/PrazosProcessuais";
import AcompanhamentoPJe from "./pages/AcompanhamentoPJe";
import Integracao from "./pages/Integracao";

function Router() {
  return (
    <Switch>
      {/* Rota pública - Formulário de Solicitação de Acesso */}
      <Route path="/solicitar-acesso" component={SolicitarAcesso} />

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
            <Route path="/prazos" component={PrazosProcessuais} />
            <Route path="/acompanhamento" component={AcompanhamentoPJe} />
            <Route path="/integracao" component={Integracao} />
            <Route path="/acessos" component={GestaoAcessos} />
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
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
