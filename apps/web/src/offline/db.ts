import Dexie, { type Table } from "dexie";
import type { PunchProjectType, RateType } from "../features/timePunch/api.js";

/**
 * Mode hors ligne (23 août 2026, spec confirmée) — limité à 3 tâches de
 * terrain : punch d'heures (chronomètre en direct inclus), scan QR (raccourci
 * de punch seulement), appel de service (données terrain seulement). Isolé
 * ici — aucun autre écran n'importe ce dossier, impossible d'écrire hors
 * ligne ailleurs par accident.
 */

export type OutboxKind = "time-entry-create" | "time-entry-stop" | "service-call-update" | "service-call-add-part" | "service-call-signature";

export interface OutboxItem {
  id: string;
  kind: OutboxKind;
  payload: unknown;
  createdAt: string;
  status: "pending" | "syncing" | "failed";
  lastError?: string;
  attempts: number;
}

/** Chronomètre en direct démarré hors ligne — une seule à la fois (clé fixe "active"), lue en plus de l'entrée active du serveur. */
export interface LocalActiveEntry {
  id: "active";
  employeeId?: string;
  projectType: PunchProjectType;
  projectId?: string;
  serviceCallId?: string;
  taskId: string;
  taskLabel: string;
  referenceLabel: string;
  techLevelId?: string;
  rateType?: RateType;
  note?: string;
  startAt: string;
}

/** Copie locale de project-options (déjà accessible à tous les rôles) — pour que le Scan QR fonctionne hors ligne. Rafraîchie à chaque chargement en ligne. */
export interface CachedProjectOption {
  id: string;
  label: string;
  projectNumber: string;
  name: string;
}

/** Entrée serveur arrêtée hors ligne — cachée de l'affichage "active" jusqu'à ce que la synchronisation confirme l'arrêt côté serveur. */
export interface PendingStop {
  id: string; // id de la TimeEntry serveur
  stoppedAt: string;
}

class OfflineDb extends Dexie {
  outbox!: Table<OutboxItem, string>;
  localActiveEntry!: Table<LocalActiveEntry, string>;
  cachedProjects!: Table<CachedProjectOption, string>;
  pendingStops!: Table<PendingStop, string>;

  constructor() {
    super("gsc-pilot-offline");
    this.version(1).stores({
      outbox: "id, status, createdAt",
      localActiveEntry: "id",
      cachedProjects: "id, projectNumber",
      pendingStops: "id",
    });
  }
}

export const offlineDb = new OfflineDb();
