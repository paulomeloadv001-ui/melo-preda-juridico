export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Generate login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = () => {
  const currentOrigin = window.location.origin;
  
  // Detectar se estamos rodando no Cloudflare Workers (não é o domínio Manus)
  const isCloudflare = !currentOrigin.includes('manus.space') && 
                       !currentOrigin.includes('manus.computer') &&
                       !currentOrigin.includes('localhost');
  
  if (isCloudflare) {
    // No Cloudflare, usar o relay endpoint que redireciona via domínio Manus autorizado
    return `${currentOrigin}/api/cf-login`;
  }

  // No Manus (domínio autorizado), usar fluxo OAuth normal
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  const redirectUri = `${currentOrigin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};
