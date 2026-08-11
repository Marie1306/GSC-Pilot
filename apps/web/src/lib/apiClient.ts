import { supabase } from "./supabaseClient.js";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Chemins relatifs (ex. "/api/me") — le serveur de dev Vite les redirige
 * vers l'API (voir vite.config.ts) et, en production, l'API sert aussi le
 * build de cette app (même origine) — jamais besoin d'une URL absolue ici.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      issues?: { path: (string | number)[]; message: string }[];
    };
    const first = body.error === "validation_error" ? body.issues?.[0] : undefined;
    if (first) {
      const field = first.path.join(".") || "champ";
      throw new ApiError(res.status, `${field} : ${first.message}`);
    }
    throw new ApiError(res.status, body.error || `Erreur ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
