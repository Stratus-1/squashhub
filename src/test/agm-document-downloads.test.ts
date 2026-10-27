import { describe, expect, it } from "vitest";

// Live, read-only regression: no ballot, RSVP, or voting writes.
describe("AGM attached-document access", () => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  async function attached(path: string) {
    const response = await fetch(`${url}/rest/v1/rpc/agm_document_is_attached`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_path: path }),
    });
    expect(response.status).toBe(200);
    return response.json();
  }
  it("allows the exact attached Uitsig agenda path without signing in", async () => {
    expect(await attached("d8397b8a-60d3-4c4b-afee-25dab218bf19/87b4b466-5530-4be5-bcc2-eaa1d2015a53/050a4667-7022-4060-9a75-bf51eaab3631-Uitsig_Squash_Club_2026_AGM_Agenda_and_Voting_Rules.pdf")).toBe(true);
  });
  it("denies an unattached document path", async () => {
    expect(await attached("unattached.pdf")).toBe(false);
  });
});