import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Lock, Search, UserPlus, X } from "lucide-react";
import shLogoFull from "@/assets/shub-logo-white.png";

type Pos = { id: string; title: string; max_choices: number };
type Data = {
  state: "invalid" | "ok";
  club_name?: string; logo_url?: string | null; title?: string; name?: string; member_id?: string; allow_self?: boolean;
  close_at?: string; closed?: boolean; positions?: Pos[];
  made?: { id: string; position_id: string; nominee: string; status: string; supporters?: number }[];
  received?: { id: string; position_id: string; by: string; self: boolean; status: string }[];
};

const fmt = (d?: string) =>
  d ? new Date(d).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", dateStyle: "full", timeStyle: "short" }) : "";
const rpc = (fn: string, args: Record<string, unknown>) => supabase.rpc(fn as any, args as any);

export default function AgmNominate() {
  const { token = "" } = useParams();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    rpc("agm_nomination_for_token", { p_token: token }).then(({ data, error }) =>
      setData(error ? { state: "invalid" } : (data as Data)));
  }, [token]);
  useEffect(() => { document.documentElement.classList.add("dark"); load(); }, [load]);

  const [notice, setNotice] = useState<string | null>(null);
  const act = async (fn: string, args: Record<string, unknown>): Promise<string | false> => {
    setBusy(true); setError(null); setNotice(null);
    const { data: res, error } = await rpc(fn, { p_token: token, ...args });
    setBusy(false);
    if (error) setError(error.message); else load();
    return error ? false : String(res ?? "ok");
  };

  // The link usually opens in its own tab from an email, so closing means
  // shutting that tab; where the browser refuses, go back to where they came from.
  const closePage = () => {
    window.close();
    setTimeout(() => {
      if (window.history.length > 1) window.history.back();
      else window.location.href = "/";
    }, 150);
  };

  if (!data) return <div className="min-h-screen grid place-items-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (data.state !== "ok") return (
    <div className="min-h-screen bg-background text-foreground px-4 py-8">
      <Card className="max-w-xl mx-auto p-6 text-center space-y-2">
        <Lock className="w-8 h-8 mx-auto text-muted-foreground" />
        <h1 className="text-lg font-semibold">This nomination link is not valid</h1>
        <p className="text-xs text-muted-foreground">It may have been replaced by a newer link. Please contact the club.</p>
      </Card>
    </div>
  );

  const pending = (data.received ?? []).filter((r) => !r.self);
  const posTitle = (id: string) => data.positions?.find((p) => p.id === id)?.title ?? "";

  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-8">
      <div className="max-w-xl mx-auto space-y-4">
        {(data as any).preview ? <Card className="p-3 text-xs border-primary/40">Test preview — this is what members will see. Nominations made here are not saved.</Card> : null}
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {data.logo_url ? (
              <img src={data.logo_url} alt={`${data.club_name} logo`} className="h-14 w-14 shrink-0 rounded-xl object-contain shadow-lg ring-1 ring-border" />
            ) : (
              <img src={shLogoFull} alt="SquashHub logo" className="h-9 w-auto shrink-0 object-contain" />
            )}
            <p className="truncate text-xs uppercase tracking-wide text-muted-foreground">{data.club_name}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={closePage} aria-label="Close this page" title="Close"
            className="shrink-0 rounded-full border border-border text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div>
          <h1 className="text-xl font-semibold">Committee nominations: {data.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Dear {data.name}, {data.closed ? "nominations are now closed." : <>you can nominate another member for next year's committee{data.allow_self ? ", or make yourself available to serve by choosing the position or function you would like to fulfil" : ""}. Nominations close <strong>{fmt(data.close_at)}</strong>.</>}
          </p>
        </div>

        {pending.length > 0 && (
          <Card className="p-4 space-y-2">
            <p className="text-sm font-semibold">You have been nominated</p>
            {pending.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 text-sm border border-border rounded p-2">
                <span className="flex-1"><strong>{posTitle(r.position_id)}</strong> <span className="text-muted-foreground">— by {r.by}</span></span>
                {r.status === "pending" && !data.closed ? (
                  <>
                    <Button size="sm" disabled={busy} onClick={() => act("agm_respond_nomination", { p_nomination_id: r.id, p_accept: true })}>Accept</Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => act("agm_respond_nomination", { p_nomination_id: r.id, p_accept: false })}>Decline</Button>
                  </>
                ) : (
                  <>
                    <Badge variant={r.status === "accepted" ? "default" : "secondary"}>{r.status}</Badge>
                    {!data.closed && <Button size="sm" variant="ghost" disabled={busy} onClick={() => act("agm_respond_nomination", { p_nomination_id: r.id, p_accept: r.status !== "accepted" })}>Change</Button>}
                  </>
                )}
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground">Only accepted nominations go onto the ballot.</p>
          </Card>
        )}

        {(data.positions ?? []).map((p) => (
          <PositionCard key={p.id} pos={p} token={token} me={data.member_id!} name={data.name ?? ""} allowSelf={!!data.allow_self} closed={!!data.closed} busy={busy}
            made={(data.made ?? []).filter((m) => m.position_id === p.id)}
            onNominate={async (id) => {
              const res = await act("agm_nominate", { p_position_id: p.id, p_nominee_id: id });
              // Only a brand-new nomination asks the nominee to accept; repeat nominations are recorded as support.
              if (res === "created" && id !== data.member_id) supabase.functions.invoke("agm-nominee-notify", { body: { token, position_id: p.id, nominee_id: id } }).catch(() => {});
              if (res === "supported") setNotice(`This member was already nominated for ${p.title} — your support has been added. They won't be asked to accept again.`);
              if (res === "already") setNotice(`You have already nominated this member for ${p.title}.`);
            }} />
        ))}
        {notice && <p className="text-sm text-primary">{notice}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}

function PositionCard({ pos, token, me, name, allowSelf, closed, busy, made, onNominate }: {
  pos: Pos; token: string; me: string; name: string; allowSelf: boolean; closed: boolean; busy: boolean;
  made: { id: string; nominee: string; status: string; supporters?: number }[]; onNominate: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ club_member_id: string; name: string }[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(() => {
      rpc("agm_search_nominees", { p_token: token, p_query: q }).then(({ data }) => setHits((data as any[]) ?? []));
    }, 250);
    return () => clearTimeout(t);
  }, [q, token]);
  const selfDone = made.some((m) => m.nominee === name);

  return (
    <Card className="p-4 space-y-2">
      <p className="text-sm font-semibold">{pos.title}{pos.max_choices > 1 && <span className="font-normal text-muted-foreground"> · {pos.max_choices} places</span>}</p>
      {made.map((m) => (
        <p key={m.id} className="text-xs flex items-center gap-2">
          <span className="flex-1">You nominated <strong>{m.nominee}</strong>{(m.supporters ?? 1) > 1 && <span className="text-muted-foreground"> · {m.supporters} nominations</span>}</span>
          <Badge variant={m.status === "accepted" ? "default" : "secondary"} className="text-[10px]">{m.status === "pending" ? "awaiting acceptance" : m.status}</Badge>
        </p>
      ))}
      {!closed && (
        <>
          {allowSelf && !selfDone && <Button size="sm" variant="outline" disabled={busy} onClick={() => onNominate(me)}><UserPlus className="w-3.5 h-3.5 mr-1" />I'm available for this position</Button>}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-2.5 text-muted-foreground" />
            <Input className="pl-7" placeholder="Search a member's name to nominate them" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {hits.filter((h) => h.club_member_id !== me).map((h) => (
            <button key={h.club_member_id} disabled={busy}
              onClick={() => { onNominate(h.club_member_id); setQ(""); }}
              className="w-full text-left text-sm border border-border rounded px-3 py-1.5 hover:border-primary">
              Nominate {h.name}
            </button>
          ))}
          {q.trim().length >= 2 && !hits.length && <p className="text-[11px] text-muted-foreground">No eligible member found.</p>}
        </>
      )}
    </Card>
  );
}
