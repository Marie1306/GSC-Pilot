/**
 * Déclenche window.print() seulement une fois toutes les images de la page
 * chargées (15 novembre 2026) — les vues d'export PDF existantes
 * (BudgetExportView.tsx, etc.) n'avaient jamais d'image, un simple délai
 * fixe (setTimeout 400ms) suffisait. Depuis que SoumissionExportView.tsx/
 * ConfirmationExportView.tsx affichent le logo réel (CompanyLetterhead.tsx),
 * un délai fixe peut déclencher l'impression avant que l'image soit
 * décodée — Chromium peut alors produire une page blanche plutôt que
 * d'attendre (rapporté par Marie : PDF "tout blanc" via Microsoft Print to
 * PDF, correct après coup s'il réessaie). Un sondage court après le délai
 * minimal garantit que l'impression attend réellement le logo, peu importe
 * la vitesse du réseau.
 */
export function printWhenReady(minDelayMs = 400): () => void {
  let cancelled = false;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;

  function allImagesLoaded(): boolean {
    return Array.from(document.images).every((img) => img.complete);
  }

  function tryPrint() {
    if (cancelled) return;
    if (allImagesLoaded()) {
      window.print();
      return;
    }
    pollTimer = setTimeout(tryPrint, 50);
  }

  const timer = setTimeout(tryPrint, minDelayMs);

  return () => {
    cancelled = true;
    clearTimeout(timer);
    if (pollTimer) clearTimeout(pollTimer);
  };
}
