import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, AlertTriangle, CalendarCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { useMemberContext } from "@/contexts/MemberContext";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clubId: string;
}

type Fixture = {
  id: string;
  fixture_date: string;
  home_team_code: string;
  away_team_code: string;
  division: string;
  venue_name: string;
  association_id: string;
};

type Court = { id: number; name: string };

type Row = {
  fixtureId: string;
  date: string;
  label: string; // "Men's 3rd League — CSI003 vs ADE004"
  courtId: number;
  startTime: string; // HH:MM
  endTime: string;
  enabled: boolean;
  conflict?: { existingId: string; startTime: string; endTime: string } | null;
};

const DEFAULT_START = "18:00";
const DEFAULT_END = "22:00";

export function BulkLeagueBookingsDialog({ open, onOpenChange, clubId }: Props) {
  const { user } = useAuth();
  const { activeMember } = useMemberContext();
  const [rows, setRows] = useState<Row[]>([]);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [booking, setBooking] = useState(false);
  const [primaryCourtId, setPrimaryCourtId] = useState<number | null>(null);
  const [secondaryCourtId, setSecondaryCourtId] = useState<number | null>(null);
  const [defaultStart, setDefaultStart] = useState<string>(DEFAULT_START);
  const [defaultEnd, setDefaultEnd] = useState<string>(DEFAULT_END);

  // Courts for this club
  const { data: courts = [] } = useQuery({
    queryKey: ["bulk-league:courts", clubId],
    enabled: !!clubId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courts")
        .select("id, name")
        .eq("club_id", clubId)
        .order("id");
      if (error) throw error;
      return (data || []) as Court[];
    },
  });

  // Club's team codes (both leagues.code + leagues.nsa_team_code)
  const { data: teamCodeSet } = useQuery({
    queryKey: ["bulk-league:team-codes", clubId],
    enabled: !!clubId && open,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("leagues")
        .select("code, nsa_team_code, association_id")
        .eq("club_id", clubId);
      if (error) throw error;
      const codes = new Set<string>();
      const assocIds = new Set<string>();
      for (const l of (data || []) as any[]) {
        if (l.code) codes.add(String(l.code).toUpperCase());
        if (l.nsa_team_code) codes.add(String(l.nsa_team_code).toUpperCase());
        if (l.association_id) assocIds.add(l.association_id);
      }
      return { codes, assocIds };
    },
  });

  // Association platform IDs (fixtures live under platform association)
  const { data: platformAssocIds = [] } = useQuery({
    queryKey: ["bulk-league:platform-assocs", clubId, Array.from(teamCodeSet?.assocIds || [])],
    enabled: !!teamCodeSet && teamCodeSet.assocIds.size > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("league_associations")
        .select("id, platform_association_id")
        .in("id", Array.from(teamCodeSet!.assocIds));
      if (error) throw error;
      const ids = new Set<string>();
      for (const a of (data || []) as any[]) {
        ids.add(a.platform_association_id || a.id);
      }
      return Array.from(ids);
    },
  });

  // Upcoming home fixtures
  const { data: fixtures = [], isLoading: fixturesLoading } = useQuery({
    queryKey: ["bulk-league:home-fixtures", clubId, platformAssocIds],
    enabled: open && !!teamCodeSet && platformAssocIds.length > 0,
    queryFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const { data, error } = await (supabase as any)
        .from("platform_league_fixtures")
        .select("id, fixture_date, home_team_code, away_team_code, division, venue_name, association_id")
        .in("association_id", platformAssocIds)
        .gte("fixture_date", today)
        .neq("status", "cancelled")
        .order("fixture_date", { ascending: true });
      if (error) throw error;
      const codes = teamCodeSet!.codes;
      return ((data || []) as Fixture[]).filter(
        (f) => f.home_team_code && codes.has(String(f.home_team_code).toUpperCase())
              && f.away_team_code !== "__BYE__"
      );
    },
  });

  // Default primary/secondary courts (persisted per club)
  const storageKey = `bulk-league:default-courts:${clubId}`;
  useEffect(() => {
    if (!open || courts.length === 0) return;
    let p: number | null = null;
    let s: number | null = null;
    let st: string | null = null;
    let en: string | null = null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (courts.some((c) => c.id === parsed.primary)) p = parsed.primary;
        if (courts.some((c) => c.id === parsed.secondary)) s = parsed.secondary;
        if (typeof parsed.startTime === "string") st = parsed.startTime;
        if (typeof parsed.endTime === "string") en = parsed.endTime;
      }
    } catch {}
    if (p == null) p = courts[0].id;
    if (s == null) s = courts[Math.min(1, courts.length - 1)].id;
    setPrimaryCourtId(p);
    setSecondaryCourtId(s);
    if (st) setDefaultStart(st);
    if (en) setDefaultEnd(en);
  }, [courts, open, storageKey]);

  // Persist defaults
  useEffect(() => {
    if (primaryCourtId == null || secondaryCourtId == null) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ primary: primaryCourtId, secondary: secondaryCourtId, startTime: defaultStart, endTime: defaultEnd }));
    } catch {}
  }, [primaryCourtId, secondaryCourtId, defaultStart, defaultEnd, storageKey]);

  // Build/rebuild rows whenever fixtures or the default courts change
  useEffect(() => {
    if (!open || courts.length === 0 || primaryCourtId == null || secondaryCourtId == null) return;
    const grouped: Record<string, Fixture[]> = {};
    for (const f of fixtures) (grouped[f.fixture_date] ||= []).push(f);

    const built: Row[] = [];
    for (const date of Object.keys(grouped).sort()) {
      const list = grouped[date];
      list.forEach((f, idx) => {
        const courtId =
          idx === 0 ? primaryCourtId
          : idx === 1 ? secondaryCourtId
          : courts[Math.min(idx, courts.length - 1)].id;
        built.push({
          fixtureId: f.id,
          date,

          label: `${f.division} — ${f.home_team_code} vs ${f.away_team_code}`,
          courtId,
          startTime: DEFAULT_START,
          endTime: DEFAULT_END,
          enabled: true,
          conflict: null,
        });
      });
    }
    setRows(built);
  }, [fixtures, courts, open, primaryCourtId, secondaryCourtId]);

  const runConflictCheck = async () => {
    if (rows.length === 0) return;
    setCheckingConflicts(true);
    try {
      const activeRows = rows.filter((r) => r.enabled);
      const dates = Array.from(new Set(activeRows.map((r) => r.date)));
      const courtIds = Array.from(new Set(activeRows.map((r) => r.courtId)));
      const { data, error } = await supabase
        .from("bookings")
        .select("id, court_id, date, start_time, end_time")
        .in("date", dates)
        .in("court_id", courtIds)
        .eq("status", "active");
      if (error) throw error;
      const existing = (data || []) as any[];
      setRows((prev) =>
        prev.map((r) => {
          if (!r.enabled) return { ...r, conflict: null };
          const s = r.startTime.length === 5 ? r.startTime + ":00" : r.startTime;
          const e = r.endTime.length === 5 ? r.endTime + ":00" : r.endTime;
          const clash = existing.find(
            (b) => b.court_id === r.courtId && b.date === r.date && b.start_time < e && b.end_time > s
          );
          return { ...r, conflict: clash ? { existingId: clash.id, startTime: clash.start_time, endTime: clash.end_time } : null };
        })
      );
      toast.success("Conflict check complete");
    } catch (e: any) {
      toast.error(e.message ?? "Conflict check failed");
    } finally {
      setCheckingConflicts(false);
    }
  };

  const bookAll = async () => {
    const toBook = rows.filter((r) => r.enabled && !r.conflict);
    if (toBook.length === 0) {
      toast.error("No rows ready to book (resolve conflicts or enable rows).");
      return;
    }
    setBooking(true);
    try {
      const payload = toBook.map((r) => ({
        court_id: r.courtId,
        club_id: clubId,
        user_id: user?.id ?? null,
        club_member_id: activeMember?.id ?? null,
        date: r.date,
        start_time: r.startTime.length === 5 ? r.startTime + ":00" : r.startTime,
        end_time: r.endTime.length === 5 ? r.endTime + ":00" : r.endTime,
        source: "club_event",
        is_friendly: false,
        guest_name: "League fixture",
      }));

      const { data, error } = await supabase.from("bookings").insert(payload as any).select("id");
      if (error) throw error;
      toast.success(`Booked ${data?.length ?? 0} court slots`);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to bulk book");
    } finally {
      setBooking(false);
    }
  };

  const updateRow = (idx: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch, conflict: null } : r)));

  const readyCount = rows.filter((r) => r.enabled && !r.conflict).length;
  const conflictCount = rows.filter((r) => r.enabled && r.conflict).length;

  const grouped = useMemo(() => {
    const g: Record<string, { row: Row; idx: number }[]> = {};
    rows.forEach((row, idx) => {
      (g[row.date] ||= []).push({ row, idx });
    });
    return g;
  }, [rows]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-primary" />
            Bulk book home league fixtures
          </DialogTitle>
          <DialogDescription>
            Pick your default primary court (used for every fixture) and secondary court (used when two fixtures fall on the same evening).
            Any row can still be overridden individually below.
          </DialogDescription>
        </DialogHeader>

        {courts.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg border bg-muted/30">
            <div>
              <Label className="text-xs">Primary court</Label>
              <Select
                value={primaryCourtId != null ? String(primaryCourtId) : ""}
                onValueChange={(v) => setPrimaryCourtId(Number(v))}
              >
                <SelectTrigger className="h-9 mt-1 text-xs">
                  <SelectValue placeholder="Select primary court" />
                </SelectTrigger>
                <SelectContent>
                  {courts.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)} className="text-xs">{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Secondary court (2nd fixture same night)</Label>
              <Select
                value={secondaryCourtId != null ? String(secondaryCourtId) : ""}
                onValueChange={(v) => setSecondaryCourtId(Number(v))}
              >
                <SelectTrigger className="h-9 mt-1 text-xs">
                  <SelectValue placeholder="Select secondary court" />
                </SelectTrigger>
                <SelectContent>
                  {courts.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)} className="text-xs">{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {fixturesLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <Loader2 className="w-5 h-5 mx-auto animate-spin mb-2" /> Loading fixtures…
          </div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No upcoming home fixtures found for this club.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">{rows.length} fixtures</Badge>
              <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">{readyCount} ready</Badge>
              {conflictCount > 0 && (
                <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> {conflictCount} conflicts
                </Badge>
              )}
            </div>

            <div className="space-y-4 mt-2">
              {Object.keys(grouped).sort().map((date) => (
                <div key={date} className="rounded-lg border bg-card/60 p-3">
                  <div className="text-sm font-semibold mb-2">
                    {format(parseISO(date), "EEEE d MMM yyyy")}
                  </div>
                  <div className="space-y-2">
                    {grouped[date].map(({ row, idx }) => (
                      <div key={row.fixtureId} className={`grid grid-cols-12 gap-2 items-center rounded-md border p-2 ${row.conflict ? "border-amber-500/50 bg-amber-500/5" : "border-border/60"}`}>
                        <div className="col-span-1 flex items-center">
                          <Checkbox
                            checked={row.enabled}
                            onCheckedChange={(v) => updateRow(idx, { enabled: !!v })}
                          />
                        </div>
                        <div className="col-span-11 sm:col-span-4 text-xs">
                          <div className="font-medium truncate">{row.label}</div>
                          {row.conflict && (
                            <div className="text-[11px] text-amber-700 dark:text-amber-400 flex items-center gap-1 mt-0.5">
                              <AlertTriangle className="w-3 h-3" />
                              Conflicts with {row.conflict.startTime.slice(0,5)}–{row.conflict.endTime.slice(0,5)}
                            </div>
                          )}
                        </div>
                        <div className="col-span-4 sm:col-span-3">
                          <Select value={String(row.courtId)} onValueChange={(v) => updateRow(idx, { courtId: Number(v) })}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {courts.map((c) => (
                                <SelectItem key={c.id} value={String(c.id)} className="text-xs">
                                  {c.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-3 sm:col-span-2">
                          <Input
                            type="time"
                            value={row.startTime}
                            onChange={(e) => updateRow(idx, { startTime: e.target.value })}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="col-span-3 sm:col-span-2">
                          <Input
                            type="time"
                            value={row.endTime}
                            onChange={(e) => updateRow(idx, { endTime: e.target.value })}
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={runConflictCheck} disabled={checkingConflicts || rows.length === 0}>
            {checkingConflicts ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Check conflicts
          </Button>
          <Button onClick={bookAll} disabled={booking || readyCount === 0}>
            {booking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Book {readyCount} slot{readyCount === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
