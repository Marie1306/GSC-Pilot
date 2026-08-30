import { apiFetch } from "../../lib/apiClient.js";

// Mêmes valeurs/libellés que features/settings/api.ts — dupliqués plutôt
// que partagés entre fonctionnalités (même choix que budgets/api.ts,
// clientRequests/api.ts, etc. — voir leurs propres commentaires).
export type Persona = "owner" | "admin" | "boss" | "member" | "warehouse";
export const PERSONA_LABELS: Record<Persona, string> = {
  owner: "Direction",
  admin: "Administration",
  boss: "Propriétaire",
  member: "Employé",
  warehouse: "Magasinier",
};
export const ALL_PERSONAS: Persona[] = ["owner", "admin", "boss", "member", "warehouse"];

export interface TeamNoteRecipientOptionDto {
  id: string;
  name: string;
  persona: Persona;
}

export interface TeamNoteDto {
  id: string;
  senderId: string;
  senderName: string;
  senderPersona: Persona;
  body: string;
  createdAt: string;
  readAt: string | null;
}

export interface SendTeamNoteInput {
  recipientId?: string;
  recipientPersona?: Persona;
  body: string;
}

export function fetchTeamNoteRecipients(): Promise<{ employees: TeamNoteRecipientOptionDto[] }> {
  return apiFetch("/api/team-notes/recipients");
}

export function sendTeamNote(input: SendTeamNoteInput): Promise<{ recipientCount: number }> {
  return apiFetch("/api/team-notes", { method: "POST", body: JSON.stringify(input) });
}

export function fetchTeamNotesInbox(): Promise<{ active: TeamNoteDto[]; recentArchived: TeamNoteDto[] }> {
  return apiFetch("/api/team-notes/inbox");
}

export function fetchAllArchivedTeamNotes(): Promise<{ notes: TeamNoteDto[] }> {
  return apiFetch("/api/team-notes/archive");
}

export function markTeamNoteRead(id: string): Promise<void> {
  return apiFetch(`/api/team-notes/${id}/read`, { method: "POST" });
}
