import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, CalendarClock, Loader2 } from "lucide-react";
import { fromExt } from "@/lib/supabase-ext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHasPermission } from "@/hooks/use-club-permissions";
import { useIsClubAdmin } from "@/hooks/use-club";
import { StructuredEnginePanel } from "@/components/smart-builder/StructuredEnginePanel";
import { ScheduleMatchDialog } from "@/components/tournaments/ScheduleMatchDialog";
import { getTournamentFormat } from "@/lib/tournament-formats";
import type { TournamentSpec } from "@/lib/tournaments/engine-service";

/**
 * Beta (structured) tournament control page. Operates a Beta tournament from its own
 * persisted hierarchy: Division → Stage → Pool → Round → Game. Never runs legacy generators.
 */
const personName = (p: any) => p?.name || p?.profiles?.name || null;

export default function BetaTournamentOperate() {
  const { champId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const canManage = useHasPermission("champs") || useIsClubAdmin();
  const [scheduleMatch, setScheduleMatch] = useState<any | null>(null);

  const { data: t, isLoading } = useQuery({
    queryKey: ["beta-operate", champId],
    queryFn: async () => {
      const [{ data: champ }, { data: arch }] = await Promise.all([
        fromExt("club_champs").select("*").eq("id", champId!).single(),
        fromExt("tournaments").select("builder_architecture,builder_spec,status").eq("id", champId!).maybeSingle(),
      ]);
      return { champ: champ as any, arch: arch as any };
    },
    enabled: !!champId,
  });
  const { data: struct } = useQuery({
    queryKey: ["beta-operate-structure", champId],
    queryFn: async () => {
      const [d, s, p, v] = await Promise.all([
        fromExt("tournament_divisions").select("*").eq("tournament_id", champId!).order("sort_order"),
        fromExt("tournament_stages").select("*").eq("tournament_id", champId!).order("stage_order"),
        fromExt("tournament_pools").select("*").eq("tournament_id", champId!).order("pool_index"),
        fromExt("tournament_venues").select("*").eq("tournament_id", champId!),
      ]);
      return { divisions: (d.data ?? []) as any[], stages: (s.data ?? []) as any[], pools: (p.data ?? []) as any[], venues: (v.data ?? []) as any[] };
    },
    enabled: !!champId,
  });
  const { data: entries = [] } = useQuery({
    queryKey: ["club-champ-entries", champId],
    queryFn: async () => {
      const { data } = await fromExt("club_champs_entries")
        .select("*, club_members:club_member_id(id, name), partner:partner_member_id(id, name)").eq("champ_id", champId!);
      return (data ?? []) as any[];
    },
    enabled: !!champId,
  });
  const { data: matches = [] } = useQuery({
    queryKey: ["club-champ-matches", champId],
    queryFn: async () => {
      const { data } = await fromExt("club_champs_matches")
        .select("*, player_a:player_a_member_id(id, name, profiles:user_id(name)), player_b:player_b_member_id(id, name, profiles:user_id(name)), partner_a:partner_a_member_id(id, name, profiles:user_id(name)), partner_b:partner_b_member_id(id, name, profiles:user_id(name)), court:court_id(name)")
        .eq("champ_id", champId!).order("round_number").order("scheduled_date");
      return (data ?? []) as any[];
    },
    enabled: !!champId,
  });

  const side = (m: any, s: "a" | "b") => {
    const a = personName(m[`player_${s}`]), b = personName(m[`partner_${s}`]);
    if (!a) return m.is_bye ? "Bye" : "To be decided";
    return b ? `${a} / ${b}` : a;
  };
  const nameOf = (id: string | null) => {
    const e = entries.find((x: any) => x.club_member_id === id || x.partner_member_id === id);
    if (!e) return "Player";
    return e.club_member_id === id ? e.club_members?.name || "Player" : e.partner?.name || "Player";
  };

  const byStage = useMemo(() => {
    const out = new Map<string, any[]>();
    for (const m of matches) { const k = m.stage_id ?? "none"; (out.get(k) ?? out.set(k, []).get(k)!).push(m); }
    return out;
  }, [matches]);

  if (isLoading || !t) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (t.arch?.builder_architecture !== "structured") {
    return <div className="max-w-3xl mx-auto p-6 text-sm">This tournament wasn't built with Tournament Beta. <Link className="underline" to={`/club-champs/${champId}`}>Open it here</Link>.</div>;
  }
  const champ = t.champ;
  const fmt = getTournamentFormat(champ?.scoring_mode);
  const courtIds: number[] = (struct?.venues ?? []).flatMap((v: any) => v.court_ids ?? []);
  const played = matches.filter((m) => m.status === "completed" || m.winner_member_id).length;
  const stageStatus = (st: any) => {
    const ms = byStage.get(st.id) ?? [];
    if (!ms.length) return { label: "Not started", tone: "outline" as const, ms };
    const done = ms.filter((m) => m.status === "completed" || m.winner_member_id || m.is_bye).length;
    return done === ms.length ? { label: "Complete", tone: "default" as const, ms } : { label: `${done}/${ms.length} played`, tone: "secondary" as const, ms };
  };
  const fmtDate = (d?: string | null) => (d ? format(new Date(d), "EEE d MMM") : "No date");

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-4 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
        <h1 className="text-xl font-bold font-heading">{champ?.name}</h1>
        <Badge variant="secondary">Tournament Beta</Badge>
        <span className="text-muted-foreground">{fmtDate(champ?.start_date)} – {fmtDate(champ?.end_date)} · {entries.length} entries · {played}/{matches.length} games played</span>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="games">Games</TabsTrigger>
          {canManage && <TabsTrigger value="run">Run stages</TabsTrigger>}
          <TabsTrigger value="entries">Entries</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-3">
          {(struct?.divisions ?? []).map((d) => (
            <Card key={d.id}>
              <CardHeader className="py-3"><CardTitle className="text-base">{d.label}</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {(struct?.stages ?? []).filter((s) => s.division_id === d.id).map((s, i) => {
                  const st = stageStatus(s);
                  const pools = (struct?.pools ?? []).filter((p) => p.stage_id === s.id);
                  return (
                    <div key={s.id} className="flex flex-wrap items-center gap-2 rounded border px-3 py-2">
                      <span className="font-medium">Stage {i + 1} · {s.label}</span>
                      <span className="text-muted-foreground">{String(s.kind).replace(/_/g, " ")}{pools.length ? ` · ${pools.map((p) => p.label).join(", ")}` : ""}</span>
                      <Badge variant={st.tone} className="ml-auto">{st.label}</Badge>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
          {!struct?.divisions?.length && <p className="text-muted-foreground">No games yet. Add entries, then generate the first stage from “Run stages”.</p>}
        </TabsContent>

        <TabsContent value="games" className="space-y-3">
          {(struct?.stages ?? []).map((s) => {
            const ms = byStage.get(s.id) ?? [];
            if (!ms.length) return null;
            const div = struct?.divisions.find((d) => d.id === s.division_id);
            const rounds = [...new Set(ms.map((m) => m.round_number ?? 1))].sort((a, b) => a - b);
            return (
              <Card key={s.id}>
                <CardHeader className="py-3"><CardTitle className="text-base">{(struct?.divisions.length ?? 0) > 1 ? `${div?.label} · ` : ""}{s.label}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {rounds.map((r) => {
                    const rm = ms.filter((m) => (m.round_number ?? 1) === r);
                    return (
                      <div key={r}>
                        <div className="text-xs font-semibold text-muted-foreground mb-1">{rm[0]?.stage_label || `Round ${r}`} · {fmtDate(rm[0]?.scheduled_date)}</div>
                        <div className="divide-y rounded border">
                          {rm.map((m) => {
                            const done = m.status === "completed" || !!m.winner_member_id;
                            return (
                              <div key={m.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
                                {m.pool_number && <Badge variant="outline">{struct?.pools.find((p) => p.id === m.pool_id)?.label ?? `Pool ${m.pool_number}`}</Badge>}
                                <span className="min-w-0 flex-1">{side(m, "a")} <span className="text-muted-foreground">vs</span> {side(m, "b")}</span>
                                <span className="text-muted-foreground">{m.scheduled_time ? m.scheduled_time.slice(0, 5) : ""}{m.court?.name ? ` · ${m.court.name}` : ""}</span>
                                {done ? <Badge>{m.score || "Played"}</Badge> : !m.is_bye && m.player_a_member_id && m.player_b_member_id && (
                                  <>
                                    {canManage && <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setScheduleMatch(m)}><CalendarClock className="h-3 w-3 mr-1" />Schedule</Button>}
                                    <Button size="sm" className="h-6 px-2 text-[11px]" onClick={() => navigate(fmt.markerRoute(m.id))}>{fmt.markerLabel}</Button>
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
          {!matches.length && <p className="text-muted-foreground">No games yet.</p>}
        </TabsContent>

        {canManage && (
          <TabsContent value="run">
            {t.arch?.builder_spec
              ? <StructuredEnginePanel champId={champId!} spec={t.arch.builder_spec as TournamentSpec} matches={matches} nameOf={nameOf} />
              : <p className="text-muted-foreground">This tournament has no saved structure.</p>}
          </TabsContent>
        )}

        <TabsContent value="entries" className="space-y-2">
          <Card>
            <CardContent className="pt-4 space-y-1">
              {(struct?.divisions.length ? struct.divisions : [{ id: "all", label: "Entries", sort_order: 0 }]).map((d: any, i: number) => {
                const list = entries.filter((e) => !struct?.divisions.length || e.group_number === i + 1);
                return (
                  <div key={d.id} className="py-1">
                    <div className="font-medium">{d.label} <span className="text-muted-foreground">({list.length})</span></div>
                    <div className="text-muted-foreground">{list.map((e) => e.partner ? `${e.club_members?.name} / ${e.partner?.name}` : e.club_members?.name).filter(Boolean).join(", ") || "No entries yet"}</div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ScheduleMatchDialog
        open={!!scheduleMatch}
        onOpenChange={(o) => { if (!o) { setScheduleMatch(null); qc.invalidateQueries({ queryKey: ["club-champ-matches", champId] }); } }}
        clubId={champ?.club_id}
        match={scheduleMatch}
        canManage={canManage}
        allowedCourtIds={courtIds}
        opponentName={scheduleMatch ? `${side(scheduleMatch, "a")} vs ${side(scheduleMatch, "b")}` : undefined}
        durationMinutes={champ?.match_duration_minutes ?? undefined}
      />
    </div>
  );
}
