import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { registrationOpeningSchema } from "./registration-opening";
import { buildClubPublicUrl } from "@/lib/club-public-url";

export function OpenClubRegistration({ club }: { club: { id: string; name: string; subdomain?: string | null } }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("administrator");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = registrationOpeningSchema.safeParse({ name, email, role, confirmed });
    if (!parsed.success) { setError("Enter your name, a valid email and confirm your club role."); return; }
    setBusy(true);
    setError("");
    try {
      const { error: failure } = await supabase.rpc("open_club_registration", {
        _club_id: club.id, _name: parsed.data.name, _email: parsed.data.email,
        _role: parsed.data.role, _confirmed: parsed.data.confirmed,
      });
      if (failure) throw failure;
      await qc.invalidateQueries({ queryKey: ["membership-application-availability", club.id] });
      toast.success("Member registration is now open.");
      setOpen(false);
      if (club.subdomain) window.location.href = buildClubPublicUrl(club.subdomain, "/auth?intent=apply");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not open registration. Please try again.");
    } finally { setBusy(false); }
  }

  return <>
    <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Open club for registration</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Open {club.name} for registration</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1"><Label htmlFor="opening-name">Your name</Label><Input id="opening-name" value={name} onChange={e => setName(e.target.value)} maxLength={100} required /></div>
          <div className="space-y-1"><Label htmlFor="opening-email">Your email</Label><Input id="opening-email" type="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={254} required /></div>
          <div className="space-y-1"><Label htmlFor="opening-role">Your club role</Label><Select value={role} onValueChange={setRole}><SelectTrigger id="opening-role"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="administrator">Club administrator</SelectItem><SelectItem value="chairman">Chairman</SelectItem></SelectContent></Select></div>
          <div className="flex items-start gap-2"><Checkbox id="opening-confirm" checked={confirmed} onCheckedChange={value => setConfirmed(value === true)} /><Label htmlFor="opening-confirm" className="leading-normal">I confirm I am a club administrator or chairman and request that member registration be opened.</Label></div>
          <p className="text-xs text-muted-foreground">Registration only. This does not grant administrator access, sign an agreement or start billing. Account email verification and membership approval still apply.</p>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={busy || !confirmed} className="w-full">{busy ? "Opening…" : "Open registration and continue"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}