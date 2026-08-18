import type { ReactNode } from "react";

interface OptionsDrawerProps {
  eyebrow: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Tiroir latéral droit générique (18 août 2026) — extrait de
 * ProjectOptionsMenu.tsx au moment où le menu Options des demandes clients
 * en a eu besoin aussi (deuxième usage réel), pour ne pas dupliquer la même
 * structure backdrop/tiroir/en-tête deux fois. Calqué sur la référence v19 :
 * petit libellé majuscule au-dessus du titre, X pour fermer, glisse depuis
 * la droite par-dessus le contenu plutôt que de le pousser.
 */
export function OptionsDrawer({ eyebrow, title, onClose, children }: OptionsDrawerProps) {
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <p className="drawer-eyebrow">{eyebrow}</p>
            <h2>{title}</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>
        <div className="drawer-body">{children}</div>
      </div>
    </div>
  );
}

interface OptionRowProps {
  icon: string;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  disabledNote?: string;
}

/** Une ligne du menu Options — icône, libellé, chevron — réelle ou en attente d'un module pas encore construit. */
export function OptionRow({ icon, label, onClick, disabled, disabledNote }: OptionRowProps) {
  return (
    <button type="button" className="options-row" disabled={disabled} onClick={onClick} title={disabled ? disabledNote : undefined}>
      <span className="options-row-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="options-row-label">
        {label}
        {disabled && <span className="options-row-soon"> (bientôt)</span>}
      </span>
      <span className="options-row-chevron" aria-hidden="true">
        ›
      </span>
    </button>
  );
}

export function OptionSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="options-section">
      <p className="options-section-title">{title}</p>
      {children}
    </div>
  );
}
