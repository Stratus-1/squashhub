import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Users, Merge, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import {
  usePeopleDirectory,
  usePersonClubLinks,
  useMergePeople,
  useLicenceProducts,
} from "@/hooks/use-people";

export default function FederationPeopleTab() {
  const [search, setSearch] = useState("");
  const { data: people = [], isLoading } = usePeopleDirectory(search);
  const ids = useMemo(() => people.map((p) => p.id), [people]);
  const { data: links } = usePersonClubLinks(ids);
  const { data: licences = [] } = useLicenceProducts();
  const merge = useMergePeople();
  const [selected, setSelected] = useState<string[]>([]);

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
                const clubs = links?.get(p.id) || [];
                const isSel = selected.includes(p.id);
                return (
                  <div
                    key={p.id}
                    onClick={() => toggle(p.id)}
                    className={`flex items-center gap-3 py-2 px-2 cursor-pointer rounded ${isSel ? "bg-white/[0.1]" : "hover:bg-white/[0.05]"}`}
                  >
                    <span className="text-[11px] font-mono text-white/40 w-20 shrink-0">
                      {p.national_player_number || "—"}
                    </span>
                    <span className="text-sm text-white/90 flex-1 truncate">{p.full_name}</span>
                    {p.gender && <span className="text-[11px] text-white/40 capitalize">{p.gender}</span>}
                    <Badge variant="outline" className="text-[10px] border-white/20 text-white/60">
                      {p.age_group || "age n/a"}
                    </Badge>
                    <span className="text-[11px] text-white/50 w-48 truncate text-right">
                      {clubs.length === 0 ? "no club link" : clubs.map((c) => c.club_name).filter(Boolean).join(", ")}
                    </span>
                  </div>
                );
              })}
              {people.length === 0 && <p className="text-xs text-white/50 py-4">No people found.</p>}
            </div>
          )}
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
