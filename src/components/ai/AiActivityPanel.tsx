import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Undo2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { getSupportAttachmentUrl } from "@/hooks/use-support";
import { useAiActivity, useAiRollback, useBetaClubs, useSetBetaClub, AI_ACTIONS_FEATURE, type AiActivityRow } from "@/hooks/use-ai-help";
import { useQuery } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";

const STATUSES = ["answered", "proposed", "executed", "failed", "cancelled", "expired", "escalated", "rolled_back"];
const QUICK: { key: string; label: string }[] = [
  { key: "executed", label: "Completed actions" },
  { key: "escalated", label: "Escalated" },
  { key: "failed", label: "Failed" },
  { key: "all", label: "Everything" },
];
const ACTION_LABELS: Record<string, string> = {
  create_booking: "Booked a court",
  cancel_my_booking: "Cancelled a booking",
  replace_tournament_player: "Replaced a tournament player",
  correct_match_result: "Corrected a match result",
  update_my_contact: "Updated contact details",
};
const OUTCOME: Record<string, string> = { executed: "Completed", escalated: "Escalated", failed: "Failed", rolled_back: "Completed, then reversed", proposed: "Waiting for confirm", cancelled: "Cancelled by user", expired: "Preview expired", answered: "Answered" };

/** Super Admin: every AI assistant interaction across clubs, plus safe rollback. */
export function AiActivityPanel({ showBetaClubs = true }: { showBetaClubs?: boolean } = {}) {
  const [status, setStatus] = useState<string>("executed");
  const { data: rows = [], isLoading } = useAiActivity({ status: status === "all" ? undefined : status });
  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const { data: names = {} } = useQuery({
    queryKey: ["ai-activity-names", userIds.join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data } = await fromExt("club_members").select("user_id, name").in("user_id", userIds);
      return Object.fromEntries((data ?? []).map((m: any) => [m.user_id, m.name])) as Record<string, string>;
    },
  });

  return (
    <div className="space-y-3 text-[13px]">
      {showBetaClubs && <BetaClubsCard />}
      <div className="flex flex-wrap items-center gap-2">
        {QUICK.map((q) => (
          <Button key={q.key} size="sm" variant={status === q.key ? "default" : "outline"} onClick={() => setStatus(q.key)}>{q.label}</Button>
        ))}
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44 h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground">{rows.length} shown (latest 200)</span>
      </div>
      {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
      {!isLoading && rows.length === 0 && <p className="text-muted-foreground">No assistant activity yet.</p>}
      {rows.map((r) => <ActivityRow key={r.id} row={r} who={names[r.user_id] ?? r.user_id.slice(0, 8)} />)}
    </div>
  );
}

function ActivityRow({ row, who }: { row: AiActivityRow; who: string }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<{ message: string; changes: string[]; ok: boolean } | null>(null);
  const rb = useAiRollback();
  const canRollback = row.status === "executed" && row.reversible && !row.rolled_back_by;

  const startRollback = async () => {
    try { setConfirm(await rb.mutateAsync({ id: row.id, preview: true }) as any); }
    catch (e) { toast.error((e as Error).message); }
  };
  const doRollback = async () => {
    try { const r = await rb.mutateAsync({ id: row.id, preview: false }); toast.success(r.message || "Reversed"); }
    catch (e) { toast.error((e as Error).message); }
    setConfirm(null);
  };

  return (
    <Card>
      <CardContent className="p-3 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">{format(new Date(row.created_at), "d MMM yyyy HH:mm")}</span>
          <span className="font-semibold">{who}</span>
          <span className="text-muted-foreground">{row.clubs?.name ?? "—"} · {row.role ?? "member"}</span>
          <Badge variant="outline">{row.kind}</Badge>
          <Badge variant={row.status === "failed" ? "destructive" : row.status === "executed" ? "default" : "secondary"}>{row.status.replace("_", " ")}</Badge>
          {row.transcript_used && <Badge variant="outline">voice</Badge>}
          <button className="ml-auto text-primary underline text-[12px]" onClick={() => setOpen((v) => !v)}>{open ? "Hide" : "Details"}</button>
        </div>
        {row.action_name ? (
          <div className="space-y-0.5">
            <p className="font-medium">{ACTION_LABELS[row.action_name] ?? row.action_name} — {OUTCOME[row.status] ?? row.status}{row.kind === "rollback" ? " (reversal)" : ""}</p>
            {row.preview?.summary && <p>{row.preview.summary}</p>}
            {(row.preview?.changes ?? []).map((c: string, i: number) => <p key={i} className="text-muted-foreground">Before → after: {c}</p>)}
            {(row.preview?.affected ?? []).length > 0 && <p className="text-muted-foreground">Affects: {row.preview.affected.join(" · ")}</p>}
            <p className="text-[12px] text-muted-foreground">
              Asked: “{row.request_text}” · {row.confirmed_at ? `Confirmed by requester ${format(new Date(row.confirmed_at), "d MMM HH:mm")}` : "Not confirmed"}
              {row.status === "executed" ? (row.reversible && !row.rolled_back_by ? " · Safe reversal available" : " · No automatic reversal") : ""}
              {row.ticket_id ? " · Linked support ticket" : ""}
            </p>
          </div>
        ) : <p className="line-clamp-2">{row.request_text}</p>}
        {open && (
          <div className="space-y-2 pt-2 border-t mt-2">
            <Field label="Page">{row.context?.route ?? "—"} {row.context?.ids && Object.keys(row.context.ids).length ? JSON.stringify(row.context.ids) : ""}</Field>
            {row.interpretation && <Field label="AI interpretation">{row.interpretation}</Field>}
            {row.action_name && <Field label="Proposed action">{row.action_name}</Field>}
            {row.preview && <Field label="Preview shown">{[row.preview.summary, ...row.preview.changes].join(" · ")}</Field>}
            {row.confirmed_at && <Field label="Confirmed">{format(new Date(row.confirmed_at), "d MMM HH:mm:ss")}</Field>}
            {row.result?.message && <Field label="Result">{row.result.message}</Field>}
            {row.result?.answer && <Field label="Answer">{row.result.answer}</Field>}
            {row.error && <Field label="Error">{row.error}</Field>}
            {row.escalation_reason && <Field label="Escalated because">{row.escalation_reason}</Field>}
            {row.ticket_id && <Field label="Ticket"><Link className="text-primary underline" to={`/admin/support?thread=${row.ticket_id}`}>Open ticket</Link></Field>}
            {row.rollback_of && <Field label="Reverses">{row.rollback_of}</Field>}
            {row.rolled_back_by && <Field label="Reversed by">{row.rolled_back_by}</Field>}
            {(row.before_data || row.after_data) && (
              <details><summary className="cursor-pointer text-[12px] text-muted-foreground">Technical details (IDs, raw before/after)</summary>
                <pre className="text-[11px] whitespace-pre-wrap bg-muted p-2 rounded">{JSON.stringify({ interaction_id: row.id, club_id: row.club_id, user_id: row.user_id, action_args: row.action_args, before: row.before_data, after: row.after_data }, null, 2)}</pre>
              </details>
            )}
            {row.attachments?.length ? <div className="flex gap-2">{row.attachments.map((a) => <Shot key={a.path} path={a.path} name={a.name} />)}</div> : null}
            {canRollback ? (
              <Button size="sm" variant="outline" onClick={startRollback} disabled={rb.isPending}><Undo2 className="w-4 h-4 mr-1" /> Reverse this action…</Button>
            ) : row.status === "executed" && !row.rolled_back_by ? (
              <p className="text-[12px] text-muted-foreground">No safe automatic reversal — manual review required.</p>
            ) : null}
          </div>
        )}
      </CardContent>
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reverse this action?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1 text-[13px]">
                <p>{confirm?.message}</p>
                <ul className="list-disc pl-4">{confirm?.changes.map((c, i) => <li key={i}>{c}</li>)}</ul>
                <p className="text-muted-foreground">A new audit record is created; the original stays unchanged.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={!confirm?.ok} onClick={doRollback}>Reverse</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><span className="text-[11px] uppercase tracking-wide text-muted-foreground mr-2">{label}</span>{children}</div>;
}

function Shot({ path, name }: { path: string; name: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { let alive = true; getSupportAttachmentUrl(path).then((u) => { if (alive) setUrl(u); }); return () => { alive = false; }; }, [path]);
  return url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={name} className="h-16 w-16 object-cover rounded border" /></a> : null;
}

function BetaClubsCard() {
  const { data: on = [] } = useBetaClubs(AI_ACTIONS_FEATURE);
  const set = useSetBetaClub(AI_ACTIONS_FEATURE);
  const [pick, setPick] = useState("");
  const { data: clubs = [] } = useQuery({
    queryKey: ["all-clubs-min"],
    queryFn: async () => { const { data } = await fromExt("clubs").select("id, name").order("name"); return (data ?? []) as { id: string; name: string }[]; },
  });
  const onIds = new Set(on.map((c) => c.club_id));
  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <div className="font-semibold">Clubs testing AI assistant actions</div>
        <p className="text-muted-foreground text-[12px]">Members at these clubs can use the beta assistant (voice, screenshots, confirmed actions). Switching off hides it; nothing is deleted.</p>
        <div className="flex flex-wrap gap-2">
          {on.map((c) => (
            <Badge key={c.club_id} variant="secondary" className="gap-1">{c.clubs?.name ?? c.club_id}
              <button aria-label="Switch off" onClick={() => set.mutate({ clubId: c.club_id, on: false })}>✕</button>
            </Badge>
          ))}
          {on.length === 0 && <span className="text-muted-foreground">None</span>}
        </div>
        <div className="flex gap-2">
          <Select value={pick} onValueChange={setPick}>
            <SelectTrigger className="h-8 w-64"><SelectValue placeholder="Pick a club" /></SelectTrigger>
            <SelectContent>{clubs.filter((c) => !onIds.has(c.id)).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" disabled={!pick || set.isPending} onClick={() => { set.mutate({ clubId: pick, on: true }); setPick(""); }}>Switch on</Button>
        </div>
      </CardContent>
    </Card>
  );
}
