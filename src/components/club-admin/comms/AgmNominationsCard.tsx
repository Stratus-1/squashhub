import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { sendComms } from "@/lib/comms/send";
import { buildNominationLink } from "@/lib/agm/ballot";

const rpc = (fn: string, args: Record<string, unknown>) => supabase.rpc(fn as any, args as any);
const db = (t: string) => (supabase as any).from(t);
const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", dateStyle: "medium", timeStyle: "short" });

/** Admin view of the nomination stage. Nominations are not secret; votes are. */
export function AgmNominationsCard({ clubId, ballot }: { clubId: string; ballot: any }) {
  const qc = useQueryClient();
  const open = ballot.nominations_status === "open";
  const pastClose = ballot.nominations_close_at && new Date(ballot.nominations_close_at) <= new Date();

  // Nominations close automatically: the first admin view after the deadline fills the ballot.
  useEffect(() => {
    if (!open || !pastClose) return;
    rpc("agm_finalize_nominations", { p_ballot_id: ballot.id }).then(({ error }) => {
      if (error) return;
      qc.invalidateQueries({ queryKey: ["agm-ballots", clubId] });
      qc.invalidateQueries({ queryKey: ["agm-positions", ballot.id] });
    });
  }, [open, pastClose, ballot.id, clubId, qc]);

  const { data } = useQuery({
    queryKey: ["agm-nominations", ballot.id],
    queryFn: async () => {
      const [{ data: pos, error: pe }, { data: noms, error: ne }, { data: list, error: le }, { data: sup, error: se }] = await Promise.all([
        db("agm_ballot_positions").select("id,title,sort").eq("ballot_id", ballot.id).order("sort"),
        db("agm_nominations").select("id,position_id,status,nominee_member_id,nominated_by,nominee:club_members!agm_nominations_nominee_member_id_fkey(name,email),by:club_members!agm_nominations_nominated_by_fkey(name)").eq("ballot_id", ballot.id).order("created_at"),
        db("agm_nominators").select("club_member_id").eq("ballot_id", ballot.id),
        db("agm_nomination_supporters").select("nomination_id,supporter_member_id,created_at,m:club_members(name)").eq("ballot_id", ballot.id).order("created_at"),
      ]);
      if (pe || ne || le || se) throw pe || ne || le || se;
      // Every nomination (first and repeat) is kept as a supporter; the nominee is asked to accept only once.
      const byNom = new Map<string, string[]>();
      for (const s of (sup as any[]) ?? []) byNom.set(s.nomination_id, [...(byNom.get(s.nomination_id) ?? []), s.m?.name ?? "Member"]);
      const withSup = (noms as any[]).map((n) => ({ ...n, supporters: byNom.get(n.id) ?? (n.by?.name ? [n.by.name] : []) }));
      return { positions: pos as any[], noms: withSup, eligible: (list as any[]).length };
    },
    refetchInterval: open ? 30_000 : false,
  });

  const remind = useMutation({
    mutationFn: async (memberId: string) => {
      const { data: tok, error } = await rpc("agm_reissue_nomination_token", { p_ballot_id: ballot.id, p_member_id: memberId });
      if (error) throw error;
      await sendComms({
        clubId, name: `${ballot.title} — nomination reminder`, channels: ["email"],
        audience: { type: "selected", memberIds: [memberId] },
        memberVars: { [memberId]: { nomination_link: buildNominationLink(tok as string, window.location.origin) } },
        meta: { purpose: "agm_nominations", ballot_id: ballot.id },
        content: { email: {
          subject: `${ballot.title} — you have been nominated`,
          body: `<p>Dear {{first_name}},</p><p>You have been nominated for the committee. Please accept or decline before <strong>${fmt(ballot.nominations_close_at)}</strong>: <a href="{{nomination_link}}">Respond to your nomination</a></p><p>This new link replaces any earlier nomination link.</p>`,
        } },
      });
    },
    onSuccess: () => toast({ title: "Reminder emailed" }),
    onError: (e: any) => toast({ title: "Could not send reminder", description: e.message, variant: "destructive" }),
  });

  const noms = data?.noms ?? [];
  const pendingPeople = new Map<string, string>();
  noms.filter((n) => n.status === "pending").forEach((n) => pendingPeople.set(n.nominee_member_id, n.nominee?.name ?? "Member"));

  return (
    <Card className="p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold flex-1">Nominations</p>
        <Badge variant="secondary" className="text-[10px]">{open && !pastClose ? "open" : "closed"}</Badge>
        <span className="text-xs text-muted-foreground">{open && !pastClose ? "Close" : "Closed"} {ballot.nominations_close_at ? fmt(ballot.nominations_close_at) : ""}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {data?.eligible ?? 0} members can nominate and be nominated. Self-nominations count as accepted; others wait for the nominee to accept.
        When nominations close, accepted nominees go onto the ballot automatically and pending ones are dropped.
      </p>
      {(data?.positions ?? []).map((p) => {
        const list = noms.filter((n) => n.position_id === p.id);
        return (
          <div key={p.id} className="border border-border rounded p-2">
            <p className="text-sm font-semibold">{p.title} <span className="font-normal text-muted-foreground text-xs">· {list.filter((n) => n.status === "accepted").length} accepted</span></p>
            {!list.length && <p className="text-xs text-muted-foreground">No nominations yet.</p>}
            {list.map((n) => (
              <div key={n.id} className="flex items-center gap-2 text-xs py-0.5">
                <span className="flex-1">{n.nominee?.name}<span className="text-muted-foreground"> — {n.nominee_member_id === n.nominated_by && n.supporters.length <= 1 ? "self-nominated" : `nominated by ${n.supporters.join(", ")}`}{n.supporters.length > 1 && <strong className="text-foreground"> · {n.supporters.length} nominations</strong>}</span></span>
                <Badge variant={n.status === "accepted" ? "default" : "secondary"} className="text-[10px]">{n.status}</Badge>
              </div>
            ))}
          </div>
        );
      })}
      {open && !pastClose && pendingPeople.size > 0 && (
        <div className="text-xs space-y-1">
          <p className="font-semibold">Waiting for nominees to respond</p>
          {[...pendingPeople].map(([id, name]) => (
            <div key={id} className="flex items-center gap-2">
              <span className="flex-1">{name}</span>
              <Button size="sm" variant="ghost" className="h-6 text-[11px]" disabled={remind.isPending} onClick={() => remind.mutate(id)}>Email reminder</Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
