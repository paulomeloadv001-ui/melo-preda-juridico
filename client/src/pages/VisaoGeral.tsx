import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Scale, Upload, Users, FileText, Calendar, BookOpen, Zap, Database,
  ArrowRight, CheckCircle2, Shield, Brain, Clock, TrendingUp, Globe,
  Mail, RefreshCw, Package, BarChart3, Gavel
} from "lucide-react";

export default function VisaoGeral() {
  return (
    <div className="space-y-8 p-6 max-w-6xl mx-auto">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-8 md:p-12 text-white">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyem0wLTRWMjhIMjR2MmgxMnptMC00VjI0SDI0djJoMTJ6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-50" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-white/10 backdrop-blur rounded-xl">
              <Scale className="h-8 w-8 text-indigo-300" />
            </div>
            <div>
              <Badge className="bg-indigo-500/20 text-indigo-200 border-indigo-400/30 mb-1">
                Plataforma Jurídica Inteligente
              </Badge>
              <h1 className="text-3xl md:text-4xl font-bold">Melo Advogados</h1>
            </div>
          </div>
          <p className="text-lg text-slate-300 max-w-3xl leading-relaxed">
            Sistema completo de gestão jurídica com inteligência artificial, automação de processos,
            integrações com órgãos públicos e geração automática de documentos.
            Desenvolvido para maximizar eficiência e reduzir trabalho manual.
          </p>
          <div className="flex flex-wrap gap-4 mt-6">
            <div className="flex items-center gap-2 bg-white/5 rounded-lg px-4 py-2">
              <Brain className="h-4 w-4 text-purple-400" />
              <span className="text-sm">IA Jurídica Avançada</span>
            </div>
            <div className="flex items-center gap-2 bg-white/5 rounded-lg px-4 py-2">
              <Zap className="h-4 w-4 text-yellow-400" />
              <span className="text-sm">Automação Total</span>
            </div>
            <div className="flex items-center gap-2 bg-white/5 rounded-lg px-4 py-2">
              <Globe className="h-4 w-4 text-green-400" />
              <span className="text-sm">Integrações Reais</span>
            </div>
            <div className="flex items-center gap-2 bg-white/5 rounded-lg px-4 py-2">
              <Shield className="h-4 w-4 text-blue-400" />
              <span className="text-sm">Segurança Total</span>
            </div>
          </div>
        </div>
      </div>

      {/* Fluxo Único Sequencial */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <ArrowRight className="h-5 w-5 text-indigo-600" />
            Fluxo Único Sequencial
          </CardTitle>
          <CardDescription>
            Cada etapa alimenta automaticamente a próxima — sem duplicação, sem retrabalho
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-7 gap-2 items-center">
            {[
              { icon: Upload, label: "Upload", desc: "PDF do processo" },
              { icon: Users, label: "Cliente", desc: "Dados extraídos" },
              { icon: Gavel, label: "Processo", desc: "Análise profunda" },
              { icon: BookOpen, label: "Conhecimento", desc: "Teses e estratégias" },
              { icon: FileText, label: "Petição", desc: "Gerada com IA" },
              { icon: Calendar, label: "Prazo", desc: "Criado automático" },
              { icon: BarChart3, label: "Relatório", desc: "Consolidado" },
            ].map((step, i) => (
              <div key={i} className="flex flex-col items-center text-center">
                <div className={`p-3 rounded-xl ${i === 0 ? 'bg-indigo-100 dark:bg-indigo-900/30' : 'bg-slate-100 dark:bg-slate-800'}`}>
                  <step.icon className={`h-6 w-6 ${i === 0 ? 'text-indigo-600' : 'text-slate-600 dark:text-slate-400'}`} />
                </div>
                <p className="text-xs font-semibold mt-2">{step.label}</p>
                <p className="text-[10px] text-muted-foreground">{step.desc}</p>
                {i < 6 && (
                  <ArrowRight className="h-3 w-3 text-slate-400 mt-1 hidden md:block rotate-0 md:absolute md:right-0" />
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
            <p className="text-sm text-green-800 dark:text-green-300 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              <strong>100% automático:</strong> Um único upload gera cliente + processo + estratégia + conhecimento + pasta + relatório cadastral
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Funcionalidades Principais */}
      <div>
        <h2 className="text-xl font-bold mb-4">Funcionalidades Principais</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            {
              icon: Upload,
              title: "Importação Inteligente",
              desc: "Upload de PDF de processo com extração automática de todos os dados via IA: partes, valores, movimentações, prazos.",
              badge: "IA",
            },
            {
              icon: Brain,
              title: "Agente IA Jurídico",
              desc: "Assistente inteligente com 15+ ferramentas: gera petições, analisa processos, calcula correções, consulta jurisprudência.",
              badge: "GPT-4",
            },
            {
              icon: FileText,
              title: "Peticionamento Automático",
              desc: "Geração de petições em DOCX com timbrado oficial, fundamentação jurídica e formatação ABNT. Cria prazo automático.",
              badge: "DOCX",
            },
            {
              icon: Database,
              title: "Banco de Conhecimentos",
              desc: "Teses jurídicas, jurisprudências, estratégias e legislações extraídas automaticamente de cada processo importado.",
              badge: "Base IA",
            },
            {
              icon: TrendingUp,
              title: "Dados Financeiros",
              desc: "Contracheque, margem consignável, empréstimos, remuneração bruta/líquida. Integração com Dados Abertos GO.",
              badge: "Financeiro",
            },
            {
              icon: Calendar,
              title: "Prazos Processuais",
              desc: "Controle automático de prazos com alertas de urgência. Criados automaticamente após petição ou publicação.",
              badge: "Alertas",
            },
            {
              icon: Mail,
              title: "Importação PROJUDI/Gmail",
              desc: "Importação automática de publicações e intimações do PROJUDI via Gmail. Filtra e-mails de verificação.",
              badge: "Gmail",
            },
            {
              icon: Globe,
              title: "Integrações Automáticas",
              desc: "Dados Abertos GO, DataJud CNJ, Celcoin (margem), Open Finance, NeoConsig. Tudo via API em tempo real.",
              badge: "APIs",
            },
            {
              icon: RefreshCw,
              title: "Cron Jobs Automáticos",
              desc: "4 jobs agendados: folha mensal, movimentações diárias, prazos diários, margem semanal. Zero intervenção manual.",
              badge: "Auto",
            },
            {
              icon: Package,
              title: "Deploy & Exportação",
              desc: "Exportação completa do banco, conhecimentos, configurações. Backup automático e relatório de integridade.",
              badge: "Backup",
            },
            {
              icon: Shield,
              title: "Gestão de Acessos",
              desc: "Controle de permissões por perfil (Admin, Advogado, Estagiário). Convites, aprovações e auditoria completa.",
              badge: "Segurança",
            },
            {
              icon: Clock,
              title: "Webhooks em Tempo Real",
              desc: "Recebe notificações de NeoConsig, DataJud, bancos e PJe/PROJUDI. Atualiza dados automaticamente.",
              badge: "Tempo Real",
            },
          ].map((feat, i) => (
            <Card key={i} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg shrink-0">
                    <feat.icon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-sm">{feat.title}</h3>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {feat.badge}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{feat.desc}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Separator />

      {/* Arquitetura Técnica */}
      <Card>
        <CardHeader>
          <CardTitle>Arquitetura Técnica</CardTitle>
          <CardDescription>Stack tecnológica e infraestrutura</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="space-y-2">
              <h4 className="font-semibold text-sm text-indigo-600">Frontend</h4>
              <ul className="text-xs space-y-1 text-muted-foreground">
                <li>React 18 + TypeScript</li>
                <li>Vite (build)</li>
                <li>TailwindCSS + shadcn/ui</li>
                <li>tRPC Client</li>
                <li>Wouter (routing)</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-sm text-indigo-600">Backend</h4>
              <ul className="text-xs space-y-1 text-muted-foreground">
                <li>Express + tRPC</li>
                <li>Drizzle ORM</li>
                <li>OpenAI GPT-4</li>
                <li>Node-cron</li>
                <li>Webhooks REST</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-sm text-indigo-600">Banco de Dados</h4>
              <ul className="text-xs space-y-1 text-muted-foreground">
                <li>MySQL / TiDB Serverless</li>
                <li>30+ tabelas</li>
                <li>Drizzle Migrations</li>
                <li>Backup automático</li>
                <li>Cache em memória</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-sm text-indigo-600">Deploy</h4>
              <ul className="text-xs space-y-1 text-muted-foreground">
                <li>Cloudflare Workers</li>
                <li>R2 (storage)</li>
                <li>D1 (edge DB)</li>
                <li>OAuth 2.0</li>
                <li>HTTPS + CDN</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Integrações */}
      <Card>
        <CardHeader>
          <CardTitle>Integrações com Órgãos e APIs</CardTitle>
          <CardDescription>Conexões reais com sistemas públicos e privados</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { nome: "Dados Abertos GO (SEAD)", desc: "Folha de pagamento pública — remuneração, cargo, órgão", tipo: "Pública" },
              { nome: "DataJud (CNJ)", desc: "Movimentações processuais — atualização automática diária", tipo: "Pública" },
              { nome: "Celcoin API", desc: "Margem consignável em tempo real — score, risco, contratos", tipo: "Privada" },
              { nome: "NeoConsig", desc: "Gestão de consignações — margem, averbação, contratos", tipo: "Privada" },
              { nome: "Open Finance / BB", desc: "Alvarás judiciais, empréstimos, operações financeiras", tipo: "Privada" },
              { nome: "Gmail / PROJUDI", desc: "Importação automática de publicações e intimações", tipo: "OAuth" },
              { nome: "Portal Transparência GO", desc: "Dados complementares de servidores públicos", tipo: "Pública" },
              { nome: "PJe / PROJUDI", desc: "Webhooks de intimações eletrônicas", tipo: "Webhook" },
            ].map((integ, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <p className="font-medium text-sm">{integ.nome}</p>
                  <p className="text-xs text-muted-foreground">{integ.desc}</p>
                </div>
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {integ.tipo}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Métricas de Desenvolvimento */}
      <Card>
        <CardHeader>
          <CardTitle>Métricas do Projeto</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
            {[
              { valor: "11.000+", label: "Linhas de código" },
              { valor: "30+", label: "Tabelas no banco" },
              { valor: "50+", label: "Rotas tRPC" },
              { valor: "8", label: "Integrações" },
              { valor: "15+", label: "Ferramentas IA" },
            ].map((m, i) => (
              <div key={i} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                <p className="text-2xl font-bold text-indigo-600">{m.valor}</p>
                <p className="text-xs text-muted-foreground">{m.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
