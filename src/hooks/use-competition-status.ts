import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CompetitionStatusRow = {
  club_member_id: string;
  association_id: string | null;
  association_name: string | null;
  league_number: string | null;
  league_status: "active" | "inactive" | "unknown" | null;
  league_source: string | null;
  league_checked_at: string | null;
  ssa_number: string | null;
  ssa_status: string | null;
  ssa_checked_at: string | null;
};

export type CompetitionStatus = {
  league: "active" | "inactive" | "unknown";
  ssa: "active" | "inactive" | "unknown";
  rows: CompetitionStatusRow[];
};

// Batches per-player lookups made in the same tick into one request.
let queue = new Map<string, ((s: CompetitionStatus) => void)[]>();
let timer: ReturnType<typeof setTimeout> | null = null;

function summarise(rows: CompetitionStatusRow[], associationId?: string | null): CompetitionStatus {
  const aff = rows.filter((r) => r.association_id && (!associationId || r.association_id === associationId));
  const league = aff.some((r) => r.league_status === "active")
    ? "active"
    : aff.some((r) => r.league_status === "inactive") ? "inactive" : "unknown";
  const s = (rows[0]?.ssa_status ?? "").toLowerCase();
  const ssa = s === "active" ? "active" : s ? "inactive" : "unknown";
  return { league, ssa, rows };
}

async function flush() {
  const batch = queue;
  queue = new Map();
  timer = null;
  const ids = [...batch.keys()];
  const byId = new Map<string, CompetitionStatusRow[]>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await supabase.rpc("member_competition_status" as never, { _club_member_ids: ids.slice(i, i + 300) } as never);
    for (const r of ((data ?? []) as CompetitionStatusRow[])) {
      if (!byId.has(r.club_member_id)) byId.set(r.club_member_id, []);
      byId.get(r.club_member_id)!.push(r);
    }
  }
  for (const [id, cbs] of batch) {
    const rows = byId.get(id) ?? [];
    cbs.forEach((cb) => cb(summarise(rows)));
  }
}

function load(id: string) {
  return new Promise<CompetitionStatus>((resolve) => {
    if (!queue.has(id)) queue.set(id, []);
    queue.get(id)!.push(resolve);
    if (!timer) timer = setTimeout(flush, 30);
  });
}

/** League registration + Squash South Africa status for one member (batched). */
export function useCompetitionStatus(memberId: string | null | undefined, associationId?: string | null) {
  const q = useQuery({
    queryKey: ["competition-status", memberId],
    queryFn: () => load(memberId!),
    enabled: !!memberId,
    staleTime: 5 * 60_000,
  });
  return q.data ? summarise(q.data.rows, associationId) : null;
}
