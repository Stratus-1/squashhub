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
 * Prominent NSA league player CTA card shown on tenant ClubAuth pages and the
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
      <div className="absolute -inset-1 bg-gradient-to-r from-accent to-orange-500 rounded-[2rem] blur opacity-25 group-hover:opacity-45 transition duration-700 group-hover:duration-200" />

      <div className="relative flex flex-col md:flex-row items-center gap-6 md:gap-8 bg-landing-navy/90 border border-white/10 p-6 md:p-8 rounded-[1.5rem] backdrop-blur-xl shadow-2xl overflow-hidden">
        {/* Decorative ambient orbs */}
        <div className="absolute -top-16 -right-16 w-48 h-48 bg-accent/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-orange-500/5 rounded-full blur-3xl" />

        {/* Content */}
        <div className="relative flex-1 space-y-4 text-center md:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-bold tracking-widest uppercase">
            <Trophy className="w-4 h-4" />
            NSA League Access
          </div>

          <div className="space-y-1">
            <h2 className="text-white text-2xl md:text-3xl font-extrabold font-heading tracking-tight leading-tight">
              NSA league player{clubName ? ` at ${clubName}` : ""}?
            </h2>
            <p className="text-white/70 text-base md:text-lg">
              Register for free to enjoy NSA league functionality.
            </p>
          </div>

          <div className="flex items-center justify-center md:justify-start gap-2 text-accent font-bold group/btn">
            <span className="text-sm uppercase tracking-widest">Start registration</span>
            <ArrowRight className="w-5 h-5 transform transition-transform group-hover/btn:translate-x-1.5" />
          </div>
        </div>

        {/* QR code */}
        <div className="relative flex-shrink-0">
          <div className="bg-white p-3 rounded-2xl shadow-xl transform rotate-2 group-hover:rotate-0 transition-transform duration-500">
            <QRCodeSVG
              value={href}
              size={120}
              bgColor="#ffffff"
              fgColor="#1E3A5F"
              level="M"
            />
          </div>
          <div className="absolute -bottom-2 -right-2 bg-accent text-accent-foreground px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-tighter shadow-lg">
            Scan to join
          </div>
        </div>
      </div>
    </Link>
  );
}
