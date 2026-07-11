import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { format } from "date-fns";
import { Wrench, Loader2, Camera, Repeat } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useMemberContext } from "@/contexts/MemberContext";

type Court = { id: number; name: string };

const PURPOSES = [
  { value: "cleaning", label: "Cleaning" },
  { value: "maintenance", label: "Maintenance" },
  { value: "inspection", label: "Inspection" },
  { value: "other", label: "Other" },
] as const;

const DURATIONS = [30, 60, 90, 120] as const;

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function addMinutes(hhmm: string, mins: number) {
  const [h, m] = hhmm.split(":").map(Number);
  const t = h * 60 + m + mins;
  const h2 = Math.floor(t / 60) % 24;
  const m2 = t % 60;
  return `${String(h2).padStart(2, "0")}:${String(m2).padStart(2, "0")}`;
}

export function OpsBookingDialog({
  open,
  onOpenChange,
  clubId,
  courts,
  defaultDate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clubId: string;
  courts: Court[];
  defaultDate: Date;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { activeMember } = useMemberContext();

  const [courtId, setCourtId] = useState<number | null>(courts[0]?.id ?? null);
  const [dateStr, setDateStr] = useState(format(defaultDate, "yyyy-MM-dd"));
  const [startTime, setStartTime] = useState(format(new Date(), "HH:mm"));
  const [duration, setDuration] = useState<number>(60);
  const [purpose, setPurpose] = useState<"cleaning" | "maintenance" | "inspection" | "other">("cleaning");
  const [note, setNote] = useState("");
  const [lightsOn, setLightsOn] = useState(true);
  const [photo, setPhoto] = useState<File | null>(null);
  const [recurring, setRecurring] = useState(false);
  const [dayOfWeek, setDayOfWeek] = useState<number>(new Date().getDay());
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setNote("");
    setPhoto(null);
    setRecurring(false);
  };

  // Ensure a court is selected once courts arrive (or when they change)
  useEffect(() => {
    if (courts.length > 0 && (courtId == null || !courts.some((c) => c.id === courtId))) {
      setCourtId(courts[0].id);
    }
  }, [courts, courtId]);

  const submit = async () => {
    if (!user?.id) {
      toast.error("You must be signed in");
      return;
    }
    if (!courtId) {
      toast.error("Please pick a court");
      return;
    }
    setSubmitting(true);
    try {
      // Upload photo if provided
      let photoUrl: string | null = null;
      if (photo) {
        const ext = photo.name.split(".").pop() || "jpg";
        const path = `${clubId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("ops-booking-photos")
          .upload(path, photo, { upsert: false });
        if (upErr) throw upErr;
        photoUrl = path;
      }

      const endTime = addMinutes(startTime, duration);

      const { error } = await (supabase as any).from("bookings").insert({
        club_id: clubId,
        court_id: courtId,
        date: dateStr,
        start_time: `${startTime}:00`,
        end_time: `${endTime}:00`,
        user_id: user.id,
        club_member_id: activeMember?.id ?? null,
        booking_type: "ops",
        ops_purpose: purpose,
        ops_note: note || null,
        ops_photo_url: photoUrl,
        guest_name: `🔧 ${purpose.charAt(0).toUpperCase() + purpose.slice(1)}`,
        is_friendly: true,
        lights_requested: lightsOn,
        light_fee_split: "none",
        status: "active",
        source: "squashhub",
      });
      if (error) throw error;

      if (recurring) {
        const { error: recErr } = await (supabase as any).from("recurring_bookings").insert({
          club_id: clubId,
          court_id: courtId,
          user_id: user.id,
          day_of_week: dayOfWeek,
          start_time: `${startTime}:00`,
          end_time: `${endTime}:00`,
          booking_type: "ops",
          ops_purpose: purpose,
          ops_note: note || null,
        });
        if (recErr) console.warn("Recurring insert failed:", recErr);
      }

      toast.success("Ops booking created — no charge posted");
      qc.invalidateQueries({ queryKey: ["bookings"] });
      reset();
      onOpenChange(false);
    } catch (e: any) {
      if (e?.code === "23505") {
        toast.error("Court already booked for that slot");
      } else {
        toast.error(e?.message || "Failed to create ops booking");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-amber-600" />
            Maintenance / Cleaning booking
          </DialogTitle>
          <DialogDescription>
            Blocks the court for facility work. No charge is posted to any member.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Court</Label>
              <Select value={String(courtId ?? "")} onValueChange={(v) => setCourtId(Number(v))}>
                <SelectTrigger><SelectValue placeholder="Court" /></SelectTrigger>
                <SelectContent>
                  {courts.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reason</Label>
              <Select value={purpose} onValueChange={(v: any) => setPurpose(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PURPOSES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Date</Label>
              <Input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
            </div>
            <div>
              <Label>Start</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div>
              <Label>Duration</Label>
              <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((d) => (
                    <SelectItem key={d} value={String(d)}>{d} min</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Note (optional)</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Deep clean, replace bulbs, wall repair…" />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label className="flex items-center gap-2 cursor-pointer">
                Turn court lights on
              </Label>
              <p className="text-xs text-muted-foreground">No fee posted, regardless.</p>
            </div>
            <Switch checked={lightsOn} onCheckedChange={setLightsOn} />
          </div>

          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2 cursor-pointer">
                <Repeat className="w-4 h-4" />
                Repeat weekly
              </Label>
              <Switch checked={recurring} onCheckedChange={setRecurring} />
            </div>
            {recurring && (
              <Select value={String(dayOfWeek)} onValueChange={(v) => setDayOfWeek(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DAY_LABELS.map((d, i) => (
                    <SelectItem key={i} value={String(i)}>Every {d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div>
            <Label className="flex items-center gap-2">
              <Camera className="w-4 h-4" />
              Photo (optional)
            </Label>
            <Input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => setPhoto(e.target.files?.[0] || null)}
            />
            {photo && <p className="text-xs text-muted-foreground mt-1">Selected: {photo.name}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || !courtId}>
            {submitting && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Create ops booking
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
