import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export type AccountOption = { value: string; label: string };
export type AccountOptionGroup = { heading?: string; options: AccountOption[] };

/**
 * Searchable account chooser for Enter Transaction. Renders inline (no portal)
 * so typing and scrolling work inside the dialog on phones.
 */
export function SearchableAccountPicker({
  value,
  onChange,
  groups,
  placeholder = "Select account...",
}: {
  value: string;
  onChange: (v: string) => void;
  groups: AccountOptionGroup[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = groups.flatMap((g) => g.options).find((o) => o.value === value);

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-xs"
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>{selected?.label ?? placeholder}</span>
        <ChevronDown className={cn("h-4 w-4 opacity-50 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <Command
          className="rounded-md border border-input"
          filter={(itemValue, search) => (itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}
        >
          <CommandInput placeholder="Search accounts..." className="h-9 text-xs" autoFocus />
          <CommandList className="max-h-56">
            <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">No account found.</CommandEmpty>
            {groups.filter((g) => g.options.length > 0).map((g, i) => (
              <CommandGroup key={g.heading ?? i} heading={g.heading} className="[&_[cmdk-group-heading]]:text-[10px]">
                {g.options.map((o) => (
                  <CommandItem
                    key={o.value}
                    value={`${o.label} ${o.value}`}
                    onSelect={() => { onChange(o.value); setOpen(false); }}
                    className="text-xs"
                  >
                    <Check className={cn("mr-2 h-3.5 w-3.5", value === o.value ? "opacity-100" : "opacity-0")} />
                    {o.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      )}
    </div>
  );
}
