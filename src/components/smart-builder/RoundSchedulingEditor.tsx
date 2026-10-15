import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fromExt } from "@/lib/supabase-ext";
import { switchRoundToPlayBy, switchRoundToTimed } from "@/lib/tournaments/round-scheduling";

interface Round { id: string; label: string | null; round_number: number; scheduling_mode: string | null; play_by: string | null; group_number: number | null }
interface Court { id: number; name: string }

/** Change scheduling of an existing round without redrawing pairings or touching results. */
export function RoundSchedulingEditor({ clubId, tournamentId }: { clubId: string; tournamentId: string }) {
  const qc = useQueryClient();
  const [rounds, setRounds] = useState<Round[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [mode, setMode] = useState<"self" | "club">("self");
  const [playBy, setPlayBy] = useState("");
  const [date, setDate] = useState("");
  const [from, setFrom] = useState("18:00");
  const [to, setTo] = useState("21:00");
  const [minutes, setMinutes] = useState(45);
  const [courtIds, setCourtIds] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);

  const load = () => fromExt("club_champs_rounds").select("id, label, round_number, scheduling_mode, play_by, group_number")
    .eq("champ_id", tournamentId).order("group_number").order("round_number").then(({ data }) => setRounds((data ?? []) as any));
  useEffect(() => {
    load();
    fromExt("courts").select("id, name").eq("club_id", clubId).order("name").then(({ data }) => setCourts((data ?? []) as any));
  }, [clubId, tournamentId]);

  if (!rounds.length) return null;

  const start = (r: Round) => { setOpen(r.id); setMode(r.scheduling_mode === "club" ? "club" : "self"); setPlayBy(r.play_by ?? ""); };
  const save = async (r: Round) => {
    setBusy(true);
    try {
      if (mode === "self") {
        if (!playBy) throw new Error("Choose a play-by date");
        const res = await switchRoundToPlayBy(r.id, playBy);
        toast.success(`Saved: ${res.matches} match(es) now play by ${playBy}${res.released ? `, ${res.released} court slot(s) released` : ""}.`);
      } else {
        if (!date || !courtIds.length) throw new Error("Choose a date and at least one court");
        const res = await switchRoundToTimed(r.id, { date, from, to, minutes, courtIds });
        if (res.unplaced.length) toast.warning(`${res.booked} of ${res.eligible} match(es) placed. ${res.unplaced.length} could not be placed: ${res.unplaced[0].reason}`);
        else toast.success(`${res.booked} match(es) placed in tournament court slots.`);
      }
      setOpen(null); load(); qc.invalidateQueries();
    } catch (e: any) { toast.error(e?.message || "Could not save round scheduling"); }
    finally { setBusy(false); }
  };

  return (
    <section className="rounded-md border border-border p-3 space-y-2">
      <h3 className="text-sm font-semibold">Round scheduling</h3>
      <p className="text-xs text-muted-foreground">Changing a round keeps its pairings, results and locks. Tournament block bookings and players' own bookings are never cancelled.</p>
      {rounds.map((r) => (
        <div key={r.id} className="rounded border border-border p-2 text-xs space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span>{r.label || `Round ${r.round_number}`} · {r.scheduling_mode === "club" ? "Timed (court/date/time)" : `Play by ${r.play_by ?? "—"}`}</span>
            {open !== r.id && <Button size="sm" variant="outline" onClick={() => start(r)}>Edit</Button>}
          </div>
          {open === r.id && (
            <div className="space-y-2">
              <div className="flex gap-2" role="radiogroup" aria-label="Scheduling">
                <Button size="sm" variant={mode === "self" ? "default" : "outline"} onClick={() => setMode("self")}>Play by date</Button>
                <Button size="sm" variant={mode === "club" ? "default" : "outline"} onClick={() => setMode("club")}>Timed slots</Button>
              </div>
              {mode === "self" ? (
                <label className="block">Play by <Input type="date" value={playBy} onChange={(e) => setPlayBy(e.target.value)} /></label>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <label>Date <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
                  <label>Match minutes <Input type="number" min={15} value={minutes} onChange={(e) => setMinutes(Number(e.target.value) || 45)} /></label>
                  <label>From <Input type="time" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
                  <label>To <Input type="time" value={to} onChange={(e) => setTo(e.target.value)} /></label>
                  <div className="col-span-2 flex flex-wrap gap-1">
                    {courts.map((c) => (
                      <Button key={c.id} size="sm" variant={courtIds.includes(c.id) ? "default" : "outline"}
                        onClick={() => setCourtIds((s) => s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id])}>{c.name}</Button>
                    ))}
                  </div>
                  <p className="col-span-2 text-muted-foreground">Only confirmed matches are placed, inside tournament block reservations. Shortages are reported.</p>
                </div>
              )}
              <div className="flex gap-2">
                <Button size="sm" disabled={busy} onClick={() => save(r)}>{busy ? "Saving…" : "Save"}</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setOpen(null)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
