import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { buildRoundRobinView, rrWhen, type RRMatchInput } from "@/lib/tournaments/round-robin-view";
import { RoundRobinPilotView } from "@/components/tournaments/RoundRobinPilotView";

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
