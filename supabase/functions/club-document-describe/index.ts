// Writes a short plain-English description of an uploaded club document and
// suggests the date shown on the document (meeting / signed / adopted date),
// using Lovable AI. Owner-requested 22 Nov 2026.
//
// Who may call: a document manager of the document's club (admins, chairman,
// secretary, "Club Info"/"documents" permission) — decided by can_manage_club_documents.
// A description typed by a person is never overwritten unless { force: true }
// (the "Write with AI" button). A document date already set is kept unless force.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createOpenAI } from "npm:@ai-sdk/openai@4";
import { streamText, Output, NoObjectGeneratedError, type ModelMessage } from "npm:ai@7";
import { z } from "npm:zod@4";
import JSZip from "npm:jszip@3";
import { Buffer } from "node:buffer";
import { createLovableAiGatewayRunIdFetch, getLovableAiGatewayRunId } from "../_shared/lovable-aig-run-id.ts";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const MODEL = "openai/gpt-6-astra";
const MAX_AI_BYTES = 15 * 1024 * 1024;
const MAX_TEXT = 40_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ext = (name: string) => (name.split(".").pop() || "").toLowerCase();

function xmlText(xml: string, paragraphTag: RegExp): string {
  return xml
    .replace(paragraphTag, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

async function officeText(bytes: Uint8Array, kind: string): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files);
  if (kind === "docx") {
    const xml = await zip.file("word/document.xml")?.async("string");
    return xml ? xmlText(xml, /<\/w:p>/g) : "";
  }
  if (kind === "pptx") {
    const slides = names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
    const out: string[] = [];
    for (const s of slides) out.push(xmlText(await zip.file(s)!.async("string"), /<\/a:p>/g));
    return out.join("\n");
  }
  if (kind === "xlsx") {
    const xml = await zip.file("xl/sharedStrings.xml")?.async("string");
    return xml ? xmlText(xml, /<\/si>/g) : "";
  }
  return "";
}

/** Plausible YYYY-MM-DD between 1900 and tomorrow, else null. */
function cleanDate(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return null;
  if (d.getUTCFullYear() < 1900 || d.getTime() > Date.now() + 86_400_000) return null;
  return s;
}

const INSTRUCTIONS = `You describe documents in a squash club's document library (constitutions, AGM papers, minutes, financial reports and similar).
Return:
- description: 1 to 3 plain-English sentences, at most 300 characters, saying what the document is and its main points, so a member can tell what is inside without opening it. Factual, no marketing tone, no "This document" filler where avoidable. Do not include personal ID numbers, bank account numbers or contact details.
- document_date: the date the document itself carries — e.g. the meeting date of minutes, the date a constitution was adopted or amended, the date a report or letter was signed or issued, or a financial year end for financial statements — as YYYY-MM-DD. If only a month and year are shown, use the first day of that month. If the document shows no such date, return null. Never use today's date or the upload date.`;

const schema = z.object({ description: z.string(), document_date: z.string().nullable() });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Please log in again." }, 401);
  const asUser = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: userRes, error: userErr } = await asUser.auth.getUser();
  if (userErr || !userRes?.user) return json({ error: "Please log in again." }, 401);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const body = await req.json().catch(() => ({}));
  const documentId = String(body?.document_id || "");
  const force = body?.force === true;
  if (!UUID.test(documentId)) return json({ error: "document_id required" }, 400);

  const { data: doc } = await admin.from("club_documents")
    .select("id, club_id, category_id, title, file_path, file_name, mime_type, size_bytes, description, description_source, document_date")
    .eq("id", documentId).maybeSingle();
  if (!doc) return json({ error: "Document not found" }, 404);
  const { data: ok } = await admin.rpc("can_manage_club_documents", { _user_id: userRes.user.id, _club_id: doc.club_id });
  if (ok !== true) return json({ error: "Not allowed" }, 403);
  if (doc.description_source === "manual" && !force) {
    return json({ skipped: "manual", description: doc.description, document_date: doc.document_date });
  }

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return json({ error: "AI is not configured for this app." }, 500);

  if ((doc.size_bytes ?? 0) > MAX_AI_BYTES) {
    return json({ error: "This file is too large for AI to read. Please type a description.", code: "too_large" }, 422);
  }
  const { data: blob, error: dlErr } = await admin.storage.from("club-documents").download(doc.file_path);
  if (dlErr || !blob) return json({ error: "Could not read the file." }, 500);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.byteLength === 0) return json({ error: "The file is empty." }, 422);

  const { data: cat } = await admin.from("club_document_categories").select("name").eq("id", doc.category_id).maybeSingle();
  const intro = `Title: ${doc.title}\nFile name: ${doc.file_name}\nCategory: ${cat?.name ?? "—"}`;
  const mime = (doc.mime_type || "").toLowerCase();
  const kind = ext(doc.file_name || doc.file_path);

  const content: any[] = [];
  if (mime === "application/pdf" || kind === "pdf") {
    content.push({ type: "text", text: `${intro}\nThe document is attached.` });
    content.push({ type: "file", filename: doc.file_name || "document.pdf", data: Buffer.from(bytes).toString("base64"), mediaType: "application/pdf" });
  } else if (mime.startsWith("image/") && ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mime)) {
    content.push({ type: "text", text: `${intro}\nThe document is attached as an image.` });
    content.push({ type: "image", image: new URL(`data:${mime};base64,${Buffer.from(bytes).toString("base64")}`) });
  } else {
    let text = "";
    try {
      if (["docx", "pptx", "xlsx"].includes(kind)) text = await officeText(bytes, kind);
      else if (mime.startsWith("text/") || ["txt", "csv", "md"].includes(kind)) text = new TextDecoder().decode(bytes);
    } catch (e) {
      console.error("text extraction failed", (e as Error)?.message);
    }
    if (!text.trim()) {
      return json({ error: "AI can't read this type of file. Please type a description.", code: "unsupported" }, 422);
    }
    content.push({ type: "text", text: `${intro}\nDocument text:\n${text.slice(0, MAX_TEXT)}` });
  }

  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(req));
  const provider = createOpenAI({
    baseURL: GATEWAY,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });

  let streamError: any = null;
  const messages: ModelMessage[] = [{ role: "user", content }];
  const result = streamText({
    model: provider.responses(MODEL),
    system: INSTRUCTIONS,
    messages,
    output: Output.object({ schema }),
    abortSignal: req.signal,
    providerOptions: {
      openai: {
        store: false,
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        include: ["reasoning.encrypted_content"],
      },
    },
    onError({ error }) { streamError = error; },
  });

  let out: { description: string; document_date: string | null } | null = null;
  try {
    out = await result.output;
  } catch (e) {
    if (NoObjectGeneratedError.isInstance(e)) {
      try { out = JSON.parse(e.text ?? ""); } catch { out = null; }
    } else {
      streamError = streamError ?? e;
    }
  }

  if (!out) {
    const status = Number(streamError?.statusCode ?? streamError?.cause?.statusCode ?? 0);
    console.error("ai describe failed", status, streamError?.message);
    if (status === 402) return json({ error: "Lovable AI credits have run out. Add credits in Settings → Plans & credits, then try again.", code: "credits" }, 402);
    if (status === 429) return json({ error: "AI is busy right now. Please try again in a minute.", code: "rate_limited" }, 429);
    if (status === 403) return json({ error: "AI is not available for this workspace right now.", code: "denied" }, 403);
    return json({ error: "AI could not describe this document. You can type a description instead." }, 502);
  }

  let description = String(out.description || "").replace(/\s+/g, " ").trim();
  if (description.length > 400) description = description.slice(0, 397).trimEnd() + "…";
  const aiDate = cleanDate(out.document_date);
  const patch: Record<string, unknown> = { description: description || null, description_source: "ai", described_at: new Date().toISOString() };
  if (aiDate && (force || !doc.document_date)) patch.document_date = aiDate;

  const { error: upErr } = await admin.from("club_documents").update(patch).eq("id", doc.id);
  if (upErr) return json({ error: "Could not save the description." }, 500);
  return json({ description: patch.description, document_date: (patch.document_date as string | undefined) ?? doc.document_date ?? null });
});
