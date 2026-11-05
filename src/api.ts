// Where the browser sends /api requests. Locally VITE_API_URL is unset and the
// paths stay relative, so the Vite dev proxy forwards them to localhost:3000.
// A deployed frontend is built with VITE_API_URL set to the backend's own host,
// e.g. https://diligence-api.onrender.com (the backend allows it via FRONTEND_ORIGIN).

declare global {
  interface ImportMetaEnv {
    readonly VITE_API_URL?: string;
  }
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

const API_BASE = (import.meta.env.VITE_API_URL ?? "").trim().replace(/\/+$/, "");

/** `path` ("/api/...") on the backend. */
export function apiUrl(path: string): string {
  return API_BASE + path;
}
