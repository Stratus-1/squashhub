import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { todayBookings, timeSlots } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { format, addDays, subDays } from "date-fns";

export default function Bookings() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const courts = [1, 2];

  const getBooking = (courtId: number, time: string) => {
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    return todayBookings.find(
      (b) => b.courtId === courtId && b.startTime === time && b.date === dateStr
    );
  };

  const dateStr = format(selectedDate, "EEEE, d MMM");

  return (
    <div className="bottom-nav-safe">
      <PageHeader title="Court Bookings" subtitle="Book your court" />

      {/* Date Selector */}
      <div className="flex items-center justify-between px-4 mt-2">
        <Button variant="ghost" size="icon" onClick={() => setSelectedDate(subDays(selectedDate, 1))}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <span className="text-sm font-semibold font-heading">{dateStr}</span>
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
      <motion.div
        className="px-4 space-y-1 mb-4"
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
              return (
                <Card
                  key={courtId}
                  className={cn(
                    "h-12 flex items-center justify-center text-xs cursor-pointer transition-colors",
                    booking
                      ? "bg-primary/10 border-primary/30"
                      : "hover:bg-secondary/80 border-dashed"
                  )}
                >
                  {booking ? (
                    <div className="text-center">
                      <p className="font-medium text-primary text-[11px]">{booking.playerName.split(" ")[0]}</p>
                    </div>
                  ) : (
                    <span className="text-muted-foreground/50 text-[10px]">Available</span>
                  )}
                </Card>
              );
            })}
          </div>
        ))}
      </motion.div>

      {/* Book Button */}
      <div className="fixed bottom-[4.5rem] left-0 right-0 p-4 bg-gradient-to-t from-background to-transparent">
        <Button className="w-full font-heading" size="lg">
          Book a Court
        </Button>
      </div>
    </div>
  );
}
