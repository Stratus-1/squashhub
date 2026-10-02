#!/usr/bin/env node
/**
 * Dependency-free, fail-closed preflight for the SquashHub -> Stratus publisher.
 * This validates source only; it never calls Supabase or the Gateway.
 */
import { readFileSync } from "node:fs";

const source = readFileSync("supabase/functions/help-center-ticket-feed/index.ts", "utf8");
const required = [
  'const SIGN_PATH = "/v1/support/tickets";',
  'const APPROVED_INGRESS_URL = "https://stratus-support-ingress-9essk3i1.uc.gateway.dev/v1/support/tickets";',
  '"Idempotency-Key": r.event_id',
  '"X-Connector-Key-Id": keyId',
  '"X-Connector-Timestamp": ts',
  '"X-Connector-Signature": `sha256=${sig}`',
  '`${SIGN_METHOD}\\n${SIGN_PATH}\\n${ts}\\n${await sha256Hex(body)}`',
];
const missing = required.filter((marker) => !source.includes(marker));
if (missing.length) {
  console.error(`Publisher contract failed: ${missing.length} required source markers are missing.`);
  for (const marker of missing) console.error(`- ${marker}`);
  process.exit(1);
}
const fetchStart = source.indexOf("fetch(ingressUrl");
const fetchEnd = source.indexOf("}).finally", fetchStart);
const fetchBlock = source.slice(fetchStart, fetchEnd < 0 ? source.length : fetchEnd);
if (fetchBlock.includes('"Authorization"') || fetchBlock.includes('"X-Forwarded-Authorization"')) {
  console.error("Publisher contract failed: publisher fetch sends a forbidden authorization header.");
  process.exit(1);
}
console.log("Publisher contract passed: exact Gateway, HMAC headers, signing string and idempotency key verified.");
