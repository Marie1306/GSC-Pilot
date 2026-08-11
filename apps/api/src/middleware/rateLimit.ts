import rateLimit from "express-rate-limit";

/** Barrière générale, pas un remplacement pour la limite déjà appliquée par Supabase Auth sur ses propres routes. */
export const apiRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 300, // large à l'échelle de 4-10 usagers — sert de garde-fou, pas de contrainte quotidienne
  standardHeaders: true,
  legacyHeaders: false,
});
