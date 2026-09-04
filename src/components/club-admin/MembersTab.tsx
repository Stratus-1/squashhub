import { computeJoinFee } from "@/lib/fee-proration";
import { useState, useRef, useEffect } from "react";
import { toTitleCase, formatPhoneNumber } from "@/lib/input-formatting";
import { useClubMembers, useFeeCategories, useLeagueAssociations, useNationalBodyFees, useMyClub, ClubMember, MemberFeeCategory, SKILL_LEVELS, getSkillLabel } from "@/hooks/use-club";
import { useMyRoles } from "@/hooks/use-data";
import { fromExt } from "@/lib/supabase-ext";
import { postJournal } from "@/lib/post-journal";

import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { UserPlus, Upload, Download, Search, Edit2, Trash2, CheckCircle2, XCircle, ShieldCheck, ShieldOff, Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useMemberContext } from "@/contexts/MemberContext";

import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useClubCurrency } from "@/hooks/use-currency";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { PendingApplicationsPanel } from "./PendingApplicationsPanel";


/** Extract date of birth from SA ID number (YYMMDD...) and calculate age */
function getAgeFromSaId(idNumber: string): number | null {
  if (!idNumber || idNumber.length < 6) return null;
  const yy = parseInt(idNumber.substring(0, 2), 10);
  const mm = parseInt(idNumber.substring(2, 4), 10) - 1;
  const dd = parseInt(idNumber.substring(4, 6), 10);
  if (isNaN(yy) || isNaN(mm) || isNaN(dd)) return null;
  const century = yy >= 0 && yy <= 30 ? 2000 : 1900;
  const dob = new Date(century + yy, mm, dd);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age >= 0 && age < 150 ? age : null;
}

interface FeePaymentRow {
  id: string;
  club_member_id: string;
  fee_type: string;
  fee_label: string;
  amount: number;
  paid: boolean;
}

interface ExpectedFee {
  fee_type: string;
  fee_label: string;
  amount: number;
  existing?: FeePaymentRow;
}

/** Calculate the joining club fee (full fee if joining within a month of renewal) */
function proRateClubFee(annualFee: number, joinedAt: string, feeDueMonth: number): number {
  const joined = new Date(joinedAt);
  return computeJoinFee(annualFee, feeDueMonth, 1, true, joined).amount;
}


/** Compute expected fees for a member.
 *  Only shows fees that have been explicitly allocated (existing payment record).
 *  Also surfaces legacy balance records. */
function computeExpectedFees(
  member: ClubMember,
  feeCategories: MemberFeeCategory[],
  associations: any[],
  nationalFees: any[],
  feeDueMonth: number,
  existingPayments: FeePaymentRow[]
): ExpectedFee[] {
  const fees: ExpectedFee[] = [];
  const memberPayments = existingPayments.filter(p => p.club_member_id === member.id);

  // 1. Club membership fee — only if an allocated payment record exists
  if (member.fee_category_id) {
    const cat = feeCategories.find(c => c.id === member.fee_category_id);
    if (cat && (cat as any).active !== false) {
      const existing = memberPayments.find(p => p.fee_type === "club" || p.fee_type === "membership");
      if (existing) {
        fees.push({ fee_type: "club", fee_label: `Club – ${cat.name}`, amount: existing.amount, existing });
      }
    }
  }

  // 2. Association fee — only if allocated
  if (member.plays_league) {
    for (const assoc of associations) {
      if (assoc.active === false) continue;
      const existing = memberPayments.find(p => p.fee_type === "association");
      if (existing) {
        const label = existing.fee_label || assoc.abbreviation || assoc.name || "League";
        fees.push({ fee_type: "association", fee_label: label, amount: existing.amount, existing });
      }
    }
  }

  // 3. National body & League affiliation fees — only if allocated
  if (member.plays_league) {
    for (const nat of nationalFees) {
      if (nat.active === false) continue;
      if (nat.fee_type === "registration") continue;
      if (nat.fee_type === "league_affiliation") {
        const existing = memberPayments.find(p => p.fee_type === "league_affiliation");
        if (existing) {
          const label = existing.fee_label || nat.abbreviation || nat.body_name || "League Affiliation";
          fees.push({ fee_type: "league_affiliation", fee_label: label, amount: existing.amount, existing });
        }
        continue;
      }
      const existing = memberPayments.find(p => p.fee_type === "national" || p.fee_type === "national_body");
      if (existing) {
        const label = existing.fee_label || nat.abbreviation || nat.body_name || "National";
        fees.push({ fee_type: "national", fee_label: label, amount: existing.amount, existing });
      }
    }
  }

  // 4. Legacy balances
  const legacyPayments = memberPayments.filter(p => p.fee_type === "Legacy" || p.fee_type === "legacy");
  for (const lp of legacyPayments) {
    fees.push({ fee_type: lp.fee_type, fee_label: lp.fee_label, amount: lp.amount, existing: lp });
  }

  // 5. Renewal invoices (annual renewal cycle) — always shown if present
  const renewalPayments = memberPayments.filter(p => p.fee_type === "renewal");
  for (const rp of renewalPayments) {
    fees.push({ fee_type: rp.fee_type, fee_label: rp.fee_label, amount: rp.amount, existing: rp });
  }

  return fees;
}

/** Build "Fees paid in respect of" list — what the club pays per member to NSA/SSA.
 *  Sourced from existing club_member_fee_payments rows seeded from club_fees_payable
 *  (basis='per_member'). Default state = paid; admin can untick to mark still owing. */
function computeClubPayableFees(
  member: ClubMember,
  existingPayments: FeePaymentRow[]
): ExpectedFee[] {
  return existingPayments
    .filter(p => p.club_member_id === member.id)
    .filter(p => p.fee_type === "club_payable_assoc" || p.fee_type === "club_payable_national")
    .map(p => ({ fee_type: p.fee_type, fee_label: p.fee_label, amount: p.amount, existing: p }));
}

function MemberPaymentStatus({ fees, glBilled, glPaid }: {
  fees: ExpectedFee[];
  /** Actual debtors billed for this member (sum of debit on debtors GL). */
  glBilled?: number;
  /** Actual payments received against debtors (sum of credit on debtors GL). */
  glPaid?: number;
}) {
  const { format } = useClubCurrency();
  if (fees.length === 0 && !glBilled) return <span className="text-[10px] text-muted-foreground italic">No fees</span>;
  const feeTotal = fees.reduce((s, f) => s + f.amount, 0);
  // Prefer real GL numbers so this matches the Member Statement exactly.
  // Fall back to fee-row totals if no GL activity yet.
  const total = glBilled && glBilled > 0 ? glBilled : feeTotal;
  const paid = typeof glPaid === "number" ? glPaid : 0;
  const outstanding = total - paid;
  const allPaid = outstanding <= 0.01;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {fees.map((f, i) => (
        <div key={i} className="flex items-center gap-1 text-[10px]">
          <span className="truncate max-w-[140px]">{f.fee_label}</span>
          <span className="text-muted-foreground">{format(f.amount)}</span>
        </div>
      ))}
      <span className={`text-[10px] font-semibold ml-auto tabular-nums ${allPaid ? "text-green-600" : "text-destructive"}`}>
        {format(paid, 0)} / {format(total, 0)}
      </span>
    </div>
  );
}

interface AffiliationBadgeInfo {
  /** Short label (abbreviation or name) of the association — e.g. "LS", "NIL". */
  label: string;
  /** League # at the association (null = not yet allocated). */
  leagueNumber: string | null;
  /** Active = ticked in Edit Profile/Member. Inactive = paused (number kept on file). */
  active: boolean;
  /** True for internal leagues (member club-number used). */
  internal: boolean;
}

function MemberCard({ member: m, fees, payableFees, glBilled, glPaid, delegateTitle, affiliations, onEdit, onDelete, onToggleAdmin, onAssignNumber, numberLabel, onChangeStatus, onAffiliate, isSuperAdmin }: {
  member: ClubMember;
  fees: ExpectedFee[];
  payableFees: ExpectedFee[];
  glBilled?: number;
  glPaid?: number;
  delegateTitle?: string | null;
  affiliations: AffiliationBadgeInfo[];
  onEdit: () => void;
  onDelete: () => void;
  onToggleAdmin: () => void;
  onAssignNumber?: (member: ClubMember) => void;
  numberLabel?: string;
  onChangeStatus: (member: ClubMember, status: "active" | "suspended" | "resigned") => void;
  onAffiliate?: () => void;
  isSuperAdmin?: boolean;
}) {

  const navigate = useNavigate();
  const { switchMember } = useMemberContext();
  const displayName = m.name || m.profiles?.name || "—";
  const displayEmail = m.email || m.profiles?.email || "";
  const displayPhone = m.phone || m.profiles?.phone || "";
  const isLinked = !!m.user_id;
  const isAdmin = m.role === "admin" || m.role === "captain";
  const isDelegate = !!delegateTitle;
  const isProtected = isDelegate && !isSuperAdmin;

  const status = (m.status || "active") as "active" | "suspended" | "resigned";
  const inactive = status !== "active";
  const statusStyles: Record<typeof status, string> = {
    active: "bg-emerald-500/10 text-emerald-700 border-emerald-500/40 dark:text-emerald-400",
    suspended: "bg-amber-500/15 text-amber-700 border-amber-500/50 dark:text-amber-400",
    resigned: "bg-slate-500/15 text-slate-600 border-slate-500/40 dark:text-slate-400",
  };
  return (
    <Card className={`p-2 space-y-1.5 ${inactive ? "opacity-60 border-dashed" : ""}`}>
      {/* Row 1: Name, status, role, actions — single compact line */}
      <div className="flex items-center gap-1.5">
        <span className={`font-medium text-[12px] truncate flex-1 min-w-0 ${status === "resigned" ? "line-through" : ""}`}>{displayName}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={`text-[9px] px-1.5 py-0 h-[18px] rounded border font-medium uppercase tracking-wide shrink-0 ${statusStyles[status]}`}
              title="Click to change membership status"
            >
              {status}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="text-xs">
            <DropdownMenuItem onClick={() => onChangeStatus(m, "active")}>Active</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onChangeStatus(m, "suspended")}>Suspended</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onChangeStatus(m, "resigned")}>Resigned</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Badge variant={isAdmin ? "secondary" : "outline"} className="text-[9px] px-1 py-0 shrink-0">{m.role}</Badge>
        {delegateTitle && (
          <Badge variant="default" className="text-[9px] px-1 py-0 bg-amber-600 hover:bg-amber-700 shrink-0">{delegateTitle}</Badge>
        )}
        <div className="flex shrink-0 ml-auto">
          {!isProtected && (
            <Button variant="ghost" size="icon" className={`h-6 w-6 ${isAdmin ? "text-primary" : "text-muted-foreground"}`} onClick={onToggleAdmin} title={isAdmin ? "Remove admin" : "Grant admin"}>
              {isAdmin ? <ShieldCheck className="w-3 h-3" /> : <ShieldOff className="w-3 h-3" />}
            </Button>
          )}
          {isProtected && isAdmin && <ShieldCheck className="w-3 h-3 text-primary mx-1" />}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-primary"
            title={`View ${displayName}'s account`}
            onClick={(e) => {
              e.stopPropagation();
              switchMember(m.id);
              toast.success(`Viewing as ${displayName}`);
              navigate("/");
            }}
          >
            <Eye className="w-3 h-3" />
          </Button>


          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onEdit}><Edit2 className="w-3 h-3" /></Button>
          {!isProtected && (
            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={onDelete}><Trash2 className="w-3 h-3" /></Button>
          )}
        </div>
      </div>

      {/* Row 2: Email, phone, member #, status — compact inline */}
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground flex-wrap">
        {displayEmail && (
          <a href={`mailto:${displayEmail}`} className="truncate max-w-[160px] hover:text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
            {displayEmail}
          </a>
        )}
        {displayPhone && (
          <a href={`tel:${displayPhone.replace(/\s/g, "")}`} className="truncate hover:text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
            {displayPhone}
          </a>
        )}
        {m.club_member_number ? (
          <span>#{m.club_member_number}</span>
        ) : (
          onAssignNumber && (
            <Button
              variant="outline"
              size="sm"
              className="h-5 px-1.5 text-[9px] gap-1 text-primary border-primary/40 hover:bg-primary/10"
              onClick={(e) => { e.stopPropagation(); onAssignNumber(m); }}
              title={`Allocate ${numberLabel || "membership"} number`}
            >
              + Allocate {numberLabel || "#"}
            </Button>
          )
        )}
        {m.id_number && <span>Age: {getAgeFromSaId(m.id_number) ?? "?"}</span>}
        <Badge variant="outline" className={`text-[9px] px-1 py-0 ${isLinked ? "border-green-500 text-green-600" : "border-amber-500 text-amber-600"}`}>
          {isLinked ? "✓ Reg" : "✗ Unreg"}
        </Badge>
        {affiliations.map((aff) => {
          if (aff.active) {
            return (
              <Badge
                key={aff.label}
                variant="outline"
                className="text-[9px] px-1 py-0 text-emerald-700 border-emerald-500"
                title={aff.internal ? "Internal league — uses club member number" : "League affiliation — active"}
              >
                {aff.label}{aff.leagueNumber ? ` #${aff.leagueNumber}` : ""}
              </Badge>
            );
          }
          return (
            <Badge
              key={aff.label}
              variant="outline"
              className="text-[9px] px-1 py-0 text-muted-foreground border-muted-foreground/40"
              title="Paused — number kept on file, fees not charged"
            >
              {aff.label}{aff.leagueNumber ? ` #${aff.leagueNumber}` : ""} · paused
            </Badge>
          );
        })}
        {m.skill_level && <Badge variant="outline" className="text-[9px] px-1 py-0 text-blue-600 border-blue-400">{getSkillLabel(m.skill_level)}</Badge>}
        {onAffiliate && affiliations.filter((a) => a.active && !a.internal).length === 0 && (
          <Button
            variant="outline"
            size="sm"
            className="h-5 px-1.5 text-[9px] gap-1 text-primary border-primary/40 hover:bg-primary/10"
            onClick={(e) => { e.stopPropagation(); onAffiliate(); }}
            title="Affiliate this member to the league association"
          >
            + Affiliate
          </Button>
        )}
      </div>


      {/* Row 3: Fees receivable from member — totals reflect the GL / member statement */}
      {(fees.length > 0 || (glBilled ?? 0) > 0) && (
        <div className="border-t border-border pt-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-medium text-muted-foreground shrink-0">Fees payable by the member:</span>
            <MemberPaymentStatus fees={fees} glBilled={glBilled} glPaid={glPaid} />
          </div>
        </div>
      )}

      {/* Row 4: Fees payable by the club (per-member to NSA/SSA) */}
      {payableFees.length > 0 && (
        <div className="border-t border-dashed border-border pt-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-medium text-muted-foreground shrink-0">Fees payable by the club:</span>
            <MemberPaymentStatus fees={payableFees} />
          </div>
        </div>
      )}
    </Card>
  );
}

export function MembersTab({ clubId }: { clubId: string }) {
  const { format } = useClubCurrency();
  const { data: allMembersRaw = [], isLoading } = useClubMembers(clubId);
  // Exclude visitor-role entries — they live in the Visitors tab to avoid mixing them with real members.
  // Pending applicants live in the applications panel above until they are approved.
  const members = allMembersRaw.filter(
    (m: any) => String(m.role || "").toLowerCase() !== "visitor" && !m.is_pending_approval,
  );

  const { data: feeCategories = [] } = useFeeCategories(clubId);
  const { data: associations = [] } = useLeagueAssociations(clubId);
  const { data: nationalFees = [] } = useNationalBodyFees(clubId);
  const { data: clubData } = useMyClub();
  const { data: myRoles } = useMyRoles();
  const isSuperAdmin = (myRoles || []).includes("admin") || (myRoles || []).includes("moderator");

  const feeDueMonth = clubData?.club?.member_fee_due_month ?? 1;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended" | "resigned">("all");
  const [addOpen, setAddOpen] = useState(false);
  const [bulkTypesOpen, setBulkTypesOpen] = useState(false);
  const [editMember, setEditMember] = useState<ClubMember | null>(null);
  const [affiliateMember, setAffiliateMember] = useState<ClubMember | null>(null);

  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  // Fetch fee payments for all club members
  const memberIds = members.map(m => m.id);
  const { data: feePayments = [], refetch: refetchPayments } = useQuery({
    queryKey: ["club-member-fee-payments", clubId, memberIds.join(",")],
    queryFn: async () => {
      if (memberIds.length === 0) return [];
      const { data, error } = await fromExt("club_member_fee_payments")
        .select("id, club_member_id, fee_type, fee_label, amount, paid")
        .in("club_member_id", memberIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as FeePaymentRow[];
    },
    enabled: memberIds.length > 0,
  });

  // Build the lookup of association abbreviations / names / scope (so we know
  // which ones are "internal" — those use the member's club number).
  const assocById = new Map<string, { name: string; abbreviation: string | null; scope: string | null }>();
  for (const a of associations as any[]) {
    assocById.set(a.id, { name: a.name, abbreviation: a.abbreviation, scope: a.scope ?? null });
  }

  // Source of truth for league affiliations on each member card =
  // `member_association_affiliations`, which mirrors what Edit Profile / Edit
  // Member writes. Each row carries an active flag + permanent league number.
  const { data: affiliationsRaw = [] } = useQuery({
    queryKey: ["club-member-affiliations", clubId, memberIds.join(",")],
    enabled: memberIds.length > 0,
    queryFn: async () => {
      const { data, error } = await fromExt("member_association_affiliations")
        .select("club_member_id, association_id, league_association_number, active")
        .in("club_member_id", memberIds);
      if (error) throw error;
      return (data || []) as Array<{
        club_member_id: string;
        association_id: string;
        league_association_number: string | null;
        active: boolean;
      }>;
    },
  });

  // Map member.id -> AffiliationBadgeInfo[] (active first, then paused).
  // For internal-scope associations the displayed number falls back to the
  // member's own club number (mirrors Edit Profile behaviour).
  const affiliationsByMember = new Map<string, AffiliationBadgeInfo[]>();
  for (const row of affiliationsRaw) {
    const meta = assocById.get(row.association_id);
    if (!meta) continue;
    const member = members.find((m) => m.id === row.club_member_id);
    const internal = meta.scope === "internal";
    const displayedNumber =
      row.league_association_number || (internal ? member?.club_member_number || null : null);
    const list = affiliationsByMember.get(row.club_member_id) || [];
    list.push({
      label: meta.abbreviation || meta.name,
      leagueNumber: displayedNumber,
      active: row.active,
      internal,
    });
    affiliationsByMember.set(row.club_member_id, list);
  }
  for (const [k, list] of affiliationsByMember) {
    list.sort((a, b) => Number(b.active) - Number(a.active) || a.label.localeCompare(b.label));
    affiliationsByMember.set(k, list);
  }


  // Aggregate debtors GL activity per member so the card totals match the
  // Member Statement exactly (billed = Dr on debtors, paid = Cr on debtors).
  const { data: glByMember = new Map<string, { billed: number; paid: number }>() } = useQuery({
    queryKey: ["club-member-debtors-gl", clubId, memberIds.join(",")],
    enabled: memberIds.length > 0,
    queryFn: async () => {
      const { data, error } = await fromExt("club_journal_entries")
        .select("club_member_id, debit, credit, account")
        .eq("club_id", clubId)
        .eq("account", "debtors")
        .in("club_member_id", memberIds);
      if (error) throw error;
      const map = new Map<string, { billed: number; paid: number }>();
      for (const r of (data || []) as any[]) {
        if (!r.club_member_id) continue;
        const cur = map.get(r.club_member_id) || { billed: 0, paid: 0 };
        cur.billed += Number(r.debit || 0);
        cur.paid += Number(r.credit || 0);
        map.set(r.club_member_id, cur);
      }
      return map;
    },
  });

  const getFeesForMember = (member: ClubMember) => {
    return computeExpectedFees(member, feeCategories, associations, nationalFees, feeDueMonth, feePayments);
  };

  /**
   * Resolve the income / expense account for a given fee_type.
   * Member-receivable rows produce income; club-payable rows produce expense.
   */
  const accountsForFee = (feeType: string): { side: "receivable" | "payable"; income?: string; expense?: string } => {
    switch (feeType) {
      case "club":
      case "membership":
        return { side: "receivable", income: "membership_income" };
      case "association":
      case "league_affiliation":
        return { side: "receivable", income: "league_fees_income" };
      case "national":
      case "national_body":
        return { side: "receivable", income: "national_body_income" };
      case "club_payable_assoc":
        return { side: "payable", expense: "association_payable" };
      case "club_payable_national":
        return { side: "payable", expense: "association_payable" };
      default:
        return { side: "receivable", income: "fee_income" };
    }
  };

  /**
   * Sync GL state for a single fee row. Wipes prior auto-generated entries
   * for this fee_payment_id and re-posts based on current paid/unpaid state.
   *
   * Gross-up model:
   *   Member receivable + paid   → Dr Bank,    Cr Income
   *   Member receivable + unpaid → Dr Debtors, Cr Income
   *   Club payable     + paid    → Dr Expense, Cr Bank
   *   Club payable     + unpaid  → Dr Expense, Cr Creditors
   */
  const syncFeeJournalEntries = async (
    memberId: string,
    feeId: string,
    amount: number,
    feeType: string,
    feeLabel: string,
    paid: boolean,
  ) => {
    // Wipe any prior auto entries for this fee
    await fromExt("club_journal_entries").delete().eq("fee_payment_id", feeId);

    if (!amount || amount <= 0) return;

    const acct = accountsForFee(feeType);
    const member = members.find(m => m.id === memberId);
    const memberName = member?.profiles?.name || member?.name || "Member";
    const desc = `${paid ? "Fee paid" : "Fee accrued"}: ${feeLabel} — ${memberName}`;
    const meta = { description: desc, member_id: memberId, payment_id: feeId };

    if (acct.side === "receivable") {
      const debit = paid ? "bank_current" : "debtors";
      await postJournal(clubId, [
        { account: debit, debit: amount, ...meta },
        { account: acct.income!, credit: amount, ...meta },
      ]);
    } else {
      const credit = paid ? "bank_current" : "creditors";
      await postJournal(clubId, [
        { account: acct.expense!, debit: amount, ...meta },
        { account: credit, credit: amount, ...meta },
      ]);
    }
  };

  const handleTogglePaid = async (feeId: string, paid: boolean) => {
    const fee = feePayments.find(f => f.id === feeId);
    if (!fee) return;

    const updates: any = { paid, paid_at: paid ? new Date().toISOString() : null };
    const { error } = await fromExt("club_member_fee_payments").update(updates).eq("id", feeId);
    if (error) { toast.error(error.message); return; }

    await syncFeeJournalEntries(fee.club_member_id, feeId, fee.amount, fee.fee_type, fee.fee_label, paid);

    // Cascade: NSA/SSA member fee → matching "fees payable by the club" row
    const cascadeMap: Record<string, string> = {
      association: "club_payable_assoc",
      national: "club_payable_national",
      national_body: "club_payable_national",
    };
    const cascadeType = cascadeMap[fee.fee_type];
    if (cascadeType) {
      const linked = feePayments.filter(
        p => p.club_member_id === fee.club_member_id && p.fee_type === cascadeType
      );
      for (const lp of linked) {
        if (lp.paid !== paid) {
          await fromExt("club_member_fee_payments")
            .update({ paid, paid_at: paid ? new Date().toISOString() : null })
            .eq("id", lp.id);
        }
        // Always resync GL for the club-payable row so expense reflects state
        await syncFeeJournalEntries(lp.club_member_id, lp.id, lp.amount, lp.fee_type, lp.fee_label, paid);
      }
    }

    toast.success(paid ? "Marked as paid" : "Marked as unpaid");
    refetchPayments();
    qc.invalidateQueries({ queryKey: ["club-journal-entries"] });
  };


  /** Create a member fee record and immediately mark as paid (no GL entries needed — paid from start) */
  const handleCreateFee = async (fee: ExpectedFee, clubMemberId: string) => {
    const { error } = await fromExt("club_member_fee_payments").insert({
      club_member_id: clubMemberId,
      fee_type: fee.fee_type,
      fee_label: fee.fee_label,
      amount: fee.amount,
      paid: true,
      paid_at: new Date().toISOString(),
      season_year: new Date().getFullYear(),
    });
    if (error) toast.error(error.message);
    else { toast.success(`${fee.fee_label} marked as paid`); refetchPayments(); }
  };

  const filtered = members.filter(m => {
    const status = (m as any).status || "active";
    if (statusFilter !== "all" && status !== statusFilter) return false;
    const name = m.profiles?.name || m.name || "";
    const email = m.profiles?.email || m.email || "";
    const phone = m.phone || m.profiles?.phone || "";
    const q = search.toLowerCase();
    return name.toLowerCase().includes(q) || email.toLowerCase().includes(q) || (m.club_member_number || "").toLowerCase().includes(q) || phone.toLowerCase().includes(q);
  });

  const statusCounts = members.reduce(
    (acc, m: any) => {
      const s = (m.status || "active") as "active" | "suspended" | "resigned";
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    },
    { active: 0, suspended: 0, resigned: 0 } as Record<"active" | "suspended" | "resigned", number>
  );

  const handleChangeStatus = async (member: ClubMember, status: "active" | "suspended" | "resigned") => {
    if ((member as any).status === status) return;
    const { error } = await fromExt("club_members").update({ status }).eq("id", member.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`${member.name || "Member"} marked ${status}`);
    qc.invalidateQueries({ queryKey: ["club-members", clubId] });
    qc.invalidateQueries({ queryKey: ["club-stats", clubId] });
  };

  // Resolve delegate titles from club data
  const club = clubData?.club;
  const getDelegateTitle = (memberId: string): string | null => {
    if (!club) return null;
    const titles: string[] = [];
    if ((club as any).chairman_member_id === memberId) titles.push("Chairman");
    if ((club as any).secretary_member_id === memberId) titles.push("Secretary");
    if ((club as any).club_captain_member_id === memberId) titles.push("Club Captain");
    if ((club as any).treasurer_member_id === memberId) titles.push("Treasurer");
    return titles.length > 0 ? titles.join(" / ") : null;
  };

  const isDelegate = (memberId: string) => !!getDelegateTitle(memberId);

  const handleToggleAdmin = async (member: ClubMember) => {
    if (isDelegate(member.id)) return;
    const newRole = member.role === "admin" ? "member" : "admin";
    const { error } = await fromExt("club_members").update({ role: newRole }).eq("id", member.id);
    if (error) toast.error(error.message);
    else {
      toast.success(newRole === "admin" ? `${member.profiles?.name || member.name} granted admin rights` : `Admin rights removed from ${member.profiles?.name || member.name}`);
      qc.invalidateQueries({ queryKey: ["club-members"] });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this member from the club?")) return;
    const { error } = await fromExt("club_members").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Member removed"); qc.invalidateQueries({ queryKey: ["club-members"] }); }
  };

  /**
   * Allocate the next sequential club/league number for a member based on the
   * club's number prefix, length, and starting number. For an association tenant,
   * also seeds unpaid league-fee payment rows from the configured league_associations.
   */
  const handleAssignNumber = async (member: ClubMember) => {
    const prefix = (club as any)?.member_number_prefix || "";
    const length = (club as any)?.member_number_length || 4;
    const start = (club as any)?.member_number_start || 1;
    const tenantType = (club as any)?.tenant_type || "club";
    const numberLabel = tenantType === "association" ? "league" : "membership";

    const { data: existing } = await fromExt("club_members")
      .select("club_member_number")
      .eq("club_id", clubId)
      .not("club_member_number", "is", null);

    let maxNum = start - 1;
    const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d+)$`);
    for (const row of (existing || []) as any[]) {
      const v = row.club_member_number || "";
      const match = v.match(re);
      if (match) {
        const n = parseInt(match[1], 10);
        if (!isNaN(n) && n > maxNum) maxNum = n;
      }
    }
    const nextNum = maxNum + 1;
    const padded = String(nextNum).padStart(length, "0");
    const newNumber = `${prefix}${padded}`;

    if (!confirm(`Allocate ${numberLabel} number "${newNumber}" to ${member.profiles?.name || member.name}?`)) return;

    const { error } = await fromExt("club_members")
      .update({ club_member_number: newNumber, plays_league: tenantType === "association" ? true : member.plays_league })
      .eq("id", member.id);

    if (error) { toast.error(error.message); return; }

    if (tenantType === "association") {
      const activeFees = (associations || []).filter((a: any) => (a.active !== false) && ((a.fee_annual ?? 0) > 0));
      if (activeFees.length > 0) {
        const { data: existingPays } = await fromExt("club_member_fee_payments")
          .select("fee_label, season_year")
          .eq("club_member_id", member.id)
          .eq("fee_type", "league");
        const existingKeys = new Set((existingPays || []).map((p: any) => `${p.fee_label}|${p.season_year}`));
        const feeRecords = activeFees.map((a: any) => ({
          club_member_id: member.id,
          fee_type: "league",
          fee_label: a.name + (a.abbreviation ? ` (${a.abbreviation})` : ""),
          amount: a.fee_annual ?? 0,
          paid: false,
          season_year: new Date().getFullYear(),
        })).filter(f => !existingKeys.has(`${f.fee_label}|${f.season_year}`));
        if (feeRecords.length > 0) {
          await fromExt("club_member_fee_payments").insert(feeRecords);
        }
      }
    }

    toast.success(`Allocated ${newNumber}`);
    qc.invalidateQueries({ queryKey: ["club-members"] });
    refetchPayments();
  };

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) { toast.error("CSV must have a header row + data"); return; }

    // Naive CSV split that handles simple quoted fields with commas
    const splitCsv = (line: string): string[] => {
      const out: string[] = [];
      let cur = ""; let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
        else if (ch === "," && !inQ) { out.push(cur); cur = ""; }
        else cur += ch;
      }
      out.push(cur);
      return out.map(s => s.trim());
    };

    const headers = splitCsv(lines[0]).map(h => h.toLowerCase());
    const emailIdx = headers.indexOf("email");
    const memberNumIdx = headers.indexOf("member_number");
    if (emailIdx < 0 && memberNumIdx < 0) {
      toast.error("CSV must include 'email' or 'member_number' column");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    const nameIdx = headers.indexOf("name");
    const phoneIdx = headers.indexOf("phone");
    const leagueIdx = headers.indexOf("plays_league");
    const idNumIdx = headers.indexOf("id_number");
    const addressIdx = headers.indexOf("address");
    const genderIdx = headers.indexOf("gender");
    const rankingIdx = headers.indexOf("ranking");
    // Accept both "fee_category" (export header) and "fee_type" (legacy)
    const feeCatIdx = (() => {
      const a = headers.indexOf("fee_category");
      return a >= 0 ? a : headers.indexOf("fee_type");
    })();
    const skillIdx = headers.indexOf("skill_level");

    const { data: feeCats } = await fromExt("member_fee_categories").select("id, name").eq("club_id", clubId);
    const feeCatMap = new Map((feeCats || []).map((c: any) => [c.name.toLowerCase().replace(/[–—]/g, "-"), c.id]));

    let imported = 0;
    const errors: string[] = [];
    const importedMemberIds: string[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = splitCsv(lines[i]);
      const email = emailIdx >= 0 ? (cols[emailIdx] || "") : "";
      const memberNum = memberNumIdx >= 0 ? (cols[memberNumIdx] || "") : "";
      if (!email && !memberNum) continue;

      let userId: string | null = null;
      if (email) {
        const { data: profile } = await fromExt("profiles").select("id").eq("email", email).maybeSingle();
        userId = profile?.id || null;
      }

      const memberName = nameIdx >= 0 ? cols[nameIdx] : undefined;
      const feeRaw = feeCatIdx >= 0 ? (cols[feeCatIdx] || "").toLowerCase().replace(/[–—]/g, "-").replace(/\?/g, "-") : "";

      const row: any = {
        club_id: clubId,
        user_id: userId,
        name: memberName || undefined,
        email: email || undefined,
        club_member_number: memberNum || undefined,
        plays_league: leagueIdx >= 0 ? cols[leagueIdx]?.toLowerCase() === "true" : false,
        id_number: idNumIdx >= 0 ? (cols[idNumIdx] || undefined) : undefined,
        phone: phoneIdx >= 0 ? (cols[phoneIdx] || undefined) : undefined,
        address: addressIdx >= 0 ? (cols[addressIdx] || undefined) : undefined,
        gender: genderIdx >= 0 ? (cols[genderIdx] || undefined) : undefined,
        ladder_position: rankingIdx >= 0 && cols[rankingIdx] ? parseInt(cols[rankingIdx], 10) || null : undefined,
        fee_category_id: feeRaw ? feeCatMap.get(feeRaw) || undefined : undefined,
        skill_level: skillIdx >= 0 ? (cols[skillIdx]?.toLowerCase() || undefined) : undefined,
      };

      // Conflict on member_number when available (unique partial index exists);
      // otherwise insert plain and let any DB error surface.
      const builder = memberNum
        ? fromExt("club_members").upsert(row, { onConflict: "club_id,club_member_number", ignoreDuplicates: false })
        : fromExt("club_members").insert(row);
      const { data: memberData, error } = await builder.select("id").single();

      if (!error && memberData) {
        imported++;
        importedMemberIds.push(memberData.id);
      } else if (error) {
        const ref = memberNum || email || `row ${i}`;
        errors.push(`${ref}: ${error.message}`);
        console.error(`CSV row ${i} (${ref}):`, error);
      }
    }

    // Auto-create fee records (default paid) for imported members that don't have them yet
    if (importedMemberIds.length > 0) {
      const { data: existingFees } = await fromExt("club_member_fee_payments")
        .select("club_member_id")
        .in("club_member_id", importedMemberIds);
      const membersWithFees = new Set((existingFees || []).map(f => f.club_member_id));

      const { data: allMembers } = await fromExt("club_members")
        .select("id, fee_category_id, plays_league, joined_at")
        .in("id", importedMemberIds);

      const { data: cats } = await fromExt("member_fee_categories").select("*").eq("club_id", clubId);
      const { data: assocs } = await fromExt("league_associations").select("*").eq("club_id", clubId);
      const { data: natFees } = await fromExt("national_body_fees").select("*").eq("club_id", clubId);

      const feeRecords: any[] = [];
      for (const m of (allMembers || [])) {
        if (membersWithFees.has(m.id)) continue;
        if (m.fee_category_id) {
          const cat = (cats || []).find((c: any) => c.id === m.fee_category_id);
          if (cat) {
            feeRecords.push({
              club_member_id: m.id, fee_type: "club",
              fee_label: `Club – ${cat.name}`, amount: cat.annual_fee,
              paid: true, paid_at: new Date().toISOString(),
              season_year: new Date().getFullYear(),
            });
          }
        }
        if (m.plays_league) {
          for (const a of (assocs || [])) {
            if (a.fee_annual && a.fee_annual > 0) {
              feeRecords.push({
                club_member_id: m.id, fee_type: "association",
                fee_label: a.abbreviation || a.name, amount: a.fee_annual,
                paid: true, paid_at: new Date().toISOString(),
                season_year: new Date().getFullYear(),
              });
            }
          }
          for (const n of (natFees || [])) {
            if (n.fee_annual && n.fee_annual > 0) {
              feeRecords.push({
                club_member_id: m.id, fee_type: "national",
                fee_label: n.abbreviation || n.body_name, amount: n.fee_annual,
                paid: true, paid_at: new Date().toISOString(),
                season_year: new Date().getFullYear(),
              });
            }
          }
        }
      }
      if (feeRecords.length > 0) {
        await fromExt("club_member_fee_payments").insert(feeRecords);
      }
    }

    if (imported > 0) toast.success(`Imported ${imported} member${imported !== 1 ? "s" : ""}`);
    if (errors.length > 0) {
      toast.error(`${errors.length} row${errors.length !== 1 ? "s" : ""} failed. First: ${errors[0]}`);
    } else if (imported === 0) {
      toast.error("No rows imported. Check the file format.");
    }
    qc.invalidateQueries({ queryKey: ["club-members"] });
    qc.invalidateQueries({ queryKey: ["club-member-fee-payments"] });
    if (fileRef.current) fileRef.current.value = "";
  };



  // Compute fee summary from the GL (debtors billed vs paid) so this matches
  // the Member Statement and Member Balances dialog exactly. Falls back to
  // fee-row amounts for members with no GL activity yet.
  let totalExpected = 0;
  let totalPaid = 0;
  for (const m of members) {
    const gl = glByMember.get(m.id);
    if (gl && gl.billed > 0) {
      totalExpected += gl.billed;
      totalPaid += gl.paid;
    } else {
      const fees = getFeesForMember(m);
      totalExpected += fees.reduce((s, f) => s + f.amount, 0);
      totalPaid += fees.filter(f => f.existing?.paid).reduce((s, f) => s + f.amount, 0);
    }
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search members..." className="pl-9" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => {
            const headers = ["name", "email", "phone", "gender", "member_number", "id_number", "address", "plays_league", "ranking", "fee_type"];
            const sample = [
              headers.join(","),
              "John Smith,john@example.com,0821234567,Male,MB001,9001015009088,123 Main St,true,1,Normal",
              "Jane Doe,jane@example.com,0839876543,Female,MB002,9205120054083,456 Oak Ave,false,2,Student",
            ].join("\n");
            const blob = new Blob([sample], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = "member_import_template.csv"; a.click();
            URL.revokeObjectURL(url);
          }}>
            <Download className="w-3.5 h-3.5 mr-1" />Template
          </Button>
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => {
            const escape = (v: string) => v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
            const headers = ["name", "email", "phone", "gender", "member_number", "id_number", "address", "plays_league", "ranking", "fee_category", "skill_level"];
            const rows = members.map((m: any) => [
              m.name || "", m.email || "", m.phone || "", m.gender || "",
              m.club_member_number || "", m.id_number || "", m.address || "",
              m.plays_league ? "true" : "false",
              m.ladder_position ?? "",
              m.fee_category?.name || "",
              m.skill_level || "",
            ].map(v => escape(String(v))).join(","));
            const csv = [headers.join(","), ...rows].join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = "members_export.csv"; a.click();
            URL.revokeObjectURL(url);
          }}>
            <Download className="w-3.5 h-3.5 mr-1" />Export
          </Button>
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => fileRef.current?.click()}>
            <Upload className="w-3.5 h-3.5 mr-1" />Import
          </Button>
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setBulkTypesOpen(true)}>
            <Edit2 className="w-3.5 h-3.5 mr-1" />Edit Membership Types
          </Button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCsvImport} />
          <AddMemberDialog clubId={clubId} open={addOpen} onOpenChange={setAddOpen} />
        </div>
      </div>

      <PendingApplicationsPanel clubId={clubId} />

      <BulkMembershipTypesDialog clubId={clubId} open={bulkTypesOpen} onOpenChange={setBulkTypesOpen} members={members} feeCategories={feeCategories} />


      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{members.length} member{members.length !== 1 ? "s" : ""}</span>
        <span className="font-medium">Fees: {format(totalPaid)} paid / {format(totalExpected)} total</span>
        <span className="text-destructive font-medium">{format(totalExpected - totalPaid)} outstanding</span>
        <span className="text-emerald-600 dark:text-emerald-400 font-medium">💡 Set up fees in the Fees tab · Untick fees still outstanding for a member</span>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {([
          { key: "all", label: `All (${members.length})`, cls: "" },
          { key: "active", label: `Active (${statusCounts.active})`, cls: "border-emerald-500/50 text-emerald-700 dark:text-emerald-400" },
          { key: "suspended", label: `Suspended (${statusCounts.suspended})`, cls: "border-amber-500/50 text-amber-700 dark:text-amber-400" },
          { key: "resigned", label: `Resigned (${statusCounts.resigned})`, cls: "border-slate-500/50 text-slate-600 dark:text-slate-400" },
        ] as const).map(opt => (
          <button
            key={opt.key}
            onClick={() => setStatusFilter(opt.key)}
            className={`text-[10px] px-2 py-0.5 rounded-full border uppercase tracking-wide ${opt.cls} ${
              statusFilter === opt.key ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(["Men", "Ladies"] as const).map(gender => {
          // Gender values are inconsistent in older/imported records ("male", "F", "female"…),
          // so normalise before grouping — otherwise those members disappear from both columns.
          const normalise = (g?: string | null) => {
            const v = String(g || "").trim().toLowerCase();
            if (!v) return null;
            if (["men", "man", "male", "m", "boys"].includes(v)) return "Men";
            if (["ladies", "lady", "female", "f", "women", "woman", "girls"].includes(v)) return "Ladies";
            return null;
          };
          const group = filtered.filter(m => normalise(m.gender) === gender);
          const unassigned = gender === "Men" ? filtered.filter(m => !normalise(m.gender)) : [];
          const all = [...group, ...unassigned];

          return (
            <div key={gender}>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                {gender}
                <span className="text-xs font-normal text-muted-foreground">({group.length})</span>
              </h3>
              <div className="space-y-2">
                {all.map(m => (
                  <MemberCard
                    key={m.id}
                    member={m}
                    fees={getFeesForMember(m)}
                    payableFees={computeClubPayableFees(m, feePayments)}
                    glBilled={glByMember.get(m.id)?.billed}
                    glPaid={glByMember.get(m.id)?.paid}
                    delegateTitle={getDelegateTitle(m.id)}
                    affiliations={affiliationsByMember.get(m.id) || []}
                    onEdit={() => setEditMember(m)}
                    onDelete={() => handleDelete(m.id)}
                    onToggleAdmin={() => handleToggleAdmin(m)}
                    onAssignNumber={handleAssignNumber}
                    numberLabel={(club as any)?.tenant_type === "association" ? "league #" : "#"}
                    onChangeStatus={handleChangeStatus}
                    onAffiliate={() => setAffiliateMember(m)}
                    isSuperAdmin={isSuperAdmin}
                  />


                ))}
                {all.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No {gender.toLowerCase()} members</p>}
              </div>
              {gender === "Men" && unassigned.length > 0 && (
                <p className="text-[10px] text-muted-foreground mt-1">+ {unassigned.length} unassigned gender</p>
              )}
            </div>
          );
        })}
      </div>


      {editMember && <EditMemberDialog member={editMember} feeCategories={feeCategories} clubId={clubId} onClose={() => { setEditMember(null); qc.invalidateQueries({ queryKey: ["club-members"] }); qc.invalidateQueries({ queryKey: ["club-member-affiliations"] }); qc.invalidateQueries({ queryKey: ["club-member-fee-payments"] }); refetchPayments(); }} />}
    </div>
  );
}

function AddMemberDialog({ clubId, open, onOpenChange }: { clubId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { format } = useClubCurrency();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [memberNumber, setMemberNumber] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [phone, setPhone] = useState("+27");
  const [address, setAddress] = useState("");
  const [feeCategoryId, setFeeCategoryId] = useState("");
  const [gender, setGender] = useState("");
  const [skillLevel, setSkillLevel] = useState("");
  const [playsLeague, setPlaysLeague] = useState(false);
  const [selectedLeagueIds, setSelectedLeagueIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const { data: feeCategories = [] } = useFeeCategories(clubId);
  const { data: associations = [] } = useLeagueAssociations(clubId);
  const { data: nationalFees = [] } = useNationalBodyFees(clubId);
  const { data: clubData } = useMyClub();
  const feeDueMonth = clubData?.club?.member_fee_due_month ?? 1;
  const qc = useQueryClient();

  // Auto-generate member number when dialog opens
  useEffect(() => {
    if (open && !memberNumber) {
      (async () => {
        const { data, error } = await supabase.rpc("get_next_member_number", { _club_id: clubId });
        if (!error && data) {
          setMemberNumber(data as string);
        }
      })();
    }
    if (!open) {
      setMemberNumber("");
    }
  }, [open, clubId]);

  const age = idNumber ? getAgeFromSaId(idNumber) : null;

  // Preview of fees that will be created
  const selectedCat = feeCategories.find(c => c.id === feeCategoryId);
  const isVisitor = (selectedCat?.name || "").trim().toLowerCase() === "visitor";

  // Visitors don't get a club member number — clear it whenever Visitor is selected
  useEffect(() => {
    if (isVisitor && memberNumber) setMemberNumber("");
  }, [isVisitor]);

  const previewFees: { label: string; amount: number }[] = [];
  if (selectedCat) {
    previewFees.push({ label: `Club – ${selectedCat.name}`, amount: selectedCat.annual_fee });
  }
  if (playsLeague) {
    for (const a of associations) {
      if (a.fee_annual > 0) previewFees.push({ label: a.abbreviation || a.name, amount: a.fee_annual });
    }
    for (const n of nationalFees) {
      if (n.fee_annual > 0) previewFees.push({ label: n.abbreviation || n.body_name, amount: n.fee_annual });
    }
  }

  const handleAdd = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length < 2) {
      toast.error("Full name is required (at least 2 characters)");
      return;
    }
    if (!trimmedEmail) {
      toast.error("Email is required");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error("Please enter a valid email address");
      return;
    }
    if (idNumber.trim() && !/^\d+$/.test(idNumber.trim())) {
      toast.error("ID number must contain digits only");
      return;
    }
    if (phone && phone !== "+27" && !/^\+\d{7,15}$/.test(phone.replace(/\s/g, ""))) {
      toast.error("Please enter a valid phone number in international format (e.g. +27821234567)");
      return;
    }
    if (!gender) {
      toast.error("Gender is required");
      return;
    }
    if (!feeCategoryId) {
      toast.error("Fee category is required");
      return;
    }
    if (playsLeague && selectedLeagueIds.length === 0) {
      toast.error("Please select at least one league");
      return;
    }

    // ── Duplicate validations ──
    // Member number uniqueness within club
    if (memberNumber.trim()) {
      const { data: dupNum } = await fromExt("club_members")
        .select("id")
        .eq("club_id", clubId)
        .eq("club_member_number", memberNumber.trim())
        .maybeSingle();
      if (dupNum) {
        toast.error("This membership number is already in use within the club");
        return;
      }
    }
    // ID number uniqueness within club
    if (idNumber.trim()) {
      const { data: dupId } = await fromExt("club_members")
        .select("id")
        .eq("club_id", clubId)
        .eq("id_number", idNumber.trim())
        .maybeSingle();
      if (dupId) {
        toast.error("This ID number is already registered in the club");
        return;
      }
    }
    // Duplicate email: allowed only if ID numbers differ
    if (trimmedEmail) {
      const { data: dupEmail } = await fromExt("club_members")
        .select("id, id_number")
        .eq("club_id", clubId)
        .eq("email", trimmedEmail);
      if (dupEmail && dupEmail.length > 0 && idNumber.trim()) {
        const sameId = dupEmail.find((m: any) => m.id_number === idNumber.trim());
        if (sameId) {
          toast.error("A member with this email and ID number already exists");
          return;
        }
      }
    }

    // Fuzzy duplicate warning — same phone (last 9 digits) or same name (case-insensitive)
    // within the club. Not a hard block: family members legitimately share a phone.
    try {
      const phoneDigits = (phone || "").replace(/\D+/g, "");
      const phoneTail = phoneDigits.length >= 9 ? phoneDigits.slice(-9) : "";
      const nameLc = trimmedName.toLowerCase();
      const { data: candidates } = await fromExt("club_members")
        .select("id, name, phone, email, club_member_number")
        .eq("club_id", clubId);
      const matches = (candidates || []).filter((c: any) => {
        const cTail = String(c.phone || "").replace(/\D+/g, "").slice(-9);
        const phoneHit = !!phoneTail && cTail === phoneTail;
        const nameHit = (c.name || "").trim().toLowerCase() === nameLc;
        return phoneHit || nameHit;
      });
      if (matches.length > 0) {
        const rows = matches.slice(0, 5).map((m: any) => {
          const bits = [m.name, m.club_member_number, m.email, m.phone].filter(Boolean);
          return `• ${bits.join(" · ")}`;
        }).join("\n");
        const ok = window.confirm(
          `Possible duplicate — the club already has ${matches.length} member(s) with a matching name or phone:\n\n${rows}\n\nAdd this new member anyway?`
        );
        if (!ok) return;
      }
    } catch (e) {
      console.warn("dup check failed", e);
    }

    setLoading(true);
    try {
      const { data: profile } = await fromExt("profiles").select("id").eq("email", trimmedEmail).maybeSingle();

      const { data: memberData, error } = await fromExt("club_members").insert({
        club_id: clubId,
        user_id: profile?.id || null,
        name: trimmedName,
        email: trimmedEmail,
        club_member_number: isVisitor ? null : (memberNumber || undefined),
        id_number: idNumber || undefined,
        phone: phone && phone !== "+27" ? phone : undefined,
        address: address || undefined,
        fee_category_id: feeCategoryId || undefined,
        gender: gender || undefined,
        skill_level: skillLevel || undefined,
        plays_league: isVisitor ? false : playsLeague,
        role: isVisitor ? ("visitor" as any) : undefined,
      }).select("id").single();
      if (error || !memberData) throw error || new Error("Failed to create member");

      // Auto-create member fee records — admin-added members default to paid
      if (previewFees.length > 0) {
        const feeRecords = previewFees.map((f, idx) => ({
          club_member_id: memberData.id,
          fee_type: idx === 0 ? "club" : (idx <= associations.filter(a => a.fee_annual > 0).length ? "association" : "national"),
          fee_label: f.label,
          amount: f.amount,
          paid: true,
          paid_at: new Date().toISOString(),
          season_year: new Date().getFullYear(),
        }));
        await fromExt("club_member_fee_payments").insert(feeRecords);
      }

      // Allocate selected leagues (auto-issues association numbers + seeds pass-through fees)
      if (playsLeague && selectedLeagueIds.length > 0) {
        const { error: allocErr } = await supabase.functions.invoke("admin-allocate-member-leagues", {
          body: { memberId: memberData.id, leagueAssociationIds: selectedLeagueIds },
        });
        if (allocErr) {
          toast.error(`Member added, but league allocation failed: ${allocErr.message}`);
        }
      }

      const msg = profile ? "Member added & linked to their account" : "Member added — they'll be linked when they sign up";
      toast.success(msg);
      setName(""); setEmail(""); setMemberNumber(""); setIdNumber(""); setPhone("+27"); setAddress(""); setFeeCategoryId(""); setGender(""); setSkillLevel(""); setPlaysLeague(false); setSelectedLeagueIds([]);
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["club-members"] });
      qc.invalidateQueries({ queryKey: ["club-member-fee-payments"] });
      qc.invalidateQueries({ queryKey: ["member-association-affiliations"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to add member");
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild><Button size="sm"><UserPlus className="w-4 h-4 mr-1" />Add Member</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Member</DialogTitle></DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          <div className="space-y-1"><Label>Full Name *</Label><Input value={name} onChange={e => setName(toTitleCase(e.target.value))} placeholder="John Smith" /></div>
          <div className="space-y-1"><Label>Email *</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="member@example.com" /></div>
          <div className="space-y-1">
            <Label>Gender Group *</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={gender} onChange={e => setGender(e.target.value)}>
              <option value="">— Select —</option>
              <option value="Men">Men</option>
              <option value="Ladies">Ladies</option>
            </select>
          </div>
          {!isVisitor && (
            <div className="space-y-1"><Label>Club Member Number</Label><Input value={memberNumber} onChange={e => setMemberNumber(e.target.value)} placeholder="Auto-generated" /></div>
          )}
          <div className="space-y-1">
            <Label>ID Number</Label>
            <Input value={idNumber} onChange={e => setIdNumber(e.target.value.replace(/\D/g, "").slice(0, 13))} placeholder="First 6 digits of ID or full ID" maxLength={13} />
            {age !== null && <p className="text-xs text-muted-foreground">Age: {age} years old</p>}
          </div>
          <div className="space-y-1">
            <Label>Mobile Number</Label>
            <Input value={phone} onChange={e => setPhone(formatPhoneNumber(e.target.value))} placeholder="+27 82 123 4567" />
            <p className="text-[10px] text-muted-foreground">International format, e.g. +27821234567</p>
          </div>
          <div className="space-y-1">
            <Label>Fee Category *</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={feeCategoryId}
              onChange={e => setFeeCategoryId(e.target.value)}
            >
              <option value="">— Select category —</option>
              {feeCategories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name} ({format(cat.annual_fee)}/yr)</option>
              ))}
            </select>
            {age !== null && !feeCategoryId && (
              <p className="text-xs text-amber-600">
                💡 Suggestion: {age < 25 ? "Student" : age >= 60 ? "Pensioner" : "Normal member"} based on age
              </p>
            )}
          </div>
          <div className="space-y-1"><Label>Address</Label><Input value={address} onChange={e => setAddress(toTitleCase(e.target.value))} placeholder="Optional" /></div>
          <div className="space-y-1">
            <Label>Skill Level</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={skillLevel} onChange={e => setSkillLevel(e.target.value)}>
              <option value="">— Select —</option>
              {SKILL_LEVELS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={playsLeague} onChange={e => setPlaysLeague(e.target.checked)} />
            <Label>Plays League</Label>
          </div>
          {playsLeague && (
            <div className="space-y-2 rounded-md border border-input p-2">
              <Label className="text-xs">Leagues *</Label>
              {associations.length === 0 ? (
                <p className="text-xs text-muted-foreground">No leagues configured for this club. Add them in the Leagues tab.</p>
              ) : (
                associations.filter((a: any) => a.active !== false).map((a: any) => {
                  const checked = selectedLeagueIds.includes(a.id);
                  return (
                    <label key={a.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setSelectedLeagueIds((prev) =>
                            e.target.checked ? [...prev, a.id] : prev.filter((id) => id !== a.id)
                          );
                        }}
                      />
                      <span>
                        {a.name}
                        {a.abbreviation ? ` (${a.abbreviation})` : ""}
                        {a.fee_annual > 0 ? ` — ${format(a.fee_annual)}` : ""}
                      </span>
                    </label>
                  );
                })
              )}
              <p className="text-[11px] text-muted-foreground">League numbers will be auto-allocated after the member is added.</p>
            </div>
          )}

          {/* Fee preview */}
          {previewFees.length > 0 && (
            <Card className="p-3 bg-muted/50">
              <p className="text-xs font-semibold mb-1">Annual Fees Payable</p>
              {previewFees.map((f, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span>{f.label}</span>
                  <span className="font-medium">{format(f.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between text-xs font-bold border-t border-border mt-1 pt-1">
                <span>Total</span>
                <span>{format(previewFees.reduce((s, f) => s + f.amount, 0))}</span>
              </div>
            </Card>
          )}

          <Button onClick={handleAdd} disabled={loading} className="w-full">{loading ? "Adding..." : "Add Member"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditMemberDialog({ member, feeCategories, clubId, onClose }: { member: ClubMember; feeCategories: MemberFeeCategory[]; clubId: string; onClose: () => void }) {
  const { format } = useClubCurrency();
  const { data: associations = [] } = useLeagueAssociations(clubId);

  // Classified associations (kind, tenant subdomain, permanent affiliation row).
  // Mirrors the logic in src/pages/Profile.tsx so admin Edit Member matches the
  // member-facing Edit Profile experience exactly.
  type ClassifiedAssoc = {
    associationId: string;
    associationName: string;
    abbreviation: string | null;
    kind: "internal" | "tenant" | "external_regional";
    tenantSubdomain: string | null;
    number: string;
    affiliationId: string | null;
    hasAffiliation: boolean;
    isActive: boolean;
    registrationIds: string[];
    isRegistered: boolean;
  };
  const [leagueAssocs, setLeagueAssocs] = useState<ClassifiedAssoc[]>([]);
  const [tickedAssociations, setTickedAssociations] = useState<Record<string, boolean>>({});
  const [leagueNumberDrafts, setLeagueNumberDrafts] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    name: member.name || member.profiles?.name || "",
    email: member.email || member.profiles?.email || "",
    club_member_number: member.club_member_number || "",
    role: member.role,
    plays_league: member.plays_league,
    ladder_position: member.ladder_position ?? "",
    id_number: member.id_number || "",
    gender: member.gender || "",
    phone: member.phone || member.profiles?.phone || "+27",
    address: member.address || "",
    fee_category_id: member.fee_category_id || "",
    skill_level: member.skill_level || "",
    billing_exempt: !!(member as any).billing_exempt,
  });

  // Build the classified league-association list (permanent affiliations are
  // the source of truth for the league number + active state).
  useEffect(() => {
    if (!clubId || !member.id) return;
    let cancelled = false;
    (async () => {
      const [affRes, regsRes, tenantsRes] = await Promise.all([
        fromExt("member_association_affiliations")
          .select("id, association_id, league_association_number, active")
          .eq("club_member_id", member.id),
        fromExt("member_league_registrations")
          .select("id, league_association_number, league:leagues(id, association_id)")
          .eq("club_member_id", member.id),
        fromExt("clubs")
          .select("id, name, subdomain, tenant_type")
          .eq("tenant_type", "association"),
      ]);
      if (cancelled) return;

      const affs = (affRes.data || []) as any[];
      const regs = (regsRes.data || []) as any[];
      const tenants = (tenantsRes.data || []) as any[];

      const affByAssoc: Record<string, any> = {};
      for (const af of affs) affByAssoc[af.association_id] = af;

      const numberByAssoc: Record<string, string> = {};
      const regIdsByAssoc: Record<string, string[]> = {};
      for (const r of regs) {
        const aid = r.league?.association_id as string | undefined;
        if (!aid) continue;
        regIdsByAssoc[aid] ||= [];
        regIdsByAssoc[aid].push(r.id);
        const num = (r.league_association_number || "").trim();
        if (num && !numberByAssoc[aid]) numberByAssoc[aid] = num;
      }

      const homeClubEnabledAssocId = (member as any).enable_league_association_id as string | null | undefined;

      const classified: ClassifiedAssoc[] = associations.map((a: any) => {
        let kind: "internal" | "tenant" | "external_regional";
        let tenantSubdomain: string | null = null;
        if (a.scope === "internal") {
          kind = "internal";
        } else {
          let tenant: any | undefined;
          if (a.platform_association_id) {
            tenant = tenants.find((t) => t.id === a.platform_association_id);
          }
          if (!tenant) {
            const abbrLower = (a.abbreviation || "").toLowerCase();
            const nameLower = (a.name || "").toLowerCase();
            tenant = tenants.find(
              (t) =>
                (abbrLower && (t.subdomain || "").toLowerCase() === abbrLower) ||
                (nameLower && (t.name || "").toLowerCase() === nameLower),
            );
          }
          if (tenant) {
            kind = "tenant";
            tenantSubdomain = tenant.subdomain || null;
          } else {
            kind = "external_regional";
          }
        }

        const aff = affByAssoc[a.id];
        const permanentNumber = (aff?.league_association_number || "").trim();
        const number = permanentNumber || numberByAssoc[a.id] || "";
        const hasAffiliation = !!aff;
        const isActive = hasAffiliation ? aff.active === true : false;

        return {
          associationId: a.id,
          associationName: a.name,
          abbreviation: a.abbreviation || null,
          kind,
          tenantSubdomain,
          number,
          affiliationId: (aff?.id as string | undefined) || null,
          hasAffiliation,
          isActive,
          registrationIds: regIdsByAssoc[a.id] || [],
          isRegistered:
            isActive ||
            homeClubEnabledAssocId === a.id ||
            (regIdsByAssoc[a.id]?.length || 0) > 0,
        };
      });

      setLeagueAssocs(classified);
      setTickedAssociations((prev) => {
        const next = { ...prev };
        for (const a of classified) {
          if (next[a.associationId] === undefined) next[a.associationId] = a.isRegistered;
        }
        return next;
      });
      setLeagueNumberDrafts((prev) => {
        const next = { ...prev };
        for (const a of classified) {
          if (next[a.associationId] !== undefined) continue;
          if (a.kind === "internal") {
            next[a.associationId] = a.number || (form.club_member_number || "");
          } else {
            next[a.associationId] = a.number || "";
          }
        }
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [clubId, member.id, associations, form.club_member_number]);

  const age = form.id_number ? getAgeFromSaId(form.id_number) : null;

  const handleSave = async () => {
    // ── Field validations (matching onboarding wizard) ──
    if (!form.name.trim() || form.name.trim().length < 2) {
      toast.error("Full name is required (at least 2 characters)");
      return;
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim().toLowerCase())) {
      toast.error("Please enter a valid email address");
      return;
    }
    if (form.id_number.trim() && !/^\d+$/.test(form.id_number.trim())) {
      toast.error("ID number must contain digits only");
      return;
    }
    if (form.phone && form.phone !== "+27" && !/^\+\d{7,15}$/.test(form.phone.replace(/\s/g, ""))) {
      toast.error("Please enter a valid phone number in international format (e.g. +27821234567)");
      return;
    }
    if (!form.gender) {
      toast.error("Gender is required");
      return;
    }
    if (!form.fee_category_id) {
      toast.error("Fee category is required");
      return;
    }
    // Derive plays_league from ticked associations (matches Edit Profile UX).
    const tickedIds = leagueAssocs.map((a) => a.associationId).filter((id) => tickedAssociations[id]);
    const derivedPlaysLeague = tickedIds.length > 0;
    if (derivedPlaysLeague) {
      // External-regional associations require a number; tenant ones are auto-allocated;
      // internal locks to club number — so the member number itself must exist first.
      for (const a of leagueAssocs) {
        if (!tickedAssociations[a.associationId]) continue;
        if (a.kind === "internal") {
          if (!form.club_member_number.trim()) {
            toast.error(`${a.associationName} uses the club member number — please set a member number first`);
            return;
          }
          continue;
        }
        if (a.kind !== "external_regional") continue;
        const draft = (leagueNumberDrafts[a.associationId] ?? "").trim();
        if (!draft) {
          toast.error(`Enter the league number for ${a.associationName}`);
          return;
        }
      }
    }

    // ── Duplicate validations ──
    if (form.club_member_number.trim()) {
      const { data: dupNum } = await fromExt("club_members")
        .select("id")
        .eq("club_id", clubId)
        .eq("club_member_number", form.club_member_number.trim())
        .neq("id", member.id)
        .maybeSingle();
      if (dupNum) {
        toast.error("This membership number is already in use within the club");
        return;
      }
    }
    if (form.id_number.trim()) {
      const { data: dupId } = await fromExt("club_members")
        .select("id")
        .eq("club_id", clubId)
        .eq("id_number", form.id_number.trim())
        .neq("id", member.id)
        .maybeSingle();
      if (dupId) {
        toast.error("This ID number is already registered in the club");
        return;
      }
    }
    // Duplicate email allowed, but not with same ID number
    if (form.email.trim() && form.id_number.trim()) {
      const { data: dupEmail } = await fromExt("club_members")
        .select("id, id_number")
        .eq("club_id", clubId)
        .eq("email", form.email.trim().toLowerCase())
        .neq("id", member.id);
      if (dupEmail && dupEmail.find((m: any) => m.id_number === form.id_number.trim())) {
        toast.error("A member with this email and ID number already exists");
        return;
      }
    }

    // Derive enable_league_association_id from ticked associations.
    let derivedEnableAssocId: string | null = null;
    if (tickedIds.length === 1) {
      derivedEnableAssocId = tickedIds[0];
    } else if (tickedIds.length > 1) {
      const existing = (member as any).enable_league_association_id as string | null | undefined;
      derivedEnableAssocId = (existing && tickedIds.includes(existing)) ? existing : tickedIds[0];
    }

    // Provision newly-ticked TENANT associations so league numbers are auto-allocated and
    // pass-through fees are seeded on both sides.
    const newlyTickedTenants = leagueAssocs.filter(
      (a) =>
        tickedAssociations[a.associationId] &&
        !a.isActive &&
        a.kind === "tenant" &&
        a.tenantSubdomain,
    );
    for (const a of newlyTickedTenants) {
      try {
        const { error: provErr } = await supabase.functions.invoke(
          "provision-association-member",
          { body: { associationSubdomain: a.tenantSubdomain, homeClubId: clubId, clubMemberId: member.id } },
        );
        if (provErr) {
          console.warn("[admin edit member] provision failed for", a.associationName, provErr);
          toast.error(`Couldn't register with ${a.abbreviation || a.associationName}: ${provErr.message || "provisioning failed"}`);
        }
      } catch (err: any) {
        console.warn("[admin edit member] provision threw for", a.associationName, err);
      }
    }

    const { error } = await fromExt("club_members").update({
      name: form.name || null,
      email: form.email || null,
      club_member_number: form.club_member_number || null,
      role: form.role,
      plays_league: derivedPlaysLeague,
      enable_league_association_id: derivedEnableAssocId,
      ladder_position: form.ladder_position ? Number(form.ladder_position) : null,
      id_number: form.id_number || null,
      gender: form.gender || null,
      phone: form.phone && form.phone !== "+27" ? form.phone : null,
      address: form.address || null,
      fee_category_id: form.fee_category_id || null,
      skill_level: form.skill_level || null,
      billing_exempt: form.billing_exempt,
    }).eq("id", member.id);
    if (error) { toast.error(error.message); return; }

    // Persist permanent affiliations: one row per association whose tick state changed.
    // Numbers are NEVER deleted — we only flip `active`. New rows for external-regional
    // associations are created here; tenant ones are created by the edge function above.
    for (const a of leagueAssocs) {
      const ticked = !!tickedAssociations[a.associationId];
      // Internal leagues ALWAYS mirror the club member number — overrides any draft.
      const effectiveNumber = a.kind === "internal"
        ? form.club_member_number.trim()
        : (leagueNumberDrafts[a.associationId] ?? "").trim();

      if (a.hasAffiliation && a.affiliationId) {
        const patch: any = {};
        if (ticked !== a.isActive) patch.active = ticked;
        // Internal: keep number in sync with club_member_number even if it changed.
        // External/tenant: only fill in when previously blank (numbers are permanent once set).
        if (a.kind === "internal") {
          if (effectiveNumber && effectiveNumber !== a.number) {
            patch.league_association_number = effectiveNumber;
          }
        } else if (!a.number && effectiveNumber) {
          patch.league_association_number = effectiveNumber;
        }
        if (Object.keys(patch).length > 0) {
          const { error: affErr } = await fromExt("member_association_affiliations")
            .update(patch)
            .eq("id", a.affiliationId);
          if (affErr) { toast.error(`League info: ${affErr.message}`); return; }
        }
      } else if (ticked) {
        if (a.kind === "tenant") continue; // edge function creates the row
        const { error: insErr } = await fromExt("member_association_affiliations")
          .insert({
            club_member_id: member.id,
            association_id: a.associationId,
            league_association_number: effectiveNumber || null,
            active: true,
          });
        if (insErr) { toast.error(`League info: ${insErr.message}`); return; }
      }

      // Back-compat: also write the number onto any season-team registration rows
      // that are still blank (so existing UI bits that read from member_league_registrations keep working).
      if (ticked && effectiveNumber && !a.number && a.registrationIds.length > 0) {
        await fromExt("member_league_registrations")
          .update({ league_association_number: effectiveNumber })
          .in("id", a.registrationIds);
      }
    }

    toast.success("Member updated");
    onClose();
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit {form.name || member.profiles?.name || "Member"}</DialogTitle></DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          <div className="space-y-1"><Label>Full Name *</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: toTitleCase(e.target.value) }))} /></div>
          <div className="space-y-1"><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
          <div className="space-y-1">
            <Label>Gender Group *</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.gender} onChange={e => setForm(p => ({ ...p, gender: e.target.value }))}>
              <option value="">— Select —</option>
              <option value="Men">Men</option>
              <option value="Ladies">Ladies</option>
            </select>
          </div>
          <div className="space-y-1"><Label>Member Number</Label><Input value={form.club_member_number} onChange={e => setForm(p => ({ ...p, club_member_number: e.target.value }))} /></div>
          <div className="space-y-1">
            <Label>Role</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value as any }))}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
              <option value="captain">Captain</option>
              <option value="visitor">Visitor</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label>Ladder Position</Label>
            <Input type="number" min={1} value={form.ladder_position} onChange={e => setForm(p => ({ ...p, ladder_position: e.target.value }))} placeholder="e.g. 5" />
            <p className="text-xs text-muted-foreground">
              Current ladder position: {typeof member.ladder_position === "number" ? `#${member.ladder_position}` : "unranked"}
            </p>
          </div>
          <div className="space-y-1">
            <Label>Skill Level</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.skill_level} onChange={e => setForm(p => ({ ...p, skill_level: e.target.value }))}>
              <option value="">— Select —</option>
              {SKILL_LEVELS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="flex items-start gap-2 rounded-md border border-border p-2.5">
            <input
              type="checkbox"
              id="admin-billing-exempt"
              className="mt-0.5"
              checked={form.billing_exempt}
              onChange={e => setForm(p => ({ ...p, billing_exempt: e.target.checked }))}
            />
            <div className="space-y-0.5">
              <Label htmlFor="admin-billing-exempt" className="text-sm font-medium">Not a billable member</Label>
              <p className="text-[10px] text-muted-foreground">
                Excludes this record from your club's subscription member count. Use for placeholder or
                visitor slots (e.g. internal league reserves) that aren't real paying members.
              </p>
            </div>
          </div>
          {leagueAssocs.length > 0 && (
            <div className="border-t border-border pt-3 mt-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">League Participation</p>
              <p className="text-[10px] text-muted-foreground -mt-2">
                Tick a league to play and pay its fees. Untick to pause — the number is kept on file and reactivates instantly when you re-tick.
              </p>
              {leagueAssocs.map((a) => {
                const ticked = !!tickedAssociations[a.associationId];
                const isInternal = a.kind === "internal";
                // Internal leagues always lock to the home club number.
                const draft = isInternal
                  ? (form.club_member_number || leagueNumberDrafts[a.associationId] || "")
                  : (leagueNumberDrafts[a.associationId] ?? "");
                const locked = isInternal || !!a.number;
                return (
                  <div key={a.associationId} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`admin-assoc-${a.associationId}`}
                        checked={ticked}
                        onChange={(e) =>
                          setTickedAssociations((prev) => ({
                            ...prev,
                            [a.associationId]: e.target.checked,
                          }))
                        }
                      />
                      <Label htmlFor={`admin-assoc-${a.associationId}`} className="text-sm font-medium">
                        {a.associationName}
                        {a.abbreviation ? ` (${a.abbreviation})` : ""}
                      </Label>
                      {isInternal && (
                        <span className="text-[10px] text-muted-foreground italic">(internal)</span>
                      )}
                      {a.hasAffiliation && !a.isActive && (
                        <span className="text-[10px] text-muted-foreground italic">
                          (paused — number {a.number || "—"})
                        </span>
                      )}
                    </div>
                    {ticked && (
                      <div className="pl-6 space-y-1">
                        <Input
                          value={draft}
                          disabled={locked}
                          onChange={(e) =>
                            setLeagueNumberDrafts((prev) => ({
                              ...prev,
                              [a.associationId]: e.target.value,
                            }))
                          }
                          placeholder={
                            isInternal
                              ? "Uses club member number"
                              : `${a.abbreviation || a.associationName} number (e.g. NSF7570)`
                          }
                        />
                        <p className="text-[10px] text-muted-foreground">
                          {isInternal
                            ? "Internal league — uses the member's club number automatically."
                            : locked
                              ? "Number on file — kept permanently."
                              : a.kind === "tenant"
                                ? "A number will be auto-allocated when you save."
                                : "Enter the number once. After saving it's locked to this member."}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div className="space-y-1">
            <Label>ID Number</Label>
            <Input value={form.id_number} onChange={e => setForm(p => ({ ...p, id_number: e.target.value.replace(/\D/g, "").slice(0, 13) }))} placeholder="First 6 digits of ID or full ID" maxLength={13} />
            {age !== null && <p className="text-xs text-muted-foreground">Age: {age} years old</p>}
          </div>
          <div className="space-y-1">
            <Label>Mobile Number</Label>
            <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: formatPhoneNumber(e.target.value) }))} placeholder="+27 82 123 4567" />
            <p className="text-[10px] text-muted-foreground">International format, e.g. +27821234567</p>
          </div>
          <div className="space-y-1">
            <Label>Fee Category *</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.fee_category_id}
              onChange={e => setForm(p => ({ ...p, fee_category_id: e.target.value }))}
            >
              <option value="">— Select category —</option>
              {feeCategories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name} ({format(cat.annual_fee)}/yr)</option>
              ))}
            </select>
            {age !== null && !form.fee_category_id && (
              <p className="text-xs text-amber-600">
                💡 Suggestion: {age < 25 ? "Student" : age >= 60 ? "Pensioner" : "Normal member"} based on age
              </p>
            )}
          </div>
          <div className="space-y-1"><Label>Address</Label><Input value={form.address} onChange={e => setForm(p => ({ ...p, address: toTitleCase(e.target.value) }))} /></div>
          <Button onClick={handleSave} className="w-full">Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BulkMembershipTypesDialog({
  clubId,
  open,
  onOpenChange,
  members,
  feeCategories,
}: {
  clubId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  members: ClubMember[];
  feeCategories: MemberFeeCategory[];
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const init: Record<string, string> = {};
      for (const m of members) init[m.id] = m.fee_category_id || "";
      setDraft(init);
      setSearch("");
    }
  }, [open, members]);

  const filtered = members
    .filter((m) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        (m.name || m.profiles?.name || "").toLowerCase().includes(q) ||
        (m.email || m.profiles?.email || "").toLowerCase().includes(q) ||
        (m.club_member_number || "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) =>
      (a.name || a.profiles?.name || "").localeCompare(b.name || b.profiles?.name || "")
    );

  const changed = members.filter(
    (m) => (draft[m.id] || "") !== (m.fee_category_id || "")
  );

  const handleSaveAll = async () => {
    if (changed.length === 0) {
      toast.info("No changes to save");
      return;
    }
    setSaving(true);
    let ok = 0;
    for (const m of changed) {
      const newId = draft[m.id] || null;
      const { error } = await fromExt("club_members")
        .update({ fee_category_id: newId })
        .eq("id", m.id);
      if (error) {
        toast.error(`${m.name || m.profiles?.name}: ${error.message}`);
      } else {
        ok++;
      }
    }
    setSaving(false);
    toast.success(`Updated ${ok} member${ok !== 1 ? "s" : ""}`);
    qc.invalidateQueries({ queryKey: ["club-members"] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Membership Types</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 flex-1 overflow-hidden flex flex-col">
          <Input
            placeholder="Search members..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="text-xs text-muted-foreground">
            {filtered.length} shown · {changed.length} pending change{changed.length !== 1 ? "s" : ""} · Assigns category only — no fees are raised
          </div>
          <div className="flex-1 overflow-y-auto border rounded-md divide-y">
            {filtered.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground text-center">No members</div>
            )}
            {filtered.map((m) => {
              const current = draft[m.id] || "";
              const changedRow = current !== (m.fee_category_id || "");
              return (
                <div
                  key={m.id}
                  className={`flex items-center gap-2 p-2 text-sm ${changedRow ? "bg-amber-500/10" : ""}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {m.name || m.profiles?.name || "—"}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {m.club_member_number || ""} {m.email || m.profiles?.email || ""}
                    </div>
                  </div>
                  <select
                    className="border rounded px-2 py-1 text-xs bg-background min-w-[160px]"
                    value={current}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, [m.id]: e.target.value }))
                    }
                  >
                    <option value="">— None —</option>
                    {feeCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveAll} disabled={saving || changed.length === 0}>
              {saving ? "Saving..." : `Save ${changed.length} change${changed.length !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
