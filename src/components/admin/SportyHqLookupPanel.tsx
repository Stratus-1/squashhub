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

export function SportyHqLookupPanel() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const { data: saved = [] } = useQuery({
    queryKey: ["sportyhq-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sportyhq_profiles")
        .select("id, name, club_label, rating, rating_confidence, matches_all_time, verified_at")
        .order("rating", { ascending: false, nullsFirst: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

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
                  <Stat label="Matches all time" value={profile.matches_all_time ?? "—"} />
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
        <CardContent>
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
                {saved.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">Nothing saved yet</TableCell>
                  </TableRow>
                )}
                {saved.map((s: any) => (
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
