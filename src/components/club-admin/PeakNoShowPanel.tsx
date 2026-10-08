import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Club } from "@/hooks/use-club";
import { isPeakSlot } from "@/lib/peak-hours";

/**
 * Possible no-shows: started peak bookings from the last 2 days (made after penalties
 * were switched on) with no penalty yet. Nothing is charged until an admin confirms.
 */
export function PeakNoShowPanel({ club }: { club: Club }) {
  const c = club as any;
  const active = !!c.peak_penalties_enabled && !!c.lights_integration_enabled && !!c.peak_penalties_enabled_at;
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["peak-no-shows", club.id],
    enabled: active,
    queryFn: async () => {
      const since = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);
      const [{ data: bookings }, { data: pens }] = await Promise.all([
        supabase.from("bookings").select("id, date, start_time, court_id, club_member_id, guest_name, status, created_at")
          .eq("club_id", club.id).gte("date", since).lte("date", today).neq("status", "cancelled")
          .gte("created_at", c.peak_penalties_enabled_at).not("club_member_id", "is", null).limit(500),
        (supabase.from as any)("booking_penalties").select("id, booking_id, kind, amount, status, booking_date, booking_start, court_id, club_member_id")
          .eq("club_id", club.id).order("created_at", { ascending: false }).limit(50),
      ]);
      const done = new Set((pens || []).map((p: any) => p.booking_id));
      const now = Date.now();
      const candidates = (bookings || []).filter((b: any) => {
        const d = new Date(`${b.date}T00:00:00`);
        return !done.has(b.id) && isPeakSlot(d, b.start_time, c) && new Date(`${b.date}T${b.start_time}`).getTime() <= now;
      });
      return { candidates, penalties: pens || [] };
    },
  });
  if (!active) return null;

  const confirm = async (id: string) => {
    if (!window.confirm("Confirm this member did not show? The no-show penalty will be charged to the original booker.")) return;
    const { error } = await (supabase.rpc as any)("admin_confirm_booking_no_show", { _booking_id: id, _note: null });
    if (error) return toast.error(error.message);
    toast.success("No-show recorded");
    qc.invalidateQueries({ queryKey: ["peak-no-shows", club.id] });
  };
  const waive = async (id: string) => {
    const reason = window.prompt("Reason for waiving this penalty (logged):");
    if (!reason?.trim()) return;
    const { error } = await (supabase.rpc as any)("admin_waive_booking_penalty", { _penalty_id: id, _reason: reason.trim() });
    if (error) return toast.error(error.message);
    toast.success("Penalty waived and reversed");
    qc.invalidateQueries({ queryKey: ["peak-no-shows", club.id] });
  };

  return (
    <Card className="p-4 space-y-3 lg:col-span-2">
      <div>
        <h3 className="font-semibold text-sm">Possible peak no-shows</h3>
        <p className="text-[11px] text-muted-foreground">Started peak bookings from the last two days. Check attendance before confirming — nothing is charged until you do.</p>
      </div>
      {(data?.candidates || []).length === 0 ? (
        <p className="text-[11px] text-muted-foreground">Nothing to review.</p>
      ) : (
        <div className="divide-y rounded-lg border">
          {data!.candidates.map((b: any) => (
            <div key={b.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
              <span>{b.date} {String(b.start_time).slice(0, 5)} · Court {b.court_id}</span>
              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => confirm(b.id)}>Confirm no-show</Button>
            </div>
          ))}
        </div>
      )}
      {(data?.penalties || []).length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold">Recent penalties & admin late cancellations</p>
          <div className="divide-y rounded-lg border">
            {data!.penalties.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                <span>
                  {p.booking_date} {String(p.booking_start || "").slice(0, 5)} · Court {p.court_id} ·{" "}
                  {p.kind === "no_show" ? "No-show" : p.kind === "late_cancel" ? "Late cancel" : "Admin late cancel"} · {p.amount} · {p.status}
                </span>
                {p.status === "charged" && (
                  <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => waive(p.id)}>Waive</Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
