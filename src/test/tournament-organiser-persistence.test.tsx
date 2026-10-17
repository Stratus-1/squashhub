import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { saveLifecycle, loadLifecycle } from "@/lib/smart-builder/step-handover";
import { TournamentOrganiserField } from "@/components/smart-builder/TournamentOrganiserField";

const state = vi.hoisted(() => ({ life: null as any, updates: [] as any[] }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  const chain: any = {
    select: () => chain, eq: () => chain, neq: () => chain, order: () => chain, range: () => chain, in: () => chain,
    update: (arg: any) => { state.life = arg.beta_lifecycle; state.updates.push(arg); return chain; },
    maybeSingle: () => Promise.resolve({ data: { beta_lifecycle: state.life }, error: null }),
    then: (resolve: any) => Promise.resolve({ data: table === "club_members" ? [{ id: "committee", name: "Committee member", club_id: "riverside" }] : [], error: null }).then(resolve),
  };
  return chain;
} } }));

describe("organiser persistence and permission separation", () => {
  beforeEach(() => { state.life = null; state.updates = []; });
  it("includes a committee member with no tournament permission in the choices without writing permissions", async () => {
    const onChange = vi.fn();
    const view = render(<TournamentOrganiserField clubId="riverside" value={{ memberId: "committee", name: "Old name" }} existing onChange={onChange} />);
    await waitFor(() => expect(view.getByRole("combobox").textContent).toContain("Committee member"));
    expect(onChange).not.toHaveBeenCalled();
    expect(state.updates).toHaveLength(0);
  });
  it("reads the saved organiser back with the tournament answers without changing other lifecycle settings", async () => {
    const organiser = { memberId: "kaylee", name: "Kaylee Hunt" };
    await saveLifecycle("champs", { stage: "running", completed: ["planning"], draw_notify: false, answers: { organiser, name: "Club Champs" } });
    expect((await loadLifecycle("champs"))?.answers?.organiser).toEqual(organiser);
    expect(state.life.draw_notify).toBe(false);
    expect(state.life.stage).toBe("running");
  });
  it("stores explicit clearing as null across a lifecycle save and read", async () => {
    await saveLifecycle("champs", { stage: "planning", completed: [], answers: { organiser: null } });
    expect((await loadLifecycle("champs"))?.answers?.organiser).toBeNull();
  });
});