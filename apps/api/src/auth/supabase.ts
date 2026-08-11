import { createClient } from "@supabase/supabase-js";
import { env } from "../env.js";

/**
 * Client Supabase côté serveur, avec la clé de service — jamais exposée au
 * navigateur (voir .env.example). Sert à vérifier les jetons d'accès des
 * usagers et, plus tard, à inviter de nouveaux employés (auth.admin.*).
 */
export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export interface VerifiedSupabaseUser {
  id: string;
  email: string | undefined;
}

/**
 * Vérifie un jeton d'accès Supabase en le validant directement auprès de
 * Supabase (plutôt que de vérifier la signature JWT nous-mêmes) — plus
 * simple et fiable peu importe le mécanisme de signature du projet
 * (symétrique ou par clés JWKS), au prix d'un aller-retour réseau
 * supplémentaire par requête. Négligeable à l'échelle de cette application
 * (4-10 usagers).
 */
export async function verifyAccessToken(accessToken: string): Promise<VerifiedSupabaseUser | null> {
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email };
}
