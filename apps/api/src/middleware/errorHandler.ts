import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

/** Erreur contrôlée avec un statut HTTP explicite — pour tout le reste, 500 générique. */
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Gestionnaire d'erreurs central. Express 5 achemine automatiquement les
 * rejets de promesse des routes async ici — aucun try/catch requis dans
 * chaque route. Ne renvoie jamais un message interne ou une pile d'appel
 * au client pour une erreur 500 (uniquement journalisé côté serveur).
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "validation_error", issues: err.issues });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  // PayloadTooLargeError (body-parser/raw-body) — sans cette branche,
  // dépasser la limite de express.json() (voir app.ts) tombait dans le 500
  // générique ci-dessous, affiché à l'utilisatrice comme "internal_error"
  // sans piste (bogue réel rapporté le 28 août 2026, photos de Rapport
  // d'erreurs).
  if ((err as { type?: string })?.type === "entity.too.large") {
    res.status(413).json({ error: "Fichier trop volumineux — réduisez la taille ou le nombre de photos." });
    return;
  }
  req.log?.error({ err }, "Erreur non gérée");
  res.status(500).json({ error: "internal_error" });
};
