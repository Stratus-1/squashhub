import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, MapPin, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { useIsSuperAdmin } from "@/hooks/use-club";
import { useHostClubs, useHostCourts, useOwnerOrganisations } from "@/hooks/use-tournaments";
import { AUDIENCE_OPTIONS, SEEDING_LABELS, isAudienceValid, type EventScope, type SeedingSourceKey } from "@/lib/smart-builder/scope";
import {
  OWNER_KIND_FOR_SCOPE, SCOPE_LABEL, eligibleVenueClubIds, ownerChoices, regionsUnder, subordinateClubIds, tournamentCourts, venueScopeIssues, type OrgLite,
} from "@/lib/smart-builder/venues";
import type { TournamentDefinition } from "@/lib/smart-builder/definition";
import type { BuilderScope } from "@/pages/admin/SmartTournamentBuilder";
import { cn } from "@/lib/utils";

type Edit = (mut: (d: TournamentDefinition) => void) => void;
const sel = "smart-builder-select h-8 w-full rounded-md bg-white/5 border border-white/15 text-white px-2 text-xs";
const SCOPES: Array<{ value: EventScope; hint: string }> = [
  { value: "club", hint: "Run by one club" },
  { value: "regional", hint: "Run by a regional association (e.g. NSA)" },
  { value: "national", hint: "Run by the national federation" },
];

/** Organisations this user may own an event for: Super Admin → all; otherwise their club + orgs they administer. */
function usePermittedOrgs(scope: BuilderScope) {
  const isSuper = useIsSuperAdmin();
  const { data: orgs = [] } = useOwnerOrganisations();
  const { data: adminOf = [] } = useQuery({
    queryKey: ["my-org-admin"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [] as string[];
      const { data } = await fromExt("organisation_admins").select("org_id").eq("user_id", u.user.id).eq("active", true);
      return ((data ?? []) as { org_id: string }[]).map((r) => r.org_id);
    },
  });
  const { data: rels = [] } = useQuery({
    queryKey: ["org-relationships"],
    queryFn: async () => {
      const { data } = await fromExt("organisation_relationships").select("parent_org_id, child_org_id");
      return (data ?? []) as { parent_org_id: string; child_org_id: string }[];
    },
  });
  const permitted = useMemo(() => (isSuper ? orgs : orgs.filter((o) =>
    adminOf.includes(o.id) || (scope.kind === "club" && o.club_id === scope.clubId))) as OrgLite[], [isSuper, orgs, adminOf, scope]);
  return { orgs: orgs as OrgLite[], permitted, rels };
}

export function EventSetupSection({ def, edit, scope }: { def: TournamentDefinition; edit: Edit; scope: BuilderScope }) {
  const ev = def.event ?? {};
  const lvl = (ev.scope ?? null) as EventScope | null;
  const { orgs, permitted, rels } = usePermittedOrgs(scope);
  const { data: clubs = [] } = useHostClubs();
  const set = (patch: Partial<typeof ev>) => edit((d) => { d.event = { ...d.event, ...patch }; });

  // Convenience: a club-context builder preselects its own club as owner. Still visible and editable.
  const ownClubOrg = scope.kind === "club" ? orgs.find((o) => o.club_id === scope.clubId) : undefined;
  useEffect(() => {
    if (scope.kind === "club" && !ev.scope && ownClubOrg) {
      edit((d) => { d.event = { ...d.event, scope: "club", ownerId: ownClubOrg.id, ownerName: ownClubOrg.name }; d.ownerKind = "club"; });
    }
  }, [ownClubOrg?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const choices = ownerChoices(lvl, permitted);
  const owner = orgs.find((o) => o.id === ev.ownerId);
  const ownerMismatch = !!owner && !!lvl && !choices.some((c) => c.id === owner.id);

  // Venue candidates: owning club for club events; clubs under the owner for regional/national.
  const candidateIds = useMemo(() => eligibleVenueClubIds(lvl, owner, orgs, rels), [owner, lvl, orgs, rels]);
  const regions = useMemo(() => (lvl === "national" && owner ? regionsUnder(owner.id, orgs, rels) : []), [lvl, owner, orgs, rels]);
  const v = ev.venues ?? { mode: null, clubIds: [], names: [] };
  const regionId = v.regionId ?? null;
  const browseIds = lvl === "national" && regionId ? subordinateClubIds(regionId, orgs, rels) : candidateIds;
  const candidates = clubs.filter((c) => browseIds.includes(c.id));
  const { data: courts = [], isLoading: courtsLoading } = useHostCourts(Array.from(new Set([...candidateIds, ...v.clubIds])));
  const courtsAt = (clubId: string) => tournamentCourts(courts, clubId);
  const clubName = (id: string) => clubs.find((c) => c.id === id)?.name ?? id;
  const stale = ev.venuesStale ?? [];
  const setVenues = (ids: string[], mode = v.mode, courtIds = v.courtIds ?? {}) => {
    const next: Record<string, number[]> = {};
    ids.forEach((id) => { next[id] = courtIds[id] ?? courtsAt(id).map((c) => c.court_id); }); // new venue → all its active courts
    set({ venues: { ...v, mode, clubIds: ids, names: ids.map(clubName), courtIds: next }, noVenue: false, venuesStale: (ev.venuesStale ?? []).filter((x) => ids.includes(x)) });
  };
  const toggleVenue = (id: string) => setVenues(v.mode === "single" ? [id] : v.clubIds.includes(id) ? v.clubIds.filter((x) => x !== id) : [...v.clubIds, id]);
  const toggleCourt = (clubId: string, courtId: number) => {
    const cur = v.courtIds?.[clubId] ?? [];
    setVenues(v.clubIds, v.mode, { ...(v.courtIds ?? {}), [clubId]: cur.includes(courtId) ? cur.filter((x) => x !== courtId) : [...cur, courtId] });
  };
  const allCourts = (clubId: string, on: boolean) => setVenues(v.clubIds, v.mode, { ...(v.courtIds ?? {}), [clubId]: on ? courtsAt(clubId).map((c) => c.court_id) : [] });
  // Owner/level changed: flag venues that are no longer eligible instead of silently keeping or dropping them.
  const markStale = (d: TournamentDefinition, nextEligible: string[]) => {
    const bad = venueScopeIssues(d, nextEligible);
    d.event = { ...d.event, venuesStale: bad };
  };

  // Club event: the owning club is the default venue, with all its active courts.
  useEffect(() => {
    if (lvl !== "club" || !owner?.club_id || ev.noVenue || v.clubIds.length || courtsLoading) return;
    const id = owner.club_id;
    set({ venues: { mode: "single", clubIds: [id], names: [clubName(id)], courtIds: { [id]: courtsAt(id).map((c) => c.court_id) } }, noVenue: false });
  }, [lvl, owner?.club_id, courtsLoading, courts.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3">
      {/* 1. Event level + owner */}
      <section data-field="event.scope" className="rounded-lg border border-white/15 bg-white/[0.04] p-3 space-y-2 text-xs text-white/80">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-white"><Building2 className="w-4 h-4" />Event level &amp; owner</h3>
        <div role="radiogroup" aria-label="Event level" className="grid sm:grid-cols-3 gap-2">
          {SCOPES.map((s) => (
            <button key={s.value} type="button" role="radio" aria-checked={lvl === s.value}
              onClick={() => edit((d) => {
                const keepOwner = d.event?.scope === s.value;
                d.event = { ...d.event, scope: s.value, ...(keepOwner ? {} : { ownerId: null, ownerName: null, audience: null }) };
                if (!keepOwner) markStale(d, []);
                d.ownerKind = OWNER_KIND_FOR_SCOPE[s.value];
              })}
              className={cn("rounded-md border p-2 text-left", lvl === s.value ? "border-amber-300 bg-amber-500/10 text-white" : "border-white/15 hover:border-white/30")}>
              <div className="font-semibold">{SCOPE_LABEL[s.value]}</div>
              <div className="text-[11px] text-white/55">{s.hint}</div>
            </button>
          ))}
        </div>
        {lvl && (
          <label data-field="event.owner" className="block space-y-0.5 rounded">
            <span className="text-[11px] text-white/60">Owning organisation</span>
            <select className={sel} value={ev.ownerId ?? ""} onChange={(e) => {
              const o = orgs.find((x) => x.id === e.target.value);
              edit((d) => {
                d.event = { ...d.event, ownerId: o?.id ?? null, ownerName: o?.name ?? null };
                markStale(d, eligibleVenueClubIds(lvl, o, orgs, rels));
              });
            }}>
              <option value="">Choose…</option>
              {choices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              {ownerMismatch && owner && <option value={owner.id}>{owner.name} (not allowed at this level)</option>}
            </select>
            {!choices.length && <span className="block text-[11px] text-amber-200">You don't manage any organisation at this level. Ask an administrator of that organisation to set it up.</span>}
            {ownerMismatch && <span className="block text-[11px] text-red-300">This organisation can't own a {SCOPE_LABEL[lvl].toLowerCase()}. Choose another.</span>}
          </label>
        )}
      </section>

      {/* 2. Audience — separate from owner */}
      {lvl && (
        <section data-field="event.audience" className="rounded-lg border border-white/15 bg-white/[0.04] p-3 space-y-2 text-xs text-white/80">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-white"><Users className="w-4 h-4" />Who may enter</h3>
          <p className="text-[11px] text-white/50">The owner runs the event; this decides who is eligible to play in it.</p>
          <select className={sel} value={isAudienceValid(lvl, ev.audience as any) ? ev.audience! : ""} onChange={(e) => set({ audience: (e.target.value || null) as any })}>
            <option value="">Choose…</option>
            {AUDIENCE_OPTIONS[lvl].map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <div className="grid sm:grid-cols-2 gap-2">
            <label data-field="event.expectedEntries" className="block space-y-0.5 rounded">
              <span className="text-[11px] text-white/60">Expected entries (approx.)</span>
              <Input className="h-8 bg-white/5 border-white/15 text-white text-xs" inputMode="numeric" value={ev.expectedEntries ?? ""}
                onChange={(e) => set({ expectedEntries: e.target.value ? Number(e.target.value) : null })} />
            </label>
            <label data-field="event.seedingSource" className="block space-y-0.5 rounded">
              <span className="text-[11px] text-white/60">Seeding data</span>
              <select className={sel} value={ev.seedingSource ?? ""} onChange={(e) => set({ seedingSource: (e.target.value || null) as SeedingSourceKey | null })}>
                <option value="">Not decided</option>
                {(Object.keys(SEEDING_LABELS) as SeedingSourceKey[]).map((k) => <option key={k} value={k}>{SEEDING_LABELS[k]}</option>)}
              </select>
            </label>
          </div>
        </section>
      )}

      {/* 3. Venue(s) — where the event may be played. Schedule allocates courts inside this set. */}
      {lvl && (
        <section data-field="event.venues" className="rounded-lg border border-white/15 bg-white/[0.04] p-3 space-y-2 text-xs text-white/80">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-white"><MapPin className="w-4 h-4" />Venue(s)</h3>
          <p className="text-[11px] text-white/50">Where this tournament may be played. Dates, times and courts for each round are set on Schedule, using only these venues.</p>
          {!owner ? <p className="text-[11px] text-amber-200">Choose the owning organisation first.</p> : (
            <>
              <div role="radiogroup" aria-label="Number of venues" className="flex flex-wrap gap-2">
                {(["single", "multiple"] as const).map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={v.mode === m && !ev.noVenue}
                    onClick={() => setVenues(m === "single" ? v.clubIds.slice(0, 1) : v.clubIds, m)}
                    className={cn("rounded-md border px-2 py-1", v.mode === m && !ev.noVenue ? "border-amber-300 bg-amber-500/10 text-white" : "border-white/15")}>
                    {m === "single" ? "Single venue" : "Multiple venues"}
                  </button>
                ))}
                <button type="button" role="radio" aria-checked={!!ev.noVenue}
                  onClick={() => set({ noVenue: true, venues: { mode: null, clubIds: [], names: [] } })}
                  className={cn("rounded-md border px-2 py-1", ev.noVenue ? "border-amber-300 bg-amber-500/10 text-white" : "border-white/15")}>
                  No physical venue
                </button>
              </div>
              {stale.length > 0 && (
                <div role="alert" className="rounded border border-red-400/40 bg-red-500/10 p-2 text-[11px] text-red-200">
                  Not under the current owner: {stale.map(clubName).join(", ")}. Games can't be scheduled there.{" "}
                  <button type="button" className="underline" onClick={() => setVenues(v.clubIds.filter((id) => !stale.includes(id)))}>Remove them</button>
                </div>
              )}
              {v.mode && !ev.noVenue && (
                <div className="space-y-2">
                  {lvl === "national" && (
                    <label className="block space-y-0.5">
                      <span className="text-[11px] text-white/60">Region</span>
                      <select className={sel} value={regionId ?? ""} onChange={(e) => set({ venues: { ...v, regionId: e.target.value || null } })}>
                        <option value="">All regions</option>
                        {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </label>
                  )}
                  {lvl !== "club" && (
                    <div className="flex flex-wrap gap-1" aria-label="Host clubs">
                      {candidates.map((c) => {
                        const on = v.clubIds.includes(c.id);
                        return (
                          <button key={c.id} type="button" aria-pressed={on} onClick={() => toggleVenue(c.id)}
                            className={cn("rounded-full border px-2 py-0.5", on ? "border-amber-300 bg-amber-500/15 text-white" : "border-white/15 text-white/70")}>
                            {c.name}
                          </button>
                        );
                      })}
                      {!candidates.length && <p className="text-[11px] text-amber-200">No clubs are linked under {regionId ? "this region" : owner.name} in SquashHub yet, so no host venue can be chosen.</p>}
                    </div>
                  )}
                  {lvl === "club" && <p className="text-[11px] text-white/45">Club events are played at the owning club.</p>}
                  {v.clubIds.map((clubId) => {
                    const list = courtsAt(clubId), picked = v.courtIds?.[clubId] ?? [];
                    return (
                      <fieldset key={clubId} className="rounded border border-white/10 p-2">
                        <legend className="px-1 text-[11px] font-semibold text-white">{clubName(clubId)} · {picked.length}/{list.length} courts</legend>
                        {courtsLoading ? <p className="text-[11px] text-white/45">Loading courts…</p> : !list.length ? (
                          <p className="text-[11px] text-amber-200">No active courts are recorded for this club. Add them under the club's Courts settings first.</p>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            {list.map((c) => (
                              <label key={c.court_id} className="flex items-center gap-1">
                                <input type="checkbox" checked={picked.includes(c.court_id)} onChange={() => toggleCourt(clubId, c.court_id)} />
                                {c.name}{c.is_external && c.venue_name ? ` (at ${c.venue_name})` : ""}
                              </label>
                            ))}
                            <button type="button" className="underline text-amber-200" onClick={() => allCourts(clubId, picked.length !== list.length)}>
                              {picked.length === list.length ? "Clear" : "Select all"}
                            </button>
                          </div>
                        )}
                      </fieldset>
                    );
                  })}
                  {v.clubIds.length > 0 && <p className="text-[11px] text-white/60">Available tournament courts: {v.clubIds.reduce((n, id) => n + (v.courtIds?.[id]?.length ?? 0), 0)}. Selecting a court makes it available to Schedule — it doesn't book it.</p>}
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
