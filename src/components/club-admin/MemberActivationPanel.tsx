import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Send } from "lucide-react";
import { toast } from "sonner";
import { sendComms } from "@/lib/comms/send";
import { hasUsableEmail, isUnlinkedEligible } from "@/lib/comms/onboarding-audience";

type Member = { id: string; name?: string | null; email?: string | null; user_id?: string | null; status?: string | null };
type Invite = { club_member_id: string; created_at: string; expires_at: string; used_at: string | null; revoked_at: string | null };

export function activationState(inv: Invite | undefined, now = Date.now()) {
  if (!inv) return "never sent";
  if (inv.used_at) return "used";
  if (inv.revoked_at) return "replaced";
  if (new Date(inv.expires_at).getTime() < now) return "expired";
  return "open";
}

/** Send / resend personal activation links to members without a SquashHub login (club admins only). */
export function MemberActivationPanel({ clubId, members }: { clubId: string; members: Member[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const unlinked = useMemo(() => members.filter(isUnlinkedEligible), [members]);

  const { data: invites = {} } = useQuery({
    queryKey: ["activation-invites", clubId],
    enabled: open && !!clubId,
    queryFn: async () => {
      const { data } = await (supabase as any).from("member_activation_invites")
        .select("club_member_id,created_at,expires_at,used_at,revoked_at")
        .eq("club_id", clubId).order("created_at", { ascending: false }).limit(5000);
      const latest: Record<string, Invite> = {};
      for (const r of (data ?? []) as Invite[]) if (!latest[r.club_member_id]) latest[r.club_member_id] = r;
      return latest;
    },
  });

  const send = async (ids: string[]) => {
    const targets = unlinked.filter((m) => ids.includes(m.id) && hasUsableEmail(m));
    const missing = ids.length - targets.length;
    if (!targets.length) { toast.error("No selected member has a usable email address. Edit the member to add one first."); return; }
    setBusy(true);
    try {
      const { data: tpl } = await supabase.from("comms_templates").select("id,name,action")
        .eq("club_id", clubId).eq("name", "Welcome to SquashHub").maybeSingle();
      if (!tpl) throw new Error("The club's 'Welcome to SquashHub' template is missing.");
      const { data: ver } = await supabase.from("comms_template_versions").select("subject,body")
        .eq("template_id", tpl.id).eq("channel", "email").maybeSingle();
      if (!ver) throw new Error("The welcome template has no email version.");
      const { dispatched } = await sendComms({
        clubId, name: `Activation link (${targets.length})`, templateId: tpl.id, channels: ["email"],
        content: { email: { subject: ver.subject ?? "", body: ver.body ?? "" } },
        action: { key: "register_existing_member", label: "Activate my SquashHub account" } as any,
        audience: { type: "selected", memberIds: targets.map((m) => m.id) },
        meta: { purpose: "activation" },
      });
      toast.success(`Activation links: ${dispatched?.sent ?? 0} sent, ${dispatched?.skipped ?? 0} skipped${missing ? `, ${missing} without email not sent` : ""}`);
      setSelected([]);
      qc.invalidateQueries({ queryKey: ["activation-invites", clubId] });
      qc.invalidateQueries({ queryKey: ["comms-campaigns", clubId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not send activation links");
    } finally { setBusy(false); }
  };

  const shown = unlinked.filter((m) => (m.name ?? "").toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="rounded border border-border">
      <button className="w-full flex items-center gap-2 px-2 py-1.5 text-xs font-medium" onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        Activation links — {unlinked.length} member{unlinked.length === 1 ? "" : "s"} not yet registered
      </button>
      {open && (
        <div className="p-2 pt-0 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Each member gets their own single-use link (valid 14 days). Members who already have a login aren't listed and are skipped at send time.
            Changed an email? Edit the member, then Resend — the new link goes to the updated address and the existing membership is claimed, never duplicated.
          </p>
          <div className="flex gap-2">
            <Input className="h-7 text-xs" placeholder="Search…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <Button size="sm" className="h-7 text-xs" disabled={busy || !selected.length} onClick={() => send(selected)}>
              <Send className="w-3 h-3 mr-1" />Send to selected ({selected.length})
            </Button>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-border">
            {shown.map((m) => {
              const inv = invites[m.id];
              const st = activationState(inv);
              const okEmail = hasUsableEmail(m);
              return (
                <div key={m.id} className="flex items-center gap-2 py-1 text-xs">
                  <Checkbox disabled={!okEmail} checked={selected.includes(m.id)}
                    onCheckedChange={(v) => setSelected((s) => (v ? [...s, m.id] : s.filter((i) => i !== m.id)))} />
                  <span className="truncate flex-1 min-w-0">{m.name}</span>
                  {okEmail ? <span className="truncate max-w-[180px] text-muted-foreground">{m.email}</span>
                    : <Badge variant="outline" className="text-[9px]">No email — edit member to add one</Badge>}
                  <span className="text-[10px] text-muted-foreground w-36 text-right">
                    {inv ? `${st} · sent ${new Date(inv.created_at).toLocaleDateString()}` : "never sent"}
                  </span>
                  <Button size="sm" variant="outline" className="h-6 text-[10px]" disabled={busy || !okEmail} onClick={() => send([m.id])}>
                    {inv ? "Resend" : "Send"}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
