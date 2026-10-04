import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronRight, Search, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  loadDeliveries, recipientPreset, recipientStatus,
  type BetaLifecycle, type DeliveryRowAt, type Handover, type InformChannel,
} from "@/lib/smart-builder/step-handover";
import {
  EMPTY_INVITE_AUDIENCE, memberMatchesTournamentGender, personaliseInvite, sendInvites,
  type StepInviteAudience,
} from "@/lib/smart-builder/step-invite";
import {
  audienceLabel, audienceModesForScope, resolveInviteAudience,
  type AudienceMemberRow, type InviteAudienceMode,
} from "@/lib/tournaments/invite-audience";
import { fetchInviteDirectory, type DirectoryPlayer } from "@/lib/tournaments/invite-directory";
import {
  associationTickState, fetchScopeMemberIds, fetchScopeTree, toggleAssociation, toggleClub,
  type ScopeTreeAssociation,
} from "@/lib/tournaments/invite-scope-tree";
import { buildLeagueTree, type LeagueTreeGroup } from "@/lib/tournaments/league-tree";
import { buildScopeLeagueTree, fetchScopeLeagueMemberIds, fetchScopeLeagueTree } from "@/lib/tournaments/invite-league-tree";
import { LeagueSourceTree } from "@/components/club-admin/tournament/LeagueSourceTree";

const CH_LABEL: Record<InformChannel, string> = { in_app: "In-app", email: "Email", whatsapp: "WhatsApp", sms: "SMS" };
const ALL: InformChannel[] = ["in_app", "email", "whatsapp", "sms"];

/** Every invite campaign for this tournament (first send + resends). */
export const inviteCampaignIds = (l: BetaLifecycle) =>
  [l.invite?.method === "sent" ? l.invite.campaign_id : null, ...(l.invite?.resend_campaign_ids ?? [])].filter(Boolean) as string[];

type PoolMember = AudienceMemberRow & { name?: string | null; gender?: string | null };

/**
 * Invite mode: pick WHO gets the invitation (all members / clubs / league teams /
 * individuals), preview the personal message, then send through the Comms engine.
 * Audience resolution is the tested, fail-closed resolveInviteAudience; a selected
 * send can never widen beyond the picked audience.
 */
export function StepInvitePanel({ h, lifecycle, onLifecycle, onSent }: {
  h: Handover; lifecycle: BetaLifecycle; onLifecycle: (l: BetaLifecycle) => Promise<void>; onSent?: () => void;
}) {
  const saved = lifecycle.invite?.audience;
  const [aud, setAud] = useState<StepInviteAudience>({
    mode: (saved?.mode as InviteAudienceMode) || EMPTY_INVITE_AUDIENCE.mode,
    leagueIds: saved?.leagueIds ?? [],
    clubIds: saved?.clubIds ?? [],
    individualIds: saved?.individualIds ?? [],
  });
  const [scope, setScope] = useState<string>("club");
  const [gender, setGender] = useState<string | null>(null);
  const [feeCents, setFeeCents] = useState(0);
  const [payFirst, setPayFirst] = useState(false);
  const [members, setMembers] = useState<PoolMember[]>([]);
  const [leagueGroups, setLeagueGroups] = useState<LeagueTreeGroup[]>([]);
  const [regsByLeague, setRegsByLeague] = useState<Map<string, string[]>>(new Map());
  const [scopeTree, setScopeTree] = useState<ScopeTreeAssociation[]>([]);
  const [scopeMemberIds, setScopeMemberIds] = useState<Map<string, string[]>>(new Map());
  const [scopeLeagueIds, setScopeLeagueIds] = useState<Map<string, string[]>>(new Map());
  const [pickedPlayers, setPickedPlayers] = useState<DirectoryPlayer[]>([]);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<DirectoryPlayer[]>([]);
  const [dirNames, setDirNames] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resendIds, setResendIds] = useState<string[] | null>(null);
  const [rows, setRows] = useState<DeliveryRowAt[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [selRaw, setSel] = useState<string[] | null>(null);
  const savedCh = (h.channels.filter((c) => (ALL as string[]).includes(c)) as InformChannel[]);
  const [picked, setChannels] = useState<InformChannel[]>(savedCh.length ? savedCh : ["in_app"]);
  const [avail, setAvail] = useState<Record<InformChannel, boolean> | null>(null);

  const wide = scope === "association" || scope === "open";

  /* ── Load tournament facts + host-club pool + leagues ── */
  useEffect(() => {
    let active = true;
    (async () => {
      const [t, gov, mem, leagues] = await Promise.all([
        fromExt("club_champs").select("entry_fee_cents, payment_required, payment_timing, gender").eq("id", h.tournamentId).maybeSingle(),
        fromExt("tournament_governance").select("eligibility_scope").eq("tournament_id", h.tournamentId).maybeSingle(),
        supabase.from("club_members").select("id, name, status, role, billing_exempt, gender").eq("club_id", h.clubId),
        fromExt("leagues").select("id, name, association_id, season_year, level, is_reserve").eq("club_id", h.clubId).is("archived_at", null).order("name"),
      ]);
      if (!active) return;
      const td = t.data as any;
      setFeeCents(Number(td?.entry_fee_cents ?? 0));
      setPayFirst(((td?.payment_timing ?? "on_entry") !== "after_acceptance") && !!td?.payment_required && Number(td?.entry_fee_cents ?? 0) > 0);
      setGender(td?.gender ?? null);
      setScope(String((gov.data as any)?.eligibility_scope ?? "club"));
      setMembers((mem.data ?? []) as PoolMember[]);
      const lg = (leagues.data ?? []) as any[];
      setLeagueGroups(buildLeagueTree(lg.map((l) => ({ id: l.id, name: l.name, level: l.level ?? null, seasonYear: l.season_year ?? null, isReserve: l.is_reserve ?? null }))));
      if (lg.length) {
        const { data: regs } = await fromExt("member_league_registrations").select("league_id, club_member_id, is_reserve").in("league_id", lg.map((l) => l.id));
        if (!active) return;
        const m = new Map<string, string[]>();
        (regs ?? []).forEach((r: any) => {
          if (!r.club_member_id || r.is_reserve) return;
          m.set(r.league_id, [...(m.get(r.league_id) ?? []), r.club_member_id]);
        });
        setRegsByLeague(m);
      }
    })().catch(() => {});
    return () => { active = false; };
  }, [h.tournamentId, h.clubId]);

  /* ── Wide scope: club tree + region league tree ── */
  useEffect(() => {
    if (!wide) return;
    let active = true;
    fetchScopeTree({ tournamentId: h.tournamentId, clubId: h.clubId, scope }).then((t) => { if (active) setScopeTree(t); }).catch(() => {});
    fetchScopeLeagueTree({ tournamentId: h.tournamentId, clubId: h.clubId, scope })
      .then((r) => { if (active) setLeagueGroups(buildScopeLeagueTree(r)); })
      .catch(() => {});
    // id → name map for cross-club recipients (directory is privacy-safe).
    fetchInviteDirectory({ tournamentId: h.tournamentId, clubId: h.clubId, scope, limit: 500 })
      .then((ps) => { if (active) setDirNames(new Map(ps.map((p) => [p.member_id, p.display_name]))); })
      .catch(() => {});
    return () => { active = false; };
  }, [wide, scope, h.tournamentId, h.clubId]);

  /* ── Resolve ticked clubs / region teams server-side ── */
  useEffect(() => {
    if (!wide || aud.clubIds.length === 0) { setScopeMemberIds(new Map()); return; }
    let active = true;
    fetchScopeMemberIds({ tournamentId: h.tournamentId, clubId: h.clubId, scope, clubIds: aud.clubIds })
      .then((m) => { if (active) setScopeMemberIds(m); }).catch(() => {});
    return () => { active = false; };
  }, [wide, aud.clubIds, h.tournamentId, h.clubId, scope]);
  useEffect(() => {
    if (!wide || aud.leagueIds.length === 0) { setScopeLeagueIds(new Map()); return; }
    let active = true;
    fetchScopeLeagueMemberIds({ tournamentId: h.tournamentId, clubId: h.clubId, scope, leagueIds: aud.leagueIds })
      .then((m) => { if (active) setScopeLeagueIds(m); }).catch(() => {});
    return () => { active = false; };
  }, [wide, aud.leagueIds, h.tournamentId, h.clubId, scope]);

  /* ── Channel availability (club setup) ── */
  useEffect(() => {
    Promise.all([
      supabase.from("clubs").select("whatsapp_enabled, sms_enabled").eq("id", h.clubId).maybeSingle(),
      supabase.from("club_secrets").select("smtp_host, sender_email").eq("club_id", h.clubId).maybeSingle(),
    ]).then(([c, sec]: any[]) => {
      setAvail({ in_app: true, email: !!((sec.data as any)?.smtp_host && (sec.data as any)?.sender_email), whatsapp: !!(c.data as any)?.whatsapp_enabled, sms: !!(c.data as any)?.sms_enabled });
    });
  }, [h.clubId]);

  /* ── Individual search (privacy-safe directory) ── */
  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) { setSearchResults([]); return; }
    let active = true;
    const t = setTimeout(() => {
      fetchInviteDirectory({ tournamentId: h.tournamentId, clubId: h.clubId, scope, search: q, limit: 25 })
        .then((ps) => { if (active) setSearchResults(ps); }).catch(() => {});
    }, 250);
    return () => { active = false; clearTimeout(t); };
  }, [search, h.tournamentId, h.clubId, scope]);

  /* ── Audience resolution (fail-closed, tested rules) ── */
  const pool = useMemo(
    () => members.filter((m) => memberMatchesTournamentGender(m.gender, gender)),
    [members, gender],
  );
  const trusted = useMemo(() => {
    const s = new Set<string>();
    scopeLeagueIds.forEach((ids) => ids.forEach((id) => s.add(id)));
    return s;
  }, [scopeLeagueIds]);
  const resolved = useMemo(() => resolveInviteAudience({
    mode: aud.mode,
    members: pool,
    leagueIds: aud.leagueIds,
    registrationsByLeague: wide ? scopeLeagueIds : regsByLeague,
    individualIds: aud.individualIds,
    clubIds: aud.clubIds,
    memberIdsByClub: scopeMemberIds,
    trustedMemberIds: trusted,
  }), [aud, pool, wide, scopeLeagueIds, regsByLeague, scopeMemberIds, trusted]);

  const nameOf = (id: string) =>
    pool.find((m) => m.id === id)?.name?.trim()
    || pickedPlayers.find((p) => p.member_id === id)?.display_name
    || dirNames.get(id)
    || "Player";

  /* ── Delivery status ── */
  const allIds = inviteCampaignIds(lifecycle);
  const allKey = allIds.join(",");
  useEffect(() => { if (allIds.length) loadDeliveries(allIds).then(setRows); }, [allKey]);
  const ids = resolved.memberIds;
  const status = recipientStatus(ids, rows);
  const reached = status.filter((s) => s.state === "sent").length;
  const notReached = status.filter((s) => s.state !== "sent");
  const sentAlready = allIds.length > 0;
  const sel = (selRaw ?? recipientPreset(sentAlready ? "not_informed" : "all", status)).filter((id) => ids.includes(id));
  const toggle = (id: string) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  const usable = (c: InformChannel) => !avail || avail[c];
  const channels = picked.filter((c) => usable(c));
  const done = lifecycle.completed.includes("invite");

  const setMode = (mode: InviteAudienceMode) => setAud((a) => ({ ...a, mode }));
  const addPlayer = (p: DirectoryPlayer) => {
    setPickedPlayers((cur) => cur.some((x) => x.member_id === p.member_id) ? cur : [...cur, p]);
    setAud((a) => ({ ...a, individualIds: [...new Set([...a.individualIds, p.member_id])] }));
    setSearch(""); setSearchResults([]);
  };
  const removePlayer = (id: string) => {
    setPickedPlayers((cur) => cur.filter((x) => x.member_id !== id));
    setAud((a) => ({ ...a, individualIds: a.individualIds.filter((x) => x !== id) }));
  };

  const send = async (memberIds: string[], isResend: boolean) => {
    setBusy(true); setErr(null);
    try {
      const recipients = memberIds.map((memberId) => ({ memberId, name: nameOf(memberId) }));
      const { campaignId } = await sendInvites({
        clubId: h.clubId, tournamentId: h.tournamentId, name: h.name, channels,
        feeCents, paymentRequired: payFirst, template: h.invitePreview || h.messageTemplate,
        recipients, resend: isResend,
      });
      const prev = lifecycle.invite ?? {};
      const l: BetaLifecycle = isResend && prev.campaign_id
        ? { ...lifecycle, invite: { ...prev, audience: aud, resend_campaign_ids: [...(prev.resend_campaign_ids ?? []), campaignId] } }
        : { ...lifecycle, invite: { ...prev, audience: aud, method: "sent", campaign_id: campaignId, at: prev.at ?? new Date().toISOString() } };
      await onLifecycle(l);
      setRows(await loadDeliveries(inviteCampaignIds(l)));
      onSent?.();
    } catch (e: any) {
      setErr(e?.message || "Sending failed — nothing was recorded as sent.");
    } finally { setBusy(false); setResendIds(null); }
  };

  const proceed = (manual: boolean) => onLifecycle({
    ...lifecycle, stage: done ? lifecycle.stage : "registrations", completed: [...new Set([...lifecycle.completed, "invite" as const])],
    invite: { ...(lifecycle.invite ?? {}), audience: aud, method: manual ? (lifecycle.invite?.method ?? "manual") : lifecycle.invite?.method, at: lifecycle.invite?.at ?? new Date().toISOString(), note: manual ? "Invited outside SquashHub" : lifecycle.invite?.note },
  });

  const modes = audienceModesForScope(scope);
  const previewText = personaliseInvite(h.invitePreview || h.messageTemplate, nameOf(sel[0] ?? ids[0] ?? ""), "https://…/i/their-personal-link");

  return (
    <div className="space-y-3 text-sm">
      {/* 1. Audience */}
      <div className="rounded border border-border p-2 text-xs">
        <div className="mb-1 font-semibold">Invite audience — who gets the invitation</div>
        <div className="flex flex-wrap gap-1">
          {modes.map((m) => (
            <button key={m} type="button" aria-pressed={aud.mode === m} onClick={() => setMode(m)}
              className={cn("rounded-full border px-2.5 py-0.5", aud.mode === m ? "border-primary bg-primary font-semibold text-primary-foreground" : "border-border text-muted-foreground")}>
              {audienceLabel(m, scope)}
            </button>
          ))}
        </div>

        {aud.mode === "leagues" && (
          <div className="mt-2">
            <LeagueSourceTree groups={leagueGroups} selected={aud.leagueIds} onChange={(ids) => setAud((a) => ({ ...a, leagueIds: ids }))} />
          </div>
        )}

        {aud.mode === "clubs" && (
          <div className="mt-2 max-h-60 space-y-1 overflow-auto pr-0.5">
            {scopeTree.length === 0 && <p className="text-[11px] text-muted-foreground">Loading clubs…</p>}
            {scopeTree.map((g) => {
              const state = associationTickState(g, new Set(aud.clubIds));
              return (
                <div key={g.associationId ?? g.associationName} className="rounded-md border border-border/50 px-1.5 py-1">
                  <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                    <input type="checkbox" className="h-3.5 w-3.5 accent-violet-500" checked={state === "all"}
                      ref={(el) => { if (el) el.indeterminate = state === "some"; }}
                      onChange={() => setAud((a) => ({ ...a, clubIds: toggleAssociation(g, a.clubIds) }))} />
                    <span className="truncate">{g.associationName}</span>
                  </label>
                  <div className="pl-6 pt-0.5 space-y-0.5">
                    {g.clubs.map((c) => (
                      <label key={c.clubId} className="flex items-center gap-2 text-[11px] cursor-pointer">
                        <input type="checkbox" className="h-3 w-3 accent-violet-500" checked={aud.clubIds.includes(c.clubId)}
                          onChange={() => setAud((a) => ({ ...a, clubIds: toggleClub(c.clubId, a.clubIds) }))} />
                        <span className="truncate">{c.clubName}{c.isOwnClub ? " (your club)" : ""}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">{c.emailCount} of {c.memberCount} reachable</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {aud.mode === "individuals" && (
          <div className="mt-2 space-y-1">
            {aud.individualIds.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {aud.individualIds.map((id) => (
                  <span key={id} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px]">
                    {nameOf(id)}
                    <button type="button" aria-label={`Remove ${nameOf(id)}`} onClick={() => removePlayer(id)}><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search players by name" className="h-7 pl-7 text-[11px]" />
            </div>
            {searchResults.length > 0 && (
              <ul className="max-h-44 divide-y divide-border overflow-auto rounded border border-border">
                {searchResults.filter((p) => !aud.individualIds.includes(p.member_id)).map((p) => (
                  <li key={p.member_id}>
                    <button type="button" className="flex w-full items-center justify-between gap-2 px-2 py-1 text-left text-[11px] hover:bg-muted/40" onClick={() => addPlayer(p)}>
                      <span>{p.display_name}{p.club_name && !p.is_own_club ? <span className="text-muted-foreground"> · {p.club_name}</span> : null}</span>
                      <span className="text-muted-foreground">{p.invite_status ? `already ${p.invite_status}` : "Add"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <p className="mt-2 font-medium" data-testid="invite-audience-summary">Will reach {ids.length} member{ids.length === 1 ? "" : "s"} — {resolved.summary}</p>
      </div>

      {/* 2. Channels */}
      <div className="rounded border border-border p-2 text-xs">
        <div className="mb-1 font-semibold">Send by</div>
        <div className="flex flex-wrap gap-1">{ALL.map((c) => {
          const ok = usable(c); const on = ok && picked.includes(c);
          return <button key={c} type="button" disabled={!ok} aria-pressed={on}
            onClick={() => setChannels((p) => p.includes(c) ? p.filter((x) => x !== c) : [...p, c])}
            className={cn("rounded-full border px-2.5 py-0.5", on ? "border-primary bg-primary font-semibold text-primary-foreground" : "border-border text-muted-foreground", !ok && "line-through opacity-60")}>{CH_LABEL[c]}</button>;
        })}</div>
        {avail && <p className="mt-1 text-muted-foreground">{ALL.filter((c) => !avail[c]).map((c) => `${CH_LABEL[c]} not connected`).join(" · ") || "All channels connected."}{wide ? " Cross-club contact details are checked at send time — unreachable players show as Not reached below." : ""}</p>}
      </div>

      {/* 3. Preview */}
      <div>
        <div className="mb-1 text-xs text-muted-foreground">Preview — what each invitee receives (greeting and entry link are personal)</div>
        <pre className="whitespace-pre-wrap rounded border border-border bg-muted/30 p-2 font-sans text-xs">{previewText}</pre>
        <p className="mt-1 text-xs text-muted-foreground">In emails the entry link is sent as a large "Enter here" button, with a second "Go to Tournament" button below.</p>
      </div>


      {/* 4. Recipients */}
      {ids.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button type="button" className="flex items-center gap-1 font-medium text-primary" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
            {showAll ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}View recipients
          </button>
          <span className="font-semibold" data-testid="selected-count">{sel.length} of {ids.length} selected</span>
          <span className="text-muted-foreground">Select:</span>
          <button type="button" className="text-primary underline" onClick={() => { setSel(recipientPreset("all", status)); setShowAll(true); }}>All</button>
          {sentAlready && <button type="button" className="text-primary underline" onClick={() => { setSel(recipientPreset("not_informed", status)); setShowAll(true); }}>Not reached yet ({notReached.length})</button>}
          <button type="button" className="text-primary underline" onClick={() => { setSel([]); setShowAll(true); }}>None</button>
        </div>
      )}
      {showAll && <ul className="max-h-72 divide-y divide-border overflow-auto rounded border border-border text-xs">{ids.map((id) => {
        const st = status.find((x) => x.memberId === id)!;
        return <li key={id} className="flex flex-wrap items-center justify-between gap-2 px-2 py-1.5">
          <label className="flex items-center gap-2"><input type="checkbox" aria-label={`Select ${nameOf(id)}`} checked={sel.includes(id)} onChange={() => toggle(id)} />
            <span className="font-medium">{nameOf(id)}</span></label>
          <span className="flex items-center gap-2">
            <span className={st.state === "sent" ? "text-primary" : sentAlready ? "text-destructive" : "text-muted-foreground"} title={st.problems.join(" · ")}>
              {st.state === "sent" ? `Sent${st.sends > 1 ? ` ${st.sends}×` : ""} · ${st.reached.map((c) => CH_LABEL[c as InformChannel] ?? c).join(", ")}` : sentAlready ? `Not reached${st.problems[0] ? ` — ${st.problems[0]}` : ""}` : "Not sent yet"}
            </span>
            <button type="button" disabled={busy || !channels.length} className="text-primary underline disabled:opacity-50" onClick={() => setResendIds([id])}>{sentAlready ? "Send again" : "Send to this player only"}</button>
          </span>
        </li>;
      })}</ul>}

      {err && <div className="rounded border border-destructive/50 bg-destructive/10 p-2 text-xs">{err}</div>}

      {sentAlready && <div className={cn("rounded border p-2 text-xs", notReached.length ? "border-destructive/50 bg-destructive/10" : "border-primary/50 bg-primary/10")}>
        {reached} of {ids.length} reached.{notReached.length ? ` Not reached: ${notReached.map((s) => nameOf(s.memberId)).join(", ")}.` : " Everyone has been invited."}
      </div>}

      {/* 5. Actions */}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !channels.length || sel.length === 0} onClick={() => setConfirmOpen(true)}>
          <Send className="mr-1 h-4 w-4" />{busy ? "Sending…" : sentAlready ? `Send again to ${sel.length} selected` : `Send invitations (${sel.length})`}
        </Button>
        {sentAlready && notReached.length === 0 && !done && <Button variant="secondary" onClick={() => proceed(false)}>Continue to Registrations & payments<ChevronRight className="ml-1 h-4 w-4" /></Button>}
        {!done && <Button variant="ghost" size="sm" onClick={() => { if (confirm("Record that you invited players yourself, outside SquashHub? SquashHub sends NOTHING for this.")) proceed(true); }}>
          Record: I invited them outside SquashHub (sends nothing)
        </Button>}
      </div>
      <p className="text-[11px] text-muted-foreground">Nothing is sent until you confirm. Each invitee gets their own entry link; anyone who declined before is simply re-invited, and players who already entered are never re-mailed unless you pick them and send again.</p>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send invitations to {sel.length} member{sel.length === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Audience: {audienceLabel(aud.mode, scope)}. Each of the {sel.length} selected members gets their personal invitation now by {channels.map((c) => CH_LABEL[c]).join(", ")} — nobody else is messaged. It can't be unsent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmOpen(false); send(sel, sentAlready); }}>Send now</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!resendIds} onOpenChange={(o) => !o && setResendIds(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{sentAlready ? "Send again" : "Send"} to {resendIds?.length === 1 ? nameOf(resendIds[0]) : `${resendIds?.length ?? 0} members`}?</AlertDialogTitle>
            <AlertDialogDescription>Sends their personal invitation now by {channels.map((c) => CH_LABEL[c]).join(", ")}. Only {resendIds?.length === 1 ? "this member" : "these members"} — nobody else is messaged. It can't be unsent.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => resendIds && send(resendIds, sentAlready)}>Send now</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
