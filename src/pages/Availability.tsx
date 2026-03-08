import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Clock, CalendarDays, Users } from "lucide-react";
import { toast } from "sonner";
import {
  useMyAvailability,
  useAddAvailability,
  useRemoveAvailability,
  DAY_NAMES,
  type AvailabilitySlot,
} from "@/hooks/use-availability";

const TIME_OPTIONS: string[] = [];
for (let h = 6; h <= 21; h++) {
  for (const m of ["00", "30"]) {
    TIME_OPTIONS.push(`${String(h).padStart(2, "0")}:${m}`);
  }
}

function formatTime(t: string) {
  const [h, m] = t.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${m} ${ampm}`;
}

const DAY_COLORS = [
  "bg-red-500/10 text-red-600",
  "bg-blue-500/10 text-blue-600",
  "bg-green-500/10 text-green-600",
  "bg-purple-500/10 text-purple-600",
  "bg-orange-500/10 text-orange-600",
  "bg-pink-500/10 text-pink-600",
  "bg-cyan-500/10 text-cyan-600",
];

export default function Availability() {
  const { user } = useAuth();
  const { data: slots, isLoading } = useMyAvailability();
  const addSlot = useAddAvailability();
  const removeSlot = useRemoveAvailability();

  const [showAdd, setShowAdd] = useState(false);
  const [day, setDay] = useState("1");
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("19:00");

  const handleAdd = async () => {
    if (startTime >= endTime) {
      toast.error("End time must be after start time");
      return;
    }
    try {
      await addSlot.mutateAsync({
        dayOfWeek: parseInt(day),
        startTime,
        endTime,
      });
      toast.success("Availability added");
      setShowAdd(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to add");
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await removeSlot.mutateAsync(id);
      toast.success("Slot removed");
    } catch {
      toast.error("Failed to remove");
    }
  };

  // Group by day
  const byDay = new Map<number, AvailabilitySlot[]>();
  for (const slot of (slots || [])) {
    if (!byDay.has(slot.day_of_week)) byDay.set(slot.day_of_week, []);
    byDay.get(slot.day_of_week)!.push(slot);
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <PageHeader title="My Availability" />

      <div className="px-4 space-y-5 max-w-lg mx-auto">
        {/* Info */}
        <motion.div
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="rounded-xl bg-primary/5 border border-primary/20 p-4"
        >
          <div className="flex gap-3">
            <CalendarDays className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Set your weekly availability</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Other players will see when you're free, making it easier to schedule challenges and book courts together.
              </p>
            </div>
          </div>
        </motion.div>

        {/* Add Slot */}
        <AnimatePresence>
          {showAdd && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Add Time Slot</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Day</label>
                    <Select value={day} onValueChange={setDay}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DAY_NAMES.map((name, idx) => (
                          <SelectItem key={idx} value={String(idx)}>{name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Start</label>
                      <Select value={startTime} onValueChange={setStartTime}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TIME_OPTIONS.map(t => (
                            <SelectItem key={t} value={t}>{formatTime(t)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">End</label>
                      <Select value={endTime} onValueChange={setEndTime}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TIME_OPTIONS.map(t => (
                            <SelectItem key={t} value={t}>{formatTime(t)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleAdd} disabled={addSlot.isPending} size="sm" className="flex-1">
                      Save
                    </Button>
                    <Button onClick={() => setShowAdd(false)} variant="outline" size="sm">
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {!showAdd && (
          <Button onClick={() => setShowAdd(true)} variant="outline" className="w-full gap-2">
            <Plus className="w-4 h-4" />
            Add Time Slot
          </Button>
        )}

        {/* Slots by Day */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
          </div>
        ) : (
          <div className="space-y-2">
            {(slots || []).length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">No availability set</p>
                <p className="text-xs mt-1">Add your weekly free times above</p>
              </div>
            )}

            {[...byDay.entries()]
              .sort((a, b) => a[0] - b[0])
              .map(([dayIdx, daySlots]) => (
                <div key={dayIdx}>
                  <p className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                    {DAY_NAMES[dayIdx]}
                  </p>
                  <div className="space-y-1.5">
                    {daySlots.map(slot => (
                      <motion.div
                        key={slot.id}
                        layout
                        className="flex items-center justify-between p-3 rounded-lg bg-card border border-border"
                      >
                        <div className="flex items-center gap-2">
                          <Badge className={`text-[10px] px-1.5 ${DAY_COLORS[dayIdx]}`} variant="secondary">
                            {DAY_NAMES[dayIdx].slice(0, 3)}
                          </Badge>
                          <div className="flex items-center gap-1 text-sm">
                            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                            <span>{formatTime(slot.start_time)} – {formatTime(slot.end_time)}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemove(slot.id)}
                          className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </motion.div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
