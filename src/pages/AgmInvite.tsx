import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Lock, CalendarDays, MapPin, FileText, CheckCircle2, XCircle } from "lucide-react";
import type { AgmDocument } from "@/lib/agm/ballot";

type Invite = {
  state: "invalid" | "ok";
  title?: string; club_name?: string; name?: string;
  meeting_at?: string | null; venue?: string | null; details?: string | null;
  documents?: AgmDocument[]; vote_deadline?: string; rsvp?: "attending" | "apologies" | null; locked?: boolean;
};

const fmt = (d?: string | null) =>
  d ? new Date(d).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", dateStyle: "full", timeStyle: "short" }) : "";

export default function AgmInvite() {
  const { token = "" } = useParams();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("dark");
    supabase.rpc("agm_invite_for_token" as any, { p_token: token }).then(({ data, error }) => {
      setInvite(error ? { state: "invalid" } : (data as Invite));
    });
  }, [token]);

  const openDoc = async (d: AgmDocument) => {
    const { data, error } = await supabase.storage.from("agm-documents").createSignedUrl(d.path, 600);
    if (error || !data) setError("Could not open the document. Please try again.");
    else window.open(data.signedUrl, "_blank", "noopener");
  };

  const respond = async (r: "attending" | "apologies") => {
    setBusy(true); setError(null);
    const { error } = await supabase.rpc("agm_rsvp" as any, { p_token: token, p_response: r });
    setBusy(false);
    if (error) setError(error.message);
    else setInvite((i) => (i ? { ...i, rsvp: r } : i));
  };

  if (!invite) return <div className="min-h-screen grid place-items-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-8">
      <div className="max-w-xl mx-auto space-y-4">
        {invite.state !== "ok" ? (
          <Card className="p-6 text-center space-y-2">
            <Lock className="w-8 h-8 mx-auto text-muted-foreground" />
            <h1 className="text-lg font-semibold">This invitation link is not valid</h1>
            <p className="text-xs text-muted-foreground">Please contact the club if you believe this is wrong.</p>
          </Card>
        ) : (
          <>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{invite.club_name}</p>
              <h1 className="text-xl font-semibold">Invitation: {invite.title}</h1>
              <p className="text-sm text-muted-foreground mt-1">Dear {invite.name ?? "member"}, you are invited to attend the Annual General Meeting.</p>
            </div>

            <Card className="p-4 space-y-2 text-sm">
              {invite.meeting_at && <p className="flex gap-2"><CalendarDays className="w-4 h-4 text-primary shrink-0 mt-0.5" />{fmt(invite.meeting_at)}</p>}
              {invite.venue && <p className="flex gap-2"><MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />{invite.venue}</p>}
              {invite.details && <p className="whitespace-pre-wrap text-muted-foreground">{invite.details}</p>}
              {!invite.meeting_at && !invite.venue && !invite.details && <p className="text-muted-foreground">Meeting details will follow.</p>}
            </Card>

            {!!invite.documents?.length && (
              <Card className="p-4 space-y-2">
                <p className="text-sm font-semibold">Meeting documents</p>
                {invite.documents.map((d) => (
                  <button key={d.path} onClick={() => openDoc(d)} className="w-full flex items-center gap-2 rounded border border-border px-3 py-2 text-sm text-left hover:border-primary">
                    <FileText className="w-4 h-4 text-primary shrink-0" /><span className="truncate">{d.name}</span>
                  </button>
                ))}
              </Card>
            )}

            <Card className="p-4 space-y-3">
              <p className="text-sm font-semibold">Will you attend?</p>
              {invite.rsvp && (
                <p className="text-sm flex items-center gap-2">
                  {invite.rsvp === "attending" ? <CheckCircle2 className="w-4 h-4 text-primary" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}
                  Your reply: <strong>{invite.rsvp === "attending" ? "Attending" : "Apologies — not attending"}</strong>
                </p>
              )}
              {invite.locked ? (
                <p className="text-xs text-muted-foreground">The meeting has started; replies are closed.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Button disabled={busy} variant={invite.rsvp === "attending" ? "default" : "outline"} onClick={() => respond("attending")}>I confirm attendance</Button>
                  <Button disabled={busy} variant={invite.rsvp === "apologies" ? "default" : "outline"} onClick={() => respond("apologies")}>Apologies — not attending</Button>
                </div>
              )}
              {invite.rsvp && !invite.locked && <p className="text-[11px] text-muted-foreground">You can change your reply until the meeting starts.</p>}
              {error && <p className="text-sm text-destructive">{error}</p>}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
