// Copies the club constitution uploaded for the Stitch application
// (stitch-onboarding bucket) into the club document library under
// "Constitution & amendments", hidden from members until an admin shares it.
// Owner-requested 22 Nov 2026.
// Who may call: a document manager of that club (admin, chairman, secretary,
// "Club Info" permission) for { club_id }, or a platform admin for { all: true }.
// Idempotent: club_documents.source_ref = "stitch-onboarding:<path>" is unique per club.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  const userId = userRes.user.id;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const body = await req.json().catch(() => ({}));
  let clubIds: string[] = [];
  if (body?.all === true) {
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (isAdmin !== true) return json({ error: "Not allowed" }, 403);
    const { data } = await admin.from("stitch_onboarding_drafts").select("club_id");
    clubIds = (data ?? []).map((r: any) => r.club_id);
  } else {
    const clubId = String(body?.club_id || "");
    if (!UUID.test(clubId)) return json({ error: "club_id required" }, 400);
    const { data: ok } = await admin.rpc("can_manage_club_documents", { _user_id: userId, _club_id: clubId });
    if (ok !== true) return json({ error: "Not allowed" }, 403);
    clubIds = [clubId];
  }

  const results: Array<{ club_id: string; file: string; status: string }> = [];
  for (const clubId of clubIds) {
    const { data: draft } = await admin.from("stitch_onboarding_drafts").select("files").eq("club_id", clubId).maybeSingle();
    const files = (Array.isArray(draft?.files) ? draft!.files : []).filter((f: any) =>
      f?.slotKey === "constitution" || /constitution/i.test(String(f?.label || "")));
    if (files.length === 0) continue;

    await admin.rpc("seed_club_document_categories", { _club_id: clubId });
    const { data: cat } = await admin.from("club_document_categories")
      .select("id").eq("club_id", clubId).eq("standard_key", "constitution").maybeSingle();
    if (!cat?.id) { results.push({ club_id: clubId, file: "", status: "no constitution category" }); continue; }

    for (const f of files) {
      const src = String(f.path || "");
      if (!src.startsWith(`${clubId}/`)) { results.push({ club_id: clubId, file: src, status: "skipped: path outside club" }); continue; }
      const sourceRef = `stitch-onboarding:${src}`;
      const { data: existing } = await admin.from("club_documents").select("id").eq("club_id", clubId).eq("source_ref", sourceRef).maybeSingle();
      if (existing) { results.push({ club_id: clubId, file: f.filename, status: "already in library" }); continue; }

      const { data: blob, error: dlErr } = await admin.storage.from("stitch-onboarding").download(src);
      if (dlErr || !blob) { results.push({ club_id: clubId, file: f.filename, status: `download failed: ${dlErr?.message}` }); continue; }
      const id = crypto.randomUUID();
      const fileName = String(f.filename || src.split("/").pop() || "constitution");
      const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
      const dest = `${clubId}/library/${id}-${safe}`;
      const { error: upErr } = await admin.storage.from("club-documents")
        .upload(dest, blob, { upsert: false, contentType: blob.type || "application/octet-stream" });
      if (upErr) { results.push({ club_id: clubId, file: fileName, status: `upload failed: ${upErr.message}` }); continue; }
      const title = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() || "Club constitution";
      const { error: insErr } = await admin.from("club_documents").insert({
        id, club_id: clubId, category_id: cat.id, title, file_path: dest, file_name: fileName,
        mime_type: blob.type || null, size_bytes: blob.size, members_visible: false,
        uploaded_by: userId, source_ref: sourceRef,
      });
      if (insErr) {
        await admin.storage.from("club-documents").remove([dest]);
        results.push({ club_id: clubId, file: fileName, status: `save failed: ${insErr.message}` });
        continue;
      }
      results.push({ club_id: clubId, file: fileName, status: "imported" });
    }
  }
  return json({ ok: true, imported: results.filter((r) => r.status === "imported").length, results });
});
