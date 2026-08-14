import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Users, Merge, ShieldAlert, AlertTriangle, Copy } from "lucide-react";
import { toast } from "sonner";
import {
  usePeopleDirectory,
  useMergePeople,
  useLicenceProducts,
  useDuplicateCandidates,
  useDismissDuplicatePair,
  type DuplicateCandidate,
} from "@/hooks/use-people";

const FLAG_LABELS: Record<string, string> = {
  missing_name: "Missing name",
  name_is_phone: "Name is a phone number",
  no_association: "No association link",

  missing_gender: "Missing gender",
  missing_age: "Missing age",
  no_contact: "No contact details",
};

function confidenceTone(c: number) {
  if (c >= 0.8) return "bg-red-500/20 text-red-200 border-red-400/40";
  if (c >= 0.6) return "bg-amber-500/20 text-amber-200 border-amber-400/40";
  return "bg-white/10 text-white/70 border-white/20";
}

function DuplicateRow({ d }: { d: DuplicateCandidate }) {
  const merge = useMergePeople();
  const run = async (keepId: string, dupId: string) => {
    try {
      await merge.mutateAsync({ keepId, dupId });
      toast.success("Records merged into one national person");
    } catch (e: any) {
      toast.error(e.message || "Merge failed");
    }
  };
  return (
    <div className="py-2 flex items-center gap-3 text-xs">
      <Badge variant="outline" className={`text-[10px] shrink-0 ${confidenceTone(Number(d.confidence))}`}>
        {Math.round(Number(d.confidence) * 100)}%
      </Badge>
      <div className="flex-1 min-w-0">
        <div className="text-white/90 truncate">
          {d.person_a_name} <span className="text-white/40">· {d.person_a_club || "no club"}</span>
        </div>
        <div className="text-white/90 truncate">
          {d.person_b_name} <span className="text-white/40">· {d.person_b_club || "no club"}</span>
        </div>
        <div className="text-[10px] text-white/45 mt-0.5">{d.reasons.join(" · ")}</div>
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        <Button
          size="sm"
          variant="outline"
          disabled={merge.isPending}
          onClick={() => run(d.person_a_id, d.person_b_id)}
          className="h-6 text-[10px] border-white/20 text-white/80"
        >
          Keep first
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={merge.isPending}
          onClick={() => run(d.person_b_id, d.person_a_id)}
          className="h-6 text-[10px] border-white/20 text-white/80"
        >
          Keep second
        </Button>
      </div>
    </div>
  );
}

export default function FederationPeopleTab() {
  const [search, setSearch] = useState("");
  const [flag, setFlag] = useState<string | null>(null);
  const { data: people = [], isLoading } = usePeopleDirectory(search, flag);
  const { data: licences = [] } = useLicenceProducts();
  const { data: dupes = [], isLoading: loadingDupes } = useDuplicateCandidates(200);
  const merge = useMergePeople();
  const [selected, setSelected] = useState<string[]>([]);

  const flagCounts = useMemo(() => {
    const c: Record<string, number> = {};
    people.forEach((p) => (p.quality_flags || []).forEach((f) => (c[f] = (c[f] || 0) + 1)));
    return c;
  }, [people]);

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-2)));

  const doMerge = async () => {
    if (selected.length !== 2) return;
    const [keepId, dupId] = selected;
    try {
      await merge.mutateAsync({ keepId, dupId });
      toast.success("Records merged into one national person");
      setSelected([]);
    } catch (e: any) {
      toast.error(e.message || "Merge failed");
    }
  };

  return (
    <div className="space-y-3">
      <Card className="bg-white/[0.04] border-white/10 backdrop-blur-md">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-white/90 flex items-center gap-2">
            <Users className="w-4 h-4" /> National player identity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-[11px] text-white/50 mb-3">
            One person, one national record — club memberships hang underneath. Date of birth is stored securely and is
            never shown here; federation views see age and age group only.
          </p>

          <Tabs defaultValue="directory">
            <TabsList className="bg-white/[0.06] mb-3">
              <TabsTrigger value="directory">Directory</TabsTrigger>
              <TabsTrigger value="quality">
                Data quality
                {Object.keys(flagCounts).length > 0 && (
                  <span className="ml-1 text-[10px] text-amber-300">
                    {people.filter((p) => (p.quality_flags || []).length > 0).length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="duplicates">
                Duplicates{dupes.length > 0 && <span className="ml-1 text-[10px] text-amber-300">{dupes.length}</span>}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="directory" className="mt-0">
              <div className="flex gap-2 mb-3">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search people…"
                  className="h-8 text-xs bg-white/[0.06] border-white/10 text-white placeholder:text-white/40"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={selected.length !== 2 || merge.isPending}
                  onClick={doMerge}
                  className="h-8 text-xs border-white/20 text-white/80"
                >
                  <Merge className="w-3.5 h-3.5 mr-1" /> Merge selected
                </Button>
              </div>
              {flag && (
                <div className="mb-2">
                  <Badge
                    variant="outline"
                    onClick={() => setFlag(null)}
                    className="text-[10px] cursor-pointer border-amber-400/40 text-amber-200"
                  >
                    Filtered: {FLAG_LABELS[flag] || flag} — clear
                  </Badge>
                </div>
              )}
              {selected.length === 2 && (
                <p className="text-[11px] text-amber-300/80 mb-2">
                  The first selected record is kept; the second is merged into it.
                </p>
              )}

              {isLoading ? (
                <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-white/60" /></div>
              ) : (
                <div className="max-h-[520px] overflow-y-auto divide-y divide-white/10">
                  {people.map((p) => {
                    const isSel = selected.includes(p.id);
                    const flags = p.quality_flags || [];
                    const unaffiliated = !p.primary_club_name;
                    return (
                      <div
                        key={p.id}
                        onClick={() => toggle(p.id)}
                        className={`flex items-center gap-3 py-2 px-2 cursor-pointer rounded ${isSel ? "bg-white/[0.1]" : "hover:bg-white/[0.05]"}`}
                      >
                        <span className="text-[11px] font-mono text-white/40 w-20 shrink-0">
                          {p.national_player_number || "—"}
                        </span>
                        <span className="text-sm text-white/90 flex-1 truncate">{p.full_name || "— unnamed —"}</span>
                        {p.gender && <span className="text-[11px] text-white/40 capitalize">{p.gender}</span>}
                        <Badge variant="outline" className="text-[10px] border-white/20 text-white/60">
                          {p.age_group || "age n/a"}
                        </Badge>
                        {flags.length > 0 && (
                          <Badge variant="outline" className="text-[10px] border-amber-400/40 text-amber-200">
                            <AlertTriangle className="w-3 h-3 mr-0.5" />{flags.length}
                          </Badge>
                        )}
                        <span className="text-[11px] w-56 truncate text-right">
                          {unaffiliated ? (
                            <span className="text-amber-300/80">Unaffiliated — needs review</span>
                          ) : (
                            <span className="text-white/55">
                              {p.primary_club_name}
                              {p.association_name ? ` · ${p.association_name}` : ""}
                              {p.membership_status ? ` · ${p.membership_status}` : ""}
                              {p.club_link_count > 1 ? ` (+${p.club_link_count - 1})` : ""}
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                  {people.length === 0 && <p className="text-xs text-white/50 py-4">No people found.</p>}
                </div>
              )}
            </TabsContent>

            <TabsContent value="quality" className="mt-0">
              <p className="text-[11px] text-white/50 mb-3">
                Records that need cleanup before the federation layer is built on top. Click a category to filter the
                directory.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {Object.keys(FLAG_LABELS).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFlag(f)}
                    className={`text-left p-3 rounded-lg border transition ${
                      flag === f ? "bg-white/[0.12] border-white/25" : "bg-white/[0.04] border-white/10 hover:bg-white/[0.08]"
                    }`}
                  >
                    <div className="text-lg font-semibold text-white">{flagCounts[f] || 0}</div>
                    <div className="text-[11px] text-white/55">{FLAG_LABELS[f]}</div>
                  </button>
                ))}
              </div>
              {flag && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setFlag(null)}
                  className="h-7 mt-3 text-[11px] border-white/20 text-white/70"
                >
                  Clear filter
                </Button>
              )}
              <p className="text-[10px] text-white/40 mt-3">
                Counts reflect the records currently loaded (up to 500, plus any search filter).
              </p>
            </TabsContent>

            <TabsContent value="duplicates" className="mt-0">
              <p className="text-[11px] text-white/50 mb-3 flex items-start gap-1.5">
                <Copy className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                Suggested matches only — nothing is merged automatically. Name alone scores low; a match is only
                high-confidence when contact details line up too. Review each pair and choose which record to keep.
              </p>
              {loadingDupes ? (
                <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-white/60" /></div>
              ) : dupes.length === 0 ? (
                <p className="text-xs text-white/50 py-4">No likely duplicates detected.</p>
              ) : (
                <div className="max-h-[520px] overflow-y-auto divide-y divide-white/10">
                  {dupes.map((d) => (
                    <DuplicateRow key={`${d.person_a_id}-${d.person_b_id}`} d={d} />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card className="bg-white/[0.04] border-white/10 backdrop-blur-md">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-white/90 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4" /> Competitive licences
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-[11px] text-white/50 mb-3">
            The licence structure is in place, but charging is switched off until the fee model is agreed with SSA. No
            licence fees are raised or invoiced.
          </p>
          {licences.length === 0 ? (
            <p className="text-xs text-white/50 py-2">
              No licence products defined yet — none are required while billing is inactive.
            </p>
          ) : (
            <div className="divide-y divide-white/10">
              {licences.map((l: any) => (
                <div key={l.id} className="flex items-center gap-3 py-2 text-sm text-white/85">
                  <span className="flex-1 truncate">{l.organisations?.name || "—"} · {l.name}</span>
                  <span className="text-[11px] text-white/50">{l.season_year}</span>
                  <Badge variant="outline" className="text-[10px] border-white/20 text-white/60">
                    {l.billing_enabled ? "billing on" : "billing off"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
