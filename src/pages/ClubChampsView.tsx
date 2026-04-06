import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ArrowLeft, FileSpreadsheet, Printer, User } from "lucide-react";
import { format } from "date-fns";
import { useMemberContext } from "@/contexts/MemberContext";
import { cn } from "@/lib/utils";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const GENDER_LABELS: Record<string, string> = { men: "Men's", ladies: "Ladies'", mixed: "Mixed" };

export default function ClubChampsView() {
  const { champId } = useParams<{ champId: string }>();
  const { activeMember } = useMemberContext();
  const myMemberId = activeMember?.id;

  const { data: champ, isLoading } = useQuery({
    queryKey: ["club-champ", champId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_champs").select("*").eq("id", champId!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!champId,
  });

  const { data: entries = [] } = useQuery({
    queryKey: ["club-champ-entries", champId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_champs_entries")
        .select("*, club_members:club_member_id(id, name, user_id, ladder_position, profiles:user_id(name, avatar_url)), partner:partner_member_id(id, name, profiles:user_id(name))")
        .eq("champ_id", champId!);
      if (error) throw error;
      return data || [];
    },
    enabled: !!champId,
  });

  const { data: matches = [] } = useQuery({
    queryKey: ["club-champ-matches", champId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_champs_matches")
        .select("*, player_a:player_a_member_id(id, name, profiles:user_id(name)), player_b:player_b_member_id(id, name, profiles:user_id(name)), partner_a:partner_a_member_id(id, name, profiles:user_id(name)), partner_b:partner_b_member_id(id, name, profiles:user_id(name)), court:court_id(name)")
        .eq("champ_id", champId!)
        .order("scheduled_date")
        .order("scheduled_time");
      if (error) throw error;
      return data || [];
    },
    enabled: !!champId,
  });

  const isDoubles = champ?.match_type === "doubles";

  const getPlayerName = (player: any) => player?.name || player?.profiles?.name || "Unknown";

  const getTeamName = (player: any, partner: any) => {
    if (!partner) return getPlayerName(player);
    return `${getPlayerName(player)} & ${getPlayerName(partner)}`;
  };

  // Build standings per group
  const getGroupStandings = (groupNum: number) => {
    const groupEntries = entries.filter((e: any) => e.group_number === groupNum);
    const groupMatches = matches.filter((m: any) => m.group_number === groupNum && m.status === "completed");

    return groupEntries.map((e: any) => {
      const memberId = e.club_member_id;
      let played = 0, won = 0, lost = 0;
      groupMatches.forEach((m: any) => {
        if (m.player_a_member_id === memberId || m.player_b_member_id === memberId) {
          played++;
          if (m.winner_member_id === memberId) won++;
          else lost++;
        }
      });
      return {
        ...e,
        played,
        won,
        lost,
        points: won * 2 + (played - won - lost),
        name: isDoubles
          ? getTeamName(e.club_members, e.partner)
          : getPlayerName(e.club_members),
      };
    }).sort((a: any, b: any) => b.points - a.points || b.won - a.won);
  };

  const groupNumbers = [...new Set(entries.map((e: any) => e.group_number as number))].sort();

  const getMatchTeamA = (m: any) => isDoubles ? getTeamName(m.player_a, m.partner_a) : getPlayerName(m.player_a);
  const getMatchTeamB = (m: any) => isDoubles ? getTeamName(m.player_b, m.partner_b) : getPlayerName(m.player_b);

  const isMyMatch = (m: any) =>
    myMemberId && (m.player_a_member_id === myMemberId || m.player_b_member_id === myMemberId ||
      m.partner_a_member_id === myMemberId || m.partner_b_member_id === myMemberId);

  const myMatches = matches.filter(isMyMatch);
  const myGroupNumbers = [...new Set(entries.filter((e: any) => e.club_member_id === myMemberId || e.partner_member_id === myMemberId).map((e: any) => e.group_number as number))];


  const exportCSV = () => {
    if (!champ) return;
    const rows = [["Date", "Time", "Court", "Group", isDoubles ? "Team A" : "Player A", isDoubles ? "Team B" : "Player B", "Status", "Winner", "Score"]];
    matches.forEach((m: any) => {
      rows.push([
        m.scheduled_date || "",
        m.scheduled_time || "",
        m.court?.name || "",
        `Group ${m.group_number}`,
        getMatchTeamA(m),
        getMatchTeamB(m),
        m.status,
        m.winner_member_id ? (m.winner_member_id === m.player_a_member_id ? getMatchTeamA(m) : getMatchTeamB(m)) : "",
        m.score || "",
      ]);
    });
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${champ.name.replace(/\s+/g, "_")}_fixtures.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  if (!champ) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Championship not found.</div>;
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 pb-24">
      <div className="max-w-5xl mx-auto space-y-6 print:space-y-4">
        <div className="flex items-center justify-between print:hidden">
          <Link to="/club-admin" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" /> Back to Admin
          </Link>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-1" /> Print / PDF
            </Button>
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <FileSpreadsheet className="w-4 h-4 mr-1" /> Export CSV
            </Button>
          </div>
        </div>

        <div className="text-center">
          <h1 className="text-2xl md:text-3xl font-bold font-heading">{champ.name}</h1>
          <p className="text-muted-foreground">
            {GENDER_LABELS[champ.gender] || champ.gender} {isDoubles ? "Doubles" : "Singles"} Championship · {champ.start_date} to {champ.end_date}
          </p>
          <p className="text-sm text-muted-foreground">
            {(champ.play_days as number[])?.map((d: number) => DAY_NAMES[d]).join(", ")} · {champ.start_time?.slice(0, 5)} – {champ.end_time?.slice(0, 5)}
          </p>
        </div>

        {groupNumbers.map((gn: number) => {
          const standings = getGroupStandings(gn);
          const groupMatches = matches.filter((m: any) => m.group_number === gn);

          return (
            <Card key={gn}>
              <CardHeader><CardTitle className="text-lg">Group {gn}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 font-medium">#</th>
                        <th className="pb-2 font-medium">{isDoubles ? "Team" : "Player"}</th>
                        <th className="pb-2 font-medium text-center">P</th>
                        <th className="pb-2 font-medium text-center">W</th>
                        <th className="pb-2 font-medium text-center">L</th>
                        <th className="pb-2 font-medium text-center">Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.map((s: any, i: number) => (
                        <tr key={s.id} className="border-b border-border/50">
                          <td className="py-2 text-muted-foreground">{i + 1}</td>
                          <td className="py-2 font-medium">{s.name}</td>
                          <td className="py-2 text-center">{s.played}</td>
                          <td className="py-2 text-center">{s.won}</td>
                          <td className="py-2 text-center">{s.lost}</td>
                          <td className="py-2 text-center font-semibold">{s.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <Separator />

                <div>
                  <h4 className="font-medium text-sm mb-2">Fixtures</h4>
                  <div className="space-y-1.5">
                    {groupMatches.map((m: any) => (
                      <div key={m.id} className="flex items-center gap-2 text-sm p-2 rounded bg-muted/50">
                        <span className="text-muted-foreground w-24 shrink-0">
                          {m.scheduled_date ? format(new Date(m.scheduled_date), "EEE dd MMM") : "TBD"}
                        </span>
                        <span className="text-muted-foreground w-12 shrink-0">{m.scheduled_time?.slice(0, 5) || "TBD"}</span>
                        <span className={`font-medium ${m.winner_member_id === m.player_a_member_id ? "text-primary" : ""}`}>
                          {getMatchTeamA(m)}
                        </span>
                        <span className="text-muted-foreground">vs</span>
                        <span className={`font-medium ${m.winner_member_id === m.player_b_member_id ? "text-primary" : ""}`}>
                          {getMatchTeamB(m)}
                        </span>
                        {m.score && <Badge variant="secondary" className="ml-auto text-xs">{m.score}</Badge>}
                        {m.court && <Badge variant="outline" className="text-[10px]">{m.court.name}</Badge>}
                        <Badge variant={m.status === "completed" ? "default" : "secondary"} className="text-[10px]">{m.status}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
