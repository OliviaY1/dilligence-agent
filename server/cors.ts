import type { RequestHandler } from "express";

/**
 * Lets the deployed frontend, which lives on its own host, call this API from
 * the browser. `origin` is FRONTEND_ORIGIN, e.g.
 * https://diligence-frontend.<subdomain>.workers.dev. Other sites get no CORS
 * headers, so browsers block their requests. Locally the Vite proxy keeps the
 * frontend and the API on one origin, so none of this applies.
 */
export function allowOrigin(origin: string): RequestHandler {
  return (req, res, next) => {
    res.vary("Origin");
    if (req.headers.origin !== origin) return next();
    res.setHeader("Access-Control-Allow-Origin", origin);
    if (req.method !== "OPTIONS") return next();
    // Preflight: the browser asks before JSON POST/PUT and DELETE requests.
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");
    res.status(204).end();
  };
}
