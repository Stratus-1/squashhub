/** On-demand opponent contact for ONE fixture (no bulk loading). Server decides everything. */
import { useState } from "react";
import { Loader2, MessageCircle, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getOpponentContacts, phoneLinks, type FixtureKind, type OpponentContact } from "@/lib/contact-sharing";

export function OpponentContactButton({ kind, fixtureId, fallback }: { kind: FixtureKind; fixtureId: string; fallback?: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [rows, setRows] = useState<OpponentContact[]>([]);
  const [err, setErr] = useState("");
  const load = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setState("loading");
    try { setRows(await getOpponentContacts(kind, fixtureId)); setState("done"); }
    catch (x: any) { setErr(x?.message || "Couldn't load contact details"); setState("error"); }
  };
  if (state === "idle" || state === "loading") {
    return <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={load} disabled={state === "loading"}>
      {state === "loading" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Phone className="mr-1 h-3 w-3" />}Contact opponent
    </Button>;
  }
  if (state === "error") return <p className="text-xs text-destructive">{err}</p>;
  const fb = fallback ?? "Use your tournament's WhatsApp group or ask the organiser to put you in touch.";
  if (rows.length === 0) return <p className="text-xs text-muted-foreground">Contact details are only available for your own games that haven't been played yet.</p>;
  return <div className="space-y-1 text-xs" onClick={(e) => e.stopPropagation()}>
    {rows.map((r) => r.phone ? (
      <div key={r.member_id} className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{r.name || "Opponent"}{r.is_guardian ? ` — parent/guardian${r.guardian_name ? `: ${r.guardian_name}` : ""}` : ""}</span>
        <a className="text-primary underline" href={phoneLinks(r.phone).tel}>{r.phone}</a>
        <a className="inline-flex items-center gap-0.5 text-primary underline" href={phoneLinks(r.phone).whatsapp} target="_blank" rel="noreferrer"><MessageCircle className="h-3 w-3" />WhatsApp</a>
      </div>
    ) : (
      <p key={r.member_id} className="text-muted-foreground">{r.name || "Your opponent"} hasn't chosen to share a number. {fb}</p>
    ))}
  </div>;
}
