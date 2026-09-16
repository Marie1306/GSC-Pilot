import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { canManageToolboxLibrary } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ChecklistCatalogCard } from "../settings/ChecklistCatalogCard.js";
import { fetchToolboxCategories, createToolboxCategory, updateToolboxCategory } from "./api.js";
import { ToolboxChartsPanel } from "./ToolboxChartsPanel.js";
import { ToolboxHistoryList } from "./ToolboxHistoryList.js";
import { ToolboxChatThread } from "./ToolboxChatThread.js";
import "./toolbox.css";

/**
 * Boîte à outils (16 septembre 2026) — choix de catégorie d'abord (limite le
 * contexte envoyé à l'IA à une seule discipline à la fois), diverge donc du
 * patron Page/List/Form/Detail des autres modules. Gestion des catégories
 * réutilise ChecklistCatalogCard telle quelle (mêmes props exactes que les
 * 3 catalogues Checklist), affichée ICI plutôt que dans Paramètres —
 * Administration/Propriétaire n'ont pas accès à Paramètres (canAccessSettings
 * = Direction seule), incompatible avec le trio requis pour cette gestion.
 */
export function ToolboxPage() {
  const { employee } = useAuth();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const categoriesQuery = useQuery({ queryKey: ["toolbox-categories"], queryFn: fetchToolboxCategories });
  const categories = (categoriesQuery.data ?? []).filter((c) => c.active);
  const canManage = !!employee && canManageToolboxLibrary(employee.persona);
  const selectedCategory = categories.find((c) => c.id === categoryId);

  if (categoryId && selectedCategory) {
    return (
      <div>
        <div className="card-band-header" style={{ marginTop: 20 }}>
          <button type="button" className="btn btn-secondary btn-small" onClick={() => setCategoryId(null)}>
            ‹ Catégories
          </button>
          <h3 style={{ margin: 0 }}>{selectedCategory.label}</h3>
        </div>
        <ToolboxChartsPanel categoryId={categoryId} />
        <div className="card" style={{ marginTop: 20 }}>
          <ToolboxHistoryList categoryId={categoryId} onOpenThread={setOpenThreadId} />
        </div>
        {openThreadId && <ToolboxChatThread threadId={openThreadId} onClose={() => setOpenThreadId(null)} />}
      </div>
    );
  }

  return (
    <div>
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-band-header">
          <h3>Boîte à outils</h3>
          {canManage && (
            <button type="button" className="btn btn-secondary btn-small" onClick={() => setManageOpen(true)}>
              Gérer les catégories
            </button>
          )}
        </div>
        <p style={{ margin: "4px 0 0", color: "var(--gsc-color-muted)", fontSize: 13 }}>
          Choisissez une catégorie pour poser une question technique, citée directement dans les chartes de référence.
        </p>
        {categories.length === 0 && <p className="empty-hint">Aucune catégorie active pour l'instant.</p>}
        <div className="toolbox-category-grid">
          {categories.map((category) => (
            <button key={category.id} type="button" className="toolbox-category-card" onClick={() => setCategoryId(category.id)}>
              {category.label}
            </button>
          ))}
        </div>
      </div>

      {manageOpen && (
        <div className="modal-backdrop" onClick={() => setManageOpen(false)}>
          <div className="modal" style={{ maxWidth: 600 }} onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>Catégories — Boîte à outils</h2>
                <p className="modal-subtitle">Chaque catégorie regroupe ses propres chartes de référence.</p>
              </div>
              <button type="button" className="modal-close" aria-label="Fermer" onClick={() => setManageOpen(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <ChecklistCatalogCard
                title="Catégories"
                description="Ex. Plasma, Pliage, Programmation panneaux."
                queryKey="toolbox-categories"
                fetchFn={fetchToolboxCategories}
                createFn={createToolboxCategory}
                updateFn={updateToolboxCategory}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
