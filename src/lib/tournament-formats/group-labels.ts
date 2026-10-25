/**
 * Resolve the display label for a tournament league/group.
 *
 * Admins can rename leagues via `club_champs.group_labels` (a JSON map keyed
 * by group number, e.g. `{ "1": "6", "2": "Ladies" }`). Whatever the admin
 * typed is shown verbatim — only bare numbers get the `League ` prefix so
 * `"6"` reads as `League 6` while `"Ladies"` stays `Ladies`. Falls back to
 * `League {groupNumber}` when no label is configured.
 */
export function getGroupLabel(
  champ: { group_labels?: Record<string, string> | any | null; beta_lifecycle?: any } | null | undefined,
  groupNumber: number | null | undefined,
): string {
  if (groupNumber == null) return "";
  const answers = champ?.beta_lifecycle?.answers;
  const keys: string[] = answers?.originalStructure?._unit_keys ?? [];
  const key = keys[groupNumber - 1];
  const renamed = key ? answers?.categoryLabels?.[key] : undefined;
  if (typeof renamed === "string" && renamed.trim()) return renamed.trim();
  const raw =
    champ && (champ as any).group_labels
      ? ((champ as any).group_labels as Record<string, string>)[String(groupNumber)]
      : undefined;
  const v = (raw || "").trim();
  if (!v) return `League ${groupNumber}`;
  // Bare numbers ("6") read better as "League 6"; anything the admin named
  // (e.g. "Ladies", "Div A", "League 6") is shown exactly as entered.
  if (/^\d+$/.test(v)) return `League ${v}`;
  return v;
}

