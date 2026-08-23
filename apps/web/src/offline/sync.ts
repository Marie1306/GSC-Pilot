import { offlineDb, type OutboxItem, type OutboxKind } from "./db.js";
import { clearPendingStop } from "./localTimer.js";
import { createManualEntry, stopTimer, type ManualEntryInput } from "../features/timePunch/api.js";
import { updateServiceCall, addServiceCallPart, captureServiceCallSignature, type UpdateServiceCallInput } from "../features/serviceCalls/api.js";

interface ServiceCallUpdatePayload {
  serviceCallId: string;
  patch: UpdateServiceCallInput;
}
interface ServiceCallAddPartPayload {
  serviceCallId: string;
  name: string;
  qty: number;
}
interface ServiceCallSignaturePayload {
  serviceCallId: string;
  dataUrl: string;
  signerName: string;
}

/**
 * Un item d'outbox = une action simple, indépendante, ré-essayable sans
 * risque de doublon nuisible (chaque action a son propre item plutôt qu'un
 * gros item combiné — évite de rejouer une pièce déjà ajoutée si une étape
 * suivante échoue à la synchronisation).
 */
const HANDLERS: Record<OutboxKind, (payload: never) => Promise<unknown>> = {
  "time-entry-create": (payload: ManualEntryInput) => createManualEntry(payload),
  "time-entry-stop": async (payload: { id: string }) => {
    await stopTimer(payload.id);
    await clearPendingStop(payload.id);
  },
  "service-call-update": (payload: ServiceCallUpdatePayload) => updateServiceCall(payload.serviceCallId, payload.patch),
  "service-call-add-part": (payload: ServiceCallAddPartPayload) => addServiceCallPart(payload.serviceCallId, { name: payload.name, qty: payload.qty }),
  "service-call-signature": (payload: ServiceCallSignaturePayload) => captureServiceCallSignature(payload.serviceCallId, payload.dataUrl, payload.signerName),
};

const listeners = new Set<() => void>();
function notify() {
  for (const listener of listeners) listener();
}
export function subscribeOutbox(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function enqueue(kind: OutboxKind, payload: unknown): Promise<void> {
  const item: OutboxItem = { id: crypto.randomUUID(), kind, payload, createdAt: new Date().toISOString(), status: "pending", attempts: 0 };
  await offlineDb.outbox.add(item);
  notify();
  void flushOutbox();
}

export async function outboxCount(): Promise<number> {
  return offlineDb.outbox.count();
}

let syncing = false;

/** Rejoue l'outbox dans l'ordre de création, un item à la fois — un échec n'empêche pas d'essayer les suivants. */
export async function flushOutbox(): Promise<void> {
  if (syncing || !navigator.onLine) return;
  syncing = true;
  try {
    const items = await offlineDb.outbox.orderBy("createdAt").toArray();
    for (const item of items) {
      const handler = HANDLERS[item.kind] as (payload: unknown) => Promise<unknown>;
      try {
        await offlineDb.outbox.update(item.id, { status: "syncing" });
        await handler(item.payload);
        await offlineDb.outbox.delete(item.id);
      } catch (err) {
        await offlineDb.outbox.update(item.id, {
          status: "failed",
          lastError: err instanceof Error ? err.message : "Erreur de synchronisation",
          attempts: item.attempts + 1,
        });
      }
      notify();
    }
  } finally {
    syncing = false;
  }
}

let initialized = false;
/** Appelé une fois au démarrage de l'app (voir App.tsx). */
export function initOfflineSync(): void {
  if (initialized) return;
  initialized = true;
  window.addEventListener("online", () => void flushOutbox());
  void flushOutbox();
}
