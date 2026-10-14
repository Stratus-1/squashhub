import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { buildRoundRobinView, rrWhen, rrSetSummary, type RRMatchInput } from "@/lib/tournaments/round-robin-view";
import { RoundRobinPilotView, poolRankTone } from "@/components/tournaments/RoundRobinPilotView";

const P = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}` }));
/** Circle-method schedule; odd n => one player sits out per round (no bye rows, like Riverside). */
function circle(n: number): RRMatchInput[] {
  const ids = P(n).map((p) => p.id); if (n % 2) ids.push("");
  const out: RRMatchInput[] = []; const k = ids.length;
  for (let r = 0; r < k - 1; r++) {
    for (let i = 0; i < k / 2; i++) { const a = ids[i], b = ids[k - 1 - i]; if (a && b) out.push({ id: `r${r + 1}m${i}`, round: r + 1, a, b, date: "2026-10-19", time: "18:20:00", court: `Court ${i + 1}` }); }
    ids.splice(1, 0, ids.pop()!);
  }
  return out;
}

describe("round-robin pilot view", () => {
  it("shows recorded games won only, mirrored, without changing saved score or totals", () => {
    const m: RRMatchInput = { id: "done", a: "p1", b: "p2", round: 1, winner: "p1", status: "completed", score: "0-11, 11-0, 11-0, 11-0" };
    const before = JSON.stringify(m);
    const view = buildRoundRobinView({ players: P(3), matches: [m, { id: "pending", a: "p1", b: "p3", round: 2 }] });
    expect(view.matrix.p1.p2?.setSummary).toBe("3–1"); expect(view.matrix.p2.p1?.setSummary).toBe("1–3");
    render(<RoundRobinPilotView title="Pool A" view={view} />);
    expect(screen.getByTestId("rr-cell-p1-p2").textContent).toBe("3–1");
    expect(screen.getByTestId("rr-cell-p2-p1").textContent).toBe("1–3");
    expect(screen.getByTestId("rr-cell-p2-p1").className).toContain("rr-matrix-final");
    expect(screen.getByTestId("rr-cell-p1-p3").textContent).toBe("R2");
    expect(view.matrix.p1.p2?.score).toBe(m.score); expect(JSON.stringify(m)).toBe(before);
  });
  it("uses JSON saved sets before score text and supports 3–2 and missing scores", () => {
    const m = { id: "x", round: 1, a: "p1", b: "p2", score: "3-1", gameScores: JSON.stringify({ sets: [{a:11,b:0},{a:0,b:11},{a:11,b:0},{a:0,b:11},{a:11,b:0}], current: {a:8,b:6} }) };
    expect(rrSetSummary(m)).toBe("3–2"); expect(rrSetSummary(m, true)).toBe("2–3");
    expect(rrSetSummary({...m,gameScores:null,score:null})).toBeNull();
  });
  it("never gives live or pending cells final tint or a completed set count", () => {
    const view = buildRoundRobinView({ players: P(2), matches: [{ id:"live",a:"p1",b:"p2",round:1,status:"in_progress",score:"11-0" }] });
    render(<RoundRobinPilotView title="Pool A" view={view} />);
    expect(screen.getByTestId("rr-cell-p1-p2").getAttribute("data-state")).toBe("live");
    expect(screen.getByTestId("rr-cell-p1-p2").className).not.toContain("rr-matrix-final");
    expect(view.matrix.p1.p2?.setSummary).toBeNull();
  });
  it("resets display bands independently per pool without sorting standings", () => {
    expect(Array.from({ length: 5 }, (_, i) => poolRankTone(i, 5))).toEqual([0, 1, 2, 3, 4]);
    expect(poolRankTone(0, 6)).toBe(0); expect(poolRankTone(5, 6)).toBe(4);
    expect(poolRankTone(0, 1)).toBe(2);
  });
  it("gives rounds distinct restrained accents without changing schedule or results", () => {
    const view = buildRoundRobinView({ players: P(5), matches: circle(5) });
    const before = JSON.stringify(view);
    const { container } = render(<RoundRobinPilotView title="Pool A" view={view} />);
    expect([...container.querySelectorAll(".round-panel")].map(r => r.getAttribute("data-round-tone"))).toEqual(["1", "2", "3", "4", "5"]);
    expect(JSON.stringify(view)).toBe(before);
  });
  it("6-player pool: full matrix, 5 rounds of 3, diagonal empty, schedule shown", () => {
    const v = buildRoundRobinView({ players: P(6), matches: circle(6) });
    expect(v.rounds.map((r) => r.label)).toEqual(["Round 1", "Round 2", "Round 3", "Round 4", "Round 5"]);
    expect(v.rounds.every((r) => r.matches.length === 3 && r.sittingOut.length === 0)).toBe(true);
    for (const a of P(6)) for (const b of P(6)) expect(!!v.matrix[a.id][b.id]).toBe(a.id !== b.id);
    expect(v.rounds[0].matches[0].when).toBe("Mon 19 Oct 18:20 · Court 1");
    expect(v.issues).toEqual([]);
  });
  it("odd entrants: one player sits out each round, each exactly once", () => {
    const v = buildRoundRobinView({ players: P(5), matches: circle(5) });
    expect(v.rounds).toHaveLength(5);
    const out = v.rounds.flatMap((r) => r.sittingOut);
    expect(out).toHaveLength(5); expect(new Set(out).size).toBe(5);
  });
  it("matrix and order of play agree on results; scores mirror; totals from same matches", () => {
    const ms = circle(4); ms[0] = { ...ms[0], winner: ms[0].b, score: "15-18", status: "completed" };
    const v = buildRoundRobinView({ players: P(4), matches: ms, rankOrder: [ms[0].b!, ms[0].a!] });
    const { a, b } = ms[0] as { a: string; b: string };
    expect(v.matrix[b][a]).toMatchObject({ result: "W", score: "18-15" });
    expect(v.matrix[a][b]).toMatchObject({ result: "L", score: "15-18" });
    expect(v.totals[b]).toMatchObject({ wins: 1, pointsFor: 18, pointsAgainst: 15 });
    expect(v.players[0].id).toBe(b); // order follows supplied official standings
    expect(v.rounds[0].status).toBe("in_progress");
    expect(v.rounds[0].matches[0]).toMatchObject({ status: "played", winner: b });
  });
  it("multiple pools stay separate and flag outsiders", () => {
    const v = buildRoundRobinView({ players: P(3), matches: [{ id: "x", round: 1, a: "p1", b: "p9" }] });
    expect(v.issues[0]).toMatch(/outside this pool/);
  });
  it("schedule text: saved values, explicit play-by, otherwise not scheduled", () => {
    expect(rrWhen({ playBy: "2026-11-25" })).toBe("Play by Wed 25 Nov");
    expect(rrWhen({})).toBe("Not scheduled");
  });
  it("renders matrix and order of play read-only", () => {
    render(<RoundRobinPilotView title="Ladies A · Pool C" view={buildRoundRobinView({ players: P(6), matches: circle(6) })} />);
    expect(screen.getByTestId("rr-matrix")).toBeTruthy();
    expect(screen.getByTestId("rr-order-of-play").textContent).toContain("Round 5");
    expect(screen.queryByRole("button", { name: /save|enter result/i })).toBeNull();
  });
});
