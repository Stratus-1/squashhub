import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { useLeagueAssociations, LeagueAssociation } from "@/hooks/use-club";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Trophy, Building2, Users } from "lucide-react";

export type LeagueKind = "tenant" | "internal" | "external_regional";

export interface LeagueSelection {
  associationId: string;
  kind: LeagueKind;
  /** Tenant subdomain to call provision-association-member with */
  tenantSubdomain?: string | null;
  /** External (NSA-style) number entered by the member, optional */
  externalNumber?: string;
  /** Annual fee that will be added (0 for internal) */
  feeAmount: number;
  /** Display label */
  label: string;
}

interface AssociationTenantRef {
  id: string;
  name: string;
  subdomain: string | null;
  abbreviation: string | null;
}

interface Props {
  clubId: string | null | undefined;
  /** Currently selected association ids → selection details */
  value: Record<string, LeagueSelection>;
  onChange: (next: Record<string, LeagueSelection>) => void;
  /** Hide rows the member has already been provisioned to (used by dashboard banner) */
  excludeAssociationIds?: string[];
  compact?: boolean;
}

/**
 * Shared multi-select picker for league participation.
 *
 * Source of truth = the club's `league_associations` rows (set up under
 * Club Admin → Leagues). Each row is classified at render time:
 *
 *  - **tenant**            — `platform_association_id` is set OR a `clubs`
 *                            row with `tenant_type='association'` matches by
 *                            subdomain/abbreviation. Ticking it triggers the
 *                            `provision-association-member` edge function so
 *                            the member is registered on the league tenant
 *                            (e.g. LS) and a pass-through fee is seeded on
 *                            both sides.
 *  - **internal**          — `scope = 'internal'`. No number, no fee.
 *  - **external_regional** — `scope = 'region'` with no tenant link
 *                            (e.g. NSA). Member can enter an existing number
 *                            (admin can fill later or sync via API). Fee
 *                            from `league_associations.fee_annual` is added
 *                            to the home-club account.
 */
export function LeagueParticipationPicker({
  clubId,
  value,
  onChange,
  excludeAssociationIds = [],
  compact = false,
}: Props) {
  const { data: leagueAssocs = [] } = useLeagueAssociations(clubId);

  // Pull all association tenants once so we can match league_associations rows
  // that don't yet have platform_association_id wired up.
  const { data: tenants = [] } = useQuery({
    queryKey: ["association-tenants-for-picker"],
    queryFn: async () => {
      const { data, error } = await fromExt("clubs")
        .select("id, name, subdomain, tenant_type")
        .eq("tenant_type", "association");
      if (error) throw error;
      return ((data || []) as any[]).map((c) => ({
        id: c.id as string,
        name: c.name as string,
        subdomain: (c.subdomain as string | null) ?? null,
        abbreviation: null,
      })) as AssociationTenantRef[];
    },
    staleTime: 5 * 60_000,
  });

  const classified = useMemo(() => {
    return (leagueAssocs as LeagueAssociation[])
      .filter((a) => !excludeAssociationIds.includes(a.id))
      .map((a) => {
        let kind: LeagueKind;
        let tenantSubdomain: string | null = null;

        if (a.scope === "internal") {
          kind = "internal";
        } else {
          // Try platform_association_id → tenant subdomain
          let tenant: AssociationTenantRef | undefined;
          if (a.platform_association_id) {
            tenant = tenants.find((t) => t.id === a.platform_association_id);
          }
          // Fallback: match by name or abbreviation against tenant subdomain
          if (!tenant) {
            const abbrLower = (a.abbreviation || "").toLowerCase();
            const nameLower = (a.name || "").toLowerCase();
            tenant = tenants.find(
              (t) =>
                (abbrLower && t.subdomain?.toLowerCase() === abbrLower) ||
                (nameLower && t.name.toLowerCase() === nameLower),
            );
          }
          if (tenant) {
            kind = "tenant";
            tenantSubdomain = tenant.subdomain;
          } else {
            kind = "external_regional";
          }
        }

        const feeAmount = kind === "internal" ? 0 : Number(a.fee_annual || 0);
        const label = `${a.name}${a.abbreviation ? ` (${a.abbreviation})` : ""}`;
        return { assoc: a, kind, tenantSubdomain, feeAmount, label };
      });
  }, [leagueAssocs, tenants, excludeAssociationIds]);

  const toggle = (assocId: string, on: boolean) => {
    const next = { ...value };
    if (on) {
      const row = classified.find((c) => c.assoc.id === assocId);
      if (!row) return;
      next[assocId] = {
        associationId: assocId,
        kind: row.kind,
        tenantSubdomain: row.tenantSubdomain,
        externalNumber: "",
        feeAmount: row.feeAmount,
        label: row.label,
      };
    } else {
      delete next[assocId];
    }
    onChange(next);
  };

  const updateExternalNumber = (assocId: string, num: string) => {
    const sel = value[assocId];
    if (!sel) return;
    onChange({ ...value, [assocId]: { ...sel, externalNumber: num } });
  };

  if (classified.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground bg-muted/40 rounded-md p-2">
        Your club has not configured any leagues yet. Skip for now — your admin can add you later.
      </p>
    );
  }

  return (
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      {classified.map(({ assoc, kind, feeAmount, label }) => {
        const checked = !!value[assoc.id];
        const sel = value[assoc.id];
        return (
          <Card key={assoc.id} className={`p-2.5 ${checked ? "border-primary/40 bg-primary/5" : ""}`}>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <Checkbox
                checked={checked}
                onCheckedChange={(v) => toggle(assoc.id, !!v)}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {kind === "tenant" && <Trophy className="w-3 h-3 text-primary" />}
                  {kind === "internal" && <Users className="w-3 h-3 text-muted-foreground" />}
                  {kind === "external_regional" && <Building2 className="w-3 h-3 text-muted-foreground" />}
                  <span className="text-sm font-medium leading-tight">{label}</span>
                  {kind === "tenant" && (
                    <Badge variant="outline" className="text-[9px] h-4 px-1">Linked league</Badge>
                  )}
                  {kind === "internal" && (
                    <Badge variant="outline" className="text-[9px] h-4 px-1">Internal</Badge>
                  )}
                  {kind === "external_regional" && (
                    <Badge variant="outline" className="text-[9px] h-4 px-1">External</Badge>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {kind === "tenant" &&
                    `Number auto-allocated by ${assoc.abbreviation || assoc.name}. Fee R${feeAmount.toFixed(2)} flows via your club.`}
                  {kind === "internal" && "No registration number or fee — internal club league."}
                  {kind === "external_regional" &&
                    (feeAmount > 0
                      ? `R${feeAmount.toFixed(2)} fee billed via your club. Enter your existing number if you have one.`
                      : "Enter your existing number if you have one.")}
                </p>
                {checked && kind === "external_regional" && (
                  <Input
                    value={sel?.externalNumber || ""}
                    onChange={(e) => updateExternalNumber(assoc.id, e.target.value.toUpperCase())}
                    placeholder={`Existing ${assoc.abbreviation || assoc.name} number (optional)`}
                    className="h-7 text-xs mt-1.5 font-mono"
                  />
                )}
              </div>
            </label>
          </Card>
        );
      })}
    </div>
  );
}

/**
 * Apply the user's league selections after the member row exists.
 * Returns the set of leagues whose fees should NOT be re-seeded
 * elsewhere (because provision-association-member already seeded them).
 */
export async function applyLeagueSelections(args: {
  clubId: string;
  clubMemberId: string;
  selections: LeagueSelection[];
  /**
   * Called for tenant selections — supplied by caller because the
   * Supabase functions client lives in the consuming component's scope.
   */
  invokeProvision: (subdomain: string) => Promise<void>;
}): Promise<{ tenantHandled: Set<string> }> {
  const { clubId, clubMemberId, selections, invokeProvision } = args;
  const tenantHandled = new Set<string>();

  for (const sel of selections) {
    if (sel.kind === "tenant" && sel.tenantSubdomain) {
      try {
        await invokeProvision(sel.tenantSubdomain);
        tenantHandled.add(sel.associationId);
      } catch (err) {
        console.warn("[applyLeagueSelections] provision failed for", sel.label, err);
      }
    }

    if (sel.kind === "internal") {
      await fromExt("club_members")
        .update({ enable_league_association_id: sel.associationId, plays_league: true })
        .eq("id", clubMemberId)
        .eq("club_id", clubId);
    }

    if (sel.kind === "external_regional") {
      // Mark plays_league + link the chosen association
      await fromExt("club_members")
        .update({ enable_league_association_id: sel.associationId, plays_league: true })
        .eq("id", clubMemberId)
        .eq("club_id", clubId);

      // Save the optional external number against a default home-club league
      // so it shows on the member badge (mirrors the tenant flow).
      if (sel.externalNumber && sel.externalNumber.trim()) {
        let { data: leagueRow } = await fromExt("leagues")
          .select("id")
          .eq("club_id", clubId)
          .eq("association_id", sel.associationId)
          .limit(1)
          .maybeSingle();
        if (!leagueRow?.id) {
          const { data: created } = await fromExt("leagues")
            .insert({
              club_id: clubId,
              association_id: sel.associationId,
              name: `${sel.label} Affiliation`,
            })
            .select("id")
            .single();
          leagueRow = created;
        }
        if (leagueRow?.id) {
          await fromExt("member_league_registrations").upsert(
            {
              club_member_id: clubMemberId,
              league_id: leagueRow.id,
              league_association_number: sel.externalNumber.trim(),
            },
            { onConflict: "club_member_id,league_id" },
          );
        }
      }
    }
  }

  return { tenantHandled };
}
