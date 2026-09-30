import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("supabase/functions/help-center-ticket-feed/index.ts", "utf8");
const gate = readFileSync("supabase/pending-migrations/20260930150800_help_center_pilot_gate.sql", "utf8");

describe("help-center-ticket-feed contract is unchanged by the pilot gate", () => {
  it("keeps the HMAC signing string and headers", () => {
    expect(src).toContain('const SIGN_PATH = "/v1/support/tickets";');
    expect(src).toContain("const canonical = `${SIGN_METHOD}\\n${SIGN_PATH}\\n${ts}\\n${await sha256Hex(body)}`;");
    for (const h of ['"Idempotency-Key": r.event_id', '"X-Connector-Key-Id": keyId', '"X-Connector-Timestamp": ts', '"X-Connector-Signature": `sha256=${sig}`'])
      expect(src).toContain(h);
  });
  it("pins signed delivery to the approved Stratus Gateway and rejects redirects", () => {
    expect(src).toContain('const APPROVED_INGRESS_URL = "https://stratus-support-ingress-9essk3i1.uc.gateway.dev/v1/support/tickets";');
    expect(src).toContain("const urlOk = ingressUrl === APPROVED_INGRESS_URL;");
    expect(src).toContain('redirect: "error",');
  });
  it("keeps the payload fields, status mapping and receiver semantics", () => {
    for (const k of ["contract_version", "event_id", "event_type", "product_case_ref", "case_revision", "tenant_scope_ref",
      "category", "priority", "source_status", "redacted_title", "redacted_summary", "redaction_policy_version",
      "created_at", "updated_at", "correlation_id"]) expect(src).toMatch(new RegExp(`\\b${k}:`));
    expect(src).toContain('r.status === "pending" ? "waiting" : r.status');
    expect(src).toContain("ok = res.ok || res.status === 409;");
    expect(src).toContain("const MAX_ATTEMPTS = 12;");
  });
  it("exits before claim or cron when paused (and fails closed to paused)", () => {
    const pausedIdx = src.indexOf('if (mode === "paused")');
    expect(pausedIdx).toBeGreaterThan(0);
    expect(pausedIdx).toBeLessThan(src.indexOf("help_center_outbox_claim"));
    expect(src).toContain('modeRaw === "pilot" || modeRaw === "live") ? modeRaw : "paused"');
  });
  it("gates both wake and claim in the database and never unschedules the job", () => {
    expect(gate).toMatch(/help_center_outbox_wake\(\)[\s\S]*?IF public\.help_center_delivery_mode\(\) = 'paused' THEN\s+RETURN;/);
    expect(gate).toMatch(/help_center_outbox_claim[\s\S]*?IF v_mode = 'paused' THEN\s+RETURN;/);
    expect(gate).not.toMatch(/PERFORM cron\.unschedule/);
    expect(gate).toContain("VALUES ('delivery_mode', 'paused')");
  });
  it("never logs event, ticket, correlation or outbox identifiers", () => {
    const logs = src.match(/console\.(log|warn|error|info|debug)\([^;]*;/g) ?? [];
    expect(logs.length).toBeGreaterThan(0);
    for (const l of logs) expect(l).not.toMatch(/event_id|ticket_id|product_case_ref|correlation_id|\br\.|payload|body/);
  });
});
