/** Écran réel (route + garde de rôle déjà en place), contenu à construire dans une prochaine phase. */
export function PlaceholderPage({ title, description }: { title: string; description?: string }) {
  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <h1 style={{ marginTop: 0, fontSize: 20 }}>{title}</h1>
      <p style={{ color: "var(--gsc-color-muted)" }}>{description ?? "Cette section arrive dans une prochaine phase de construction."}</p>
    </div>
  );
}
