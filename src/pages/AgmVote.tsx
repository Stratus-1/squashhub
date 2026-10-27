import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Lock, CheckCircle2 } from "lucide-react";

type Ballot = {
  state: "invalid" | "open" | "voted" | "closed";
  preview?: boolean;
  runoff?: boolean;
  title?: string;
  declaration?: string;
  deadline?: string;
  club_name?: string;
  voter?: { name: string | null; member_number: string | null; email: string | null };
  positions?: { id: string; title: string; max_choices?: number; candidates: { id: string; name: string }[] }[];
};

const fmt = (d?: string) =>
  d ? new Date(d).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", dateStyle: "full", timeStyle: "short" }) : "";

export default function AgmVote() {
  const { token = "" } = useParams();
  const [ballot, setBallot] = useState<Ballot | null>(null);
  const [declared, setDeclared] = useState(false);
  const [choices, setChoices] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("dark");
    supabase.rpc("agm_ballot_for_token" as any, { p_token: token }).then(({ data, error }) => {
      if (error) setBallot({ state: "invalid" });
      else setBallot(data as Ballot);
    });
  }, [token]);

  const submit = async () => {
    setError(null);
    const positions = ballot?.positions ?? [];
    const missing = positions.filter((p) => !choices[p.id]?.length);
    if (missing.length) {
      setError(`Please choose (or abstain) for: ${missing.map((m) => m.title).join(", ")}`);
      return;
    }
    if (!confirm("Submit your ballot? Votes cannot be changed afterwards.")) return;
    setBusy(true);
    const payload: Record<string, string[] | null> = {};
    for (const [k, v] of Object.entries(choices)) payload[k] = v.includes("abstain") ? null : v;
    const { data, error } = await supabase.rpc("agm_cast_vote" as any, {
      p_token: token, p_declared: declared, p_choices: payload,
    });
    setBusy(false);
    if (error) setError(error.message);
    else setReceipt(data as string);
  };

  if (!ballot) return <div className="min-h-screen grid place-items-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-background text-foreground px-4 py-8">
      <div className="max-w-xl mx-auto space-y-4">{children}</div>
    </div>
  );

  if (receipt)
    return shell(
      <Card className="p-6 text-center space-y-3">
        <CheckCircle2 className="w-10 h-10 text-primary mx-auto" />
        <h1 className="text-lg font-semibold">Thank you — your vote has been recorded</h1>
        <p className="text-sm text-muted-foreground">Your private receipt code:</p>
        <p className="text-2xl font-mono font-bold tracking-widest">{receipt}</p>
        <p className="text-xs text-muted-foreground">
          Keep this code to yourself. At the AGM the results list every receipt code with its choices, so you can check your
          vote was counted. Nobody — including the committee — can link this code to your name.
        </p>
      </Card>,
    );

  if (ballot.state !== "open")
    return shell(
      <Card className="p-6 text-center space-y-2">
        <Lock className="w-8 h-8 mx-auto text-muted-foreground" />
        <h1 className="text-lg font-semibold">
          {ballot.state === "voted" ? "You have already voted" : ballot.state === "closed" ? "Voting has closed" : "This voting link is not valid"}
        </h1>
        {ballot.title && <p className="text-sm text-muted-foreground">{ballot.title}</p>}
        {ballot.state === "invalid" && <p className="text-xs text-muted-foreground">Please contact the club if you believe this is wrong.</p>}
      </Card>,
    );

  return shell(
    <>
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{ballot.club_name}</p>
        <h1 className="text-xl font-semibold">{ballot.title}</h1>
        {ballot.runoff && <p className="text-sm mt-2">Second ballot: tied candidates only. Previously elected candidates remain elected. You may vote once in this round.</p>}
        <p className="text-xs text-muted-foreground mt-1">Voting closes {fmt(ballot.deadline)}. Your vote is secret.</p>
        {ballot.preview && <p className="mt-2 rounded border border-primary/40 bg-primary/10 px-3 py-2 text-xs">TEST PREVIEW — you can look around and tick options, but nothing can be submitted.</p>}
      </div>

      <Card className="p-4 space-y-3">
        <p className="text-sm font-semibold">1. Voter verification</p>
        <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Name</dt><dd>{ballot.voter?.name ?? "—"}</dd>
          <dt className="text-muted-foreground">Member no.</dt><dd>{ballot.voter?.member_number ?? "—"}</dd>
          <dt className="text-muted-foreground">Email</dt><dd className="break-all">{ballot.voter?.email ?? "—"}</dd>
        </dl>
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <Checkbox checked={declared} onCheckedChange={(v) => setDeclared(v === true)} className="mt-0.5" />
          <span>{ballot.declaration}</span>
        </label>
        <p className="text-[11px] text-muted-foreground">Not you? Do not vote — contact the club.</p>
      </Card>

      {declared && (
        <>
          {(ballot.positions ?? []).map((p, i) => {
            const max = p.max_choices ?? 1;
            const sel = choices[p.id] ?? [];
            const toggle = (id: string) =>
              setChoices((s) => {
                const cur = s[p.id] ?? [];
                if (max === 1 || id === "abstain") return { ...s, [p.id]: [id] };
                const base = cur.filter((c) => c !== "abstain");
                if (base.includes(id)) return { ...s, [p.id]: base.filter((c) => c !== id) };
                if (base.length >= max) return s;
                return { ...s, [p.id]: [...base, id] };
              });
            return (
              <Card key={p.id} className="p-4 space-y-2">
                <p className="text-sm font-semibold">{i + 2}. {p.title}</p>
                {max > 1 && (
                  <p className="text-xs text-muted-foreground">Choose up to {max} ({sel.filter((c) => c !== "abstain").length} of {max} chosen).</p>
                )}
                <div className="space-y-1">
                  {[...p.candidates, { id: "abstain", name: "Abstain" }].map((c) => {
                    const on = sel.includes(c.id);
                    const full = max > 1 && !on && c.id !== "abstain" && sel.filter((x) => x !== "abstain").length >= max;
                    return (
                      <label key={c.id} className={`flex items-center gap-2 rounded border px-3 py-2 text-sm ${full ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${on ? "border-primary bg-primary/10" : "border-border"}`}>
                        <input
                          type={max > 1 ? "checkbox" : "radio"}
                          name={p.id}
                          checked={on}
                          disabled={full}
                          onChange={() => toggle(c.id)}
                        />
                        <span className={c.id === "abstain" ? "text-muted-foreground" : ""}>{c.name}</span>
                      </label>
                    );
                  })}
                </div>
              </Card>
            );
          })}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button className="w-full" onClick={submit} disabled={busy || !!ballot.preview}>
            {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Submit my ballot
          </Button>
          {ballot.preview && <p className="text-xs text-muted-foreground text-center">Test preview — submitting is switched off and no vote is recorded.</p>}
        </>
      )}
    </>,
  );
}
