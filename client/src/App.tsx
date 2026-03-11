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

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/clientes" component={ClientesList} />
        <Route path="/cliente/:id" component={ClientePerfil} />
        <Route path="/upload" component={UploadProcessos} />
        <Route path="/exportacao" component={Exportacao} />
        <Route path="/conhecimentos" component={Conhecimentos} />
        <Route path="/correcao" component={Correcao} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
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
