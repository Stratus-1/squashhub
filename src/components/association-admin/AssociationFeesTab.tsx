import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { fromExt } from "@/lib/supabase-ext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AssociationFeeScheduleCard, useAssociationFeeItems, BASIS_LABEL } from "./AssociationFeeScheduleCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePlatformAssociation } from "@/hooks/use-platform-association";
import { useAssociationSeasons } from "@/hooks/use-association-seasons";
import { Receipt, Building2 } from "lucide-react";


interface Row {
  affiliation_id: string;
  club_member_id: string;
  league_association_number: string | null;
  active: boolean;
  member_name: string;
  club_id: string;
  club_name: string;
  league_association_id: string;
  league_name: string;
  league_fee_annual: number | null;
  members_pay_directly: boolean | null;
}

interface PaymentRow {
  id: string;
  club_member_id: string;
  amount: number;
  paid: boolean;
  fee_label: string | null;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 0 }).format(n);

export function AssociationFeesTab({ clubId }: { clubId: string }) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["association-fees", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("association_member_affiliations_v")
        .select("*")
        .eq("association_tenant_id", clubId)
        .eq("active", true);
      if (error) throw error;
      return (data || []) as Row[];
    },
  });

  // Pull league-fee payments for those members so we can mark paid vs owing
  const memberIds = useMemo(() => Array.from(new Set(rows.map(r => r.club_member_id))), [rows]);
  const { data: payments = [] } = useQuery({
    queryKey: ["association-fee-payments", clubId, memberIds.join(",")],
    queryFn: async () => {
      if (memberIds.length === 0) return [] as PaymentRow[];
      const { data, error } = await fromExt("club_member_fee_payments")
        .select("id, club_member_id, amount, paid, fee_label, fee_type")
        .in("club_member_id", memberIds)
        .in("fee_type", ["league_affiliation", "association"]);
      if (error) throw error;
      return (data || []) as PaymentRow[];
    },
    enabled: memberIds.length > 0,
  });

  const payByMember = useMemo(() => {
    const map = new Map<string, PaymentRow[]>();
    payments.forEach(p => {
      if (!map.has(p.club_member_id)) map.set(p.club_member_id, []);
      map.get(p.club_member_id)!.push(p);
    });
    return map;
  }, [payments]);

  // Group rows by club for totals
  const byClub = useMemo(() => {
    const groups = new Map<string, { name: string; rows: Row[]; owed: number; paid: number }>();
    rows.forEach(r => {
      const owed = Number(r.league_fee_annual || 0);
      const memPays = payByMember.get(r.club_member_id) || [];
      const paid = memPays.filter(p => p.paid).reduce((s, p) => s + Number(p.amount || 0), 0);
      const g = groups.get(r.club_id) || { name: r.club_name, rows: [], owed: 0, paid: 0 };
      g.rows.push(r);
      g.owed += owed;
      g.paid += paid;
      groups.set(r.club_id, g);
    });
    return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, payByMember]);

  const grandOwed = byClub.reduce((s, g) => s + g.owed, 0);
  const grandPaid = byClub.reduce((s, g) => s + g.paid, 0);
  const grandOutstanding = Math.max(grandOwed - grandPaid, 0);

  return (
    <Tabs defaultValue="schedule" className="mt-4">
      <TabsList>
        <TabsTrigger value="schedule">Fee Schedule</TabsTrigger>
        <TabsTrigger value="billing">Club Billing</TabsTrigger>
        <TabsTrigger value="statement">Statement</TabsTrigger>
      </TabsList>

      <TabsContent value="schedule" className="mt-4">
        <AssociationFeeScheduleCard clubId={clubId} />
      </TabsContent>

      <TabsContent value="billing" className="mt-4">
        <ClubBillingPreview clubId={clubId} />
      </TabsContent>

      <TabsContent value="statement" className="mt-4">
    <div className="space-y-4">

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total Billable</p>
          <p className="text-lg font-bold">{fmt(grandOwed)}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Collected</p>
          <p className="text-lg font-bold text-emerald-600">{fmt(grandPaid)}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Outstanding</p>
          <p className="text-lg font-bold text-amber-600">{fmt(grandOutstanding)}</p>
        </Card>
      </div>

      <Card className="p-4 space-y-3">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Receipt className="w-4 h-4" /> Fees by Club
          </h3>
          <p className="text-xs text-muted-foreground">League fees owed via each affiliated club</p>
        </div>

        {isLoading ? (
          <p className="text-xs text-muted-foreground py-6 text-center">Loading…</p>
        ) : byClub.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            <Receipt className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>No active league members yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {byClub.map((g) => {
              const outstanding = Math.max(g.owed - g.paid, 0);
              return (
                <div key={g.name} className="border rounded-md overflow-hidden">
                  <div className="flex items-center justify-between gap-3 px-3 py-2 bg-muted/40">
                    <div className="flex items-center gap-2 font-medium text-sm">
                      <Building2 className="w-4 h-4 text-muted-foreground" /> {g.name}
                      <Badge variant="outline" className="text-[10px]">{g.rows.length} members</Badge>
                    </div>
                    <div className="text-xs flex items-center gap-3">
                      <span className="text-muted-foreground">Billable: <strong className="text-foreground">{fmt(g.owed)}</strong></span>
                      <span className="text-emerald-600">Paid: {fmt(g.paid)}</span>
                      <span className="text-amber-600">Owing: {fmt(outstanding)}</span>
                    </div>
                  </div>
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="text-left px-3 py-1.5 font-medium">League #</th>
                        <th className="text-left px-3 py-1.5 font-medium">Name</th>
                        <th className="text-right px-3 py-1.5 font-medium">Fee</th>
                        <th className="text-right px-3 py-1.5 font-medium">Paid</th>
                        <th className="text-right px-3 py-1.5 font-medium">Owing</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map(r => {
                        const owed = Number(r.league_fee_annual || 0);
                        const memPays = payByMember.get(r.club_member_id) || [];
                        const paid = memPays.filter(p => p.paid).reduce((s, p) => s + Number(p.amount || 0), 0);
                        const owing = Math.max(owed - paid, 0);
                        return (
                          <tr key={r.affiliation_id} className="border-t hover:bg-accent/30">
                            <td className="px-3 py-1.5 font-mono">{r.league_association_number || "—"}</td>
                            <td className="px-3 py-1.5">{r.member_name}</td>
                            <td className="px-3 py-1.5 text-right">{fmt(owed)}</td>
                            <td className="px-3 py-1.5 text-right text-emerald-600">{fmt(paid)}</td>
                            <td className={`px-3 py-1.5 text-right ${owing > 0 ? "text-amber-600 font-semibold" : "text-muted-foreground"}`}>{fmt(owing)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
      </TabsContent>
    </Tabs>
  );
}

interface TeamRow { team_id: string; club_id: string; club_name: string; player_count: number; season_year: number }

function ClubBillingPreview({ clubId }: { clubId: string }) {
  const qc = useQueryClient();
  const currentYear = new Date().getFullYear();

  const { data: platformAssoc } = usePlatformAssociation(clubId);
  const { seasons: openSeasons } = useAssociationSeasons(platformAssoc?.id ?? null);
  const [season, setSeason] = useState<number | null>(null);

  const { data: items = [] } = useAssociationFeeItems(clubId);

  const { data: allTeams = [] } = useQuery({
    queryKey: ["association-billing-teams", clubId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("association_league_teams" as any, {
        _tenant_id: clubId,
      });
      if (error) throw error;
      return (data || []) as (TeamRow & { player_count: number })[];
    },
  });

  const seasonOptions = useMemo(() => {
    const years = new Set<number>();
    openSeasons.forEach((s) => years.add(s.season_year));
    allTeams.forEach((t) => t.season_year != null && years.add(Number(t.season_year)));
    years.add(currentYear);
    return Array.from(years).sort((a, b) => b - a);
  }, [openSeasons, allTeams, currentYear]);

  useEffect(() => {
    if (season != null || seasonOptions.length === 0) return;
    const declaredCurrent = openSeasons.find((s) => s.is_current)?.season_year;
    const declaredLatest = openSeasons.length ? Math.max(...openSeasons.map((s) => s.season_year)) : null;
    setSeason(declaredCurrent ?? declaredLatest ?? seasonOptions[0]);
  }, [season, seasonOptions, openSeasons]);

  const teams = useMemo(
    () => allTeams.filter((t) => season != null && Number(t.season_year) === season),
    [allTeams, season],
  );

  // Payments recorded by the clubs against this association for the season.
  const { data: seasonPayments = [] } = useQuery({
    queryKey: ["association-club-payments", clubId, season],
    queryFn: async () => {
      const { data, error } = await fromExt("club_association_payments")
        .select("id, club_id, amount, paid_on, method, reference, proof_path, status")
        .eq("association_tenant_id", clubId)
        .eq("season_year", season!)
        .order("paid_on", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as {
        id: string; club_id: string; amount: number; paid_on: string;
        method: string; reference: string | null; proof_path: string | null;
        status: "pending" | "confirmed" | "disputed";
      }[];
    },
    enabled: season != null && !!clubId,
  });

  const paidByClub = useMemo(() => {
    const map = new Map<string, number>();
    seasonPayments.forEach((p) => {
      if (p.status === "disputed") return;
      map.set(p.club_id, (map.get(p.club_id) || 0) + Number(p.amount || 0));
    });
    return map;
  }, [seasonPayments]);

  const paymentsByClub = useMemo(() => {
    const map = new Map<string, typeof seasonPayments>();
    seasonPayments.forEach((p) => {
      const list = map.get(p.club_id) || [];
      list.push(p);
      map.set(p.club_id, list);
    });
    return map;
  }, [seasonPayments]);

  const reviewPayment = async (id: string, status: "confirmed" | "disputed") => {
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await fromExt("club_association_payments")
      .update({ status, reviewed_at: new Date().toISOString(), reviewed_by: userRes?.user?.id ?? null } as any)
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(status === "confirmed" ? "Payment confirmed" : "Payment marked as disputed");
    qc.invalidateQueries({ queryKey: ["association-club-payments", clubId, season] });
  };

  const openProof = async (path: string) => {
    const { data, error } = await supabase.storage.from("payment-proofs").createSignedUrl(path, 300);
    if (error || !data?.signedUrl) { toast.error("Could not open the proof of payment"); return; }
    window.open(data.signedUrl, "_blank");
  };


  const active = items.filter(i => i.active && i.direction === "receivable" && (!i.season_year || i.season_year === season));
  const perMember = active.filter(i => i.basis === "member").reduce((s, i) => s + Number(i.amount || 0), 0);
  const perClub = active.filter(i => i.basis === "club").reduce((s, i) => s + Number(i.amount || 0), 0);
  const perTeam = active.filter(i => i.basis === "league_team").reduce((s, i) => s + Number(i.amount || 0), 0);

  // Only clubs that actually submitted teams (and their players) for this season are billed.
  const clubs = useMemo(() => {
    const map = new Map<string, { name: string; members: number; teams: number }>();
    teams.forEach(t => {
      if (!map.has(t.club_id)) map.set(t.club_id, { name: t.club_name, members: 0, teams: 0 });
      const e = map.get(t.club_id)!;
      e.teams += 1;
      e.members += Number(t.player_count || 0);
    });
    return Array.from(map.entries())
      .map(([id, v]) => ({
        id,
        name: v.name,
        memberCount: v.members,
        teams: v.teams,
        total: perClub + v.members * perMember + v.teams * perTeam,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [teams, perClub, perMember, perTeam]);

  const grand = clubs.reduce((s, c) => s + c.total, 0);
  const grandPaid = clubs.reduce((s, c) => s + (paidByClub.get(c.id) || 0), 0);
  const grandOwing = Math.max(grand - grandPaid, 0);


  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold flex items-center gap-2"><Receipt className="w-4 h-4" /> Billing by Club — {season ?? "—"}</h3>
            <p className="text-xs text-muted-foreground">
              Only clubs that submitted their teams and players for this season are billed. Fees are invoiced to the club, not the member.
            </p>
          </div>
          <Select value={season != null ? String(season) : ""} onValueChange={(v) => setSeason(Number(v))}>
            <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue placeholder="Season" /></SelectTrigger>
            <SelectContent>
              {seasonOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>


        <div className="flex flex-wrap gap-2 text-[11px]">
          {active.length === 0
            ? <span className="text-muted-foreground">No active receivable fees for {season} — add them in Fee Schedule.</span>
            : active.map(i => (
                <Badge key={i.id} variant="secondary" className="text-[10px]">
                  {i.label} · {BASIS_LABEL[i.basis]} · {fmt(Number(i.amount || 0))}
                </Badge>
              ))}
        </div>

        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="text-left px-2 py-1.5 font-medium">Club</th>
              <th className="text-right px-2 py-1.5 font-medium">Members</th>
              <th className="text-right px-2 py-1.5 font-medium">Teams</th>
              <th className="text-right px-2 py-1.5 font-medium">Club fee</th>
              <th className="text-right px-2 py-1.5 font-medium">Member fees</th>
              <th className="text-right px-2 py-1.5 font-medium">Team fees</th>
              <th className="text-right px-2 py-1.5 font-medium">Total</th>
              <th className="text-right px-2 py-1.5 font-medium">Paid to date</th>
              <th className="text-right px-2 py-1.5 font-medium">O/s balance</th>
            </tr>
          </thead>
          <tbody>
            {clubs.map(c => {
              const paid = paidByClub.get(c.id) || 0;
              const owing = Math.max(c.total - paid, 0);
              return (
              <tr key={c.id} className="border-t hover:bg-accent/30">
                <td className="px-2 py-1.5 flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5 text-muted-foreground" />{c.name}</td>
                <td className="px-2 py-1.5 text-right">{c.memberCount}</td>
                <td className="px-2 py-1.5 text-right">{c.teams}</td>
                <td className="px-2 py-1.5 text-right">{fmt(perClub)}</td>
                <td className="px-2 py-1.5 text-right">{fmt(c.memberCount * perMember)}</td>
                <td className="px-2 py-1.5 text-right">{fmt(c.teams * perTeam)}</td>
                <td className="px-2 py-1.5 text-right font-semibold">{fmt(c.total)}</td>
                <td className="px-2 py-1.5 text-right text-emerald-600">{fmt(paid)}</td>
                <td className={`px-2 py-1.5 text-right ${owing > 0 ? "text-amber-600 font-semibold" : "text-muted-foreground"}`}>{fmt(owing)}</td>
              </tr>
              );
            })}
            {clubs.length === 0 && (
              <tr><td colSpan={9} className="text-center text-muted-foreground py-6">No club has submitted teams for this season yet.</td></tr>
            )}
          </tbody>
          {clubs.length > 0 && (
            <tfoot>
              <tr className="border-t bg-muted/40">
                <td className="px-2 py-1.5 font-semibold" colSpan={6}>Total receivable</td>
                <td className="px-2 py-1.5 text-right font-bold">{fmt(grand)}</td>
                <td className="px-2 py-1.5 text-right font-bold text-emerald-600">{fmt(grandPaid)}</td>
                <td className="px-2 py-1.5 text-right font-bold text-amber-600">{fmt(grandOwing)}</td>
              </tr>
            </tfoot>
          )}
        </table>

        <div className="border-t pt-2 space-y-1">
          <p className="text-xs font-medium">Payments received from clubs</p>
          {seasonPayments.length === 0 && (
            <p className="text-[11px] text-muted-foreground">No club has recorded a payment for {season} yet.</p>
          )}
          {clubs.map((c) => (paymentsByClub.get(c.id) || []).map((p) => (
            <div key={p.id} className="flex items-center gap-2 text-[11px] flex-wrap">
              <span className="font-medium min-w-[140px]">{c.name}</span>
              <span className="w-20">{p.paid_on}</span>
              <span>{fmt(Number(p.amount || 0))}</span>
              <span className="text-muted-foreground capitalize">{p.method}</span>
              {p.reference && <span className="text-muted-foreground truncate max-w-[140px]">{p.reference}</span>}
              <Badge
                variant="outline"
                className={`text-[9px] px-1 py-0 ${p.status === "confirmed" ? "border-emerald-500 text-emerald-600" : p.status === "disputed" ? "border-destructive text-destructive" : "border-amber-500 text-amber-600"}`}
              >
                {p.status}
              </Badge>
              {p.proof_path && (
                <button className="text-primary hover:underline" onClick={() => openProof(p.proof_path!)}>proof</button>
              )}
              {p.status !== "confirmed" && (
                <button className="text-emerald-600 hover:underline" onClick={() => reviewPayment(p.id, "confirmed")}>confirm</button>
              )}
              {p.status !== "disputed" && (
                <button className="text-destructive hover:underline" onClick={() => reviewPayment(p.id, "disputed")}>dispute</button>
              )}
            </div>
          )))}
        </div>
      </Card>

    </div>
  );
}

