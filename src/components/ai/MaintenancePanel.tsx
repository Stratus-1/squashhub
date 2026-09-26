// AI Maintenance Manager — Super Admin queue (Phase 1).
// Cases come from bugs/escalations automatically; the assistant/agent works
// them, and everything that changes production data lands here for a human
// decision. The server (maintenance-queue edge function) enforces the risk
// policy; this panel only mirrors it for button gating.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { CheckCircle2, ChevronDown, ChevronRight, ShieldAlert, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { canTransition, SENSITIVE_LABELS, type MaintenanceStatus } from "@/lib/ai/maintenance-policy";

type CaseRow = {
  id: string; kind: string; bug_report_id: string | null; ticket_id: string | null; club_id: string | null;
  title: string; status: MaintenanceStatus; risk: string; sensitive_areas: string[]; requires_approval: boolean;
  last_actor_type: string; technical_result: any; released_at: string | null; closed_at: string | null;
  created_at: string; updated_at: string; clubs?: { name: string } | null;
  maintenance_case_requesters?: { id: string; user_id: string; notified_at: string | null }[];
  maintenance_analyses?: any[];
  maintenance_actions?: any[];
  maintenance_events?: any[];
};

const fromAny = (t: string) => (supabase as any).from(t);

const queue = (body: Record<string, unknown>) => supabase.functions.invoke("maintenance-queue", { body });

const VIEWS: { key: string; label: string; statuses: MaintenanceStatus[] }[] = [
  { key: "needs_you", label: "Needs you", statuses: ["awaiting_approval", "ready_for_release"] },
  { key: "new", label: "New / analysing", statuses: ["new", "analysing"] },
  { key: "needs_info", label: "Needs info", statuses: ["needs_info"] },
  { key: "in_progress", label: "In progress", statuses: ["issue_identified", "fix_in_progress", "approved"] },
  { key: "released", label: "Released", statuses: ["released", "completed"] },
  { key: "closed", label: "Failed / rejected", statuses: ["unable_to_resolve", "rejected"] },
];

const riskBadge: Record<string, string> = {
  low: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20",
  medium: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25",
  high: "bg-destructive/12 text-destructive border border-destructive/20",
};

const statusLabel: Record<string, string> = {
  new: "New", analysing: "Analysing", needs_info: "Needs info", issue_identified: "Issue identified",
  fix_in_progress: "Fix in progress", awaiting_approval: "Awaiting approval", approved: "Approved",
  ready_for_release: "Ready for release", released: "Released", completed: "Completed",
  unable_to_resolve: "Unable to resolve", rejected: "Rejected",
};

const ACTION_STATE_LABEL: Record<string, string> = {
  draft: "Draft (safe to run automatically)", queued: "Queued", in_progress: "In progress",
  result_received: "Result received", awaiting_approval: "Awaiting approval", approved: "Approved",
  rejected: "Rejected", done: "Done",
};

export function MaintenancePanel() {
  const qc = useQueryClient();
  const [view, setView] = useState("needs_you");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [riskFilter, setRiskFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all");

  const { data: cases, isLoading } = useQuery({
    queryKey: ["maintenance-cases"],
    queryFn: async () => {
      const { data, error } = await fromAny("maintenance_cases")
        .select("*, clubs(name), maintenance_case_requesters(id,user_id,notified_at), maintenance_analyses(*), maintenance_actions(*), maintenance_events(*)")
        .order("updated_at", { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []) as CaseRow[];
    },
  });

  const requesterIds = useMemo(
    () => [...new Set((cases ?? []).flatMap((c) => (c.maintenance_case_requesters ?? []).map((r) => r.user_id)))],
    [cases],
  );
  const { data: profilesById } = useQuery({
    queryKey: ["maintenance", "profiles", requesterIds.join(",")],
    queryFn: async () => {
      const { data, error } = await fromAny("profiles").select("id,name,email").in("id", requesterIds);
      if (error) throw error;
      return new Map((data ?? []).map((p: any) => [p.id, p]));
    },
    enabled: requesterIds.length > 0,
  });

  const filtered = useMemo(() => {
    const cfg = VIEWS.find((v) => v.key === view)!;
    return (cases ?? []).filter((c) =>
      cfg.statuses.includes(c.status) &&
      (riskFilter === "all" || c.risk === riskFilter) &&
      (kindFilter === "all" || c.kind === kindFilter));
  }, [cases, view, riskFilter, kindFilter]);

  const selected = useMemo(
    () => (cases ?? []).find((c) => c.id === selectedId) ?? filtered[0] ?? null,
    [cases, filtered, selectedId],
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["maintenance-cases"] });
    qc.invalidateQueries({ queryKey: ["ai-activity"] });
  };

  const op = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data, error } = await queue(body);
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => { invalidate(); },
    onError: (e: any) => toast.error(e?.message || "Could not update the case"),
  });

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const v of VIEWS) m[v.key] = (cases ?? []).filter((c) => v.statuses.includes(c.status)).length;
    return m;
  }, [cases]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-3">
      <Card className="border-border/60">
        <CardContent className="p-2 space-y-2">
          <div className="flex flex-wrap gap-1">
            {VIEWS.map((v) => (
              <button key={v.key} onClick={() => setView(v.key)}
                className={cn("text-[11px] px-2 py-1 rounded-md border", view === v.key ? "bg-primary/10 text-primary border-primary/30" : "border-border/50 text-muted-foreground hover:bg-muted/40")}>
                {v.label}{counts[v.key] ? ` (${counts[v.key]})` : ""}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={riskFilter} onValueChange={setRiskFilter}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All risk</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
            <Select value={kindFilter} onValueChange={setKindFilter}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All kinds</SelectItem>
                <SelectItem value="bug">Bug</SelectItem>
                <SelectItem value="support_task">Support task</SelectItem>
                <SelectItem value="feature">Feature</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 max-h-[64vh] overflow-auto pr-1">
            {isLoading ? (
              <p className="p-3 text-sm text-muted-foreground">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">Nothing here right now.</p>
            ) : filtered.map((c) => (
              <button key={c.id} onClick={() => setSelectedId(c.id)}
                className={cn("w-full text-left rounded-lg px-2.5 py-2 border transition-colors", selected?.id === c.id ? "border-primary/40 bg-primary/5" : "border-border/50 hover:bg-muted/30")}>
                <p className="text-[13px] font-medium leading-snug line-clamp-2">{c.title}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <Badge variant="secondary" className={cn("text-[10px]", riskBadge[c.risk])}>{c.risk}</Badge>
                  {c.sensitive_areas?.length ? (
                    <Badge variant="secondary" className="text-[10px] bg-destructive/10 text-destructive border border-destructive/20"><ShieldAlert className="w-3 h-3 mr-1" />sensitive</Badge>
                  ) : null}
                  <span className="text-[10px] text-muted-foreground">{statusLabel[c.status]} · {c.clubs?.name ?? "platform"} · {format(new Date(c.updated_at), "MMM d HH:mm")}</span>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <CaseDetail c={selected} profilesById={profilesById} busy={op.isPending}
        onOp={(body) => op.mutate(body)} />
    </div>
  );
}

function CaseDetail({ c, profilesById, busy, onOp }: {
  c: CaseRow | null;
  profilesById?: Map<string, any>;
  busy: boolean;
  onOp: (body: Record<string, unknown>) => void;
}) {
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [question, setQuestion] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  if (!c) return (
    <Card className="border-border/60"><CardContent className="p-8 text-center text-sm text-muted-foreground">
      <Wrench className="w-6 h-6 mx-auto mb-2 opacity-60" />Select a case.
    </CardContent></Card>
  );

  const analyses = (c.maintenance_analyses ?? []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  const actions = (c.maintenance_actions ?? []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  const events = (c.maintenance_events ?? []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  const can = (to: MaintenanceStatus) => canTransition(c.status, to);

  return (
    <Card className="border-border/60">
      <CardContent className="p-3 space-y-3 text-[13px]">
        <div>
          <p className="font-semibold leading-snug">{c.title}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="text-[10px] capitalize">{c.kind.replace("_", " ")}</Badge>
            <Badge variant="secondary" className={cn("text-[10px]", riskBadge[c.risk])}>{c.risk} risk</Badge>
            {c.requires_approval && (
              <Badge variant="secondary" className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25">needs approval</Badge>
            )}
            {(c.sensitive_areas ?? []).map((s) => (
              <Badge key={s} variant="secondary" className="text-[10px] bg-destructive/10 text-destructive border border-destructive/20">{SENSITIVE_LABELS[s] ?? s}</Badge>
            ))}
            <span className="text-[11px] text-muted-foreground">{c.clubs?.name ?? "platform"} · opened {format(new Date(c.created_at), "d MMM yyyy")}</span>
          </div>
        </div>

        <div className="rounded-lg border border-border/60 p-2.5">
          <p className="text-[11px] font-medium text-muted-foreground mb-1">Reported by</p>
          {(c.maintenance_case_requesters ?? []).map((r) => {
            const p = profilesById?.get(r.user_id);
            return (
              <p key={r.id} className="text-[12px]">
                {p?.name ?? r.user_id.slice(0, 8)}{p?.email ? ` · ${p.email}` : ""}
                {r.notified_at ? <span className="text-muted-foreground"> · asked {format(new Date(r.notified_at), "d MMM")}</span> : null}
              </p>
            );
          })}
          {c.bug_report_id ? <p className="text-[11px] text-muted-foreground mt-1">Linked bug report · {c.bug_report_id.slice(0, 8)}…</p> : null}
          {c.ticket_id ? <p className="text-[11px] text-muted-foreground">Support ticket · {c.ticket_id.slice(0, 8)}…</p> : null}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {can("approved") && (
            <Button size="sm" className="h-8 text-xs" disabled={busy} onClick={() => onOp({ op: "set_status", caseId: c.id, toStatus: "approved" })}>
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />Approve work
            </Button>
          )}
          {can("released") && (
            <Button size="sm" className="h-8 text-xs" disabled={busy}
              onClick={() => onOp({ op: "set_status", caseId: c.id, toStatus: "released", note: "Marked released after manual publish" })}>
              Mark released (after publish)
            </Button>
          )}
          {can("completed") && (
            <Button size="sm" variant="outline" className="h-8 text-xs" disabled={busy} onClick={() => onOp({ op: "set_status", caseId: c.id, toStatus: "completed" })}>
              Close as completed
            </Button>
          )}
          {can("analysing") && c.status === "needs_info" && (
            <Button size="sm" variant="outline" className="h-8 text-xs" disabled={busy} onClick={() => onOp({ op: "set_status", caseId: c.id, toStatus: "analysing", note: "Resumed after member reply" })}>
              Resume analysing
            </Button>
          )}
          {can("needs_info") && (
            <div className="flex w-full gap-1.5 mt-1">
              <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask the reporter for more detail…"
                className="h-8 text-xs flex-1" />
              <Button size="sm" variant="outline" className="h-8 text-xs" disabled={busy || !question.trim()}
                onClick={() => { onOp({ op: "ask_member", caseId: c.id, question }); setQuestion(""); }}>
                Ask member
              </Button>
            </div>
          )}
          {!rejecting && can("unable_to_resolve") && (
            <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive" disabled={busy} onClick={() => setRejecting(true)}>
              Unable to resolve
            </Button>
          )}
          {rejecting && (
            <div className="flex w-full gap-1.5 mt-1">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (visible to admins only)" className="h-8 text-xs flex-1" />
              <Button size="sm" variant="outline" className="h-8 text-xs" disabled={busy}
                onClick={() => { onOp({ op: "set_status", caseId: c.id, toStatus: "unable_to_resolve", note: reason || undefined }); setRejecting(false); setReason(""); }}>
                Confirm
              </Button>
            </div>
          )}
        </div>

        <Section title={`Proposed work (${actions.length})`}>
          {actions.length === 0 ? <p className="text-[12px] text-muted-foreground">Nothing proposed yet.</p> : actions.map((a) => (
            <div key={a.id} className="rounded-lg border border-border/60 p-2.5 space-y-1.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant="secondary" className="text-[10px] capitalize">{a.kind.replace("_", " ")} → {a.target}</Badge>
                <Badge variant="secondary" className={cn("text-[10px]", riskBadge[a.risk])}>{a.risk}</Badge>
                <Badge variant="secondary" className="text-[10px]">{ACTION_STATE_LABEL[a.state] ?? a.state}</Badge>
              </div>
              <p className="text-[12px] whitespace-pre-wrap">{a.instruction_text}</p>
              {a.result_summary ? <p className="text-[11px] text-muted-foreground">Result: {a.result_summary}</p> : null}
              {a.state === "awaiting_approval" && (
                <div className="flex gap-1.5">
                  <Button size="sm" className="h-7 text-[11px]" disabled={busy} onClick={() => onOp({ op: "decide_action", actionId: a.id, approve: true })}>Approve action</Button>
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={busy} onClick={() => onOp({ op: "decide_action", actionId: a.id, approve: false, reason: "Rejected by Super Admin" })}>Reject</Button>
                </div>
              )}
            </div>
          ))}
        </Section>

        <Section title={`Analysis (${analyses.length})`}>
          {analyses.length === 0 && <p className="text-[12px] text-muted-foreground">No analysis yet.</p>}
          {analyses.slice(0, showAnalysis ? analyses.length : 1).map((a) => (
            <div key={a.id} className="rounded-lg border border-border/60 p-2.5 space-y-1">
              <p className="text-[12px] whitespace-pre-wrap">{a.summary}</p>
              <div className="flex flex-wrap gap-1.5">
                {a.affected_module ? <Badge variant="secondary" className="text-[10px]">{a.affected_module}</Badge> : null}
                {a.risk ? <Badge variant="secondary" className={cn("text-[10px]", riskBadge[a.risk])}>{a.risk}</Badge> : null}
                {a.more_info_needed ? <Badge variant="secondary" className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-300">waiting on member</Badge> : null}
                <span className="text-[10px] text-muted-foreground">{format(new Date(a.created_at), "d MMM HH:mm")}</span>
              </div>
              {a.probable_cause ? <p className="text-[11px] text-muted-foreground">Cause: {a.probable_cause}</p> : null}
              {a.proposed_action ? <p className="text-[11px] text-muted-foreground">Next: {a.proposed_action}</p> : null}
            </div>
          ))}
          {analyses.length > 1 && (
            <button className="text-[11px] text-primary" onClick={() => setShowAnalysis((v) => !v)}>
              {showAnalysis ? "Show less" : `Show all ${analyses.length}`}
            </button>
          )}
        </Section>

        {c.technical_result?.summary ? (
          <div className="rounded-lg border border-border/60 p-2.5">
            <p className="text-[11px] font-medium text-muted-foreground mb-1">Verification result</p>
            <p className="text-[12px]">{c.technical_result.summary}</p>
            <p className="text-[11px] text-muted-foreground mt-1">{c.technical_result.passed ? "Checks passed" : "Checks failed"}</p>
          </div>
        ) : null}

        <Section title={`History (${events.length})`}>
          <div className="space-y-0.5">
            {events.map((e) => (
              <p key={e.id} className="text-[11px] text-muted-foreground">
                {format(new Date(e.created_at), "d MMM HH:mm")} · {statusLabel[e.to_status] ?? e.to_status ?? "update"}{e.note ? ` — ${e.note}` : ""}
              </p>
            ))}
          </div>
        </Section>
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-muted-foreground mb-1">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}
