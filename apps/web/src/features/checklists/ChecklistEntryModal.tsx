import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchChecklistThicknesses, fetchChecklistMaterials, fetchChecklistSteps } from "../settings/api.js";
import { submitPurchaseShortlist } from "../purchases/api.js";
import { ApiError } from "../../lib/apiClient.js";
import { addChecklistItem, type ChecklistDto, type AddChecklistItemInput } from "./api.js";
import { PieceFields, stepCheckboxes, emptyPieceFields, type PieceFieldsValue } from "./pieceFields.js";
import "./checklist.css";

interface ChecklistEntryModalProps {
  checklist: ChecklistDto;
  onClose: () => void;
}

const emptySubForm = { number: "", note: "" };

function buildPieceInput(form: PieceFieldsValue, parentItemId: string | undefined, activeStepIds: string[], force: boolean): AddChecklistItemInput {
  const input: AddChecklistItemInput = {
    kind: "piece",
    parentItemId,
    number: form.number.trim(),
    quantity: form.quantity ? Number(form.quantity) : undefined,
    thickness: form.thickness || undefined,
    material: form.material || undefined,
    shapeType: form.shapeType || undefined,
    note: form.note.trim() || undefined,
    activeStepIds,
    force,
  };
  if (form.shapeType === "tube") {
    input.tubeShape = form.tubeShape;
    if (form.tubeShape === "round") {
      input.tubeOD = form.tubeOD || undefined;
      input.tubeID = form.tubeID || undefined;
    } else {
      input.tubeMeasurement1 = form.tubeMeasurement1 || undefined;
      if (form.tubeShape === "rectangle") input.tubeMeasurement2 = form.tubeMeasurement2 || undefined;
      input.tubeWallThickness = form.tubeWallThickness || undefined;
    }
  } else if (form.shapeType === "shaft") {
    input.shaftMeasurement = form.shaftMeasurement || undefined;
  }
  return input;
}

/**
 * Flux d'entrée rapide (21 août 2026, spec confirmée avec l'utilisatrice) —
 * les boutons de changement de mode restent toujours visibles (pas un
 * assistant strict écran par écran) : après « Lister et poursuivre », le
 * formulaire de pièce se réinitialise et reste ouvert directement (jamais
 * besoin de rouvrir manuellement). Après un sous-assemblage, on passe
 * directement à l'entrée de pièces DANS ce sous-assemblage.
 *
 * Unicité de numéro par projet (21 août 2026) : un conflit renvoie 409 —
 * plutôt qu'un blocage définitif, un avertissement propose « Ajouter quand
 * même » qui renvoie la même requête avec force=true.
 */
export function ChecklistEntryModal({ checklist, onClose }: ChecklistEntryModalProps) {
  const queryClient = useQueryClient();
  const thicknessesQuery = useQuery({ queryKey: ["checklist-thicknesses"], queryFn: fetchChecklistThicknesses });
  const materialsQuery = useQuery({ queryKey: ["checklist-materials"], queryFn: fetchChecklistMaterials });
  const stepsQuery = useQuery({ queryKey: ["checklist-steps"], queryFn: fetchChecklistSteps });

  const [parent, setParent] = useState<{ id: string; number: string } | null>(null);
  const [mode, setMode] = useState<"piece" | "subassembly" | "achat" | null>(null);
  const [pieceForm, setPieceForm] = useState<PieceFieldsValue>(emptyPieceFields);
  const [pieceSteps, setPieceSteps] = useState<string[]>([]);
  const [subForm, setSubForm] = useState(emptySubForm);
  const [subSteps, setSubSteps] = useState<string[]>([]);
  const [achatLines, setAchatLines] = useState<string[]>([""]);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ kind: "piece" | "subassembly"; message: string } | null>(null);
  const [justAdded, setJustAdded] = useState<string[]>([]);

  const activeThicknesses = (thicknessesQuery.data ?? []).filter((t) => t.active);
  const activeMaterials = (materialsQuery.data ?? []).filter((m) => m.active);
  const activeSteps = (stepsQuery.data ?? []).filter((s) => s.active);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["checklist", "active-projects"] });
    void queryClient.invalidateQueries({ queryKey: ["project-checklists", checklist.projectId] });
  };
  const onMutationError = (kind: "piece" | "subassembly") => (err: unknown) => {
    if (err instanceof ApiError && err.status === 409) {
      setConflict({ kind, message: err.message });
      return;
    }
    setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez.");
  };

  const addPieceMutation = useMutation({
    mutationFn: (force: boolean) => addChecklistItem(checklist.id, buildPieceInput(pieceForm, parent?.id, pieceSteps, force)),
    onSuccess: ({ item }) => {
      setError(null);
      setConflict(null);
      setJustAdded((current) => [...current, item.number]);
      setPieceForm(emptyPieceFields);
      setPieceSteps([]);
      invalidate();
    },
    onError: onMutationError("piece"),
  });

  const addSubMutation = useMutation({
    mutationFn: (force: boolean) =>
      addChecklistItem(checklist.id, { kind: "subassembly", number: subForm.number.trim(), note: subForm.note.trim() || undefined, activeStepIds: subSteps, force }),
    onSuccess: ({ item }) => {
      setError(null);
      setConflict(null);
      setJustAdded((current) => [...current, item.number]);
      setParent({ id: item.id, number: item.number });
      setSubForm(emptySubForm);
      setSubSteps([]);
      setMode("piece"); // on passe directement à l'entrée des pièces de ce sous-assemblage
    },
    onError: onMutationError("subassembly"),
  });

  const achatMutation = useMutation({
    mutationFn: () => {
      const lines = achatLines.map((d) => d.trim()).filter((d) => d.length > 0);
      return submitPurchaseShortlist(
        checklist.projectId,
        lines.map((description) => ({ description })),
      );
    },
    onSuccess: () => {
      setError(null);
      setAchatLines([""]);
      setMode(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez."),
  });

  const canAddPiece = pieceForm.number.trim().length > 0 && !addPieceMutation.isPending;
  const canAddSub = subForm.number.trim().length > 0 && !addSubMutation.isPending;
  const canSubmitAchat = achatLines.some((d) => d.trim().length > 0) && !achatMutation.isPending;

  function toggleStep(current: string[], setCurrent: (v: string[]) => void, stepId: string) {
    setCurrent(current.includes(stepId) ? current.filter((s) => s !== stepId) : [...current, stepId]);
  }

  function switchMode(next: "piece" | "subassembly" | "achat") {
    setConflict(null);
    setError(null);
    setMode(next);
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <div>
            <h2 className="checklist-entry-title">
              {checklist.projectNumber} — {checklist.projectName}
            </h2>
            <p className="modal-subtitle">
              {checklist.assemblyLabel && <>{checklist.assemblyLabel} · </>}
              {parent ? `Dans le sous-assemblage ${parent.number}` : "Niveau racine"}
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <div className="modal-body">
          {error && <p className="form-error">{error}</p>}
          {justAdded.length > 0 && (
            <p className="cell-sub" style={{ marginBottom: 10 }}>
              Ajouté à la checklist : {justAdded.join(", ")}
            </p>
          )}

          <div className="checklist-mode-row">
            <button type="button" className="btn checklist-mode-btn" onClick={() => switchMode("piece")}>
              Nouvelle pièce
            </button>
            <button type="button" className="btn checklist-mode-btn" onClick={() => switchMode("achat")}>
              Nouvel achat
            </button>
            {!parent && (
              <button type="button" className="btn checklist-mode-btn" onClick={() => switchMode("subassembly")}>
                Nouveau sous-assemblage
              </button>
            )}
            {parent && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setParent(null);
                  setMode(null);
                }}
              >
                Clore le sous-assemblage
              </button>
            )}
          </div>

          {conflict && (
            <div className="checklist-conflict">
              <p>{conflict.message}</p>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => (conflict.kind === "piece" ? addPieceMutation.mutate(true) : addSubMutation.mutate(true))}
              >
                Ajouter quand même
              </button>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setConflict(null)}>
                Annuler
              </button>
            </div>
          )}

          {mode === "piece" && (
            <form
              className="form-grid"
              onSubmit={(event) => {
                event.preventDefault();
                if (canAddPiece) addPieceMutation.mutate(false);
              }}
            >
              <PieceFields
                value={pieceForm}
                onChange={(patch) => setPieceForm((current) => ({ ...current, ...patch }))}
                thicknesses={activeThicknesses}
                materials={activeMaterials}
              />
              {stepCheckboxes(activeSteps, pieceSteps, (id) => toggleStep(pieceSteps, setPieceSteps, id))}

              <div className="field field-full">
                <button type="submit" className="btn btn-small" disabled={!canAddPiece}>
                  {addPieceMutation.isPending ? "…" : "Lister et poursuivre"}
                </button>
              </div>
            </form>
          )}

          {mode === "subassembly" && (
            <form
              className="form-grid"
              onSubmit={(event) => {
                event.preventDefault();
                if (canAddSub) addSubMutation.mutate(false);
              }}
            >
              <div className="field">
                <label>Numéro d'assemblage</label>
                <input value={subForm.number} onChange={(e) => setSubForm({ ...subForm, number: e.target.value })} placeholder="ex. 02-02-000" />
              </div>
              {stepCheckboxes(activeSteps, subSteps, (id) => toggleStep(subSteps, setSubSteps, id))}
              <div className="field field-full">
                <label>Note (facultatif)</label>
                <input value={subForm.note} onChange={(e) => setSubForm({ ...subForm, note: e.target.value })} />
              </div>
              <div className="field field-full">
                <button type="submit" className="btn btn-small" disabled={!canAddSub}>
                  {addSubMutation.isPending ? "…" : "Créer et ajouter des pièces"}
                </button>
              </div>
            </form>
          )}

          {mode === "achat" && (
            <form
              className="form-grid"
              onSubmit={(event) => {
                event.preventDefault();
                if (canSubmitAchat) achatMutation.mutate();
              }}
            >
              {achatLines.map((line, index) => (
                <div key={index} className="field field-full" style={{ display: "flex", gap: 8 }}>
                  <input
                    style={{ flex: 1 }}
                    value={line}
                    onChange={(e) => setAchatLines(achatLines.map((l, i) => (i === index ? e.target.value : l)))}
                    placeholder="Description"
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    title="Retirer"
                    disabled={achatLines.length === 1}
                    onClick={() => setAchatLines(achatLines.filter((_, i) => i !== index))}
                  >
                    ×
                  </button>
                </div>
              ))}
              <div className="field field-full" style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn btn-secondary btn-small" onClick={() => setAchatLines([...achatLines, ""])}>
                  + Ligne
                </button>
                <button type="submit" className="btn btn-small" disabled={!canSubmitAchat}>
                  {achatMutation.isPending ? "…" : "Envoyer aux demandes d'achat"}
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Terminer
          </button>
        </div>
      </div>
    </div>
  );
}
