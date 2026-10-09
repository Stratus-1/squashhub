import { describe, it, expect } from "vitest";
import { matchDayUrl } from "@/lib/match-day/access";
import { pickMyMatch } from "@/lib/match-day/my-match";
import {
  DRAW_CTA_LABEL, drawCtaCopy, tournamentDestinationUrl, tournamentFallbackUrl, champIdFromUrl,
} from "../../supabase/functions/_shared/match-day-cta";

describe("round-draw email CTA", () => {
  it("uses the required label and first-round copy", () => {
    expect(DRAW_CTA_LABEL).toBe("VIEW TOURNAMENT & SCORE MATCH");
    expect(drawCtaCopy(1)).toMatch(/^Your first-round match has been drawn\. Use the button below/);
    expect(drawCtaCopy(2)).toMatch(/^Your match has been drawn\./);
  });

  it("equals the overall link the QR card encodes on production", () => {
    const token = "AbCdEfGhIjKlMnOpQrStUv";
    const qr = matchDayUrl(token, { subdomain: "riverside", origin: "https://riverside.squashhub.co.za" });
    expect(tournamentDestinationUrl(token, "riverside")).toBe(qr);
    // No round, match or email-only parts: stable for the whole tournament.
    expect(tournamentDestinationUrl(token, "riverside")).not.toMatch(/[?#]|round|court/);
  });

  it("falls back to the signed-in tournament page when access is off", () => {
    const id = "f954222a-0f0a-4d8c-ac7b-9c74042cc69e";
    expect(tournamentFallbackUrl(id, "uitsig")).toBe(`https://uitsig.squashhub.co.za/club-champs/${id}`);
    expect(champIdFromUrl(`/club-champs/${id}`)).toBe(id);
    expect(champIdFromUrl("/tournaments")).toBeNull();
  });
});

describe("participant's own match", () => {
  const ms = [
    { id: "r1", round_number: 1, status: "completed", player_a_member_id: "me", player_b_member_id: "x" },
    { id: "r2", round_number: 2, status: "scheduled", player_a_member_id: "y", player_b_member_id: "me" },
    { id: "other", round_number: 2, status: "scheduled", player_a_member_id: "p", player_b_member_id: "q" },
  ];
  it("picks the next unfinished match, including after a new round is generated", () => {
    expect(pickMyMatch(ms, ["me"])?.id).toBe("r2");
  });
  it("returns nothing for a non-participant", () => {
    expect(pickMyMatch(ms, ["stranger"])).toBeNull();
  });
});
