/** My Account › Privacy & Contact Preferences — one national preference per person (also used by activation). */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CONTACT_CONSENT_HELP, CONTACT_CONSENT_LABEL, getContactPref, setContactPref } from "@/lib/contact-sharing";

function PersonPref({ memberId }: { memberId: string }) {
  const qc = useQueryClient();
  const { data: p, isLoading, error } = useQuery({ queryKey: ["contact-pref", memberId], queryFn: () => getContactPref(memberId) });
  const [share, setShare] = useState(false), [adult, setAdult] = useState(false);
  const [gName, setGName] = useState(""), [gPhone, setGPhone] = useState(""), [gOk, setGOk] = useState(false), [busy, setBusy] = useState(false);
  useEffect(() => { if (p) { setShare(!!p.share); setAdult(!!p.adult_confirmed); setGName(p.guardian_name ?? ""); setGPhone(p.guardian_phone ?? ""); setGOk(!!p.guardian_confirmed); } }, [p]);
  if (isLoading) return <p className="text-xs text-muted-foreground">Loading…</p>;
  if (error || !p) return <p className="text-xs text-muted-foreground">Contact preferences aren't available for this profile.</p>;
  if (!p.available) return <p className="text-xs text-muted-foreground">{p.name}: not linked to a national player record yet, so nothing is shared.</p>;
  const dirty = share !== !!p.share || (share && (adult !== !!p.adult_confirmed || (p.minor && (gName !== (p.guardian_name ?? "") || gPhone !== (p.guardian_phone ?? "") || gOk !== !!p.guardian_confirmed))));
  const save = async () => {
    setBusy(true);
    try {
      await setContactPref(memberId, { share, source: "settings", adultConfirmed: adult, guardianName: gName, guardianPhone: gPhone, guardianConfirm: gOk });
      await qc.invalidateQueries({ queryKey: ["contact-pref", memberId] });
      toast.success(share ? "Saved — your scheduled opponents can now see your contact." : "Saved — your number is no longer shared.");
    } catch (e: any) { toast.error(e?.message || "Couldn't save"); } finally { setBusy(false); }
  };
  return <div className="space-y-2 rounded-md border border-border p-3">
    <p className="text-sm font-medium">{p.name}{p.minor ? " (under 18)" : ""}</p>
    <label className="flex items-start gap-2 text-[13px]"><Checkbox checked={share} onCheckedChange={(v) => setShare(v === true)} className="mt-0.5" />
      <span>{p.minor ? "Allow a parent/guardian mobile number to be shared with this player's actual scheduled opponents for arranging matches" : CONTACT_CONSENT_LABEL}</span></label>
    {share && !p.minor && !p.age_known && <label className="flex items-start gap-2 pl-6 text-xs"><Checkbox checked={adult} onCheckedChange={(v) => setAdult(v === true)} className="mt-0.5" /><span>I confirm I am 18 or older.</span></label>}
    {share && p.minor && <div className="space-y-2 pl-6">
      <p className="text-xs text-muted-foreground">The child's own number is never shown. Opponents see the parent/guardian contact below instead.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div><Label className="text-xs">Parent/guardian name</Label><Input value={gName} onChange={(e) => setGName(e.target.value)} /></div>
        <div><Label className="text-xs">Parent/guardian mobile</Label><Input type="tel" value={gPhone} onChange={(e) => setGPhone(e.target.value)} /></div>
      </div>
      <label className="flex items-start gap-2 text-xs"><Checkbox checked={gOk} onCheckedChange={(v) => setGOk(v === true)} className="mt-0.5" /><span>I am this player's parent or legal guardian and I authorise sharing my contact for arranging their matches.</span></label>
    </div>}
    <div className="flex justify-end"><Button size="sm" disabled={!dirty || busy} onClick={save}>{busy ? "Saving…" : "Save"}</Button></div>
  </div>;
}

export function ContactSharingCard() {
  const { data: ids = [] } = useQuery({
    queryKey: ["contact-pref-members"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) return [];
      const { data } = await supabase.from("club_members").select("id, person_id").eq("user_id", u.user.id);
      // One national preference per person: show each person once.
      const seen = new Set<string>(); const out: string[] = [];
      (data ?? []).forEach((m: any) => { const key = m.person_id || m.id; if (!seen.has(key)) { seen.add(key); out.push(m.id); } });
      return out;
    },
  });
  if (!ids.length) return null;
  return <Card className="space-y-3 p-4" id="privacy-contact">
    <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Privacy &amp; Contact Preferences</h2></div>
    <p className="text-xs text-muted-foreground">{CONTACT_CONSENT_HELP} Messages already sent can't be recalled.</p>
    {ids.map((id) => <PersonPref key={id} memberId={id} />)}
  </Card>;
}
