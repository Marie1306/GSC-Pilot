import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { MeResponse } from "@gsc-pilot/shared";
import { supabase } from "../supabaseClient.js";
import { apiFetch } from "../apiClient.js";
import { AuthContext, type AuthContextValue } from "./AuthContext.js";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      // Le bouton "Send password recovery" du tableau de bord Supabase (utilisé
      // par Direction pour renvoyer un lien à un employé dont l'invitation
      // initiale a échoué) redirige toujours vers le Site URL du projet — la
      // racine "/", jamais AcceptInvitePage directement. Cet événement est le
      // seul signal fiable pour l'y rediriger nous-mêmes, peu importe la page
      // où le lien atterrit.
      if (event === "PASSWORD_RECOVERY") {
        navigate("/accepter-invitation", { replace: true });
      }
    });
    return () => subscription.unsubscribe();
  }, [queryClient, navigate]);

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<MeResponse>("/api/me"),
    enabled: !!session,
    retry: false,
  });

  async function signIn(email: string, password: string): Promise<{ error: string | null }> {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  async function signOut(): Promise<void> {
    await supabase.auth.signOut();
    queryClient.clear();
  }

  const value: AuthContextValue = {
    session,
    employee: meQuery.data?.employee ?? null,
    loading: sessionLoading || (!!session && meQuery.isPending),
    error: session && meQuery.isError ? "Impossible de récupérer votre profil. Contactez la Direction." : null,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
