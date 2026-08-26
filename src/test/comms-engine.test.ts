import { describe, expect, it } from "vitest";
import { resolveAction, missingActionParams } from "@/lib/comms/actions";
import { renderChannel } from "@/lib/comms/render";
import { validateCampaign } from "@/lib/comms/validation";
import { buildMergeVars } from "@/lib/comms/merge-fields";

const vars = buildMergeVars({
  member: { name: "Jane Doe", email: "jane@example.com", phone: "0821234567" },
  club: { name: "Riverside" },
});

describe("action registry", () => {
  it("resolves a logical action to an app route and a web URL", () => {
    const a = resolveAction({ key: "profile_skills" }, { clubSubdomain: "riverside" });
    expect(a.appPath).toBe("/profile#skills");
    expect(a.webUrl).toBe("https://riverside.squashhub.co.za/profile#skills");
    expect(a.label).toBe("Update my skills & expertise");
  });

  it("treats 'none' as no action", () => {
    expect(resolveAction({ key: "none" }).hasAction).toBe(false);
  });

  it("flags missing required params", () => {
    expect(missingActionParams({ key: "event_detail" })).toEqual(["event_id"]);
    expect(missingActionParams({ key: "event_detail", params: { event_id: "x" } })).toEqual([]);
  });
});

describe("channel rendering", () => {
  const action = resolveAction({ key: "profile_skills" }, { clubSubdomain: "riverside" });

  it("merges shared fields the same way on every channel", () => {
    const email = renderChannel("email", { subject: "Hi {{first_name}}", body: "<p>{{club_name}}</p>" }, vars, action);
    const wa = renderChannel("whatsapp", { body: "Hi {{first_name}} from {{club_name}}" }, vars, action);
    expect(email.subject).toBe("Hi Jane");
    expect(email.body).toContain("Riverside");
    expect(wa.body).toContain("Hi Jane from Riverside");
  });

  it("adds a button on email and a plain URL on WhatsApp", () => {
    const email = renderChannel("email", { body: "<p>Hello</p>" }, vars, action);
    const wa = renderChannel("whatsapp", { body: "Hello" }, vars, action);
    expect(email.body).toContain("<a href=\"https://riverside.squashhub.co.za/profile#skills\"");
    expect(wa.body).toContain("https://riverside.squashhub.co.za/profile#skills");
  });

  it("keeps in-app messages link-free but carries the route", () => {
    const inApp = renderChannel("in_app", { subject: "Skills", body: "<p>Tap to update</p>" }, vars, action);
    expect(inApp.body).not.toContain("http");
    expect(inApp.url).toBe("/profile#skills");
  });
});

describe("campaign validation", () => {
  const recipients = [{ id: "1", name: "Jane", email: "jane@example.com", phone: null, user_id: null }];

  it("blocks a ticked channel with no template version", () => {
    const w = validateCampaign({
      channels: ["email", "whatsapp"],
      versions: { email: { subject: "Hi", body: "<p>x</p>" } },
      recipients,
    });
    expect(w.some((x) => x.level === "error" && x.channel === "whatsapp")).toBe(true);
  });

  it("passes when the ticked channel is complete and reachable", () => {
    const w = validateCampaign({
      channels: ["email"],
      versions: { email: { subject: "Hi", body: "<p>x</p>" } },
      recipients,
    });
    expect(w.filter((x) => x.level === "error")).toHaveLength(0);
  });

  it("errors when nobody can receive the ticked channel", () => {
    const w = validateCampaign({
      channels: ["whatsapp"],
      versions: { whatsapp: { body: "hi" } },
      recipients,
    });
    expect(w.some((x) => x.level === "error" && x.channel === "whatsapp")).toBe(true);
  });
});
