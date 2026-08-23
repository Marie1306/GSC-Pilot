import { useEffect, useState } from "react";
import type { LocalActiveEntry } from "./db.js";
import { getLocalActiveEntry, getPendingStopIds, subscribeLocalTimer } from "./localTimer.js";

export function useLocalTimer(): { localActive: LocalActiveEntry | undefined; pendingStopIds: Set<string> } {
  const [localActive, setLocalActive] = useState<LocalActiveEntry | undefined>(undefined);
  const [pendingStopIds, setPendingStopIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void getLocalActiveEntry().then((e) => !cancelled && setLocalActive(e));
      void getPendingStopIds().then((ids) => !cancelled && setPendingStopIds(ids));
    };
    refresh();
    const unsubscribe = subscribeLocalTimer(refresh);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return { localActive, pendingStopIds };
}
