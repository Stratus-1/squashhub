import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, UserPlus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useJuniorBody } from "./useJuniorBody";

const db = supabase as any;
type Leader = { member_id: string; name: string; email: string | null; phone: string | null; has_login: boolean; is_me: boolean };
type Body = { org_id: string; org_name: string; kind: string; is_regional: boolean; is_self: boolean; leaders: Leader[] };

const kindLabel = (b: Body) => (b.is_regional ? "Regional" : b.kind === "zone" ? "Zone" : b.kind === "provincial" ? "Province" : "");

/** Leaders of this junior body and the junior bodies below it. Never senior associations. */
export function JuniorLeadersTab({ clubId }: { clubId: string }) {
  const qc = useQueryClient();
  const { data: body, isLoading } = useJuniorBody(clubId);
  const orgId = body?.org_id;
  const [adding, setAdding] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", name: "", phone: "", home: "" });

  const { data: bodies = [], isLoading: listLoading } = useQuery({
    queryKey: ["junior-leaders", orgId],
    enabled: !!orgId && !!body?.can_lead,
    queryFn: async () => {
      const { data, error } = await db.rpc("junior_leaders_list", { p_org: orgId });
      if (error) throw error;
      return (data ?? []) as Body[];
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["junior-leaders", orgId] });

  const add = useMutation({
    mutationFn: async (target: string) => {
      const { data, error } = await supabase.functions.invoke("junior-leader-invite", {
        body: { org_id: target, email: form.email.trim(), name: form.name.trim() || null, phone: form.phone.trim() || null, home_club_id: form.home || null },
      });
      const msg = (data as any)?.error || (error as any)?.context?.error;
      if (error || (data as any)?.error) throw new Error(msg || "Could not add the leader");
      return data as { status: string; email_sent: boolean; needs_activation: boolean; name: string; org_name: string; home_club: string | null };
    },
    onSuccess: (r) => {
      refresh();
      setAdding(null); setForm({ email: "", name: "", phone: "", home: "" });
      if (r.status === "already") toast.info(`${r.name} is already a leader of ${r.org_name}`);
      else toast.success(`${r.name} is now a leader of ${r.org_name}${r.needs_activation ? (r.email_sent ? ". Activation email sent." : ". An activation email was sent recently.") : "."}${r.home_club ? ` ${r.home_club} will confirm their membership.` : ""}`);
    },
    onError: (e: any) => toast.error(e.message || "Could not add the leader"),
  });
  const remove = useMutation({
    mutationFn: async ({ org, member }: { org: string; member: string }) => {
      const { error } = await db.rpc("junior_leader_remove", { p_org: org, p_member_id: member });
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast.success("Leader removed"); },
    onError: (e: any) => toast.error(e.message || "Could not remove the leader"),
  });

  if (isLoading || listLoading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (!body?.found || !body.can_lead) return <p className="text-sm text-muted-foreground">Only this association's leaders can manage leaders.</p>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Leaders can manage clubs and junior registrations. Someone who already uses SquashHub keeps their own login and club membership. Someone new gets an activation email.
      </p>
      {bodies.map((b) => (
        <Card key={b.org_id}>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">{b.org_name}<Badge variant="outline" className="font-normal">{kindLabel(b)}</Badge></CardTitle>
            {adding !== b.org_id && <Button size="sm" variant="outline" onClick={() => { setAdding(b.org_id); setForm({ email: "", name: "", phone: "", home: "" }); }}><UserPlus className="mr-1 h-3.5 w-3.5" />Add leader</Button>}
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {b.leaders.length === 0 && <p className="text-muted-foreground">No leaders yet.</p>}
            <ul className="divide-y divide-border">
              {b.leaders.map((l) => (
                <li key={l.member_id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <span className="min-w-0">
                    <span className="block font-medium">{l.name}{l.is_me ? " (you)" : ""}</span>
                    <span className="block break-all text-xs text-muted-foreground">{[l.email, l.phone].filter(Boolean).join(" · ")}{l.has_login ? "" : " · activation pending"}</span>
                  </span>
                  {!l.is_me && (
                    <Button size="sm" variant="ghost" disabled={remove.isPending}
                      onClick={() => { if (confirm(`Remove ${l.name} as a leader of ${b.org_name}? Their club memberships stay as they are.`)) remove.mutate({ org: b.org_id, member: l.member_id }); }}>
                      <X className="mr-1 h-3.5 w-3.5" />Remove
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {adding === b.org_id && (
              <div className="space-y-2 rounded-md border border-border p-3">
                <div className="space-y-1.5"><Label className="text-xs">Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Name and surname (needed if they're new to SquashHub)</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Cell number (optional)</Label><Input inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Home club (optional)</Label>
                  <Select value={form.home || "none"} onValueChange={(v) => setForm({ ...form, home: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="No home club" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No home club / already a member</SelectItem>
                      {(body.clubs ?? []).map((c) => <SelectItem key={c.club_id} value={c.club_id}>{c.club_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">If they're not yet listed at that club, they're added as a pending member for the club to confirm.</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" disabled={add.isPending || !form.email.trim()} onClick={() => add.mutate(b.org_id)}>{add.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}Add leader</Button>
                  <Button size="sm" variant="outline" onClick={() => setAdding(null)}>Cancel</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
