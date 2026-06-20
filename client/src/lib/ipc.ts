import type { InkwellApi } from "../../../electron/preload";

declare global {
  interface Window {
    inkwell: InkwellApi;
  }
}

/**
 * Thin accessor for the preload-exposed API. Throws a clear error if the app
 * is somehow loaded outside Electron (e.g. a plain browser), instead of the
 * opaque "cannot read property of undefined".
 */
export function ipc(): InkwellApi {
  if (typeof window === "undefined" || !window.inkwell) {
    throw new Error("window.inkwell is unavailable — Inkwell must run inside Electron.");
  }
  return window.inkwell;
}

/**
 * Maps a React Query key like ["/api/ideas"] to the matching IPC getAll call.
 * Lets existing pages keep their query keys unchanged while using IPC.
 */
export async function ipcQuery<T>(queryKey: readonly unknown[]): Promise<T> {
  const path = String(queryKey[0]);
  const api = ipc();
  switch (path) {
    case "/api/ideas":
      return api.ideas.getAll() as Promise<T>;
    case "/api/projects":
      return api.projects.getAll() as Promise<T>;
    case "/api/deadlines":
      return api.deadlines.getAll() as Promise<T>;
    case "/api/settings/projectTypes":
      return api.settings.get("projectTypes") as Promise<T>;
    case "/api/settings/publications":
      return api.settings.get("publications") as Promise<T>;
    case "/api/pubHistory":
      return api.pubHistory.getAll() as Promise<T>;
    default:
      throw new Error(`No IPC query handler for key: ${path}`);
  }
}
