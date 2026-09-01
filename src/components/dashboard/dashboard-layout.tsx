import * as React from "react";
import { TrendingDownIcon, TrendingUpIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Shared dashboard shell primitives, modelled on the shadcn `dashboard-01`
 * block so every SquashHub dashboard (member, club admin, super admin)
 * shares the same rhythm: container queries, 4/6 gap scale and 4/6 padding.
 *
 * These only affect layout — page content and data stay exactly as-is.
 */
export function DashboardMain({
  children,
  className,
  /** Constrain to the standard high-density 7xl column. */
  constrained = true,
}: {
  children: React.ReactNode;
  className?: string;
  constrained?: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div
          className={cn(
            "flex flex-col gap-4 py-4 md:gap-6 md:py-6",
            constrained && "w-full max-w-7xl mx-auto",
            className,
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export type DashboardStat = {
  label: string;
  value: React.ReactNode;
  /** Small pill in the top-right, e.g. "+12.5%". */
  badge?: string;
  /** Direction of the badge trend. */
  trend?: "up" | "down";
  /** Bold line under the value. */
  headline?: React.ReactNode;
  /** Muted supporting line. */
  hint?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
};

/**
 * dashboard-01 style stat card grid. Values are supplied by the caller so
 * each dashboard keeps using its own real data.
 */
export function DashboardStatCards({
  stats,
  tone = "light",
  className,
}: {
  stats: DashboardStat[];
  /** `dark` matches the super-admin glass shell. */
  tone?: "light" | "dark";
  className?: string;
}) {
  const dark = tone === "dark";
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4",
        !dark &&
          "*:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs dark:*:data-[slot=card]:bg-card",
        className,
      )}
    >
      {stats.map((s) => {
        const Icon = s.icon;
        const TrendIcon = s.trend === "down" ? TrendingDownIcon : TrendingUpIcon;
        return (
          <Card
            key={s.label}
            className={cn(
              "@container/card",
              dark &&
                "bg-[hsl(220_45%_8%/0.85)] border-white/10 backdrop-blur-md text-white",
            )}
          >
            <CardHeader className="relative">
              <CardDescription className={cn(dark && "text-white/60")}>
                {s.label}
              </CardDescription>
              <CardTitle
                className={cn(
                  "text-2xl font-semibold tabular-nums @[250px]/card:text-3xl",
                  dark && "text-white",
                )}
              >
                {s.value}
              </CardTitle>
              <div className="absolute right-4 top-4">
                {s.badge ? (
                  <Badge
                    variant="outline"
                    className={cn(
                      "flex gap-1 rounded-lg text-xs",
                      dark && "border-white/15 text-white/80",
                    )}
                  >
                    <TrendIcon className="size-3" />
                    {s.badge}
                  </Badge>
                ) : Icon ? (
                  <Icon
                    className={cn(
                      "size-5",
                      dark ? "text-white/50" : "text-muted-foreground",
                    )}
                  />
                ) : null}
              </div>
            </CardHeader>
            {(s.headline || s.hint) && (
              <CardFooter className="flex-col items-start gap-1 text-sm">
                {s.headline && (
                  <div
                    className={cn(
                      "line-clamp-1 flex gap-2 font-medium",
                      dark && "text-white/90",
                    )}
                  >
                    {s.headline}
                    {s.trend && <TrendIcon className="size-4" />}
                  </div>
                )}
                {s.hint && (
                  <div className={cn(dark ? "text-white/50" : "text-muted-foreground")}>
                    {s.hint}
                  </div>
                )}
              </CardFooter>
            )}
          </Card>
        );
      })}
    </div>
  );
}
