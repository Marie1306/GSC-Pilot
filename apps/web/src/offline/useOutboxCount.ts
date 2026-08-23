import { useEffect, useState } from "react";
import { outboxCount, subscribeOutbox } from "./sync.js";

export function useOutboxCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const refresh = () => void outboxCount().then((n) => !cancelled && setCount(n));
    refresh();
    const unsubscribe = subscribeOutbox(refresh);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);
  return count;
}
