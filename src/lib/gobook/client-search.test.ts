import { describe, it, expect } from "vitest";
import { confidentMatch, goBookSearchTerms, rankCandidates, surnameTerms } from "./client-search";

const c = (clientId: number, firstName: string, lastName: string, emailMatch = false) => ({ clientId, firstName, lastName, isActive: true, emailMatch });

describe("GoBook client search", () => {
  it("ignores Snr/Jnr and tries each part of a double surname", () => {
    expect(surnameTerms("Richard Rilanco - Coetsee Snr")).toEqual(["Coetsee", "Rilanco"]);
    expect(surnameTerms("Rico Rilanco - Coetsee Jnr")).toEqual(["Coetsee", "Rilanco"]);
  });

  it("keeps Afrikaans surname particles together", () => {
    expect(surnameTerms("Anja van der Merwe")[0]).toBe("van der Merwe");
  });

  it("searches by email first", () => {
    expect(goBookSearchTerms("Barend Lourens", "barend@x.co.za")).toEqual(["barend@x.co.za", "Lourens"]);
    expect(goBookSearchTerms("Barend Lourens", "")).toEqual(["Lourens"]);
  });

  it("links Richard Rilanco-Coetsee Snr to Richard Coetsee found by his email", () => {
    const list = [c(11827, "Johan", "Coetsee"), c(4249, "Richard", "Coetsee", true), c(4945, "RICO", "COETSEE")];
    expect(rankCandidates("Richard Rilanco - Coetsee Snr", list)[0].clientId).toBe(4249);
    expect(confidentMatch("Richard Rilanco - Coetsee Snr", list)?.clientId).toBe(4249);
  });

  it("never auto-links when two GoBook accounts share the same email and name", () => {
    const list = [c(4437, "Barend", "Lourens", true), c(5212, "Barend", "Lourens ", true)];
    expect(confidentMatch("Barend Lourens", list)).toBeNull();
  });

  it("does not link on surname alone", () => {
    expect(confidentMatch("Rico Rilanco - Coetsee Jnr", [c(4249, "Richard", "Coetsee")])).toBeNull();
  });
});
