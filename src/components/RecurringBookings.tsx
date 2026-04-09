import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Repeat, Plus, Trash2, Loader2 } from "lucide-react";
import { useRecurringBookings } from "@/hooks/use-analytics";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TIME_OPTIONS = (() => {
  const opts: string[] = [];
  for (let h = 6; h < 22; h++) {
    opts.push(`${String(h).padStart(2, "0")}:00`);
    opts.push(`${String(h).padStart(2, "0")}:30`);
  }
  return opts;
})();

export function RecurringBookings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: bookings, isLoading } = useRecurringBookings();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ day: "1", court: "1", start: "18:00", end: "18:30" });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not logged in");
      const { error } = await (supabase as any).from("recurring_bookings").insert({
        user_id: user.id,
        court_id: parseInt(form.court),
        day_of_week: parseInt(form.day),
        start_time: form.start + ":00",
        end_time: form.end + ":00",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring-bookings"] });
      toast.success("Recurring booking added");
      setAddOpen(false);
    },
    onError: (err: any) => toast.error(err.message || "Failed to add"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("recurring_bookings").update({ active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring-bookings"] });
      toast.success("Recurring booking removed");
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Repeat className="w-4 h-4 text-primary" />
          <p className="text-xs font-semibold font-heading">Recurring Bookings</p>
        </div>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setAddOpen(true)}>
          <Plus className="w-3 h-3" /> Add
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
        </div>
      ) : bookings && bookings.length > 0 ? (
        <div className="space-y-2">
          {bookings.map((b: any) => (
            <Card key={b.id}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{DAYS[b.day_of_week]} · {b.court_name || `Court ${b.court_id}`}</p>
                  <p className="text-xs text-muted-foreground">
                    {String(b.start_time).slice(0, 5)} - {String(b.end_time).slice(0, 5)}
                  </p>
                </div>
                <Badge variant="secondary" className="text-[9px]">Weekly</Badge>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => deleteMutation.mutate(b.id)}
                >
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-4 text-center">
          <p className="text-xs text-muted-foreground">No recurring bookings. Add one to auto-book weekly.</p>
        </Card>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading">New Recurring Booking</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Day</Label>
              <Select value={form.day} onValueChange={(v) => setForm((f) => ({ ...f, day: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DAYS.map((d, i) => (
                    <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Court</Label>
              <Select value={form.court} onValueChange={(v) => setForm((f) => ({ ...f, court: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Court 1</SelectItem>
                  <SelectItem value="2">Court 2</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Start</Label>
                <Select value={form.start} onValueChange={(v) => setForm((f) => ({ ...f, start: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TIME_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">End</Label>
                <Select value={form.end} onValueChange={(v) => setForm((f) => ({ ...f, end: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TIME_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={() => addMutation.mutate()} disabled={addMutation.isPending}>
              {addMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
