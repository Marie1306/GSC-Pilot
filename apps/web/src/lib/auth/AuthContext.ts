import { createContext } from "react";
import type { Session } from "@supabase/supabase-js";
import type { Employee } from "@gsc-pilot/shared";

export interface AuthContextValue {
  session: Session | null;
  employee: Employee | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
