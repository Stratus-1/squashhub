import { useState, type ComponentType } from "react";
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface AdminNavigationItem {
  value: string;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  needsSetup?: boolean;
}

export function ClubAdminNavigation({ operations, setup, activeTab, onSelect, compact = false, onCompactChange }: {
  operations: AdminNavigationItem[];
  setup: AdminNavigationItem[];
  activeTab: string;
  onSelect: (value: string) => void;
  compact?: boolean;
  onCompactChange?: () => void;
}) {
  const [operationsOpen, setOperationsOpen] = useState(true);
  const [setupOpen, setSetupOpen] = useState(false);
  const attentionCount = setup.filter(item => item.needsSetup).length;
  const group = (title: string, items: AdminNavigationItem[], open: boolean, toggle: () => void, attention = 0) => {
    if (!items.length) return null;
    return <section aria-label={title} className="space-y-1">
      <Button type="button" variant="ghost" onClick={toggle} aria-expanded={open}
        title={compact ? title : undefined}
        className={cn("h-auto min-h-9 w-full justify-start rounded-md px-2 text-xs", compact && "justify-center px-1")}>
        <ChevronDown className={cn("size-3.5 shrink-0 transition-transform motion-reduce:transition-none", !open && "-rotate-90")} />
        <span className={cn("flex-1 text-left font-semibold", title === "Club operations" ? "text-foreground" : "text-muted-foreground", compact && "sr-only")}>{title}</span>
        {attention > 0 && <span aria-label={`${attention} setup items need attention`} className="shrink-0 rounded-sm bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning-foreground">{attention}</span>}
      </Button>
      {open && <div className="space-y-0.5">{items.map(item => {
        const active = activeTab === item.value;
        const Icon = item.icon;
        return <Button key={item.value} type="button" variant="ghost" aria-current={active ? "page" : undefined}
          aria-label={item.label} title={compact ? `${item.label}${item.needsSetup ? " — Needs setup" : ""}` : undefined}
          onClick={() => onSelect(item.value)}
          className={cn("group relative h-auto min-h-11 w-full justify-start gap-2 rounded-md px-2 py-2 text-left", active && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary", compact && "justify-center px-1")}>
          <Icon className="size-4 shrink-0" strokeWidth={1.75} />
          {!compact && <span className="min-w-0 flex-1 whitespace-normal"><span className="block text-xs font-semibold">{item.label}</span><span className="block text-[11px] font-normal text-muted-foreground">{item.description}</span></span>}
          {item.needsSetup && <span aria-label="Needs setup" className={cn("size-1.5 shrink-0 rounded-full bg-warning", compact && "absolute right-1 top-1")} />}
          {!compact && <span aria-hidden className="text-xs text-muted-foreground">→</span>}
        </Button>;
      })}</div>}
    </section>;
  };
  return <div className="space-y-4">
    {onCompactChange && <div className="flex justify-end"><Button type="button" variant="ghost" size="icon" className="size-8" onClick={onCompactChange}
      aria-label={compact ? "Expand admin navigation" : "Collapse admin navigation"} title={compact ? "Expand admin navigation" : "Collapse admin navigation"}>
      {compact ? <PanelLeftOpen /> : <PanelLeftClose />}
    </Button></div>}
    {group("Club operations", operations, operationsOpen, () => setOperationsOpen(value => !value))}
    {group("Setup & configuration", setup, setupOpen, () => setSetupOpen(value => !value), attentionCount)}
  </div>;
}