import { Trophy, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";

interface Props {
  clubSubdomain?: string | null;
  clubName?: string;
  /** Full URL the banner (and its QR code) should link to. */
  signupUrl?: string;
}

/**
 * Compact NSA league player CTA card shown on tenant ClubAuth pages and the
 * root landing. Targets NSA/NSF-numbered players with a clear, high-contrast
 * "register for free" value proposition and an integrated scan-to-join QR code.
 */
export function LeaguePlayerSignupBanner({ clubSubdomain, clubName, signupUrl }: Props) {
  const href =
    signupUrl ||
    (clubSubdomain ? `/league?club=${encodeURIComponent(clubSubdomain)}` : "/league");

  return (
    <Link
      to={href}
      className="block group relative"
      aria-label="Register for free as an NSA league player"
    >
      {/* Ambient glow */}
      <div className="absolute -inset-1 bg-gradient-to-r from-accent to-orange-500 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-700 group-hover:duration-200" />

      <div className="relative flex items-center gap-4 bg-landing-navy/90 border border-white/10 px-4 py-3 rounded-xl backdrop-blur-xl shadow-lg overflow-hidden">
        {/* Content */}
        <div className="relative flex-1 min-w-0 space-y-1">
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-accent/10 border border-accent/20 text-accent text-[10px] font-bold tracking-widest uppercase">
            <Trophy className="w-3 h-3" />
            NSA League
          </div>
          <h2 className="text-white text-sm md:text-base font-bold font-heading tracking-tight leading-snug">
            NSA league player{clubName ? ` at ${clubName}` : ""}?
          </h2>
          <p className="text-white/60 text-xs">
            Register for free to enjoy NSA league functionality.
          </p>
          <div className="flex items-center gap-1 text-accent font-bold group/btn pt-0.5">
            <span className="text-[11px] uppercase tracking-widest">Start registration</span>
            <ArrowRight className="w-4 h-4 transform transition-transform group-hover/btn:translate-x-1" />
          </div>
        </div>

        {/* QR code */}
        <div className="relative flex-shrink-0">
          <div className="bg-white p-1.5 rounded-lg shadow-md transform rotate-2 group-hover:rotate-0 transition-transform duration-500">
            <QRCodeSVG
              value={href}
              size={56}
              bgColor="#ffffff"
              fgColor="#1E3A5F"
              level="M"
            />
          </div>
          <div className="absolute -bottom-1.5 -right-1.5 bg-accent text-accent-foreground px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter shadow">
            Scan to join
          </div>
        </div>
      </div>
    </Link>
  );
}
