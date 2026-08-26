import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CapacityLeagueInput,
  DeriveSessionsInput,
  MISSING_LABELS,
  computeCapacity,
  deriveSessions,
  formatCourtMinutes,
  missingCapacityInputs,
} from "@/lib/tournaments/capacity";

interface CapacityCheckProps extends DeriveSessionsInput {
  leagues: CapacityLeagueInput[];
  isDoubles: boolean;
  crossLeague: boolean;
  parallelLeagues: boolean;
  onParallelLeaguesChange: (v: boolean) => void;
  playoffBreakMinutes?: number;
}

/**
 * Live capacity validation. Lives on the "Dates, Times & Courts" step because
 * it only becomes meaningful once both the structure (what) and the schedule
 * (when/where) are known. Advisory only — nothing here blocks setup.
 */
export function CapacityCheck(props: CapacityCheckProps) {
  const {
    leagues, isDoubles, crossLeague, parallelLeagues, onParallelLeaguesChange, playoffBreakMinutes,
    ...deriveInput
  } = props;

  const [showDetails, setShowDetails] = useState(false);

  const missing = useMemo(
    () => missingCapacityInputs({ ...deriveInput, leagues }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(deriveInput), JSON.stringify(leagues)],
  );

  const result = useMemo(
    () =>
      computeCapacity({
        sessions: deriveSessions(deriveInput),
        leagues,
        isDoubles,
        parallelLeagues,
        crossLeague,
        playoffBreakMinutes,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(deriveInput), JSON.stringify(leagues), isDoubles, parallelLeagues, crossLeague, playoffBreakMinutes],
  );

  const unit = isDoubles ? "pairs" : "players";

  if (missing.length > 0 || !result.ready) {
    const list = missing.length > 0 ? missing : (["times"] as const);
    return (
      <div className="rounded-lg border border-dashed p-3 bg-muted/20 text-xs space-y-1.5">
        <div className="text-sm font-medium">Capacity check</div>
        <p className="text-muted-foreground">
          Add tournament dates, playing times and courts to calculate capacity.
        </p>
        <ul className="list-disc pl-4 text-muted-foreground">
          {Array.from(new Set(list)).map((m) => (
            <li key={m}>Still needed: {MISSING_LABELS[m as keyof typeof MISSING_LABELS]}</li>
          ))}
        </ul>
      </div>
    );
  }

  const courtsLine = `${result.maxCourts} court${result.maxCourts === 1 ? "" : "s"} · ${
    result.sessionCount
  } session${result.sessionCount === 1 ? "" : "s"} over ${result.dayCount} day${
    result.dayCount === 1 ? "" : "s"
  } = ${formatCourtMinutes(result.totalCourtMinutes)} of court time`;

  const overCommitted = result.requiredCourtMinutes > result.totalCourtMinutes;
  const tone =
    result.fits === false || overCommitted
      ? "border-destructive/40 bg-destructive/10"
      : result.fits === true
        ? "border-emerald-500/40 bg-emerald-500/10"
        : "border-primary/30 bg-primary/5";

  return (
    <div className="rounded-lg border p-3 bg-background text-xs space-y-2.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm font-medium">Capacity check</div>
        {result.leagueCount > 1 && !crossLeague && result.maxCourts >= result.leagueCount && (
          <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
            <input
              type="checkbox"
              checked={parallelLeagues}
              onChange={(e) => onParallelLeaguesChange(e.target.checked)}
              className="h-3 w-3"
            />
            Run leagues side by side (split the courts)
          </label>
        )}
      </div>

      <div className="grid gap-1.5 sm:grid-cols-2">
        <div className="rounded-md border bg-muted/30 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Court time available</div>
          <div className="text-sm font-semibold">{formatCourtMinutes(result.totalCourtMinutes)}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{courtsLine}</div>
        </div>
        <div className="rounded-md border bg-muted/30 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Court time this plan needs</div>
          <div className={cn("text-sm font-semibold", overCommitted && "text-destructive")}>
            {result.plannedEntities > 0 ? `about ${formatCourtMinutes(result.requiredCourtMinutes)}` : "—"}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {result.plannedEntities > 0
              ? `${result.plannedEntities} ${unit}${isDoubles ? ` (${result.plannedPlayers} players)` : ""} across ${
                  result.leagueCount
                } league${result.leagueCount === 1 ? "" : "s"}`
              : `Add expected ${unit} per league in the Structure step to check the fit.`}
          </div>
        </div>
      </div>

      <div className={cn("rounded-md border p-2.5", tone)}>
        <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-0.5">
          This setup can hold
        </div>
        <div className="text-sm font-semibold">
          {isDoubles ? (
            <>
              up to <span className="text-base">{result.maxEntitiesTotal}</span> pair
              {result.maxEntitiesTotal === 1 ? "" : "s"} ({result.maxPlayersTotal} players)
            </>
          ) : (
            <>
              up to <span className="text-base">{result.maxPlayersTotal}</span> player
              {result.maxPlayersTotal === 1 ? "" : "s"}
            </>
          )}
        </div>
        {result.fits === true && (
          <div className="text-[11px] mt-1 text-emerald-700 dark:text-emerald-400">
            The planned field fits in the time available.
          </div>
        )}
        {result.fits === false && (
          <div className="text-[11px] mt-1 text-destructive font-medium">
            The planned field does not fit. {result.bottleneck}
          </div>
        )}
        {result.fits === null && (
          <div className="text-[11px] mt-1 text-muted-foreground">
            Advisory only — nothing is blocked if you go over.
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setShowDetails((v) => !v)}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
      >
        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showDetails && "rotate-180")} />
        How is this calculated?
      </button>

      {showDetails && (
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {result.perLeague.map((L) => (
              <div
                key={L.groupNumber}
                className={cn(
                  "rounded border p-1.5",
                  L.entities > 0 && !L.fits ? "bg-destructive/10 border-destructive/40" : "bg-muted/30",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{L.label}</span>
                  <span className="text-muted-foreground">{L.slotMinutes} min/match</span>
                  <span className="ml-auto">
                    {L.entities > 0 ? (
                      <>
                        <strong>{L.players}</strong> player{L.players === 1 ? "" : "s"}
                        {isDoubles && <> ({L.entities} pairs)</>}
                      </>
                    ) : (
                      <>
                        up to <strong>{L.maxPlayers}</strong> players
                        {isDoubles && <> ({L.maxEntities} pairs)</>}
                      </>
                    )}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {L.pools} pool{L.pools === 1 ? "" : "s"}
                  {L.isTimeCapped && <> · Bells (time-capped round robin)</>}
                  {L.isSwiss && <> · {L.rounds} round{L.rounds === 1 ? "" : "s"}</>}
                  {" · "}
                  {L.gamesAvailable} match slot{L.gamesAvailable === 1 ? "" : "s"} available
                  {" · "}
                  {L.slotsAvailable} time slot{L.slotsAvailable === 1 ? "" : "s"} in the day
                  {L.entities > 0 && (
                    <>
                      {" · needs "}
                      {L.gamesNeeded}
                      {L.playoffGames > 0 && <> + {L.playoffGames} play-off</>}
                      {" in "}{L.roundsNeeded} round{L.roundsNeeded === 1 ? "" : "s"}
                      {L.fits
                        ? " ✓"
                        : L.shortfallRounds > 0
                          ? ` · ${L.shortfallRounds} round${L.shortfallRounds === 1 ? "" : "s"} too many for the day`
                          : ` · short by ${L.shortfallGames}`}
                    </>
                  )}
                  {L.entities === 0 && L.slotLimited && <> · capped by the number of time slots, not courts</>}
                </div>

              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Each playing window gives <em>minutes × courts</em> of court time, and each league is costed at its own
            match length. Round-robin and Bells leagues need N·(N−1)/2 matches per pool (doubled for a double round
            robin); Swiss leagues need ⌈N/2⌉ matches per round per pool. A second limit applies on top: nobody plays
            two matches at once, so a league also needs one time slot per round — a round robin of N needs N−1 slots
            in the playing window no matter how many courts are open. Play-off brackets add their own matches and
            rounds, and a pre-play-off break removes court time from every court.{" "}
            {result.parallelApplied
              ? "Side-by-side mode divides the courts between leagues (any remainder goes to the earlier leagues)."
              : "Without side-by-side mode each league is sized as if it can use every selected court, so leagues sharing the same courts must be read together, not added up."}
          </p>

        </div>
      )}
    </div>
  );
}
