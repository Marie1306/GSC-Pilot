import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/apiClient.js";
import { fetchErrorReportSubjects, createErrorReport, formatCurrency } from "./api.js";
import { readAndCompressImage } from "./imageCapture.js";

interface ErrorReportFormProps {
  onClose: () => void;
}

/**
 * "+Nouveau rapport d'erreur" (28 août 2026, spec confirmée) — date
 * automatique verrouillée à aujourd'hui (createdAt côté serveur, aucun
 * champ de date ici). Employé visé restreint à Employé/Magasinier
 * (fetchErrorReportSubjects, déjà filtré côté serveur par
 * canBeErrorReportSubject). Valeur des heures affichée en direct au taux
 * réel de l'employé sélectionné (costRate exposé par cette route
 * uniquement — jamais atteignable en dehors de canAccessErrorReports).
 */
export function ErrorReportForm({ onClose }: ErrorReportFormProps) {
  const queryClient = useQueryClient();
  const subjectsQuery = useQuery({ queryKey: ["error-reports", "subjects"], queryFn: fetchErrorReportSubjects });
  const [employeeId, setEmployeeId] = useState("");
  const [materialValue, setMaterialValue] = useState("");
  const [hoursLost, setHoursLost] = useState("");
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [processingPhoto, setProcessingPhoto] = useState(false);

  const subjects = subjectsQuery.data?.employees ?? [];
  const selectedEmployee = subjects.find((subject) => subject.id === employeeId);
  const hoursValuePreview = selectedEmployee ? (Number(hoursLost) || 0) * selectedEmployee.costRate : 0;

  const mutation = useMutation({
    mutationFn: () =>
      createErrorReport({
        employeeId,
        materialValue: Number(materialValue) || 0,
        hoursLost: Number(hoursLost) || 0,
        note: note.trim() || undefined,
        photos,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["error-reports"] });
      onClose();
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez."),
  });

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setProcessingPhoto(true);
    try {
      const compressed = await Promise.all(Array.from(files).map((file) => readAndCompressImage(file)));
      setPhotos((current) => [...current, ...compressed]);
    } catch {
      setError("Impossible de traiter la photo — réessayez.");
    } finally {
      setProcessingPhoto(false);
    }
  }

  const canSubmit = !!employeeId && ((Number(materialValue) || 0) > 0 || (Number(hoursLost) || 0) > 0) && !mutation.isPending;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(event) => event.stopPropagation()}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) mutation.mutate();
          }}
        >
          <div className="modal-header">
            <div>
              <h2>Nouveau rapport d'erreur</h2>
              <p className="modal-subtitle">Date automatique — aujourd'hui.</p>
            </div>
            <button type="button" className="modal-close" aria-label="Fermer" onClick={onClose}>
              ×
            </button>
          </div>
          <div className="modal-body">
            {error && <p className="form-error">{error}</p>}
            <div className="form-grid">
              <div className="field field-full">
                <label htmlFor="er-employee">Employé visé</label>
                <select id="er-employee" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} required>
                  <option value="" disabled>
                    Sélectionner…
                  </option>
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="er-material">Valeur matériel ($)</label>
                <input
                  id="er-material"
                  type="number"
                  min={0}
                  step="0.01"
                  value={materialValue}
                  onChange={(event) => setMaterialValue(event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="er-hours">Heures perdues</label>
                <input id="er-hours" type="number" min={0} step="0.25" value={hoursLost} onChange={(event) => setHoursLost(event.target.value)} />
              </div>
              {selectedEmployee && (
                <div className="field field-full">
                  <p style={{ margin: 0, fontSize: 13, color: "var(--gsc-color-muted)" }}>
                    Valeur des heures (taux réel de {selectedEmployee.name}) : <strong>{formatCurrency(hoursValuePreview)}</strong>
                  </p>
                </div>
              )}
              <div className="field field-full">
                <label htmlFor="er-note">Note (facultatif)</label>
                <textarea id="er-note" rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
              </div>
              <div className="field field-full">
                <label>Photos</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <label className="btn btn-secondary btn-small" style={{ cursor: "pointer" }}>
                    📷 Prendre une photo
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      style={{ display: "none" }}
                      onChange={(event) => {
                        void handleFiles(event.target.files);
                        event.target.value = "";
                      }}
                    />
                  </label>
                  <label className="btn btn-secondary btn-small" style={{ cursor: "pointer" }}>
                    📁 Télécharger une photo
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      style={{ display: "none" }}
                      onChange={(event) => {
                        void handleFiles(event.target.files);
                        event.target.value = "";
                      }}
                    />
                  </label>
                  {processingPhoto && <span style={{ fontSize: 13, color: "var(--gsc-color-muted)" }}>Traitement…</span>}
                </div>
                {photos.length > 0 && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                    {photos.map((photo, index) => (
                      <div key={index} style={{ position: "relative" }}>
                        <img src={photo} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 6 }} />
                        <button
                          type="button"
                          className="icon-btn"
                          title="Retirer"
                          style={{ position: "absolute", top: -6, right: -6 }}
                          onClick={() => setPhotos((current) => current.filter((_, i) => i !== index))}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn" disabled={!canSubmit}>
              {mutation.isPending ? "Enregistrement…" : "Enregistrer le rapport"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
