import { useState, useEffect } from "react";
import { Club, useUpdateClub } from "@/hooks/use-club";
import { useClubSecrets, useUpdateClubSecrets } from "@/hooks/use-club-secrets";
import { pulseShellyBleAuto, isBleFallbackAvailable } from "@/lib/shelly-ble-auto";
import { Bluetooth } from "lucide-react";
import { fromExt } from "@/lib/supabase-ext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, AlertCircle, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useClubCurrency } from "@/hooks/use-currency";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { GoBookApiCard } from "./GoBookApiCard";
import { SetupSteps, SetupStepNav, type SetupStep } from "./setup/SetupSteps";
import { EditLock, useEditLock } from "./setup/EditLock";

type RelayDevice = string;

function normalizeShellyServerInput(value: string) {
  const raw = value.trim();
  const urlMatch = raw.match(/https?:\/\/[^\s]+/i);
  const extracted = (urlMatch?.[0] || raw)
    .replace(/^server\s*:\s*/i, "")
    .replace(/\/+$/, "");
  return /^https?:\/\//i.test(extracted) ? extracted : "";
}

function DeleteConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmLabel = "Delete",
  isLoading = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  confirmLabel?: string;
  isLoading?: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={isLoading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isLoading ? "Deleting..." : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function CourtsTab({ club, clubId }: { club: Club; clubId: string }) {
  const updateClub = useUpdateClub();
  const { data: secrets } = useClubSecrets(clubId);
  const updateSecrets = useUpdateClubSecrets();
  const { symbol: currencySymbol } = useClubCurrency();
  const [step, setStep] = useState("courts");

  const [rulesForm, setRulesForm] = useState({
    booking_slot_minutes: club.booking_slot_minutes ?? 30,
    booking_open_time: ((club as any).booking_open_time ?? "05:00:00").slice(0, 5),
    booking_last_slot_time: ((club as any).booking_last_slot_time ?? "22:00:00").slice(0, 5),
    peak_weekday_start: (club.peak_weekday_start ?? "16:00:00").slice(0, 5),
    peak_weekday_end: (club.peak_weekday_end ?? "19:00:00").slice(0, 5),
    peak_weekend_start: (club.peak_weekend_start ?? "08:00:00").slice(0, 5),
    peak_weekend_end: (club.peak_weekend_end ?? "12:00:00").slice(0, 5),
    max_peak_bookings_per_day: club.max_peak_bookings_per_day ?? 1,
    max_bookings_per_day: (club as any).max_bookings_per_day ?? 4,
    max_member_events_per_month: (club as any).max_member_events_per_month ?? 2,
  });

  useEffect(() => {
    setRulesForm({
      booking_slot_minutes: club.booking_slot_minutes ?? 30,
      booking_open_time: ((club as any).booking_open_time ?? "05:00:00").slice(0, 5),
      booking_last_slot_time: ((club as any).booking_last_slot_time ?? "22:00:00").slice(0, 5),
      peak_weekday_start: (club.peak_weekday_start ?? "16:00:00").slice(0, 5),
      peak_weekday_end: (club.peak_weekday_end ?? "19:00:00").slice(0, 5),
      peak_weekend_start: (club.peak_weekend_start ?? "08:00:00").slice(0, 5),
      peak_weekend_end: (club.peak_weekend_end ?? "12:00:00").slice(0, 5),
      max_peak_bookings_per_day: club.max_peak_bookings_per_day ?? 1,
      max_bookings_per_day: (club as any).max_bookings_per_day ?? 4,
      max_member_events_per_month: (club as any).max_member_events_per_month ?? 2,
    });
  }, [club.id, club.booking_slot_minutes, (club as any).booking_open_time, (club as any).booking_last_slot_time, club.peak_weekday_start, club.peak_weekday_end, club.peak_weekend_start, club.peak_weekend_end, club.max_peak_bookings_per_day, (club as any).max_bookings_per_day, (club as any).max_member_events_per_month]);

  const handleSaveRules = async (onDone?: () => void) => {
    if (rulesForm.booking_last_slot_time <= rulesForm.booking_open_time) {
      toast.error("Last booking time must be after the opening time");
      return;
    }
    try {
      await updateClub.mutateAsync({
        id: club.id,
        booking_slot_minutes: rulesForm.booking_slot_minutes,
        booking_open_time: rulesForm.booking_open_time,
        booking_last_slot_time: rulesForm.booking_last_slot_time,
        peak_weekday_start: rulesForm.peak_weekday_start,
        peak_weekday_end: rulesForm.peak_weekday_end,
        peak_weekend_start: rulesForm.peak_weekend_start,
        peak_weekend_end: rulesForm.peak_weekend_end,
        max_peak_bookings_per_day: rulesForm.max_peak_bookings_per_day,
        max_bookings_per_day: rulesForm.max_bookings_per_day,
        max_member_events_per_month: rulesForm.max_member_events_per_month,
      } as any);
      toast.success("Booking rules saved");
      onDone?.();
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    }
  };
  const resetRules = () => {
    setRulesForm({
      booking_slot_minutes: club.booking_slot_minutes ?? 30,
      booking_open_time: ((club as any).booking_open_time ?? "05:00:00").slice(0, 5),
      booking_last_slot_time: ((club as any).booking_last_slot_time ?? "22:00:00").slice(0, 5),
      peak_weekday_start: (club.peak_weekday_start ?? "16:00:00").slice(0, 5),
      peak_weekday_end: (club.peak_weekday_end ?? "19:00:00").slice(0, 5),
      peak_weekend_start: (club.peak_weekend_start ?? "08:00:00").slice(0, 5),
      peak_weekend_end: (club.peak_weekend_end ?? "12:00:00").slice(0, 5),
      max_peak_bookings_per_day: club.max_peak_bookings_per_day ?? 1,
      max_bookings_per_day: (club as any).max_bookings_per_day ?? 4,
      max_member_events_per_month: (club as any).max_member_events_per_month ?? 2,
    });
  };
  const rulesLock = useEditLock(resetRules);

  const steps: SetupStep[] = [
    { id: "courts", label: "List courts", description: "Step one — name the courts your club plays on and choose which booking system those courts use.", complete: false },
    { id: "rules", label: "Booking rules", description: "Set slot length, opening hours, peak times and how many bookings a member may make.", complete: true },
    { id: "venues", label: "Other venues", description: "External tournament venues at other clubs.", complete: true },

  ];

  const [balanceForm, setBalanceForm] = useState({
    min_booking_balance: ((club as any).min_booking_balance ?? null) as number | null,
  });

  useEffect(() => {
    setBalanceForm({
      min_booking_balance: ((club as any).min_booking_balance ?? null) as number | null,
    });
  }, [(club as any).min_booking_balance]);

  const resetBalance = () => {
    setBalanceForm({
      min_booking_balance: ((club as any).min_booking_balance ?? null) as number | null,
    });
  };
  const balanceLock = useEditLock(resetBalance);

  return (
    <div className="space-y-4 mt-4">
      <SetupSteps steps={steps} value={step} onChange={setStep} />

      {step === "courts" && (
        <div className="space-y-4">
          <CourtsSection clubId={clubId} mode="list" relayDeviceType={"shelly"} />
          <HostingFeesCard club={club} />
          <ExternalBookingSection club={club} clubId={clubId} />
        </div>
      )}

      {step === "venues" && (
        <div className="space-y-4">
          <ExternalTournamentCourtsSection clubId={clubId} />
        </div>
      )}


      {step === "rules" && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* Booking Rules */}
        <Card className="p-4 space-y-4">
        <EditLock
          editing={rulesLock.editing}
          onEdit={rulesLock.edit}
          onCancel={rulesLock.cancel}
          onSave={() => handleSaveRules(rulesLock.done)}
          saving={updateClub.isPending}
          title="booking rules"
        >

          <div>
            <h3 className="font-semibold text-sm">Booking Rules</h3>
            <p className="text-xs text-muted-foreground">Control slot length, peak hours, and how many courts each member can book per day.</p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold">1. Slot length</Label>
            <div className="flex items-center gap-2">
              <Select
                value={String(rulesForm.booking_slot_minutes)}
                onValueChange={(v) => setRulesForm(p => ({ ...p, booking_slot_minutes: parseInt(v, 10) }))}
              >
                <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30-minute slots</SelectItem>
                  <SelectItem value="40">40-minute slots (starts 07:00)</SelectItem>
                  <SelectItem value="60">60-minute slots (full hours)</SelectItem>
                </SelectContent>
              </Select>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="shrink-0 inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-primary/30 bg-primary/5 text-primary text-[11px] font-medium hover:bg-primary/10 transition-colors cursor-help"
                    >
                      <Info className="w-3.5 h-3.5" />
                      Tips
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" align="start" className="max-w-sm text-xs leading-relaxed p-3">
                    <p className="font-semibold mb-1">Choosing a slot length</p>
                    <p>30- and 60-minute slots are the most flexible and recommended — they divide cleanly into match lengths and make scheduling tournaments, leagues and back-to-back fixtures far easier.</p>
                    <p className="mt-2">40-minute slots suit clubs whose existing booking culture is built around that rhythm, but they don't align with hourly tournament rounds.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          {/* Booking hours */}
          <div className="space-y-2 rounded-lg border p-3 bg-muted/30">
            <Label className="text-xs font-semibold">Court booking hours</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">First slot (courts open)</Label>
                <Input
                  type="time"
                  className="h-8 text-xs"
                  value={rulesForm.booking_open_time}
                  onChange={e => setRulesForm(p => ({ ...p, booking_open_time: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Last slot starts</Label>
                <Input
                  type="time"
                  className="h-8 text-xs"
                  value={rulesForm.booking_last_slot_time}
                  onChange={e => setRulesForm(p => ({ ...p, booking_last_slot_time: e.target.value }))}
                />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Default 05:00–22:00. The booking grid shows slots from the first slot up to and including the last slot start time.
            </p>
          </div>


          {/* 2. Daily caps */}
          <div className="space-y-2 rounded-lg border p-3 bg-muted/30">
            <Label className="text-xs font-semibold">2. Per-member daily limits</Label>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Total bookings / day</Label>
                <Input
                  type="number" min={1} max={20} step={1}
                  className="h-8 text-xs"
                  value={rulesForm.max_bookings_per_day}
                  onChange={e => setRulesForm(p => ({ ...p, max_bookings_per_day: Math.max(1, parseInt(e.target.value) || 1) }))}
                />
                <p className="text-[10px] text-muted-foreground">Across the whole day (peak + off-peak).</p>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Of those, max during peak</Label>
                <Input
                  type="number" min={1} max={10} step={1}
                  className="h-8 text-xs"
                  value={rulesForm.max_peak_bookings_per_day}
                  onChange={e => setRulesForm(p => ({ ...p, max_peak_bookings_per_day: Math.max(1, parseInt(e.target.value) || 1) }))}
                />
                <p className="text-[10px] text-muted-foreground">Limit during peak hours only.</p>
              </div>
            </div>
          </div>

          {/* 3. Peak hours */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">3. Peak hours</Label>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1 rounded-lg border p-2">
                <Label className="text-[11px] font-semibold">Weekday (Mon–Fri)</Label>
                <div className="flex items-center gap-1">
                  <Input type="time" className="h-8 text-xs" value={rulesForm.peak_weekday_start}
                    onChange={e => setRulesForm(p => ({ ...p, peak_weekday_start: e.target.value }))} />
                  <span className="text-[10px] text-muted-foreground">to</span>
                  <Input type="time" className="h-8 text-xs" value={rulesForm.peak_weekday_end}
                    onChange={e => setRulesForm(p => ({ ...p, peak_weekday_end: e.target.value }))} />
                </div>
              </div>

              <div className="space-y-1 rounded-lg border p-2">
                <Label className="text-[11px] font-semibold">Weekend (Sat–Sun)</Label>
                <div className="flex items-center gap-1">
                  <Input type="time" className="h-8 text-xs" value={rulesForm.peak_weekend_start}
                    onChange={e => setRulesForm(p => ({ ...p, peak_weekend_start: e.target.value }))} />
                  <span className="text-[10px] text-muted-foreground">to</span>
                  <Input type="time" className="h-8 text-xs" value={rulesForm.peak_weekend_end}
                    onChange={e => setRulesForm(p => ({ ...p, peak_weekend_end: e.target.value }))} />
                </div>
              </div>
            </div>
          </div>

          {/* 4. Member-created events */}
          <div className="space-y-1 rounded-lg border p-3 bg-muted/30">
            <Label className="text-xs font-semibold">4. Member-created events / sessions</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number" min={0} max={50} step={1}
                className="h-8 text-xs w-24"
                value={rulesForm.max_member_events_per_month}
                onChange={e => setRulesForm(p => ({ ...p, max_member_events_per_month: Math.max(0, parseInt(e.target.value) || 0) }))}
              />
              <span className="text-[11px] text-muted-foreground">events per member, per calendar month</span>
            </div>
            <p className="text-[10px] text-muted-foreground">Set to 0 to block members from creating events (admins are always exempt).</p>
          </div>

        </EditLock>
        </Card>

        {/* Minimum booking balance — independent of lights */}
        <Card className="p-4 space-y-3">
        <EditLock
          editing={balanceLock.editing}
          onEdit={balanceLock.edit}
          onCancel={balanceLock.cancel}
          onSave={async () => {
            try {
              await updateClub.mutateAsync({ id: club.id, min_booking_balance: balanceForm.min_booking_balance } as any);
              toast.success("Minimum balance saved");
              balanceLock.done();
            } catch (err: any) {
              toast.error(err.message || "Failed to save");
            }
          }}
          saving={updateClub.isPending}
          title="minimum balance"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-sm">Minimum balance required to book a court</h3>
              <p className="text-xs text-muted-foreground">
                {balanceForm.min_booking_balance !== null
                  ? "Members need at least this credit on their account before booking."
                  : "Disabled — any active member can book regardless of account balance."}
              </p>
            </div>
            <Switch
              checked={balanceForm.min_booking_balance !== null}
              onCheckedChange={(checked) =>
                setBalanceForm(p => ({
                  ...p,
                  min_booking_balance: checked ? (p.min_booking_balance ?? 20) : null,
                }))
              }
            />
          </div>

          {balanceForm.min_booking_balance !== null && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{currencySymbol}</span>
                <Input
                  type="number" min={0} step={1}
                  className="h-8 text-xs w-28"
                  value={balanceForm.min_booking_balance}
                  onChange={e => setBalanceForm(p => ({ ...p, min_booking_balance: Math.max(0, parseFloat(e.target.value) || 0) }))}
                />
                <span className="text-[11px] text-muted-foreground">credit required</span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-snug">
                Members on an arranged monthly payment plan are allowed to carry their plan's outstanding
                balance as debt (plus this buffer). If short, they're prompted to top up before the booking
                is confirmed.
              </p>
            </>
          )}
        </EditLock>
        </Card>
      </div>
      )}

      <SetupStepNav steps={steps} value={step} onChange={setStep} />
    </div>
  );
}

/**
 * Hosting fees charged by this club when it hosts a tournament:
 * a court rate per hour and a cleaning fee per day. Used by the
 * tournament governance fee split to work out host compensation.
 */
function HostingFeesCard({ club }: { club: Club }) {
  const updateClub = useUpdateClub();
  const { symbol } = useClubCurrency();
  const initial = () => ({
    hourly: ((club as any).host_court_fee_cents_per_hour ?? 0) / 100,
    cleaning: ((club as any).host_cleaning_fee_cents_per_day ?? 0) / 100,
  });
  const [form, setForm] = useState(initial);
  useEffect(() => setForm(initial()), [club.id, (club as any).host_court_fee_cents_per_hour, (club as any).host_cleaning_fee_cents_per_day]);
  const lock = useEditLock(() => setForm(initial()));

  const save = async (onDone?: () => void) => {
    try {
      await updateClub.mutateAsync({
        id: club.id,
        host_court_fee_cents_per_hour: Math.max(0, Math.round((form.hourly || 0) * 100)),
        host_cleaning_fee_cents_per_day: Math.max(0, Math.round((form.cleaning || 0) * 100)),
      } as any);
      toast.success("Hosting fees saved");
      onDone?.();
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    }
  };

  return (
    <Card className="p-4 space-y-4">
      <EditLock
        editing={lock.editing}
        onEdit={lock.edit}
        onCancel={lock.cancel}
        onSave={() => save(lock.done)}
        saving={updateClub.isPending}
        title="hosting fees"
      >
        <div>
          <h3 className="font-semibold text-sm">Hosting fees</h3>
          <p className="text-xs text-muted-foreground">
            What this club charges when it hosts a tournament. These rates feed the host compensation in the tournament fee split.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Court hosting fee ({symbol} per hour)</Label>
            <Input
              type="number" min={0} step="0.01" className="h-8 text-xs"
              value={form.hourly}
              onChange={(e) => setForm(p => ({ ...p, hourly: parseFloat(e.target.value) || 0 }))}
            />
            <p className="text-[11px] text-muted-foreground">Per court, per hour of tournament play.</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Cleaning fee ({symbol} per day)</Label>
            <Input
              type="number" min={0} step="0.01" className="h-8 text-xs"
              value={form.cleaning}
              onChange={(e) => setForm(p => ({ ...p, cleaning: parseFloat(e.target.value) || 0 }))}
            />
            <p className="text-[11px] text-muted-foreground">Charged once per tournament day.</p>
          </div>
        </div>
      </EditLock>
    </Card>
  );
}


export function CourtsSection({ clubId, relayDeviceType, mode }: { clubId: string; relayDeviceType: RelayDevice; mode: "list" | "relays" }) {

  const showRelays = mode === "relays";
  const qc = useQueryClient();
  const [newCourt, setNewCourt] = useState("");
  const [editingRelay, setEditingRelay] = useState<Record<number, string>>({});
  const [editingChannel, setEditingChannel] = useState<Record<number, string>>({});
  const [editingServer, setEditingServer] = useState<Record<number, string>>({});
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; court: { id: number; name: string } | null }>({ open: false, court: null });
  const [isDeleting, setIsDeleting] = useState(false);
  const [testingBle, setTestingBle] = useState<Record<number, boolean>>({});
  const { data: secrets } = useClubSecrets(clubId);

  const handleTestBle = async (court: { id: number; name: string } & Record<string, any>) => {
    const mac = court.relay_ble_mac as string | null;
    if (!mac) { toast.error("Save a BLE MAC for this court first"); return; }
    if (!isBleFallbackAvailable()) {
      toast.error("This device can't use Bluetooth — install the SquashHub app (iOS/Android) or open in Chrome on Android/desktop");
      return;
    }
    const s: any = secrets || {};
    setTestingBle(prev => ({ ...prev, [court.id]: true }));
    try {
      await pulseShellyBleAuto({
        mac,
        password: s.shelly_ble_control_password ?? undefined,
        channel: Number(court.relay_channel ?? 0),
        pulseMs: 3000, // short test pulse — do NOT bill or start a light session
        turn: "on",
      });
      toast.success(`${court.name} lights pulsed via Bluetooth (3s test)`);
    } catch (e: any) {
      toast.error(e?.message || "Bluetooth test failed");
    } finally {
      setTestingBle(prev => ({ ...prev, [court.id]: false }));
    }
  };



  const { data: courts = [], isLoading } = useQuery({
    queryKey: ["club-courts", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("courts").select("*").eq("club_id", clubId).eq("is_external", false).order("name");
      if (error) throw error;
      return data as { id: number; name: string; club_id: string; relay_device_id: string | null; relay_server: string | null; relay_channel?: number | null }[];
    },
  });

  const handleAdd = async () => {
    if (!newCourt.trim()) return;
    const { error } = await fromExt("courts").insert({ name: newCourt.trim(), club_id: clubId });
    if (error) toast.error(error.message);
    else { toast.success("Court added"); setNewCourt(""); qc.invalidateQueries({ queryKey: ["club-courts"] }); }
  };

  const requestDelete = (court: { id: number; name: string }) => {
    setDeleteDialog({ open: true, court });
  };

  const handleDelete = async () => {
    if (!deleteDialog.court) return;
    setIsDeleting(true);
    const { error } = await fromExt("courts").delete().eq("id", deleteDialog.court.id);
    setIsDeleting(false);
    setDeleteDialog({ open: false, court: null });
    if (error) toast.error(error.message);
    else { toast.success("Court removed"); qc.invalidateQueries({ queryKey: ["club-courts"] }); }
  };

  const handleSaveRelay = async (courtId: number, valueOverride?: string) => {
    const deviceId = (valueOverride ?? editingRelay[courtId] ?? "").trim();
    const { error } = await fromExt("courts").update({ relay_device_id: deviceId || null }).eq("id", courtId);
    if (error) toast.error(error.message);
    else {
      toast.success(deviceId ? `Relay saved: ${deviceId}` : "Relay cleared");
      setEditingRelay(prev => { const next = { ...prev }; delete next[courtId]; return next; });
      qc.invalidateQueries({ queryKey: ["club-courts"] });
    }
  };

  const handleSaveChannel = async (courtId: number, valueOverride?: string) => {
    const channel = Math.max(0, Math.min(3, parseInt((valueOverride ?? editingChannel[courtId] ?? "0").trim(), 10) || 0));
    const { error } = await fromExt("courts").update({ relay_channel: channel }).eq("id", courtId);
    if (error) toast.error(error.message);
    else {
      toast.success(`Relay output saved: ${channel}`);
      setEditingChannel(prev => { const next = { ...prev }; delete next[courtId]; return next; });
      qc.invalidateQueries({ queryKey: ["club-courts"] });
    }
  };

  const handleSaveServer = async (courtId: number, valueOverride?: string) => {
    const server = normalizeShellyServerInput(valueOverride ?? editingServer[courtId] ?? "");
    const { error } = await fromExt("courts").update({ relay_server: server || null }).eq("id", courtId);
    if (error) toast.error(error.message);
    else {
      toast.success(server ? `Shelly server saved: ${server}` : "Shelly server reset");
      setEditingServer(prev => { const next = { ...prev }; delete next[courtId]; return next; });
      qc.invalidateQueries({ queryKey: ["club-courts"] });
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <h3 className="font-semibold text-sm">
        {showRelays ? `Relay settings per court (${courts.length})` : `Your courts (${courts.length})`}
      </h3>
      <p className="text-[11px] text-muted-foreground">
        {showRelays
          ? "Each court from your list is shown below — enter its Shelly relay details here. Court names are managed on step 1."
          : "Just the names of the courts members can book. Shelly lighting hardware is managed from IoT / Shelly."}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {courts.map(c => {
          const courtId = c.id;
          const relayValue = editingRelay[courtId] ?? c.relay_device_id ?? "";
          const channelValue = editingChannel[courtId] ?? String(c.relay_channel ?? 0);
          const serverValue = editingServer[courtId] ?? c.relay_server ?? "https://shelly-44-eu.shelly.cloud";
          return (
            <div key={c.id} className="rounded-lg border p-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{c.name}</span>
                {!showRelays && (
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => requestDelete(c)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
              </div>
              {showRelays && (
                <div className="grid grid-cols-[1fr_76px_auto] gap-1 items-center">
                  <Input
                    value={relayValue}
                    onChange={e => setEditingRelay(prev => ({ ...prev, [courtId]: e.target.value }))}
                    onBlur={e => {
                      const v = e.target.value.trim();
                      if (editingRelay[courtId] !== undefined && v !== (c.relay_device_id ?? "")) {
                        handleSaveRelay(courtId, v);
                      }
                    }}
                    placeholder={relayDeviceType === "shelly" ? "Shelly Device ID (e.g. e8db84xxxxxx)" : "Relay Device ID"}
                    className="flex-1 text-xs h-7 font-mono"
                  />
                  <Input
                    type="number"
                    min={0}
                    max={3}
                    value={channelValue}
                    onChange={e => setEditingChannel(prev => ({ ...prev, [courtId]: e.target.value }))}
                    onBlur={e => {
                      const v = e.target.value.trim();
                      if (editingChannel[courtId] !== undefined && parseInt(v, 10) !== (c.relay_channel ?? 0)) {
                        handleSaveChannel(courtId, v);
                      }
                    }}
                    aria-label="Relay output channel"
                    title="Shelly output channel: use 0 for SW1/O1 and 1 for SW2/O2"
                    className="h-7 text-xs font-mono"
                  />
                  {editingRelay[courtId] !== undefined && (
                    <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => handleSaveRelay(courtId)}>
                      Save
                    </Button>
                  )}
                  {editingRelay[courtId] === undefined && editingChannel[courtId] !== undefined && (
                    <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => handleSaveChannel(courtId)}>
                      Save
                    </Button>
                  )}
                </div>
              )}
              {showRelays && (
                <Input
                  value={serverValue}
                  onChange={e => setEditingServer(prev => ({ ...prev, [courtId]: e.target.value }))}
                  onBlur={e => {
                    const v = normalizeShellyServerInput(e.target.value);
                    if (editingServer[courtId] !== undefined && v !== (c.relay_server ?? "https://shelly-44-eu.shelly.cloud")) {
                      handleSaveServer(courtId, v);
                    }
                  }}
                  placeholder="Shelly Server URI"
                  aria-label="Shelly Server URI"
                  className="h-7 text-[11px] font-mono"
                />
              )}
              {showRelays && (
                <Input
                  defaultValue={(c as any).relay_ble_mac ?? ""}
                  onBlur={async (e) => {
                    const v = e.target.value.trim().toUpperCase() || null;
                    if (v === ((c as any).relay_ble_mac ?? null)) return;
                    const { error } = await fromExt("courts").update({ relay_ble_mac: v }).eq("id", courtId);
                    if (error) toast.error(error.message);
                    else {
                      toast.success(v ? `BLE MAC saved: ${v}` : "BLE MAC cleared");
                      qc.invalidateQueries({ queryKey: ["club-courts"] });
                    }
                  }}
                  placeholder="BLE fallback MAC (e.g. AA:BB:CC:DD:EE:FF)"
                  aria-label="Court relay BLE MAC"
                  title="Bluetooth MAC of this court's Shelly relay — used as offline fallback"
                  className="h-7 text-[11px] font-mono"
                />
              )}
              {showRelays && (c as any).relay_ble_mac && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px] px-2 gap-1"
                  disabled={!!testingBle[courtId]}
                  onClick={() => handleTestBle(c as any)}
                  title="Send a 3-second Bluetooth pulse directly to this court's Shelly relay (bypasses cloud, no billing)"
                >
                  <Bluetooth className="w-3 h-3" />
                  {testingBle[courtId] ? "Pulsing…" : "Test BLE (3s)"}
                </Button>
              )}
              {showRelays && c.relay_device_id && editingRelay[courtId] === undefined && (
                <p className="text-[10px] text-muted-foreground">✅ Relay configured</p>
              )}

            </div>
          );
        })}
        {courts.length === 0 && !isLoading && <p className="text-xs text-muted-foreground col-span-2">No courts added yet</p>}
      </div>
      {!showRelays && (
      <div className="flex gap-2">
        <Input value={newCourt} onChange={e => setNewCourt(e.target.value)} placeholder="e.g. Court 1" className="flex-1 h-8 text-xs" onKeyDown={e => e.key === "Enter" && handleAdd()} />
        <Button size="sm" onClick={handleAdd}><Plus className="w-4 h-4 mr-1" />Add</Button>
      </div>
      )}
      <DeleteConfirmDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog(prev => ({ ...prev, open }))}
        title="Delete court?"
        description={deleteDialog.court ? `Are you sure you want to remove "${deleteDialog.court.name}"? This cannot be undone.` : ""}
        onConfirm={handleDelete}
        confirmLabel="Delete"
        isLoading={isDeleting}
      />
    </Card>
  );
}

function ExternalTournamentCourtsSection({ clubId }: { clubId: string }) {
  const qc = useQueryClient();
  const [venueName, setVenueName] = useState("");
  const [courtName, setCourtName] = useState("");
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; court: { id: number; name: string; venue: string } | null }>({ open: false, court: null });
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: courts = [], isLoading } = useQuery({
    queryKey: ["club-external-courts", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("courts")
        .select("id, name, venue_name")
        .eq("club_id", clubId)
        .eq("is_external", true)
        .order("venue_name")
        .order("name");
      if (error) throw error;
      return data as { id: number; name: string; venue_name: string | null }[];
    },
  });

  const handleAdd = async () => {
    const v = venueName.trim();
    const n = courtName.trim();
    if (!v || !n) {
      toast.error("Enter both a venue name and a court name");
      return;
    }
    const { error } = await fromExt("courts").insert({
      club_id: clubId,
      name: n,
      venue_name: v,
      is_external: true,
    });
    if (error) toast.error(error.message);
    else {
      toast.success(`Added ${v} — ${n}`);
      setCourtName("");
      qc.invalidateQueries({ queryKey: ["club-external-courts"] });
      qc.invalidateQueries({ queryKey: ["club-courts"] });
    }
  };

  const requestDelete = (court: { id: number; name: string; venue_name: string | null }) => {
    setDeleteDialog({ open: true, court: { id: court.id, name: court.name, venue: court.venue_name || "Unnamed venue" } });
  };

  const handleDelete = async () => {
    if (!deleteDialog.court) return;
    setIsDeleting(true);
    const { error } = await fromExt("courts").delete().eq("id", deleteDialog.court.id);
    setIsDeleting(false);
    setDeleteDialog({ open: false, court: null });
    if (error) toast.error(error.message);
    else {
      toast.success("External court removed");
      qc.invalidateQueries({ queryKey: ["club-external-courts"] });
      qc.invalidateQueries({ queryKey: ["club-courts"] });
    }
  };

  // Group by venue for display
  const grouped = courts.reduce<Record<string, typeof courts>>((acc, c) => {
    const key = c.venue_name || "Unnamed venue";
    (acc[key] ||= []).push(c);
    return acc;
  }, {});

  return (
    <Card className="p-4 space-y-3">
      <div>
        <h3 className="font-semibold text-sm">External / Tournament Venues ({courts.length})</h3>
        <p className="text-[11px] text-muted-foreground">
          Extra courts at other venues that your tournaments can use (e.g. a partner club). They appear only in tournament court pickers — never in normal bookings, ladder or challenges.
        </p>
      </div>

      {Object.keys(grouped).length > 0 && (
        <div className="space-y-2">
          {Object.entries(grouped).map(([venue, list]) => (
            <div key={venue} className="rounded-lg border p-2">
              <div className="text-xs font-semibold text-foreground mb-1.5">{venue}</div>
              <div className="flex flex-wrap gap-1.5">
                {list.map((c) => (
                  <div key={c.id} className="flex items-center gap-1 rounded-md border bg-muted/40 pl-2 pr-1 py-0.5">
                    <span className="text-xs">{c.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 text-destructive"
                      onClick={() => requestDelete(c)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {courts.length === 0 && !isLoading && (
        <p className="text-xs text-muted-foreground">No external courts yet. Add a venue and court below to make it selectable in your tournament wizard.</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
        <Input
          value={venueName}
          onChange={e => setVenueName(e.target.value)}
          placeholder="Venue name (e.g. White River Country Club)"
          className="h-8 text-xs"
        />
        <Input
          value={courtName}
          onChange={e => setCourtName(e.target.value)}
          placeholder="Court name (e.g. Court 1)"
          className="h-8 text-xs"
          onKeyDown={e => e.key === "Enter" && handleAdd()}
        />
        <Button size="sm" onClick={handleAdd}><Plus className="w-4 h-4 mr-1" />Add</Button>
      </div>
      <p className="text-[10px] text-muted-foreground">Tip: add each court at that venue as its own row (e.g. Court 1, Court 2, Court 3).</p>
      <DeleteConfirmDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog(prev => ({ ...prev, open }))}
        title="Delete external court?"
        description={deleteDialog.court ? `Remove "${deleteDialog.court.name}" from "${deleteDialog.court.venue}"? Past tournaments already scheduled on this court will not be affected.` : ""}
        onConfirm={handleDelete}
        confirmLabel="Delete"
        isLoading={isDeleting}
      />
    </Card>
  );
}
function CourtsBookingSystemList({ clubId, systemLabel }: { clubId: string; systemLabel: string }) {
  const { data: courts = [] } = useQuery({
    queryKey: ["club-courts", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("courts").select("id, name").eq("club_id", clubId).eq("is_external", false).order("name");
      if (error) throw error;
      return data as { id: number; name: string }[];
    },
  });

  if (courts.length === 0) {
    return <p className="text-[11px] text-muted-foreground">Add your courts above first — the booking system you pick applies to all of them.</p>;
  }

  return (
    <div className="rounded-lg border divide-y">
      {courts.map((c) => (
        <div key={c.id} className="flex items-center justify-between px-2 py-1.5">
          <span className="text-xs font-medium">{c.name}</span>
          <span className="text-[10px] rounded-full bg-primary/10 text-primary px-2 py-0.5">{systemLabel}</span>
        </div>
      ))}
    </div>
  );
}


const EXTERNAL_PROVIDERS = [
  { value: "none", label: "SquashHub bookings (this app)" },
  { value: "gobook", label: "GoBook", placeholder: "https://gobook.co.za/yourclub" },
  { value: "courtmanager", label: "Court Manager (self-hosted)", placeholder: "http://yourclub.mywire.org/yourclub/index.php" },
  { value: "sportyhq", label: "SportyHQ", placeholder: "https://www.sportyhq.com/club/yourclub" },
  { value: "courtbookings", label: "CourtBookings.co.za", placeholder: "https://www.courtbookings.co.za/yourclub" },
  { value: "squashman", label: "SquashMan", placeholder: "https://www.squashman.com/yourclub" },
  { value: "other", label: "Other", placeholder: "https://your-booking-system.example.com" },
] as const;

type ProviderValue = typeof EXTERNAL_PROVIDERS[number]["value"];

function ExternalBookingSection({ club, clubId }: { club: Club; clubId: string }) {
  const updateClub = useUpdateClub();

  // Resolve initial provider: prefer new field, fall back to legacy uses_gobook
  const initialProvider: ProviderValue =
    ((club as any).external_booking_provider as ProviderValue | null) ||
    ((club as any).uses_gobook ? "gobook" : "none");
  const initialUrl: string =
    (club as any).external_booking_url ?? (club as any).gobook_url ?? "";
  const initialLabel: string = (club as any).external_booking_label ?? "";

  const [form, setForm] = useState({
    provider: initialProvider,
    url: initialUrl,
    label: initialLabel,
  });

  useEffect(() => {
    setForm({
      provider:
        ((club as any).external_booking_provider as ProviderValue | null) ||
        ((club as any).uses_gobook ? "gobook" : "none"),
      url: (club as any).external_booking_url ?? (club as any).gobook_url ?? "",
      label: (club as any).external_booking_label ?? "",
    });
  }, [
    club.id,
    (club as any).external_booking_provider,
    (club as any).external_booking_url,
    (club as any).external_booking_label,
    (club as any).uses_gobook,
    (club as any).gobook_url,
  ]);

  const enabled = form.provider !== "none";
  const selected = EXTERNAL_PROVIDERS.find((p) => p.value === form.provider);
  const placeholder = (selected as any)?.placeholder ?? "https://your-booking-system.example.com";

  const handleSave = async () => {
    if (enabled) {
      if (!form.url.trim()) {
        toast.error("Please enter your booking URL");
        return;
      }
      try { new URL(form.url.trim()); } catch {
        toast.error("Please enter a valid URL (including https://)");
        return;
      }
      if (form.provider === "other" && !form.label.trim()) {
        toast.error("Please enter a display name for your booking system");
        return;
      }
    }

    const labelMap: Record<ProviderValue, string> = {
      none: "",
      gobook: "GoBook",
      courtmanager: "Court Manager",
      sportyhq: "SportyHQ",
      courtbookings: "CourtBookings.co.za",
      squashman: "SquashMan",
      other: form.label.trim(),
    };

    try {
      await updateClub.mutateAsync({
        id: clubId,
        external_booking_provider: enabled ? form.provider : null,
        external_booking_url: enabled ? form.url.trim() : null,
        external_booking_label: enabled ? labelMap[form.provider] : null,
        // Keep legacy fields in sync so older code paths still work
        uses_gobook: form.provider === "gobook",
        gobook_url: form.provider === "gobook" ? form.url.trim() : null,
      } as any);
      toast.success("External booking settings saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <div>
        <h3 className="font-semibold text-sm">Booking System</h3>
        <p className="text-xs text-muted-foreground">
          Choose how members book the courts listed above: use SquashHub's own booking grid, or send them to an external booking website (GoBook, Court Manager, etc.) where they book with their existing credentials.
        </p>
      </div>

      <CourtsBookingSystemList clubId={clubId} systemLabel={enabled ? (form.provider === "other" ? (form.label.trim() || "External system") : (selected?.label ?? "External system")) : "SquashHub bookings"} />


      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Provider</Label>
          <Select
            value={form.provider}
            onValueChange={(v: ProviderValue) => setForm((p) => ({ ...p, provider: v }))}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {EXTERNAL_PROVIDERS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {enabled && (
          <div className="space-y-1">
            <Label className="text-xs">Your club's booking URL</Label>
            <Input
              type="url"
              className="h-8 text-xs"
              value={form.url}
              onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))}
              placeholder={placeholder}
            />
          </div>
        )}
      </div>

      {enabled && form.provider === "other" && (
        <div className="space-y-1">
          <Label className="text-xs">Display name</Label>
          <Input
            className="h-8 text-xs"
            value={form.label}
            onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
            placeholder="e.g. CourtSide Bookings"
          />
        </div>
      )}

      {enabled && form.provider === "gobook" && (
        <>
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex gap-2">
            <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-[11px] text-muted-foreground">
                Your club uses{" "}
                <a href="https://www.gobook.co.za" target="_blank" rel="noopener noreferrer" className="underline text-primary font-medium">GoBook</a>{" "}
                for court bookings. SquashHub syncs with GoBook so members can book courts here.
              </p>
              <p className="text-[11px] text-muted-foreground">
                {(club as any).gobook_api_enabled
                  ? "API booking is active: members book straight from SquashHub and never enter GoBook credentials."
                  : "Until the API connection below is enabled, members must save their own GoBook login under My Account — and GoBook's new captcha may block that."}
              </p>
            </div>
          </div>
          <GoBookApiCard clubId={clubId} club={club} />
        </>
      )}

      {enabled && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 flex gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted-foreground">
            Bookings made on the external system won't appear inside SquashHub until that provider gives us API access. Members will record match results manually as usual.
          </p>
        </div>
      )}

      <Button size="sm" onClick={handleSave} disabled={updateClub.isPending}>
        {updateClub.isPending ? "Saving..." : "Save Booking System"}
      </Button>
    </Card>
  );
}
