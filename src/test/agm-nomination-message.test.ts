import { describe, it, expect } from "vitest";
import { defaultNominationMessage, nominationMessageHtml } from "@/lib/agm/ballot";

describe("call for nominations message", () => {
  it("announces the AGM date and that documents follow later", () => {
    const msg = defaultNominationMessage(true);
    expect(msg).toContain("{meeting date}");
    expect(msg).toContain("The agenda and relevant documents will be made available in due course.");
  });
  it("fills the meeting date and closing time", () => {
    const html = nominationMessageHtml("Dear {member name},\n\nAGM on {meeting date}. Close {nominations close}.", { meeting: "Thu 26 Nov 18:00", closes: "14 Nov 23:59" });
    expect(html).toContain("Dear {{name}},");
    expect(html).toContain("<strong>Thu 26 Nov 18:00</strong>");
    expect(html).toContain("<strong>14 Nov 23:59</strong>");
  });
});
