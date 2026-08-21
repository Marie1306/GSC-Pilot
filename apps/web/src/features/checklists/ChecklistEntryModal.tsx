import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchChecklistThicknesses, fetchChecklistMaterials, fetchChecklistSteps } from "../settings/api.js";
import { submitPurchaseShortlist } from "../purchases/api.js";
import { ApiError } from "../../lib/apiClient.js";
import { addChecklistItem, type ChecklistDto, type AddChecklistItemInput } from "./api.js";

interface ChecklistEntryModalProps {
  checklist: ChecklistDto;
  onClose: () => void;
}

const SHAPE_TYPES = [
  { value: "", label: "—" },
  { value: "tube", label: "Tube" },
  { value: "shaft", label: "Shaft" },
  { value: "print3d", label: "Impression 3D" },
];
const TUBE_SHAPES = [
  { value: "round", label: "Rond" },
  { value: "square", label: "Carré" },
  { value: "rectangle", label: "Rectangle" },
];

const emptyPieceForm = {
  number: "",
  quantity: "",
  thickness: "",
  material: "",
  shapeType: "",
  tubeShape: "round",
  tubeOD: "",
  tubeID: "",
  tubeMeasurement1: "",
  tubeMeasurement2: "",
  tubeWallThickness: "",
  shaftMeasurement: "",
  note: "",
};
type PieceForm = typeof emptyPieceForm;

const emptySubForm = { number: "", note: "" };

/**
 * Flux d'entrée rapide (21 août 2026, spec confirmée avec l'utilisatrice) —
 * les boutons de changement de mode restent toujours visibles (pas un
 * assistant strict écran par écran) : après « Lister et poursuivre », le
 * formulaire de pièce se réinitialise et reste ouvert directement (jamais
 * besoin de rouvrir manuellement). Après un sous-assemblage, on passe
 * directement à l'entrée de pièces DANS ce sous-assemblage.
 */
export function ChecklistEntryModal({ checklist, onClose }: ChecklistEntryModalProps) {
  const queryClient = useQueryClient();
  const thicknessesQuery = useQuery({ queryKey: ["checklist-thicknesses"], queryFn: fetchChecklistThicknesses });
  const materialsQuery = useQuery({ queryKey: ["checklist-materials"], queryFn: fetchChecklistMaterials });
  const stepsQuery = useQuery({ queryKey: ["checklist-steps"], queryFn: fetchChecklistSteps });

  const [parent, setParent] = useState<{ id: string; number: string } | null>(null);
  const [mode, setMode] = useState<"piece" | "subassembly" | "achat" | null>(null);
  const [pieceForm, setPieceForm] = useState<PieceForm>(emptyPieceForm);
  const [pieceSteps, setPieceSteps] = useState<string[]>([]);
  const [subForm, setSubForm] = useState(emptySubForm);
  const [subSteps, setSubSteps] = useState<string[]>([]);
  const [achatLines, setAchatLines] = useState<string[]>([""]);
  const [error, setError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<string[]>([]);

  const activeThicknesses = (thicknessesQuery.data ?? []).filter((t) => t.active);
  const activeMaterials = (materialsQuery.data ?? []).filter((m) => m.active);
  const activeSteps = (stepsQuery.data ?? []).filter((s) => s.active);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["checklist", "active-items"] });
  const onMutationError = (err: unknown) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez.");

  const addPieceMutation = useMutation({
    mutationFn: () => {
      const input: AddChecklistItemInput = {
        kind: "piece",
        parentItemId: parent?.id,
        number: pieceForm.number.trim(),
        quantity: pieceForm.quantity ? Number(pieceForm.quantity) : undefined,
        thickness: pieceForm.thickness || undefined,
        material: pieceForm.material || undefined,
        shapeType: pieceForm.shapeType || undefined,
        note: pieceForm.note.trim() || undefined,
        activeStepIds: pieceSteps,
      };
      if (pieceForm.shapeType === "tube") {
        input.tubeShape = pieceForm.tubeShape;
        if (pieceForm.tubeShape === "round") {
          input.tubeOD = pieceForm.tubeOD || undefined;
          input.tubeID = pieceForm.tubeID || undefined;
        } else {
          input.tubeMeasurement1 = pieceForm.tubeMeasurement1 || undefined;
          if (pieceForm.tubeShape === "rectangle") input.tubeMeasurement2 = pieceForm.tubeMeasurement2 || undefined;
          input.tubeWallThickness = pieceForm.tubeWallThickness || undefined;
        }
      } else if (pieceForm.shapeType === "shaft") {
        input.shaftMeasurement = pieceForm.shaftMeasurement || undefined;
      }
      return addChecklistItem(checklist.id, input);
    },
    onSuccess: ({ item }) => {
      setError(null);
      setJustAdded((current) => [...current, item.number]);
      setPieceForm(emptyPieceForm);
      setPieceSteps([]);
      invalidate();
    },
    onError: onMutationError,
  });

  const addSubMutation = useMutation({
    mutationFn: () =>
      addChecklistItem(checklist.id, { kind: "subassembly", number: subForm.number.trim(), note: subForm.note.trim() || undefined, activeStepIds: subSteps }),
    onSuccess: ({ item }) => {
      setError(null);
      setJustAdded((current) => [...current, item.number]);
      setParent({ id: item.id, number: item.number });
      setSubForm(emptySubForm);
      setSubSteps([]);
      setMode("piece"); // on passe directement à l'entrée des pièces de ce sous-assemblage
    },
    onError: onMutationError,
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
    onError: onMutationError,
  });

  const canAddPiece = pieceForm.number.trim().length > 0 && !addPieceMutation.isPending;
  const canAddSub = subForm.number.trim().length > 0 && !addSubMutation.isPending;
  const canSubmitAchat = achatLines.some((d) => d.trim().length > 0) && !achatMutation.isPending;

  function toggleStep(current: string[], setCurrent: (v: string[]) => void, stepId: string) {
    setCurrent(current.includes(stepId) ? current.filter((s) => s !== stepId) : [...current, stepId]);
  }

  function stepCheckboxes(current: string[], setCurrent: (v: string[]) => void) {
    return (
      <div className="field field-full">
        <label>Étapes qui s'appliquent</label>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {activeSteps.map((step) => (
            <label key={step.id} style={{ display: "flex", alignItems: "center", gap: 4, fontWeight: 400 }}>
              <input type="checkbox" checked={current.includes(step.id)} onChange={() => toggleStep(current, setCurrent, step.id)} />
              {step.label}
            </label>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <div>
            <h2>
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

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            <button type="button" className={`btn btn-small ${mode === "piece" ? "" : "btn-secondary"}`} onClick={() => setMode("piece")}>
              Nouvelle pièce
            </button>
            <button type="button" className={`btn btn-small ${mode === "achat" ? "" : "btn-secondary"}`} onClick={() => setMode("achat")}>
              Nouvel achat
            </button>
            {!parent && (
              <button type="button" className={`btn btn-small ${mode === "subassembly" ? "" : "btn-secondary"}`} onClick={() => setMode("subassembly")}>
                Nouveau sous-assemblage
              </button>
            )}
            {parent && (
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={() => {
                  setParent(null);
                  setMode(null);
                }}
              >
                Clore le sous-assemblage
              </button>
            )}
          </div>

          {mode === "piece" && (
            <form
              className="form-grid"
              onSubmit={(event) => {
                event.preventDefault();
                if (canAddPiece) addPieceMutation.mutate();
              }}
            >
              <div className="field">
                <label>Numéro de pièce</label>
                <input value={pieceForm.number} onChange={(e) => setPieceForm({ ...pieceForm, number: e.target.value })} placeholder="ex. 07-011" />
              </div>
              <div className="field">
                <label>Quantité</label>
                <input type="number" min={1} value={pieceForm.quantity} onChange={(e) => setPieceForm({ ...pieceForm, quantity: e.target.value })} />
              </div>
              <div className="field">
                <label>Épaisseur</label>
                <select value={pieceForm.thickness} onChange={(e) => setPieceForm({ ...pieceForm, thickness: e.target.value })}>
                  <option value="">—</option>
                  {activeThicknesses.map((t) => (
                    <option key={t.id} value={t.label}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Matériaux</label>
                <select value={pieceForm.material} onChange={(e) => setPieceForm({ ...pieceForm, material: e.target.value })}>
                  <option value="">—</option>
                  {activeMaterials.map((m) => (
                    <option key={m.id} value={m.label}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Type (au besoin)</label>
                <select value={pieceForm.shapeType} onChange={(e) => setPieceForm({ ...pieceForm, shapeType: e.target.value })}>
                  {SHAPE_TYPES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              {pieceForm.shapeType === "tube" && (
                <>
                  <div className="field">
                    <label>Forme du tube</label>
                    <select value={pieceForm.tubeShape} onChange={(e) => setPieceForm({ ...pieceForm, tubeShape: e.target.value })}>
                      {TUBE_SHAPES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {pieceForm.tubeShape === "round" ? (
                    <>
                      <div className="field">
                        <label>OD</label>
                        <input value={pieceForm.tubeOD} onChange={(e) => setPieceForm({ ...pieceForm, tubeOD: e.target.value })} placeholder="ex. 1 1/4 po" />
                      </div>
                      <div className="field">
                        <label>ID</label>
                        <input value={pieceForm.tubeID} onChange={(e) => setPieceForm({ ...pieceForm, tubeID: e.target.value })} />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="field">
                        <label>{pieceForm.tubeShape === "rectangle" ? "Largeur" : "Mesure"}</label>
                        <input value={pieceForm.tubeMeasurement1} onChange={(e) => setPieceForm({ ...pieceForm, tubeMeasurement1: e.target.value })} />
                      </div>
                      {pieceForm.tubeShape === "rectangle" && (
                        <div className="field">
                          <label>Hauteur</label>
                          <input value={pieceForm.tubeMeasurement2} onChange={(e) => setPieceForm({ ...pieceForm, tubeMeasurement2: e.target.value })} />
                        </div>
                      )}
                      <div className="field">
                        <label>Épaisseur de paroi</label>
                        <input value={pieceForm.tubeWallThickness} onChange={(e) => setPieceForm({ ...pieceForm, tubeWallThickness: e.target.value })} />
                      </div>
                    </>
                  )}
                </>
              )}
              {pieceForm.shapeType === "shaft" && (
                <div className="field">
                  <label>Mesure</label>
                  <input value={pieceForm.shaftMeasurement} onChange={(e) => setPieceForm({ ...pieceForm, shaftMeasurement: e.target.value })} />
                </div>
              )}

              {stepCheckboxes(pieceSteps, setPieceSteps)}

              <div className="field field-full">
                <label>Note (facultatif)</label>
                <input value={pieceForm.note} onChange={(e) => setPieceForm({ ...pieceForm, note: e.target.value })} />
              </div>

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
                if (canAddSub) addSubMutation.mutate();
              }}
            >
              <div className="field">
                <label>Numéro d'assemblage</label>
                <input value={subForm.number} onChange={(e) => setSubForm({ ...subForm, number: e.target.value })} placeholder="ex. 02-02-000" />
              </div>
              {stepCheckboxes(subSteps, setSubSteps)}
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
