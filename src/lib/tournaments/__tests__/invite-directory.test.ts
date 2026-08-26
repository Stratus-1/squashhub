import { describe, it, expect } from "vitest";
import {
  FORBIDDEN_DIRECTORY_FIELDS,
  SAFE_DIRECTORY_FIELDS,
  directoryScopeLabel,
  groupByClub,
  sanitizeDirectory,
  sanitizeDirectoryRow,
} from "../invite-directory";

const row = (over: Record<string, unknown> = {}) => ({
  member_id: "m1",
  display_name: "Thabo Mokoena",
  club_id: "club-a",
  club_name: "Riverside",
  gender: "male",
  ladder_position: 3,
  ranking_points: 120,
  is_own_club: true,
  invite_status: null,
  is_user: false,
  ...over,
});

describe("safe projection", () => {
  it("keeps only identity and sporting fields", () => {
    const p = sanitizeDirectoryRow(row());
    expect(Object.keys(p).sort()).toEqual([...SAFE_DIRECTORY_FIELDS].sort());
  });

  it("strips unexpected extra fields rather than passing them through", () => {
    const p = sanitizeDirectoryRow(row({ internal_note: "owes bar money" }) as any);
    expect((p as any).internal_note).toBeUndefined();
  });

  it("throws loudly if any private field ever appears", () => {
    for (const field of FORBIDDEN_DIRECTORY_FIELDS) {
      expect(() => sanitizeDirectoryRow(row({ [field]: "x" }) as any)).toThrow(/private fields/i);
    }
  });

  it("never exposes email or phone for cross-club players", () => {
    const players = sanitizeDirectory([row({ member_id: "m2", club_id: "club-b", is_own_club: false })]);
    const json = JSON.stringify(players);
    expect(json).not.toMatch(/email|phone|@/i);
    expect(players[0].is_own_club).toBe(false);
    // The stable internal reference needed to create the invitation is present.
    expect(players[0].member_id).toBe("m2");
  });

  it("surfaces registered users without leaking auth identifiers", () => {
    const players = sanitizeDirectory([
      row({ member_id: "m3", is_user: true }),
      row({ member_id: "m4", is_user: false }),
    ]);
    expect(players[0].is_user).toBe(true);
    expect(players[1].is_user).toBe(false);
    expect(JSON.stringify(players)).not.toMatch(/user_id|auth_user_id/);
  });

  it("drops rows without a usable member reference", () => {
    expect(sanitizeDirectory([row({ member_id: "" })])).toHaveLength(0);
  });
});

describe("grouping and labels", () => {
  it("lists the organiser's own club first, then clubs alphabetically", () => {
    const groups = groupByClub(
      sanitizeDirectory([
        row({ member_id: "x", club_id: "club-z", club_name: "Zenith", is_own_club: false }),
        row({ member_id: "y", club_id: "club-b", club_name: "Bellville", is_own_club: false }),
        row({ member_id: "z", club_id: "club-a", club_name: "Riverside", is_own_club: true }),
      ]),
    );
    expect(groups.map((g) => g.clubName)).toEqual(["Riverside", "Bellville", "Zenith"]);
  });

  it("describes each scope to the organiser", () => {
    expect(directoryScopeLabel("club")).toMatch(/this club/i);
    expect(directoryScopeLabel("association")).toMatch(/association|region/i);
    expect(directoryScopeLabel("open")).toMatch(/federation/i);
  });
});
