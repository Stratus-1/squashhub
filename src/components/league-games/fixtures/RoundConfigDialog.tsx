import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarIcon } from "lucide-react";
import { toast } from "sonner";

export type RoundDraft = {
  id?: string;
  round_number: number;
  name: string;
  round_date: string;       // start date yyyy-MM-dd
  end_date: string;         // end date yyyy-MM-dd
  venue_name: string;
  court_ids: number[];
  start_time: string;
  end_time: string;
  slot_minutes: number;
  play_dows: number[];      // 0=Sun..6=Sat; empty = any day
  notes?: string | null;
  auto_create_bookings?: boolean;
};

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clubId: string;
  associationId: string;
  initial?: Partial<RoundDraft>;
  onSave: (r: RoundDraft) => Promise<void> | void;
};

export function RoundConfigDialog({ open, onOpenChange, clubId, associationId, initial, onSave }: Props) {
  const { data: courts } = useQuery({
    queryKey: ["club-courts-for-rounds", clubId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courts")
        .select("id, name")
        .eq("club_id", clubId)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!clubId && open,
  });

  // Venue options: this club + any other clubs participating in the same association
  const { data: venueOptions } = useQuery({
    queryKey: ["round-venue-options", clubId, associationId],
    queryFn: async () => {
      const names = new Set<string>();
      const { data: myClub } = await supabase.from("clubs").select("name").eq("id", clubId).maybeSingle();
      if (myClub?.name) names.add(myClub.name);
      const { data: assocClubs } = await fromExt("leagues")
        .select("clubs(name)")
        .eq("association_id", associationId);
      (assocClubs ?? []).forEach((row: any) => row?.clubs?.name && names.add(row.clubs.name));
      return Array.from(names);
    },
    enabled: open && !!clubId && !!associationId,
  });

  const today = new Date().toISOString().slice(0, 10);
  const [draft, setDraft] = useState<RoundDraft>({
    round_number: initial?.round_number ?? 1,
    name: initial?.name ?? "Round 1",
    round_date: initial?.round_date ?? today,
    end_date: initial?.end_date ?? initial?.round_date ?? today,
    venue_name: initial?.venue_name ?? "",
    court_ids: initial?.court_ids ?? [],
    start_time: initial?.start_time ?? "18:00",
    end_time: initial?.end_time ?? "20:00",
    slot_minutes: initial?.slot_minutes ?? 120,
    play_dows: initial?.play_dows ?? [],
    notes: initial?.notes ?? "",
    auto_create_bookings: initial?.auto_create_bookings ?? true,
    id: initial?.id,
  });

  useEffect(() => {
    if (open && initial) {
      setDraft((d) => ({
        ...d,
        ...initial,
        end_date: initial.end_date ?? initial.round_date ?? d.end_date,
      } as RoundDraft));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Default venue to user's club (first option) if not yet set
  useEffect(() => {
    if (open && !draft.venue_name && venueOptions?.length) {
      setDraft((d) => ({ ...d, venue_name: venueOptions[0] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, venueOptions]);

  const toggleCourt = (id: number) =>
    setDraft((d) => ({
      ...d,
      court_ids: d.court_ids.includes(id) ? d.court_ids.filter((x) => x !== id) : [...d.court_ids, id],
    }));

  const [saving, setSaving] = useState(false);
  const datesInvalid = draft.end_date < draft.round_date;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{draft.id ? "Edit round" : "Add round"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Round #</Label>
              <Input
                type="number"
                min={1}
                value={draft.round_number}
                onChange={(e) => setDraft({ ...draft, round_number: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Name</Label>
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>From date</Label>
              <div className="relative">
                <Input
                  type="date"
                  className="pr-9 cursor-pointer"
                  value={draft.round_date}
                  onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDraft((d) => ({
                      ...d,
                      round_date: v,
                      end_date: d.end_date < v ? v : d.end_date,
                    }));
                  }}
                />
                <CalendarIcon className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
              </div>
            </div>
            <div>
              <Label>To date</Label>
              <div className="relative">
                <Input
                  type="date"
                  min={draft.round_date}
                  className="pr-9 cursor-pointer"
                  value={draft.end_date}
                  onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
                  onChange={(e) => setDraft({ ...draft, end_date: e.target.value })}
                />
                <CalendarIcon className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
              </div>
            </div>
          </div>
          {datesInvalid && (
            <p className="text-xs text-destructive">End date must be on or after start date.</p>
          )}
          <div>
            <Label>Venue</Label>
            <Select value={draft.venue_name} onValueChange={(v) => setDraft({ ...draft, venue_name: v })}>
              <SelectTrigger><SelectValue placeholder="Select venue" /></SelectTrigger>
              <SelectContent>
                {(venueOptions ?? []).map((n) => (
                  <SelectItem key={n} value={n}>{n}</SelectItem>
                ))}
                <SelectItem value="__custom__">Other / custom…</SelectItem>
              </SelectContent>
            </Select>
            {draft.venue_name === "__custom__" && (
              <Input
                className="mt-2"
                placeholder="Enter venue name"
                onChange={(e) => setDraft({ ...draft, venue_name: e.target.value })}
              />
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Start</Label>
              <Input type="time" value={draft.start_time} onChange={(e) => setDraft({ ...draft, start_time: e.target.value })} />
            </div>
            <div>
              <Label>End</Label>
              <Input type="time" value={draft.end_time} onChange={(e) => setDraft({ ...draft, end_time: e.target.value })} />
            </div>
            <div>
              <Label>Slot (min)</Label>
              <Input
                type="number"
                min={15}
                step={5}
                value={draft.slot_minutes}
                onChange={(e) => setDraft({ ...draft, slot_minutes: Number(e.target.value) })}
              />
            </div>
          </div>
          <div>
            <Label>Play days</Label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {DOW_LABELS.map((lbl, i) => {
                const active = draft.play_dows.includes(i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        play_dows: active
                          ? d.play_dows.filter((x) => x !== i)
                          : [...d.play_dows, i].sort((a, b) => a - b),
                      }))
                    }
                    className={`px-2.5 py-1 rounded text-xs border transition ${
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-muted border-border"
                    }`}
                  >
                    {lbl}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Select which weekdays fixtures may be scheduled on. Leave all unselected to allow any day.
            </p>
          </div>
          <div>
            <Label>Courts</Label>
            <div className="grid grid-cols-2 gap-2 mt-1 max-h-40 overflow-auto rounded border p-2">
              {(courts ?? []).map((c: any) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={draft.court_ids.includes(c.id)}
                    onCheckedChange={() => toggleCourt(c.id)}
                  />
                  {c.name}
                </label>
              ))}
              {!courts?.length && <p className="text-xs text-muted-foreground">No courts found</p>}
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              value={draft.notes ?? ""}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              rows={2}
            />
          </div>
          <label className="flex items-start gap-2 text-sm rounded border p-2 bg-muted/30 cursor-pointer">
            <Checkbox
              checked={!!draft.auto_create_bookings}
              onCheckedChange={(v) => setDraft({ ...draft, auto_create_bookings: !!v })}
            />
            <span>
              <span className="font-medium">Auto-create court bookings</span>
              <span className="block text-xs text-muted-foreground">
                When fixtures are saved for this round, automatically block off the selected courts at the scheduled times.
              </span>
            </span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={saving}
            onClick={async () => {
              if (datesInvalid) { toast.error("End date must be on or after start date."); return; }
              if (!draft.name?.trim()) { toast.error("Please enter a round name."); return; }
              if (!draft.round_date || !draft.end_date) { toast.error("Please pick start and end dates."); return; }
              if (!draft.venue_name?.trim() || draft.venue_name === "__custom__") { toast.error("Please select a venue."); return; }
              if (!draft.court_ids.length) { toast.error("Please select at least one court."); return; }
              setSaving(true);
              try {
                await onSave(draft);
                onOpenChange(false);
              } catch (e: any) {
                toast.error(e?.message ?? "Could not save round");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving…" : "Save round"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
