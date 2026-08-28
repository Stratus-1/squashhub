import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Loader2, Search } from "lucide-react";

interface Candidate {
  sportyhq_user_id: number;
  name: string;
  club_label: string | null;
  location_label: string | null;
  profile_path: string;
}

interface Profile {
  profile_path: string;
  name: string | null;
  rating: number | null;
  rating_confidence: number | null;
  matches_ytd: number | null;
  matches_all_time: number | null;
  wins_all_time: number | null;
  birthday: string | null;
  age: number | null;
  gender: string | null;
  nationality: string | null;
  handedness: string | null;
  nickname: string | null;
  occupation: string | null;
  rankings: { label: string; system: string; position: number; people: number; points: number }[];
  governing_bodies: string[];
  clubs: string[];
}


async function callLookup<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("sportyhq-lookup", { body });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}

interface BulkResult {
  person_id: string;
  name: string;
  status: "saved" | "no_match" | "ambiguous" | "error";
  rating?: number | null;
  message?: string;
}

export function SportyHqLookupPanel() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkLog, setBulkLog] = useState<BulkResult[]>([]);
  const [savedQuery, setSavedQuery] = useState("");

  const runBulk = async (mode: "new" | "refresh" = "new") => {
    setBulkRunning(true);
    setBulkLog([]);
    let offset = 0;
    try {
      for (let batch = 0; batch < 60; batch++) {
        const d = await callLookup<{ results: BulkResult[]; next_offset: number; done: boolean }>({
          action: "bulk_match",
          mode,
          limit: 20,
          offset,
        });
        setBulkLog((prev) => [...prev, ...d.results]);
        offset = d.next_offset;
        if (d.done || d.results.length === 0) break;
      }
      toast.success("SportyHQ matching run finished");
      qc.invalidateQueries({ queryKey: ["sportyhq-profiles"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBulkRunning(false);
    }
  };



  const { data: saved = [] } = useQuery({
    queryKey: ["sportyhq-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sportyhq_profiles")
        .select("id, name, person_id, club_label, rating, rating_confidence, matches_all_time, verified_at")
        .order("rating", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // SquashHub club is authoritative — SportyHQ's club label must never override it.
  const { data: hubClubs = {} } = useQuery({
    queryKey: ["sportyhq-hub-clubs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("club_members")
        .select("person_id, status, clubs!club_members_club_id_fkey(name)")
        .not("person_id", "is", null);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const row of (data ?? []) as any[]) {
        const name = row.clubs?.name;
        if (!name || !row.person_id) continue;
        if (!map[row.person_id] || row.status === "active") map[row.person_id] = name;
      }
      return map;
    },
  });

  const hubClubFor = (s: any) => (s.person_id ? hubClubs[s.person_id] : null) ?? null;

  const norm = savedQuery.trim().toLowerCase();
  const filteredSaved = norm
    ? saved.filter(
        (s: any) =>
          s.name?.toLowerCase().includes(norm) ||
          hubClubFor(s)?.toLowerCase().includes(norm) ||
          s.club_label?.toLowerCase().includes(norm),
      )
    : saved;


  const searchMut = useMutation({
    mutationFn: () => callLookup<{ results: Candidate[] }>({ action: "search", q: q.trim() }),
    onSuccess: (d) => {
      setCandidates(d.results);
      setSelected(null);
      setProfile(null);
      if (!d.results.length) toast.info("No players found on SportyHQ");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const fetchMut = useMutation({
    mutationFn: (c: Candidate) => callLookup<{ profile: Profile }>({ action: "fetch", path: c.profile_path }),
    onSuccess: (d) => setProfile(d.profile),
    onError: (e) => toast.error((e as Error).message),
  });

  const saveMut = useMutation({
    mutationFn: () =>
      callLookup({
        action: "save",
        sportyhq_user_id: selected!.sportyhq_user_id,
        name: selected!.name,
        club_label: selected!.club_label,
        location_label: selected!.location_label,
        profile: profile,
      }),
    onSuccess: () => {
      toast.success("Saved to SquashHub");
      qc.invalidateQueries({ queryKey: ["sportyhq-profiles"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const pick = (c: Candidate) => {
    setSelected(c);
    setProfile(null);
    fetchMut.mutate(c);
  };

  return (
    <div className="space-y-4 text-[13px]">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">SportyHQ player lookup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground">
            Public SportyHQ data — no login needed. Search a name, confirm the club shown matches the
            player you mean, then save the rating as a national (SSA-level) starting strength.
          </p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (q.trim().length >= 3) searchMut.mutate();
            }}
          >
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="pl-7 h-9"
                placeholder="Name and surname, e.g. Willem Pretorius"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <Button type="submit" size="sm" disabled={searchMut.isPending || q.trim().length < 3}>
              {searchMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
            </Button>
          </form>

          {candidates.length > 0 && (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Player</TableHead>
                    <TableHead>Club</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {candidates.map((c) => (
                    <TableRow key={c.sportyhq_user_id} className={selected?.sportyhq_user_id === c.sportyhq_user_id ? "bg-muted/50" : ""}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>{c.club_label ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-muted-foreground">{c.location_label ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => pick(c)} disabled={fetchMut.isPending}>
                          View stats
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Bulk match SquashHub people</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground">
            Walks the national player directory, searches SportyHQ by name, and saves the rating only
            when there is an exact name match (club name used to break ties). Ambiguous names are
            skipped for manual lookup above. Re-check empty links re-runs only people whose saved
            SportyHQ record is a blank shell (no rating, no club) against the improved matcher.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => runBulk("new")} disabled={bulkRunning}>
              {bulkRunning ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              {bulkRunning ? `Matching… (${bulkLog.length} checked)` : "Search SportyHQ for all people"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => runBulk("refresh")} disabled={bulkRunning}>
              Re-check empty links
            </Button>
          </div>


          {bulkLog.length > 0 && (
            <>
              <div className="flex flex-wrap gap-2">
                {(["saved", "ambiguous", "no_match", "error"] as const).map((s) => (
                  <Badge key={s} variant={s === "saved" ? "default" : "secondary"}>
                    {s.replace("_", " ")}: {bulkLog.filter((r) => r.status === s).length}
                  </Badge>
                ))}
              </div>
              <div className="rounded-md border max-h-72 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Player</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Rating</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bulkLog.map((r, i) => (
                      <TableRow key={`${r.person_id}-${i}`}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {r.status.replace("_", " ")}
                          {r.message ? ` — ${r.message}` : ""}
                        </TableCell>
                        <TableCell className="text-right">{r.rating ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>



      {selected && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              {selected.name}
              {selected.club_label && <Badge variant="secondary">{selected.club_label}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {fetchMut.isPending && <p className="text-muted-foreground">Loading stats…</p>}
            {profile && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Stat label="SportyHQ rating" value={profile.rating ?? "—"} />
                  <Stat label="Confidence" value={profile.rating_confidence != null ? `${profile.rating_confidence}%` : "—"} />
                  <Stat label="Matches this year" value={profile.matches_ytd ?? "—"} />
                  <Stat
                    label="Played / won"
                    value={
                      profile.matches_all_time != null
                        ? `${profile.matches_all_time}${profile.wins_all_time != null ? ` / ${profile.wins_all_time}` : ""}`
                        : "—"
                    }
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Stat label="Birthday" value={profile.birthday ? `${profile.birthday}${profile.age ? ` (${profile.age})` : ""}` : "—"} />
                  <Stat label="Handedness" value={profile.handedness ?? "—"} />
                  <Stat label="Occupation" value={profile.occupation ?? "—"} />
                  <Stat label="Nationality" value={profile.nationality ?? "—"} />
                </div>


                {profile.rankings.length > 0 && (
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ranking</TableHead>
                          <TableHead>System</TableHead>
                          <TableHead className="text-right">Position</TableHead>
                          <TableHead className="text-right">Of</TableHead>
                          <TableHead className="text-right">Points</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {profile.rankings.map((r, i) => (
                          <TableRow key={i}>
                            <TableCell>{r.label}</TableCell>
                            <TableCell className="text-muted-foreground">{r.system}</TableCell>
                            <TableCell className="text-right font-medium">{r.position}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{r.people}</TableCell>
                            <TableCell className="text-right">{r.points}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {profile.clubs.length > 0 && (
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">Affiliated clubs: </span>
                    {profile.clubs.join(" · ")}
                  </p>
                )}
                {profile.governing_bodies.length > 0 && (
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">Governing bodies: </span>
                    {profile.governing_bodies.join(" · ")}
                  </p>
                )}

                <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
                  {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Check className="h-4 w-4 mr-1.5" />}
                  Save to SquashHub
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Saved SportyHQ ratings ({saved.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="pl-7 h-9"
              placeholder="Search saved players or clubs…"
              value={savedQuery}
              onChange={(e) => setSavedQuery(e.target.value)}
            />
          </div>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Player</TableHead>
                  <TableHead>Club</TableHead>
                  <TableHead className="text-right">Rating</TableHead>
                  <TableHead className="text-right">Confidence</TableHead>
                  <TableHead className="text-right">Matches</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSaved.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      {saved.length === 0 ? "Nothing saved yet" : `No players match “${savedQuery}”`}
                    </TableCell>
                  </TableRow>
                )}
                {filteredSaved.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-muted-foreground">{s.club_label ?? "—"}</TableCell>
                    <TableCell className="text-right">{s.rating ?? "—"}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {s.rating_confidence != null ? `${s.rating_confidence}%` : "—"}
                    </TableCell>
                    <TableCell className="text-right">{s.matches_all_time ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border p-2">
      <div className="text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
