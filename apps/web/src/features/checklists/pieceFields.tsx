import type { ChecklistCatalogDto } from "../settings/api.js";

export const SHAPE_TYPES = [
  { value: "", label: "—" },
  { value: "tube", label: "Tube" },
  { value: "shaft", label: "Shaft" },
  { value: "print3d", label: "Impression 3D" },
];
export const TUBE_SHAPES = [
  { value: "round", label: "Rond" },
  { value: "square", label: "Carré" },
  { value: "rectangle", label: "Rectangle" },
];

export interface PieceFieldsValue {
  number: string;
  quantity: string;
  thickness: string;
  material: string;
  shapeType: string;
  tubeShape: string;
  tubeOD: string;
  tubeID: string;
  tubeMeasurement1: string;
  tubeMeasurement2: string;
  tubeWallThickness: string;
  shaftMeasurement: string;
  note: string;
}

const SHAPE_TYPE_LABELS = new Map(SHAPE_TYPES.map((s) => [s.value, s.label]));
const TUBE_SHAPE_LABELS = new Map(TUBE_SHAPES.map((s) => [s.value, s.label]));

export interface PieceSummaryFields {
  shapeType: string | null;
  tubeShape: string | null;
  tubeOD: string | null;
  tubeID: string | null;
  tubeMeasurement1: string | null;
  tubeMeasurement2: string | null;
  tubeWallThickness: string | null;
  shaftMeasurement: string | null;
  note: string | null;
}

/**
 * Résumé compact affiché en petit sous le numéro de pièce dans la checklist
 * (26 août 2026, rapporté par l'utilisatrice : type/forme/dimensions/note
 * saisis à l'entrée n'apparaissaient nulle part ensuite — les champs
 * étaient bien enregistrés, jamais réaffichés).
 */
export function pieceSummaryLine(item: PieceSummaryFields): string | null {
  const parts: string[] = [];
  if (item.shapeType) {
    const shapeLabel = SHAPE_TYPE_LABELS.get(item.shapeType) ?? item.shapeType;
    if (item.shapeType === "tube") {
      const tubeShapeLabel = item.tubeShape ? (TUBE_SHAPE_LABELS.get(item.tubeShape) ?? item.tubeShape) : null;
      const dims =
        item.tubeShape === "round"
          ? [item.tubeOD && `OD ${item.tubeOD}`, item.tubeID && `ID ${item.tubeID}`].filter(Boolean).join(" · ")
          : [item.tubeMeasurement1, item.tubeMeasurement2].filter(Boolean).join(" × ");
      const wall = item.tubeWallThickness ? `paroi ${item.tubeWallThickness}` : null;
      parts.push([shapeLabel, tubeShapeLabel, dims || null, wall].filter(Boolean).join(" · "));
    } else if (item.shapeType === "shaft") {
      parts.push([shapeLabel, item.shaftMeasurement].filter(Boolean).join(" · "));
    } else {
      parts.push(shapeLabel);
    }
  }
  if (item.note) parts.push(item.note);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export const emptyPieceFields: PieceFieldsValue = {
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

/** Champs de pièce partagés entre l'entrée rapide (ChecklistEntryModal) et la modification d'une ligne existante (ChecklistItemEditModal). */
export function PieceFields({
  value,
  onChange,
  thicknesses,
  materials,
  numberLabel = "Numéro de pièce",
}: {
  value: PieceFieldsValue;
  onChange: (patch: Partial<PieceFieldsValue>) => void;
  thicknesses: ChecklistCatalogDto[];
  materials: ChecklistCatalogDto[];
  numberLabel?: string;
}) {
  return (
    <>
      <div className="field">
        <label>{numberLabel}</label>
        <input value={value.number} onChange={(e) => onChange({ number: e.target.value })} placeholder="ex. 07-011" />
      </div>
      <div className="field">
        <label>Quantité</label>
        <input type="number" min={1} value={value.quantity} onChange={(e) => onChange({ quantity: e.target.value })} />
      </div>
      <div className="field">
        <label>Épaisseur</label>
        <select value={value.thickness} onChange={(e) => onChange({ thickness: e.target.value })}>
          <option value="">—</option>
          {thicknesses.map((t) => (
            <option key={t.id} value={t.label}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Matériaux</label>
        <select value={value.material} onChange={(e) => onChange({ material: e.target.value })}>
          <option value="">—</option>
          {materials.map((m) => (
            <option key={m.id} value={m.label}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Type (au besoin)</label>
        <select value={value.shapeType} onChange={(e) => onChange({ shapeType: e.target.value })}>
          {SHAPE_TYPES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {value.shapeType === "tube" && (
        <>
          <div className="field">
            <label>Forme du tube</label>
            <select value={value.tubeShape} onChange={(e) => onChange({ tubeShape: e.target.value })}>
              {TUBE_SHAPES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          {value.tubeShape === "round" ? (
            <>
              <div className="field">
                <label>OD</label>
                <input value={value.tubeOD} onChange={(e) => onChange({ tubeOD: e.target.value })} placeholder="ex. 1 1/4 po" />
              </div>
              <div className="field">
                <label>ID</label>
                <input value={value.tubeID} onChange={(e) => onChange({ tubeID: e.target.value })} />
              </div>
            </>
          ) : (
            <>
              <div className="field">
                <label>{value.tubeShape === "rectangle" ? "Largeur" : "Mesure"}</label>
                <input value={value.tubeMeasurement1} onChange={(e) => onChange({ tubeMeasurement1: e.target.value })} />
              </div>
              {value.tubeShape === "rectangle" && (
                <div className="field">
                  <label>Hauteur</label>
                  <input value={value.tubeMeasurement2} onChange={(e) => onChange({ tubeMeasurement2: e.target.value })} />
                </div>
              )}
              <div className="field">
                <label>Épaisseur de paroi</label>
                <input value={value.tubeWallThickness} onChange={(e) => onChange({ tubeWallThickness: e.target.value })} />
              </div>
            </>
          )}
        </>
      )}
      {value.shapeType === "shaft" && (
        <div className="field">
          <label>Mesure</label>
          <input value={value.shaftMeasurement} onChange={(e) => onChange({ shaftMeasurement: e.target.value })} />
        </div>
      )}

      <div className="field field-full">
        <label>Note (facultatif)</label>
        <input value={value.note} onChange={(e) => onChange({ note: e.target.value })} />
      </div>
    </>
  );
}

export function stepCheckboxes(
  activeSteps: ChecklistCatalogDto[],
  current: string[],
  toggle: (stepId: string) => void,
) {
  return (
    <div className="field field-full">
      <label>Étapes qui s'appliquent</label>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {activeSteps.map((step) => (
          <label key={step.id} style={{ display: "flex", alignItems: "center", gap: 4, fontWeight: 400 }}>
            <input type="checkbox" checked={current.includes(step.id)} onChange={() => toggle(step.id)} />
            {step.label}
          </label>
        ))}
      </div>
    </div>
  );
}
