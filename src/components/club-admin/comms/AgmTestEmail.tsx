import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Mail } from "lucide-react";

export function AgmTestEmail({ clubId, ballotId, kind = "invite", beforeSend }: { clubId: string; ballotId: string; kind?: "invite" | "nominations"; beforeSend?: () => Promise<void> }) {
  const [memberId, setMemberId] = useState("");
  const [destination, setDestination] = useState<"self" | "member">("self");
  const { data: members = [] } = useQuery({
    queryKey: ["agm-test-members", clubId],
    queryFn: async () => {
      const { data, error } = await supabase.from("club_members").select("id,name,email").eq("club_id", clubId).eq("status", "active").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const member = members.find((m) => m.id === memberId);
  const send = useMutation({
    mutationFn: async () => {
      if (beforeSend) await beforeSend();
      const { data, error } = await supabase.functions.invoke("agm-test-email", {
        body: { ballot_id: ballotId, member_id: memberId, destination, request_id: crypto.randomUUID(), kind },
      });
      if (error) {
        let detail = error.message;
        try { const response = await error.context?.json(); detail = response?.error || detail; } catch { /* retain message */ }
        throw new Error(detail);
      }
      if (data?.error) throw new Error(data.error);
      if (!data?.sent) throw new Error(data?.reason === "recipient_suppressed" ? "This recipient has opted out or is blocked from receiving app emails." : "The test email was not sent.");
    },
    onSuccess: () => toast({ title: "Test email sent", description: destination === "self" ? `Sent to your sign-in email, personalised for ${member?.name}.` : `Sent to ${member?.name}.` }),
    onError: (error: Error) => toast({ title: "Test email not sent", description: error.message, variant: "destructive" }),
  });
  return (
    <div className="border-t border-border pt-3 space-y-2">
      <p className="text-xs font-semibold flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{kind === "nominations" ? "Test call for nominations email" : "Test AGM email"}</p>
      <div className="grid sm:grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor={`agm-test-member-${ballotId}`} className="text-xs">Preview for member</Label>
          <Select value={memberId} onValueChange={setMemberId}>
            <SelectTrigger id={`agm-test-member-${ballotId}`}><SelectValue placeholder="Choose a member" /></SelectTrigger>
            <SelectContent>{members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`agm-test-to-${ballotId}`} className="text-xs">Send test to</Label>
          <Select value={destination} onValueChange={(value) => setDestination(value === "member" ? "member" : "self")}>
            <SelectTrigger id={`agm-test-to-${ballotId}`}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="self">My sign-in email</SelectItem><SelectItem value="member">Selected member’s email</SelectItem></SelectContent>
          </Select>
        </div>
      </div>
      {destination === "member" && member && <p className="text-xs text-muted-foreground">{member.email || "This member has no email address."}</p>}
      <Button size="sm" variant="outline" disabled={!memberId || send.isPending || (destination === "member" && !member?.email)} onClick={() => send.mutate()}>
        <Mail className="w-3.5 h-3.5 mr-1" />{send.isPending ? "Sending…" : "Send test email"}
      </Button>
      <p className="text-[11px] text-muted-foreground">{kind === "nominations" ? "Saves the draft first, then sends exactly this message. The test nomination link is inactive; no nominations open." : <>Saved details only. Test voting and attendance buttons are inactive; the live ballot and replies stay unchanged.</>}</p>
    </div>
  );
}