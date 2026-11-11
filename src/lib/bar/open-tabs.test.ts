import { describe, expect, it } from "vitest";
import { sortAndFilterOpenTabs } from "./open-tabs";

const tabs = [
  { tab_id: "z", guest_name: "Zoe Zulu", opened_at: "2026-11-11T08:00:00Z" },
  { tab_id: "v", guest_name: "Vian Crafford", opened_at: "2026-11-11T09:00:00Z" },
  { tab_id: "a", guest_name: "Andre Adams", opened_at: "2026-11-11T10:00:00Z" },
];

describe("bar counter open-tab list", () => {
  it("sorts every open tab alphabetically by the person's name without changing opening data", () => {
    const original = [...tabs];
    expect(sortAndFilterOpenTabs(tabs, "").map(tab => tab.tab_id)).toEqual(["a", "v", "z"]);
    expect(tabs).toEqual(original);
  });

  it("finds a tab by any case-insensitive part of the person's name and ignores surrounding spaces", () => {
    expect(sortAndFilterOpenTabs(tabs, "  cRAFF ").map(tab => tab.guest_name)).toEqual(["Vian Crafford"]);
    expect(sortAndFilterOpenTabs(tabs, "nobody")).toEqual([]);
  });
});
