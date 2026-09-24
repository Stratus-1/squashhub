// Live-tournament diagnose → self-heal for the AI Help Assistant.
// Deterministic corruption (one provably-correct state from saved settings,
// registered pairs and finished pool results) is repaired automatically for
// anyone in the tournament's club — no admin/Super Admin approval. Anything
// needing judgement (scored games, ties, unsupported formats) is reported and
// left for a person. Every repair is transactional, snapshotted, re-verified,
// audited, reversible and notified to the club's admins.
import { checkTournamentIntegrity, type ISnapshot, type IntegrityReport, type Change } from "../_shared/tournament-integrity.ts";
import type { AssistCtx } from "./tools.ts";

const MATCH_COLS = "id,champ_id,group_number,pool_number,round_number,stage,bracket_position,placeholder_a,placeholder_b,player_a_member_id,partner_a_member_id,player_b_member_id,partner_b_member_id,status,winner_member_id,score,game_scores,side_a_points,side_b_points,is_bye,scheduled_date,scheduled_time,court_id,updated_at";

export async function loadSnapshot(ac: AssistCtx, champId: string) {
  const [{ data: t, error: te }, { data: tt }, { data: matches, error: me }, { data: entries }] = await Promise.all([
    ac.admin.from("club_champs").select("id,name,club_id,status,start_date,end_date,scoring_mode,match_type,league_formats,league_playoff_modes,pool_sizes").eq("id", champId).maybeSingle(),
    ac.admin.from("tournaments").select("participating_club_ids").eq("id", champId).maybeSingle(),
    ac.admin.from("club_champs_matches").select(MATCH_COLS).eq("champ_id", champId).limit(2000),
    ac.admin.from("club_champs_entries").select("club_member_id,partner_member_id,group_number").eq("champ_id", champId).limit(2000),
  ]);
  if (te) return { error: "Could not read the tournament: " + te.message } as const;
  if (!t) return { error: "Tournament not found." } as const;
  (t as any).participating_club_ids = (tt as any)?.participating_club_ids ?? [];
  if (me) return { error: "Could not read fixtures: " + me.message } as const;
  const snapshot: ISnapshot = { settings: t as any, matches: (matches ?? []) as any, entries: (entries ?? []) as any };
  const live = (matches ?? []).some((m: any) => m.scheduled_date === ac.today || (m.status && !["scheduled", "completed"].includes(m.status)));
  return { t: t as any, snapshot, live } as const;
}

async function nameMap(ac: AssistCtx, changes: Change[]) {
  const ids = [...new Set(changes.flatMap((c) => [...Object.values(c.before), ...Object.values(c.after ?? {})]).filter(Boolean) as string[])];
  if (!ids.length) return new Map<string, string>();
  const { data } = await ac.admin.from("club_members").select("id,name").in("id", ids);
  return new Map((data ?? []).map((m: any) => [m.id, m.name]));
}

function describe(changes: Change[], n: Map<string, string>, rows: Map<string, any>) {
  const team = (a: string | null, b: string | null) => (a ? [n.get(a) ?? "?", b ? n.get(b) ?? "?" : null].filter(Boolean).join(" & ") : "TBD");
  return changes.map((c) => {
    const m = rows.get(c.match_id);
    const where = m?.placeholder_a ? `${m.placeholder_a} vs ${m.placeholder_b}` : `Pool game ${m?.pool_number ?? ""}`;
    if (c.op === "delete_unplayed") return `${where}: removed an unplayed repeat pool game (${team(c.before.player_a_member_id, c.before.partner_a_member_id)} vs ${team(c.before.player_b_member_id, c.before.partner_b_member_id)})`;
    return `${where}: ${team(c.before.player_a_member_id, c.before.partner_a_member_id)} vs ${team(c.before.player_b_member_id, c.before.partner_b_member_id)} → ${team(c.after!.player_a_member_id, c.after!.partner_a_member_id)} vs ${team(c.after!.player_b_member_id, c.after!.partner_b_member_id)}`;
  });
}

const stillBroken = (r: IntegrityReport) => r.deterministic.length > 0 || r.findings.some((f) => ["I1_DUPLICATE_QUALIFIER", "I2_MISSING_QUALIFIER", "I4_PAIR_BROKEN"].includes(f.code) && f.repairable);

export async function diagnoseAndRepair(ac: AssistCtx, champId: string, opts: { request: string; transcriptUsed: boolean; base: Record<string, unknown> }) {
  const started = Date.now();
  const snap = await loadSnapshot(ac, champId);
  if ("error" in snap) return { error: snap.error };
  const { t, snapshot, live } = snap;
  const inScope = ac.isSuper || ac.myClubIds.includes(t.club_id) || (t.participating_club_ids ?? []).some((x: string) => ac.myClubIds.includes(x));
  if (!inScope) return { error: "This tournament isn't one you take part in." };

  const report = checkTournamentIntegrity(snapshot);
  const rows = new Map(snapshot.matches.map((m: any) => [m.id, m]));
  const n = await nameMap(ac, report.changes);
  const summary = {
    tournament: t.name, live, consistent: report.consistent,
    findings: report.findings.map((f) => ({ code: f.code, message: f.message, can_fix_automatically: f.repairable })),
    needs_a_person: describe(report.judgement, n, rows),
  };
  if (!report.deterministic.length) {
    return { ...summary, repaired: false, note: report.consistent ? "Checked: no inconsistencies in the live tournament data." : "Nothing here can be fixed automatically — the remaining items need a person." };
  }
  if (!ac.actionsOn) return { ...summary, repaired: false, note: "Self-repair isn't switched on for this club yet; escalate with category 'bug'." };

  const planned = describe(report.deterministic, n, rows);
  const { data: before, error: applyErr } = await ac.admin.rpc("ai_apply_champ_repair", { p_champ: champId, p_changes: report.deterministic as any });
  if (applyErr) {
    return { ...summary, repaired: false, repair_error: applyErr.message, note: "The automatic repair was refused safely and nothing changed. Escalate with category 'bug' including these findings." };
  }

  // Verify against fresh data; roll back if still broken.
  const after = await loadSnapshot(ac, champId);
  const verify = "error" in after ? null : checkTournamentIntegrity(after.snapshot);
  const verified = !!verify && !stillBroken(verify);
  if (!verified) await ac.admin.rpc("ai_rollback_champ_repair", { p_champ: champId, p_snapshot: before as any });

  const { data: rec } = await ac.admin.from("ai_assist_interactions").insert({
    ...opts.base, kind: "action", action_name: "repair_tournament_state", status: verified ? "executed" : "failed",
    interpretation: `Self-heal ${t.name}: ${report.findings.map((f) => f.code).join(", ")}`,
    action_args: { tournament_id: champId, changes: report.deterministic },
    preview: { summary: `Automatic repair of ${t.name}`, changes: planned, affected: ["Tournament fixtures"], consequences: summary.findings.map((f) => f.message), unchanged: ["Started or scored games", "All results and pool standings"], reversible: true, request: opts.request, automatic: true },
    confirmed_at: new Date().toISOString(), executed_at: new Date().toISOString(),
    before_data: { tournament_id: champId, snapshot: before }, after_data: { tournament_id: champId, snapshot: before, verification: verify?.findings ?? null },
    result: { automatic: true, verified, live, ms: Date.now() - started, findings: report.findings, judgement: summary.needs_a_person },
    reversible: verified, error: verified ? null : "Post-repair verification failed — rolled back",
  }).select("id").single();
  await ac.admin.from("audit_events").insert({
    club_id: t.club_id, actor_user_id: ac.userId, entity_type: "tournament", entity_id: champId,
    action: verified ? "ai_auto_repair" : "ai_auto_repair_rolled_back",
    reason: `Reported${opts.transcriptUsed ? " by voice" : ""}: ${opts.request.slice(0, 300)}`,
    before_data: before as any, after_data: { changes: planned, verification: verify?.findings ?? null, interaction_id: rec?.id },
  });

  if (verified) {
    const { data: admins } = await ac.admin.from("club_members").select("user_id").eq("club_id", t.club_id).eq("role", "admin").not("user_id", "is", null);
    const notes = [...new Set((admins ?? []).map((a: any) => a.user_id))].filter((u) => u !== ac.userId).map((u) => ({
      user_id: u, type: "tournament", title: `${t.name}: fixed automatically`,
      message: `The assistant corrected ${planned.length} playoff/fixture issue(s) from the final pool standings. ${planned.slice(0, 3).join("; ")}`.slice(0, 480),
      url: `/club-champs/${champId}`, data: { interaction_id: rec?.id, tournament_id: champId },
    }));
    if (notes.length) await ac.admin.from("notifications").insert(notes);
  }
  console.log(JSON.stringify({ fn: "ai-help", event: "auto_repair", verified, changes: planned.length, live, ms: Date.now() - started }));
  return {
    ...summary, repaired: verified, changes_made: verified ? planned : [], interaction_id: rec?.id,
    verification: verified ? "Re-checked after the fix: every team appears once and pairs are intact." : "The fix did not verify, so it was fully rolled back. Escalate with category 'bug'.",
    admins_notified: verified,
  };
}
