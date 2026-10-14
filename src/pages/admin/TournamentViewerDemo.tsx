import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { TournamentInteractiveViewer } from "@/components/tournaments/viewer/TournamentInteractiveViewer";
import { TournamentViewSwitchesCard } from "@/components/tournaments/viewer/TournamentViewSwitchesCard";

/** Super Admin harness for the shared viewer. Dummy content only — no tournament data is read or written. */
const N = 24;
const names = Array.from({ length: N }, (_, i) => `Player ${String(i + 1).padStart(2, "0")}`);
const cell = (r: number, c: number) => (r === c ? "" : `${(r * 7 + c * 3) % 4}-${(r + c * 5) % 4}`);

export default function TournamentViewerDemo() {
  return (
    <div className="space-y-4 max-w-7xl">
      <Link to="/admin/tournaments" className="inline-flex items-center gap-1 text-xs text-white/70 hover:text-white"><ArrowLeft className="w-3 h-3" /> Tournaments</Link>
      <div>
        <h2 className="text-lg font-semibold text-white">Interactive viewer — test harness</h2>
        <p className="text-xs text-white/55">Dummy data only. Try Expand, zoom, fit width/screen, Ctrl+wheel, drag, pinch on phone, and Esc.</p>
      </div>
      <TournamentViewSwitchesCard />
      <div className="rounded-xl bg-card p-3 text-card-foreground">
        <TournamentInteractiveViewer title="Dummy 24 × 24 grid">
          <table className="border-collapse text-[12px]">
            <thead>
              <tr><th className="sticky left-0 border border-border bg-muted px-2 py-1 text-left">#</th>{names.map((n, i) => <th key={n} className="border border-border bg-muted px-2 py-1 whitespace-nowrap">{i + 1}</th>)}</tr>
            </thead>
            <tbody>
              {names.map((n, r) => (
                <tr key={n}>
                  <th className="border border-border bg-muted px-2 py-1 text-left whitespace-nowrap">{r + 1}. {n}</th>
                  {names.map((_, c) => <td key={c} className={`border border-border px-2 py-1 text-center ${r === c ? "bg-muted" : ""}`}>{cell(r, c)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </TournamentInteractiveViewer>
      </div>
      <div className="rounded-xl bg-card p-3 text-card-foreground">
        <TournamentInteractiveViewer title="Dummy fixed-size board" contentSize={{ width: 1600, height: 700 }} defaultFit="screen">
          <div className="grid h-full w-full grid-cols-8 gap-2 p-2">
            {Array.from({ length: 64 }, (_, i) => (
              <div key={i} className="rounded border border-border bg-muted p-2 text-xs">Slot {i + 1}</div>
            ))}
          </div>
        </TournamentInteractiveViewer>
      </div>
    </div>
  );
}
