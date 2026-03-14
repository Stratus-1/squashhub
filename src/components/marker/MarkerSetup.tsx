import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, UserCheck, X } from "lucide-react";
import { useClubContext } from "@/contexts/ClubContext";
import { useMyClub } from "@/hooks/use-club";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

export type MatchType = "friendly" | "ladder" | "league" | "club_champs" | "tournament";
export type ScoringFormat = "par11" | "par15" | "english9";
export type BestOf = 3 | 5;

export interface PlayerInfo {
  name: string;
  number: string;
  club: string;
  clubMemberId?: string;
}

export interface MarkerConfig {
  playerA: PlayerInfo;
  playerB: PlayerInfo;
  matchType: MatchType;
  scoringFormat: ScoringFormat;
  bestOf: BestOf;
}

interface Props {
  onStart: (config: MarkerConfig) => void;
}

function PlayerField({
  label,
  player,
  onChange,
}: {
  label: string;
  player: PlayerInfo;
  onChange: (p: PlayerInfo) => void;
}) {
  const { club: clubFromHost } = useClubContext();
  const { data: myClubData } = useMyClub();
  const club = clubFromHost || myClubData?.club || null;
  const clubName = club?.name || "";

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const { data: members = [] } = useQuery({
    queryKey: ["club-members-marker", club?.id],
    queryFn: async () => {
      if (!club?.id) return [];
      const { data, error } = await supabase
        .from("club_members")
        .select("id, name, club_member_number, gender")
        .eq("club_id", club.id)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!club?.id,
    staleTime: 5 * 60 * 1000,
  });

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return members.slice(0, 20);
    const q = searchTerm.toLowerCase();
    return members.filter(
      (m) =>
        m.name?.toLowerCase().includes(q) ||
        m.club_member_number?.toLowerCase().includes(q)
    ).slice(0, 20);
  }, [members, searchTerm]);

  const selectMember = (m: typeof members[0]) => {
    onChange({
      name: m.name || "",
      number: m.club_member_number || "",
      club: clubName,
      clubMemberId: m.id,
    });
    setSearchOpen(false);
    setSearchTerm("");
  };

  const clearSelection = () => {
    onChange({ name: "", number: "", club: "", clubMemberId: undefined });
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold font-heading">{label}</p>
        {player.clubMemberId && (
          <Badge variant="secondary" className="text-[10px] gap-1">
            <UserCheck className="w-3 h-3" />
            Club member
          </Badge>
        )}
      </div>

      {club && members.length > 0 && !player.clubMemberId && (
        <div className="relative">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2 text-xs"
            onClick={() => setSearchOpen(!searchOpen)}
          >
            <Search className="w-3.5 h-3.5" />
            Search club members…
          </Button>
          {searchOpen && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-y-auto">
              <div className="p-2 border-b">
                <Input
                  autoFocus
                  placeholder="Search by name or number…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              {filtered.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3 text-center">No members found</p>
              ) : (
                filtered.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors flex items-center justify-between"
                    onClick={() => selectMember(m)}
                  >
                    <span className="text-sm font-medium truncate">{m.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0 ml-2">
                      {m.club_member_number || "—"}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {player.clubMemberId && (
        <div className="flex items-center gap-2">
          <p className="text-sm flex-1">
            <span className="font-medium">{player.name}</span>
            {player.number && <span className="text-muted-foreground ml-1">#{player.number}</span>}
          </p>
          <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={clearSelection}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {!player.clubMemberId && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Name *</Label>
            <Input
              placeholder="Player name"
              value={player.name}
              onChange={(e) => onChange({ ...player, name: e.target.value })}
              className="h-9 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">Number</Label>
            <Input
              placeholder="e.g. 042"
              value={player.number}
              onChange={(e) => onChange({ ...player, number: e.target.value })}
              className="h-9 text-sm"
            />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Club</Label>
            <Input
              placeholder="Club name"
              value={player.club}
              onChange={(e) => onChange({ ...player, club: e.target.value })}
              className="h-9 text-sm"
            />
          </div>
        </div>
      )}
    </Card>
  );
}

export function MarkerSetup({ onStart }: Props) {
  const { club: hostClub } = useClubContext();
  const { data: myClubData } = useMyClub();
  const resolvedClub = hostClub || myClubData?.club || null;

  const [playerA, setPlayerA] = useState<PlayerInfo>({ name: "", number: "", club: resolvedClub?.name || "" });
  const [playerB, setPlayerB] = useState<PlayerInfo>({ name: "", number: "", club: resolvedClub?.name || "" });
  const [matchType, setMatchType] = useState<MatchType>("friendly");
  const [scoringFormat, setScoringFormat] = useState<ScoringFormat>("par11");
  const [bestOf, setBestOf] = useState<BestOf>(3);

  const canStart = playerA.name.trim().length > 0 && playerB.name.trim().length > 0;

  return (
    <div className="space-y-4">
      <PlayerField label="Player A (serve first)" player={playerA} onChange={setPlayerA} />
      <PlayerField label="Player B" player={playerB} onChange={setPlayerB} />

      <Card className="p-4 space-y-3">
        <p className="text-sm font-semibold font-heading">Match Settings</p>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-xs">Type</Label>
            <Select value={matchType} onValueChange={(v) => setMatchType(v as MatchType)}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="friendly">Friendly</SelectItem>
                <SelectItem value="ladder">Ladder</SelectItem>
                <SelectItem value="league">League</SelectItem>
                <SelectItem value="club_champs">Club Champs</SelectItem>
                <SelectItem value="tournament">Tournament</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Scoring</Label>
            <Select value={scoringFormat} onValueChange={(v) => setScoringFormat(v as ScoringFormat)}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="par11">PAR 11</SelectItem>
                <SelectItem value="par15">PAR 15</SelectItem>
                <SelectItem value="english9">English 9</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Best of</Label>
            <Select value={String(bestOf)} onValueChange={(v) => setBestOf(Number(v) as BestOf)}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="3">Best of 3</SelectItem>
                <SelectItem value="5">Best of 5</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Button className="w-full" size="lg" disabled={!canStart} onClick={() => onStart({ playerA, playerB, matchType, scoringFormat, bestOf })}>
        Start Marking
      </Button>
    </div>
  );
}
