import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Send } from "lucide-react";

interface Contact { id: string; name: string | null; role: string | null; email: string; opted_out: boolean; bounced: boolean }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  prospect: { id: string; club_name: string; contacts: Contact[] } | null;
  onSent?: () => void;
}

export function SendToClubDialog({ open, onOpenChange, prospect, onSent }: Props) {
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<{ id: string; name: string; subject: string; status: string }[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [contactId, setContactId] = useState("all");
  const [resend, setResend] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setContactId("all");
    setResend(false);
    (async () => {
      const { data } = await supabase
        .from("outreach_campaigns")
        .select("id,name,subject,status")
        .order("created_at", { ascending: false });
      setCampaigns((data ?? []) as any);
      if (data?.length && !campaignId) setCampaignId((data[0] as any).id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const contactable = (prospect?.contacts ?? []).filter(
    (c) => c.email && !c.opted_out && !c.bounced,
  );

  const send = async () => {
    if (!prospect || !campaignId) return;
    setSending(true);
    const { data, error } = await supabase.functions.invoke("outreach-send", {
      body: {
        action: "send_one",
        campaign_id: campaignId,
        prospect_id: prospect.id,
        contact_id: contactId === "all" ? undefined : contactId,
        resend,
      },
    });
    setSending(false);
    const errMsg = (data as any)?.error || error?.message;
    if (errMsg) {
      toast({ title: "Send failed", description: errMsg, variant: "destructive" });
      return;
    }
    toast({
      title: `Sent to ${prospect.club_name}`,
      description: `${(data as any)?.sent ?? 0} email(s) delivered to the mail server.`,
    });
    onOpenChange(false);
    onSent?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send campaign to {prospect?.club_name}</DialogTitle>
          <DialogDescription>
            Sends this one club only — the rest of the campaign audience is untouched.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Campaign</Label>
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger><SelectValue placeholder="Choose a campaign" /></SelectTrigger>
              <SelectContent>
                {campaigns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!campaigns.length && (
              <p className="text-[11px] text-muted-foreground">No campaigns yet — create one first.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Recipient</Label>
            <Select value={contactId} onValueChange={setContactId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All contactable ({contactable.length})</SelectItem>
                {contactable.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name ? `${c.name} · ${c.email}` : c.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!contactable.length && (
              <p className="text-[11px] text-destructive">No contactable email for this club.</p>
            )}
          </div>

          <label className="flex items-center gap-2 text-xs">
            <Checkbox checked={resend} onCheckedChange={(v) => setResend(!!v)} />
            Resend even if this campaign was already sent to them
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={send} disabled={sending || !campaignId || !contactable.length}>
            <Send className="h-4 w-4 mr-1" /> {sending ? "Sending…" : "Send now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
