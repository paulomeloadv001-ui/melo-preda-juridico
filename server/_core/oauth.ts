import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

// Lista de domínios Cloudflare autorizados para relay de autenticação
const ALLOWED_CF_DOMAINS = [
  'melo-preda-juridico.paulomeloadv001.workers.dev',
];

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      // Decodificar state - pode ser JSON (com cf_return) ou string simples (redirectUri)
      let cfReturn: string | null = null;
      let decodedState = state;
      
      try {
        const stateStr = atob(state);
        const stateObj = JSON.parse(stateStr);
        if (stateObj.cf_return) {
          cfReturn = stateObj.cf_return;
          // Recodificar o state com apenas o redirectUri para o exchangeCodeForToken
          decodedState = btoa(stateObj.redirectUri);
        }
      } catch {
        // State não é JSON, usar como está (fluxo normal do Manus)
      }

      const tokenResponse = await sdk.exchangeCodeForToken(code, decodedState);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      // Se há cf_return, redirecionar para o Cloudflare com o token
      if (cfReturn) {
        try {
          const cfUrl = new URL(cfReturn);
          if (ALLOWED_CF_DOMAINS.includes(cfUrl.hostname)) {
            cfUrl.pathname = '/api/cf-auth-relay';
            cfUrl.searchParams.set('token', sessionToken);
            res.redirect(302, cfUrl.toString());
            return;
          }
        } catch (e) {
          // URL inválida, redirecionar normalmente
          console.error("[OAuth] Invalid cf_return URL:", cfReturn, e);
        }
      }

      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
