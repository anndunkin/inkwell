import { QueryClient, type QueryFunction } from "@tanstack/react-query";
import { ipcQuery } from "./ipc";

/**
 * Default query function: resolves a React Query key (e.g. ["/api/ideas"])
 * through the Electron IPC bridge instead of an HTTP fetch.
 */
export const getQueryFn = <T>(): QueryFunction<T> =>
  async ({ queryKey }) => ipcQuery<T>(queryKey);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn(),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
