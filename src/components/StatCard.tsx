import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  variant?: "default" | "win" | "loss";
}

export function StatCard({ label, value, icon, variant = "default" }: StatCardProps) {
  return (
    <div className={cn(
      "glass-card rounded-lg p-3 flex flex-col items-center gap-1",
      variant === "win" && "border-win/30",
      variant === "loss" && "border-loss/30"
    )}>
      {icon && <div className="text-muted-foreground">{icon}</div>}
      <span className={cn(
        "text-xl font-bold font-heading",
        variant === "win" && "text-win",
        variant === "loss" && "text-loss"
      )}>
        {value}
      </span>
      <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
}
