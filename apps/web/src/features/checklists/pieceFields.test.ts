import { describe, it, expect } from "vitest";
import { pieceSummaryLine, type PieceSummaryFields } from "./pieceFields.js";

function baseFields(overrides: Partial<PieceSummaryFields> = {}): PieceSummaryFields {
  return {
    shapeType: null,
    tubeShape: null,
    tubeOD: null,
    tubeID: null,
    tubeMeasurement1: null,
    tubeMeasurement2: null,
    tubeWallThickness: null,
    shaftMeasurement: null,
    note: null,
    ...overrides,
  };
}

describe("pieceSummaryLine", () => {
  it("retourne null quand rien n'est rempli (comportement actuel des lignes sans type/note)", () => {
    expect(pieceSummaryLine(baseFields())).toBeNull();
  });

  it("tube rectangle : forme + largeur × hauteur + épaisseur de paroi (exemple réel de l'utilisatrice)", () => {
    const line = pieceSummaryLine(
      baseFields({ shapeType: "tube", tubeShape: "rectangle", tubeMeasurement1: "1", tubeMeasurement2: "3", tubeWallThickness: "1/8" }),
    );
    expect(line).toBe("Tube · Rectangle · 1 × 3 · paroi 1/8");
  });

  it("tube rond : OD/ID plutôt que largeur × hauteur", () => {
    const line = pieceSummaryLine(baseFields({ shapeType: "tube", tubeShape: "round", tubeOD: "1 1/4 po", tubeID: "1 po" }));
    expect(line).toBe("Tube · Rond · OD 1 1/4 po · ID 1 po");
  });

  it("tube carré : une seule mesure (tubeMeasurement1), pas de symbole ×", () => {
    const line = pieceSummaryLine(baseFields({ shapeType: "tube", tubeShape: "square", tubeMeasurement1: "2", tubeWallThickness: "1/4" }));
    expect(line).toBe("Tube · Carré · 2 · paroi 1/4");
  });

  it("shaft : libellé + mesure", () => {
    const line = pieceSummaryLine(baseFields({ shapeType: "shaft", shaftMeasurement: "3/4 po" }));
    expect(line).toBe("Shaft · 3/4 po");
  });

  it("impression 3D : juste le libellé, aucun champ de dimension pour ce type", () => {
    const line = pieceSummaryLine(baseFields({ shapeType: "print3d" }));
    expect(line).toBe("Impression 3D");
  });

  it("note manuelle seule (aucun type) : la note apparaît quand même", () => {
    const line = pieceSummaryLine(baseFields({ note: "Vérifier avec le client avant de couper" }));
    expect(line).toBe("Vérifier avec le client avant de couper");
  });

  it("type ET note manuelle : les deux apparaissent, la note à la fin", () => {
    const line = pieceSummaryLine(
      baseFields({ shapeType: "tube", tubeShape: "round", tubeOD: "1 po", note: "Pièce critique" }),
    );
    expect(line).toBe("Tube · Rond · OD 1 po · Pièce critique");
  });
});
