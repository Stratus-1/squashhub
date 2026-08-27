import { QRCodeSVG } from "qrcode.react";
import { Trophy } from "lucide-react";

interface Props {
  /** Absolute or relative URL to the league self-signup page. */
  url: string;
  /** Visual tone — "onDark" for the club landing hero, "default" for cards. */
  tone?: "default" | "onDark";
  size?: number;
}

/**
 * NSA league player QR — only rendered for clubs affiliated with the NSA.
 * Scanning takes an NSA/NSF-numbered player straight to /league where they
 * self-register for free against their existing roster row.
 */
export function NsaLeagueQrCard({ url, tone = "default", size = 104 }: Props) {
  const onDark = tone === "onDark";
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="rounded-xl bg-white p-2 shadow-sm">
        <QRCodeSVG value={url} size={size} bgColor="#ffffff" fgColor="#1E3A5F" level="M" />
      </div>
      <span
        className={`text-[11px] font-medium text-center leading-tight ${
          onDark ? "text-white/70" : "text-muted-foreground"
        }`}
      >
        <Trophy className="inline w-3 h-3 mr-1 text-amber-500" />
        NSA league player sign-up
      </span>
    </div>
  );
}
