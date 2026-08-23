import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchEmployees,
  fetchDelegations,
  createDelegation,
  revokeDelegation,
  DELEGATION_CATEGORY_LABELS,
  type DelegationCategory,
} from "./api.js";
import "./settings.css";

const ALL_CATEGORIES: DelegationCategory[] = ["hours", "purchases", "service", "changes"];
// "changes" délibérément décochée par défaut (roles.ts) — Direction ne veut aucun changement
// structurel (taux par défaut, seuils, dossiers employés) pendant son absence, sauf choix explicite.
const DEFAULT_CATEGORIES: DelegationCategory[] = ["hours", "purchases", "service"];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Délégation d'approbation (23 août 2026) — Direction délègue temporairement
 * à Propriétaire ou Administration (jamais Employé/Magasinier, roles.ts). La
 * vérification (delegationActive/actsAsDirection) est déjà branchée partout
 * dans l'application depuis le port initial — cette carte gère seulement la
 * création/révocation des DelegationGrant réels. Une seule délégation
 * active/à venir à la fois (imposé côté serveur).
 */
export function DelegationCard() {
  const queryClient = useQueryClient();
  const employeesQuery = useQuery({ queryKey: ["employees"], queryFn: fetchEmployees });
  const delegationsQuery = useQuery({ queryKey: ["delegations"], queryFn: fetchDelegations });

  const [showForm, setShowForm] = useState(false);
  const [delegateId, setDelegateId] = useState("");
  const [categories, setCategories] = useState<DelegationCategory[]>(DEFAULT_CATEGORIES);
  const [monetaryLimit, setMonetaryLimit] = useState("");
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState("");
  const [justification, setJustification] = useState("");
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["delegations"] });

  const createMutation = useMutation({
    mutationFn: () =>
      createDelegation({
        delegateId,
        categories,
        monetaryLimit: monetaryLimit ? Number(monetaryLimit) : undefined,
        startDate,
        endDate,
        justification: justification.trim(),
      }),
    onSuccess: () => {
      setShowForm(false);
      setDelegateId("");
      setCategories(DEFAULT_CATEGORIES);
      setMonetaryLimit("");
      setStartDate(todayIso());
      setEndDate("");
      setJustification("");
      setError(null);
      invalidate();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Erreur — vérifiez les champs."),
  });
  const revokeMutation = useMutation({ mutationFn: revokeDelegation, onSuccess: invalidate });

  const eligibleDelegates = (employeesQuery.data?.employees ?? []).filter((e) => e.active && (e.persona === "boss" || e.persona === "admin"));
  const delegations = delegationsQuery.data?.delegations ?? [];
  const today = todayIso();
  const active = delegations.find((d) => !d.revokedAt && d.endDate >= today);
  const history = delegations.filter((d) => d.id !== active?.id);

  function toggleCategory(category: DelegationCategory) {
    setCategories((current) => (current.includes(category) ? current.filter((c) => c !== category) : [...current, category]));
  }

  const canCreate = delegateId && categories.length > 0 && startDate && endDate && justification.trim().length > 0 && !createMutation.isPending;

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <h2 style={{ marginTop: 0, fontSize: 16 }}>Délégation d'approbation</h2>
      <p style={{ color: "var(--gsc-color-muted)", fontSize: 13, marginTop: -8 }}>
        Confie temporairement les pouvoirs d'approbation de la Direction au Propriétaire ou à l'Administration (ex. absence prévue).
      </p>

      {active ? (
        <div className="card" style={{ background: "var(--gsc-color-surface2)", border: "none" }}>
          <strong>
            {active.delegateName} — {formatDate(active.startDate)} au {formatDate(active.endDate)}
          </strong>
          <div className="cell-sub">
            {active.categories.map((c) => DELEGATION_CATEGORY_LABELS[c]).join(", ")}
            {active.monetaryLimit !== null && <> · Limite {active.monetaryLimit.toFixed(2)} $</>}
          </div>
          <div className="cell-sub">« {active.justification} »</div>
          <button
            type="button"
            className="btn btn-secondary btn-small"
            style={{ marginTop: 8 }}
            disabled={revokeMutation.isPending}
            onClick={() => revokeMutation.mutate(active.id)}
          >
            {revokeMutation.isPending ? "…" : "Révoquer"}
          </button>
        </div>
      ) : (
        <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Aucune délégation active en ce moment.</p>
      )}

      {!showForm && !active && (
        <button type="button" className="btn btn-small" style={{ marginTop: 10 }} onClick={() => setShowForm(true)}>
          + Nouvelle délégation
        </button>
      )}

      {showForm && (
        <form
          className="form-grid"
          style={{ marginTop: 14 }}
          onSubmit={(event) => {
            event.preventDefault();
            if (canCreate) createMutation.mutate();
          }}
        >
          <div className="field">
            <label>Déléguer à</label>
            <select value={delegateId} onChange={(e) => setDelegateId(e.target.value)}>
              <option value="" disabled>
                Sélectionner…
              </option>
              {eligibleDelegates.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Limite monétaire (facultatif)</label>
            <input type="number" min={0} step="0.01" value={monetaryLimit} onChange={(e) => setMonetaryLimit(e.target.value)} placeholder="$" />
          </div>
          <div className="field">
            <label>Date de début</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="field">
            <label>Date de fin</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="field field-full">
            <label>Catégories déléguées</label>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              {ALL_CATEGORIES.map((category) => (
                <label key={category} style={{ display: "flex", alignItems: "center", gap: 4, fontWeight: 400 }}>
                  <input type="checkbox" checked={categories.includes(category)} onChange={() => toggleCategory(category)} />
                  {DELEGATION_CATEGORY_LABELS[category]}
                </label>
              ))}
            </div>
          </div>
          <div className="field field-full">
            <label>Justification (obligatoire)</label>
            <input value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="ex. Vacances du 1er au 15 septembre" />
          </div>
          <div className="field field-full" style={{ display: "flex", gap: 8 }}>
            <button type="submit" className="btn btn-small" disabled={!canCreate}>
              {createMutation.isPending ? "…" : "Créer la délégation"}
            </button>
            <button type="button" className="btn btn-secondary btn-small" onClick={() => setShowForm(false)}>
              Annuler
            </button>
          </div>
        </form>
      )}
      {error && <p className="form-error">{error}</p>}

      {history.length > 0 && (
        <>
          <h3 style={{ fontSize: 14, marginTop: 20, marginBottom: 8 }}>Historique</h3>
          <div className="table-scroll">
          <table className="settings-table">
            <thead>
              <tr>
                <th>Délégué</th>
                <th>Période</th>
                <th>Catégories</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {history.map((d) => (
                <tr key={d.id}>
                  <td>{d.delegateName}</td>
                  <td>
                    {formatDate(d.startDate)} au {formatDate(d.endDate)}
                  </td>
                  <td>{d.categories.map((c) => DELEGATION_CATEGORY_LABELS[c]).join(", ")}</td>
                  <td>{d.revokedAt ? "Révoquée" : "Expirée"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}
    </div>
  );
}
