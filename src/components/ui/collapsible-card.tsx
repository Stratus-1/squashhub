import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface CollapsibleCardProps {
  title: ReactNode;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  titleClassName?: string;
  contentClassName?: string;
  defaultOpen?: boolean;
}

/** Card whose body collapses when the header is clicked. */
export function CollapsibleCard({
  title,
  children,
  className,
  headerClassName,
  titleClassName,
  contentClassName,
  defaultOpen = true,
}: CollapsibleCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className={className}>
        <CollapsibleTrigger asChild>
          <CardHeader
            className={cn(
              "pb-2 cursor-pointer select-none flex-row items-center justify-between space-y-0 gap-2",
              headerClassName
            )}
          >
            <CardTitle className={cn("text-base", titleClassName)}>{title}</CardTitle>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180"
              )}
            />
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className={contentClassName}>{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

interface CollapsibleSectionProps {
  header: ReactNode;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
}

/** Lightweight collapsible block (no card chrome) with a clickable header row. */
export function CollapsibleSection({
  header,
  children,
  className,
  defaultOpen = true,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className={className}>
      <CollapsibleTrigger asChild>
        <div className="flex flex-wrap items-center gap-2 cursor-pointer select-none">
          {header}
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180"
            )}
          />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 pt-2">{children}</CollapsibleContent>
    </Collapsible>
  );
}
