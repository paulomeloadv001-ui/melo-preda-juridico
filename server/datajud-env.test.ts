import { describe, it, expect } from "vitest";

describe("DATAJUD API Key via ENV", () => {
  it("DATAJUD_API_KEY deve estar configurada como variável de ambiente", () => {
    const apiKey = process.env.DATAJUD_API_KEY;
    expect(apiKey).toBeDefined();
    expect(apiKey).not.toBe("");
    expect(typeof apiKey).toBe("string");
    // A chave deve ser uma string base64 válida
    expect(apiKey!.length).toBeGreaterThan(10);
  });

  it("ENV.datajudApiKey deve retornar o valor correto", async () => {
    const { ENV } = await import("./_core/env");
    expect(ENV.datajudApiKey).toBeDefined();
    expect(ENV.datajudApiKey).not.toBe("");
    expect(ENV.datajudApiKey.length).toBeGreaterThan(10);
  });

  it("Deve conseguir autenticar na API pública do DATAJUD", async () => {
    const { ENV } = await import("./_core/env");
    const resp = await fetch("https://api-publica.datajud.cnj.jus.br/api_publica_tjgo/_search", {
      method: "POST",
      headers: {
        "Authorization": `APIKey ${ENV.datajudApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: { match_all: {} }, size: 1 }),
    });
    // A API deve responder (200 ou 400 para query inválida, mas NÃO 401/403)
    expect(resp.status).not.toBe(401);
    expect(resp.status).not.toBe(403);
  }, 15000);
});
