import { describe, expect, it } from "vitest";
import { nominationEmailData } from "../../supabase/functions/_shared/agm-nomination-email";

const input = { title: "CSIR AGM", message: "Dear {member name},\n\nMeeting {meeting date}. Close {nominations close}.", memberName: "Willem Pretorius", meeting: "21 November 2026 10:00", closes: "14 November 2026 22:00", url: "https://squashhub.co.za/nominate/live123" };
describe("Live and test nomination content", () => {
  it("uses identical personalized content for live and test", () => {
    const live = nominationEmailData(input);
    const test = nominationEmailData({ ...input, test: true });
    expect(live.messageBody).toBe("Dear Willem Pretorius,\n\nMeeting 21 November 2026 10:00. Close 14 November 2026 22:00.");
    expect(test.messageBody).toBe(live.messageBody);
  });
  it("preserves the live recipient's nomination link", () => {
    expect(nominationEmailData(input).url).toBe("https://squashhub.co.za/nominate/live123");
  });
});