import { useEffect, useMemo, useState } from "react";
import { getOutboxCounts, subscribeOutboxChanged } from "@/lib/outbox";

export function useOutboxCounts() {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    return subscribeOutboxChanged(() => setVersion((v) => v + 1));
  }, []);

  return useMemo(() => {
    void version;
    return getOutboxCounts();
  }, [version]);
}

