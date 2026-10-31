import { describe, expect, it } from "vitest";
import postgres from "postgres";

(process.env.PGHOST ? describe : describe.skip)("Atomic nomination quota", () => {
  it("denies the 31st real campaign attempt without adding a reservation", async () => {
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
        const results = await tx`select public.reserve_nomination_email(${campaigns[0].id},${pending}) as result`;
        expect(results[0].result.allowed).toBe(false);
        expect(new Date(results[0].result.retry_at).getTime()).toBeGreaterThan(Date.now());
        const count = await tx`select count(*)::int as n from public.comms_email_attempts where campaign_id=${campaigns[0].id}`;
        expect(count[0].n).toBe(30);
      });
    } finally { await sql.end(); }
  });
});