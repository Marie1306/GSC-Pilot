import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/apiClient.js";
import { OptionsDrawer } from "../../components/OptionsDrawer.js";
import { fetchAllTimeEntries, approveTimeEntry } from "./api.js";

interface TimeEntryActionDrawerProps {
  id: string;
  onClose: () => void;
}

function formatHours(minutes: number | null): string {
  if (minutes === null) return "—";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours}h${String(rest).padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Détail + approbation d'un punch, ouvert depuis le Centre d'actions (26
 * août 2026) — réutilise la même requête que TimePunchPage (queryKey
 * partagée, instantanée si déjà chargée) et EXACTEMENT la même mutation
 * d'approbation (approveTimeEntry), jamais une deuxième logique en
 * parallèle. Pas de "Rejeter" : un punch n'a que submitted/approved
 * (roles.ts/schema.prisma), contrairement aux achats.
 */
export function TimeEntryActionDrawer({ id, onClose }: TimeEntryActionDrawerProps) {
  const queryClient = useQueryClient();
  const listQuery = useQuery({ queryKey: ["time-entries", "all"], queryFn: fetchAllTimeEntries });
  const row = listQuery.data?.timeEntries.find((r) => r.id === id);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ["time-entries"] });
    void queryClient.invalidateQueries({ queryKey: ["action-center"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const approveMutation = useMutation({
    mutationFn: () => approveTimeEntry(id),
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez."),
  });

  if (!row) {
    return (
      <OptionsDrawer eyebrow="Heures" title={listQuery.isLoading ? "Chargement…" : "Introuvable"} onClose={onClose}>
        <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>
          {listQuery.isLoading ? "Chargement…" : "Ce punch n'est plus en attente d'approbation."}
        </p>
      </OptionsDrawer>
    );
  }

  return (
    <OptionsDrawer eyebrow="Heures à approuver" title={`${row.employeeName} — ${row.categoryLabel}`} onClose={onClose}>
      {error && <p className="form-error">{error}</p>}
      <p style={{ fontSize: 13, lineHeight: 1.7 }}>
        Date : {formatDate(row.date)}
        <br />
        Durée : {formatHours(row.roundedMinutes)}
        <br />
        Référence : {row.projectLabel ?? row.taskLabel ?? "Interne"}
        {row.note && (
          <>
            <br />
            Note : {row.note}
          </>
        )}
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn" disabled={approveMutation.isPending} onClick={() => approveMutation.mutate()}>
          ✓ Approuver
        </button>
      </div>
    </OptionsDrawer>
  );
}
