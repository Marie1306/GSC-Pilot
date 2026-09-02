import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { AuthContext, type AuthContextValue } from "../../lib/auth/AuthContext.js";
import { AcceptInvitePage } from "./AcceptInvitePage.js";

const { updateUserMock } = vi.hoisted(() => ({ updateUserMock: vi.fn() }));
vi.mock("../../lib/supabaseClient.js", () => ({
  supabase: { auth: { updateUser: updateUserMock } },
}));

const fakeSession = { access_token: "x", refresh_token: "y", user: { id: "emp-1" } } as unknown as Session;

function renderWithAuth(value: Partial<AuthContextValue>) {
  const fullValue: AuthContextValue = {
    session: null,
    employee: null,
    loading: false,
    error: null,
    signIn: async () => ({ error: null }),
    signOut: async () => {},
    ...value,
  };

  return render(
    <AuthContext.Provider value={fullValue}>
      <MemoryRouter initialEntries={["/accepter-invitation"]}>
        <Routes>
          <Route path="/" element={<div>Tableau de bord</div>} />
          <Route path="/accepter-invitation" element={<AcceptInvitePage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("AcceptInvitePage", () => {
  beforeEach(() => {
    updateUserMock.mockReset();
  });

  it("affiche un état de chargement pendant que la session se résout", () => {
    renderWithAuth({ loading: true });
    expect(screen.getByText("Vérification de l'invitation…")).toBeInTheDocument();
  });

  it("affiche un message d'erreur si le lien est invalide ou expiré (aucune session)", () => {
    renderWithAuth({ session: null });
    expect(screen.getByText(/lien d'invitation est invalide ou a expiré/)).toBeInTheDocument();
  });

  it("affiche le formulaire de mot de passe quand une session d'invitation existe", () => {
    renderWithAuth({ session: fakeSession });
    expect(screen.getByLabelText("Mot de passe")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirmer le mot de passe")).toBeInTheDocument();
  });

  it("refuse un mot de passe trop court sans appeler Supabase", () => {
    renderWithAuth({ session: fakeSession });
    fireEvent.change(screen.getByLabelText("Mot de passe"), { target: { value: "court1" } });
    fireEvent.change(screen.getByLabelText("Confirmer le mot de passe"), { target: { value: "court1" } });
    fireEvent.click(screen.getByRole("button", { name: "Activer mon compte" }));
    expect(screen.getByText("Le mot de passe doit contenir au moins 8 caractères.")).toBeInTheDocument();
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("refuse si les deux mots de passe ne correspondent pas", () => {
    renderWithAuth({ session: fakeSession });
    fireEvent.change(screen.getByLabelText("Mot de passe"), { target: { value: "motdepasse1" } });
    fireEvent.change(screen.getByLabelText("Confirmer le mot de passe"), { target: { value: "motdepasse2" } });
    fireEvent.click(screen.getByRole("button", { name: "Activer mon compte" }));
    expect(screen.getByText("Les deux mots de passe ne correspondent pas.")).toBeInTheDocument();
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("enregistre le mot de passe et affiche la confirmation en cas de succès", async () => {
    updateUserMock.mockResolvedValue({ error: null });
    renderWithAuth({ session: fakeSession });
    fireEvent.change(screen.getByLabelText("Mot de passe"), { target: { value: "motdepasse1" } });
    fireEvent.change(screen.getByLabelText("Confirmer le mot de passe"), { target: { value: "motdepasse1" } });
    fireEvent.click(screen.getByRole("button", { name: "Activer mon compte" }));
    await waitFor(() => expect(updateUserMock).toHaveBeenCalledWith({ password: "motdepasse1" }));
    expect(screen.getByText("Mot de passe enregistré — redirection…")).toBeInTheDocument();
  });

  it("affiche l'erreur de Supabase si l'enregistrement échoue", async () => {
    updateUserMock.mockResolvedValue({ error: { message: "Jeton expiré." } });
    renderWithAuth({ session: fakeSession });
    fireEvent.change(screen.getByLabelText("Mot de passe"), { target: { value: "motdepasse1" } });
    fireEvent.change(screen.getByLabelText("Confirmer le mot de passe"), { target: { value: "motdepasse1" } });
    fireEvent.click(screen.getByRole("button", { name: "Activer mon compte" }));
    await waitFor(() => expect(screen.getByText("Jeton expiré.")).toBeInTheDocument());
  });
});
