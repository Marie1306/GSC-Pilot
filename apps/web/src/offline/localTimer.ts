import { offlineDb, type LocalActiveEntry } from "./db.js";

const listeners = new Set<() => void>();
function notify() {
  for (const listener of listeners) listener();
}
export function subscribeLocalTimer(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function getLocalActiveEntry(): Promise<LocalActiveEntry | undefined> {
  return offlineDb.localActiveEntry.get("active");
}

export async function startLocalActiveEntry(entry: Omit<LocalActiveEntry, "id">): Promise<void> {
  await offlineDb.localActiveEntry.put({ id: "active", ...entry });
  notify();
}

export async function clearLocalActiveEntry(): Promise<void> {
  await offlineDb.localActiveEntry.delete("active");
  notify();
}

/** Entrées serveur arrêtées hors ligne — masquées de l'affichage "active" jusqu'à confirmation par la synchronisation. */
export async function getPendingStopIds(): Promise<Set<string>> {
  const rows = await offlineDb.pendingStops.toArray();
  return new Set(rows.map((r) => r.id));
}

export async function markPendingStop(timeEntryId: string): Promise<void> {
  await offlineDb.pendingStops.put({ id: timeEntryId, stoppedAt: new Date().toISOString() });
  notify();
}

export async function clearPendingStop(timeEntryId: string): Promise<void> {
  await offlineDb.pendingStops.delete(timeEntryId);
  notify();
}
