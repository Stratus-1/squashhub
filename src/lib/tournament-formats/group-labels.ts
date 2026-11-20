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


/**
 * Raw stored category label with the organiser's rename applied to its unit-key
 * prefix, keeping any suffix ("Mixed 2 · Doubles" → "Mixed · Doubles").
 * Mirrors SQL `tournament_group_display_label` so app, emails and notices agree.
 */
export function displayRawGroupLabel(beta: any, raw: string | null | undefined, groupNumber: number | null | undefined): string | null {
  if (raw == null || groupNumber == null || !beta) return raw ?? null;
  const key: string | undefined = beta?.answers?.originalStructure?._unit_keys?.[groupNumber - 1];
  const labels = beta?.answers?.categoryLabels;
  if (!key || !labels || typeof labels !== "object") return raw;
  let disp: string;
  if (key.includes("::")) {
    const [parent, child] = key.split("::");
    const own = String(labels[key] ?? "").trim();
    disp = own || `${String(labels[parent] ?? "").trim() || parent} › ${child}`;
  } else {
    disp = String(labels[key] ?? "").trim() || key;
  }
  const keyDisp = key.split("::").join(" › ");
  if (disp === keyDisp) return raw;
  return raw.startsWith(keyDisp) ? disp + raw.slice(keyDisp.length) : raw;
}
