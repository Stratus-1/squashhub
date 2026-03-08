import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail, MessageCircle, Loader2, CheckCircle2, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ShareBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  courtId: number;
  dateStr: string;
  startTime: string;
  endTime: string;
  opponentName?: string | null;
  inviterName?: string;
}

export function ShareBookingDialog({
  open,
  onOpenChange,
  bookingId,
  courtId,
  dateStr,
  startTime,
  endTime,
  opponentName,
  inviterName,
}: ShareBookingDialogProps) {
  const [tab, setTab] = useState("email");
  const [email, setEmail] = useState("");
  const [name, setName] = useState(opponentName || "");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSendEmail() {
    if (!email.trim()) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("booking-invite", {
        body: {
          bookingId,
          inviteeEmail: email.trim(),
          inviteeName: name.trim() || null,
          channel: "email",
        },
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.reason || "Failed to send email");
      setSent(true);
      toast.success("Invitation email sent!");
    } catch (err: any) {
      toast.error(err.message || "Failed to send invite");
    } finally {
      setSending(false);
    }
  }

  async function handleWhatsApp() {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("booking-invite", {
        body: {
          bookingId,
          inviteeName: name.trim() || null,
          channel: "whatsapp",
        },
      });
      if (error) throw error;

      // Build WhatsApp share URL client-side as fallback
      const siteUrl = window.location.origin;
      const msg = encodeURIComponent(
        `🏸 You're invited to play squash!\n\n` +
        `${inviterName || "A player"} has booked Court ${courtId} on ${dateStr} from ${startTime} to ${endTime}.\n\n` +
        `Open the app: ${siteUrl}`
      );
      const waUrl = data?.whatsappUrl || `https://wa.me/?text=${msg}`;
      window.open(waUrl, "_blank");
      toast.success("Opening WhatsApp...");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to create invite");
    } finally {
      setSending(false);
    }
  }

  function handleClose() {
    setSent(false);
    setEmail("");
    setName(opponentName || "");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-heading">Share Booking</DialogTitle>
        </DialogHeader>

        <div className="rounded-md border p-3 mb-2">
          <p className="text-sm font-medium">
            Court {courtId} · {dateStr}
          </p>
          <p className="text-xs text-muted-foreground">
            {startTime} – {endTime}
            {opponentName ? ` · vs ${opponentName}` : ""}
          </p>
        </div>

        {sent ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-primary" />
            </div>
            <p className="text-sm font-medium">Invitation sent to {email}</p>
            <p className="text-xs text-muted-foreground">They'll receive an email with accept/decline buttons.</p>
            <Button variant="outline" size="sm" onClick={handleClose}>Done</Button>
          </div>
        ) : (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="email" className="gap-1.5">
                <Mail className="w-3.5 h-3.5" /> Email
              </TabsTrigger>
              <TabsTrigger value="whatsapp" className="gap-1.5">
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
              </TabsTrigger>
            </TabsList>

            <TabsContent value="email" className="space-y-3 mt-3">
              <div className="space-y-2">
                <Label className="text-xs">Recipient name (optional)</Label>
                <Input
                  placeholder="e.g. John"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Email address</Label>
                <Input
                  type="email"
                  placeholder="player@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button
                className="w-full gap-2"
                disabled={!email.trim() || sending}
                onClick={handleSendEmail}
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send Invitation
              </Button>
            </TabsContent>

            <TabsContent value="whatsapp" className="space-y-3 mt-3">
              <div className="space-y-2">
                <Label className="text-xs">Recipient name (optional)</Label>
                <Input
                  placeholder="e.g. John"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                This will open WhatsApp with a pre-filled message containing your booking details.
              </p>
              <Button
                className="w-full gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white"
                disabled={sending}
                onClick={handleWhatsApp}
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
                Share via WhatsApp
              </Button>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
