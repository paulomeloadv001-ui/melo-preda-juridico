import { ENV } from "./env";

const DEFAULT_MANUS_URL = "https://melopreda-4imsnkhw.manus.space";

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
  const manusUrl = (process.env.MANUS_APP_URL || DEFAULT_MANUS_URL).trim();
  const oauthConfigurado = Boolean(
    ENV.appId && ENV.oAuthServerUrl && ENV.ownerOpenId && ENV.cookieSecret
  );
  const forgeConfigurado = Boolean(ENV.forgeApiUrl && ENV.forgeApiKey);
  const ambiente = ENV.isProduction
    ? "Produção"
    : "Desenvolvimento local";

  return {
    nome: "Melo Advogados - Sistema Jurídico Integrado",
    versao: process.env.npm_package_version ?? "1.0.0",
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
      mensagem: oauthConfigurado
        ? "OAuth Manus, owner e sessão do aplicativo configurados"
        : "Configure OAuth Manus, owner e sessão do aplicativo",
      oauthConfigurado,
      forgeConfigurado,
    },
  };
}
