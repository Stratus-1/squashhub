import { describe, expect, it } from "vitest";
import { actionCatalogue, allowedActions, isActionAllowed, resolveAiAction } from "@/lib/ai/registry";
import { availableWorkflows, matchWorkflow, WORKFLOW_MAP } from "@/lib/ai/workflows";
import { speakableText } from "@/lib/ai/voice";

const memberCtx = { isAdmin: false, capabilities: ["bookings", "leagues", "tournaments"] };
const adminCtx = { isAdmin: true, capabilities: ["bookings", "leagues", "tournaments", "membership_fees"] };

describe("ai action registry", () => {
  it("hides admin-only actions from members", () => {
    expect(isActionAllowed("admin_fees", memberCtx)).toBe(false);
    expect(isActionAllowed("admin_fees", adminCtx)).toBe(true);
  });

  it("hides actions whose capability is disabled", () => {
    expect(isActionAllowed("honesty_bar", memberCtx)).toBe(false);
    expect(isActionAllowed("honesty_bar", { isAdmin: false, capabilities: ["bar"] })).toBe(true);
  });

  it("never resolves an unknown or blocked key to a route", () => {
    expect(resolveAiAction({ key: "totally_made_up" }, adminCtx).hasAction).toBe(false);
    expect(resolveAiAction({ key: "admin_fees" }, memberCtx).hasAction).toBe(false);
  });

  it("resolves an allowed key to an in-app path", () => {
    const r = resolveAiAction({ key: "bookings" }, memberCtx);
    expect(r.hasAction).toBe(true);
    expect(r.appPath).toBe("/bookings");
  });

  it("refuses an action that is missing required params", () => {
    expect(resolveAiAction({ key: "league_fixture" }, memberCtx).hasAction).toBe(false);
    expect(
      resolveAiAction({ key: "league_fixture", params: { fixture_id: "abc" } }, memberCtx).appPath,
    ).toBe("/league-games/abc");
  });

  it("excludes the none/external placeholders from the model catalogue", () => {
    const keys = actionCatalogue(adminCtx).map((a) => a.key);
    expect(keys).not.toContain("none");
    expect(keys).not.toContain("external");
    expect(allowedActions(adminCtx).length).toBe(keys.length);
  });
});

describe("guided workflows", () => {
  it("only offers admin workflows to admins", () => {
    expect(availableWorkflows(memberCtx).some((w) => w.key === "send_invoices")).toBe(false);
    expect(availableWorkflows(adminCtx).some((w) => w.key === "send_invoices")).toBe(true);
  });

  it("offers captain workflows to captains", () => {
    const captain = { isAdmin: false, isCaptain: true, capabilities: ["leagues"] };
    expect(availableWorkflows(captain).some((w) => w.key === "league_team_night")).toBe(true);
  });

  it("hides workflows whose module is switched off", () => {
    const noLeagues = { isAdmin: true, capabilities: ["bookings"] };
    expect(availableWorkflows(noLeagues).some((w) => w.key === "league_team_night")).toBe(false);
  });

  it("matches a spoken request to the right workflow", () => {
    const captain = { isAdmin: false, isCaptain: true, capabilities: ["leagues"] };
    expect(matchWorkflow("Help me set up tonight's team", captain)?.key).toBe("league_team_night");
    expect(matchWorkflow("how many courts do we have", captain)).toBeNull();
  });

  it("every workflow step action points at a real registry key", () => {
    for (const w of Object.values(WORKFLOW_MAP)) {
      for (const step of w.steps) {
        if (!step.action) continue;
        const r = resolveAiAction(step.action, { isAdmin: true, capabilities: undefined });
        expect(r.hasAction, `${w.key}: ${step.action.key}`).toBe(true);
      }
    }
  });
});

describe("voice output", () => {
  it("strips markdown and links before speaking", () => {
    expect(speakableText("See **here**: https://example.com/x")).toBe("See here: the link on screen");
  });
});
