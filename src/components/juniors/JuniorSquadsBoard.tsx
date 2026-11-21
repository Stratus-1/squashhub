import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  AGE_GROUPS, groupSquads, moveTarget, genderLabel,
  type AgeGroup, type AgeKey, type GenderGroup, type GenderKey, type SquadRow,
} from "@/lib/juniors/squads";

const db = supabase as any;
type Filter = "all" | "playing" | "age";

/**
 * Junior squads board: Boys / Girls × U11–U19. Automatic by current age (else latest SportyHQ junior section);
 * drag (or "Move to") to another group. Moves change only the playing group — never gender or birth date.
 */
export function JuniorSquadsBoard({ clubId, orgId }: { clubId?: string; orgId?: string }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [club, setClub] = useState<string>("all");
  const [q, setQ] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const key = ["junior-squads", clubId ?? null, orgId ?? null];

  const { data, isLoading, error } = useQuery({
    queryKey: key,
    enabled: !!(clubId || orgId),
    queryFn: async () => {
      const { data, error } = await db.rpc("junior_squads_for", { _club_id: clubId ?? null, _org_id: orgId ?? null });
      if (error) throw error;
      return (data || []) as SquadRow[];
    },
  });

  const save = useMutation({
    mutationFn: async ({ row, gender, age }: { row: SquadRow; gender: GenderGroup | null; age: AgeGroup | null }) => {
      const { error } = await db.rpc("set_junior_group", {
        _member_id: row.member_id, _gender_group: gender, _age_group: age, _org_id: orgId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["junior-squads"] });
      toast.success(v.gender || v.age ? `${v.row.name ?? "Player"} moved` : `${v.row.name ?? "Player"} back in their automatic group`);
    },
    onError: (e: any) => toast.error(e.message || "Could not move this player"),
  });

  const rows = data ?? [];
  const clubs = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => m.set(r.club_id, r.club_name ?? "Club"));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);
  const shown = rows.filter((r) =>
    (filter === "all" || (filter === "playing" ? r.junior_player : !r.junior_player))
    && (club === "all" || r.club_id === club)
    && (!q.trim() || (r.name ?? "").toLowerCase().includes(q.trim().toLowerCase())));
  const grid = groupSquads(shown);
  const counts = { all: rows.length, playing: rows.filter((r) => r.junior_player).length, age: rows.filter((r) => !r.junior_player).length };

  const apply = (row: SquadRow, gender: GenderGroup, age: AgeGroup) => {
    if (!row.has_person) { toast.error("This member isn't linked to a national player record yet, so they can't be moved."); return; }
    const a = moveTarget(row, gender, age);
    if (a.kind === "noop") return;
    save.mutate(a.kind === "reset" ? { row, gender: null, age: null } : { row, gender: a.gender, age: a.age });
  };

  if (isLoading) return <div className="py-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>;
  if (error) return <p className="text-[13px] text-destructive py-4">Could not load the junior squads.</p>;

  const genders: GenderKey[] = ["boys", "girls", ...(Object.values(grid.unknown).some((l) => l.length) ? ["unknown" as const] : [])];

  const chip = (r: SquadRow) => {
    const sporty = r.junior_player && r.junior_source === "sportyhq";
    return (
      <div
        key={r.member_id}
        draggable={r.has_person}
        onDragStart={(e) => { setDragId(r.member_id); e.dataTransfer.setData("text/plain", r.member_id); e.dataTransfer.effectAllowed = "move"; }}
        onDragEnd={() => { setDragId(null); setOver(null); }}
        data-testid="junior-chip"
        className={cn(
          "group rounded border px-1.5 py-1 text-[12px] leading-tight bg-card",
          r.has_person && "cursor-grab active:cursor-grabbing",
          sporty && "border-success/50 bg-success/10",
          dragId === r.member_id && "opacity-40",
        )}
      >
        <div className="flex items-center gap-1">
          <span className={cn("truncate flex-1", sporty && "font-semibold")}>{r.name || "Unnamed member"}</span>
          {r.moved && (
            <button type="button" title="Back to automatic group" aria-label={`Reset ${r.name ?? "player"} to automatic group`}
              onClick={() => save.mutate({ row: r, gender: null, age: null })}
              className="text-muted-foreground hover:text-foreground">
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1 mt-0.5 text-[10px] text-muted-foreground">
          {r.age != null && r.age < 19 ? <span>Age {r.age}</span> : r.age_source === "sportyhq" ? <span>Estimated (SportyHQ)</span> : <span>Age not known</span>}
          {orgId && !clubId && <span className="truncate">· {r.club_name}</span>}
          {r.moved && <Badge variant="outline" className="text-[9px] px-1 py-0">Moved</Badge>}
        </div>
        <Select
          value=""
          onValueChange={(v) => { const [g, a] = v.split(":") as [GenderGroup, AgeGroup]; apply(r, g, a); }}
          disabled={!r.has_person}
        >
          <SelectTrigger className="h-6 mt-1 text-[10px] px-1.5 md:hidden" aria-label={`Move ${r.name ?? "player"} to`}>
            <SelectValue placeholder="Move to…" />
          </SelectTrigger>
          <SelectContent>
            {(["boys", "girls"] as GenderGroup[]).flatMap((g) => AGE_GROUPS.map((a) => (
              <SelectItem key={`${g}:${a}`} value={`${g}:${a}`} className="text-[12px]">{genderLabel(g)} {a}</SelectItem>
            )))}
          </SelectContent>
        </Select>
      </div>
    );
  };

  const cell = (g: GenderKey, a: AgeKey) => {
    const id = `${g}:${a}`;
    const target = g !== "unknown" && a !== "none";
    const list = grid[g][a];
    return (
      <div
        key={id}
        data-testid={`squad-${id}`}
        onDragOver={target ? (e) => { e.preventDefault(); setOver(id); } : undefined}
        onDragLeave={target ? () => setOver((o) => (o === id ? null : o)) : undefined}
        onDrop={target ? (e) => {
          e.preventDefault(); setOver(null);
          const row = rows.find((r) => r.member_id === e.dataTransfer.getData("text/plain"));
          if (row) apply(row, g as GenderGroup, a as AgeGroup);
        } : undefined}
        className={cn("rounded-md border bg-muted/30 p-1.5 min-h-[72px] flex flex-col gap-1", over === id && "ring-2 ring-primary bg-primary/5")}
      >
        <div className="flex items-center justify-between text-[11px] font-semibold">
          <span>{a === "none" ? "Age group not known" : a}</span>
          <span className="text-muted-foreground font-normal">{list.length}</span>
        </div>
        {list.map(chip)}
      </div>
    );
  };

  return (
    <div className="space-y-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        {([["all", `All (${counts.all})`], ["playing", `Junior squash players (${counts.playing})`], ["age", `Junior by age, not playing (${counts.age})`]] as [Filter, string][]).map(([v, label]) => (
          <Button key={v} size="sm" variant={filter === v ? "default" : "outline"} className="h-7 text-[12px]" onClick={() => setFilter(v)}>{label}</Button>
        ))}
        {orgId && !clubId && clubs.length > 1 && (
          <Select value={club} onValueChange={setClub}>
            <SelectTrigger className="h-7 w-[200px] text-[12px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-[12px]">All clubs ({clubs.length})</SelectItem>
              {clubs.map(([id, n]) => <SelectItem key={id} value={id} className="text-[12px]">{n}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name" className="h-7 w-[160px] text-[12px]" />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Players are placed by their current age; without a birth date, by their latest SportyHQ junior event.
        Drag a player to another group (on a phone, use “Move to”). Moving changes only their playing group, not their birth date or gender.
        <span className="ml-1 inline-flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm border border-success/50 bg-success/10" /> SportyHQ junior league player</span>
      </p>
      {rows.length === 0 ? (
        <p className="rounded-md border bg-card p-6 text-center text-muted-foreground">No juniors yet. Juniors appear here once their birth date or ID is on their profile, or they play SportyHQ junior events.</p>
      ) : genders.map((g) => (
        <section key={g} className="space-y-1.5">
          <h3 className="text-[13px] font-semibold">{genderLabel(g)}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-1.5">
            {AGE_GROUPS.map((a) => cell(g, a))}
          </div>
          {grid[g].none.length > 0 && cell(g, "none")}
          {g === "unknown" && <p className="text-[11px] text-muted-foreground">Drag these players into Boys or Girls, or set gender on their member profile.</p>}
        </section>
      ))}
    </div>
  );
}
