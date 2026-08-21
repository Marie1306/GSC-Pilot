/**
 * Icônes de navigation (21 août 2026, sur demande de l'utilisatrice —
 * remplace la barre du bas par la barre latérale groupée avec icônes de la
 * v19, visuel/libellés seulement, aucune logique de permission touchée).
 * SVG en ligne, simples et cohérents (trait, sans dépendance externe) —
 * jamais une correspondance pixel-perfect avec les icônes v19, juste des
 * équivalents reconnaissables.
 */
import type { SVGProps } from "react";

function Base(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width={18} height={18} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" {...props} />
  );
}

const PATHS: Record<string, (props: SVGProps<SVGSVGElement>) => React.JSX.Element> = {
  dashboard: (props) => (
    <Base {...props}>
      <rect x="2.5" y="2.5" width="6" height="6" rx="1" />
      <rect x="11.5" y="2.5" width="6" height="6" rx="1" />
      <rect x="2.5" y="11.5" width="6" height="6" rx="1" />
      <rect x="11.5" y="11.5" width="6" height="6" rx="1" />
    </Base>
  ),
  "action-center": (props) => (
    <Base {...props}>
      <path d="M10 2.5 3.5 6v5c0 4 2.8 6.6 6.5 8 3.7-1.4 6.5-4 6.5-8V6L10 2.5Z" />
      <path d="M7.3 10.2 9.2 12l3.5-4" />
    </Base>
  ),
  "client-requests": (props) => (
    <Base {...props}>
      <path d="M4 3.5c0 7 5.5 12.5 12.5 12.5l1-3-4-1.3-1.3 1.5A9.5 9.5 0 0 1 7.3 8.3L8.8 7 7.5 3 4 3.5Z" />
    </Base>
  ),
  projects: (props) => (
    <Base {...props}>
      <path d="M2.5 5.5A1.5 1.5 0 0 1 4 4h3.5l1.5 2H16a1.5 1.5 0 0 1 1.5 1.5v6.5a1.5 1.5 0 0 1-1.5 1.5H4a1.5 1.5 0 0 1-1.5-1.5v-8.5Z" />
    </Base>
  ),
  budgets: (props) => (
    <Base {...props}>
      <rect x="2.5" y="6.5" width="15" height="9.5" rx="1.5" />
      <path d="M7 6.5V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5" />
      <path d="M2.5 10.5h15" />
    </Base>
  ),
  gantt: (props) => (
    <Base {...props}>
      <path d="M3 4.5h8M3 10h12M3 15.5h6" />
      <circle cx="12.5" cy="4.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="10" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="10.5" cy="15.5" r="1.2" fill="currentColor" stroke="none" />
    </Base>
  ),
  rollings: (props) => (
    <Base {...props}>
      <path d="M4 9a6 6 0 0 1 10.5-4M16 5v3.5H12.5" />
      <path d="M16 11a6 6 0 0 1-10.5 4M4 15v-3.5h3.5" />
    </Base>
  ),
  reports: (props) => (
    <Base {...props}>
      <path d="M3 16.5h14" />
      <path d="M3 13l4-4.5 3 2.5 5-6.5" />
      <path d="M12 4.5h3.5V8" />
    </Base>
  ),
  "time-punch": (props) => (
    <Base {...props}>
      <circle cx="10" cy="10.5" r="7" />
      <path d="M10 6.5V10.5l3 2" />
    </Base>
  ),
  "qr-scan": (props) => (
    <Base {...props}>
      <path d="M3 6.5V4.5a1 1 0 0 1 1-1h2M17 6.5V4.5a1 1 0 0 0-1-1h-2M3 13v2a1 1 0 0 0 1 1h2M17 13v2a1 1 0 0 1-1 1h-2" />
      <rect x="7.5" y="7.5" width="5" height="5" rx="0.5" />
    </Base>
  ),
  checklist: (props) => (
    <Base {...props}>
      <rect x="4" y="2.5" width="12" height="15" rx="1.2" />
      <path d="M7 6.5h6M7 10h6M7 13.5h4" />
      <path d="M6.5 10 7.5 11l1.5-2" strokeWidth={1.2} />
    </Base>
  ),
  "service-calls": (props) => (
    <Base {...props}>
      <path d="M13.5 3.5a3.5 3.5 0 0 0-4.8 4.6L3 13.8v2.7h2.7L11.4 11a3.5 3.5 0 0 0 4.6-4.8l-2.4 2.4-2-2 2.4-2.4Z" />
    </Base>
  ),
  purchases: (props) => (
    <Base {...props}>
      <path d="M3 4h1.8l1 9.5a1.5 1.5 0 0 0 1.5 1.3h6.6a1.5 1.5 0 0 0 1.47-1.2L17 7H5.3" />
      <circle cx="8" cy="17" r="1" fill="currentColor" stroke="none" />
      <circle cx="14" cy="17" r="1" fill="currentColor" stroke="none" />
    </Base>
  ),
  fulfillment: (props) => (
    <Base {...props}>
      <rect x="2.5" y="6" width="9" height="7.5" rx="0.8" />
      <path d="M11.5 8.5H14l3 3v2H11.5" />
      <circle cx="6" cy="15.5" r="1.4" />
      <circle cx="14.5" cy="15.5" r="1.4" />
    </Base>
  ),
  invoicing: (props) => (
    <Base {...props}>
      <path d="M5 2.5h10v15l-2-1.3-1.5 1.3-1.5-1.3-1.5 1.3-1.5-1.3-2 1.3v-15Z" />
      <path d="M7.3 6.5h5.4M7.3 9.5h5.4M7.3 12.5h3" />
    </Base>
  ),
  contacts: (props) => (
    <Base {...props}>
      <circle cx="7" cy="7" r="2.3" />
      <path d="M2.8 16c0-2.6 1.9-4.5 4.2-4.5s4.2 1.9 4.2 4.5" />
      <circle cx="14.3" cy="7.5" r="1.9" />
      <path d="M12.3 11.3c1.8.2 3.2 1.8 3.4 4" />
    </Base>
  ),
  settings: (props) => (
    <Base {...props}>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 3v1.8M10 15.2V17M17 10h-1.8M4.8 10H3M14.9 5.1l-1.3 1.3M6.4 13.6l-1.3 1.3M14.9 14.9l-1.3-1.3M6.4 6.4 5.1 5.1" />
    </Base>
  ),
};

interface NavIconProps extends SVGProps<SVGSVGElement> {
  name: string;
}

export function NavIcon({ name, ...props }: NavIconProps) {
  const Render = PATHS[name];
  return Render ? <Render {...props} /> : null;
}
