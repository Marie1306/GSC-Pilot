import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth/useAuth.js";
import { supabase } from "../../lib/supabaseClient.js";

/**
 * Reçoit le clic sur le lien d'invitation Supabase (voir employees/service.ts,
 * createEmployee → inviteUserByEmail avec redirectTo vers cette route) OU une
 * redirection automatique depuis AuthProvider.tsx suite à un lien "Send
 * password recovery" envoyé manuellement depuis le tableau de bord Supabase
 * (utilisé par Direction pour renvoyer une invitation cassée). Le jeton dans
 * l'URL établit déjà une session Supabase valide au chargement (comportement
 * par défaut du client, voir supabaseClient.ts) — cette page ne fait que
 * demander un mot de passe et l'enregistrer, elle ne vérifie rien d'autre.
 */
export function AcceptInvitePage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setDone(true);
    setTimeout(() => navigate("/", { replace: true }), 1200);
  }

  if (loading) {
    return (
      <div className="login-screen">
        <div className="card login-card">
          <h1>GSC Pilot</h1>
          <p>Vérification de l'invitation…</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="login-screen">
        <div className="card login-card">
          <h1>GSC Pilot</h1>
          <p className="error-text">
            Ce lien d'invitation est invalide ou a expiré. Demandez à la Direction de vous envoyer une nouvelle
            invitation.
          </p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="login-screen">
        <div className="card login-card">
          <h1>GSC Pilot</h1>
          <p>Mot de passe enregistré — redirection…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <form className="card login-card" onSubmit={(event) => void handleSubmit(event)}>
        <h1>GSC Pilot</h1>
        <p>Définissez votre mot de passe pour activer votre compte.</p>
        <div className="field">
          <label htmlFor="password">Mot de passe</label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="confirmPassword">Confirmer le mot de passe</label>
          <input
            id="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </div>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" className="btn" disabled={submitting}>
          {submitting ? "Enregistrement…" : "Activer mon compte"}
        </button>
      </form>
    </div>
  );
}
