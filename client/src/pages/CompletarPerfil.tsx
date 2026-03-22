import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Scale, User, Phone, CreditCard, Briefcase, BookOpen, FileText, CheckCircle, Loader2 } from "lucide-react";

const CARGOS = [
  "Advogado(a) Sócio(a)",
  "Advogado(a) Associado(a)",
  "Advogado(a) Colaborador(a)",
  "Estagiário(a)",
  "Assistente Jurídico",
  "Secretário(a)",
  "Analista Jurídico",
  "Paralegal",
  "Administrador(a)",
  "Outro",
];

const ESPECIALIDADES = [
  "Direito Civil",
  "Direito Trabalhista",
  "Direito Penal",
  "Direito Tributário",
  "Direito Empresarial",
  "Direito Administrativo",
  "Direito do Consumidor",
  "Direito Previdenciário",
  "Direito Ambiental",
  "Direito Digital",
  "Direito Imobiliário",
  "Direito de Família",
  "Direito Processual Civil",
  "Direito Processual Penal",
  "Generalista",
  "Outra",
];

export default function CompletarPerfil() {
  const { user, refresh } = useAuth();
  const perfilQuery = trpc.meuPerfil.obter.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const [, setLocation] = useLocation();

  const salvarMutation = trpc.meuPerfil.salvar.useMutation({
    onSuccess: () => {
      toast.success("Perfil salvo com sucesso!", {
        description: "Bem-vindo ao Melo & Preda!",
      });
      // Refresh auth para atualizar profileCompleted
      refresh();
      // Redirecionar para o dashboard após 1.5s
      setTimeout(() => {
        setLocation("/");
      }, 1500);
    },
    onError: (error) => {
      toast.error("Erro ao salvar perfil", {
        description: error.message,
      });
    },
  });

  const [form, setForm] = useState({
    nomeCompleto: user?.name || "",
    celular: "",
    cpf: "",
    oab: "",
    cargo: "",
    especialidade: "",
    bio: "",
  });

  // Preencher form quando o perfil carregar
  const profile = perfilQuery.data?.profile;
  const [initialized, setInitialized] = useState(false);
  if (profile && !initialized) {
    setForm((prev) => ({
      ...prev,
      celular: profile.celular || prev.celular,
      cpf: profile.cpf || prev.cpf,
      oab: profile.oab || prev.oab,
      cargo: profile.cargo || prev.cargo,
      especialidade: (profile as any).especialidade || prev.especialidade,
      bio: (profile as any).bio || prev.bio,
    }));
    setInitialized(true);
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nomeCompleto.trim()) {
      toast.error("Nome completo é obrigatório");
      return;
    }
    salvarMutation.mutate(form);
  };

  const formatCPF = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9)
      return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  };

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  return (
    <div className="min-h-screen bg-[oklch(0.15_0.01_60)] flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="flex flex-col items-center gap-4 mb-8">
          <div className="h-20 w-20 rounded-full gold-gradient flex items-center justify-center shadow-lg shadow-[oklch(0.75_0.12_85)]/20">
            <Scale className="h-10 w-10 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">
              Bem-vindo ao Melo & Preda
            </h1>
            <p className="text-gray-400 mt-1">
              Complete seu perfil para começar a usar o sistema
            </p>
          </div>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-[oklch(0.20_0.01_60)] rounded-xl p-6 border border-[oklch(0.30_0.02_60)] shadow-xl">
            {/* Seção: Dados Pessoais */}
            <div className="flex items-center gap-2 mb-5">
              <User className="h-5 w-5 text-[oklch(0.75_0.12_85)]" />
              <h2 className="text-lg font-semibold text-white">
                Dados Pessoais
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Nome Completo */}
              <div className="md:col-span-2">
                <Label htmlFor="nomeCompleto" className="text-gray-300 mb-1.5 block">
                  Nome Completo <span className="text-red-400">*</span>
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <Input
                    id="nomeCompleto"
                    value={form.nomeCompleto}
                    onChange={(e) =>
                      setForm({ ...form, nomeCompleto: e.target.value })
                    }
                    placeholder="Seu nome completo"
                    className="pl-10 bg-[oklch(0.18_0.01_60)] border-[oklch(0.30_0.02_60)] text-white placeholder:text-gray-500 focus:border-[oklch(0.75_0.12_85)] focus:ring-[oklch(0.75_0.12_85)]/20"
                    required
                  />
                </div>
              </div>

              {/* CPF */}
              <div>
                <Label htmlFor="cpf" className="text-gray-300 mb-1.5 block">
                  CPF
                </Label>
                <div className="relative">
                  <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <Input
                    id="cpf"
                    value={form.cpf}
                    onChange={(e) =>
                      setForm({ ...form, cpf: formatCPF(e.target.value) })
                    }
                    placeholder="000.000.000-00"
                    className="pl-10 bg-[oklch(0.18_0.01_60)] border-[oklch(0.30_0.02_60)] text-white placeholder:text-gray-500 focus:border-[oklch(0.75_0.12_85)] focus:ring-[oklch(0.75_0.12_85)]/20"
                  />
                </div>
              </div>

              {/* Celular */}
              <div>
                <Label htmlFor="celular" className="text-gray-300 mb-1.5 block">
                  Celular
                </Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <Input
                    id="celular"
                    value={form.celular}
                    onChange={(e) =>
                      setForm({ ...form, celular: formatPhone(e.target.value) })
                    }
                    placeholder="(62) 99999-9999"
                    className="pl-10 bg-[oklch(0.18_0.01_60)] border-[oklch(0.30_0.02_60)] text-white placeholder:text-gray-500 focus:border-[oklch(0.75_0.12_85)] focus:ring-[oklch(0.75_0.12_85)]/20"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Seção: Dados Profissionais */}
          <div className="bg-[oklch(0.20_0.01_60)] rounded-xl p-6 border border-[oklch(0.30_0.02_60)] shadow-xl">
            <div className="flex items-center gap-2 mb-5">
              <Briefcase className="h-5 w-5 text-[oklch(0.75_0.12_85)]" />
              <h2 className="text-lg font-semibold text-white">
                Dados Profissionais
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* OAB */}
              <div>
                <Label htmlFor="oab" className="text-gray-300 mb-1.5 block">
                  N. OAB
                </Label>
                <div className="relative">
                  <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <Input
                    id="oab"
                    value={form.oab}
                    onChange={(e) =>
                      setForm({ ...form, oab: e.target.value })
                    }
                    placeholder="Ex: GO 12345"
                    className="pl-10 bg-[oklch(0.18_0.01_60)] border-[oklch(0.30_0.02_60)] text-white placeholder:text-gray-500 focus:border-[oklch(0.75_0.12_85)] focus:ring-[oklch(0.75_0.12_85)]/20"
                  />
                </div>
              </div>

              {/* Cargo */}
              <div>
                <Label htmlFor="cargo" className="text-gray-300 mb-1.5 block">
                  Cargo / Função
                </Label>
                <Select
                  value={form.cargo}
                  onValueChange={(v) => setForm({ ...form, cargo: v })}
                >
                  <SelectTrigger className="bg-[oklch(0.18_0.01_60)] border-[oklch(0.30_0.02_60)] text-white">
                    <SelectValue placeholder="Selecione seu cargo" />
                  </SelectTrigger>
                  <SelectContent>
                    {CARGOS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Especialidade */}
              <div className="md:col-span-2">
                <Label htmlFor="especialidade" className="text-gray-300 mb-1.5 block">
                  Área de Especialidade
                </Label>
                <Select
                  value={form.especialidade}
                  onValueChange={(v) => setForm({ ...form, especialidade: v })}
                >
                  <SelectTrigger className="bg-[oklch(0.18_0.01_60)] border-[oklch(0.30_0.02_60)] text-white">
                    <SelectValue placeholder="Selecione sua especialidade" />
                  </SelectTrigger>
                  <SelectContent>
                    {ESPECIALIDADES.map((e) => (
                      <SelectItem key={e} value={e}>
                        {e}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Bio */}
              <div className="md:col-span-2">
                <Label htmlFor="bio" className="text-gray-300 mb-1.5 block">
                  Breve Descrição Profissional
                </Label>
                <div className="relative">
                  <BookOpen className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
                  <Textarea
                    id="bio"
                    value={form.bio}
                    onChange={(e) =>
                      setForm({ ...form, bio: e.target.value })
                    }
                    placeholder="Conte um pouco sobre sua experiência e atuação profissional..."
                    rows={3}
                    className="pl-10 bg-[oklch(0.18_0.01_60)] border-[oklch(0.30_0.02_60)] text-white placeholder:text-gray-500 focus:border-[oklch(0.75_0.12_85)] focus:ring-[oklch(0.75_0.12_85)]/20 resize-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Botão de Salvar */}
          <div className="flex flex-col items-center gap-3">
            <Button
              type="submit"
              size="lg"
              disabled={salvarMutation.isPending || !form.nomeCompleto.trim()}
              className="w-full max-w-md gold-gradient text-white shadow-lg hover:shadow-xl transition-all text-base py-6"
            >
              {salvarMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-5 w-5" />
                  Completar Perfil e Entrar
                </>
              )}
            </Button>
            <p className="text-xs text-gray-500 text-center">
              Você pode atualizar essas informações a qualquer momento nas configurações
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
