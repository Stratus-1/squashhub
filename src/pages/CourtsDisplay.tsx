import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Maximize } from "lucide-react";
import { rpcExt } from "@/lib/supabase-ext";

type Board = {
  club: { name: string; logo_url: string | null; slot_minutes: number | null; open_time: string | null; last_slot_time: string | null };
  date: string;
  courts: { id: number; name: string }[];
  bookings: { court_id: number; start: string; end: string; type: string | null; label: string }[];
};

const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const nowSast = () => { const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Johannesburg" })); return d.getHours() * 60 + d.getMinutes(); };

const GENERIC_WORDS = /^(squash|squashing|club|tc|tennis|racket|sports|association|federation|academy)$/i;

/** Short club monogram used when the club has no logo on file. */
function clubMonogram(name: string) {
  const words = name.split(/\s+/).filter(Boolean);
  const meaningful = words.filter((w) => !GENERIC_WORDS.test(w.replace(/[^\w]/g, "")));
  const source = meaningful.length ? meaningful : words;
  if (source.length === 1) return source[0].replace(/[^\w]/g, "").slice(0, 2).toUpperCase();
  const monogram = source.slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  return monogram || name.slice(0, 2).toUpperCase();
}

/** Club badge: the uploaded logo on a light tile so dark logos stay readable, or a monogram. */
function ClubMark({ logoUrl, name }: { logoUrl: string | null; name: string }) {
  const [broken, setBroken] = useState(false);
  if (logoUrl && !broken) {
    return <img src={logoUrl} alt={`${name} logo`} onError={() => setBroken(true)}
      className="h-11 w-11 sm:h-16 sm:w-16 shrink-0 rounded-xl border border-border bg-white/95 p-1.5 object-contain" />;
  }
  return <div aria-hidden className="grid h-11 w-11 sm:h-16 sm:w-16 shrink-0 place-items-center rounded-xl bg-accent text-lg sm:text-2xl font-extrabold text-accent-foreground">
    {clubMonogram(name)}
  </div>;
}

/** Public, view-only full-screen court schedule for today. No booking actions. */
export default function CourtsDisplay() {
  const { token = "" } = useParams();
  const [now, setNow] = useState(nowSast());
  useEffect(() => { document.documentElement.classList.add("dark"); const i = setInterval(() => setNow(nowSast()), 30000); return () => clearInterval(i); }, []);
  const { data, isLoading } = useQuery({
    queryKey: ["courts-display", token],
    queryFn: async () => { const { data, error } = await rpcExt("court_display_board", { _token: token }); if (error) throw error; return data as Board | null; },
    refetchInterval: 60000,
  });

  if (isLoading) return <div className="min-h-screen bg-background" />;
  if (!data) return <div className="min-h-screen bg-background text-foreground grid place-items-center text-xl">This display link is not valid or has been disabled.</div>;

  const times = data.bookings.flatMap((b) => [toMin(b.start), toMin(b.end)]);
  const start = Math.min(6 * 60, ...times.length ? [Math.floor(Math.min(...times) / 60) * 60] : []);
  const end = Math.max(22 * 60, ...times.length ? [Math.ceil(Math.max(...times) / 60) * 60] : []);
  const span = end - start;
  const hours = Array.from({ length: span / 60 }, (_, i) => start + i * 60);
  const pct = (m: number) => `${((m - start) / span) * 100}%`;
  const dateLabel = new Date(data.date + "T12:00:00").toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="h-screen w-screen overflow-hidden bg-background text-foreground flex flex-col p-4 gap-3 select-none">
      <header className="relative flex items-center gap-3 sm:gap-4 overflow-hidden rounded-xl border border-border bg-card/60 px-3 py-2.5 sm:px-5 sm:py-3.5">
        <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-accent" />
        <ClubMark logoUrl={data.club.logo_url} name={data.club.name} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl sm:text-3xl font-extrabold tracking-tight md:text-4xl">{data.club.name}</h1>
          <p className="truncate text-base text-muted-foreground md:text-lg">Court bookings · {dateLabel}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-2xl sm:text-5xl font-extrabold tabular-nums text-accent md:text-6xl">{hhmm(now)}</div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">SAST</div>
        </div>
        <button aria-label="Full screen" className="shrink-0 p-2 text-muted-foreground hover:text-foreground" onClick={() => document.documentElement.requestFullscreen?.()}>
          <Maximize className="w-6 h-6" />
        </button>
      </header>

      <div className="flex-1 flex min-h-0 rounded-xl border border-border overflow-hidden">
        <div className="w-16 shrink-0 flex flex-col border-r border-border">
          {/* Spacer matching the court header row so hour labels line up with the booking grid. */}
          <div aria-hidden className="text-xl py-2 border-b border-border bg-muted/40 invisible">&nbsp;</div>
          <div className="flex-1 relative">
            {hours.map((h) => <div key={h} className="absolute left-0 right-0 text-sm leading-none text-muted-foreground px-1 pt-1" style={{ top: pct(h) }}>{hhmm(h)}</div>)}
          </div>
        </div>
        {data.courts.map((c) => (
          <div key={c.id} className="flex-1 flex flex-col min-w-0 border-r border-border last:border-r-0">
            <div className="text-center font-semibold text-xl py-2 border-b border-border bg-muted/40 truncate px-2">{c.name}</div>
            <div className="flex-1 relative">
              {hours.map((h) => <div key={h} className="absolute left-0 right-0 border-t border-border/50" style={{ top: pct(h) }} />)}
              {data.bookings.filter((b) => b.court_id === c.id).map((b, i) => {
                const s = toMin(b.start), e = toMin(b.end), live = now >= s && now < e, past = now >= e;
                return (
                  <div key={i} className={`absolute left-1 right-1 rounded-md px-2 py-1 overflow-hidden border flex items-center ${live ? "bg-primary text-primary-foreground border-primary" : past ? "bg-muted text-muted-foreground border-border opacity-60" : "bg-accent text-accent-foreground border-border"}`}
                    style={{ top: pct(s), height: `calc(${((e - s) / span) * 100}% - 2px)` }}>
                    <div className="text-base font-medium truncate">{b.label || "Booked"}</div>
                  </div>
                );
              })}
              {now >= start && now <= end && <div className="absolute left-0 right-0 h-0.5 bg-destructive z-10" style={{ top: pct(now) }} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
