import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SwissPositionGrid } from "@/components/tournaments/SwissPositionGrid";
import { buildSnapshotPreview, type Decisions, type Simulation, type Snapshot } from "@/lib/tournaments/snapshot-preview";
import { buildSwissProgression } from "@/lib/tournaments/swiss-progression-view";

const UITSIG_CHAMPS = "f954222a-0f0a-4d8c-ac7b-9c74042cc69e";
const db = supabase as any;

/** Read-only snapshot loader: SELECTs only. The copy lives in memory for this page. */
async function loadSnapshot(id: string): Promise<Snapshot & { name: string }> {
  const [{ data: t, error: te }, { data: entries }, { data: matches }] = await Promise.all([
    db.from("tournaments").select("name, beta_lifecycle, builder_spec").eq("id", id).maybeSingle(),
    db.from("club_champs_entries").select("group_number, club_member_id, order_index").eq("champ_id", id),
    db.from("club_champs_matches").select("id, group_number, round_number, status, is_bye, player_a_member_id, player_b_member_id, winner_member_id, score, scheduled_date, scheduled_time, court_id, booking_id, play_by").eq("champ_id", id),
  ]);
  if (te) throw te;
  const ids = [...new Set([...(entries ?? []).map((e: any) => e.club_member_id), ...(matches ?? []).flatMap((m: any) => [m.player_a_member_id, m.player_b_member_id])].filter(Boolean))];
  const { data: members } = ids.length ? await db.from("club_members").select("id, name").in("id", ids) : { data: [] };
  const plan = t?.beta_lifecycle?.format_plan ?? null;
  const dates = [...new Set(((plan?.stages ?? []) as any[]).flatMap((s) => [s.date, ...((s.extraDays ?? []) as any[]).map((d) => d.date)]).filter(Boolean))];
  const { data: bookings } = dates.length ? await db.from("bookings").select("id, court_id, date, start_time, end_time, status, external_booker_name, external_id, user_id, club_member_id, opponent_id, opponent_member_id").in("date", dates).eq("status", "active") : { data: [] };
  return {
    name: t?.name ?? "Tournament",
    formatPlan: plan,
    divisions: ((t?.builder_spec?.divisions ?? []) as any[]).map((d) => ({ groupNumber: Number(d.groupNumber), label: String(d.label ?? `Group ${d.groupNumber}`), kind: d.stages?.[0]?.kind ?? "unknown", swissRounds: d.stages?.[0]?.swissRounds ?? null })),
    entries: entries ?? [], matches: matches ?? [], bookings: bookings ?? [],
    names: Object.fromEntries(((members ?? []) as any[]).map((m) => [m.id, String(m.name ?? "")])),
    minutes: Number(plan?.scheduling?.singles) || 35,
  };
}

/** Super Admin only (route is inside AdminRoute). Snapshot preview — no writes, bookings or messages anywhere on this page. */
export default function SuperAdminTournamentPreview() {
  const [id, setId] = useState(UITSIG_CHAMPS);
  const { data: snap, error, isLoading, refetch, dataUpdatedAt } = useQuery({ queryKey: ["sa-snapshot", id], queryFn: () => loadSnapshot(id), staleTime: Infinity, refetchOnWindowFocus: false });
  const [dec, setDec] = useState<Decisions>({ swissRounds: 5, moveRrToStageDates: true, treatMissingOpponentAsBye: true });
  const [sim, setSim] = useState<Simulation>({ results: {}, stageOverrides: {} });
  const [cat, setCat] = useState<number | null>(null);
  const preview = useMemo(() => (snap ? buildSnapshotPreview(snap, dec, sim) : null), [snap, dec, sim]);

  if (isLoading) return <p className="p-4 text-sm">Loading snapshot…</p>;
  if (error || !snap || !preview) return <p className="p-4 text-sm text-destructive">Could not load snapshot.</p>;
  const current = preview.categories.find((c) => c.gn === cat) ?? preview.categories[0];
  const open = snap.matches.filter((m) => m.group_number === current?.gn && m.status !== "completed" && m.player_a_member_id && m.player_b_member_id);
  const nm = (x: string | null) => (x ? snap.names[x] ?? "?" : "TBD");

  return (
    <div className="space-y-4 p-4 text-sm">
      <div className="rounded border border-amber-500/60 bg-amber-500/10 p-3 text-xs">
        <strong>SNAPSHOT PREVIEW · Super Admin only · read-only.</strong> A copy of the tournament taken at {new Date(dataUpdatedAt).toLocaleTimeString()}. Simulated results and schedule edits stay on this page; nothing is saved, booked or sent.
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs">Tournament ID <Input value={id} onChange={(e) => setId(e.target.value)} className="w-80" /></label>
        <Button size="sm" variant="outline" onClick={() => refetch()}>Re-take snapshot (resync)</Button>
        <Button size="sm" variant="outline" onClick={() => setSim({ results: {}, stageOverrides: {}, bookingEvents: {} })}>Reset simulation</Button>
      </div>
      <h2 className="text-base font-semibold">{snap.name}</h2>

      <section className="space-y-1">
        <h3 className="font-semibold">Owner decisions applied</h3>
        <div className="flex flex-wrap gap-3 text-xs">
          <label>Swiss rounds <Input type="number" min={1} max={8} value={dec.swissRounds} onChange={(e) => setDec({ ...dec, swissRounds: Number(e.target.value) || 5 })} className="inline w-16" /></label>
          <label><input type="checkbox" checked={dec.moveRrToStageDates} onChange={(e) => setDec({ ...dec, moveRrToStageDates: e.target.checked })} /> Move out-of-window rounds to their stage dates</label>
          <label><input type="checkbox" checked={dec.treatMissingOpponentAsBye} onChange={(e) => setDec({ ...dec, treatMissingOpponentAsBye: e.target.checked })} /> Missing opponent = bye</label>
        </div>
      </section>

      <section className="space-y-1">
        <h3 className="font-semibold">Saved stages (simulate changes)</h3>
        <table className="text-xs"><tbody>
          {preview.stages.map((s) => (
            <tr key={s.id} className="border-b border-border">
              <td className="pr-3">{s.name}</td>
              <td className="pr-3">
                <select value={s.mode} onChange={(e) => setSim({ ...sim, stageOverrides: { ...sim.stageOverrides, [s.id]: { ...sim.stageOverrides[s.id], mode: e.target.value as any } } })} className="bg-background border border-border">
                  <option value="play_by">Play by</option><option value="scheduled">Timed</option>
                </select>
              </td>
              <td className="pr-3">{s.mode === "play_by" ? <Input type="date" value={s.deadline ?? ""} onChange={(e) => setSim({ ...sim, stageOverrides: { ...sim.stageOverrides, [s.id]: { ...sim.stageOverrides[s.id], deadline: e.target.value } } })} className="h-7 w-40" /> : s.windows.map((w) => `${w.date} ${w.from}–${w.to} c${w.courtIds.join("/")}`).join(" · ")}</td>
            </tr>
          ))}
        </tbody></table>
      </section>

      <section className="space-y-1">
        <h3 className="font-semibold">Discrepancies ({preview.discrepancies.length})</h3>
        <ul className="space-y-0.5 text-xs">
          {preview.discrepancies.map((d, i) => <li key={i}><Badge variant={d.severity === "block" ? "destructive" : "outline"} className="mr-1">{d.severity}</Badge><strong>{d.category}:</strong> {d.text}</li>)}
        </ul>
      </section>

      <section className="space-y-1">
        <h3 className="font-semibold">Progression & Log (preview)</h3>
        <div className="flex flex-wrap gap-1">
          {preview.categories.map((c) => <Button key={c.gn} size="sm" variant={current?.gn === c.gn ? "default" : "outline"} onClick={() => setCat(c.gn)}>{c.label} · {c.kind === "swiss" ? "Swiss" : "Round robin"} · {c.entrants}</Button>)}
        </div>
        {current?.kind === "swiss" && current.swissGrid && (
          <SwissPositionGrid model={buildSwissProgression({ seedOrder: snap.entries.filter((e) => e.group_number === current.gn).sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)).map((e) => e.club_member_id), names: snap.names, totalRounds: dec.swissRounds, matches: [] })} proposedRounds={current.swissGrid} />
        )}
        {current?.kind !== "swiss" && current?.rrMatches && (
          <table className="text-xs"><tbody>{current.rrMatches.sort((a, b) => (a.round_number ?? 0) - (b.round_number ?? 0)).map((m) => (
            <tr key={m.id} className="border-b border-border"><td className="pr-2">R{m.round_number}</td><td className="pr-2">{nm(m.player_a_member_id)} v {nm(m.player_b_member_id)}</td><td className="pr-2">{m.status === "completed" ? `${nm(m.winner_member_id)} won ${m.score ?? ""}` : m.status}</td><td>{m.booking_id ? "booked " : ""}{m.scheduled_date ?? (m.play_by ? `play by ${m.play_by}` : "")}</td></tr>
          ))}</tbody></table>
        )}
        {open.length > 0 && (
          <details className="text-xs"><summary className="cursor-pointer">Simulate results for this category ({open.length} open)</summary>
            <ul className="space-y-1 pt-1">{open.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-1">R{m.round_number} {nm(m.player_a_member_id)} v {nm(m.player_b_member_id)}:
                {[m.player_a_member_id!, m.player_b_member_id!].map((p) => <Button key={p} size="sm" variant={sim.results[m.id] === p ? "default" : "outline"} className="h-6 px-2" onClick={() => setSim({ ...sim, results: { ...sim.results, [m.id]: p } })}>{nm(p)} wins</Button>)}
                {(() => { const ev = sim.bookingEvents?.[m.id] ?? []; const push = (e: any) => setSim({ ...sim, bookingEvents: { ...(sim.bookingEvents ?? {}), [m.id]: [...ev, e] } }); const bid = `sim-${m.id}`; const linked = ev.length > 0 && ev[ev.length - 1].kind !== "cancel"; return (<>
                  {!m.booking_id && !linked && <Button size="sm" variant="outline" className="h-6 px-2" onClick={() => push({ kind: "link", bookingId: bid, date: m.play_by ?? new Date().toISOString().slice(0, 10), time: "18:00:00", courtId: m.court_id ?? 0 })}>Sim book</Button>}
                  {(m.booking_id || linked) && <Button size="sm" variant="outline" className="h-6 px-2" onClick={() => push({ kind: "reschedule", bookingId: m.booking_id ?? bid, date: m.play_by ?? new Date().toISOString().slice(0, 10), time: "19:00:00", courtId: m.court_id ?? 0 })}>Sim reschedule</Button>}
                  {(m.booking_id || linked) && <Button size="sm" variant="outline" className="h-6 px-2" onClick={() => push({ kind: "cancel", bookingId: m.booking_id ?? bid })}>Sim cancel</Button>}
                </>); })()}
              </li>))}</ul>
          </details>
        )}
      </section>

      <section className="space-y-1">
        <h3 className="font-semibold">Upcoming Fixtures (preview · {preview.upcoming.length})</h3>
        <table className="text-xs"><tbody>{preview.upcoming.map((u) => (
          <tr key={u.key} className="border-b border-border"><td className="pr-2">{u.category}</td><td className="pr-2">R{u.round}</td><td className="pr-2">{u.a} v {u.b}</td><td className="pr-2">{u.when}</td><td><Badge variant="outline">{u.source.replace(/_/g, " ")}</Badge></td></tr>
        ))}</tbody></table>
        {preview.unplaced.length > 0 && <p className="text-xs text-destructive">Unplaced: {preview.unplaced.map((u) => `${u.category} R${u.round} ${u.label}`).join("; ")}</p>}
      </section>

      <section className="text-xs text-muted-foreground space-y-1">
        <h3 className="font-semibold text-foreground">Activation & rollback (not performed)</h3>
        <ol className="list-decimal pl-4">
          <li>Owner approves each discrepancy fix (bye flag, Swiss rounds, out-of-window rounds, per-category spec schedule).</li>
          <li>Enable the Uitsig pilot switch for the new views only; classic views remain as fallback.</li>
          <li>Apply round schedule per round via Round scheduling with preview/approval; Round 1 bookings untouched; draw notices follow Prompt.</li>
          <li>Rollback: switch the pilot off — no live data is converted, so classic behaviour returns immediately.</li>
        </ol>
      </section>
    </div>
  );
}
