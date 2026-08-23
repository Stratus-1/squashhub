/**
 * Human-readable labels for court bookings that belong to a tournament /
 * championship match.
 *
 * Historically a tournament court booking showed only the competition name
 * ("Men's Singles"), which tells nobody who is actually on court. These helpers
 * derive the label DYNAMICALLY from the linked match's player ids/names, so a
 * later name change (or a late substitution) resolves correctly without having
 * to rewrite stored booking rows. Bookings that are not linked to a match must
 * keep their existing label — call sites only use these helpers when a match
 * link exists.
 *
 * Nothing here touches booking or scheduling logic; it is presentation only.
 */

export type ChampBookingSide = {
  /** Primary competitor's display name. */
  name?: string | null;
  /** Doubles partner's display name, when the format has one. */
  partner?: string | null;
};

export type ChampBookingMatch = {
  sideA?: ChampBookingSide | null;
  sideB?: ChampBookingSide | null;
  /** True when the row is a bye — never invent an opponent name for these. */
  isBye?: boolean | null;
  /** Tournament / championship name, e.g. "Riverside Club Championships". */
  champName?: string | null;
  /** Division / league label, e.g. "Men's Singles" or "League 2". */
  divisionLabel?: string | null;
};

export type ChampBookingLabel = {
  /** Primary line: full names, e.g. "Willem Pretorius vs Craig Nieuwoudt". */
  title: string;
  /** Space-constrained variant, e.g. "W. Pretorius v C. Nieuwoudt". */
  compactTitle: string;
  /** Secondary context, e.g. "Riverside Club Championships · Men's Singles". */
  context: string;
  /** True when at least one real competitor name was resolved. */
  hasPlayers: boolean;
};

const TBD = "TBD";

function clean(v: string | null | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

/** "John Smith" -> "J. Smith"; single names are returned as-is. */
export function toInitialSurname(full: string): string {
  const parts = clean(full).split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return clean(full);
  return `${parts[0].charAt(0).toUpperCase()}. ${parts[parts.length - 1]}`;
}

/** Render one side of a fixture — "A" for singles, "A / B" for doubles. */
export function sideLabel(
  side: ChampBookingSide | null | undefined,
  opts: { compact?: boolean } = {},
): string {
  const fmt = (v: string) => (opts.compact ? toInitialSurname(v) : v);
  const names = [clean(side?.name), clean(side?.partner)].filter(Boolean).map(fmt);
  return names.join(" / ");
}

function build(match: ChampBookingMatch, compact: boolean): string {
  const a = sideLabel(match.sideA, { compact });
  const b = sideLabel(match.sideB, { compact });
  const vs = compact ? " v " : " vs ";
  if (a && b) return `${a}${vs}${b}`;
  // A bye has a genuinely absent opponent — say so rather than fake a name.
  if (a && match.isBye) return `${a} (bye)`;
  if (b && match.isBye) return `${b} (bye)`;
  if (a) return `${a}${vs}${TBD}`;
  if (b) return `${TBD}${vs}${b}`;
  return "";
}

/** "Riverside Club Championships · Men's Singles" (either part may be absent). */
export function champBookingContext(match: ChampBookingMatch): string {
  return [clean(match.champName), clean(match.divisionLabel)].filter(Boolean).join(" · ");
}

/**
 * Full label set for a tournament match booking. When no competitor is known
 * at all we fall back to the competition context (previous behaviour) so the
 * slot never renders blank.
 */
export function champBookingLabel(match: ChampBookingMatch): ChampBookingLabel {
  const context = champBookingContext(match);
  const title = build(match, false);
  const compactTitle = build(match, true);
  const hasPlayers = !!(sideLabel(match.sideA) || sideLabel(match.sideB));
  const fallback = context || "Tournament";
  return {
    title: title || fallback,
    compactTitle: compactTitle || fallback,
    context,
    hasPlayers,
  };
}

/**
 * Convenience adapter for a raw `club_champs_matches` row joined with its
 * member records. Accepts the shapes used by the booking grid query, where a
 * player may resolve via `club_members.name` or the linked profile name.
 */
export function champMatchToBookingLabel(
  row: any,
  opts: { champName?: string | null; divisionLabel?: string | null } = {},
): ChampBookingLabel {
  const nameOf = (rel: any): string => {
    if (!rel) return "";
    const profile = Array.isArray(rel.profiles) ? rel.profiles[0] : rel.profiles;
    return clean(rel.name) || clean(profile?.name);
  };
  return champBookingLabel({
    sideA: { name: nameOf(row?.player_a), partner: nameOf(row?.partner_a) },
    sideB: { name: nameOf(row?.player_b), partner: nameOf(row?.partner_b) },
    isBye: !!row?.is_bye,
    champName: opts.champName,
    divisionLabel: opts.divisionLabel,
  });
}
