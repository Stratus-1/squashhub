import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Check, Copy, Link2, Loader2, MessageCircle, RefreshCw, ShieldCheck, X, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { juniorLinkShareText } from "@/lib/juniors/join-flow";
import { useJuniorBody } from "./useJuniorBody";

const db = supabase as any;
const SITE = "https://squashhub.co.za";

type Req = {
  id: string; kind: "claim" | "new" | "existing_unlisted" | "missing_club"; club_name: string | null; junior_name: string | null;
  gender: string | null; age_group: string | null; parent_name: string | null; parent_phone: string | null; parent_email: string | null;
  consent: boolean; nsa_number: string | null; missing_club_name: string | null; missing_club_town: string | null;
  contact_name: string | null; contact_phone: string | null; contact_email: string | null;
  status: "pending" | "approved" | "declined" | "linked"; decided_by: string | null; decided_at: string | null;
  decline_reason: string | null; via: string | null; created_at: string;
};

const KIND_LABEL: Record<Req["kind"], string> = {
  claim: "Claims a listed profile", new: "New junior", existing_unlisted: "Member, not on the list", missing_club: "Club not listed",
};
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) : "");

/** Junior association workspace: confirm the club list, share the junior link and review registrations. */
export function JuniorRegistrationsTab({ clubId }: { clubId: string }) {
  const qc = useQueryClient();
  const { data: body, isLoading } = useJuniorBody(clubId);
  const orgId = body?.org_id;
  const [showClubs, setShowClubs] = useState(false);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [declining, setDeclining] = useState<Req | null>(null);
  const [reason, setReason] = useState("");

  const { data: reqs = [], isLoading: reqLoading } = useQuery({
    queryKey: ["junior-reg-list", orgId],
    enabled: !!orgId && !!body?.can_lead,
    queryFn: async () => {
      const { data, error } = await db.rpc("junior_reg_list", { p_org: orgId });
      if (error) throw error;
      return (data ?? []) as Req[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["junior-workspace-body", clubId] });
    qc.invalidateQueries({ queryKey: ["junior-reg-list", orgId] });
  };
  const run = useMutation({
    mutationFn: async (fn: () => Promise<{ error: any }>) => { const { error } = await fn(); if (error) throw error; },
    onSuccess: refresh,
    onError: (e: any) => toast.error(e.message || "Could not save"),
  });

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (!body?.found || !body.can_lead || !orgId) return <p className="text-sm text-muted-foreground">Only this association's leaders can manage junior registrations.</p>;

  const url = body.link_token ? `${SITE}/j/${body.link_token}` : "";
  const confirmed = !!body.list_confirmed_at;
  const shown = filter === "pending" ? reqs.filter((r) => r.status === "pending") : reqs;

  const decide = (r: Req, approve: boolean, why?: string) =>
    run.mutate(() => db.rpc("junior_reg_decide", { p_request_id: r.id, p_approve: approve, p_reason: why ?? null }),
      { onSuccess: () => { toast.success(approve ? "Approved" : "Declined"); setDeclining(null); setReason(""); } });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><ShieldCheck className="h-4 w-4 text-primary" />1. Club list</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            {body.name} has <span className="font-medium text-foreground">{body.club_count ?? 0} clubs</span>. Juniors can only choose from this list.
            {!body.is_regional && " Change it under Junior clubs."}
          </p>
          <button type="button" className="flex items-center gap-1 text-xs text-primary" onClick={() => setShowClubs((v) => !v)}>
            {showClubs ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}{showClubs ? "Hide clubs" : "Show clubs"}
          </button>
          {showClubs && (
            <ul className="grid gap-x-4 gap-y-0.5 text-xs sm:grid-cols-2">
              {(body.clubs ?? []).map((c) => <li key={c.club_id}>{c.club_name}</li>)}
            </ul>
          )}
          <label className="flex items-center gap-3 rounded-md border border-border p-3">
            <Switch checked={confirmed} disabled={run.isPending}
              onCheckedChange={(v) => run.mutate(() => db.rpc("junior_body_confirm_list", { p_org: orgId, p_confirmed: v }))} />
            <span>
              <span className="block font-medium">Club list confirmed</span>
              <span className="block text-xs text-muted-foreground">
                {confirmed ? `Confirmed ${fmt(body.list_confirmed_at)}${body.list_confirmed_by ? ` by ${body.list_confirmed_by}` : ""}. Switching this off also switches the link off.` : "Confirm the list before you share the junior link."}
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Link2 className="h-4 w-4 text-primary" />2. Junior registration link</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {!confirmed ? (
            <p className="text-muted-foreground">Confirm the club list first.</p>
          ) : !url ? (
            <div className="space-y-2">
              <p className="text-muted-foreground">Create one link for all your juniors. They choose their club, find their name or add themselves, and a parent confirms the details.</p>
              <Button disabled={run.isPending} onClick={() => run.mutate(() => db.rpc("junior_link_create", { p_org: orgId }))}><Link2 className="mr-2 h-4 w-4" />Create link</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="shrink-0 self-start rounded-md bg-background p-2 ring-1 ring-border"><QRCodeSVG value={url} size={132} /></div>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="break-all rounded bg-muted px-2 py-1.5 font-mono text-xs">{url}</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(url); toast.success("Link copied"); }}><Copy className="mr-1 h-3.5 w-3.5" />Copy</Button>
                  <Button size="sm" variant="outline" asChild>
                    <a href={`https://wa.me/?text=${encodeURIComponent(juniorLinkShareText(body.name || "Junior squash", url))}`} target="_blank" rel="noreferrer"><MessageCircle className="mr-1 h-3.5 w-3.5" />WhatsApp</a>
                  </Button>
                  <Button size="sm" variant="outline" disabled={run.isPending}
                    onClick={() => { if (confirm("Create a new link? The current link will stop working.")) run.mutate(() => db.rpc("junior_link_create", { p_org: orgId })); }}>
                    <RefreshCw className="mr-1 h-3.5 w-3.5" />New link
                  </Button>
                  <Button size="sm" variant="outline" disabled={run.isPending}
                    onClick={() => { if (confirm("Switch the link off? Nobody can register through it until you create a new one.")) run.mutate(() => db.rpc("junior_link_revoke", { p_org: orgId })); }}>
                    <X className="mr-1 h-3.5 w-3.5" />Switch off
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">The link stays valid until you switch it off or create a new one.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-sm">3. Junior registrations</CardTitle>
          <div className="flex gap-1 text-xs">
            <Button size="sm" variant={filter === "pending" ? "default" : "outline"} className="h-7" onClick={() => setFilter("pending")}>To review ({reqs.filter((r) => r.status === "pending").length})</Button>
            <Button size="sm" variant={filter === "all" ? "default" : "outline"} className="h-7" onClick={() => setFilter("all")}>All</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {reqLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {!reqLoading && shown.length === 0 && <p className="text-muted-foreground">{filter === "pending" ? "Nothing to review." : "No registrations yet."}</p>}
          {shown.map((r) => (
            <div key={r.id} className="space-y-1.5 rounded-md border border-border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{r.kind === "missing_club" ? `${r.missing_club_name}${r.missing_club_town ? ` (${r.missing_club_town})` : ""}` : r.junior_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {KIND_LABEL[r.kind]}{r.club_name ? ` · ${r.club_name}` : ""}{r.age_group ? ` · ${r.age_group}` : ""}
                    {r.gender ? ` · ${r.gender === "female" ? "Girl" : "Boy"}` : ""}{r.nsa_number ? ` · NSA ${r.nsa_number}` : ""} · {fmt(r.created_at)}
                  </p>
                </div>
                <Badge variant={r.status === "pending" ? "secondary" : r.status === "declined" ? "destructive" : "default"}>
                  {r.status === "pending" ? "To review" : r.status === "declined" ? "Declined" : r.status === "linked" ? "Linked" : r.kind === "missing_club" ? "Done" : "Approved"}
                </Badge>
              </div>
              {(r.parent_name || r.contact_name) && (
                <p className="text-xs">
                  {r.kind === "missing_club" ? "Asked by " : "Parent/guardian: "}
                  {r.parent_name || r.contact_name} · {r.parent_phone || r.contact_phone}{(r.parent_email || r.contact_email) ? ` · ${r.parent_email || r.contact_email}` : ""}
                  {r.kind !== "missing_club" && (r.consent ? " · consent given" : "")}
                </p>
              )}
              {r.status === "declined" && r.decline_reason && <p className="text-xs text-muted-foreground">Reason: {r.decline_reason}</p>}
              {r.decided_by && r.status !== "pending" && <p className="text-xs text-muted-foreground">{r.status === "declined" ? "Declined" : "Decided"} by {r.decided_by} on {fmt(r.decided_at)}</p>}
              {r.status === "pending" && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" disabled={run.isPending} onClick={() => decide(r, true)}><Check className="mr-1 h-3.5 w-3.5" />{r.kind === "missing_club" ? "Mark done" : "Approve"}</Button>
                  <Button size="sm" variant="outline" disabled={run.isPending} onClick={() => { setDeclining(r); setReason(""); }}><X className="mr-1 h-3.5 w-3.5" />Decline</Button>
                </div>
              )}
              {r.status === "pending" && r.kind === "missing_club" && <p className="text-xs text-muted-foreground">Add the club under Junior clubs, then mark this done.</p>}
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!declining} onOpenChange={(o) => { if (!o) setDeclining(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Decline {declining?.junior_name || declining?.missing_club_name}?</DialogTitle></DialogHeader>
          <Textarea placeholder="Short reason (the person who registered will see it)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclining(null)}>Cancel</Button>
            <Button variant="destructive" disabled={reason.trim().length < 3 || run.isPending} onClick={() => declining && decide(declining, false, reason.trim())}>Decline</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
