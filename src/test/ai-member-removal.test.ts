import { describe, it, expect } from "vitest";
import { planRemoval, executeRemoval, matchClubMembers, type MemberRow } from "../../supabase/functions/ai-help/member-removal";

const CLUB = "nelspruit";
const m = (id: string, name: string, extra: Partial<MemberRow> = {}): MemberRow =>
  ({ id, name, status: "active", club_id: CLUB, person_id: `p-${id}`, user_id: null, role: "member", ...extra });

/** In-memory club_members + audit, mimicking the guarded "Resigned" update. */
function fakeDb(rows: MemberRow[], fail = false) {
  const people = new Set(rows.map((r) => r.person_id));
  const audit: any[] = [];
  let writes = 0;
  const update = async (id: string, club: string) => {
    if (fail) return { data: null, error: { message: "database unavailable" } };
    const r = rows.find((x) => x.id === id && x.club_id === club && x.status !== "resigned");
    if (!r) return { data: null, error: null };
    r.status = "resigned"; writes++;
    audit.push({ actor: "susan", club, entity: id, action: "membership_ended" });
    return { data: { id, status: "resigned" }, error: null };
  };
  const status = async (id: string) => rows.find((x) => x.id === id)?.status ?? null;
  return { rows, people, audit, update, status, writes: () => writes };
}

const base = (rows: MemberRow[], canManage = true) => ({
  canManage, query: "Michelle de Villiers", clubName: "Nelspruit Squash Club",
  rows: rows.filter((r) => r.club_id === CLUB), callerMemberId: "susan",
  otherMembershipCount: (t: MemberRow) => rows.filter((r) => r.person_id === t.person_id && r.club_id !== CLUB).length,
});

describe("AI assistant: remove member from club list", () => {
  const setup = () => [
    m("mich", "Michelle de Villiers", { person_id: "p-mich" }),
    m("mich-2", "Michelle de Villiers", { club_id: "other-club", person_id: "p-mich" }),
    m("mich-3", "Michelle de Villiers", { club_id: "association", person_id: "p-mich" }),
    m("susan", "Susan Crafford", { role: "admin" }),
  ];

  it("1-3, 9: unambiguous member → confirmation preview → membership ended, person & other memberships kept, audited", async () => {
    const rows = setup(); const db = fakeDb(rows);
    const plan = planRemoval(base(rows));
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.summary).toMatch(/does not delete the person record or memberships at other clubs/);
    expect(plan.unchanged.join(" ")).toMatch(/2 membership\(s\) at other clubs/);
    expect(db.writes()).toBe(0); // preview never writes
    const res = await executeRemoval(db.update, db.status, plan.resolved);
    expect(res.ok).toBe(true);
    expect(rows.find((r) => r.id === "mich")!.status).toBe("resigned");
    expect(rows).toHaveLength(4); // no row deleted
    expect(db.people.has("p-mich")).toBe(true);
    expect(rows.filter((r) => r.person_id === "p-mich" && r.club_id !== CLUB).every((r) => r.status === "active")).toBe(true);
    expect(db.audit).toEqual([{ actor: "susan", club: CLUB, entity: "mich", action: "membership_ended" }]);
  });

  it("4: multiple same-name matches → clarification, no mutation", () => {
    const rows = [...setup(), m("mich-b", "Michelle de Villiers")];
    const plan = planRemoval(base(rows));
    expect(plan).toMatchObject({ ok: false, code: "ambiguous_member" });
  });

  it("5: non-authorised role → permission denial", () => {
    expect(planRemoval(base(setup(), false))).toMatchObject({ ok: false, code: "permission_denied" });
  });

  it("6: cancelling means execute is never called → no mutation", () => {
    const rows = setup(); planRemoval(base(rows));
    expect(rows.find((r) => r.id === "mich")!.status).toBe("active");
  });

  it("7: backend failure → failure reported, no false success", async () => {
    const rows = setup(); const db = fakeDb(rows, true);
    const plan = planRemoval(base(rows)); if (!plan.ok) throw new Error();
    const res = await executeRemoval(db.update, db.status, plan.resolved);
    expect(res).toMatchObject({ ok: false, message: "database unavailable" });
    expect(rows.find((r) => r.id === "mich")!.status).toBe("active");
  });

  it("8: repeated confirmation cannot mutate twice", async () => {
    const rows = setup(); const db = fakeDb(rows);
    const plan = planRemoval(base(rows)); if (!plan.ok) throw new Error();
    await executeRemoval(db.update, db.status, plan.resolved);
    const again = await executeRemoval(db.update, db.status, plan.resolved);
    expect(again.ok).toBe(false);
    expect(again.message).toMatch(/Already removed/);
    expect(db.writes()).toBe(1);
    expect(db.audit).toHaveLength(1);
  });

  it("not found / already resigned / admin target are explained, not executed", () => {
    expect(planRemoval({ ...base(setup()), query: "Nobody Here" })).toMatchObject({ ok: false, code: "member_not_found" });
    const r = setup(); r[0].status = "resigned";
    expect(planRemoval(base(r))).toMatchObject({ ok: false, code: "already_removed" });
    expect(planRemoval({ ...base(setup()), query: "Susan Crafford" })).toMatchObject({ ok: false, code: "needs_person" });
  });

  it("matches names case- and space-insensitively", () => {
    expect(matchClubMembers(setup(), "  michelle  DE villiers ")).toHaveLength(3);
  });
});
