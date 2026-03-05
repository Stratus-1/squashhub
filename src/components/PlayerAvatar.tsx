import { cn } from "@/lib/utils";

interface PlayerAvatarProps {
  initials: string;
  rank?: number | null;
  size?: "sm" | "md" | "lg";
}

export function PlayerAvatar({ initials, rank, size = "md" }: PlayerAvatarProps) {
  const sizeClasses = {
    sm: "w-8 h-8 text-xs",
    md: "w-10 h-10 text-sm",
    lg: "w-14 h-14 text-lg",
  };

  return (
    <div className="relative">
      <div className={cn(
        "rounded-full bg-primary flex items-center justify-center font-heading font-bold text-primary-foreground",
        sizeClasses[size]
      )}>
        {initials}
      </div>
      {rank && (
        <span className="absolute -bottom-1 -right-1 bg-accent text-accent-foreground text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-card">
          {rank}
        </span>
      )}
    </div>
  );
}
