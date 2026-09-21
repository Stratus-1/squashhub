/**
 * Organiser card: the tournament's WhatsApp group.
 *
 * WhatsApp gives no API that can run a group this size (Meta's native Groups
 * API caps a group at eight people and Twilio does not expose it), so the
 * organiser creates the group on their own phone — name, photo, admin-only
 * posting — and pastes the invite link here. SquashHub then handles who gets
 * the link, the enter/withdraw links for the group description, and the record
 * of what was sent. Leaving this empty never blocks anything.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, Loader2, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  defaultGroupName,
  groupDescriptionText,
  normaliseGroupInviteUrl,
  type GroupStatus,
} from "@/lib/tournaments/whatsapp-group";
import {
  useSaveTournamentWhatsAppGroup,
  useSendGroupJoinLinks,
  useTournamentGroupInvites,
  useTournamentWhatsAppGroup,
} from "@/hooks/use-tournament-whatsapp-group";

type Props = {
  champId: string;
  champName: string;
  clubId?: string | null;
  /** Club, association or federation that owns the tournament. */
  ownerName?: string | null;
  subdomain?: string | null;
  tournamentStatus?: string | null;
};

export function TournamentWhatsAppGroupCard({
  champId,
  champName,
  clubId,
  ownerName,
  subdomain,
  tournamentStatus,
}: Props) {
  const { data: group, isLoading } = useTournamentWhatsAppGroup(champId);
  const save = useSaveTournamentWhatsAppGroup(champId, clubId);
  const sendLinks = useSendGroupJoinLinks(champId);
  const { data: invites } = useTournamentGroupInvites(champId);

  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [announceOnly, setAnnounceOnly] = useState(true);

  useEffect(() => {
    setUrl(group?.invite_url ?? "");
    setName(group?.group_name ?? defaultGroupName(champName, ownerName));
    setAnnounceOnly(group?.announcements_only ?? true);
  }, [group, champName, ownerName]);

  const description = useMemo(
    () => groupDescriptionText({ champId, tournamentName: champName, ownerName, subdomain }),
    [champId, champName, ownerName, subdomain],
  );

  const status: GroupStatus = (group?.status as GroupStatus) ?? "active";
  const sentCount = (invites ?? []).filter((i) => i.sent_at).length;

  const copy = async (text: string, what: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  };

  const onSave = () => {
    const clean = normaliseGroupInviteUrl(url);
    if (url.trim() && !clean) {
      toast.error("That is not a WhatsApp group invite link (it should start with chat.whatsapp.com).");
      return;
    }
    save.mutate(
      {
        invite_url: clean,
        group_name: name.trim() || defaultGroupName(champName, ownerName),
        description,
        announcements_only: announceOnly,
        status: "active",
      } as any,
      { onSuccess: () => toast.success("Group details saved") },
    );
  };

  const onSend = () => {
    sendLinks.mutate(
      {},
      {
        onSuccess: (r) =>
          toast.success(
            `Join link sent to ${r.sent} of ${r.total} entrant${r.total === 1 ? "" : "s"}` +
              (r.skipped ? ` (${r.skipped} already had it)` : ""),
          ),
        onError: (e: any) => toast.error(e?.message || "Could not send the join link"),
      },
    );
  };

  const setStatus = (next: GroupStatus) =>
    save.mutate(
      { status: next, closed_at: next === "active" ? null : new Date().toISOString() } as any,
      { onSuccess: () => toast.success(next === "active" ? "Group reopened" : `Group ${next}`) },
    );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <MessageCircle className="w-4 h-4" /> Tournament WhatsApp group
          {status !== "active" && <Badge variant="secondary">{status}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-xs text-muted-foreground">
          Create the group in WhatsApp on your phone — set the photo and, under group settings, allow
          only admins to send messages (you can still let everyone add people). Then paste the group's
          invite link here. Being in the group never counts as entering the tournament.
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="wa-group-name" className="text-xs">Group name</Label>
          <Input id="wa-group-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="wa-group-url" className="text-xs">Group invite link</Label>
          <Input
            id="wa-group-url"
            placeholder="https://chat.whatsapp.com/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">
            In WhatsApp: group name → Invite via link → Copy link.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div>
            <Label className="text-xs">Announcements only</Label>
            <p className="text-[11px] text-muted-foreground">
              A reminder for you — this is set inside WhatsApp, not here.
            </p>
          </div>
          <Switch checked={announceOnly} onCheckedChange={setAnnounceOnly} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Group description (paste into WhatsApp and pin it)</Label>
          <Textarea value={description} readOnly rows={7} className="text-xs" />
          <Button size="sm" variant="outline" onClick={() => copy(description, "Description")}>
            <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy description
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" onClick={onSave} disabled={save.isPending || isLoading}>
            {save.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />} Save
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onSend}
            disabled={!group?.invite_url || sendLinks.isPending || status !== "active"}
          >
            {sendLinks.isPending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5 mr-1.5" />
            )}
            Send join link to entrants
          </Button>
          {status === "active" ? (
            <Button size="sm" variant="ghost" onClick={() => setStatus("closed")} disabled={!group}>
              Close group activity
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setStatus("active")}>
              Reopen
            </Button>
          )}
          {status === "closed" && (
            <Button size="sm" variant="ghost" onClick={() => setStatus("archived")}>
              Archive
            </Button>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground">
          Sent to {sentCount} entrant{sentCount === 1 ? "" : "s"}. Only people who have entered are
          sent the link. WhatsApp cannot tell us who actually joined, so we never claim they did.
          {tournamentStatus === "completed" &&
            " This tournament is finished — SquashHub has stopped posting to the group. Deleting the group stays your decision, inside WhatsApp."}
        </p>
      </CardContent>
    </Card>
  );
}
