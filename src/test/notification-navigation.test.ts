import { describe, expect, it } from "vitest";
import { getNotificationNavigation, resolveNotificationUrl } from "@/lib/notification-navigation";

describe("notification navigation", () => {
  it("maps legacy AI Assistance alerts to the existing admin activity screen", () => {
    expect(resolveNotificationUrl("/admin/ai-assistance")).toBe("/admin/support?view=ai");
    expect(getNotificationNavigation({
      id: "notification-1",
      type: "ai_open_queries",
      url: "/admin/ai-assistance",
    })).toMatchObject({
      canNavigate: true,
      targetUrl: "/admin/support?view=ai",
    });
  });

  it("leaves current notification destinations unchanged", () => {
    expect(resolveNotificationUrl("/events/123")).toBe("/events/123");
  });
});