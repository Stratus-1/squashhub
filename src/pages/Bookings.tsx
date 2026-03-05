import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { format, addDays, subDays } from "date-fns";
import { useBookings, useCreateBooking } from "@/hooks/use-data";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const timeSlots = [
  "06:00", "07:00", "08:00", "09:00", "10:00", "11:00",
  "12:00", "13:00", "14:00", "15:00", "16:00", "17:00",
  "18:00", "19:00", "20:00", "21:00",
];

const courts = [1, 2];

export default function Bookings() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [bookingDialog, setBookingDialog] = useState<{ courtId: number; time: string } | null>(null);
  const { user } = useAuth();

  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const { data: bookings, isLoading } = useBookings(dateStr);
  const createBooking = useCreateBooking();

  const getBooking = (courtId: number, time: string) => {
    return bookings?.find(
      (b) => b.court_id === courtId && b.start_time === time + ":00"
    );
  };

  const handleBook = async () => {
    if (!bookingDialog) return;
    const endHour = parseInt(bookingDialog.time.split(":")[0]) + 1;
    const endTime = `${endHour.toString().padStart(2, "0")}:00`;

    try {
      await createBooking.mutateAsync({
        courtId: bookingDialog.courtId,
        date: dateStr,
        startTime: bookingDialog.time + ":00",
        endTime: endTime + ":00",
      });
      toast.success("Court booked!");
      setBookingDialog(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to book");
    }
  };

  return (
    <div className="bottom-nav-safe">
      <PageHeader title="Court Bookings" subtitle="Book your court" />

      {/* Date Selector */}
      <div className="flex items-center justify-between px-4 mt-2">
        <Button variant="ghost" size="icon" onClick={() => setSelectedDate(subDays(selectedDate, 1))}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <span className="text-sm font-semibold font-heading">
          {format(selectedDate, "EEEE, d MMM")}
        </span>
        <Button variant="ghost" size="icon" onClick={() => setSelectedDate(addDays(selectedDate, 1))}>
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>

      {/* Court Headers */}
      <div className="grid grid-cols-[60px_1fr_1fr] gap-2 px-4 mt-4 mb-2">
        <div />
        {courts.map((c) => (
          <div key={c} className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Court {c}
          </div>
        ))}
      </div>

      {/* Time Grid */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <motion.div
          className="px-4 space-y-1 mb-20"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          {timeSlots.map((time) => (
            <div key={time} className="grid grid-cols-[60px_1fr_1fr] gap-2">
              <div className="text-xs text-muted-foreground flex items-center justify-end pr-2 font-medium">
                {time}
              </div>
              {courts.map((courtId) => {
                const booking = getBooking(courtId, time);
                const playerName = booking?.player_name || "Booked";

                return (
                  <Card
                    key={courtId}
                    className={cn(
                      "h-12 flex items-center justify-center text-xs cursor-pointer transition-colors",
                      booking
                        ? "bg-primary/10 border-primary/30"
                        : "hover:bg-secondary/80 border-dashed"
                    )}
                    onClick={() => {
                      if (!booking) {
                        setBookingDialog({ courtId, time });
                      }
                    }}
                  >
                    {booking ? (
                      <p className="font-medium text-primary text-[11px] truncate px-1">
                        {booking.player_name?.split(" ")[0]}
                      </p>
                    ) : (
                      <span className="text-muted-foreground/50 text-[10px]">Available</span>
                    )}
                  </Card>
                );
              })}
            </div>
          ))}
        </motion.div>
      )}

      {/* Booking Confirmation Dialog */}
      <Dialog open={!!bookingDialog} onOpenChange={() => setBookingDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading">Confirm Booking</DialogTitle>
          </DialogHeader>
          {bookingDialog && (
            <div className="space-y-3 py-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Court</span>
                <span className="font-medium">Court {bookingDialog.courtId}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Date</span>
                <span className="font-medium">{format(selectedDate, "d MMM yyyy")}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Time</span>
                <span className="font-medium">
                  {bookingDialog.time} - {(parseInt(bookingDialog.time) + 1).toString().padStart(2, "0")}:00
                </span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBookingDialog(null)}>Cancel</Button>
            <Button onClick={handleBook} disabled={createBooking.isPending}>
              {createBooking.isPending ? "Booking..." : "Book Court"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
