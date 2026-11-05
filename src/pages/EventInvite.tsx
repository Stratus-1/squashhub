import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CalendarDays, Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/SEO";
import { supabase } from "@/integrations/supabase/client";

type Invite = { state: "ok" | "invalid"; club_name?: string; title?: string; description?: string; instance_date?: string; start_time?: string; status?: string; locked?: boolean };

export default function EventInvite() {
  const { token = "", subdomain } = useParams();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const host = window.location.hostname;
  const clubSlug = subdomain || (host.endsWith(".squashhub.co.za") && host !== "www.squashhub.co.za" ? host.split(".")[0] : null);
  useEffect(() => {
    let cancelled = false;
    setInvite(null);
    supabase.rpc("event_invitation_reply" as any, { p_token: token, p_subdomain: clubSlug, p_response: null }).then(({ data, error }) => {
      if (!cancelled) setInvite(error ? { state: "invalid" } : data as Invite);
    });
    return () => { cancelled = true; };
  }, [token, clubSlug]);

  async function respond(response: "confirmed" | "declined") {
    setBusy(true); setError("");
    const { data, error } = await supabase.rpc("event_invitation_reply" as any, { p_token: token, p_subdomain: clubSlug, p_response: response });
    setBusy(false);
    if (error) setError("Your reply could not be saved. Please try again.");
    else setInvite(data as Invite);
  }

  return <main className="min-h-screen bg-background text-foreground px-4 py-12">
    <SEO title="Event invitation" noIndex />
    <div className="max-w-xl mx-auto space-y-6">
      {!invite ? <Loader2 aria-label="Loading invitation" className="w-6 h-6 animate-spin text-primary" /> : invite.state !== "ok" ? <>
        <h1 className="text-xl font-semibold">This invitation is no longer available</h1>
        <p className="text-sm text-muted-foreground">Please contact the club for a new invitation.</p>
      </> : <>
        <header className="space-y-2"><p className="text-sm font-semibold text-primary">{invite.club_name}</p><h1 className="text-2xl font-semibold">{invite.title}</h1></header>
        <p className="flex items-center gap-2 text-sm"><CalendarDays className="w-4 h-4 text-primary shrink-0" />{invite.instance_date ? new Date(`${invite.instance_date}T12:00:00Z`).toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Johannesburg" }) : ""} · {invite.start_time?.slice(0, 5)}</p>
        {invite.description && <p className="text-sm whitespace-pre-wrap text-muted-foreground">{invite.description}</p>}
        {invite.status === "confirmed" && <p role="status" className="font-semibold">You're confirmed — see you there!</p>}
        {invite.status === "declined" && <p role="status" className="font-semibold">You have declined this invitation.</p>}
        {invite.locked ? <p className="text-sm text-muted-foreground">Replies for this event have closed.</p> : <div className="flex flex-wrap gap-3">
          <Button disabled={busy} onClick={() => respond("confirmed")}><Check className="w-4 h-4 mr-2" />Accept</Button>
          <Button variant="outline" disabled={busy} onClick={() => respond("declined")}><X className="w-4 h-4 mr-2" />Decline</Button>
        </div>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </>}
    </div>
  </main>;
}