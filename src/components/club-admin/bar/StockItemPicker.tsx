import { useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import {
  allCategories,
  categoryLabel,
  divisionLabel,
  useBarCategories,
  useBarDivisions,
  type BarDivisionDef,
  type CustomCategoryRow,
} from "@/lib/bar-categories";

/** Anything the picker can list. BarItem (and the bar inventory types) satisfy this shape. */
export interface PickableStockItem {
  id: string;
  name: string;
  category?: string | null;
  division?: string | null;
  unit_yield?: number | null;
  stock_unit_label?: string | null;
  stock_measure?: string | null;
}

interface StockItemGroup {
  key: string;
  cat: string;
  div: string;
  label: string;
  items: PickableStockItem[];
}

/** Short trailing hint so a bulk/bottle purchase can be told apart from a single sale unit. */
export function stockMeasureHint(it: PickableStockItem): string {
  if (it.stock_measure === "volume") return "litres";
  if ((it.unit_yield || 1) > 1) return `per ${it.stock_unit_label || "bottle"}`;
  return "";
}

interface StockItemPickerProps {
  clubId?: string;
  /** Already narrowed to the products that can be bought in (not archived, not specials). */
  items: PickableStockItem[];
  value: string;
  onChange: (itemId: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Searchable product picker for purchase lines: type to find a product, or narrow to one
 * division and pick from the list grouped under the same categories the menu and stock take use.
 * Presentation only — selection is reported through onChange exactly like the plain dropdown did.
 */
export function StockItemPicker({
  clubId,
  items,
  value,
  onChange,
  placeholder = "Select item",
  className,
  disabled,
}: StockItemPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [divFilter, setDivFilter] = useState<string>("all");
  const { divisions } = useBarDivisions(clubId);
  const { data: customCats = [] } = useBarCategories(clubId);

  const customs = customCats as CustomCategoryRow[];
  const selected = items.find(i => i.id === value);

  const grouped = useMemo<StockItemGroup[]>(() => {
    const cats = allCategories(customs, true);
    const order = new Map(cats.map((c, i) => [c.value, i]));
    const divOf = (it: PickableStockItem) =>
      it.division || cats.find(c => c.value === (it.category || "other"))?.division || "bar";
    const q = search.trim().toLowerCase();
    const visible = items.filter(it =>
      (divFilter === "all" || divOf(it) === divFilter) &&
      (!q ||
        it.name.toLowerCase().includes(q) ||
        categoryLabel(customs, it.category || "other").toLowerCase().includes(q)),
    );
    const map = new Map<string, StockItemGroup>();
    for (const it of visible) {
      const cat = it.category || "other";
      const div = divOf(it);
      const key = `${div}|${cat}`;
      if (!map.has(key)) map.set(key, { key, cat, div, label: categoryLabel(customs, cat), items: [] });
      map.get(key)!.items.push(it);
    }
    const divOrder = (k: string) => {
      const i = divisions.findIndex(d => d.key === k);
      return i < 0 ? 99 : i;
    };
    return [...map.values()]
      .map(g => ({ ...g, items: [...g.items].sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort(
        (a, b) =>
          divOrder(a.div) - divOrder(b.div) ||
          (order.get(a.cat) ?? 999) - (order.get(b.cat) ?? 999) ||
          a.label.localeCompare(b.label),
      );
  }, [items, customs, divFilter, search, divisions]);

  const visibleCount = grouped.reduce((s, g) => s + g.items.length, 0);
  const showDivision = divFilter === "all" && divisions.length > 1;

  return (
    <Popover
      modal
      open={open}
      onOpenChange={o => {
        setOpen(o);
        if (o) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Select item"
          disabled={disabled}
          className={cn(
            "w-full justify-between h-8 px-2 text-xs font-normal",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{selected ? selected.name : placeholder}</span>
          <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[min(92vw,420px)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search item or category…"
            value={search}
            onValueChange={setSearch}
          />
          <div className="flex flex-wrap gap-1 px-2 pb-2" role="group" aria-label="Division">
            {[{ key: "all", label: "All" }, ...divisions].map(d => (
              <Button
                key={d.key}
                type="button"
                size="sm"
                variant={divFilter === d.key ? "default" : "outline"}
                aria-pressed={divFilter === d.key}
                onClick={() => setDivFilter(d.key)}
                className="h-6 px-2 text-[11px]"
              >
                {d.label}
              </Button>
            ))}
          </div>
          <CommandList className="max-h-[280px] overflow-y-auto">
            <CommandEmpty>No items match your search.</CommandEmpty>
            {grouped.map(g => (
              <CommandGroup
                key={g.key}
                heading={showDivision ? `${divisionLabel(divisions as BarDivisionDef[], g.div)} · ${g.label}` : g.label}
              >
                {g.items.map(it => (
                  <CommandItem
                    key={it.id}
                    value={it.id}
                    className="text-xs"
                    onSelect={() => {
                      onChange(it.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn("w-3.5 h-3.5 shrink-0", value === it.id ? "opacity-100" : "opacity-0")}
                    />
                    <span className="truncate">{it.name}</span>
                    {stockMeasureHint(it) && (
                      <span className="ml-auto shrink-0 pl-2 text-[10px] text-muted-foreground">
                        {stockMeasureHint(it)}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
          <div className="border-t px-2 py-1.5 text-[11px] text-muted-foreground">
            {visibleCount} of {items.length} items
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
