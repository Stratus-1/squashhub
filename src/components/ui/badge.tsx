import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide shadow-sm ring-1 ring-inset ring-white/10 backdrop-blur-sm transition-all duration-200 hover:-translate-y-px hover:shadow-md active:translate-y-0 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-gradient-to-b from-primary to-primary/85 text-primary-foreground shadow-primary/20 hover:from-primary/95 hover:to-primary/75",
        secondary:
          "border-transparent bg-gradient-to-b from-secondary to-secondary/70 text-secondary-foreground hover:from-secondary/90 hover:to-secondary/60",
        destructive:
          "border-transparent bg-gradient-to-b from-destructive to-destructive/85 text-destructive-foreground shadow-destructive/25 hover:from-destructive/95 hover:to-destructive/75",
        outline:
          "border-border/70 bg-background/60 text-foreground ring-0 hover:bg-accent/30 hover:border-accent/50",
        accent:
          "border-transparent bg-gradient-to-b from-accent to-accent/85 text-accent-foreground shadow-accent/25 hover:from-accent/95 hover:to-accent/75",
        success:
          "border-transparent bg-gradient-to-b from-win to-win/85 text-primary-foreground shadow-[hsl(var(--win))]/25",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
