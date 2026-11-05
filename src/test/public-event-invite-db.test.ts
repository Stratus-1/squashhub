import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import postgres from "postgres";

// Synthetic database only. Never point this suite at hosted member data.
(process.env.EVENT_RSVP_TEST_SOCKET ? describe : describe.skip)("Public RSVP database boundaries", () => {
  it("allows login-free replies only to the invited member and exact occurrence", async () => {
    const sql = postgres({ host: process.env.EVENT_RSVP_TEST_SOCKET, port: 55438, username: "nobody", database: "postgres", max: 1 });
    try {
      await sql.begin(async tx => {
        await tx.unsafe(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
          GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
          CREATE TABLE clubs(id uuid PRIMARY KEY,name text,subdomain text);
          CREATE TABLE club_members(id uuid PRIMARY KEY,club_id uuid);
          CREATE TABLE club_events(id uuid PRIMARY KEY,club_id uuid,status text,recurrence text,start_date date,start_time time,title text,description text);
          CREATE TABLE club_event_instances(id uuid PRIMARY KEY,event_id uuid,instance_date date,status text);
          CREATE TABLE club_event_instance_rsvps(instance_id uuid,club_member_id uuid,status text,updated_at timestamptz);
          CREATE TABLE club_event_rsvps(event_id uuid,club_member_id uuid,status text,updated_at timestamptz);`);
        await tx.unsafe(readFileSync("drizzle/migrations/0366_public_event_invitation_reply.sql", "utf8"));
        const ids = Array.from({ length: 7 }, (_, n) => `00000000-0000-4000-8000-${String(n + 1).padStart(12, "0")}`);
        const [club, event, occurrence, later, member, otherMember, otherClub] = ids;
        await tx`insert into clubs values (${club},'Synthetic CSIR','csir'),(${otherClub},'Other club','other')`;
        await tx`insert into club_members values (${member},${club}),(${otherMember},${club})`;
        await tx`insert into club_events values (${event},${club},'active','weekly',current_date+1,'18:00','Thursday Social','Synthetic test event')`;
        await tx`insert into club_event_instances values (${occurrence},${event},current_date+1,'scheduled'),(${later},${event},current_date+8,'scheduled')`;
        await tx`insert into club_event_instance_rsvps values (${occurrence},${member},'invited',now()),(${later},${member},'invited',now()),(${occurrence},${otherMember},'invited',now())`;
        const [issued] = await tx`select issue_event_invitation_link(${event},${occurrence},${member},${club}) as result`;
        const token = issued.result.token;
        const [grants] = await tx`select has_function_privilege('anon','issue_event_invitation_link(uuid,uuid,uuid,uuid)','EXECUTE') as issue,
          has_function_privilege('anon','event_invitation_reply(text,text,text)','EXECUTE') as reply,
          has_table_privilege('anon','event_invitation_links','SELECT') as tokens`;
        expect(grants).toEqual({ issue: false, reply: true, tokens: false });
        await tx.unsafe("SET LOCAL ROLE anon");
        const [view] = await tx`select event_invitation_reply(${token},'csir',null) as result`;
        expect(view.result.status).toBe("invited");
        const [wrongClub] = await tx`select event_invitation_reply(${token},'other','confirmed') as result`;
        expect(wrongClub.result.state).toBe("invalid");
        const [invalid] = await tx`select event_invitation_reply(${'f'.repeat(64)},'csir','confirmed') as result`;
        expect(invalid.result.state).toBe("invalid");
        const [accept] = await tx`select event_invitation_reply(${token},'csir','confirmed') as result`;
        expect(accept.result.status).toBe("confirmed");
        const [repeat] = await tx`select event_invitation_reply(${token},'csir','confirmed') as result`;
        expect(repeat.result.status).toBe("confirmed");
        await tx.unsafe("RESET ROLE");
        const rows = await tx`select status from club_event_instance_rsvps where instance_id=${later} or club_member_id=${otherMember}`;
        expect(rows.map(r => r.status)).toEqual(["invited", "invited"]);
        await tx.unsafe("SET LOCAL ROLE anon");
        const [decline] = await tx`select event_invitation_reply(${token},'csir','declined') as result`;
        expect(decline.result.status).toBe("declined");
        const [badResponse] = await tx`select event_invitation_reply(${token},'csir','delete') as result`;
        expect(badResponse.result.state).toBe("invalid");
        await tx.unsafe("RESET ROLE");
        await tx`update club_events set status='cancelled' where id=${event}`;
        await tx.unsafe("SET LOCAL ROLE anon");
        const [closed] = await tx`select event_invitation_reply(${token},'csir','confirmed') as result`;
        expect(closed.result).toMatchObject({ locked: true, status: "declined" });
        await tx.unsafe("RESET ROLE");
        await tx`update club_events set status='active' where id=${event}`;
        await tx`update event_invitation_links set expires_at=now()-interval '1 minute'`;
        const [expired] = await tx`select event_invitation_reply(${token},'csir','confirmed') as result`;
        expect(expired.result).toMatchObject({ locked: true, status: "declined" });
        await tx`delete from club_event_instance_rsvps where instance_id=${occurrence} and club_member_id=${member}`;
        const [removed] = await tx`select event_invitation_reply(${token},'csir','confirmed') as result`;
        expect(removed.result.state).toBe("invalid");
        throw new Error("ROLLBACK_SYNTHETIC_TEST");
      }).catch(e => { if (e.message !== "ROLLBACK_SYNTHETIC_TEST") throw e; });
    } finally { await sql.end(); }
  });
});