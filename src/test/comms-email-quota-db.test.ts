import { describe, expect, it } from "vitest";
import postgres from "postgres";

(process.env.PGHOST ? describe : describe.skip)("Atomic nomination quota", () => {
  it("retains exactly 30 reservations and restricts quota calls to the sender", async () => {
    const sql = postgres({ host: process.env.PGHOST, port: Number(process.env.PGPORT || 5432), database: process.env.PGDATABASE,
      username: process.env.PGUSER, password: process.env.PGPASSWORD, ssl: process.env.PGSSLMODE === "disable" ? false : "require", max: 1 });
    try {
      await sql.begin(async (tx) => {
        const campaigns = await tx`select id, audience_member_ids from public.comms_campaigns where id='ad84da55-496d-44dd-8fe3-523ba6b52282'`;
        expect(campaigns.length).toBe(1);
        const attempts = await tx`select club_member_id from public.comms_email_attempts where campaign_id=${campaigns[0].id}`;
        expect(attempts.length).toBe(30);
        const pending = campaigns[0].audience_member_ids.find((id: string) => !attempts.some((a) => a.club_member_id === id));
        expect(pending).toBeTruthy();
        const grants = await tx`select has_function_privilege('anon','public.reserve_nomination_email(uuid,uuid)','EXECUTE') as anon,
          has_function_privilege('authenticated','public.reserve_nomination_email(uuid,uuid)','EXECUTE') as authenticated,
          has_function_privilege('service_role','public.reserve_nomination_email(uuid,uuid)','EXECUTE') as sender`;
        expect(grants[0]).toMatchObject({ anon: false, authenticated: false, sender: true });
        const count = await tx`select count(*)::int as n from public.comms_email_attempts where campaign_id=${campaigns[0].id}`;
        expect(count[0].n).toBe(30);
      });
    } finally { await sql.end(); }
  });
});