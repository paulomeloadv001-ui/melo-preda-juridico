import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, httpLink, splitLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

// Fetch wrapper com tratamento de erros HTML e timeout configurável
const createFetchWithTimeout = (timeoutMs: number) => async (input: RequestInfo | URL, init?: RequestInit) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await globalThis.fetch(input, {
      ...(init ?? {}),
      credentials: "include" as RequestCredentials,
      signal: controller.signal,
    });
    clearTimeout(timer);
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok && contentType.includes('text/html')) {
      let errorMsg = 'Erro no servidor';
      if (response.status === 413) {
        errorMsg = 'O arquivo é grande demais para envio direto. O sistema tentará enviar em partes. Se o erro persistir, tente novamente.';
      } else if (response.status === 502 || response.status === 504) {
        errorMsg = 'O servidor demorou para responder. Tente novamente em alguns instantes.';
      } else {
        errorMsg = `Erro ${response.status}: o servidor retornou uma resposta inesperada.`;
      }
      return new Response(
        JSON.stringify([{ error: { json: { message: errorMsg, code: -32000, data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: response.status } } } }]),
        { status: response.status, headers: { 'content-type': 'application/json' } }
      );
    }
    return response;
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      return new Response(
        JSON.stringify([{ error: { json: { message: 'A operação demorou mais que o esperado. O processamento pode ter sido concluído em segundo plano. Verifique a aba Clientes ou tente novamente.', code: -32000, data: { code: 'TIMEOUT', httpStatus: 408 } } } }]),
        { status: 408, headers: { 'content-type': 'application/json' } }
      );
    }
    throw err;
  }
};

// Rotas que precisam de timeout maior (upload + processamento IA)
const LONG_TIMEOUT_PATHS = [
  'agente.chat', 'agente.gerarPeticao', 'agente.analisarProcesso', 'agente.executarAcao',
  'processar.uploadPdf', 'processar.uploadContracheque', 'processar.analiseProfunda',
  'jobs.uploadPdf', 'jobs.iniciarLote', 'jobs.processarLoteCompleto',
  'jobs.uploadArquivoLote',
];

const trpcClient = trpc.createClient({
  links: [
    splitLink({
      condition: (op) => LONG_TIMEOUT_PATHS.some(p => op.path.includes(p)),
      true: httpLink({
        url: "/api/trpc",
        transformer: superjson,
        fetch: createFetchWithTimeout(300_000), // 300s (5min) para agente/upload/processamento IA
      }),
      false: httpBatchLink({
        url: "/api/trpc",
        transformer: superjson,
        fetch: createFetchWithTimeout(60_000), // 60s para rotas normais
      }),
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
