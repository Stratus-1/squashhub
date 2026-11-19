import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ORG_LEVEL_STYLES, orgLevel } from "@/lib/federation/org-kind-style";

const SHORT: Record<string, string> = { association: "Association", provincial: "Provincial" };

/** Coloured level badge (club / association / provincial / zone / national). */
export function OrgKindBadge({ kind, className, short = true }: { kind: string; className?: string; short?: boolean }) {
  const level = orgLevel(kind);
  const s = ORG_LEVEL_STYLES[level];
  const Icon = s.icon;
  return (
    <Badge variant="outline" className={cn("gap-1 text-[10px] font-medium", s.badgeClass, className)}>
      <Icon className="w-2.5 h-2.5" />
      {short ? SHORT[level] ?? s.label : s.label}
    </Badge>
  );
}
