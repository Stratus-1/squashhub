/**
 * Resolve the display label for a tournament league/group.
 *
 * Admins can rename leagues via `club_champs.group_labels` (a JSON map keyed
 * by group number, e.g. `{ "1": "6", "2": "7" }` or `{ "1": "A" }`). When
 * the label is a bare number/string we render it as `League {label}`; when
 * it already contains "League" or "Div" we render it as-is. Falls back to
 * `League {groupNumber}` when no label is configured.
 */
export function getGroupLabel(
  champ: { group_labels?: Record<string, string> | any | null } | null | undefined,
  groupNumber: number | null | undefined,
): string {
  if (groupNumber == null) return "";
  const raw =
    champ && (champ as any).group_labels
      ? ((champ as any).group_labels as Record<string, string>)[String(groupNumber)]
      : undefined;
  const v = (raw || "").trim();
  if (!v) return `League ${groupNumber}`;
  // If user already typed something like "Div A" or "League 6", show as-is
  if (/league|div|pool|grp|group/i.test(v)) return v;
  return `League ${v}`;
}
