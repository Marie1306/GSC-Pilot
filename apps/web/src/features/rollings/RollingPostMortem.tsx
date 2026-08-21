import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canManagePostMortem } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ApiError } from "../../lib/apiClient.js";
import { fetchRollingPostMortem, updateRollingPostMortem, formatCurrency } from "./api.js";

interface RollingPostMortemProps {
  id: string;
  onClose: () => void;
}

/**
 * Post-mortem d'un roulement (spec confirmée : « la livraison termine le
 * roulement → statut "Terminé" → apparaît au Post-mortem »). Volontairement
 * sans comparatif/coût réel contrairement au Post-mortem d'un projet —
 * aucune donnée d'heures/achats n'existe pour un roulement, seul le revenu
 * est réel ici (voir rollings/service.ts).
 */
export function RollingPostMortem({ id, onClose }: RollingPostMortemProps) {
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const detailQuery = useQuery({ queryKey: ["rolling", id, "post-mortem"], queryFn: () => fetchRollingPostMortem(id) });
  const postMortem = detailQuery.data?.postMortem;

  const [depassements, setDepassements] = useState<string | null>(null);
  const [ameliorations, setAmeliorations] = useState<string | null>(null);
  const [recommandation, setRecommandation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: (input: { depassements?: string; ameliorations?: string; recommandation?: string }) => updateRollingPostMortem(id, input),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["rolling", id, "post-mortem"] });
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez."),
  });

  if (!employee) return null;
  const canManage = canManagePostMortem(employee.persona);

  if (!postMortem) {
    return (
      <div className="modal-backdrop">
        <div className="modal">
          <div className="modal-body">{detailQuery.isError ? "Post-mortem introuvable." : "Chargement…"}</div>
        </div>
      </div>
    );
  }

  const depassementsValue = depassements ?? postMortem.postMortemDepassements ?? "";
  const ameliorationsValue = ameliorations ?? postMortem.postMortemAmeliorations ?? "";
  const recommandationValue = recommandation ?? postMortem.postMortemRecommandation ?? "";

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <div>
            <h2>Post-mortem — {postMortem.company ?? postMortem.contactName}</h2>
            <p className="modal-subtitle">Roulement terminé.</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>
        <div className="modal-body">
          {postMortem.sold !== undefined && (
            <div className="stat-tile-grid" style={{ marginBottom: 20 }}>
              <div className="stat-tile">
                <span className="stat-tile-label">Revenu</span>
                <span className="stat-tile-value">{formatCurrency(postMortem.sold)}</span>
              </div>
            </div>
          )}

          <div className="field">
            <label>Dépassements</label>
            <textarea rows={3} style={{ width: "100%" }} value={depassementsValue} onChange={(e) => setDepassements(e.target.value)} disabled={!canManage} />
          </div>
          <div className="field">
            <label>Améliorations</label>
            <textarea rows={3} style={{ width: "100%" }} value={ameliorationsValue} onChange={(e) => setAmeliorations(e.target.value)} disabled={!canManage} />
          </div>
          <div className="field">
            <label>Recommandation</label>
            <textarea
              rows={3}
              style={{ width: "100%" }}
              value={recommandationValue}
              onChange={(e) => setRecommandation(e.target.value)}
              disabled={!canManage}
            />
          </div>

          {canManage && (
            <button
              type="button"
              className="btn btn-small"
              disabled={saveMutation.isPending}
              onClick={() =>
                saveMutation.mutate({ depassements: depassementsValue, ameliorations: ameliorationsValue, recommandation: recommandationValue })
              }
            >
              {saveMutation.isPending ? "Enregistrement…" : "Enregistrer l'analyse"}
            </button>
          )}
          {error && <p className="form-error">{error}</p>}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
