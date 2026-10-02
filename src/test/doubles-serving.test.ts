import { describe, it, expect } from "vitest";
import {
  afterRally, overrideServer, pairDisplayName, resolveDoublesPairs, restoreDoublesState,
  servingBanner, startDoubles, evenOddSide, startNextGame, type DoublesServeState, type PairPositions,
} from "@/lib/marker/doubles-serving";
import { effectiveTournamentSettings } from "@/lib/tournaments/effective-settings";

// Pair A = [Dave, Ann]; Ann plays Forehand (slot 1). Pair B = [Bob, Cara]; Bob Forehand (slot 0).
const pairs = { a: ["Dave", "Ann"] as [string, string], b: ["Bob", "Cara"] as [string, string] };
const positions: PairPositions = { a: { forehand: 1 }, b: { forehand: 0 } };
const who = (s: DoublesServeState) => pairs[s.team][s.server];

describe("Second server", () => {
  it("each pair's sequence is Forehand RIGHT → Backhand LEFT, then the opposing pair", () => {
    let s = startDoubles({ method: "second_server", positions, servingTeam: "a" });
    expect([who(s), s.side, s.hand]).toEqual(["Ann", "R", 1]);
    s = afterRally(s, "a", { a: 1, b: 0 });
    expect([who(s), s.side]).toEqual(["Ann", "R"]); // not parity-based
    s = afterRally(s, "b", { a: 1, b: 0 });
    expect([who(s), s.side, s.hand]).toEqual(["Dave", "L", 2]);
    s = afterRally(s, "a", { a: 2, b: 0 });
    expect([who(s), s.side]).toEqual(["Dave", "L"]);
    s = afterRally(s, "b", { a: 2, b: 0 });
    expect([who(s), s.side, s.hand]).toEqual(["Bob", "R", 1]);
    s = afterRally(s, "a", { a: 2, b: 0 });
    expect([who(s), s.side, s.hand]).toEqual(["Cara", "L", 2]);
  });
  it("always restarts a pair's sequence with Forehand RIGHT (no alternating memory)", () => {
    let s = startDoubles({ method: "second_server", positions, servingTeam: "a" });
    s = afterRally(s, "b", { a: 0, b: 0 }); // Dave
    s = afterRally(s, "b", { a: 0, b: 0 }); // → B
    s = afterRally(s, "a", { a: 0, b: 0 }); // Cara
    s = afterRally(s, "a", { a: 0, b: 0 }); // → A again
    expect([who(s), s.side, s.hand]).toEqual(["Ann", "R", 1]);
    s = afterRally(s, "b", { a: 0, b: 0 });
    expect([who(s), s.side]).toEqual(["Dave", "L"]);
  });
});

describe("Even / Odd", () => {
  it.each([
    [{ a: 7, b: 5 }, "R"], [{ a: 7, b: 6 }, "L"], [{ a: 0, b: 0 }, "R"], [{ a: 5, b: 7 }, "R"], [{ a: 0, b: 1 }, "L"],
  ] as const)("side comes from the combined score %o → %s", (scores, side) => {
    expect(evenOddSide(scores)).toBe(side);
    // Same answer whichever pair is serving.
    expect(startDoubles({ method: "even_odd", positions, servingTeam: "a", scores }).side).toBe(side);
    expect(startDoubles({ method: "even_odd", positions, servingTeam: "b", scores }).side).toBe(side);
  });
  it("7-5 with the serving pair on 7 shows SERVE RIGHT (regression)", () => {
    let s = startDoubles({ method: "even_odd", positions, servingTeam: "a", scores: { a: 6, b: 5 } });
    s = afterRally(s, "a", { a: 7, b: 5 });
    expect(servingBanner(s, pairs)).toBe("Ann — SERVE RIGHT");
  });
  it("receiving pair's first server is its Forehand; side from combined score", () => {
    let s = startDoubles({ method: "even_odd", positions, servingTeam: "b" });
    expect([who(s), s.side]).toEqual(["Bob", "R"]);
    s = afterRally(s, "b", { a: 0, b: 1 });
    expect([who(s), s.side]).toEqual(["Bob", "L"]);
    s = afterRally(s, "a", { a: 1, b: 1 }); // A's first turn → Forehand Ann, total 2 → RIGHT
    expect([who(s), s.side]).toEqual(["Ann", "R"]);
  });
  it("partners alternate on successive service turns, independent of side parity", () => {
    let s = startDoubles({ method: "even_odd", positions, servingTeam: "a" });
    expect([who(s), s.side]).toEqual(["Ann", "R"]);
    s = afterRally(s, "b", { a: 0, b: 1 });
    expect([who(s), s.side]).toEqual(["Bob", "L"]);
    s = afterRally(s, "a", { a: 1, b: 1 }); // A's 2nd turn → Dave (Backhand), total 2 → RIGHT
    expect([who(s), s.side]).toEqual(["Dave", "R"]);
    s = afterRally(s, "a", { a: 2, b: 1 });
    expect([who(s), s.side]).toEqual(["Dave", "L"]); // same server keeps serving, box changes
    s = afterRally(s, "b", { a: 2, b: 2 }); // B's 2nd turn → Cara, total 4 → RIGHT
    expect([who(s), s.side]).toEqual(["Cara", "R"]);
    s = afterRally(s, "a", { a: 3, b: 2 }); // A's 3rd turn → Ann, total 5 → LEFT
    expect([who(s), s.side]).toEqual(["Ann", "L"]);
  });
});

describe("By position", () => {
  it("Forehand RIGHT, next turn Backhand LEFT, alternating thereafter", () => {
    let s = startDoubles({ method: "by_position", positions, servingTeam: "a" });
    expect([who(s), s.side]).toEqual(["Ann", "R"]);
    s = afterRally(s, "a", { a: 1, b: 0 });
    expect([who(s), s.side]).toEqual(["Ann", "R"]); // side fixed by position
    s = afterRally(s, "b", { a: 1, b: 1 });
    expect([who(s), s.side]).toEqual(["Bob", "R"]);
    s = afterRally(s, "a", { a: 2, b: 1 });
    expect([who(s), s.side]).toEqual(["Dave", "L"]);
    s = afterRally(s, "b", { a: 2, b: 2 });
    expect([who(s), s.side]).toEqual(["Cara", "L"]);
    s = afterRally(s, "a", { a: 3, b: 2 });
    expect([who(s), s.side]).toEqual(["Ann", "R"]);
  });
});

describe("new game", () => {
  it.each(["even_odd", "by_position"] as const)("%s resets each pair to its Forehand first server", (method) => {
    let s = startDoubles({ method, positions, servingTeam: "a" });
    s = afterRally(s, "b", { a: 0, b: 1 });
    s = afterRally(s, "a", { a: 1, b: 1 }); // Dave (Backhand) now serving for A
    expect(who(s)).toBe("Dave");
    s = startNextGame(s, "a");
    expect([who(s), s.side]).toEqual(["Ann", "R"]);
    s = afterRally(s, "b", { a: 0, b: 1 });
    expect(who(s)).toBe("Bob"); // B also reset to Forehand
  });
  it("last server does not carry over and the method never picks the serving pair", () => {
    let s = startDoubles({ method: "even_odd", positions, servingTeam: "b" });
    s = afterRally(s, "a", { a: 11, b: 9 }); // A won the game with Ann serving
    // Caller decides which pair is entitled to serve; module obeys it.
    const toB = startNextGame(s, "b");
    expect([toB.team, who(toB), toB.side]).toEqual(["b", "Bob", "R"]);
    const toA = startNextGame(s, "a");
    expect([toA.team, who(toA), toA.prevServer.b]).toEqual(["a", "Ann", null]);
  });
  it("second server starts a fresh Forehand RIGHT sequence", () => {
    let s = startDoubles({ method: "second_server", positions, servingTeam: "a" });
    s = afterRally(s, "b", { a: 0, b: 0 }); // Dave (2nd)
    s = startNextGame(s, "b");
    expect([who(s), s.side, s.hand]).toEqual(["Bob", "R", 1]);
  });
});

describe("resume + override", () => {
  it("round-trips through JSON (refresh)", () => {
    let s = startDoubles({ method: "by_position", positions, servingTeam: "b" });
    s = afterRally(s, "a", { a: 1, b: 0 });
    const restored = restoreDoublesState(JSON.parse(JSON.stringify(s)), "by_position");
    expect(restored).toEqual(s);
    expect(who(restored!)).toBe("Ann");
  });
  it("rejects state saved under a different method or malformed", () => {
    const s = startDoubles({ method: "even_odd", positions, servingTeam: "a" });
    expect(restoreDoublesState(s, "second_server")).toBeNull();
    expect(restoreDoublesState({ foo: 1 }, "even_odd")).toBeNull();
    expect(restoreDoublesState(s, null)).toBeNull();
  });
  it("override updates internal state so following rallies use it", () => {
    let s = startDoubles({ method: "second_server", positions, servingTeam: "a" });
    s = overrideServer(s, { team: "b", server: 1, scores: { a: 0, b: 0 } }); // Cara = Backhand → 2nd server
    expect([who(s), s.side, s.hand]).toEqual(["Cara", "L", 2]);
    s = afterRally(s, "a", { a: 1, b: 0 });
    expect([who(s), s.side, s.hand]).toEqual(["Ann", "R", 1]);

    let e = startDoubles({ method: "even_odd", positions, servingTeam: "a" });
    e = overrideServer(e, { team: "a", server: 0, side: "L", scores: { a: 0, b: 0 } });
    expect([who(e), e.side]).toEqual(["Dave", "L"]);
    e = afterRally(e, "b", { a: 0, b: 1 });
    e = afterRally(e, "a", { a: 1, b: 1 });
    expect(who(e)).toBe("Ann"); // alternates from the corrected server
  });
});

describe("display + singles", () => {
  it("shows both players and the server banner", () => {
    const s = startDoubles({ method: "second_server", positions, servingTeam: "b" });
    expect(pairDisplayName(pairs.a)).toBe("Dave & Ann");
    expect(servingBanner(s, pairs)).toBe("Bob — SERVE RIGHT");
  });
  it("resolves pairs for doubles configs and never for singles", () => {
    expect(resolveDoublesPairs({ isDoubles: false, playerA: { name: "X" }, playerB: { name: "Y" } })).toBeNull();
    expect(resolveDoublesPairs({ isDoubles: true, playerA: { name: "X" }, playerB: { name: "Y" } })).toBeNull();
    expect(resolveDoublesPairs({
      playerA: { name: "Dave & Ann" }, playerB: { name: "Bob & Cara" },
      doublesServing: { method: "even_odd", pairA: pairs.a, pairB: pairs.b },
    })).toEqual({ method: "even_odd", a: pairs.a, b: pairs.b });
    expect(resolveDoublesPairs({
      isDoubles: true, playerA: { name: "Dave" }, partnerA: { name: "Ann" }, playerB: { name: "Bob" }, partnerB: { name: "Cara" },
    })?.method).toBeNull();
  });
  it("tournament settings read per-division method with tournament fallback", () => {
    const t = { match_type: "doubles", doubles_serving_method: "even_odd", league_doubles_serving_methods: { "2": "second_server" } };
    expect(effectiveTournamentSettings(t, 1).doublesServingMethod).toBe("even_odd");
    expect(effectiveTournamentSettings(t, 2).doublesServingMethod).toBe("second_server");
    expect(effectiveTournamentSettings({ match_type: "doubles" }, 1).doublesServingMethod).toBeNull();
  });
});
