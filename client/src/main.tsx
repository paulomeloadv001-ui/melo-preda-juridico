import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
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

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      async fetch(input, init) {
        const response = await globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
        // Interceptar respostas HTML (erro 413 do proxy, etc.) e converter para erro JSON
        const contentType = response.headers.get('content-type') || '';
        if (!response.ok && contentType.includes('text/html')) {
          let errorMsg = 'Erro no servidor';
          if (response.status === 413) {
            errorMsg = 'O arquivo é grande demais para envio. O limite máximo é de 100 MB por arquivo. Reduza o tamanho do PDF e tente novamente.';
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
      },
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
