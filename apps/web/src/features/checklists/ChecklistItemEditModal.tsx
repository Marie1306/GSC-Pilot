import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchChecklistThicknesses, fetchChecklistMaterials, fetchChecklistSteps } from "../settings/api.js";
import { ApiError } from "../../lib/apiClient.js";
import { updateChecklistItem, type ChecklistItemDto, type UpdateChecklistItemInput } from "./api.js";
import { PieceFields, stepCheckboxes, type PieceFieldsValue } from "./pieceFields.js";
import "./checklist.css";

interface ChecklistItemEditModalProps {
  item: ChecklistItemDto;
  projectId: string;
  onClose: () => void;
}

function toFormValue(item: ChecklistItemDto): PieceFieldsValue {
  return {
    number: item.number,
    quantity: item.quantity != null ? String(item.quantity) : "",
    thickness: item.thickness ?? "",
    material: item.material ?? "",
    shapeType: item.shapeType ?? "",
    tubeShape: item.tubeShape ?? "round",
    tubeOD: item.tubeOD ?? "",
    tubeID: item.tubeID ?? "",
    tubeMeasurement1: item.tubeMeasurement1 ?? "",
    tubeMeasurement2: item.tubeMeasurement2 ?? "",
    tubeWallThickness: item.tubeWallThickness ?? "",
    shaftMeasurement: item.shaftMeasurement ?? "",
    note: item.note ?? "",
  };
}

/**
 * Modification d'une ligne déjà enregistrée (21 août 2026, spec confirmée :
 * « Toutes les lignes une fois enregistrées dans la checklist doivent
 * pouvoir rester modifiables par Direction »). Un item piece OU
 * subassembly partage la même forme de données — un seul formulaire pour
 * les deux. Même avertissement de conflit d'unicité (« Ajouter quand même
 * ») qu'à la création.
 */
export function ChecklistItemEditModal({ item, projectId, onClose }: ChecklistItemEditModalProps) {
  const queryClient = useQueryClient();
  const thicknessesQuery = useQuery({ queryKey: ["checklist-thicknesses"], queryFn: fetchChecklistThicknesses });
  const materialsQuery = useQuery({ queryKey: ["checklist-materials"], queryFn: fetchChecklistMaterials });
  const stepsQuery = useQuery({ queryKey: ["checklist-steps"], queryFn: fetchChecklistSteps });

  const [form, setForm] = useState<PieceFieldsValue>(() => toFormValue(item));
  const [activeStepIds, setActiveStepIds] = useState<string[]>(() => item.steps.filter((s) => s.active).map((s) => s.stepId));
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);

  const activeThicknesses = (thicknessesQuery.data ?? []).filter((t) => t.active);
  const activeMaterials = (materialsQuery.data ?? []).filter((m) => m.active);
  const activeSteps = (stepsQuery.data ?? []).filter((s) => s.active);

  const buildPatch = (force: boolean): UpdateChecklistItemInput => {
    const patch: UpdateChecklistItemInput = {
      number: form.number.trim(),
      quantity: form.quantity ? Number(form.quantity) : null,
      thickness: form.thickness || null,
      material: form.material || null,
      shapeType: form.shapeType || null,
      note: form.note.trim() || null,
      activeStepIds,
      force,
    };
    if (form.shapeType === "tube") {
      patch.tubeShape = form.tubeShape;
      if (form.tubeShape === "round") {
        patch.tubeOD = form.tubeOD || null;
        patch.tubeID = form.tubeID || null;
      } else {
        patch.tubeMeasurement1 = form.tubeMeasurement1 || null;
        if (form.tubeShape === "rectangle") patch.tubeMeasurement2 = form.tubeMeasurement2 || null;
        patch.tubeWallThickness = form.tubeWallThickness || null;
      }
    } else {
      patch.tubeShape = null;
      patch.tubeOD = null;
      patch.tubeID = null;
      patch.tubeMeasurement1 = null;
      patch.tubeMeasurement2 = null;
      patch.tubeWallThickness = null;
    }
    patch.shaftMeasurement = form.shapeType === "shaft" ? form.shaftMeasurement || null : null;
    return patch;
  };

  const saveMutation = useMutation({
    mutationFn: (force: boolean) => updateChecklistItem(item.id, buildPatch(force)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["checklist", "active-projects"] });
      void queryClient.invalidateQueries({ queryKey: ["checklist-project-view", projectId] });
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        setConflict(err.message);
        return;
      }
      setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez.");
    },
  });

  const canSave = form.number.trim().length > 0 && !saveMutation.isPending;

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <div>
            <h2 className="checklist-entry-title">Modifier la ligne</h2>
            <p className="modal-subtitle">{item.kind === "subassembly" ? "Sous-assemblage" : "Pièce"}</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <div className="modal-body">
          {error && <p className="form-error">{error}</p>}
          {conflict && (
            <div className="checklist-conflict">
              <p>{conflict}</p>
              <button type="button" className="btn btn-small" onClick={() => saveMutation.mutate(true)}>
                Enregistrer quand même
              </button>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setConflict(null)}>
                Annuler
              </button>
            </div>
          )}

          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              if (canSave) saveMutation.mutate(false);
            }}
          >
            <PieceFields
              value={form}
              onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
              thicknesses={activeThicknesses}
              materials={activeMaterials}
              numberLabel={item.kind === "subassembly" ? "Numéro d'assemblage" : "Numéro de pièce"}
            />
            {stepCheckboxes(activeSteps, activeStepIds, (id) =>
              setActiveStepIds((current) => (current.includes(id) ? current.filter((s) => s !== id) : [...current, id])),
            )}

            <div className="field field-full" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="submit" className="btn btn-small" disabled={!canSave}>
                {saveMutation.isPending ? "…" : "Enregistrer"}
              </button>
              <button type="button" className="btn btn-secondary btn-small" onClick={onClose}>
                Annuler
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
