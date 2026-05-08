import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, Search } from "lucide-react";
import { toast } from "sonner";
import { fromExt } from "@/lib/supabase-ext";
import { useClubMembers } from "@/hooks/use-club";
import { useAssociationRules } from "@/hooks/use-association-rules";
import { checkSubEligibility, parseLeagueNumber } from "@/lib/league-sub-eligibility";

type Gender = "men" | "ladies" | "mixed";

function isMaleGender(g?: string | null) { return (g || "").toLowerCase().startsWith("m") || (g || "").toLowerCase() === "male"; }
function isFemaleGender(g?: string | null) { return (g || "").toLowerCase().startsWith("f") || (g || "").toLowerCase() === "female"; }

/**
 * Adds members as RESERVES to the league group's "Reserves" league row.
 * If a Reserves row doesn't exist yet for this {association, gender, leagueNumber},
 * it is created automatically.
 */
export function AddReservesDialog({
  clubId,
  associationId,
  gender,
  groupLeagues,
  open,
  onOpenChange,
}: {
  clubId: string;
  associationId: string | null;
  gender: Gender;
  /** All league rows (teams + existing reserves row) for this association+gender group */
  groupLeagues: Array<{ id: string; name: string; code?: string | null; association_id?: string | null }>;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const { data: members = [] } = useClubMembers(clubId);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);

  // Detect league number from group (most groups share one league number, e.g. "1st")
  const leagueNumber = useMemo(() => {
    for (const l of groupLeagues) {
      const m = l.name.match(/(\d+(?:st|nd|rd|th))/i);
      if (m) return m[1];
    }
    return "1st";
  }, [groupLeagues]);

  const genderLabel = gender === "men" ? "Men's" : gender === "ladies" ? "Ladies" : "Mixed";

  // Existing reserves row in the group (name contains "Reserves")
  const existingReservesLeague = useMemo(
    () => groupLeagues.find(l => /reserves?/i.test(l.name)) || null,
    [groupLeagues],
  );

  // Members already registered in this group (any team or reserves) — exclude them
  const { data: alreadyInGroup = [] } = useQuery({
    queryKey: ["reg-in-group", groupLeagues.map(l => l.id).join(",")],
    enabled: open && groupLeagues.length > 0,
    queryFn: async () => {
      const { data, error } = await fromExt("member_league_registrations")
        .select("club_member_id")
        .in("league_id", groupLeagues.map(l => l.id));
      if (error) throw error;
      return (data || []).map((r: any) => r.club_member_id as string);
    },
  });

  // Affiliations restrict pool to opted-in members for this association
  const { data: affiliated = [] } = useQuery({
    queryKey: ["affiliated-for-reserves", associationId],
    enabled: open && !!associationId,
    queryFn: async () => {
      const { data, error } = await fromExt("member_association_affiliations")
        .select("club_member_id")
        .eq("association_id", associationId!)
        .eq("active", true);
      if (error) throw error;
      return (data || []).map((r: any) => r.club_member_id as string);
    },
  });
  const affSet = useMemo(() => new Set(affiliated), [affiliated]);
  const inGroupSet = useMemo(() => new Set(alreadyInGroup), [alreadyInGroup]);

  // Per-association substitution rules
  const { data: subRules } = useAssociationRules(associationId);

  // Target league number (the team this reserve will sub INTO when needed)
  const targetLeagueNumber = useMemo(() => {
    for (const l of groupLeagues) {
      const n = parseLeagueNumber(l.name, l.code);
      if (n != null) return n;
    }
    return null;
  }, [groupLeagues]);

  // Resolve each member's home league number from their existing registrations.
  // Used to evaluate the sub-direction rule (NIL: subs must come from same/lower league).
  const { data: memberHomeLeagues = {} } = useQuery<Record<string, number>>({
    queryKey: ["member-home-leagues-for-reserves", clubId, associationId],
    enabled: open && !!associationId,
    queryFn: async () => {
      const { data, error } = await fromExt("member_league_registrations")
        .select("club_member_id, leagues(name, code, association_id)")
        .eq("leagues.association_id", associationId!);
      if (error) throw error;
      const out: Record<string, number> = {};
      for (const r of (data || []) as any[]) {
        if (!r.leagues) continue;
        const n = parseLeagueNumber(r.leagues.name, r.leagues.code);
        if (n == null) continue;
        // Home = strongest (lowest #) league they're already registered in
        if (out[r.club_member_id] == null || n < out[r.club_member_id]) {
          out[r.club_member_id] = n;
        }
      }
      return out;
    },
  });

  const eligible = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return members
      .map((m: any) => {
        let blocked: string | null = null;
        if (associationId && !affSet.has(m.id)) blocked = "not opted into this association";
        else if (inGroupSet.has(m.id)) blocked = "already in this league group";
        else if (gender === "men" && !isMaleGender(m.gender)) blocked = "not a male member";
        else if (gender === "ladies" && !isFemaleGender(m.gender)) blocked = "not a female member";
        else if (subRules && targetLeagueNumber != null) {
          const homeLeagueNumber = memberHomeLeagues[m.id] ?? null;
          // Evaluate against the target team's #1 slot (most lenient slot in that league)
          const result = checkSubEligibility(
            subRules,
            { homeLeagueNumber, homePosition: null, gender: gender === "mixed" ? null : (gender as any) },
            { leagueNumber: targetLeagueNumber, position: 1, gender },
          );
          if (!result.ok) blocked = result.reason || "rule violation";
        }
        return { ...m, _blocked: blocked };
      })
      .filter((m: any) => {
        if (f && !(m.name || "").toLowerCase().includes(f)) return false;
        return true;
      })
      .sort((a: any, b: any) => {
        // Eligible first, then by ladder
        if (!!a._blocked !== !!b._blocked) return a._blocked ? 1 : -1;
        const ap = a.ladder_position ?? Number.POSITIVE_INFINITY;
        const bp = b.ladder_position ?? Number.POSITIVE_INFINITY;
        if (ap !== bp) return ap - bp;
        return (a.name || "").localeCompare(b.name || "");
      });
  }, [members, associationId, affSet, inGroupSet, gender, filter, subRules, targetLeagueNumber, memberHomeLeagues]);

  const toggle = (id: string) => {
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (picked.size === 0) { toast.error("Pick at least one member"); return; }
    setSaving(true);
    try {
      let reservesLeagueId = existingReservesLeague?.id ?? null;

      // Create the reserves league row on the fly if it doesn't exist
      if (!reservesLeagueId) {
        const sample = groupLeagues[0];
        const codePrefix = sample?.code?.replace(/\d+$/, "") || "LG";
        // Compute next code by querying this club's leagues with that prefix
        const { data: existing, error: exErr } = await fromExt("leagues")
          .select("code")
          .eq("club_id", clubId)
          .like("code", `${codePrefix}%`);
        if (exErr) throw exErr;
        const nums = (existing || [])
          .map((r: any) => parseInt((r.code || "").match(/\d+$/)?.[0] || "0", 10))
          .filter(n => n > 0);
        const next = (nums.length ? Math.max(...nums) : 0) + 1;
        const code = `${codePrefix}${String(next).padStart(3, "0")}`;
        const reservesName = `${genderLabel} ${leagueNumber} Reserves`;
        const { data, error } = await fromExt("leagues")
          .insert({ club_id: clubId, association_id: associationId, name: reservesName, code })
          .select("id")
          .single();
        if (error) throw error;
        reservesLeagueId = data.id;
      }

      // Find next reserve_order to append after existing reserves
      const { data: existingRes, error: exResErr } = await fromExt("member_league_registrations")
        .select("reserve_order, player_rank")
        .eq("league_id", reservesLeagueId!);
      if (exResErr) throw exResErr;
      const maxOrder = Math.max(0, ...(existingRes || []).map((r: any) => r.reserve_order || r.player_rank || 0));

      const inserts = Array.from(picked).map((memberId, idx) => ({
        club_member_id: memberId,
        league_id: reservesLeagueId!,
        player_rank: maxOrder + idx + 1,
        is_captain: false,
        is_reserve: true,
        reserve_order: maxOrder + idx + 1,
      }));
      const { error } = await fromExt("member_league_registrations").insert(inserts);
      if (error) throw error;

      toast.success(`Added ${inserts.length} reserve${inserts.length !== 1 ? "s" : ""} to ${genderLabel} ${leagueNumber}`);
      qc.invalidateQueries({ queryKey: ["leagues"] });
      qc.invalidateQueries({ queryKey: ["league-registrations"] });
      setPicked(new Set());
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to add reserves");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Add Reserve Players — {genderLabel} {leagueNumber}
          </DialogTitle>
          <DialogDescription>
            Pick members to add as reserves. They go into the{" "}
            <strong>{existingReservesLeague?.name ?? `${genderLabel} ${leagueNumber} Reserves`}</strong>{" "}
            row{existingReservesLeague ? "" : " (will be created)"}. Members already in this league group are hidden.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Filter members…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-7 h-8 text-sm"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            {eligible.length} eligible • {picked.size} selected
          </p>

          <Card className="max-h-[40vh] overflow-y-auto p-1.5 space-y-0.5">
            {eligible.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">
                No eligible members. {associationId ? "Members must be opted into this association first." : ""}
              </p>
            )}
            {eligible.map((m: any) => {
              const checked = picked.has(m.id);
              return (
                <label
                  key={m.id}
                  className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-xs hover:bg-accent ${checked ? "bg-accent" : ""}`}
                >
                  <Checkbox checked={checked} onCheckedChange={() => toggle(m.id)} />
                  <span className="flex-1 truncate">{m.name || "Unnamed"}</span>
                  {m.ladder_position != null && (
                    <Badge variant="outline" className="text-[10px] tabular-nums">#{m.ladder_position}</Badge>
                  )}
                </label>
              );
            })}
          </Card>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={saving || picked.size === 0} onClick={handleSave}>
            {saving ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Adding…</> : `Add ${picked.size || ""} reserve${picked.size !== 1 ? "s" : ""}`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
