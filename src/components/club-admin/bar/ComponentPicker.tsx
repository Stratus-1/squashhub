import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { ChevronsUpDown } from "lucide-react";

export interface PickerItem {
  id: string;
  name: string;
  category?: string | null;
}

interface ComponentPickerProps {
  items: PickerItem[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  categoryLabel?: (value: string | null | undefined) => string;
  categoryEmoji?: (value: string | null | undefined) => string;
}

/** Searchable picker for special components — grouped by category, type-to-filter. */
export function ComponentPicker({ items, value, onChange, placeholder = "Product or option", categoryLabel, categoryEmoji }: ComponentPickerProps) {
  const [open, setOpen] = useState(false);
  const selected = items.find(i => i.id === value);

  const groups = useMemo(() => {
    const map = new Map<string, PickerItem[]>();
    for (const it of items) {
      const key = it.category || "";
      const arr = map.get(key);
      if (arr) arr.push(it); else map.set(key, [it]);
    }
    return [...map.entries()];
  }, [items]);

  const heading = (cat: string) => {
    const label = categoryLabel ? categoryLabel(cat) : cat || "Other";
    const emoji = categoryEmoji ? categoryEmoji(cat) : "";
    return `${emoji ? emoji + " " : ""}${label}`;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} className="h-8 w-full justify-between text-xs font-normal px-2">
          <span className="truncate">{selected ? selected.name : <span className="text-muted-foreground">{placeholder}</span>}</span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search…" className="h-8 text-xs" />
          <CommandList className="max-h-64">
            <CommandEmpty className="text-xs text-muted-foreground py-4 text-center">No items found</CommandEmpty>
            {groups.map(([cat, catItems]) => (
              <CommandGroup key={cat || "other"} heading={heading(cat)}>
                {catItems.map(i => (
                  <CommandItem
                    key={i.id}
                    value={`${i.name} ${heading(i.category)}`}
                    onSelect={() => { onChange(i.id); setOpen(false); }}
                    className="text-xs"
                  >
                    <span className="truncate">{i.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
