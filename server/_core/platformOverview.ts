import { ENV } from "./env";

const DEFAULT_MANUS_URL = "https://manus.space";
const DEFAULT_APP_VERSION = "1.0.0";

export type PlatformOverview = {
  nome: string;
  versao: string;
  ambiente: string;
  arquitetura: string;
  backend: string;
  deploy: string;
  banco: string;
  storage: string;
  manus: {
    url: string;
    status: "online" | "nao_configurado";
    mensagem: string;
    oauthConfigurado: boolean;
    forgeConfigurado: boolean;
  };
};

export function getPlatformOverview(): PlatformOverview {
  const manusUrlConfigurada = (process.env.MANUS_APP_URL || "").trim();
  const manusUrl = manusUrlConfigurada || DEFAULT_MANUS_URL;
  const oauthConfigurado = Boolean(
    ENV.appId && ENV.oAuthServerUrl && ENV.ownerOpenId && ENV.cookieSecret
  );
  const forgeConfigurado = Boolean(ENV.forgeApiUrl && ENV.forgeApiKey);
  const ambiente = ENV.isProduction
    ? "Produção"
    : "Desenvolvimento local";
  const versao =
    process.env.APP_VERSION ||
    process.env.npm_package_version ||
    DEFAULT_APP_VERSION;
  const manusMensagem = oauthConfigurado
    ? manusUrlConfigurada
      ? "OAuth Manus, owner e sessão do aplicativo configurados"
      : "OAuth Manus configurado usando a URL padrão documentada da plataforma"
    : "Configure OAuth Manus, owner e sessão do aplicativo";

  return {
    nome: "Melo Advogados - Sistema Jurídico Integrado",
    versao,
    ambiente,
    arquitetura:
      "Operação jurídica conectada ao Manus com autenticação e serviços compartilhados",
    backend: "Express + tRPC + Drizzle",
    deploy: oauthConfigurado
      ? "Aplicação conectada ao Manus em produção"
      : "Aplicação pronta para conexão com o Manus",
    banco: ENV.databaseUrl
      ? "MySQL / TiDB Serverless"
      : "Banco de dados não configurado",
    storage: forgeConfigurado
      ? "Forge API + storage remoto"
      : "Storage remoto pendente",
    manus: {
      url: manusUrl,
      status: oauthConfigurado ? "online" : "nao_configurado",
      mensagem: manusMensagem,
      oauthConfigurado,
      forgeConfigurado,
    },
  };
}
