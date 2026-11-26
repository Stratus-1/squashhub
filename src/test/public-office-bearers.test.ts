import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { supabase } from "@/integrations/supabase/client";

// Read-only integration checks against the connected database. Never mutate club data.
const connected = Boolean(process.env.PGHOST);
(connected ? describe : describe.skip)("Public club office bearers", () => {
  const sql = postgres({ max: 1 });
  afterAll(async () => { await sql.end(); });
  const publicBearers = async (clubId: string) => {
    const { data, error } = await supabase.rpc("get_club_office_bearers_public", { _club_id: clubId });
    expect(error).toBeNull();
    return data ?? [];
  };

  it("uses Willem Pretorius's CSIR member name, not Willem SA's login name", async () => {
    const clubs = await sql`SELECT id FROM clubs WHERE subdomain='csi'`;
    const rows = await publicBearers(clubs[0].id);
    expect(rows.filter(row => row.office === 'Secretary').map(row => row.name)).toEqual(["Willem Pretorius"]);
  });

  for (const [field, office] of [["vice_chairman_member_id", "Vice Chairman"], ["treasurer_member_id", "Treasurer"]]) {
    it(`returns every configured ${office} with their club member name`, async () => {
      const rows = await sql.unsafe(`SELECT c.id AS club_id, cm.id, cm.name FROM clubs c JOIN club_members cm ON cm.id=c.${field} AND cm.club_id=c.id WHERE c.show_delegates_on_landing IS DISTINCT FROM false`);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        const publicRow = (await publicBearers(row.club_id)).find(bearer => bearer.office === office);
        expect(publicRow?.id).toBe(row.id);
        expect(publicRow?.name).toBe(row.name);
      }
    });
  }

  it("returns no names for clubs whose office bearers are hidden", async () => {
    const clubs = await sql`SELECT id FROM clubs WHERE show_delegates_on_landing=false`;
    for (const club of clubs) expect(await publicBearers(club.id)).toEqual([]);
  });

  it("exposes names and roles only and rejects an unknown club", async () => {
    const rows = await publicBearers('00000000-0000-0000-0000-000000000000');
    expect(rows).toEqual([]);
    const columns = await sql`SELECT proargnames FROM pg_proc WHERE proname='get_club_office_bearers_public'`;
    expect(columns[0].proargnames).toEqual(["_club_id", "id", "name", "office"]);
  });
});