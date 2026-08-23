import { useOnlineStatus } from "./useOnlineStatus.js";
import { useOutboxCount } from "./useOutboxCount.js";
import "./offline.css";

/** Bandeau partagé par les 3 tâches de terrain hors ligne (punch, scan QR, appel de service). */
export function OfflineBanner() {
  const online = useOnlineStatus();
  const pending = useOutboxCount();

  if (online && pending === 0) return null;

  return (
    <div className={`offline-banner ${online ? "offline-banner-syncing" : ""}`}>
      {!online && <span>Hors ligne — vos actions seront synchronisées à la reconnexion.</span>}
      {pending > 0 && (
        <span className="offline-banner-badge">
          {pending} en attente{online ? " — synchronisation…" : ""}
        </span>
      )}
    </div>
  );
}
