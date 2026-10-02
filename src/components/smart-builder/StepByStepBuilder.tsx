import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Check, ChevronLeft, ChevronRight, Lock, Pencil, Plus, Trash2, Trophy, CalendarDays, Users, Tags, MapPin, UserPlus, ShieldCheck, Mail, Lightbulb, MessageSquare, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

/**
 * Step by Step (Version 1): guided capture of organiser constraints only.
 * Picked players, eligibility and invite choices are captured here but nothing is sent or created.
 * No formats, pools, play-offs or scheduling here — answers are kept locally
 * per club so a future "Help me choose the format" step can read them.
 */
type Kind = "once_off" | "period" | null;
type PlayType = "singles" | "doubles" | "both" | null;
type TimeWindow = { from: string; to: string };
type DayAvail = { date: string; venue: string; courts: string; courtIds?: string[]; windows: TimeWindow[] };
export type StepAnswers = {
  kind: Kind;
  entries: string;
  playType: PlayType;
  categories: string[];
  /** Optional subcategories per category name; missing/empty = no subcategories. */
  subcats: Record<string, string[]>;
  days: DayAvail[];
  /** How players get in: organiser picks, self-entry, or both. */
  source: Source;
  /** Per category/subcategory ("Cat" or "Cat::Sub") eligibility + placement. */
  elig: Record<string, Elig>;
  /** Organiser-selected players → category/subcategory key ("" = not placed yet). */
  picks: Record<string, string>;
  invite: Invite;
  /** Discipline per unit key ("Cat" or "Cat::Sub"). Inherited from playType unless it is "both". */
  disc: Record<string, Disc>;
  /** Invitation message setup only — nothing is sent from this builder. */
  msg: MsgCfg;
  /** Doubles partner rule per doubles unit key. */
  partner: Record<string, Partner>;
  /** Whether one player may register their partner (where players choose partners). */
  doublesEntry: boolean | null;
  fee: FeeCfg;
};
type Partner = "players" | "admin" | "later";
const PARTNER_LABEL: Record<Partner, string> = { players: "Players choose their own partner", admin: "Administrator assigns partners", later: "Decide later" };
type FeeCfg = { has: boolean | null; amount: string; varies: boolean; perUnit: Record<string, string>; doublesBasis: "player" | "pair"; doublesCover: boolean | null };
const DEFAULT_FEE: FeeCfg = { has: null, amount: "", varies: false, perUnit: {}, doublesBasis: "player", doublesCover: null };
const entryRule = (value: boolean | null) => value === null ? "Decide later" : value ? "A player may enter both partners" : "Each player registers themselves";
const paymentRule = (value: boolean | null) => value === null ? "Decide later" : value ? "A player may choose to pay for both partners" : "Each player pays their own fee";
type Channel = "in_app" | "email" | "whatsapp" | "sms";
type MsgCfg = { channels: Channel[]; body: string | null; later: boolean };
const CHANNEL_LABEL: Record<Channel, string> = { in_app: "In-app", email: "Email", whatsapp: "WhatsApp", sms: "SMS" };
const DEFAULT_MSG: MsgCfg = { channels: ["in_app", "email"], body: null, later: false };
type Disc = "singles" | "doubles";
type Source = "select" | "self" | "both" | null;
type Elig = { mode: "everyone" | "leagues" | "manual"; leagueIds: string[]; placement: "auto" | "choose" };
type Invite = "all_eligible" | "leagues" | "selected" | "later" | null;
const DEFAULT_ELIG: Elig = { mode: "everyone", leagueIds: [], placement: "choose" };

const EMPTY: StepAnswers = { kind: null, entries: "", playType: null, categories: [""], subcats: {}, days: [], source: null, elig: {}, picks: {}, invite: null, disc: {}, msg: DEFAULT_MSG, partner: {}, doublesEntry: null, fee: DEFAULT_FEE };
type StepKey = "Type" | "Entries" | "What" | "Categories" | "Subcategories" | "Partners" | "Players" | "Eligibility" | "Pick" | "Invites" | "Messaging" | "Fees" | "Dates" | "Courts" | "Summary";
const STEP_LABEL: Record<StepKey, string> = { Type: "Type", Entries: "Entries", What: "What", Categories: "Categories", Subcategories: "Subcategories", Partners: "Doubles partners", Players: "How players join", Eligibility: "Who may enter", Pick: "Pick players", Invites: "Invitations", Messaging: "Messaging", Fees: "Fees & Payment", Dates: "Dates", Courts: "Courts", Summary: "Summary" };
const SOURCE_LABEL: Record<Exclude<Source, null>, string> = { select: "I will select the players", self: "Players enter themselves", both: "Both — some picked, others enter" };
const INVITE_LABEL: Record<Exclude<Invite, null>, string> = { all_eligible: "All eligible members", leagues: "Players in the chosen leagues", selected: "Selected eligible members", later: "Decide / send later" };

const PLAY_LABEL: Record<Exclude<PlayType, null>, string> = { singles: "Singles", doubles: "Doubles", both: "Both" };

const fmtDay = (d: string) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) : "No date";

export function StepByStepBuilder({ clubId, clubName }: { clubId: string; clubName?: string }) {
  const key = `sh.stepbuilder.${clubId}`;
  const [a, setA] = useState<StepAnswers>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "{}") as Partial<StepAnswers> & { fee?: Partial<FeeCfg> & { doublesPay?: string } };
      const legacy = saved.fee?.doublesPay;
      const doublesEntry = saved.doublesEntry !== undefined ? saved.doublesEntry : legacy === "later" || !legacy ? null : legacy !== "separate";
      const doublesCover = saved.fee?.doublesCover !== undefined ? saved.fee.doublesCover : legacy === "later" || !legacy ? null : legacy === "one_pays";
      const { doublesPay: _oldRule, ...savedFee } = saved.fee ?? {};
      return { ...EMPTY, ...saved, doublesEntry, fee: { ...DEFAULT_FEE, ...savedFee, doublesCover } };
    } catch { return EMPTY; }
  });
  const [step, setStep] = useState(0);
  useEffect(() => { localStorage.setItem(key, JSON.stringify(a)); }, [a, key]);
  const [clubCourts, setClubCourts] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    supabase.from("courts").select("id, name").eq("club_id", clubId).eq("is_external", false).order("name")
      .then(({ data }) => setClubCourts((data ?? []).map((c) => ({ id: String(c.id), name: c.name }))));
  }, [clubId]);
  const courtNames = (d: DayAvail) => clubCourts.filter((c) => d.courtIds?.includes(c.id)).map((c) => c.name).join(", ");

  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [leagues, setLeagues] = useState<{ id: string; name: string }[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  useEffect(() => {
    // Fetch every page: the backend caps each request at 1000 rows, so a single .limit() silently truncates.
    let cancelled = false;
    (async () => {
      const PAGE = 1000; const all: { id: string; name: string }[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase.from("club_members").select("id, name").eq("club_id", clubId).eq("status", "active").neq("role", "visitor")
          .order("name").order("id").range(from, from + PAGE - 1);
        if (error || !data) break;
        all.push(...(data as any[]).map((m) => ({ id: String(m.id), name: m.name || "Member" })));
        if (data.length < PAGE) break;
      }
      if (!cancelled) setMembers(all);
    })();
    supabase.from("leagues").select("id, name").eq("club_id", clubId).is("archived_at", null).order("name")
      .then(({ data }) => setLeagues(((data ?? []) as any[]).map((l) => ({ id: String(l.id), name: l.name }))));
    return () => { cancelled = true; };
  }, [clubId]);

  const [phoneCh, setPhoneCh] = useState<{ whatsapp: boolean; sms: boolean }>({ whatsapp: false, sms: false });
  useEffect(() => {
    supabase.from("clubs").select("whatsapp_enabled, sms_enabled").eq("id", clubId).maybeSingle()
      .then(({ data }) => setPhoneCh({ whatsapp: !!(data as any)?.whatsapp_enabled, sms: !!(data as any)?.sms_enabled }));
  }, [clubId]);
  const chAvail = (c: Channel) => c === "in_app" || c === "email" || phoneCh[c];
  const msg: MsgCfg = { ...DEFAULT_MSG, ...(a.msg ?? {}) };
  const setMsg = (p: Partial<MsgCfg>) => setA({ ...a, msg: { ...msg, ...p } });

  const cats = a.categories.map((c) => c.trim()).filter(Boolean);
  /** Every place a player can end up: a subcategory, or the category itself when it has none. */
  const units = cats.flatMap((c) => {
    const subs = (a.subcats[c] ?? []).map((x) => x.trim()).filter(Boolean);
    return subs.length ? subs.map((x) => ({ key: `${c}::${x}`, base: `${c} › ${x}` })) : [{ key: c, base: c }];
  }).map((u) => {
    const d: Disc | null = a.playType === "singles" || a.playType === "doubles" ? a.playType : (a.disc[u.key] ?? null);
    return { ...u, disc: d, label: `${u.base} · ${d ? PLAY_LABEL[d] : "Singles or Doubles?"}` };
  });
  const setDisc = (k: string, d: Disc) => setA({ ...a, disc: { ...a.disc, [k]: d } });
  const setPlayType = (p: Exclude<PlayType, null>) => {
    if (p === "both") { setA({ ...a, playType: p }); return; }
    const disc: Record<string, Disc> = {};
    units.forEach((u) => { disc[u.key] = p; });
    setA({ ...a, playType: p, disc });
  };
  const dblUnits = units.filter((u) => u.disc === "doubles");
  const partnerOf = (k: string): Partner | null => a.partner?.[k] ?? null;
  const fee: FeeCfg = { ...DEFAULT_FEE, ...(a.fee ?? {}) };
  const setFee = (p: Partial<FeeCfg>) => setA({ ...a, fee: { ...fee, ...p } });
  const feeFor = (k: string) => (fee.varies ? fee.perUnit[k] ?? "" : fee.amount);
  const feeUnitText = (u: { key: string; disc: Disc | null }) => `R${feeFor(u.key) || "?"} ${u.disc === "doubles" && fee.doublesBasis === "pair" ? "per pair" : "per player"}`;
  const feeSummary = fee.has === null ? "Not chosen" : !fee.has ? "No entry fee" : fee.varies ? "Varies by category" : `R${fee.amount || "?"}`;
  const discOk = units.every((u) => u.disc !== null);
  const unitLabel = (k: string) => units.find((u) => u.key === k)?.label ?? "Not placed yet";
  const eligOf = (k: string): Elig => a.elig[k] ?? DEFAULT_ELIG;
  const setElig = (k: string, p: Partial<Elig>) => setA({ ...a, elig: { ...a.elig, [k]: { ...eligOf(k), ...p } } });
  const leagueName = (id: string) => leagues.find((l) => l.id === id)?.name ?? "League";
  const memberName = (id: string) => members.find((m) => m.id === id)?.name ?? "Member";
  const pickIds = Object.keys(a.picks);
  const anyManual = units.some((u) => eligOf(u.key).mode === "manual");
  const selfEntry = a.source === "self" || a.source === "both";
  const showPick = a.source === "select" || a.source === "both" || anyManual;

  const defaultMsg = [
    "Hi {{first_name}},",
    "You are invited to enter {{tournament_name}} at {{club_name}}.",
    "You can enter: {{categories}}.",
    "Enter here: {{entry_link}}",
    "Entries close: {{closing_date}}",
    "Tournament days: {{dates}}",
  ].join("\n\n");
  const msgBody = msg.body ?? defaultMsg;
  const previewVars: Record<string, string> = {
    first_name: "Jane",
    tournament_name: "your tournament (name added when created)",
    club_name: clubName || "your club",
    categories: units.map((u) => u.label).join(", ") || "categories still to be set",
    entry_link: "[entry link added when the tournament is created]",
    closing_date: "[set later]",
    dates: a.days.filter((d) => d.date).map((d) => fmtDay(d.date)).join(", ") || "[set in the Dates step]",
  };
  const preview = msgBody.replace(/{{\s*([a-z_]+)\s*}}/g, (m, k) => previewVars[k] ?? m);
  const steps: StepKey[] = ["Type", "Entries", "What", "Categories", "Subcategories", ...(dblUnits.length ? ["Partners" as const] : []), "Players", "Eligibility",
    ...(showPick ? ["Pick" as const] : []), ...(selfEntry ? ["Invites" as const, "Messaging" as const] : []), "Fees", "Dates", "Courts", "Summary"];
  const cur = steps[Math.min(step, steps.length - 1)];
  const go = (k: StepKey) => { const i = steps.indexOf(k); if (i >= 0) setStep(i); };

  const entriesOk = Number(a.entries) > 0 && Number.isFinite(Number(a.entries));
  const playOk = a.playType !== null;
  const daysOk = a.days.length > 0 && a.days.every((d) => d.date);
  const courtsOk = a.days.every((d) => d.venue.trim() && Number(d.courts) > 0 && d.windows.length > 0 && d.windows.every((w) => w.from && w.to && w.from < w.to));
  const eligOk = units.every((u) => { const e = eligOf(u.key); return e.mode !== "leagues" || e.leagueIds.length > 0; });
  const pickOk = a.source === "select" ? pickIds.length > 0 : true;
  const okFor: Record<StepKey, boolean> = { Type: a.kind === "once_off", Entries: entriesOk, What: playOk, Categories: cats.length > 0, Subcategories: discOk, Partners: dblUnits.every((u) => partnerOf(u.key) !== null),
    Players: a.source !== null, Eligibility: eligOk, Pick: pickOk, Invites: a.invite !== null, Messaging: msg.later || a.invite === "later" || (msg.channels.some(chAvail) && !!msgBody.trim()), Fees: fee.has === false || (fee.has === true && units.every((u) => Number(feeFor(u.key)) >= 0 && feeFor(u.key) !== "")), Dates: daysOk, Courts: courtsOk, Summary: false };
  const canNext = okFor[cur];
  const reached = useMemo(() => {
    let i = 0; while (i < steps.length - 1 && okFor[steps[i]]) i++; return i;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(okFor), steps.join()]);

  /** Exact field when the organiser picked everyone; otherwise the estimate (provisional). */
  const knownField = a.source === "select" && pickIds.length > 0;
  const fieldCount = knownField ? pickIds.length : Number(a.entries) || 0;
  const courtHours = a.days.reduce((t, d) => t + (Number(d.courts) || 0) * d.windows.reduce((h, w) => {
    if (!w.from || !w.to || w.from >= w.to) return h;
    const [fh, fm] = w.from.split(":").map(Number); const [th, tm] = w.to.split(":").map(Number);
    return h + (th * 60 + tm - fh * 60 - fm) / 60;
  }, 0), 0);
  const tipReady = fieldCount > 0 && cats.length > 0 && daysOk && courtsOk;

  const discText = (k: string) => { const d = units.find((u) => u.key === k)?.disc; return d ? PLAY_LABEL[d] : "?"; };
  const eligText = (k: string) => {
    const e = eligOf(k);
    const who = e.mode === "everyone" ? "Everyone" : e.mode === "leagues" ? (e.leagueIds.map(leagueName).join(" + ") || "Leagues not chosen") : "Players I pick";
    return e.mode !== "manual" && selfEntry ? `${who} · ${e.placement === "auto" ? "placed automatically" : "choose when entering"}` : who;
  };

  const setSubcats = (cat: string, names: string[] | null) => {
    const next = { ...a.subcats };
    if (names === null) delete next[cat]; else next[cat] = names;
    setA({ ...a, subcats: next });
  };

  const setDays = (days: DayAvail[]) => setA({ ...a, days });
  const updDay = (i: number, p: Partial<DayAvail>) => setDays(a.days.map((d, j) => (j === i ? { ...d, ...p } : d)));
  const addDay = () => {
    const prev = a.days[a.days.length - 1];
    let date = "";
    if (prev?.date) { const n = new Date(prev.date + "T00:00:00"); n.setDate(n.getDate() + 1); date = n.toISOString().slice(0, 10); }
    setDays([...a.days, { date, venue: prev?.venue ?? clubName ?? "", courts: prev?.courts ?? "", windows: [{ from: "", to: "" }] }]);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="space-y-4">
        {/* progress */}
        <ol className="flex flex-wrap gap-1.5">
          {steps.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                disabled={i > reached}
                onClick={() => setStep(i)}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs",
                  i === step ? "border-primary bg-primary text-primary-foreground" : i < reached ? "border-primary/50 text-foreground" : "border-border text-muted-foreground",
                  i > reached && "opacity-50",
                )}
              >
                {i < reached && i !== step ? <Check className="h-3 w-3" /> : <span>{i + 1}</span>} {STEP_LABEL[s]}
              </button>
            </li>
          ))}
        </ol>

        <Card><CardContent className="space-y-4 p-5">
          {cur === "Type" && (
            <>
              <Q t="What type of tournament is this?" h="Pick the one that sounds most like your event." />
              <div className="grid gap-3 sm:grid-cols-2">
                <Choice active={a.kind === "once_off"} onClick={() => setA({ ...a, kind: "once_off" })} title="Once-off / weekend tournament" desc="Played over one day or a few days in a row." />
                <Choice active={a.kind === "period"} onClick={() => setA({ ...a, kind: "period" })} title="Over a period / Club Champs" desc="Games spread over weeks, e.g. club championships." />
              </div>
              {a.kind === "period" && (
                <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                  Club Champs guided setup — coming next. For now, use the Current builder for this kind of event.
                </div>
              )}
            </>
          )}

          {cur === "Entries" && (
            <>
              <Q t="How many entries do you expect?" h="A rough guess is fine — you can change it later." />
              <div className="max-w-[200px] space-y-1">
                <Label htmlFor="sbs-entries">About how many players or pairs?</Label>
                <Input id="sbs-entries" type="number" min={1} inputMode="numeric" value={a.entries} onChange={(e) => setA({ ...a, entries: e.target.value })} placeholder="e.g. 32" />
              </div>
            </>
          )}

          {cur === "What" && (
            <>
              <Q t="What will be played?" h="Just the basic fact for now — we won't ask how it fits together yet." />
              <div className="grid gap-3 sm:grid-cols-3">
                {(["singles", "doubles", "both"] as const).map((p) => (
                  <Choice key={p} active={a.playType === p} onClick={() => setPlayType(p)} title={PLAY_LABEL[p]} desc={p === "both" ? "Singles and doubles at the same event." : p === "singles" ? "One player per side." : "Two players per side."} />
                ))}
              </div>
            </>
          )}

          {cur === "Categories" && (
            <>
              <Q t="What categories will you have?" h="Give each category any name you like, for example Men's, Ladies, Open or Men's A." />
              <div className="space-y-2">
                {a.categories.map((c, i) => (
                  <div key={i} className="flex gap-2">
                    <Input aria-label={`Category ${i + 1}`} value={c} placeholder={`Category ${i + 1}`} onChange={(e) => setA({ ...a, categories: a.categories.map((x, j) => (j === i ? e.target.value : x)) })} />
                    <Button variant="ghost" size="icon" aria-label="Remove category" disabled={a.categories.length === 1} onClick={() => setA({ ...a, categories: a.categories.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setA({ ...a, categories: [...a.categories, ""] })}><Plus className="mr-1 h-4 w-4" />Add category</Button>
              </div>
            </>
          )}

          {cur === "Subcategories" && (
            <>
              <Q t="Do any categories need subcategories?" h="Optional — e.g. Men's could be split into Group A, Group B, Group C. Ladies can stay as one group." />
              {a.playType === "both" && <p className="text-xs text-muted-foreground">You chose Both — pick Singles or Doubles for each category, or for each subcategory if it's split. Singles and doubles entries are always kept apart.</p>}
              <div className="space-y-3">
                {cats.map((cat) => {
                  const subs = a.subcats[cat];
                  const has = subs !== undefined;
                  return (
                    <div key={cat} className="space-y-2 rounded-lg border border-border p-3">
                      <div className="text-sm font-semibold">{cat}</div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" aria-pressed={!has} onClick={() => setSubcats(cat, null)}
                          className={cn("rounded-full border px-3 py-1 text-xs", !has ? "border-primary bg-primary/10" : "border-border text-muted-foreground")}>
                          No subcategories
                        </button>
                        <button type="button" aria-pressed={has} onClick={() => setSubcats(cat, has ? subs : ["A", "B"])}
                          className={cn("rounded-full border px-3 py-1 text-xs", has ? "border-primary bg-primary/10" : "border-border text-muted-foreground")}>
                          Add subcategories
                        </button>
                      </div>
                      {a.playType === "both" && !has && <DiscPick value={a.disc[cat]} onChange={(d) => setDisc(cat, d)} />}
                      {a.playType !== "both" && a.playType && <div className="text-xs text-muted-foreground">{has ? "All groups play" : "Plays"} {PLAY_LABEL[a.playType]} (from "What will be played")</div>}
                      {has && (
                        <div className="space-y-2">
                          {subs.map((s, i) => (
                            <div key={i} className="flex flex-wrap items-center gap-2">
                              <Input aria-label={`${cat} subcategory ${i + 1}`} value={s} placeholder={`e.g. Group ${String.fromCharCode(65 + i)}`}
                                className="max-w-[220px]" onChange={(e) => setSubcats(cat, subs.map((x, j) => (j === i ? e.target.value : x)))} />
                              {a.playType === "both" && s.trim() && <DiscPick value={a.disc[`${cat}::${s.trim()}`]} onChange={(d) => setDisc(`${cat}::${s.trim()}`, d)} />}
                              <Button variant="ghost" size="icon" aria-label="Remove subcategory" disabled={subs.length === 1}
                                onClick={() => setSubcats(cat, subs.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          ))}
                          <Button variant="outline" size="sm" onClick={() => setSubcats(cat, [...subs, ""])}><Plus className="mr-1 h-4 w-4" />Add another</Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {cur === "Players" && (
            <>
              <Q t="How will players be added?" h="This decides what we ask next." />
              <div className="grid gap-3 sm:grid-cols-3">
                <Choice active={a.source === "select"} onClick={() => setA({ ...a, source: "select" })} title={SOURCE_LABEL.select} desc="You already know who is playing. You'll pick them from your members." />
                <Choice active={a.source === "self"} onClick={() => setA({ ...a, source: "self" })} title={SOURCE_LABEL.self} desc="Eligible members enter on their own. The field is only known once entries close." />
                <Choice active={a.source === "both"} onClick={() => setA({ ...a, source: "both" })} title="Both" desc="Pick some players now and let other eligible members enter too." />
              </div>
            </>
          )}

          {cur === "Eligibility" && (
            <>
              <Q t="Who may enter each category?" h="Keep it simple — you can change this later." />
              <div className="space-y-3">
                {units.map((u) => {
                  const e = eligOf(u.key);
                  return (
                    <div key={u.key} className="space-y-2 rounded-lg border border-border p-3">
                      <div className="text-sm font-semibold">{u.label}</div>
                      <div className="flex flex-wrap gap-2">
                        {(["everyone", "leagues", "manual"] as const).map((m) => (
                          <button key={m} type="button" aria-pressed={e.mode === m} onClick={() => setElig(u.key, { mode: m })} className={cn("rounded-full border px-2.5 py-1 text-xs", e.mode === m ? "border-primary bg-primary/10" : "border-border text-muted-foreground")}>
                            {m === "everyone" ? "Everyone" : m === "leagues" ? "Specific league(s)" : "Players I pick"}
                          </button>
                        ))}
                      </div>
                      {e.mode === "leagues" && (leagues.length === 0
                        ? <p className="text-xs text-muted-foreground">Your club has no leagues set up yet. Choose another option.</p>
                        : <div className="flex flex-wrap gap-1.5">{leagues.map((l) => {
                            const on = e.leagueIds.includes(l.id);
                            return <button key={l.id} type="button" aria-pressed={on} onClick={() => setElig(u.key, { leagueIds: on ? e.leagueIds.filter((x) => x !== l.id) : [...e.leagueIds, l.id] })} className={cn("rounded-full border px-2.5 py-1 text-xs", on ? "border-primary bg-primary/10" : "border-border text-muted-foreground")}>{l.name}</button>;
                          })}</div>)}
                      {e.mode !== "manual" && selfEntry && (
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">Players who may enter:</div>
                          <div className="flex flex-wrap gap-2">
                            <button type="button" aria-pressed={e.placement === "auto"} onClick={() => setElig(u.key, { placement: "auto" })} className={cn("rounded-full border px-2.5 py-1 text-xs", e.placement === "auto" ? "border-primary bg-primary/10" : "border-border text-muted-foreground")}>Are put in here automatically</button>
                            <button type="button" aria-pressed={e.placement === "choose"} onClick={() => setElig(u.key, { placement: "choose" })} className={cn("rounded-full border px-2.5 py-1 text-xs", e.placement === "choose" ? "border-primary bg-primary/10" : "border-border text-muted-foreground")}>Choose this when they enter</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {cur === "Pick" && (
            <>
              <Q t="Pick your players" h="Tap a member to add them, then choose where each one plays." />
              {knownField && <div className="rounded-lg border border-primary/40 bg-primary/10 p-2 text-xs">You've picked {pickIds.length} player{pickIds.length === 1 ? "" : "s"}. Because the field is known, SquashHub will plan with this exact number instead of your estimate.</div>}
              {a.source === "both" && <div className="text-xs text-muted-foreground">Other eligible members can still enter themselves, so the total stays provisional until entries close.</div>}
              {units.some((u) => u.disc === "doubles") && <div className="text-xs text-muted-foreground">Doubles groups take players who will be paired up — partners are matched later. A player placed in a Singles group is not counted as a doubles entry.</div>}
              <Input placeholder="Search members" value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} />
              {(() => { const q = memberSearch.trim().toLowerCase(); const n = members.filter((m) => !(m.id in a.picks) && m.name.toLowerCase().includes(q)).length;
                return <div className="text-xs text-muted-foreground">{n} of {members.length} members available{q ? " matching your search" : ""}</div>; })()}
              <div className="max-h-72 space-y-1 overflow-auto rounded-lg border border-border p-2">
                {members.filter((m) => !(m.id in a.picks) && m.name.toLowerCase().includes(memberSearch.trim().toLowerCase())).map((m) => (
                  <button key={m.id} type="button" className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-muted"
                    onClick={() => setA({ ...a, picks: { ...a.picks, [m.id]: units.length === 1 ? units[0].key : "" } })}>
                    {m.name}<Plus className="h-3 w-3" />
                  </button>
                ))}
                {members.length === 0 && <div className="text-xs text-muted-foreground">No active members found.</div>}
              </div>
              {pickIds.length > 0 && (
                <div className="space-y-1">
                  <Label>Picked ({pickIds.length})</Label>
                  {pickIds.map((id) => (
                    <div key={id} className="flex items-center gap-2 text-xs">
                      <span className="flex-1">{memberName(id)}</span>
                      <select aria-label={`Place ${memberName(id)}`} className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={a.picks[id]}
                        onChange={(e) => setA({ ...a, picks: { ...a.picks, [id]: e.target.value } })}>
                        <option value="">Not placed yet</option>
                        {units.map((u) => <option key={u.key} value={u.key}>{u.label}</option>)}
                      </select>
                      <Button variant="ghost" size="icon" aria-label="Remove player" onClick={() => { const n = { ...a.picks }; delete n[id]; setA({ ...a, picks: n }); }}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {cur === "Invites" && (
            <>
              <Q t="Who should be invited to enter?" h="Nothing is sent now — this only records your choice." />
              <div className="grid gap-3 sm:grid-cols-2">
                <Choice active={a.invite === "all_eligible"} onClick={() => setA({ ...a, invite: "all_eligible" })} title={INVITE_LABEL.all_eligible} desc="Everyone allowed into at least one category." />
                {units.some((u) => eligOf(u.key).mode === "leagues") && <Choice active={a.invite === "leagues"} onClick={() => setA({ ...a, invite: "leagues" })} title={INVITE_LABEL.leagues} desc="Only members of the leagues you chose above." />}
                <Choice active={a.invite === "selected"} onClick={() => setA({ ...a, invite: "selected" })} title={INVITE_LABEL.selected} desc="You'll choose individual members when sending." />
                <Choice active={a.invite === "later"} onClick={() => setA({ ...a, invite: "later" })} title={INVITE_LABEL.later} desc="Skip for now and decide when the tournament is created." />
              </div>
            </>
          )}

          {cur === "Messaging" && (
            <>
              <Q t="How should the invitation read?" h="Setup only — nothing is sent from here. Sending and test messages come later." />
              {(a.invite === "later" || msg.later) ? (
                <div className="space-y-2 rounded-md border p-3 text-sm">
                  <p>{a.invite === "later" ? "You chose to decide invitations later, so the message can be set up later too." : "You'll set up the message later."}</p>
                  <Button variant="outline" size="sm" onClick={() => setMsg({ later: false })}>Set it up now anyway</Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground">Goes to: <b>{a.invite ? INVITE_LABEL[a.invite] : "the invitation audience"}</b>. Players you already picked are entered and don't need an invitation.</p>
                  <div>
                    <Label className="text-sm">Channels</Label>
                    <div className="mt-2 grid gap-2 sm:grid-cols-4">
                      {(Object.keys(CHANNEL_LABEL) as Channel[]).map((c) => {
                        const ok = chAvail(c); const on = ok && msg.channels.includes(c);
                        return (
                          <button key={c} type="button" disabled={!ok}
                            onClick={() => setMsg({ channels: on ? msg.channels.filter((x) => x !== c) : [...msg.channels, c] })}
                            className={cn("rounded-md border p-2 text-left text-sm", on && "border-primary bg-primary/10", !ok && "cursor-not-allowed opacity-50")}>
                            <span className="flex items-center gap-1 font-medium">{on && <Check className="h-3.5 w-3.5" />}{!ok && <Lock className="h-3.5 w-3.5" />}{CHANNEL_LABEL[c]}</span>
                            {!ok && <span className="block text-[11px] text-muted-foreground">Not switched on for this club (Member messaging)</span>}
                          </button>
                        );
                      })}
                    </div>
                    {!msg.channels.some(chAvail) && <p className="mt-1 text-xs text-destructive">Choose at least one channel.</p>}
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm" htmlFor="sbs-msg">Message</Label>
                      {msg.body !== null && <Button variant="ghost" size="sm" onClick={() => setMsg({ body: null })}>Reset to suggested wording</Button>}
                    </div>
                    <textarea id="sbs-msg" rows={9} className="mt-1 w-full rounded-md border bg-background p-2 text-sm" value={msgBody} onChange={(e) => setMsg({ body: e.target.value })} />
                    <p className="text-[11px] text-muted-foreground">Words in {"{{ }}"} fill in automatically: first_name, tournament_name, club_name, categories, entry_link, closing_date, dates. They update as you add details later.</p>
                  </div>
                  <div>
                    <Label className="text-sm">Preview (example member)</Label>
                    <div className="mt-1 whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm">{preview}</div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setMsg({ later: true })}>Configure later</Button>
                </div>
              )}
            </>
          )}

          {cur === "Partners" && (
            <>
              <Q t="How will doubles partners be chosen?" h="Set this for each doubles group — they can differ. Decide later never blocks you." />
              <div className="space-y-3">
                {dblUnits.map((u) => (
                  <div key={u.key} className="rounded-md border p-3">
                    <p className="mb-2 text-sm font-medium">{u.base}</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {(Object.keys(PARTNER_LABEL) as Partner[]).map((p) => (
                        <Choice key={p} active={partnerOf(u.key) === p} onClick={() => setA({ ...a, partner: { ...(a.partner ?? {}), [u.key]: p } })} title={PARTNER_LABEL[p]}
                          desc={p === "players" ? "When entering, a player names their partner." : p === "admin" ? "Players enter on their own; you pair them up later." : "Choose before entries open."} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 border-t pt-4">
                <DoublesToggle label="A player may enter both partners" description="When players choose partners, one player can enter the pair. Otherwise, each player registers themselves." value={a.doublesEntry ?? null} onChange={(value) => setA({ ...a, doublesEntry: value })} />
              </div>
            </>
          )}

          {cur === "Fees" && (
            <>
              <Q t="Is there an entry fee?" h="Setup only — no payments are taken from here." />
              <div className="grid gap-3 sm:grid-cols-2">
                <Choice active={fee.has === true} onClick={() => setFee({ has: true })} title="Yes" desc="Players pay to enter." />
                <Choice active={fee.has === false} onClick={() => setFee({ has: false })} title="No" desc="Free to enter." />
              </div>
              {fee.has && (
                <div className="mt-4 space-y-4">
                  {dblUnits.length > 0 && (
                    <div>
                      <Label className="text-sm">For doubles, is the fee per player or per pair?</Label>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <Choice active={fee.doublesBasis === "player"} onClick={() => setFee({ doublesBasis: "player" })} title="Per player" desc="Each partner's fee." />
                        <Choice active={fee.doublesBasis === "pair"} onClick={() => setFee({ doublesBasis: "pair" })} title="Per pair" desc="One fee for the two of them." />
                      </div>
                    </div>
                  )}
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={fee.varies} onChange={(e) => setFee({ varies: e.target.checked })} /> Different fee for different categories
                  </label>
                  {!fee.varies ? (
                    <div className="flex items-center gap-2"><span className="text-sm">R</span><Input type="number" min={0} className="max-w-[140px]" aria-label="Entry fee" value={fee.amount} onChange={(e) => setFee({ amount: e.target.value })} /></div>
                  ) : (
                    <div className="space-y-2">{units.map((u) => (
                      <div key={u.key} className="flex items-center gap-2">
                        <span className="w-56 truncate text-sm">{u.label}</span><span className="text-sm">R</span>
                        <Input type="number" min={0} className="max-w-[120px]" aria-label={`Fee for ${u.base}`} value={fee.perUnit[u.key] ?? ""} onChange={(e) => setFee({ perUnit: { ...fee.perUnit, [u.key]: e.target.value } })} />
                        <span className="text-xs text-muted-foreground">{u.disc === "doubles" && fee.doublesBasis === "pair" ? "per pair" : "per player"}</span>
                      </div>
                    ))}</div>
                  )}
                  {dblUnits.length > 0 && <DoublesToggle label="A player may pay for both partners" description="If allowed, a player can choose to pay for both. Otherwise, each player pays their own fee. This does not change who registers the pair." value={fee.doublesCover} onChange={(value) => setFee({ doublesCover: value })} />}
                </div>
              )}
            </>
          )}

          {cur === "Dates" && (
            <>
              <Q t="On which days will it be played?" h="Add one line for each tournament day." />
              <div className="space-y-2">
                {a.days.map((d, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input type="date" aria-label={`Day ${i + 1}`} className="max-w-[200px]" value={d.date} onChange={(e) => updDay(i, { date: e.target.value })} />
                    <span className="text-xs text-muted-foreground">{d.date && fmtDay(d.date)}</span>
                    <Button variant="ghost" size="icon" aria-label="Remove day" onClick={() => setDays(a.days.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addDay}><Plus className="mr-1 h-4 w-4" />{a.days.length ? "Add another day" : "Add a day"}</Button>
              </div>
            </>
          )}

          {cur === "Courts" && (
            <>
              <Q t="Where and when are courts available?" h="Each day can be different — e.g. Friday evening only, Saturday all day." />
              <div className="space-y-3">
                {a.days.map((d, i) => (
                  <div key={i} className="space-y-2 rounded-lg border border-border p-3">
                    <div className="text-sm font-semibold">{fmtDay(d.date)}</div>
                    <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
                      <div className="space-y-1"><Label>Venue / club</Label><Input value={d.venue} onChange={(e) => updDay(i, { venue: e.target.value })} placeholder="e.g. Riverside Squash Club" /></div>
                      <div className="space-y-1"><Label>Courts</Label><Input type="number" min={1} value={d.courts} onChange={(e) => updDay(i, { courts: e.target.value })} placeholder="e.g. 4" /></div>
                    </div>
                    {clubCourts.length > 0 && (
                      <div className="space-y-1">
                        <Label>Which of your club's courts? (optional)</Label>
                        <div className="flex flex-wrap gap-1.5">
                          {clubCourts.map((c) => {
                            const on = d.courtIds?.includes(c.id);
                            return (
                              <button key={c.id} type="button" aria-pressed={!!on}
                                onClick={() => { const ids = on ? (d.courtIds ?? []).filter((x) => x !== c.id) : [...(d.courtIds ?? []), c.id]; updDay(i, { courtIds: ids, courts: ids.length ? String(ids.length) : d.courts }); }}
                                className={cn("rounded-full border px-2.5 py-1 text-xs", on ? "border-primary bg-primary/10" : "border-border text-muted-foreground")}>
                                {c.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <Label>Times courts are free</Label>
                    {d.windows.map((w, k) => (
                      <div key={k} className="flex items-center gap-2">
                        <Input type="time" className="max-w-[130px]" aria-label="From" value={w.from} onChange={(e) => updDay(i, { windows: d.windows.map((x, j) => (j === k ? { ...x, from: e.target.value } : x)) })} />
                        <span className="text-xs text-muted-foreground">to</span>
                        <Input type="time" className="max-w-[130px]" aria-label="To" value={w.to} onChange={(e) => updDay(i, { windows: d.windows.map((x, j) => (j === k ? { ...x, to: e.target.value } : x)) })} />
                        <Button variant="ghost" size="icon" aria-label="Remove time" disabled={d.windows.length === 1} onClick={() => updDay(i, { windows: d.windows.filter((_, j) => j !== k) })}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    ))}
                    <Button variant="ghost" size="sm" onClick={() => updDay(i, { windows: [...d.windows, { from: "", to: "" }] })}><Plus className="mr-1 h-4 w-4" />Add another time slot</Button>
                  </div>
                ))}
              </div>
            </>
          )}

          {cur === "Summary" && (
            <>
              <Q t="Here's what we know so far" h="Check it over. Tap Edit on any part to change it." />
              <SummaryRow icon={<Users className="h-4 w-4" />} label={knownField ? "Players" : "Expected entries"} onEdit={() => go(knownField ? "Pick" : "Entries")}>{knownField ? `${pickIds.length} picked (exact)` : `About ${a.entries} (estimate)`}</SummaryRow>
              <SummaryRow icon={<Trophy className="h-4 w-4" />} label="What will be played" onEdit={() => go("What")}>{a.playType ? PLAY_LABEL[a.playType] : "Not chosen"}</SummaryRow>
              <SummaryRow icon={<Tags className="h-4 w-4" />} label="Categories" onEdit={() => go("Categories")}>
                <ul className="space-y-0.5">{cats.map((c, i) => {
                  const subs = (a.subcats[c] ?? []).map((s) => s.trim()).filter(Boolean);
                  return <li key={i}>{c}{subs.length > 0 ? <span className="text-muted-foreground"> — {subs.map((x) => `${x} ${discText(`${c}::${x}`)}`).join(", ")}</span> : <span className="text-muted-foreground"> — {discText(c)}</span>}</li>;
                })}</ul>
              </SummaryRow>
              {dblUnits.length > 0 && <SummaryRow icon={<Users className="h-4 w-4" />} label="Doubles partners" onEdit={() => go("Partners")}>
                <ul className="space-y-0.5">{dblUnits.map((u) => <li key={u.key}>{u.base}: <span className="text-muted-foreground">{partnerOf(u.key) ? PARTNER_LABEL[partnerOf(u.key)!] : "Not chosen"}</span></li>)}<li>Entering: <span className="text-muted-foreground">{entryRule(a.doublesEntry ?? null)}</span></li></ul>
              </SummaryRow>}
              <SummaryRow icon={<UserPlus className="h-4 w-4" />} label="How players join" onEdit={() => go("Players")}>{a.source ? SOURCE_LABEL[a.source] : "Not chosen"}</SummaryRow>
              <SummaryRow icon={<ShieldCheck className="h-4 w-4" />} label="Who may enter" onEdit={() => go("Eligibility")}>
                <ul className="space-y-0.5">{units.map((u) => <li key={u.key}>{u.label}: <span className="text-muted-foreground">{eligText(u.key)}</span></li>)}</ul>
              </SummaryRow>
              {pickIds.length > 0 && <SummaryRow icon={<Users className="h-4 w-4" />} label="Picked players" onEdit={() => go("Pick")}>
                <ul className="space-y-0.5">{pickIds.map((id) => <li key={id}>{memberName(id)} <span className="text-muted-foreground">— {unitLabel(a.picks[id])}</span></li>)}</ul>
              </SummaryRow>}
              {selfEntry && <SummaryRow icon={<Mail className="h-4 w-4" />} label="Invitations" onEdit={() => go("Invites")}>{a.invite ? INVITE_LABEL[a.invite] : "Not chosen"} <span className="text-muted-foreground">· not sent</span></SummaryRow>}
              {selfEntry && <SummaryRow icon={<MessageSquare className="h-4 w-4" />} label="Messaging" onEdit={() => go("Messaging")}>{(a.invite === "later" || msg.later) ? "Configure later" : `${msg.channels.filter(chAvail).map((c) => CHANNEL_LABEL[c]).join(", ") || "No channel"} · ${msg.body === null ? "suggested wording" : "custom wording"}`} <span className="text-muted-foreground">· setup only, not sent</span></SummaryRow>}
              <SummaryRow icon={<Wallet className="h-4 w-4" />} label="Fees & Payment" onEdit={() => go("Fees")}>
                {fee.has ? <ul className="space-y-0.5">{units.map((u) => <li key={u.key}>{u.label}: <span className="text-muted-foreground">{feeUnitText(u)}</span></li>)}
                  {dblUnits.length > 0 && <li>Doubles payment: <span className="text-muted-foreground">{paymentRule(fee.doublesCover)}</span></li>}</ul> : feeSummary}
                <span className="text-muted-foreground"> · setup only, no payments taken</span>
              </SummaryRow>
              <SummaryRow icon={<CalendarDays className="h-4 w-4" />} label="Tournament dates" onEdit={() => go("Dates")}>{a.days.map((d) => fmtDay(d.date)).join(", ")}</SummaryRow>
              <SummaryRow icon={<MapPin className="h-4 w-4" />} label="Venue & courts" onEdit={() => go("Courts")}>
                <ul className="space-y-0.5">{a.days.map((d, i) => (
                  <li key={i}>{fmtDay(d.date)}: {d.venue}, {d.courts} court{Number(d.courts) === 1 ? "" : "s"}{courtNames(d) && ` (${courtNames(d)})`}, {d.windows.map((w) => `${w.from}–${w.to}`).join(" & ")}</li>
                ))}</ul>
              </SummaryRow>
              <div className="rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm font-medium">
                SquashHub now knows your {knownField ? "players" : "expected entries"}, categories, who may enter, dates and available court time.
                {!knownField && <span className="block text-xs font-normal text-muted-foreground">The field is provisional until entries close.</span>}
              </div>
              {tipReady && (
                <div className="rounded-lg border border-accent bg-accent/30 p-3 text-sm">
                  <div className="flex items-center gap-1.5 font-semibold"><Lightbulb className="h-4 w-4 text-primary" />SquashHub Tip <span className="text-xs font-normal text-muted-foreground">(advice only)</span></div>
                  <p className="mt-1">Based on what you've entered so far, a round-robin format may be practical. We'll help you confirm the format in the next steps.</p>
                  <p className="mt-1 text-xs text-muted-foreground">You have about {Math.round(courtHours * 10) / 10} court-hours over {a.days.length} day{a.days.length === 1 ? "" : "s"} for {knownField ? "" : "about "}{fieldCount} {a.playType === "doubles" ? "entries" : "players"} in {units.length} group{units.length === 1 ? "" : "s"}. We haven't worked out how many matches fit yet.</p>
                </div>
              )}
              <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border p-3 opacity-70">
                <div><div className="text-sm font-semibold">Next: Help me choose the format</div><div className="text-xs text-muted-foreground">Coming soon — not available in this version.</div></div>
                <Button size="sm" disabled><Lock className="mr-1 h-4 w-4" />Coming soon</Button>
              </div>
            </>
          )}

          {cur !== "Summary" && (
            <div className="flex justify-between pt-2">
              <Button variant="ghost" size="sm" disabled={step === 0} onClick={() => setStep(step - 1)}><ChevronLeft className="mr-1 h-4 w-4" />Back</Button>
              <Button size="sm" disabled={!canNext} onClick={() => setStep(step + 1)}>Next<ChevronRight className="ml-1 h-4 w-4" /></Button>
            </div>
          )}
        </CardContent></Card>
      </div>

      {/* growing tree */}
      <aside aria-label="Your tournament so far" className="rounded-xl border border-border p-4">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your tournament so far</div>
        <TreeNode icon={<Trophy className="h-4 w-4" />} title={a.kind === "once_off" ? "Once-off / weekend" : a.kind === "period" ? "Club Champs (coming next)" : "Type not chosen"} onClick={() => go("Type")}>
          {a.kind === "once_off" && (
            <>
              {entriesOk && <TreeNode icon={<Users className="h-4 w-4" />} title={`~${a.entries} entries`} onClick={() => go("Entries")} />}
              {playOk && <TreeNode icon={<Trophy className="h-4 w-4" />} title={PLAY_LABEL[a.playType!]} onClick={() => go("What")} />}
              {cats.length > 0 && (
                <TreeNode icon={<Tags className="h-4 w-4" />} title="Categories" onClick={() => go("Categories")}>
                  {cats.map((c, i) => {
                    const subs = (a.subcats[c] ?? []).map((s) => s.trim()).filter(Boolean);
                    return (
                      <TreeLeaf key={i}>
                        <button type="button" onClick={() => go("Subcategories")} className="rounded px-1 hover:bg-muted">{c}{subs.length === 0 && <span className="text-muted-foreground"> · {discText(c)}</span>}</button>
                        {subs.length > 0 && (
                          <div className="ml-3 mt-0.5 space-y-0.5 border-l border-border pl-2">
                            {subs.map((s, j) => <TreeLeaf key={j}>{s} <span className="text-muted-foreground">{discText(`${c}::${s}`)}</span></TreeLeaf>)}
                          </div>
                        )}
                      </TreeLeaf>
                    );
                  })}
                </TreeNode>
              )}
              {a.source && (
                <TreeNode icon={<UserPlus className="h-4 w-4" />} title={a.source === "select" ? `Picked players${pickIds.length ? ` (${pickIds.length})` : ""}` : a.source === "self" ? "Self-entry" : `Picked + self-entry${pickIds.length ? ` (${pickIds.length} picked)` : ""}`} onClick={() => go("Players")}>
                  {units.map((u) => <TreeLeaf key={u.key}><button type="button" onClick={() => go("Eligibility")} className="rounded px-1 hover:bg-muted">{u.label}</button><span className="block pl-1 text-muted-foreground">{eligText(u.key)}</span></TreeLeaf>)}
                  {selfEntry && <TreeLeaf><button type="button" onClick={() => go("Invites")} className="rounded px-1 hover:bg-muted">Invites: {a.invite ? INVITE_LABEL[a.invite] : "not chosen"} (not sent)</button></TreeLeaf>}
                  {selfEntry && <TreeLeaf><button type="button" onClick={() => go("Messaging")} className="rounded px-1 hover:bg-muted">Message: {(a.invite === "later" || msg.later) ? "Configure later" : `${msg.channels.filter(chAvail).map((c) => CHANNEL_LABEL[c]).join(", ") || "No channel"} · ${msg.body === null ? "suggested wording" : "custom wording"}`}</button></TreeLeaf>}
                </TreeNode>
              )}
              {dblUnits.length > 0 && dblUnits.some((u) => partnerOf(u.key)) && (
                <TreeNode icon={<Users className="h-4 w-4" />} title="Doubles partners" onClick={() => go("Partners")}>
                  {dblUnits.map((u) => <TreeLeaf key={u.key}>{u.base}: <span className="text-muted-foreground">{partnerOf(u.key) ? PARTNER_LABEL[partnerOf(u.key)!] : "not chosen"}</span></TreeLeaf>)}
                  <TreeLeaf>Entering: <span className="text-muted-foreground">{entryRule(a.doublesEntry ?? null)}</span></TreeLeaf>
                </TreeNode>
              )}
              {fee.has !== null && (
                <TreeNode icon={<Wallet className="h-4 w-4" />} title={`Fees: ${feeSummary}`} onClick={() => go("Fees")}>
                  {fee.has && units.map((u) => <TreeLeaf key={u.key}>{u.base}: <span className="text-muted-foreground">{feeUnitText(u)}</span></TreeLeaf>)}
                  {fee.has && dblUnits.length > 0 && <TreeLeaf>Doubles payment: <span className="text-muted-foreground">{paymentRule(fee.doublesCover)}</span></TreeLeaf>}
                </TreeNode>
              )}
              {a.days.some((d) => d.date) && (
                <TreeNode icon={<CalendarDays className="h-4 w-4" />} title={`${a.days.length} day${a.days.length === 1 ? "" : "s"}`} onClick={() => go("Dates")}>
                  {a.days.map((d, i) => (
                    <TreeLeaf key={i}>
                      {fmtDay(d.date)}
                      {d.courts && <span className="block text-muted-foreground">{d.venue} · {d.courts} courts {d.windows.filter((w) => w.from && w.to).map((w) => `${w.from}–${w.to}`).join(", ")}</span>}
                    </TreeLeaf>
                  ))}
                </TreeNode>
              )}
            </>
          )}
        </TreeNode>
        {(a.kind || a.entries) && (
          <Button variant="ghost" size="sm" className="mt-3 text-xs" onClick={() => { setA(EMPTY); go("Type"); }}>Start over</Button>
        )}
      </aside>
    </div>
  );
}

function Q({ t, h }: { t: string; h: string }) {
  return <div><h3 className="text-base font-semibold">{t}</h3><p className="text-sm text-muted-foreground">{h}</p></div>;
}
function Choice({ active, onClick, title, desc }: { active: boolean; onClick: () => void; title: string; desc: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={cn("rounded-lg border p-4 text-left transition-colors", active ? "border-primary bg-primary/10" : "border-border hover:border-primary/50")}>
      <div className="text-sm font-semibold">{title}</div><div className="text-xs text-muted-foreground">{desc}</div>
    </button>
  );
}
function DoublesToggle({ label, description, value, onChange }: { label: string; description: string; value: boolean | null; onChange: (value: boolean | null) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <Label htmlFor={label} className="text-sm">{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
        <p className="text-xs font-medium text-foreground">{value === null ? "Decide later" : value ? "Allowed" : "Not allowed"}</p>
        <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => onChange(null)} aria-pressed={value === null}>Decide later</Button>
      </div>
      <Switch id={label} checked={value === true} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}
function SummaryRow({ icon, label, children, onEdit }: { icon: React.ReactNode; label: string; children: React.ReactNode; onEdit: () => void }) {
  return (
    <div className="flex items-start gap-3 border-b border-border pb-2 text-sm">
      <span className="mt-0.5 text-primary">{icon}</span>
      <div className="flex-1"><div className="text-xs text-muted-foreground">{label}</div><div>{children}</div></div>
      <Button variant="ghost" size="sm" onClick={onEdit}><Pencil className="mr-1 h-3 w-3" />Edit</Button>
    </div>
  );
}
function TreeNode({ icon, title, children, onClick }: { icon: React.ReactNode; title: string; children?: React.ReactNode; onClick: () => void }) {
  return (
    <div className="text-sm">
      <button type="button" onClick={onClick} className="flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-muted">
        <span className="text-primary">{icon}</span>{title}
      </button>
      {children && <div className="ml-3 mt-1 space-y-1 border-l border-border pl-3">{children}</div>}
    </div>
  );
}
function TreeLeaf({ children }: { children: React.ReactNode }) {
  return <div className="text-xs">{children}</div>;
}

function DiscPick({ value, onChange }: { value?: Disc; onChange: (d: Disc) => void }) {
  return (
    <div className="flex gap-1.5" role="group" aria-label="Singles or Doubles">
      {(["singles", "doubles"] as const).map((d) => (
        <button key={d} type="button" aria-pressed={value === d} onClick={() => onChange(d)}
          className={cn("rounded-full border px-2.5 py-1 text-xs", value === d ? "border-primary bg-primary/10" : "border-border text-muted-foreground")}>
          {d === "singles" ? "Singles" : "Doubles"}
        </button>
      ))}
    </div>
  );
}
