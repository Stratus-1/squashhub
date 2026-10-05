import { describe, expect, it } from "vitest";
import { toTitleCase } from "./input-formatting";

describe("toTitleCase", () => {
  it("keeps short all-caps initials like JP", () => {
    expect(toTitleCase("JP Bezuidenhout")).toBe("JP Bezuidenhout");
    expect(toTitleCase("jp lategan")).toBe("Jp Lategan");
  });

  it("keeps mixed initials like JJ and PJ", () => {
    expect(toTitleCase("JJ van der Merwe")).toBe("JJ van der Merwe");
    expect(toTitleCase("pj smit")).toBe("Pj Smit");
  });

  it("still title-cases ordinary names", () => {
    expect(toTitleCase("susan crafford")).toBe("Susan Crafford");
  });

  it("keeps particles lowercase except the first word", () => {
    expect(toTitleCase("gerrie VAN niekerk")).toBe("Gerrie van Niekerk");
    expect(toTitleCase("VAN Niekerk")).toBe("Van Niekerk");
  });

  it("does not treat longer uppercase words as initials", () => {
    expect(toTitleCase("JOHANNES botha")).toBe("Johannes Botha");
  });
});
