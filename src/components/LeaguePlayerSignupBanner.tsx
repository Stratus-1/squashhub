import { Trophy, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

interface Props {
  clubSubdomain?: string | null;
  clubName?: string;
}

/**
 * Prominent CTA banner shown on tenant ClubAuth pages and the root landing.
 * Targets NSA league players: free, fast self-signup linked to their seeded
 * roster row. Deep-links to /league with the club preselected when shown
 * inside a tenant context.
 */
export function LeaguePlayerSignupBanner({ clubSubdomain, clubName }: Props) {
  const href = clubSubdomain ? `/league?club=${encodeURIComponent(clubSubdomain)}` : "/league";
  return (
    <Link
      to={href}
      className="block group relative overflow-hidden rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-primary/10 p-4 hover:from-amber-500/15 hover:to-primary/15 transition-all"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
          <Trophy className="w-5 h-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold font-heading leading-tight">
            NSA league player{clubName ? ` at ${clubName}` : ""}?
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            <span className="font-semibold text-amber-700 dark:text-amber-400">Free forever.</span>{" "}
            Sign up in 30 seconds with your NSA number →
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-amber-600 dark:text-amber-400 group-hover:translate-x-0.5 transition-transform" />
      </div>
    </Link>
  );
}
