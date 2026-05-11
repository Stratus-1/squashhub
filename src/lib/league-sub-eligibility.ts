/**
 * League substitution eligibility engine.
 *
 * Centralised rules check for placing/subbing a player into a league team.
 * Configured per-association in `league_rules`:
 *   - max_position_movement_per_week: int|null  (NSA = 2)
 *   - sub_direction: 'any' | 'lower_or_equal_only' | 'higher_or_equal_only'  (NIL = lower_or_equal_only)
 *   - cross_gender_subs_allowed: bool
 *   - enforce_sub_rules: bool (master switch)
 *
 * Movement is measured in OVERALL SLOTS = leagueNumber*4 + position
 *   League 1 #1 = slot 5,  League 2 #3 = slot 11,  League 3 #1 = slot 13.
 * A move from L2#3 → L3#1 = |13-11| = 2 slots ✓ (within NSA cap of 2).
 * A move from L2#3 → L4#1 = |17-11| = 6 slots ✗.
 */

export type SubDirection = "any" | "lower_or_equal_only" | "higher_or_equal_only";

export interface SubRules {
  enforce_sub_rules?: boolean | null;
  max_position_movement_per_week?: number | null;
  sub_direction?: SubDirection | null;
  cross_gender_subs_allowed?: boolean | null;
  /**
   * Optional: ordered list of league numbers the club ACTUALLY runs in the relevant
   * gender bucket (e.g. CSIR runs Men's 7th, 10th, 13th → [7,10,13]).
   * When provided, slot index uses the ordinal POSITION of the league in this list
   * instead of the raw league number. So 7th #4 → 10th #2 = |6-4| = 2 slots ✓.
   * Falls back to raw league numbers when omitted.
   */
  league_number_order?: number[] | null;
}

export interface PlayerCtx {
  /** Last-played league number (lower = stronger). Use registered league as fallback. */
  homeLeagueNumber: number | null;
  /** Last-played position 1-4. Null if unknown — caller should treat result.warn=true. */
  homePosition: number | null;
  /** 'men' | 'ladies' | 'mixed' (or null if unknown). */
  gender: "men" | "ladies" | "mixed" | null;
}

export interface TargetCtx {
  leagueNumber: number;
  position: number; // 1-4
  gender: "men" | "ladies" | "mixed";
}

export interface EligibilityResult {
  ok: boolean;
  /** True when allowed but information was incomplete (no play history). */
  warn?: boolean;
  /** Human-readable reason when blocked, or info note when warn=true. */
  reason?: string;
}

const slotIndex = (leagueNumber: number, position: number) => leagueNumber * 4 + position;

const normaliseGender = (g?: string | null): "men" | "ladies" | "mixed" | null => {
  if (!g) return null;
  const s = g.toLowerCase();
  if (s.startsWith("f") || s === "ladies") return "ladies";
  if (s.startsWith("m") && s !== "mixed") return "men";
  if (s === "mixed") return "mixed";
  return null;
};

/**
 * Parse "Men's 3rd League", "Ladies 1st", "NIL Reserves 2", etc → integer league number.
 * Returns null if no number can be detected.
 */
export function parseLeagueNumber(name: string | null | undefined, code?: string | null): number | null {
  const src = `${name || ""} ${code || ""}`;
  const m = src.match(/(\d+)\s*(?:st|nd|rd|th)?/i);
  return m ? parseInt(m[1], 10) : null;
}

export function checkSubEligibility(
  rules: SubRules | null | undefined,
  player: PlayerCtx,
  target: TargetCtx,
): EligibilityResult {
  // Rules disabled or not configured → always allow
  if (!rules || rules.enforce_sub_rules === false) return { ok: true };

  const playerGender = normaliseGender(player.gender as any);

  // 1. Cross-gender check (always relevant when target is gendered)
  if (target.gender !== "mixed" && playerGender && playerGender !== target.gender) {
    if (!rules.cross_gender_subs_allowed) {
      return {
        ok: false,
        reason: `Cross-gender subs not allowed (${playerGender} player → ${target.gender}'s team)`,
      };
    }
  }

  // If we don't know where they last played, allow with warning (per user spec)
  if (player.homeLeagueNumber == null) {
    return { ok: true, warn: true, reason: "No play history yet — admin should verify placement" };
  }

  // 2. Direction check
  const direction = rules.sub_direction || "any";
  if (direction === "lower_or_equal_only") {
    // Player can only move into same or WEAKER (higher number) league
    // i.e. target.leagueNumber must be >= player.homeLeagueNumber
    if (target.leagueNumber < player.homeLeagueNumber) {
      return {
        ok: false,
        reason: `Cannot sub up — player's home is League ${player.homeLeagueNumber} (subs must be from same or lower league)`,
      };
    }
  } else if (direction === "higher_or_equal_only") {
    if (target.leagueNumber > player.homeLeagueNumber) {
      return {
        ok: false,
        reason: `Cannot sub down — player's home is League ${player.homeLeagueNumber} (subs must be from same or higher league)`,
      };
    }
  }

  // 3. Movement cap (overall slots) — measured in the club's ACTUAL league sequence,
  // not by raw league number. CSIR runs L7, L10, L13 → ordinals [1,2,3], so 7th#4 → 10th#2
  // is only 2 slots apart, not 11.
  const cap = rules.max_position_movement_per_week;
  if (cap != null && cap >= 0) {
    const homePos = player.homePosition ?? 4; // assume bottom of league if unknown position
    const order = rules.league_number_order && rules.league_number_order.length > 0
      ? rules.league_number_order
      : null;
    const ordinalOf = (n: number): number => {
      if (!order) return n;
      const idx = order.indexOf(n);
      // Unknown league → fall back to its raw number scaled into the order's range
      return idx >= 0 ? idx + 1 : n;
    };
    const fromSlot = ordinalOf(player.homeLeagueNumber) * 4 + homePos;
    const toSlot = ordinalOf(target.leagueNumber) * 4 + target.position;
    const delta = Math.abs(toSlot - fromSlot);
    if (delta > cap) {
      return {
        ok: false,
        reason: `Movement cap exceeded (${delta} slots, max ${cap}). Last played L${player.homeLeagueNumber}#${homePos} → target L${target.leagueNumber}#${target.position}`,
      };
    }
  }

  return { ok: true };
}
