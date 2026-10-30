import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Lock, CalendarDays, MapPin, FileText, CheckCircle2, XCircle, UserCheck } from "lucide-react";
import type { AgmDocument } from "@/lib/agm/ballot";

type Rsvp = "attending_in_person" | "attending_online" | "apologies" | "attending";
const RSVP_CHOICES = ["attending_in_person", "attending_online", "apologies"] as const;
const RSVP_LABEL: Record<Rsvp, string> = {
  attending_in_person: "Attending in person",
  attending_online: "Will attend online",
  apologies: "Apologies, cannot attend",
  attending: "Attending",
};

type Invite = {
  state: "invalid" | "ok";
  preview?: boolean;
  title?: string; club_name?: string; name?: string;
  meeting_at?: string | null; venue?: string | null; details?: string | null;
  documents?: AgmDocument[]; vote_deadline?: string; rsvp?: Rsvp | null; locked?: boolean;
  my_proxy?: { id: string; name: string; status: ProxyStatus } | null;
  proxies_received?: { id: string; name: string; status: ProxyStatus }[];
  accepted_proxies?: { grantor: string; proxy: string }[];
};
type ProxyStatus = "pending" | "accepted" | "declined";
const PROXY_STATUS: Record<ProxyStatus, string> = { pending: "awaiting their acceptance", accepted: "accepted", declined: "declined" };

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

  const respond = async (r: Rsvp) => {
    setBusy(true); setError(null);
    const { error } = await supabase.rpc("agm_rsvp" as any, { p_token: token, p_response: r });
    setBusy(false);
    if (error) setError(error.message);
    else setInvite((i) => (i ? { ...i, rsvp: r } : i));
  };

  const reload = () => supabase.rpc("agm_invite_for_token" as any, { p_token: token }).then(({ data }) => data && setInvite(data as Invite));
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ club_member_id: string; name: string }[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(() => {
      supabase.rpc("agm_proxy_search" as any, { p_token: token, p_query: q }).then(({ data }) => setHits((data as any[]) ?? []));
    }, 250);
    return () => clearTimeout(t);
  }, [q, token]);
  const proxyCall = async (fn: string, args: Record<string, unknown>) => {
    setBusy(true); setError(null);
    const { error } = await supabase.rpc(fn as any, { p_token: token, ...args });
    setBusy(false);
    if (error) setError(error.message); else { setQ(""); setHits([]); await reload(); }
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
              {invite.details && <p className="whitespace-pre-wrap text-muted-foreground">{
                // The page already greets the member by name, so drop a leading "Dear {member name}," and fill any other merge fields.
                invite.details.replace(/^\s*Dear\s*\{member name\}\s*,?\s*/i, "").replace(/\{member name\}/gi, invite.name ?? "member")
              }</p>}
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
                  {invite.rsvp !== "apologies" ? <CheckCircle2 className="w-4 h-4 text-primary" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}
                  Your reply: <strong>{RSVP_LABEL[invite.rsvp]}</strong>
                </p>
              )}
              {invite.preview ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {RSVP_CHOICES.map((c) => <Button key={c} disabled variant="outline">{RSVP_LABEL[c]}</Button>)}
                  </div>
                  <p className="text-xs text-muted-foreground">Test preview — these buttons are switched off and no reply is saved.</p>
                </>
              ) : invite.locked ? (
                <p className="text-xs text-muted-foreground">The meeting has started; replies are closed.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {RSVP_CHOICES.map((c) => (
                    <Button key={c} disabled={busy} variant={invite.rsvp === c ? "default" : "outline"} onClick={() => respond(c)}>{RSVP_LABEL[c]}</Button>
                  ))}
                </div>
              )}
              {invite.rsvp && !invite.locked && <p className="text-[11px] text-muted-foreground">You can change your reply until the meeting starts.</p>}
              {error && <p className="text-sm text-destructive">{error}</p>}
            </Card>

            <Card className="p-4 space-y-3">
              <p className="text-sm font-semibold flex items-center gap-2"><UserCheck className="w-4 h-4 text-primary" />Appoint a proxy</p>
              <p className="text-sm text-muted-foreground">
                I, <strong className="text-foreground">{invite.name ?? "member"}</strong>, hereby appoint the following person to act on my behalf at this meeting.
              </p>
              <p className="text-[11px] text-muted-foreground">A proxy votes for you at the meeting in person only; the online ballot stays one vote per member. The person must accept, and accepted proxies are shown by name to all members.</p>
              {invite.my_proxy ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span>Your proxy: <strong>{invite.my_proxy.name}</strong> ({PROXY_STATUS[invite.my_proxy.status]})</span>
                  {!invite.locked && <Button size="sm" variant="outline" disabled={busy} onClick={() => proxyCall("agm_appoint_proxy", { p_proxy_member_id: null })}>Withdraw</Button>}
                </div>
              ) : null}
              {invite.preview ? (
                <p className="text-xs text-muted-foreground">Test preview — proxy appointment is switched off.</p>
              ) : !invite.locked && (!invite.my_proxy || invite.my_proxy.status === "declined") ? (
                <div className="space-y-1">
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search member name…" />
                  {hits.map((h) => (
                    <button key={h.club_member_id} disabled={busy} onClick={() => proxyCall("agm_appoint_proxy", { p_proxy_member_id: h.club_member_id })}
                      className="w-full text-left rounded border border-border px-3 py-2 text-sm hover:border-primary">{h.name}</button>
                  ))}
                  {q.trim().length >= 2 && !hits.length && <p className="text-xs text-muted-foreground">No invited member found.</p>}
                </div>
              ) : null}
            </Card>

            {!!invite.proxies_received?.length && (
              <Card className="p-4 space-y-2">
                <p className="text-sm font-semibold">You have been appointed as proxy</p>
                {invite.proxies_received.map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="flex-1"><strong>{p.name}</strong> asked you to act on their behalf ({PROXY_STATUS[p.status]})</span>
                    {!invite.locked && p.status === "pending" && <>
                      <Button size="sm" disabled={busy} onClick={() => proxyCall("agm_respond_proxy", { p_proxy_id: p.id, p_accept: true })}>Accept</Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => proxyCall("agm_respond_proxy", { p_proxy_id: p.id, p_accept: false })}>Decline</Button>
                    </>}
                  </div>
                ))}
              </Card>
            )}

            {!!invite.accepted_proxies?.length && (
              <Card className="p-4 space-y-1">
                <p className="text-sm font-semibold">Proxies for this meeting ({invite.accepted_proxies.length})</p>
                {invite.accepted_proxies.map((p, k) => (
                  <p key={k} className="text-xs text-muted-foreground"><strong className="text-foreground">{p.proxy}</strong> on behalf of {p.grantor}</p>
                ))}
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
