/**
 * SelectLineupWizard — mobile-first, tap-to-pick lineup selection.
 *
 * Step 1: Home team — tap players in order (1 → teamSize).
 * Step 2: Visitors team — same.
 *
 * Pre-filled lineups are shown as the starting selection, but EVERY squad
 * player stays tappable so a captain standing at the club on a phone can
 * clear and re-pick the whole team in a few taps.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Check, RotateCcw, ArrowRight, ArrowLeft, Users, UserPlus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { NsaTeamPlayer } from "@/hooks/use-nsa";


export type LineupPick = { code: string; name: string };

export interface SelectLineupWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  homeCode?: string | null;
  awayCode?: string | null;
  homePlayers: NsaTeamPlayer[];
  awayPlayers: NsaTeamPlayer[];
  teamSize: number;
  /** Current lineup (prefill) — same order as positions. */
  initialHome: LineupPick[];
  initialAway: LineupPick[];
  onApply: (home: LineupPick[], away: LineupPick[]) => void;
}

const fullName = (p: NsaTeamPlayer) =>
  `${p.name || ""} ${p.surname || ""}`.trim() || p.code || "—";

/** Add a player who isn't in the squad list, by league / NSF number.
 *  Rendered inline when the parent wants it visible. */
function AddByNumberInline({
  open,
  onOpenChange,
  side,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side: "home" | "away";
  onAdd: (p: NsaTeamPlayer) => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [looking, setLooking] = useState(false);
  const [found, setFound] = useState<string | null>(null);

  const lookup = async () => {
    const c = code.trim().toUpperCase();
    if (!c) return;
    setLooking(true);
    setFound(null);
    try {
      const { data } = await supabase
        .from("member_association_affiliations")
        .select("league_association_number, club_members(name)")
        .ilike("league_association_number", c)
        .limit(1);
      const hit = (data as any)?.[0]?.club_members?.name as string | undefined;
      if (hit) {
        setName(hit);
        setFound(hit);
      } else {
        setFound(null);
        toast({
          title: "Not found",
          description: "No member with that number — type the name manually.",
        });
      }
    } finally {
      setLooking(false);
    }
  };

  const add = () => {
    const c = code.trim().toUpperCase();
    const n = name.trim();
    if (!c && !n) return;
    onAdd({
      code: c || n,
      name: n || c,
      surname: "",
      result_summary: { won: 0, lost: 0, played: 0 },
    });
    setCode("");
    setName("");
    setFound(null);
    onOpenChange(false);
  };


  if (!open) return null;

  return (
    <div className="rounded-lg border-2 border-primary/50 bg-primary/5 p-3 space-y-3 shadow-md">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide">
          Insert {side === "home" ? "home" : "visitors"} player
        </span>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onOpenChange(false)}>
          <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back to list
        </Button>
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-muted-foreground">
            NSF
          </span>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                lookup();
              }
            }}
            placeholder="1234"
            inputMode="numeric"
            className="h-11 text-base font-mono pl-11"
            maxLength={20}
            autoFocus
          />
        </div>
        <Button variant="secondary" onClick={lookup} disabled={looking || !code.trim()}>
          {looking ? <Loader2 className="w-4 h-4 animate-spin" /> : "Find"}
        </Button>
      </div>

      {found && (
        <div className="rounded-md border border-primary/40 bg-background p-3 space-y-2">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Player found</p>
            <p className="text-base font-bold break-words">{found}</p>
          </div>
          <Button className="w-full" onClick={add}>
            <UserPlus className="w-4 h-4 mr-1" /> Add to squad & pick
          </Button>
        </div>
      )}

      <Input
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setFound(null);
        }}
        placeholder="Or type player name"
        className="h-11 text-base"
        maxLength={80}
      />
      {!found && (
        <Button className="w-full" onClick={add} disabled={!code.trim() && !name.trim()}>
          <UserPlus className="w-4 h-4 mr-1" /> Add & pick player
        </Button>
      )}
    </div>
  );
}



function SideStep({
  title,
  teamCode,
  tone,
  players,
  teamSize,
  picks,
  onToggle,
  onClear,
}: {
  title: string;
  teamCode?: string | null;
  tone: "home" | "away";
  players: NsaTeamPlayer[];
  teamSize: number;
  picks: LineupPick[];
  onToggle: (p: NsaTeamPlayer) => void;
  onClear: () => void;
  
}) {
  const indexByCode = new Map(
    picks.map((p, i) => [(p.code || "").toUpperCase(), i + 1] as const),
  );

  return (
    <div className="space-y-2">
      <div
        className={cn(
          "flex items-center justify-between px-3 py-2 rounded-md border-2",
          tone === "home"
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-accent text-accent-foreground border-accent",
        )}
      >
        <span className="text-base font-black uppercase tracking-widest">{title}</span>
        <span className="text-xs font-mono font-black bg-background/25 px-2 py-0.5 rounded border border-background/30">
          {teamCode || "—"}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground leading-snug">
          Tap players in order — 1 to {teamSize}. Tap again to unpick.
        </p>
        <Button variant="ghost" size="sm" className="text-xs shrink-0" onClick={onClear}>
          <RotateCcw className="w-3.5 h-3.5 mr-1" /> Clear
        </Button>
      </div>



      <div className="space-y-1 max-h-[46vh] overflow-y-auto pr-1">
        {players.length === 0 && (
          <div className="text-xs italic text-muted-foreground px-1 py-3">
            No squad players available for this team.
          </div>
        )}
        {players.map((p) => {
          const code = (p.code || "").toUpperCase();
          const pos = indexByCode.get(code);
          const picked = !!pos;
          const full = teamSize > 0 && picks.length >= teamSize && !picked;
          return (
            <button
              key={code || fullName(p)}
              type="button"
              onClick={() => onToggle(p)}
              disabled={full}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-3 rounded-lg border text-left transition-colors",
                picked
                  ? "border-primary bg-primary/10"
                  : "border-border bg-background hover:bg-muted/60",
                full && "opacity-40",
              )}
            >
              <span
                className={cn(
                  "w-8 h-8 shrink-0 rounded-full grid place-items-center text-sm font-black border",
                  picked
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted text-muted-foreground border-border",
                )}
              >
                {pos ?? "·"}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold leading-tight break-words">
                  {fullName(p)}
                </span>
                <span className="block font-mono text-[10px] text-muted-foreground leading-tight">
                  {p.code}
                </span>
              </span>
              {picked && <Check className="w-4 h-4 text-primary shrink-0" />}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-1">
        {Array.from({ length: teamSize }).map((_, i) => (
          <Badge
            key={i}
            variant={picks[i] ? "default" : "outline"}
            className="text-[10px] max-w-full truncate"
          >
            {i + 1}. {picks[i]?.name || "—"}
          </Badge>
        ))}
      </div>
    </div>
  );
}

export function SelectLineupWizard({
  open,
  onOpenChange,
  homeCode,
  awayCode,
  homePlayers,
  awayPlayers,
  teamSize,
  initialHome,
  initialAway,
  onApply,
}: SelectLineupWizardProps) {
  const [step, setStep] = useState<"home" | "away">("home");
  const [home, setHome] = useState<LineupPick[]>([]);
  const [away, setAway] = useState<LineupPick[]>([]);
  const [extraHome, setExtraHome] = useState<NsaTeamPlayer[]>([]);
  const [extraAway, setExtraAway] = useState<NsaTeamPlayer[]>([]);
  const [addingPlayer, setAddingPlayer] = useState(false);

  // Seed from the current lineup each time the wizard opens.
  useEffect(() => {
    if (!open) return;
    setStep("home");
    setHome(initialHome.filter((p) => p.code || p.name));
    setAway(initialAway.filter((p) => p.code || p.name));
    setExtraHome([]);
    setExtraAway([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = (side: "home" | "away") => (p: NsaTeamPlayer) => {
    const code = (p.code || "").toUpperCase();
    const setter = side === "home" ? setHome : setAway;
    setter((prev) => {
      const idx = prev.findIndex((x) => (x.code || "").toUpperCase() === code);
      if (idx >= 0) return prev.filter((_, i) => i !== idx);
      if (prev.length >= teamSize) return prev;
      return [...prev, { code, name: fullName(p) }];
    });
  };

  const addManual = (side: "home" | "away") => (p: NsaTeamPlayer) => {
    const code = (p.code || "").toUpperCase();
    const base = side === "home" ? homePlayers : awayPlayers;
    const extras = side === "home" ? extraHome : extraAway;
    const known =
      base.some((x) => (x.code || "").toUpperCase() === code) ||
      extras.some((x) => (x.code || "").toUpperCase() === code);
    if (!known) (side === "home" ? setExtraHome : setExtraAway)((prev) => [...prev, p]);
    const picks = side === "home" ? home : away;
    if (!picks.some((x) => (x.code || "").toUpperCase() === code)) toggle(side)(p);
  };

  const activePicks = step === "home" ? home : away;
  const remaining = Math.max(0, teamSize - activePicks.length);

  const stepTitle = useMemo(
    () => (step === "home" ? "Step 1 of 2 · Home team" : "Step 2 of 2 · Visitors team"),
    [step],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Users className="w-4 h-4" /> Select players
          </DialogTitle>
          <DialogDescription className="text-xs">
            {stepTitle} — {remaining > 0 ? `${remaining} still to pick` : "team complete"}
          </DialogDescription>
        </DialogHeader>

        <div className="sticky top-0 z-10 bg-background">
          <AddByNumberInline
            open={addingPlayer}
            onOpenChange={setAddingPlayer}
            side={step}
            onAdd={addManual(step)}
          />
        </div>

        {step === "home" ? (
          <SideStep
            title="Home"
            teamCode={homeCode}
            tone="home"
            players={[...homePlayers, ...extraHome]}
            teamSize={teamSize}
            picks={home}
            onToggle={toggle("home")}
            onClear={() => setHome([])}
          />
        ) : (
          <SideStep
            title="Visitors"
            teamCode={awayCode}
            tone="away"
            players={[...awayPlayers, ...extraAway]}
            teamSize={teamSize}
            picks={away}
            onToggle={toggle("away")}
            onClear={() => setAway([])}
          />
        )}


        <DialogFooter className="flex-row gap-2 sm:justify-between">
          {step === "away" ? (
            <Button variant="outline" size="sm" className="flex-1" onClick={() => setStep("home")}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Home team
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
          {!addingPlayer && (
            <Button
              variant="secondary"
              size="sm"
              className="flex-1"
              onClick={() => setAddingPlayer(true)}
            >
              <UserPlus className="w-4 h-4 mr-1" /> Insert player
            </Button>
          )}
          {step === "home" ? (
            <Button size="sm" className="flex-1" onClick={() => setStep("away")}>
              Visitors <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button
              size="sm"
              className="flex-1"
              onClick={() => {
                onApply(home, away);
                onOpenChange(false);
              }}
            >
              <Check className="w-4 h-4 mr-1" /> Apply lineup
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
