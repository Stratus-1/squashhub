import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Maximize } from "lucide-react";
import { rpcExt } from "@/lib/supabase-ext";

type Board = {
  club: { name: string; logo_url: string | null };
  date: string;
  courts: { id: number; name: string }[];
  bookings: { court_id: number; start: string; end: string; type: string | null; label: string }[];
};

const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const nowSast = () => { const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Johannesburg" })); return d.getHours() * 60 + d.getMinutes(); };

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
      <header className="flex items-center gap-4">
        {data.club.logo_url && <img src={data.club.logo_url} alt="" className="h-14 w-14 object-contain rounded" />}
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{data.club.name}</h1>
          <p className="text-lg text-muted-foreground">Court bookings · {dateLabel}</p>
        </div>
        <div className="text-5xl font-bold tabular-nums text-primary">{hhmm(now)}</div>
        <button aria-label="Full screen" className="p-2 text-muted-foreground hover:text-foreground" onClick={() => document.documentElement.requestFullscreen?.()}>
          <Maximize className="w-6 h-6" />
        </button>
      </header>

      <div className="flex-1 flex min-h-0 rounded-xl border border-border overflow-hidden">
        <div className="w-16 shrink-0 relative border-r border-border">
          {hours.map((h) => <div key={h} className="absolute left-0 right-0 text-sm text-muted-foreground px-1 -translate-y-1/2" style={{ top: pct(h) }}>{h > start ? hhmm(h) : ""}</div>)}
        </div>
        {data.courts.map((c) => (
          <div key={c.id} className="flex-1 flex flex-col min-w-0 border-r border-border last:border-r-0">
            <div className="text-center font-semibold text-xl py-2 border-b border-border bg-muted/40 truncate px-2">{c.name}</div>
            <div className="flex-1 relative">
              {hours.map((h) => <div key={h} className="absolute left-0 right-0 border-t border-border/50" style={{ top: pct(h) }} />)}
              {data.bookings.filter((b) => b.court_id === c.id).map((b, i) => {
                const s = toMin(b.start), e = toMin(b.end), live = now >= s && now < e, past = now >= e;
                return (
                  <div key={i} className={`absolute left-1 right-1 rounded-md px-2 py-1 overflow-hidden border ${live ? "bg-primary text-primary-foreground border-primary" : past ? "bg-muted text-muted-foreground border-border opacity-60" : "bg-accent text-accent-foreground border-border"}`}
                    style={{ top: pct(s), height: `calc(${((e - s) / span) * 100}% - 2px)` }}>
                    <div className="text-sm font-semibold tabular-nums">{b.start.slice(0, 5)}–{b.end.slice(0, 5)}</div>
                    <div className="text-base font-medium truncate">{b.label}</div>
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
