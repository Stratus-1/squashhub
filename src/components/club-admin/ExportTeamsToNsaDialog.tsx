import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { supabase } from "@/integrations/supabase/client";
import type { LeagueAssociation } from "@/hooks/use-club";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  Download,
  Copy,
  AlertTriangle,
  Crown,
  Send,
  Check,
} from "lucide-react";

interface Props {
  clubId: string;
  association: LeagueAssociation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface RegRow {
  league_id: string;
  club_member_id: string;
  is_captain: boolean;
  player_rank: number | null;
  league_association_number: string | null;
  member_name: string;
  affiliation_number: string | null;
}

interface LeagueRow {
  id: string;
  name: string;
  team_code: string | null;
  gender: string | null;
  regs: RegRow[];
}

/** Best-effort gender inference from league name (e.g. "Men's 3rd League 2026"). */
const inferGender = (name: string): string | null => {
  const n = (name || "").toLowerCase();
  if (/\b(ladies|women|woman|female)\b/.test(n)) return "Ladies";
  if (/\b(mixed)\b/.test(n)) return "Mixed";
  if (/\b(men|man|male)\b/.test(n)) return "Men";
  return null;
};

const csvEscape = (v: string | number | null | undefined) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function ExportTeamsToNsaDialog({ clubId, association, open, onOpenChange }: Props) {
  const [copied, setCopied] = useState<"csv" | "email" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);


  const { data, isLoading } = useQuery({
    enabled: open && !!association?.id,
    queryKey: ["export-nsa-teams", clubId, association?.id],
    queryFn: async () => {
      // 1. Leagues (teams) in this association for this club.
      //    `leagues` = the club's teams in the association. `league_associations` = the association itself.
      const { data: leagues, error: le } = await fromExt("leagues")
        .select("id, name, code, nsa_team_code")
        .eq("club_id", clubId)
        .eq("association_id", association.id)
        .order("name", { ascending: true });
      if (le) throw le;
      const leagueList = (leagues || []) as any[];
      if (leagueList.length === 0) return { leagues: [] as LeagueRow[] };

      const leagueIds = leagueList.map((l) => l.id);

      // 2. Registrations
      const { data: regs, error: re } = await fromExt("member_league_registrations")
        .select("league_id, club_member_id, is_captain, player_rank, league_association_number")
        .in("league_id", leagueIds);
      if (re) throw re;
      const regList = (regs || []) as any[];
      const memberIds = Array.from(new Set(regList.map((r) => r.club_member_id)));

      // 3. Member names
      const memberMap = new Map<string, string>();
      if (memberIds.length) {
        const { data: mems } = await fromExt("club_members")
          .select("id, name, profiles:user_id(name)")
          .in("id", memberIds);
        for (const m of (mems || []) as any[]) {
          memberMap.set(m.id, (m.name || m.profiles?.name || "").trim() || "(Unnamed)");
        }
      }

      // 4. Permanent affiliation numbers (NSF) for this association
      const affilMap = new Map<string, string>();
      if (memberIds.length) {
        const { data: affs } = await fromExt("member_association_affiliations")
          .select("club_member_id, league_association_number, is_active")
          .eq("association_id", association.id)
          .in("club_member_id", memberIds);
        for (const a of (affs || []) as any[]) {
          if (a.is_active !== false && a.league_association_number) {
            affilMap.set(a.club_member_id, String(a.league_association_number).trim());
          }
        }
      }

      const grouped: LeagueRow[] = leagueList.map((l) => ({
        id: l.id,
        name: l.name,
        team_code: (l.nsa_team_code as string | null) || (l.code as string | null) || null,
        gender: inferGender(l.name),
        regs: regList
          .filter((r) => r.league_id === l.id)
          .sort(
            (a, b) =>
              Number(!!b.is_captain) - Number(!!a.is_captain) ||
              (a.player_rank ?? 999) - (b.player_rank ?? 999),
          )
          .map((r) => ({
            league_id: r.league_id,
            club_member_id: r.club_member_id,
            is_captain: !!r.is_captain,
            player_rank: r.player_rank ?? null,
            league_association_number: r.league_association_number ?? null,
            member_name: memberMap.get(r.club_member_id) || "(Unknown)",
            affiliation_number:
              (r.league_association_number as string | null) ??
              affilMap.get(r.club_member_id) ??
              null,
          })),
      }));

      return { leagues: grouped };
    },
  });

  const leagues = data?.leagues ?? [];

  const stats = useMemo(() => {
    let teams = 0;
    let players = 0;
    let missingNsf = 0;
    let noCaptain = 0;
    for (const l of leagues) {
      if (l.regs.length === 0) continue;
      teams++;
      players += l.regs.length;
      missingNsf += l.regs.filter((r) => !r.affiliation_number).length;
      if (!l.regs.some((r) => r.is_captain)) noCaptain++;
    }
    return { teams, players, missingNsf, noCaptain };
  }, [leagues]);

  const csv = useMemo(() => {
    const header = [
      "League",
      "Team Code",
      "Gender",
      "Player Name",
      `${association.abbreviation || association.name} Number`,
      "Captain",
      "Rank",
    ];
    const rows: string[][] = [header];
    for (const l of leagues) {
      for (const r of l.regs) {
        rows.push([
          l.name,
          l.team_code || "",
          (l.gender || "").toUpperCase(),
          r.member_name,
          r.affiliation_number || "",
          r.is_captain ? "YES" : "",
          r.player_rank == null ? "" : String(r.player_rank),
        ]);
      }
    }
    return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  }, [leagues, association]);


  const downloadFile = (contents: string, filename: string, mime: string) => {
    const blob = new Blob([contents], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const asLabel = association.abbreviation || association.name;
  const fileBase = `${asLabel.toLowerCase().replace(/\s+/g, "-")}-teams-${new Date().getFullYear()}`;

  const copy = async (text: string, kind: "csv" | "email") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Could not copy");
    }
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const { data: res, error } = await (supabase.rpc as any)("club_submit_association_roster", {
        _club_id: clubId,
        _association_id: association.id,
        _season_year: null,
      });
      if (error) throw error;
      const row = Array.isArray(res) ? res[0] : res;
      setSubmitted(true);
      toast.success(`Roster uploaded to ${asLabel}`, {
        description: `${row?.teams ?? stats.teams} team(s) and ${row?.players ?? stats.players} player(s) are now visible to ${association.name}.`,
      });

      // Auto-generate the affiliation invoice and email it to club finance.
      try {
        const { data: inv, error: invErr } = await supabase.functions.invoke(
          "issue-association-invoice",
          { body: { clubId } },
        );
        if (invErr) throw invErr;
        if (inv?.invoice?.invoice_number) {
          toast.success(`Invoice ${inv.invoice.invoice_number} generated`, {
            description: inv?.emailed?.length
              ? `Emailed to ${inv.emailed.length} finance contact(s).`
              : "Available under Fees → Affiliation billing.",
          });
        }
      } catch (e: any) {
        toast.message("Roster submitted, invoice pending", {
          description: e?.message ?? "The invoice could not be generated automatically.",
        });
      }
    } catch (e: any) {
      toast.error("Could not submit roster", { description: e?.message });
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Submit teams to {asLabel}</DialogTitle>
          <DialogDescription>
            Review your team + player list. SquashHub is integrated with{" "}
            {association.name} — this data is submitted automatically and {asLabel}{" "}
            allocates numbers to new members and bills your club based on this list.
            Download the CSV for your own records if needed.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Loading team allocations…
          </div>
        ) : leagues.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No leagues found for this association. Create your season leagues first.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Card className="p-3">
                <p className="text-[10px] text-muted-foreground uppercase">Teams</p>
                <p className="text-xl font-bold">{stats.teams}</p>
              </Card>
              <Card className="p-3">
                <p className="text-[10px] text-muted-foreground uppercase">Players</p>
                <p className="text-xl font-bold">{stats.players}</p>
              </Card>
              <Card className={`p-3 ${stats.missingNsf > 0 ? "border-amber-500/50" : ""}`}>
                <p className="text-[10px] text-muted-foreground uppercase">
                  Missing {asLabel} #
                </p>
                <p
                  className={`text-xl font-bold ${stats.missingNsf > 0 ? "text-amber-600" : ""}`}
                >
                  {stats.missingNsf}
                </p>
              </Card>
              <Card className={`p-3 ${stats.noCaptain > 0 ? "border-amber-500/50" : ""}`}>
                <p className="text-[10px] text-muted-foreground uppercase">
                  Teams w/o captain
                </p>
                <p
                  className={`text-xl font-bold ${stats.noCaptain > 0 ? "text-amber-600" : ""}`}
                >
                  {stats.noCaptain}
                </p>
              </Card>
            </div>

            {(stats.missingNsf > 0 || stats.noCaptain > 0) && (
              <Card className="p-3 border-amber-500/40 bg-amber-500/5">
                <div className="flex gap-2 text-xs">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    {stats.missingNsf > 0 && (
                      <p>
                        <strong>{stats.missingNsf}</strong> player(s) have no {asLabel}{" "}
                        number yet. {asLabel} will allocate new numbers to them as per
                        their setup specs, and your club's fees will be billed based on
                        this list.
                      </p>
                    )}
                    {stats.noCaptain > 0 && (
                      <p>
                        <strong>{stats.noCaptain}</strong> team(s) have no captain
                        marked.
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={submit} disabled={submitting || stats.teams === 0}>
                {submitted ? <Check className="w-4 h-4 mr-1" /> : <Send className="w-4 h-4 mr-1" />}
                {submitting ? "Submitting…" : submitted ? `Submitted to ${asLabel}` : `Submit to ${asLabel}`}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => downloadFile(csv, `${fileBase}.csv`, "text/csv")}
              >
                <Download className="w-4 h-4 mr-1" /> Download CSV (own records)
              </Button>
              <Button size="sm" variant="outline" onClick={() => copy(csv, "csv")}>
                <Copy className="w-4 h-4 mr-1" />
                {copied === "csv" ? "Copied" : "Copy CSV"}
              </Button>
            </div>

            {/* Preview */}
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>League / Team</TableHead>
                    <TableHead>Player</TableHead>
                    <TableHead className="w-32">{asLabel} #</TableHead>
                    <TableHead className="w-16">Rank</TableHead>
                    <TableHead className="w-20">Captain</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leagues.map((l) => (
                    <>
                      <TableRow key={`h-${l.id}`} className="bg-muted/40">
                        <TableCell colSpan={5} className="py-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm">{l.name}</span>
                            {l.team_code && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1 font-mono">
                                {l.team_code}
                              </Badge>
                            )}
                            {l.gender && (
                              <Badge variant="secondary" className="text-[10px] h-4 px-1">
                                {l.gender}
                              </Badge>
                            )}
                            <span className="text-[10px] text-muted-foreground ml-auto">
                              {l.regs.length} player{l.regs.length === 1 ? "" : "s"}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                      {l.regs.length === 0 ? (
                        <TableRow key={`e-${l.id}`}>
                          <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-2">
                            No players allocated
                          </TableCell>
                        </TableRow>
                      ) : (
                        l.regs.map((r) => (
                          <TableRow key={`${l.id}-${r.club_member_id}`}>
                            <TableCell />
                            <TableCell className="text-sm">{r.member_name}</TableCell>
                            <TableCell className="font-mono text-xs">
                              {r.affiliation_number ? (
                                r.affiliation_number
                              ) : (
                                <span className="text-amber-600">— missing —</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs">{r.player_rank ?? ""}</TableCell>
                            <TableCell>
                              {r.is_captain && (
                                <span className="inline-flex items-center gap-1 text-amber-600 text-xs font-semibold">
                                  <Crown className="w-3 h-3" /> C
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            </div>

            <p className="text-[11px] text-muted-foreground">
              This list is shared with {asLabel} automatically through the
              integration — there is nothing to email. If you add more players to
              league teams later, they appear here too and your club's fees payable
              are updated accordingly. Downloads are for your own records only.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
