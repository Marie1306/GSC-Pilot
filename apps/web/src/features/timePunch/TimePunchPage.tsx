import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canApprovePunch, canEditOwnPunch, canPunchForOtherEmployee, canDeleteTimeEntry } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { useOnlineStatus } from "../../offline/useOnlineStatus.js";
import { useLocalTimer } from "../../offline/useLocalTimer.js";
import { clearLocalActiveEntry, markPendingStop } from "../../offline/localTimer.js";
import { enqueue } from "../../offline/sync.js";
import { OfflineBanner } from "../../offline/OfflineBanner.js";
import { fetchMyTimeEntries, fetchAllTimeEntries, stopTimer, approveTimeEntry, deleteTimeEntry, type TimeEntryDto, type ManualEntryInput } from "./api.js";
import { StartTaskModal } from "./StartTaskModal.js";
import { ManualEntryModal } from "./ManualEntryModal.js";
import "./timePunch.css";

interface ActiveDisplay {
  startAt: string;
  taskLabel: string;
  referenceLabel: string;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function formatHours(minutes: number | null): string {
  if (minutes === null) return "—";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours}h${String(rest).padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { day: "numeric", month: "short" });
}

function referenceLabel(entry: TimeEntryDto): string {
  if (entry.projectType === "project") return entry.projectLabel ?? "Projet";
  if (entry.projectType === "service") return entry.categoryLabel;
  return entry.categoryLabel;
}

const STATUS_BADGE: Record<string, string> = { submitted: "badge-neutral", approved: "badge-conforme" };
const STATUS_LABEL: Record<string, string> = { submitted: "Soumis", approved: "Approuvé" };

function TimerHero({
  activeEntry,
  onStart,
  onManual,
  onStop,
  stopping,
}: {
  activeEntry?: ActiveDisplay;
  onStart: () => void;
  onManual: () => void;
  onStop: () => void;
  stopping: boolean;
}) {
  // Pas de setState synchrone dans l'effet (règle react-hooks/set-state-in-effect) —
  // le premier tick vient de l'intervalle, décalage d'au plus 1 seconde à l'affichage initial, sans conséquence réelle.
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    if (!activeEntry) return;
    const startedAt = new Date(activeEntry.startAt).getTime();
    const interval = setInterval(() => setElapsedMs(Date.now() - startedAt), 1000);
    return () => clearInterval(interval);
  }, [activeEntry]);

  const elapsed = activeEntry ? formatElapsed(elapsedMs) : "00:00:00";

  return (
    <section className="card span-2 punch-hero">
      <div className="punch-hero-state">{activeEntry ? "Chronomètre actif" : "Prêt à puncher"}</div>
      <div className="punch-hero-display">{elapsed}</div>
      {activeEntry && (
        <div className="punch-hero-task">
          {activeEntry.referenceLabel} — {activeEntry.taskLabel}
        </div>
      )}
      <div className="punch-hero-actions">
        {activeEntry ? (
          <button type="button" className="btn btn-secondary" onClick={onStop} disabled={stopping}>
            {stopping ? "Arrêt…" : "Arrêter"}
          </button>
        ) : (
          <>
            <button type="button" className="btn" onClick={onStart}>
              ▶️ Débuter une tâche
            </button>
            <button type="button" className="btn btn-secondary" onClick={onManual}>
              🕒 Entrée manuelle
            </button>
          </>
        )}
      </div>
    </section>
  );
}

/**
 * Punch d'heures — 18 août 2026, hors ligne ajouté le 23 août 2026 (spec
 * confirmée : le chronomètre en direct fonctionne hors ligne, pas
 * seulement l'entrée manuelle). Une entrée démarrée hors ligne vit
 * localement (offline/localTimer.ts) jusqu'à l'arrêt, où elle devient une
 * entrée manuelle mise en file (heures calculées localement) — aucun
 * nouvel endpoint serveur. Arrêter une entrée déjà connue du serveur en
 * étant hors ligne la masque localement (pendingStops) le temps que la
 * synchronisation confirme l'arrêt. Règles affichées ici : seulement
 * celles confirmées dans la spécification (arrondi vers le haut,
 * correction possible avant approbation) — jamais la pause dîner ni les
 * heures hors plage du prototype v19, non confirmées (voir
 * packages/business-rules/src/punch.ts).
 */
export function TimePunchPage() {
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const { localActive, pendingStopIds } = useLocalTimer();
  const isDirection = employee ? canApprovePunch({}, employee.persona) : false;

  const myEntriesQuery = useQuery({ queryKey: ["time-entries", "mine"], queryFn: fetchMyTimeEntries });
  const allEntriesQuery = useQuery({ queryKey: ["time-entries", "all"], queryFn: fetchAllTimeEntries, enabled: isDirection });

  const [startOpen, setStartOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimeEntryDto | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [stoppingLocal, setStoppingLocal] = useState(false);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["time-entries"] });
  const stopMutation = useMutation({ mutationFn: stopTimer, onSuccess: invalidate });
  const approveMutation = useMutation({ mutationFn: approveTimeEntry, onSuccess: invalidate });
  const deleteMutation = useMutation({
    mutationFn: deleteTimeEntry,
    onSuccess: () => {
      setConfirmDeleteId(null);
      invalidate();
    },
  });

  if (!employee) return null;

  const canDelete = canDeleteTimeEntry(employee.persona);

  const myEntries = myEntriesQuery.data?.timeEntries ?? [];
  const serverActiveEntry = myEntries.find((entry) => !entry.endAt && !pendingStopIds.has(entry.id));
  const displayActive: ActiveDisplay | undefined = localActive
    ? { startAt: localActive.startAt, taskLabel: localActive.taskLabel, referenceLabel: localActive.referenceLabel }
    : serverActiveEntry
      ? { startAt: serverActiveEntry.startAt, taskLabel: serverActiveEntry.taskLabel ?? "—", referenceLabel: referenceLabel(serverActiveEntry) }
      : undefined;
  const rows = isDirection ? allEntriesQuery.data?.timeEntries ?? [] : myEntries;

  async function handleStop() {
    if (localActive) {
      setStoppingLocal(true);
      const hours = (Date.now() - new Date(localActive.startAt).getTime()) / 3_600_000;
      const input: ManualEntryInput = {
        employeeId: localActive.employeeId,
        projectType: localActive.projectType,
        projectId: localActive.projectId,
        serviceCallId: localActive.serviceCallId,
        taskId: localActive.taskId,
        techLevelId: localActive.techLevelId,
        rateType: localActive.rateType,
        note: localActive.note,
        date: localActive.startAt.slice(0, 10),
        hours: Math.round(hours * 100) / 100,
      };
      await enqueue("time-entry-create", input);
      await clearLocalActiveEntry();
      setStoppingLocal(false);
      return;
    }
    if (!serverActiveEntry) return;
    if (online) {
      stopMutation.mutate(serverActiveEntry.id);
      return;
    }
    setStoppingLocal(true);
    await markPendingStop(serverActiveEntry.id);
    await enqueue("time-entry-stop", { id: serverActiveEntry.id });
    setStoppingLocal(false);
  }

  function canEditRow(entry: TimeEntryDto): boolean {
    if (!entry.endAt) return false;
    if (canEditOwnPunch(employee!.persona, { employee: entry.employeeId, status: entry.status }, employee!.id)) return true;
    return canApprovePunch({}, employee!.persona);
  }
  function canStopRow(entry: TimeEntryDto): boolean {
    if (entry.endAt) return false;
    return entry.employeeId === employee!.id || canPunchForOtherEmployee(employee!.persona);
  }

  return (
    <div>
      <OfflineBanner />
      <div className="grid grid-3">
        <TimerHero
          activeEntry={displayActive}
          onStart={() => setStartOpen(true)}
          onManual={() => setManualOpen(true)}
          onStop={() => void handleStop()}
          stopping={stopMutation.isPending || stoppingLocal}
        />
        <section className="card">
          <div className="card-header">
            <div>
              <h3>Règles actives</h3>
              <p>Contrôles de la journée</p>
            </div>
          </div>
          <ul className="punch-rules-list">
            <li>Arrondi toujours vers le haut — l'heure exacte reste conservée pour l'audit.</li>
            <li>Une entrée soumise reste corrigible jusqu'à l'approbation par la Direction.</li>
            <li>Une correction après approbation repasse l'entrée en attente d'approbation.</li>
          </ul>
        </section>
      </div>

      <section className="card" style={{ marginTop: 20 }}>
        <div className="card-band-header">
          <div>
            <h3>{isDirection ? "Toutes les entrées" : "Mes entrées"}</h3>
            <p className="modal-subtitle">Une entrée approuvée devient verrouillée; toute correction repasse en approbation.</p>
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="punch-table">
            <thead>
              <tr>
                <th>Date</th>
                {isDirection && <th>Employé</th>}
                <th>Référence</th>
                <th>Tâche</th>
                <th className="num">Heures</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={isDirection ? 7 : 6} style={{ color: "var(--gsc-color-muted)" }}>
                    Aucune entrée pour l'instant.
                  </td>
                </tr>
              )}
              {rows.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatDate(entry.date)}</td>
                  {isDirection && <td>{entry.employeeName}</td>}
                  <td>
                    <div>{referenceLabel(entry)}</div>
                    {entry.blockageNote && <div className="badge-pill badge-at_risk">Blocage signalé</div>}
                  </td>
                  <td>
                    <div>{entry.taskLabel ?? "—"}</div>
                    {entry.note && <div className="cell-sub">{entry.note}</div>}
                  </td>
                  <td className="num">
                    {entry.endAt ? (
                      <>
                        <strong>{formatHours(entry.roundedMinutes)}</strong>
                        <div className="cell-sub">exact {formatHours(entry.exactMinutes)}</div>
                      </>
                    ) : (
                      "en cours"
                    )}
                  </td>
                  <td>
                    <span className={`badge-pill ${STATUS_BADGE[entry.status] ?? "badge-neutral"}`}>
                      {STATUS_LABEL[entry.status] ?? entry.status}
                    </span>
                  </td>
                  <td className="actions">
                    {confirmDeleteId === entry.id ? (
                      <>
                        <span style={{ fontSize: 12, color: "var(--gsc-color-muted)" }}>Supprimer ce punch ?</span>
                        <button
                          type="button"
                          className="btn punch-btn-small"
                          disabled={deleteMutation.isPending}
                          onClick={() => deleteMutation.mutate(entry.id)}
                        >
                          {deleteMutation.isPending ? "…" : "Confirmer"}
                        </button>
                        <button type="button" className="btn btn-secondary punch-btn-small" onClick={() => setConfirmDeleteId(null)}>
                          Annuler
                        </button>
                      </>
                    ) : (
                      <>
                        {canStopRow(entry) && (
                          <button type="button" className="btn btn-secondary punch-btn-small" onClick={() => stopMutation.mutate(entry.id)}>
                            Arrêter
                          </button>
                        )}
                        {isDirection && entry.status === "submitted" && entry.endAt && (
                          <button type="button" className="btn punch-btn-small" onClick={() => approveMutation.mutate(entry.id)}>
                            Approuver
                          </button>
                        )}
                        {canEditRow(entry) && (
                          <button type="button" className="btn btn-secondary punch-btn-small" onClick={() => setEditingEntry(entry)}>
                            Modifier
                          </button>
                        )}
                        {canDelete && (
                          <button type="button" className="btn btn-secondary punch-btn-small" onClick={() => setConfirmDeleteId(entry.id)}>
                            Supprimer
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {startOpen && <StartTaskModal onClose={() => setStartOpen(false)} />}
      {manualOpen && <ManualEntryModal onClose={() => setManualOpen(false)} />}
      {editingEntry && <ManualEntryModal entry={editingEntry} onClose={() => setEditingEntry(null)} />}
    </div>
  );
}
