import { describe, it, expect } from "vitest";
import {
  afterRally, overrideServer, pairDisplayName, resolveDoublesPairs, restoreDoublesState,
  servingBanner, startDoubles, startNextGame, type DoublesServeState, type PairPositions,
} from "@/lib/marker/doubles-serving";
import { effectiveTournamentSettings } from "@/lib/tournaments/effective-settings";

// Pair A = [Dave, Ann]; Ann plays Forehand (slot 1). Pair B = [Bob, Cara]; Bob Forehand (slot 0).
const pairs = { a: ["Dave", "Ann"] as [string, string], b: ["Bob", "Cara"] as [string, string] };
const positions: PairPositions = { a: { forehand: 1 }, b: { forehand: 0 } };
const who = (s: DoublesServeState) => pairs[s.team][s.server];

describe("Even/Odd", () => {
  const start = () => startDoubles({ method: "even_odd", positions, servingTeam: "a", firstServer: { a: 0, b: 1 } });

  it("first server is the chosen player, not the forehand, from the RIGHT at 0", () => {
    const s = start();
    expect(who(s)).toBe("Dave");
    expect(s.side).toBe("R");
  });

  it("side follows the serving team's score parity", () => {
    let s = start();
    s = afterRally(s, "a", { a: 1, b: 0 });
    expect([who(s), s.side]).toEqual(["Dave", "L"]);
    s = afterRally(s, "a", { a: 2, b: 0 });
    expect(s.side).toBe("R");
  });

  it("partners alternate when a pair regains service", () => {
    let s = start();
    s = afterRally(s, "b", { a: 0, b: 1 }); // B gains service: first server Cara, odd → LEFT
    expect([who(s), s.side]).toEqual(["Cara", "L"]);
    s = afterRally(s, "a", { a: 1, b: 1 }); // A regains: Dave served last → Ann
    expect([who(s), s.side]).toEqual(["Ann", "L"]);
    s = afterRally(s, "b", { a: 1, b: 2 }); // B regains: Cara last → Bob, even → RIGHT
    expect([who(s), s.side]).toEqual(["Bob", "R"]);
    s = afterRally(s, "a", { a: 2, b: 2 });
    expect(who(s)).toBe("Dave");
    expect(s.prevServer).toEqual({ a: 0, b: 0 });
  });
});

describe("By position", () => {
  it("Forehand serves RIGHT, Backhand LEFT, partners alternate", () => {
    let s = startDoubles({ method: "by_position", positions, servingTeam: "a", firstServer: { a: 0, b: 0 } });
    expect([who(s), s.side]).toEqual(["Dave", "L"]); // Dave is Backhand
    s = afterRally(s, "a", { a: 1, b: 0 });
    expect([who(s), s.side]).toEqual(["Dave", "L"]); // side fixed by position
    s = afterRally(s, "b", { a: 1, b: 1 });
    expect([who(s), s.side]).toEqual(["Bob", "R"]);
    s = afterRally(s, "a", { a: 2, b: 1 });
    expect([who(s), s.side]).toEqual(["Ann", "R"]);
    s = afterRally(s, "b", { a: 2, b: 2 });
    expect([who(s), s.side]).toEqual(["Cara", "L"]);
  });
});

describe("Second server", () => {
  it("Forehand RIGHT → Backhand LEFT → opposing pair Forehand RIGHT", () => {
    let s = startDoubles({ method: "second_server", positions, servingTeam: "a" });
    expect([who(s), s.side, s.hand]).toEqual(["Ann", "R", 1]);
    s = afterRally(s, "a", { a: 1, b: 0 });
    expect([who(s), s.side, s.hand]).toEqual(["Ann", "R", 1]);
    s = afterRally(s, "b", { a: 1, b: 1 });
    expect([who(s), s.side, s.hand, s.team]).toEqual(["Dave", "L", 2, "a"]);
    s = afterRally(s, "b", { a: 1, b: 2 });
    expect([who(s), s.side, s.hand, s.team]).toEqual(["Bob", "R", 1, "b"]);
    s = afterRally(s, "a", { a: 2, b: 2 });
    expect([who(s), s.side, s.hand]).toEqual(["Cara", "L", 2]);
    s = afterRally(s, "a", { a: 3, b: 2 });
    expect([who(s), s.side, s.hand]).toEqual(["Ann", "R", 1]);
  });
});

describe("game transitions", () => {
  it("second server: game winner starts a fresh hand with Forehand RIGHT", () => {
    let s = startDoubles({ method: "second_server", positions, servingTeam: "a" });
    s = afterRally(s, "b", { a: 0, b: 1 }); // Dave (2nd)
    s = startNextGame(afterRally(s, "b", { a: 0, b: 11 }), "b");
    expect([who(s), s.side, s.hand]).toEqual(["Bob", "R", 1]);
  });
  it("even/odd: winner keeps service and side resets to RIGHT at 0-0", () => {
    let s = startDoubles({ method: "even_odd", positions, servingTeam: "a", firstServer: { a: 0, b: 0 } });
    s = afterRally(s, "a", { a: 11, b: 4 }); // odd → L
    expect(s.side).toBe("L");
    s = startNextGame(s, "a");
    expect([who(s), s.side]).toEqual(["Dave", "R"]);
  });
  it("by position: receiving pair winning the game gains service with alternation", () => {
    let s = startDoubles({ method: "by_position", positions, servingTeam: "a", firstServer: { a: 0, b: 1 } });
    s = startNextGame(afterRally(s, "b", { a: 9, b: 11 }), "b");
    expect([who(s), s.side, s.team]).toEqual(["Cara", "L", "b"]);
  });
});

describe("resume + override", () => {
  it("round-trips through JSON (refresh) without resetting to the first-listed player", () => {
    let s = startDoubles({ method: "by_position", positions, servingTeam: "b", firstServer: { a: 1, b: 1 } });
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

    let e = startDoubles({ method: "even_odd", positions, servingTeam: "a", firstServer: { a: 0, b: 0 } });
    e = overrideServer(e, { team: "a", server: 1, side: "L", scores: { a: 0, b: 0 } });
    expect([who(e), e.side]).toEqual(["Ann", "L"]);
    e = afterRally(e, "b", { a: 0, b: 1 });
    e = afterRally(e, "a", { a: 1, b: 1 });
    expect(who(e)).toBe("Dave"); // alternates from the corrected server
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
    })?.method).toBeNull(); // not configured → manual fallback
  });
  it("tournament settings read per-division method with tournament fallback", () => {
    const t = { match_type: "doubles", doubles_serving_method: "even_odd", league_doubles_serving_methods: { "2": "second_server" } };
    expect(effectiveTournamentSettings(t, 1).doublesServingMethod).toBe("even_odd");
    expect(effectiveTournamentSettings(t, 2).doublesServingMethod).toBe("second_server");
    expect(effectiveTournamentSettings({ match_type: "doubles" }, 1).doublesServingMethod).toBeNull();
  });
});
