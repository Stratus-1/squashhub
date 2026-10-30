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
import { Printer, Send, Vote, Plus, Loader2 } from "lucide-react";
import { sendComms } from "@/lib/comms/send";
import { AgmMeetingCard } from "./AgmMeetingCard";
import { AgmTestEmail } from "./AgmTestEmail";
import { AgmNominationsCard } from "./AgmNominationsCard";
import { runoffForPosition } from "@/lib/agm/runoff";
import {
  buildInviteLink, buildNominationLink, defaultNominationMessage, nominationMessageHtml, meetingLine, buildVoteLink, DEFAULT_DECLARATION, DEFAULT_INVITATION_MESSAGE, formatBallotText, parseBallotText, positionWinners, recountFromReceipts, receiptPicks,
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
        club_id: clubId, title: `${clubName} AGM`, deadline,
        declaration: DEFAULT_DECLARATION(clubName), meeting_details: DEFAULT_INVITATION_MESSAGE, created_by: user?.id ?? null,
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
          <p className="text-sm font-semibold flex items-center gap-1.5"><Vote className="w-4 h-4 text-primary" />AGM process</p>
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
      {ballot && (ballot.status === "draft"
        ? <DraftEditor key={ballot.id} clubId={clubId} ballot={ballot} />
        : <>
            <StepHeader step={3} title="AGM invitation & voting" state="current"
              desc="The meeting invitation and attendance replies are below, followed by turnout and — after the deadline — the results." />
            {!ballot.runoff_parent_id && <AgmMeetingCard key={`m-${ballot.id}`} clubId={clubId} ballot={ballot} />}
            {ballot.runoff_parent_id && <Button variant="outline" size="sm" onClick={() => setSelectedId(ballot.runoff_parent_id)}>Original round results</Button>}
            <OpenBallot key={ballot.id} clubId={clubId} ballot={ballot}
              runoff={ballots.find((b) => b.runoff_parent_id === ballot.id)} onSelect={setSelectedId} />
          </>)}
      {ballot && <AgmTestEmail key={`test-${ballot.id}`} clubId={clubId} ballotId={ballot.id} />}
    </div>
  );
}

function StepHeader({ step, title, state, desc }: { step: number; title: string; state: "done" | "current" | "upcoming"; desc: string }) {
  return (
    <div className="flex items-start gap-2 pt-1">
      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${state === "done" ? "bg-primary text-primary-foreground" : state === "current" ? "border-2 border-primary text-primary" : "border border-border text-muted-foreground"}`}>
        {state === "done" ? "✓" : step}
      </span>
      <div>
        <p className="text-sm font-semibold">Step {step} — {title}</p>
        <p className="text-[11px] text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}

function DraftEditor({ clubId, ballot }: { clubId: string; ballot: any }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(ballot.title);
  const [deadline, setDeadline] = useState(toLocalInput(ballot.deadline));
  const [declaration, setDeclaration] = useState(ballot.declaration);
  const [allowSelf, setAllowSelf] = useState(!!ballot.allow_self_actions);
  const [allowSelfVote, setAllowSelfVote] = useState(!!ballot.allow_self_vote);
  const [text, setText] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [channels, setChannels] = useState({ email: true, whatsapp: false });
  const nomStage: "none" | "open" | "closed" = ballot.nominations_status ?? "none";
  const positionsLocked = nomStage !== "none";
  const [nomClose, setNomClose] = useState(toLocalInput(ballot.nominations_close_at ?? new Date(Date.now() + 7 * 864e5).toISOString()));
  const [nomMsg, setNomMsg] = useState<string>(ballot.nomination_message ?? defaultNominationMessage(!!ballot.allow_self_actions));

  const loadPositions = async () => {
      const { data, error } = await db("agm_ballot_positions")
        .select("id,title,sort,max_choices,agm_ballot_candidates(name,sort)").eq("ballot_id", ballot.id).order("sort");
      if (error) throw error;
      return (data as any[]).map((p) => ({
        title: p.title,
        maxChoices: p.max_choices ?? 1,
        nominees: [...p.agm_ballot_candidates].sort((a: any, b: any) => a.sort - b.sort).map((c: any) => c.name),
      }));
  };
  const { data: positions } = useQuery({ queryKey: ["agm-positions", ballot.id], queryFn: loadPositions });
  const SAMPLE_POSITIONS = "Chairperson:\nVice-Chairperson:\nSecretary:\nTreasurer:\nClub Manager:\nGeneral Member (3):";
  // Sample positions are real, editable text (not a placeholder) so an untouched draft still saves them.
  const ballotText = text ?? (positions ? (positions.length ? formatBallotText(positions) : (ballot.status === "draft" ? SAMPLE_POSITIONS : "")) : "");

  const { data: voters = [] } = useQuery({
    queryKey: ["agm-voter-candidates", clubId],
    queryFn: async () => {
      const { data, error } = await rpc("agm_voter_candidates", { p_club_id: clubId });
      if (error) throw error;
      return data as any[];
    },
  });
  // Once nominations were sent, the ticked list defaults to the members who got nomination links.
  const { data: nominatorIds } = useQuery({
    queryKey: ["agm-nominator-ids", ballot.id],
    enabled: nomStage !== "none",
    queryFn: async () => {
      const { data, error } = await db("agm_nominators").select("club_member_id").eq("ballot_id", ballot.id);
      if (error) throw error;
      return (data as any[]).map((r) => r.club_member_id as string);
    },
  });
  const chosen = selected ?? (nominatorIds?.length ? new Set(nominatorIds) : new Set(voters.filter((v) => v.suggested).map((v) => v.club_member_id)));
  const noFeeRecords = voters.length > 0 && !voters.some((v) => v.has_fee_record);

  const save = async () => {
    const parsed = positionsLocked ? [] : parseBallotText(ballotText, { allowEmpty: true });
    const { error } = await db("agm_ballots").update({
      title: title.trim(), declaration: declaration.trim(), deadline: new Date(deadline).toISOString(),
      allow_self_actions: allowSelf, allow_self_vote: allowSelfVote,
      ...(nomStage === "none" ? { nomination_message: nomMsg, nominations_close_at: new Date(nomClose).toISOString() } : {}),
    }).eq("id", ballot.id);
    if (error) throw error;
    if (positionsLocked) return;
    await db("agm_ballot_positions").delete().eq("ballot_id", ballot.id);
    for (const [i, p] of parsed.entries()) {
      const { data, error: pe } = await db("agm_ballot_positions").insert({ ballot_id: ballot.id, title: p.title, sort: i, max_choices: p.maxChoices ?? 1 }).select("id").single();
      if (pe) throw pe;
      if (!p.nominees.length) continue;
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
      // Check what was just saved, not the positions loaded before this click.
      const saved = await qc.fetchQuery({ queryKey: ["agm-positions", ballot.id], queryFn: loadPositions, staleTime: 0 });
      const empty = saved.filter((p) => !p.nominees.length).map((p) => p.title);
      if (empty.length) throw new Error(`These positions have no accepted nominees yet: ${empty.join(", ")}. Add a nominee or remove the position before opening voting.`);
      if (!chosen.size) throw new Error("Tick at least one member");
      // Invitation and voting link go only to the members ticked in step 1.
      // Issue invites first so a failure never leaves the ballot half-opened.
      const { data: inv, error: ie } = await rpc("agm_issue_invites", { p_ballot_id: ballot.id, p_member_ids: [...chosen] });
      if (ie) throw ie;
      const { data, error } = await rpc("agm_open_ballot", { p_ballot_id: ballot.id, p_member_ids: [...chosen] });
      if (error) throw error;
      const rows = data as { club_member_id: string; token: string }[];
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

  const nomMut = useMutation({
    mutationFn: async () => {
      const ch = (Object.keys(channels) as ("email" | "whatsapp")[]).filter((k) => channels[k]);
      if (!ch.length) throw new Error("Tick at least one channel");
      if (!ballot.meeting_at) throw new Error("Add and save the AGM meeting date & time (step 3) first — the call for nominations announces it");
      await save();
      const closeIso = new Date(nomClose).toISOString();
      const { data, error } = await rpc("agm_open_nominations", { p_ballot_id: ballot.id, p_member_ids: [...chosen], p_close_at: closeIso });
      if (error) throw error;
      const rows = data as { club_member_id: string; token: string }[];
      const origin = window.location.origin;
      const vars = Object.fromEntries(rows.map((r) => [r.club_member_id, { nomination_link: buildNominationLink(r.token, origin) }]));
      const closes = fmt(closeIso);
      const meet = meetingLine(ballot.meeting_at, ballot.meeting_venue) || "the date to be confirmed";
      await sendComms({
        clubId, name: `${title} — call for nominations`, channels: ch, audience: { type: "selected", memberIds: Object.keys(vars) }, memberVars: vars,
        meta: { purpose: "agm_nominations", ballot_id: ballot.id },
        content: {
          email: {
            subject: `${title} — nominations for the committee`,
            body: `${nominationMessageHtml(nomMsg, { meeting: meet, closes })}<p><a href="{{nomination_link}}">Make your nominations</a></p>`,
},
          whatsapp: { body: `Hi {{first_name}}, nominations for the ${title} committee are open until ${closes}. Nominate another member${allowSelf ? ", or make yourself available for the position you would like to fill" : ""}, and accept nominations you receive: {{nomination_link}}` },
        },
      });
      return rows.length;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["agm-ballots", clubId] });
      toast({ title: "Nominations opened", description: `Nomination links sent to ${n} eligible members.` });
    },
    onError: (e: any) => toast({ title: "Could not open nominations", description: e.message, variant: "destructive" }),
  });

  const toggle = (id: string) => {
    const s = new Set(chosen);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };

  const step1State: "done" | "current" | "upcoming" = nomStage === "none" ? "current" : "done";
  const step2State: "done" | "current" | "upcoming" = nomStage === "none" ? "upcoming" : nomStage === "open" ? "current" : "done";

  return (
    <>
      <StepHeader step={1} title="Call for nominations" state={step1State}
        desc={nomStage === "none"
          ? "List the committee positions (one per line), tick the eligible members and send the call. Members nominate themselves or others on their personal link."
          : "Call sent — positions and the member list are now locked."} />
      <Card className="p-3 space-y-3">
        <label className="text-xs space-y-1 block">
          <span className="text-muted-foreground">Committee positions — one per line: <em>Position</em>. Accepted nominees are added automatically in step 2. To let members pick more than one, add the number in brackets, e.g. <em>General Member (3)</em></span>
          <Textarea rows={6} value={ballotText} readOnly={positionsLocked} onChange={(e) => setText(e.target.value)} className="font-mono text-xs"
            placeholder={"Chairperson:\nVice-Chairperson:\nSecretary:\nTreasurer:\nClub Manager:\nGeneral Member (3):"} />
          {positionsLocked
            ? <span className="text-[11px] text-muted-foreground block">{nomStage === "open" ? "Nominations are open — positions are locked. Accepted nominees are added here automatically when nominations close." : "Filled in from accepted nominations."}</span>
            : <span className="text-[11px] text-muted-foreground block">Sample positions are shown as a guide — replace them with your own. You can also type nominees after a colon (e.g. <em>Chairperson: Name, Name</em>) to skip the nominations step.</span>}
        </label>

        <label className="flex items-start gap-2 text-xs cursor-pointer">
          <Checkbox checked={allowSelf} onCheckedChange={(v) => setAllowSelf(v === true)} className="mt-0.5" />
          <span><span className="font-semibold">Allow members to make themselves available (self-nomination).</span>{" "}
            <span className="text-muted-foreground">When on, members can nominate another person or put their own name forward for the position or function they would like to fulfil. When off, they can only nominate other members.</span></span>
        </label>
        <label className="flex items-start gap-2 text-xs cursor-pointer">
          <Checkbox checked={allowSelfVote} onCheckedChange={(v) => setAllowSelfVote(v === true)} className="mt-0.5" />
          <span><span className="font-semibold">Allow members to vote for themselves.</span>{" "}
            <span className="text-muted-foreground">When off, a member's own name is hidden on their ballot. You can change this until voting opens.</span></span>
        </label>

        <div>
          <p className="text-xs font-semibold mb-1">Eligible members ({chosen.size} of {voters.length} active members ticked)</p>
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

        <label className="text-xs space-y-1 block"><span className="text-muted-foreground">Call for nominations message — saved with the draft. <em>{"{member name}"}</em>, <em>{"{meeting date}"}</em> and <em>{"{nominations close}"}</em> are filled in for each member; the personal nomination link is added below it.</span>
          <Textarea rows={10} value={nomMsg} readOnly={nomStage !== "none"} onChange={(e) => setNomMsg(e.target.value)} className="text-xs" />
          {!ballot.meeting_at && nomStage === "none" && <span className="text-[11px] text-destructive block">Set the AGM date & time in step 3 so it appears in this message.</span>}
          {nomStage === "none" && <Button type="button" variant="ghost" size="sm" className="h-6 text-[11px]" onClick={() => setNomMsg(defaultNominationMessage(allowSelf))}>Reset to default wording</Button>}
        </label>
        {nomStage === "none" && <AgmTestEmail clubId={clubId} ballotId={ballot.id} kind="nominations" beforeSend={save} />}

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="text-muted-foreground">Send links by:</span>
          <label className="flex items-center gap-1"><Checkbox checked={channels.email} onCheckedChange={(v) => setChannels((c) => ({ ...c, email: v === true }))} />Email</label>
          <label className="flex items-center gap-1"><Checkbox checked={channels.whatsapp} onCheckedChange={(v) => setChannels((c) => ({ ...c, whatsapp: v === true }))} />WhatsApp</label>
        </div>

        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
          {nomStage === "none" && (
            <>
              <label className="text-xs space-y-1"><span className="text-muted-foreground">Nominations close (your local time)</span>
                <Input type="datetime-local" value={nomClose} onChange={(e) => setNomClose(e.target.value)} /></label>
              <Button size="sm" disabled={nomMut.isPending}
                onClick={() => { if (confirm(`Send the call for nominations to the ${chosen.size} ticked members? Positions cannot be changed afterwards.`)) nomMut.mutate(); }}>
                {nomMut.isPending ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />Sending nominations…</> : <><Send className="w-3.5 h-3.5 mr-1" />Send call for nominations</>}
              </Button>
            </>
          )}
          <span className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>Save draft</Button>
        </div>
      </Card>

      <StepHeader step={2} title="Nominees accept or decline" state={step2State}
        desc="Self-nominations count immediately. Members nominated by someone else accept or decline on their own link — only accepted nominees go onto the ballot." />
      {nomStage === "none"
        ? <Card className="p-3"><p className="text-xs text-muted-foreground">This step starts automatically once you send the call for nominations in step 1. When nominations close, the accepted nominees fill the ballot.</p></Card>
        : <AgmNominationsCard key={`n-${ballot.id}`} clubId={clubId} ballot={ballot} />}

      <StepHeader step={3} title="AGM invitation & voting" state="current"
        desc="Add the meeting details and documents, then send the invitation and open the secret ballot for the members ticked in step 1." />
      <AgmMeetingCard key={`m-${ballot.id}`} clubId={clubId} ballot={ballot} />
      <Card className="p-3 space-y-3">
        <div className="grid sm:grid-cols-2 gap-2">
          <label className="text-xs space-y-1"><span className="text-muted-foreground">Title</span>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <label className="text-xs space-y-1"><span className="text-muted-foreground">Voting deadline (your local time)</span>
            <Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></label>
        </div>
        <label className="text-xs space-y-1 block"><span className="text-muted-foreground">Membership declaration voters must tick</span>
          <Textarea rows={3} value={declaration} onChange={(e) => setDeclaration(e.target.value)} /></label>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>Save draft</Button>
          <Button size="sm" disabled={openMut.isPending || nomStage === "open"}
            onClick={() => { if (confirm(`Send the AGM invitation and voting link to the ${chosen.size} ticked members? Positions, nominees and the voter list cannot be changed afterwards.`)) openMut.mutate(); }}>
            {openMut.isPending ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />Sending invitations…</> : <><Send className="w-3.5 h-3.5 mr-1" />Send invitations & open voting</>}
          </Button>
        </div>
        {nomStage === "open" && <p className="text-[11px] text-muted-foreground">Voting can open once nominations have closed and the accepted nominees are on the ballot.</p>}
      </Card>
    </>
  );
}

function OpenBallot({ clubId, ballot, runoff, onSelect }: { clubId: string; ballot: any; runoff?: any; onSelect: (id: string) => void }) {
  const qc = useQueryClient();
  const closed = new Date(ballot.deadline) <= new Date();
  const [newDeadline, setNewDeadline] = useState(toLocalInput(ballot.deadline));
  const [runoffDeadline, setRunoffDeadline] = useState(toLocalInput(new Date(Date.now() + 864e5).toISOString()));

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

  const tiedPositions = (results?.positions ?? []).flatMap((p: any) => {
    const tie = runoffForPosition(p.tally, p.max_choices ?? 1);
    return tie ? [{ ...tie, title: p.title }] : [];
  });
  const openRunoff = useMutation({
    mutationFn: async () => {
      const { data, error } = await rpc("agm_open_runoff", { p_ballot_id: ballot.id, p_deadline: new Date(runoffDeadline).toISOString() });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["agm-ballots", clubId] });
      onSelect(id);
      toast({ title: "Run-off opened", description: "Existing personal voting links now open the run-off. Original results are unchanged. No emails sent." });
    },
    onError: (e: any) => toast({ title: "Could not open run-off", description: e.message, variant: "destructive" }),
  });

  const sendRunoff = useMutation({
    mutationFn: async () => {
      const memberVars: Record<string, Record<string, string>> = {};
      for (const member of turnout.filter((t) => !t.voted)) {
        const { data, error } = await rpc("agm_reissue_token", { p_ballot_id: ballot.id, p_member_id: member.club_member_id });
        if (error) throw error;
        memberVars[member.club_member_id] = { vote_link: buildVoteLink(data as string, window.location.origin) };
      }
      if (!Object.keys(memberVars).length) throw new Error("No members are awaiting a run-off vote");
      await sendComms({
        clubId, name: ballot.title, channels: ["email"], audience: { type: "selected", memberIds: Object.keys(memberVars) }, memberVars,
        meta: { purpose: "agm_ballot", ballot_id: ballot.id },
        content: { email: { subject: ballot.title, body: `<p>Dear {{name}},</p><p>A second secret ballot is open between candidates tied for the remaining committee places. Candidates already elected in the original round remain elected.</p><p><a href="{{vote_link}}">Vote in the run-off</a></p><p>Voting closes ${fmt(ballot.deadline)}. You may submit one ballot in this round. Your choices remain confidential.</p>` } },
      });
    },
    onSuccess: () => toast({ title: "Run-off emails queued" }),
    onError: (e: any) => toast({ title: "Could not send run-off emails", description: e.message, variant: "destructive" }),
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

  const [pdfBusy, setPdfBusy] = useState(false);
  const downloadPdf = async () => {
    setPdfBusy(true);
    try {
      const [{ data: club }, { data: inv, error: ie }] = await Promise.all([
        supabase.from("clubs").select("name,logo_url").eq("id", clubId).maybeSingle(),
        (supabase as any).from("agm_invitees").select("rsvp,club_members(name)").eq("ballot_id", ballot.runoff_parent_id ?? ballot.id),
      ]);
      if (ie) throw ie;
      const list = (inv ?? []) as any[];
      const names = (pred: (r: string | null) => boolean) => list.filter((i) => pred(i.rsvp)).map((i) => i.club_members?.name ?? "Member").sort();
      const inPerson = names((r) => r === "attending_in_person" || r === "attending");
      const online = names((r) => r === "attending_online");
      const apologies = names((r) => r === "apologies");
      const { buildAgmResultsPdf } = await import("@/lib/agm/results-pdf");
      const doc = await buildAgmResultsPdf({
        clubName: (club as any)?.name ?? "Club", clubLogoUrl: (club as any)?.logo_url, title: ballot.title, closedAt: ballot.deadline,
        turnout: { voted, eligible: turnout.length },
        attendance: { inPerson, online, apologies, noReply: list.length - inPerson.length - online.length - apologies.length },
        results,
      });
      doc.save(`${ballot.title.replace(/[^\w\- ]+/g, "")} - results.pdf`);
    } catch (e: any) {
      toast({ title: "Could not create PDF", description: e.message, variant: "destructive" });
    } finally { setPdfBusy(false); }
  };

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
        {closed && <Button size="sm" variant="outline" disabled={!results || pdfBusy} onClick={downloadPdf} className="print:hidden">
          {pdfBusy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Printer className="w-3.5 h-3.5 mr-1" />}Results PDF</Button>}
      </div>
      <p className="text-sm">Turnout: <strong>{voted}</strong> of {turnout.length} eligible voters ({turnout.length ? Math.round((voted / turnout.length) * 100) : 0}%)</p>
      {ballot.runoff_parent_id && !closed && <Button size="sm" variant="outline" disabled={sendRunoff.isPending || !turnout.some((t) => !t.voted)}
        onClick={() => { if (confirm("Email a run-off voting link to eligible members who have not yet voted in this round?")) sendRunoff.mutate(); }}>
        {sendRunoff.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />} {sendRunoff.isPending ? "Sending run-off emails…" : "Send run-off emails"}
      </Button>}
      {closed && runoff && <Button size="sm" variant="outline" onClick={() => onSelect(runoff.id)}>View run-off</Button>}
      {closed && !runoff && tiedPositions.length > 0 && <div className="space-y-2 border-t border-border pt-3 print:hidden">
        <p className="text-sm font-semibold">Second ballot — tied seats</p>
        {tiedPositions.map((p: any) => <p key={p.title} className="text-xs">{p.title}: {p.tied.map((c: any) => c.name).join(", ")} · {p.remainingSeats} remaining {p.remainingSeats === 1 ? "place" : "places"}</p>)}
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs space-y-1"><span className="text-muted-foreground">Run-off deadline (your local time)</span>
            <Input type="datetime-local" aria-label="Run-off deadline" value={runoffDeadline} onChange={(e) => setRunoffDeadline(e.target.value)} /></label>
          <Button size="sm" disabled={openRunoff.isPending || !runoffDeadline} onClick={() => { if (confirm("Open a second secret ballot for tied candidates only? Original results stay unchanged; each eligible member may vote once in the new round. No emails will be sent yet.")) openRunoff.mutate(); }}>
            {openRunoff.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Vote className="w-3.5 h-3.5 mr-1" />}Open run-off voting
          </Button>
        </div>
      </div>}

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
