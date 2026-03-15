import { useState, useRef, useEffect } from "react";
import { useClubMembers, useFeeCategories, useLeagueAssociations, useNationalBodyFees, useMyClub, ClubMember, MemberFeeCategory, SKILL_LEVELS, getSkillLabel } from "@/hooks/use-club";
import { fromExt } from "@/lib/supabase-ext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { UserPlus, Upload, Download, Search, Edit2, Trash2, CheckCircle2, XCircle, ShieldCheck, ShieldOff } from "lucide-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";

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

/** Calculate pro-rated club fee based on months remaining until fee_due_month */
function proRateClubFee(annualFee: number, joinedAt: string, feeDueMonth: number): number {
  const joined = new Date(joinedAt);
  const now = new Date();
  let nextDue = new Date(now.getFullYear(), feeDueMonth - 1, 1);
  if (nextDue <= now) nextDue = new Date(now.getFullYear() + 1, feeDueMonth - 1, 1);
  const feeYearStart = new Date(nextDue.getFullYear() - 1, feeDueMonth - 1, 1);
  if (joined <= feeYearStart) return annualFee;
  const monthsRemaining = (nextDue.getFullYear() - joined.getFullYear()) * 12 + (nextDue.getMonth() - joined.getMonth());
  if (monthsRemaining >= 12) return annualFee;
  if (monthsRemaining <= 0) return 0;
  return Math.round((annualFee / 12) * monthsRemaining);
}

/** Compute expected fees for a member */
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

  // 1. Club membership fee (full annual — pro-rating only for self-registering members)
  if (member.fee_category_id) {
    const cat = feeCategories.find(c => c.id === member.fee_category_id);
    if (cat) {
      const amount = cat.annual_fee;
      const existing = memberPayments.find(p => p.fee_type === "club" || p.fee_type === "membership");
      fees.push({ fee_type: "club", fee_label: `Club – ${cat.name}`, amount, existing });
    }
  }

  // 2. Association fee (if plays league)
  if (member.plays_league) {
    for (const assoc of associations) {
      if (assoc.fee_annual && assoc.fee_annual > 0) {
        const label = assoc.abbreviation || assoc.name;
        const existing = memberPayments.find(p => p.fee_type === "association");
        fees.push({ fee_type: "association", fee_label: label, amount: assoc.fee_annual, existing });
      }
    }
  }

  // 3. National body / SSA fees (if plays league)
  if (member.plays_league) {
    for (const nat of nationalFees) {
      if (nat.fee_annual && nat.fee_annual > 0) {
        const label = nat.abbreviation || nat.body_name;
        const existing = memberPayments.find(p => p.fee_type === "national" || p.fee_type === "national_body");
        fees.push({ fee_type: "national", fee_label: label, amount: nat.fee_annual, existing });
      }
    }
  }

  return fees;
}

function MemberPaymentStatus({ fees, onToggle, onCreateFee }: {
  fees: ExpectedFee[];
  onToggle: (feeId: string, paid: boolean) => void;
  onCreateFee: (fee: ExpectedFee) => void;
}) {
  if (fees.length === 0) return <span className="text-[10px] text-muted-foreground italic">No fees</span>;
  const total = fees.reduce((s, f) => s + f.amount, 0);
  const totalPaid = fees.filter(f => f.existing?.paid).reduce((s, f) => s + f.amount, 0);
  return (
    <div className="flex flex-col gap-0.5">
      {fees.map((f, i) => (
        <div key={i} className="flex items-center gap-1.5 text-[11px]">
          {f.existing ? (
            <Checkbox
              checked={f.existing.paid}
              onCheckedChange={(v) => onToggle(f.existing!.id, !!v)}
              className="h-3.5 w-3.5"
            />
          ) : (
            <Checkbox
              checked={false}
              onCheckedChange={() => onCreateFee(f)}
              className="h-3.5 w-3.5"
            />
          )}
          <span className="truncate max-w-[110px]">{f.fee_label}</span>
          <span className="text-muted-foreground">R{f.amount}</span>
          {f.existing?.paid ? (
            <CheckCircle2 className="w-3 h-3 text-green-600 shrink-0" />
          ) : (
            <XCircle className="w-3 h-3 text-destructive shrink-0" />
          )}
        </div>
      ))}
      <div className="text-[10px] font-medium border-t border-border pt-0.5 mt-0.5">
        R{totalPaid} / R{total}
      </div>
    </div>
  );
}

function MemberCard({ member: m, fees, delegateTitle, onEdit, onDelete, onTogglePaid, onCreateFee, onToggleAdmin }: {
  member: ClubMember;
  fees: ExpectedFee[];
  delegateTitle?: string | null;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePaid: (feeId: string, paid: boolean) => void;
  onCreateFee: (fee: ExpectedFee, clubMemberId: string) => void;
  onToggleAdmin: () => void;
}) {
  const displayName = m.profiles?.name || m.name || "—";
  const displayEmail = m.profiles?.email || m.email || "";
  const isLinked = !!m.user_id;
  const isAdmin = m.role === "admin" || m.role === "captain";
  const isDelegate = !!delegateTitle;
  const isProtected = isDelegate;
  return (
    <Card className="p-3 flex items-start justify-between gap-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium truncate">{displayName}</span>
          <Badge variant={isAdmin ? "secondary" : "outline"} className="text-[10px]">{m.role}</Badge>
          {delegateTitle && (
            <Badge variant="default" className="text-[10px] bg-amber-600 hover:bg-amber-700">{delegateTitle}</Badge>
          )}
          <Badge variant="outline" className={`text-[10px] ${isLinked ? "border-green-500 text-green-600" : "border-amber-500 text-amber-600"}`}>
            {isLinked ? "✓ Registered" : "✗ Not registered"}
          </Badge>
          {m.plays_league && <Badge variant="outline" className="text-[10px] text-primary">League</Badge>}
          {m.skill_level && <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-400">{getSkillLabel(m.skill_level)}</Badge>}
          {m.fee_category && <Badge variant="outline" className="text-[10px]">{m.fee_category.name}</Badge>}
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {displayEmail}
          {m.club_member_number ? ` • #${m.club_member_number}` : ""}
          {m.id_number ? ` • Age: ${getAgeFromSaId(m.id_number) ?? "?"}` : ""}
        </p>
      </div>
      <div className="flex items-start gap-3 shrink-0">
        <MemberPaymentStatus fees={fees} onToggle={onTogglePaid} onCreateFee={(f) => onCreateFee(f, m.id)} />
        <div className="flex gap-1">
          {!isProtected && (
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 ${isAdmin ? "text-primary" : "text-muted-foreground"}`}
              onClick={onToggleAdmin}
              title={isAdmin ? "Remove admin rights" : "Grant admin rights"}
            >
              {isAdmin ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldOff className="w-3.5 h-3.5" />}
            </Button>
          )}
          {isProtected && isAdmin && (
            <ShieldCheck className="w-3.5 h-3.5 text-primary mx-2 mt-2" />
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}><Edit2 className="w-3.5 h-3.5" /></Button>
          {!isProtected && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onDelete}><Trash2 className="w-3.5 h-3.5" /></Button>
          )}
        </div>
      </div>
    </Card>
  );
}

export function MembersTab({ clubId }: { clubId: string }) {
  const { data: members = [], isLoading } = useClubMembers(clubId);
  const { data: feeCategories = [] } = useFeeCategories(clubId);
  const { data: associations = [] } = useLeagueAssociations(clubId);
  const { data: nationalFees = [] } = useNationalBodyFees(clubId);
  const { data: clubData } = useMyClub();
  const feeDueMonth = clubData?.club?.member_fee_due_month ?? 1;
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editMember, setEditMember] = useState<ClubMember | null>(null);
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

  const getFeesForMember = (member: ClubMember) => {
    return computeExpectedFees(member, feeCategories, associations, nationalFees, feeDueMonth, feePayments);
  };

  /** Create paired GL journal entries for a fee toggle */
  const createJournalEntries = async (
    memberId: string,
    feeId: string,
    amount: number,
    feeType: string,
    feeLabel: string,
    isAccrual: boolean // true = fee being charged (unticked), false = fee being reversed (ticked back)
  ) => {
    const journalRef = crypto.randomUUID();
    const isPassThrough = feeType === "association" || feeType === "national" || feeType === "national_body";
    const creditAccount = isPassThrough ? "creditors" : "fee_income";
    const desc = isAccrual
      ? `Fee accrued: ${feeLabel}`
      : `Fee reversed: ${feeLabel}`;

    // Get member name for description
    const member = members.find(m => m.id === memberId);
    const memberName = member?.profiles?.name || member?.name || "Member";
    const fullDesc = `${desc} — ${memberName}`;

    const entries = isAccrual
      ? [
          { club_id: clubId, journal_ref: journalRef, account: "debtors", debit: amount, credit: 0, description: fullDesc, club_member_id: memberId, fee_payment_id: feeId },
          { club_id: clubId, journal_ref: journalRef, account: creditAccount, debit: 0, credit: amount, description: fullDesc, club_member_id: memberId, fee_payment_id: feeId },
        ]
      : [
          // Reverse: Dt Fee Income/Creditors, Ct Debtors
          { club_id: clubId, journal_ref: journalRef, account: creditAccount, debit: amount, credit: 0, description: fullDesc, club_member_id: memberId, fee_payment_id: feeId },
          { club_id: clubId, journal_ref: journalRef, account: "debtors", debit: 0, credit: amount, description: fullDesc, club_member_id: memberId, fee_payment_id: feeId },
        ];

    await fromExt("club_journal_entries").insert(entries);

    // Also create member credit transaction for their statement
    // Find the member's user_id for the transaction
    const userId = member?.user_id;
    if (userId) {
      await fromExt("member_credit_transactions").insert({
        user_id: userId,
        club_id: clubId,
        club_member_id: memberId,
        amount: isAccrual ? amount : -amount,
        type: isAccrual ? "debit" : "refund",
        method: "system",
        description: isAccrual ? `Fee charged: ${feeLabel}` : `Fee reversed: ${feeLabel}`,
        status: "confirmed",
        reference: feeId,
      });
    }
  };

  const handleTogglePaid = async (feeId: string, paid: boolean) => {
    // Find the fee details
    const fee = feePayments.find(f => f.id === feeId);
    if (!fee) return;

    const updates: any = { paid, paid_at: paid ? new Date().toISOString() : null };
    const { error } = await fromExt("club_member_fee_payments").update(updates).eq("id", feeId);
    if (error) { toast.error(error.message); return; }

    // When unticking (paid -> unpaid): accrue fee (Dt Debtors, Ct Fee Income/Creditors)
    // When ticking (unpaid -> paid): reverse the accrual
    if (!paid) {
      // Fee now unpaid = accrue it
      await createJournalEntries(fee.club_member_id, feeId, fee.amount, fee.fee_type, fee.fee_label, true);
    } else {
      // Fee now paid = reverse accrual
      await createJournalEntries(fee.club_member_id, feeId, fee.amount, fee.fee_type, fee.fee_label, false);
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
    const name = m.profiles?.name || m.name || "";
    const email = m.profiles?.email || m.email || "";
    const q = search.toLowerCase();
    return name.toLowerCase().includes(q) || email.toLowerCase().includes(q) || (m.club_member_number || "").toLowerCase().includes(q);
  });

  // Resolve delegate titles from club data
  const club = clubData?.club;
  const getDelegateTitle = (memberId: string): string | null => {
    if (!club) return null;
    const titles: string[] = [];
    if ((club as any).chairman_member_id === memberId) titles.push("Chairman");
    if ((club as any).secretary_member_id === memberId) titles.push("Secretary");
    if ((club as any).club_captain_member_id === memberId) titles.push("Club Captain");
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

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split("\n").filter(l => l.trim());
    if (lines.length < 2) { toast.error("CSV must have a header row + data"); return; }

    const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
    const emailIdx = headers.indexOf("email");
    if (emailIdx < 0) { toast.error("CSV must have an 'email' column"); return; }

    const nameIdx = headers.indexOf("name");
    const phoneIdx = headers.indexOf("phone");
    const memberNumIdx = headers.indexOf("member_number");
    const leagueIdx = headers.indexOf("plays_league");
    const idNumIdx = headers.indexOf("id_number");
    const addressIdx = headers.indexOf("address");
    const genderIdx = headers.indexOf("gender");
    const rankingIdx = headers.indexOf("ranking");

    let imported = 0;
    const importedMemberIds: string[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map(c => c.trim());
      const email = cols[emailIdx];
      if (!email) continue;

      const { data: profile } = await fromExt("profiles").select("id").eq("email", email).maybeSingle();
      const memberName = nameIdx >= 0 ? cols[nameIdx] : undefined;

      const { data: memberData, error } = await fromExt("club_members").upsert({
        club_id: clubId,
        user_id: profile?.id || null,
        name: memberName || undefined,
        email: email,
        club_member_number: memberNumIdx >= 0 ? cols[memberNumIdx] : undefined,
        plays_league: leagueIdx >= 0 ? cols[leagueIdx]?.toLowerCase() === "true" : false,
        id_number: idNumIdx >= 0 ? cols[idNumIdx] : undefined,
        phone: phoneIdx >= 0 ? cols[phoneIdx] : undefined,
        address: addressIdx >= 0 ? cols[addressIdx] : undefined,
        gender: genderIdx >= 0 ? cols[genderIdx] : undefined,
        ladder_position: rankingIdx >= 0 && cols[rankingIdx] ? parseInt(cols[rankingIdx], 10) || null : undefined,
      }, { onConflict: "club_id,email" }).select("id, fee_category_id, plays_league").single();

      if (!error && memberData) {
        imported++;
        importedMemberIds.push(memberData.id);
      } else if (error) {
        console.error(`CSV row ${i}: ${error.message}`);
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
        if (membersWithFees.has(m.id)) continue; // already has fees
        if (m.fee_category_id) {
          const cat = (cats || []).find((c: any) => c.id === m.fee_category_id);
          if (cat) {
            const amount = cat.annual_fee;
            feeRecords.push({
              club_member_id: m.id, fee_type: "club",
              fee_label: `Club – ${cat.name}`, amount,
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

    toast.success(`Imported ${imported} member${imported !== 1 ? "s" : ""}`);
    qc.invalidateQueries({ queryKey: ["club-members"] });
    qc.invalidateQueries({ queryKey: ["club-member-fee-payments"] });
    if (fileRef.current) fileRef.current.value = "";
  };

  // Compute fee summary
  const totalExpected = members.reduce((sum, m) => {
    const fees = getFeesForMember(m);
    return sum + fees.reduce((s, f) => s + f.amount, 0);
  }, 0);
  const totalPaid = members.reduce((sum, m) => {
    const fees = getFeesForMember(m);
    return sum + fees.filter(f => f.existing?.paid).reduce((s, f) => s + f.amount, 0);
  }, 0);

  return (
    <div className="space-y-4 mt-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search members..." className="pl-9" />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => {
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
            <Download className="w-4 h-4 mr-1" />Template
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="w-4 h-4 mr-1" />CSV Import
          </Button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCsvImport} />
          <AddMemberDialog clubId={clubId} open={addOpen} onOpenChange={setAddOpen} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{members.length} member{members.length !== 1 ? "s" : ""}</span>
        <span className="font-medium">Fees: R{totalPaid} paid / R{totalExpected} total</span>
        <span className="text-destructive font-medium">R{totalExpected - totalPaid} outstanding</span>
        <span className="text-emerald-600 dark:text-emerald-400 font-medium">💡 Set up fees in the Fees tab · Untick fees still outstanding for a member</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(["Men", "Ladies"] as const).map(gender => {
          const group = filtered.filter(m => m.gender === gender);
          const unassigned = gender === "Men" ? filtered.filter(m => !m.gender) : [];
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
                    delegateTitle={getDelegateTitle(m.id)}
                    onEdit={() => setEditMember(m)}
                    onDelete={() => handleDelete(m.id)}
                    onTogglePaid={handleTogglePaid}
                    onCreateFee={handleCreateFee}
                    onToggleAdmin={() => handleToggleAdmin(m)}
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

      {editMember && <EditMemberDialog member={editMember} feeCategories={feeCategories} clubId={clubId} onClose={() => { setEditMember(null); qc.invalidateQueries({ queryKey: ["club-members"] }); refetchPayments(); }} />}
    </div>
  );
}

function AddMemberDialog({ clubId, open, onOpenChange }: { clubId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
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
  const [associationId, setAssociationId] = useState("");
  const [associationNumber, setAssociationNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const { data: feeCategories = [] } = useFeeCategories(clubId);
  const { data: associations = [] } = useLeagueAssociations(clubId);
  const { data: nationalFees = [] } = useNationalBodyFees(clubId);
  const { data: clubData } = useMyClub();
  const feeDueMonth = clubData?.club?.member_fee_due_month ?? 1;
  const qc = useQueryClient();

  const age = idNumber ? getAgeFromSaId(idNumber) : null;

  // Preview of fees that will be created
  const selectedCat = feeCategories.find(c => c.id === feeCategoryId);
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
    if (idNumber.trim() && (!/^\d+$/.test(idNumber.trim()) || idNumber.trim().length !== 13)) {
      toast.error("SA ID number must be exactly 13 digits");
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
    if (playsLeague && !associationId) {
      toast.error("Please select a league association");
      return;
    }
    if (playsLeague && !associationNumber.trim()) {
      toast.error("Please enter the association number");
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

    setLoading(true);
    try {
      const { data: profile } = await fromExt("profiles").select("id").eq("email", trimmedEmail).maybeSingle();

      const { data: memberData, error } = await fromExt("club_members").insert({
        club_id: clubId,
        user_id: profile?.id || null,
        name: trimmedName,
        email: trimmedEmail,
        club_member_number: memberNumber || undefined,
        id_number: idNumber || undefined,
        phone: phone && phone !== "+27" ? phone : undefined,
        address: address || undefined,
        fee_category_id: feeCategoryId || undefined,
        gender: gender || undefined,
        skill_level: skillLevel || undefined,
        plays_league: playsLeague,
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

      const msg = profile ? "Member added & linked to their account" : "Member added — they'll be linked when they sign up";
      toast.success(msg);
      setName(""); setEmail(""); setMemberNumber(""); setIdNumber(""); setPhone("+27"); setAddress(""); setFeeCategoryId(""); setGender(""); setSkillLevel(""); setPlaysLeague(false);
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["club-members"] });
      qc.invalidateQueries({ queryKey: ["club-member-fee-payments"] });
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
          <div className="space-y-1"><Label>Full Name *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="John Smith" /></div>
          <div className="space-y-1"><Label>Email *</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="member@example.com" /></div>
          <div className="space-y-1">
            <Label>Gender *</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={gender} onChange={e => setGender(e.target.value)}>
              <option value="">— Select —</option>
              <option value="Men">Men</option>
              <option value="Ladies">Ladies</option>
            </select>
          </div>
          <div className="space-y-1"><Label>Club Member Number</Label><Input value={memberNumber} onChange={e => setMemberNumber(e.target.value)} placeholder="Optional" /></div>
          <div className="space-y-1">
            <Label>ID Number</Label>
            <Input value={idNumber} onChange={e => setIdNumber(e.target.value.replace(/\D/g, "").slice(0, 13))} placeholder="SA ID number (13 digits)" maxLength={13} />
            {age !== null && <p className="text-xs text-muted-foreground">Age: {age} years old</p>}
          </div>
          <div className="space-y-1">
            <Label>Mobile Number</Label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+27 82 123 4567" />
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
                <option key={cat.id} value={cat.id}>{cat.name} (R{cat.annual_fee}/yr)</option>
              ))}
            </select>
            {age !== null && !feeCategoryId && (
              <p className="text-xs text-amber-600">
                💡 Suggestion: {age < 25 ? "Student" : age >= 60 ? "Pensioner" : "Normal member"} based on age
              </p>
            )}
          </div>
          <div className="space-y-1"><Label>Address</Label><Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Optional" /></div>
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
            <>
              <div className="space-y-1">
                <Label>League Association *</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={associationId} onChange={e => setAssociationId(e.target.value)}>
                  <option value="">— Select Association —</option>
                  {associations.map(a => <option key={a.id} value={a.id}>{a.name} {a.abbreviation ? `(${a.abbreviation})` : ""}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Association Number *</Label>
                <Input value={associationNumber} onChange={e => setAssociationNumber(e.target.value)} placeholder="e.g. NSF12345" />
              </div>
            </>
          )}

          {/* Fee preview */}
          {previewFees.length > 0 && (
            <Card className="p-3 bg-muted/50">
              <p className="text-xs font-semibold mb-1">Annual Fees Payable</p>
              {previewFees.map((f, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span>{f.label}</span>
                  <span className="font-medium">R{f.amount}</span>
                </div>
              ))}
              <div className="flex justify-between text-xs font-bold border-t border-border mt-1 pt-1">
                <span>Total</span>
                <span>R{previewFees.reduce((s, f) => s + f.amount, 0)}</span>
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
  const { data: associations = [] } = useLeagueAssociations(clubId);
  const [regLoaded, setRegLoaded] = useState(false);
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
    association_id: "",
    association_number: "",
  });

  // Load existing league registration data
  useEffect(() => {
    if (member.plays_league) {
      fromExt("member_league_registrations")
        .select("league_id, league_association_number, player_rank, leagues:league_id(association_id)")
        .eq("club_member_id", member.id)
        .maybeSingle()
        .then(({ data }: any) => {
          if (data) {
            const assocId = (data.leagues as any)?.association_id || "";
            setForm(p => ({
              ...p,
              association_id: assocId,
              association_number: data.league_association_number || "",
              ladder_position: data.player_rank ?? p.ladder_position,
            }));
          }
          setRegLoaded(true);
        });
    } else {
      setRegLoaded(true);
    }
  }, [member.id, member.plays_league]);

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
    if (form.id_number.trim() && (!/^\d+$/.test(form.id_number.trim()) || form.id_number.trim().length !== 13)) {
      toast.error("SA ID number must be exactly 13 digits");
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
    if (form.plays_league && !form.association_id) {
      toast.error("Please select a league association");
      return;
    }
    if (form.plays_league && !form.association_number.trim()) {
      toast.error("Please enter the association number");
      return;
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

    const { error } = await fromExt("club_members").update({
      name: form.name || null,
      email: form.email || null,
      club_member_number: form.club_member_number || null,
      role: form.role,
      plays_league: form.plays_league,
      ladder_position: form.ladder_position ? Number(form.ladder_position) : null,
      id_number: form.id_number || null,
      gender: form.gender || null,
      phone: form.phone && form.phone !== "+27" ? form.phone : null,
      address: form.address || null,
      fee_category_id: form.fee_category_id || null,
      skill_level: form.skill_level || null,
    }).eq("id", member.id);
    if (error) { toast.error(error.message); return; }

    // Save league registration (association number) if plays league
    if (form.plays_league && form.association_id) {
      // Find the league linked to the selected association
      const { data: league } = await fromExt("leagues")
        .select("id")
        .eq("association_id", form.association_id)
        .limit(1)
        .maybeSingle();

      if (league) {
        // Upsert league registration
        const { data: existing } = await fromExt("member_league_registrations")
          .select("id")
          .eq("club_member_id", member.id)
          .eq("league_id", league.id)
          .maybeSingle();

        if (existing) {
          await fromExt("member_league_registrations")
            .update({
              league_association_number: form.association_number.trim(),
              player_rank: form.ladder_position ? Number(form.ladder_position) : null,
            })
            .eq("id", existing.id);
        } else {
          await fromExt("member_league_registrations")
            .insert({
              club_member_id: member.id,
              league_id: league.id,
              league_association_number: form.association_number.trim(),
              player_rank: form.ladder_position ? Number(form.ladder_position) : null,
            });
        }
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
          <div className="space-y-1"><Label>Full Name *</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
          <div className="space-y-1"><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
          <div className="space-y-1">
            <Label>Gender *</Label>
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
            </select>
          </div>
          <div className="space-y-1">
            <Label>Ladder Position</Label>
            <Input type="number" min={1} value={form.ladder_position} onChange={e => setForm(p => ({ ...p, ladder_position: e.target.value }))} placeholder="e.g. 5" />
            <p className="text-xs text-muted-foreground">
              Current ladder position: {typeof member.ladder_position === "number" ? `#${member.ladder_position}` : "unranked"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={form.plays_league} onChange={e => setForm(p => ({ ...p, plays_league: e.target.checked }))} />
            <Label>Plays League</Label>
          </div>
          <div className="space-y-1">
            <Label>Skill Level</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.skill_level} onChange={e => setForm(p => ({ ...p, skill_level: e.target.value }))}>
              <option value="">— Select —</option>
              {SKILL_LEVELS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          {form.plays_league && (
            <>
              <div className="space-y-1">
                <Label>League Association *</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.association_id} onChange={e => setForm(p => ({ ...p, association_id: e.target.value }))}>
                  <option value="">— Select Association —</option>
                  {associations.map(a => <option key={a.id} value={a.id}>{a.name} {a.abbreviation ? `(${a.abbreviation})` : ""}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Association Number *</Label>
                <Input value={form.association_number} onChange={e => setForm(p => ({ ...p, association_number: e.target.value }))} placeholder="e.g. NSF12345" />
              </div>
            </>
          )}
          <div className="space-y-1">
            <Label>ID Number</Label>
            <Input value={form.id_number} onChange={e => setForm(p => ({ ...p, id_number: e.target.value.replace(/\D/g, "").slice(0, 13) }))} placeholder="SA ID number (13 digits)" maxLength={13} />
            {age !== null && <p className="text-xs text-muted-foreground">Age: {age} years old</p>}
          </div>
          <div className="space-y-1">
            <Label>Mobile Number</Label>
            <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+27 82 123 4567" />
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
                <option key={cat.id} value={cat.id}>{cat.name} (R{cat.annual_fee}/yr)</option>
              ))}
            </select>
            {age !== null && !form.fee_category_id && (
              <p className="text-xs text-amber-600">
                💡 Suggestion: {age < 25 ? "Student" : age >= 60 ? "Pensioner" : "Normal member"} based on age
              </p>
            )}
          </div>
          <div className="space-y-1"><Label>Address</Label><Input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} /></div>
          <Button onClick={handleSave} className="w-full">Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
