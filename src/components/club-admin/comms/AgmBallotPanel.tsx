import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Printer, Send, Vote, Plus } from "lucide-react";
import { sendComms } from "@/lib/comms/send";
import { AgmMeetingCard } from "./AgmMeetingCard";
import { AgmTestEmail } from "./AgmTestEmail";
import {
  buildInviteLink, meetingLine, buildVoteLink, DEFAULT_DECLARATION, formatBallotText, parseBallotText, positionWinners, recountFromReceipts, receiptPicks,
} from "@/lib/agm/ballot";

const rpc = (fn: string, args: Record<string, unknown>) => supabase.rpc(fn as any, args as any);
const db = (t: string) => (supabase as any).from(t);

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", dateStyle: "medium", timeStyle: "short" });

export function AgmBallotPanel({ clubId, clubName }: { clubId: string; clubName: string }) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: ballots = [] } = useQuery({
    queryKey: ["agm-ballots", clubId],
    queryFn: async () => {
      const { data, error } = await db("agm_ballots").select("*").eq("club_id", clubId).order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const deadline = new Date(Date.now() + 3 * 864e5).toISOString();
      const { data, error } = await db("agm_ballots").insert({
        club_id: clubId, title: `${clubName} AGM committee election`, deadline,
        declaration: DEFAULT_DECLARATION(clubName), created_by: user?.id ?? null,
      }).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => { qc.invalidateQueries({ queryKey: ["agm-ballots", clubId] }); setSelectedId(id); },
    onError: (e: any) => toast({ title: "Could not create ballot", description: e.message, variant: "destructive" }),
  });

  const ballot = ballots.find((b) => b.id === selectedId) ?? null;

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold flex items-center gap-1.5"><Vote className="w-4 h-4 text-primary" />AGM voting</p>
          <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending}><Plus className="w-3.5 h-3.5 mr-1" />New ballot</Button>
        </div>
        {!ballots.length && <p className="text-xs text-muted-foreground py-4 text-center">No ballots yet.</p>}
        <div className="space-y-1">
          {ballots.map((b) => {
            const closed = b.status === "open" && new Date(b.deadline) <= new Date();
            return (
              <button key={b.id} onClick={() => setSelectedId(b.id)}
                className={`w-full text-left flex items-center gap-2 p-2 rounded border ${b.id === selectedId ? "border-primary" : "border-border"}`}>
                <span className="flex-1 text-sm truncate">{b.title}</span>
                <span className="text-[11px] text-muted-foreground">closes {fmt(b.deadline)}</span>
                <Badge variant="secondary" className="text-[10px]">{b.status === "draft" ? "draft" : closed ? "closed" : "open"}</Badge>
              </button>
            );
          })}
        </div>
      </Card>
      {ballot && <AgmMeetingCard key={`m-${ballot.id}`} clubId={clubId} ballot={ballot} />}
      {ballot && (ballot.status === "draft"
        ? <DraftEditor key={ballot.id} clubId={clubId} ballot={ballot} />
        : <OpenBallot key={ballot.id} clubId={clubId} ballot={ballot} />)}
      {ballot && <AgmTestEmail key={`test-${ballot.id}`} clubId={clubId} ballotId={ballot.id} />}
    </div>
  );
}

function DraftEditor({ clubId, ballot }: { clubId: string; ballot: any }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(ballot.title);
  const [deadline, setDeadline] = useState(toLocalInput(ballot.deadline));
  const [declaration, setDeclaration] = useState(ballot.declaration);
  const [text, setText] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [channels, setChannels] = useState({ email: true, whatsapp: false });

  const { data: positions } = useQuery({
    queryKey: ["agm-positions", ballot.id],
    queryFn: async () => {
      const { data, error } = await db("agm_ballot_positions")
        .select("id,title,sort,max_choices,agm_ballot_candidates(name,sort)").eq("ballot_id", ballot.id).order("sort");
      if (error) throw error;
      return (data as any[]).map((p) => ({
        title: p.title,
        maxChoices: p.max_choices ?? 1,
        nominees: [...p.agm_ballot_candidates].sort((a: any, b: any) => a.sort - b.sort).map((c: any) => c.name),
      }));
    },
  });
  const ballotText = text ?? (positions ? formatBallotText(positions) : "");

  const { data: voters = [] } = useQuery({
    queryKey: ["agm-voter-candidates", clubId],
    queryFn: async () => {
      const { data, error } = await rpc("agm_voter_candidates", { p_club_id: clubId });
      if (error) throw error;
      return data as any[];
    },
  });
  const chosen = selected ?? new Set(voters.filter((v) => v.suggested).map((v) => v.club_member_id));
  const noFeeRecords = voters.length > 0 && !voters.some((v) => v.has_fee_record);

  const save = async () => {
    const parsed = parseBallotText(ballotText);
    const { error } = await db("agm_ballots").update({
      title: title.trim(), declaration: declaration.trim(), deadline: new Date(deadline).toISOString(),
    }).eq("id", ballot.id);
    if (error) throw error;
    await db("agm_ballot_positions").delete().eq("ballot_id", ballot.id);
    for (const [i, p] of parsed.entries()) {
      const { data, error: pe } = await db("agm_ballot_positions").insert({ ballot_id: ballot.id, title: p.title, sort: i, max_choices: p.maxChoices ?? 1 }).select("id").single();
      if (pe) throw pe;
      const { error: ce } = await db("agm_ballot_candidates").insert(p.nominees.map((name, j) => ({ position_id: data.id, name, sort: j })));
      if (ce) throw ce;
    }
  };

  const saveMut = useMutation({
    mutationFn: save,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agm-ballots", clubId] });
      qc.invalidateQueries({ queryKey: ["agm-positions", ballot.id] });
      toast({ title: "Ballot saved" });
    },
    onError: (e: any) => toast({ title: "Could not save", description: e.message, variant: "destructive" }),
  });

  const openMut = useMutation({
    mutationFn: async () => {
      const ch = (Object.keys(channels) as ("email" | "whatsapp")[]).filter((k) => channels[k]);
      if (!ch.length) throw new Error("Tick at least one channel");
      if (!ballot.meeting_at) throw new Error("Add and save the meeting date & time first");
      await save();
      const { data, error } = await rpc("agm_open_ballot", { p_ballot_id: ballot.id, p_member_ids: [...chosen] });
      if (error) throw error;
      const rows = data as { club_member_id: string; token: string }[];
      // Invitation goes to every active member; only eligible voters also get a voting link.
      const { data: inv, error: ie } = await rpc("agm_issue_invites", { p_ballot_id: ballot.id, p_member_ids: voters.map((v) => v.club_member_id) });
      if (ie) throw ie;
      const voteTok: Record<string, string> = Object.fromEntries(rows.map((r) => [r.club_member_id, r.token]));
      const origin = window.location.origin;
      const varsV: Record<string, Record<string, string>> = {};
      const varsI: Record<string, Record<string, string>> = {};
      for (const r of inv as { club_member_id: string; token: string }[]) {
        const invite_link = buildInviteLink(r.token, origin);
        if (voteTok[r.club_member_id]) varsV[r.club_member_id] = { invite_link, vote_link: buildVoteLink(voteTok[r.club_member_id], origin) };
        else varsI[r.club_member_id] = { invite_link };
      }
      const when = fmt(new Date(deadline).toISOString());
      const meet = meetingLine(ballot.meeting_at, ballot.meeting_venue);
      const docs = (ballot.documents ?? []).length ? " The agenda, minutes and other meeting documents are on your invitation page." : "";
      const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const customMsg = (ballot.meeting_details ?? "").trim();
      // Our greeting is always first; drop any "Dear ..." opening line from the custom message so it isn't repeated.
      const bodyMsg = customMsg.replace(/^\s*dear[^\n]*\n/i, "").trim();
      const detailsHtml = bodyMsg ? `<p>${esc(bodyMsg).replace(/\{\s*member[ _]name\s*\}/gi, "{{name}}").replace(/\n/g, "<br/>")}</p>` : "";
      const inviteHtml = `<p>Dear {{name}},</p><p>You are invited to the <strong>${title}</strong>: <strong>${meet}</strong>.${docs}</p>${detailsHtml}<p><a href="{{invite_link}}">View invitation &amp; confirm attendance</a></p>`;
      const meta = { purpose: "agm_ballot", ballot_id: ballot.id };
      if (Object.keys(varsV).length) await sendComms({
        clubId, name: title, channels: ch, audience: { type: "selected", memberIds: Object.keys(varsV) }, memberVars: varsV, meta,
        content: {
          email: {
            subject: title,
            body: `${inviteHtml}<p>Your personal voting link works once and only for you: <a href="{{vote_link}}">Vote now</a></p>${bodyMsg ? "" : `<p>Voting closes <strong>${when}</strong>.</p>`}<p>Your choices are confidential — nobody, including the committee, can see how you voted.</p>`,
          },
          whatsapp: { body: `Hi {{first_name}}, you're invited to the ${title}: ${meet}. Documents & confirm attendance: {{invite_link}} . Your personal one-time voting link: {{vote_link}} — closes ${when}. Your vote is secret.` },
        },
      });
      if (Object.keys(varsI).length) await sendComms({
        clubId, name: `${title} — invitation`, channels: ch, audience: { type: "selected", memberIds: Object.keys(varsI) }, memberVars: varsI, meta,
        content: {
          email: { subject: title, body: inviteHtml },
          whatsapp: { body: `Hi {{first_name}}, you're invited to the ${title}: ${meet}. Documents & confirm attendance: {{invite_link}}` },
        },
      });
      return rows.length;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["agm-ballots", clubId] });
      toast({ title: "Voting opened", description: `Invitations sent to all active members; ${n} include a personal voting link.` });
    },
    onError: (e: any) => toast({ title: "Could not open voting", description: e.message, variant: "destructive" }),
  });

  const toggle = (id: string) => {
    const s = new Set(chosen);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };

  return (
    <Card className="p-3 space-y-3">
      <div className="grid sm:grid-cols-2 gap-2">
        <label className="text-xs space-y-1"><span className="text-muted-foreground">Title</span>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="text-xs space-y-1"><span className="text-muted-foreground">Voting deadline (your local time)</span>
          <Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></label>
      </div>
      <label className="text-xs space-y-1 block">
        <span className="text-muted-foreground">Positions and accepted nominees — one line per position: <em>Position: Name, Name</em>. To let members pick more than one, add the number in brackets, e.g. <em>General Member (3): Name, Name</em></span>
        <Textarea rows={6} value={ballotText} onChange={(e) => setText(e.target.value)} className="font-mono text-xs" />
      </label>
      <label className="text-xs space-y-1 block"><span className="text-muted-foreground">Membership declaration voters must tick</span>
        <Textarea rows={3} value={declaration} onChange={(e) => setDeclaration(e.target.value)} /></label>

      <div>
        <p className="text-xs font-semibold mb-1">Eligible voters ({chosen.size} of {voters.length} active members ticked)</p>
        <p className="text-[11px] text-muted-foreground mb-2">
          Pre-ticked: aged 18+ (from SA ID) with this year's membership fee paid.
          {noFeeRecords && " This club has no membership fee records in SquashHub, so please untick anyone who is not paid up."}
          {" "}Members without an ID number are pre-ticked — check juniors.
        </p>
        <div className="max-h-64 overflow-auto border border-border rounded divide-y divide-border">
          {voters.map((v) => (
            <label key={v.club_member_id} className="flex items-center gap-2 px-2 py-1 text-xs cursor-pointer">
              <Checkbox checked={chosen.has(v.club_member_id)} onCheckedChange={() => toggle(v.club_member_id)} />
              <span className="flex-1 truncate">{v.name}</span>
              <span className="text-muted-foreground">{v.age != null ? `${v.age}y` : "age ?"}</span>
              {v.has_fee_record && <Badge variant="secondary" className="text-[10px]">{v.annual_fee_paid ? "paid" : "unpaid"}</Badge>}
              {!v.email && <span className="text-destructive text-[10px]">no email</span>}
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="text-muted-foreground">Send links by:</span>
        <label className="flex items-center gap-1"><Checkbox checked={channels.email} onCheckedChange={(v) => setChannels((c) => ({ ...c, email: v === true }))} />Email</label>
        <label className="flex items-center gap-1"><Checkbox checked={channels.whatsapp} onCheckedChange={(v) => setChannels((c) => ({ ...c, whatsapp: v === true }))} />WhatsApp</label>
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>Save draft</Button>
        <Button size="sm" disabled={openMut.isPending}
          onClick={() => { if (confirm(`Send the AGM invitation to all ${voters.length} active members and open voting for ${chosen.size} eligible voters? Positions, nominees and the voter list cannot be changed afterwards.`)) openMut.mutate(); }}>
          <Send className="w-3.5 h-3.5 mr-1" />Send invitations & open voting
        </Button>
      </div>
    </Card>
  );
}

function OpenBallot({ clubId, ballot }: { clubId: string; ballot: any }) {
  const qc = useQueryClient();
  const closed = new Date(ballot.deadline) <= new Date();
  const [newDeadline, setNewDeadline] = useState(toLocalInput(ballot.deadline));

  const { data: turnout = [] } = useQuery({
    queryKey: ["agm-turnout", ballot.id],
    queryFn: async () => {
      const { data, error } = await rpc("agm_ballot_turnout", { p_ballot_id: ballot.id });
      if (error) throw error;
      return data as any[];
    },
    refetchInterval: closed ? false : 30_000,
  });
  const voted = turnout.filter((t) => t.voted).length;

  const { data: results } = useQuery({
    queryKey: ["agm-results", ballot.id],
    queryFn: async () => {
      const { data, error } = await rpc("agm_ballot_results", { p_ballot_id: ballot.id });
      if (error) throw error;
      return data as any;
    },
    enabled: closed,
  });

  const extend = useMutation({
    mutationFn: async () => {
      const { error } = await rpc("agm_extend_deadline", { p_ballot_id: ballot.id, p_deadline: new Date(newDeadline).toISOString() });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["agm-ballots", clubId] }); toast({ title: "Deadline extended" }); },
    onError: (e: any) => toast({ title: "Could not extend", description: e.message, variant: "destructive" }),
  });

  const resend = useMutation({
    mutationFn: async (memberId: string) => {
      const { data, error } = await rpc("agm_reissue_token", { p_ballot_id: ballot.id, p_member_id: memberId });
      if (error) throw error;
      const link = buildVoteLink(data as string, window.location.origin);
      await sendComms({
        clubId, name: `${ballot.title} — replacement link`, channels: ["email"],
        audience: { type: "selected", memberIds: [memberId] }, memberVars: { [memberId]: { vote_link: link } },
        meta: { purpose: "agm_ballot", ballot_id: ballot.id },
        content: { email: { subject: `${ballot.title} — new voting link`, body: `<p>Dear {{first_name}},</p><p>Here is your new personal voting link (the old one no longer works): <a href="{{vote_link}}">Vote now</a></p><p>Voting closes ${fmt(ballot.deadline)}.</p>` } },
      });
    },
    onSuccess: () => toast({ title: "New link emailed" }),
    onError: (e: any) => toast({ title: "Could not resend", description: e.message, variant: "destructive" }),
  });

  const candidateName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of results?.positions ?? []) for (const t of p.tally) m[t.candidate_id] = t.name;
    return m;
  }, [results]);

  return (
    <Card className="p-3 space-y-3 print:shadow-none" id="agm-results">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold flex-1">{ballot.title}</p>
        <span className="text-xs text-muted-foreground">{closed ? "Closed" : "Closes"} {fmt(ballot.deadline)}</span>
        {closed && <Button size="sm" variant="outline" onClick={() => window.print()} className="print:hidden"><Printer className="w-3.5 h-3.5 mr-1" />Print</Button>}
      </div>
      <p className="text-sm">Turnout: <strong>{voted}</strong> of {turnout.length} eligible voters ({turnout.length ? Math.round((voted / turnout.length) * 100) : 0}%)</p>

      {!closed && (
        <>
          <p className="text-xs text-muted-foreground">Results unlock automatically after the deadline. Only turnout is visible while voting is open.</p>
          <div className="flex items-end gap-2 print:hidden">
            <label className="text-xs space-y-1"><span className="text-muted-foreground">Extend deadline</span>
              <Input type="datetime-local" value={newDeadline} onChange={(e) => setNewDeadline(e.target.value)} /></label>
            <Button size="sm" variant="outline" onClick={() => extend.mutate()} disabled={extend.isPending}>Extend</Button>
          </div>
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Who has voted (names only — choices are never shown)</summary>
            <div className="mt-2 max-h-64 overflow-auto divide-y divide-border border border-border rounded">
              {turnout.map((t) => (
                <div key={t.club_member_id} className="flex items-center gap-2 px-2 py-1">
                  <span className="flex-1">{t.name}</span>
                  {t.voted ? <Badge variant="secondary" className="text-[10px]">voted</Badge>
                    : <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => resend.mutate(t.club_member_id)}>Resend link</Button>}
                </div>
              ))}
            </div>
          </details>
        </>
      )}

      {closed && results && (
        <div className="space-y-3">
          {results.positions.map((p: any) => {
            const seats = p.max_choices ?? 1;
            const { elected, tie } = positionWinners(p.tally, seats);
            const recount = recountFromReceipts(results.receipts, p.id);
            const recountOk = p.tally.every((t: any) => (recount[t.candidate_id] ?? 0) === t.votes) && (recount.abstain ?? 0) === p.abstain;
            return (
              <div key={p.id} className="border border-border rounded p-2">
                <p className="text-sm font-semibold">{p.title}{seats > 1 && <span className="font-normal text-muted-foreground"> · {seats} places</span>}</p>
                <table className="w-full text-xs mt-1">
                  <tbody>
                    {[...p.tally].sort((a: any, b: any) => b.votes - a.votes).map((t: any) => (
                      <tr key={t.candidate_id} className={elected.includes(t.name) ? "font-semibold text-primary" : ""}>
                        <td className="py-0.5">{t.name}</td><td className="text-right">{t.votes}</td>
                      </tr>
                    ))}
                    <tr className="text-muted-foreground"><td>Abstain</td><td className="text-right">{p.abstain}</td></tr>
                  </tbody>
                </table>
                <p className="text-[11px] mt-1">
                  {elected.length ? `Elected: ${elected.join(", ")}` : ""}{tie.length ? `${elected.length ? " · " : ""}Tie: ${tie.join(", ")} — decide at the AGM` : ""}{!elected.length && !tie.length ? "No votes cast" : ""}
                  {" · "}<span className={recountOk ? "text-muted-foreground" : "text-destructive"}>{recountOk ? "Recount from receipts matches" : "Recount mismatch — investigate"}</span>
                </p>
              </div>
            );
          })}
          <details className="text-xs" open>
            <summary className="cursor-pointer font-semibold">Anonymous receipts ({results.ballots}) — members can check their own code</summary>
            <table className="w-full mt-2 text-[11px]">
              <thead><tr className="text-left text-muted-foreground"><th>Receipt</th>{results.positions.map((p: any) => <th key={p.id}>{p.title}</th>)}</tr></thead>
              <tbody>
                {results.receipts.map((r: any) => (
                  <tr key={r.code} className="border-t border-border">
                    <td className="font-mono py-0.5">{r.code}</td>
                    {results.positions.map((p: any) => <td key={p.id}>{receiptPicks(r.choices?.[p.id]).map((c) => candidateName[c]).join(", ") || "Abstain"}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      )}
    </Card>
  );
}
