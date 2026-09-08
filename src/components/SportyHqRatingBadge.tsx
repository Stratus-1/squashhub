import { cn } from "@/lib/utils";
import type { SportyHqRating } from "@/hooks/use-sportyhq-ratings";

/**
 * Compact national strength indicator: SportyHQ rating and, when published,
 * the player's position in the SSA national ranking list.
 */
export function SportyHqRatingBadge({
  rating,
  className,
}: {
  rating: SportyHqRating | undefined;
  className?: string;
}) {
  if (!rating || (rating.rating == null && rating.nationalPosition == null)) return null;

  const title = [
    rating.rating != null ? `SportyHQ rating ${Math.round(rating.rating)}` : null,
    rating.confidence != null ? `${Math.round(rating.confidence)}% confidence` : null,
    rating.nationalPosition != null ? `${rating.nationalLabel ?? "National"} #${rating.nationalPosition}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <span
      title={title}
      className={cn(
        "shrink-0 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0 text-[9px] font-bold leading-tight text-primary",
        className,
      )}
    >
      {rating.rating != null ? Math.round(rating.rating) : "—"}
      {rating.nationalPosition != null && (
        <span className="ml-1 font-semibold opacity-80">SA #{rating.nationalPosition}</span>
      )}
    </span>
  );
}
