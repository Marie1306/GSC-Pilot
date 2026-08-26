import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchProjects, fetchPurchaseCategories, submitPurchaseRequest, type NewPurchaseRequestInput } from "./api.js";

type ProjectType = NewPurchaseRequestInput["projectType"];

const EMPTY: Omit<NewPurchaseRequestInput, "categoryId"> & { categoryId: string } = {
  projectType: "project",
  projectId: "",
  categoryId: "",
  description: "",
  supplier: "",
  estimatedAmountMin: undefined,
  estimatedAmountMax: undefined,
};

/**
 * Formulaire général de demande d'achat — ouvert à tous depuis le 13 août
 * 2026 (voir canSubmitPurchaseRequest, roles.ts). Toujours une catégorie
 * (contrairement à la liste rapide, voir ShortlistForm) — c'est elle qui
 * détermine si une double autorisation du Propriétaire sera nécessaire.
 *
 * "Appel de service" volontairement absent du type de projet : aucun
 * mécanisme de création d'appel de service n'existe encore pour en choisir
 * un réel (voir createPurchaseRequest, apps/api).
 */
export function PurchaseRequestForm() {
  const queryClient = useQueryClient();
  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: fetchProjects });
  const categoriesQuery = useQuery({ queryKey: ["purchase-categories"], queryFn: fetchPurchaseCategories });
  const [form, setForm] = useState(EMPTY);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      submitPurchaseRequest({
        projectType: form.projectType,
        projectId: form.projectType === "project" ? form.projectId || undefined : undefined,
        categoryId: form.categoryId,
        description: form.description.trim(),
        supplier: form.supplier?.trim() || undefined,
        estimatedAmountMin: form.estimatedAmountMin,
        estimatedAmountMax: form.estimatedAmountMax,
      }),
    onSuccess: (result) => {
      setFeedback(`Demande ${result.displayId} soumise — visible dans la liste ci-dessous.`);
      setError(null);
      setForm(EMPTY);
      void queryClient.invalidateQueries({ queryKey: ["purchase-requests"] });
    },
    onError: () => setError("Erreur lors de la soumission — vérifiez les champs et réessayez."),
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFeedback(null);
    mutation.mutate();
  }

  const canSubmit =
    form.description.trim().length > 0 &&
    form.categoryId !== "" &&
    (form.projectType !== "project" || form.projectId !== "") &&
    !mutation.isPending;

  return (
    <div className="card">
      <div className="card-band-header">
        <h3>Demande d'achat</h3>
      </div>
      <form onSubmit={handleSubmit} className="form-grid">
        <div className="field">
          <label htmlFor="pr-category">Catégorie</label>
          <select id="pr-category" required value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
            <option value="">— Choisir —</option>
            {categoriesQuery.data?.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pr-type">Rattaché à</label>
          <select id="pr-type" value={form.projectType} onChange={(e) => set("projectType", e.target.value as ProjectType)}>
            <option value="project">Un projet</option>
            <option value="internal">Interne (aucun projet)</option>
          </select>
        </div>
        {form.projectType === "project" && (
          <div className="field">
            <label htmlFor="pr-project">Projet</label>
            <select id="pr-project" required value={form.projectId} onChange={(e) => set("projectId", e.target.value)}>
              <option value="">— Choisir un projet —</option>
              {projectsQuery.data?.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.projectNumber} — {project.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="field field-full">
          <label htmlFor="pr-description">Description / numéro d'article</label>
          <input id="pr-description" required value={form.description} onChange={(e) => set("description", e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pr-supplier">Fournisseur(s) suggéré(s) (facultatif)</label>
          <input id="pr-supplier" value={form.supplier ?? ""} onChange={(e) => set("supplier", e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pr-min">Prix approx. min (facultatif)</label>
          <input
            id="pr-min"
            type="number"
            min={0}
            step="0.01"
            value={form.estimatedAmountMin ?? ""}
            onChange={(e) => set("estimatedAmountMin", e.target.value ? Number(e.target.value) : undefined)}
          />
        </div>
        <div className="field">
          <label htmlFor="pr-max">Prix approx. max (facultatif)</label>
          <input
            id="pr-max"
            type="number"
            min={0}
            step="0.01"
            value={form.estimatedAmountMax ?? ""}
            onChange={(e) => set("estimatedAmountMax", e.target.value ? Number(e.target.value) : undefined)}
          />
        </div>

        {error && <p className="form-error">{error}</p>}
        <div className="field field-full">
          <button type="submit" className="btn" disabled={!canSubmit}>
            {mutation.isPending ? "Soumission…" : "Soumettre la demande"}
          </button>
        </div>
      </form>
      {feedback && <p style={{ fontSize: 13, marginTop: 10 }}>{feedback}</p>}
    </div>
  );
}
