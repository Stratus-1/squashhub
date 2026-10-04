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

export function useActivationInvites(clubId: string, enabled = true) {
  return useQuery({
    queryKey: ["activation-invites", clubId],
    enabled: enabled && !!clubId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await (supabase as any).from("member_activation_invites")
        .select("club_member_id,created_at,expires_at,used_at,revoked_at")
        .eq("club_id", clubId).order("created_at", { ascending: false }).limit(5000);
      const latest: Record<string, Invite> = {};
      for (const r of (data ?? []) as Invite[]) if (!latest[r.club_member_id]) latest[r.club_member_id] = r;
      return latest;
    },
  });
}

/**
 * Sends the club's standard "Welcome to SquashHub" email with a personal activation link per recipient.
 * The server re-checks linked state per recipient and issues/rotates a unique token; tokens never reach the browser.
 */
export async function sendActivationEmails(clubId: string, members: Member[], ids: string[]) {
  const chosen = members.filter((m) => ids.includes(m.id));
  const linked = chosen.filter((m) => !!m.user_id).length;
  const targets = chosen.filter((m) => isUnlinkedEligible(m) && hasUsableEmail(m));
  const missing = chosen.filter((m) => !m.user_id && !hasUsableEmail(m)).length;
  if (!targets.length) {
    toast.error(missing ? "No usable email address — edit the member to add or update their email first." : "Selected members are already registered.");
    return null;
  }
  try {
    // Identify the standard onboarding template by its stable action key, not its display name.
    const NAMES = ["Activate SquashHub Account – Unregistered Members", "Activate SquashHub Account", "Welcome to SquashHub"];
    const { data: tpls } = await supabase.from("comms_templates").select("id, name, created_at")
      .eq("club_id", clubId).eq("action->>key", "register_existing_member").order("created_at");
    const rank = (n: string) => { const i = NAMES.indexOf(n); return i < 0 ? NAMES.length : i; };
    const tpl = [...(tpls ?? [])].sort((a, b) => rank(a.name) - rank(b.name))[0];
    if (!tpl) throw new Error("The club's 'Activate SquashHub Account – Unregistered Members' template is missing.");
    const { data: ver } = await supabase.from("comms_template_versions").select("subject,body")
      .eq("template_id", tpl.id).eq("channel", "email").maybeSingle();
    if (!ver) throw new Error("The welcome template has no email version.");
    const { dispatched } = await sendComms({
      clubId, name: `Activation email (${targets.length})`, templateId: tpl.id, channels: ["email"],
      content: { email: { subject: ver.subject ?? "", body: ver.body ?? "" } },
      action: { key: "register_existing_member", label: "Activate my SquashHub account" } as any,
      audience: { type: "selected", memberIds: targets.map((m) => m.id) },
      meta: { purpose: "activation" },
    });
    const parts = [`${dispatched?.sent ?? 0} sent`];
    if (dispatched?.skipped) parts.push(`${dispatched.skipped} skipped (already linked at send time)`);
    if (linked) parts.push(`${linked} already registered skipped`);
    if (missing) parts.push(`${missing} without email skipped`);
    toast.success(`Activation emails: ${parts.join(", ")}`);
    return dispatched ?? {};
  } catch (e: any) {
    toast.error(e?.message ?? "Could not send activation emails");
    return null;
  }
}

/** Compact per-row Send/Resend activation action for the Members list (unlinked members only). */
export function MemberActivationButton({ clubId, member, onEdit }: { clubId: string; member: Member; onEdit?: () => void }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { data: invites = {} } = useActivationInvites(clubId, !member.user_id);
  if (member.user_id || (member.status && member.status !== "active")) return null;
  const inv = invites[member.id];
  if (!hasUsableEmail(member)) {
    return (
      <button type="button" className="text-[9px] text-amber-600 underline" title="Add or update this member's email to send an activation email"
        onClick={(e) => { e.stopPropagation(); toast.info("Add or update this member's email first, then send the activation email."); onEdit?.(); }}>
        Add email to activate
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <Button variant="outline" size="sm" disabled={busy}
        className="h-5 px-1.5 text-[9px] gap-1 border-amber-500/50 text-amber-700 hover:bg-amber-500/10"
        title={inv ? "Send a new personal activation link (replaces the previous one)" : "Email this member their personal activation link"}
        onClick={async (e) => {
          e.stopPropagation(); setBusy(true);
          const r = await sendActivationEmails(clubId, [member], [member.id]);
          setBusy(false);
          if (r) qc.invalidateQueries({ queryKey: ["activation-invites", clubId] });
        }}>
        <Send className="w-2.5 h-2.5" />
        <span className="hidden sm:inline">{inv ? "Resend activation email" : "Send activation email"}</span>
        <span className="sm:hidden">{inv ? "Resend" : "Activate"}</span>
      </Button>
      {inv && <span className="text-[9px]">Sent {new Date(inv.created_at).toLocaleDateString()}</span>}
    </span>
  );
}

/** Send / resend personal activation links to members without a SquashHub login (club admins only). */
export function MemberActivationPanel({ clubId, members }: { clubId: string; members: Member[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const unlinked = useMemo(() => members.filter(isUnlinkedEligible), [members]);

  const { data: invites = {} } = useActivationInvites(clubId, open);


  const send = async (ids: string[]) => {
    setBusy(true);
    try {
      const r = await sendActivationEmails(clubId, members, ids);
      if (r) { setSelected([]); qc.invalidateQueries({ queryKey: ["activation-invites", clubId] }); }
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
              <Send className="w-3 h-3 mr-1" />Send activation emails ({selected.length})
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
