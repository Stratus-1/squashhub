import { Checkbox } from "@/components/ui/checkbox";
import { PERMISSION_CHILDREN, normaliseSelection, parentOf } from "@/lib/permissions/fine-permissions";
import type { ScopedSlug } from "@/lib/permission-scope";

interface Props {
  slugs: ScopedSlug[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  /** Everything greyed out (e.g. full admin ticked). Shows all as ticked when `allChecked`. */
  disabled?: boolean;
  allChecked?: boolean;
  /** Slugs already given by the member's role: shown ticked, struck through and locked. */
  inherited?: string[];
  /** Slugs that may not be ticked at all (e.g. chairman finance changes). */
  locked?: (slug: string) => boolean;
}

/**
 * Permission checklist grouped into main areas. Ticking an area gives all of
 * it (today's behaviour); unticking it lets the admin pick only some parts.
 */
export function PermissionPicker({ slugs, selected, onChange, disabled, allChecked, inherited = [], locked }: Props) {
  const inh = new Set(inherited);
  const isInherited = (slug: string) => {
    if (inh.has(slug)) return true;
    const p = parentOf(slug);
    return !!p && inh.has(p);
  };
  const isOn = (slug: string) => {
    if (allChecked || selected.has(slug) || isInherited(slug)) return true;
    const p = parentOf(slug);
    return !!p && selected.has(p);
  };

  const toggleArea = (area: string) => {
    const next = new Set(selected);
    if (next.has(area)) next.delete(area);
    else next.add(area);
    onChange(new Set(normaliseSelection(next)));
  };

  const togglePart = (area: string, part: string) => {
    const next = new Set(selected);
    if (next.has(area)) {
      // Turning one part off while the whole area is on: keep every other part.
      next.delete(area);
      PERMISSION_CHILDREN[area].forEach((c) => { if (c.value !== part) next.add(c.value); });
    } else if (next.has(part)) {
      next.delete(part);
    } else {
      next.add(part);
      // All parts ticked = the whole area.
      if (PERMISSION_CHILDREN[area].every((c) => next.has(c.value))) {
        PERMISSION_CHILDREN[area].forEach((c) => next.delete(c.value));
        next.add(area);
      }
    }
    onChange(next);
  };

  const simple = slugs.filter((s) => !PERMISSION_CHILDREN[s.value]);
  const areas = slugs.filter((s) => PERMISSION_CHILDREN[s.value]);

  const row = (slug: string, label: string, onToggle: () => void, extraClass = "") => {
    const inherit = isInherited(slug);
    const lock = !!locked?.(slug);
    return (
      <label key={slug} className={`flex items-center gap-2 text-sm cursor-pointer lg:whitespace-nowrap ${extraClass}`}>
        <Checkbox checked={isOn(slug)} onCheckedChange={onToggle} disabled={disabled || inherit || lock} />
        <span className={inherit ? "text-muted-foreground line-through" : lock ? "text-muted-foreground" : ""}>{label}</span>
      </label>
    );
  };

  return (
    <div className={`space-y-3 ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {areas.map((a) => {
          const parts = PERMISSION_CHILDREN[a.value];
          const someParts = !selected.has(a.value) && parts.some((c) => selected.has(c.value));
          return (
            <div key={a.value} className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                {row(a.value, `${a.label} — everything`, () => toggleArea(a.value), "font-medium")}
                {someParts && <span className="text-[10px] text-muted-foreground">Some parts</span>}
              </div>
              <div className="pl-6 grid grid-cols-1 gap-1.5">
                {parts.map((c) => row(c.value, c.label, () => togglePart(a.value, c.value)))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
        {simple.map((s) => row(s.value, s.label, () => toggleArea(s.value)))}
      </div>
    </div>
  );
}
