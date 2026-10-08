/** The booking table's existing peak marker, shared with the view-only display. */
export function PeakTimeIndicator() {
  return (
    <span
      className="absolute top-0.5 right-1 text-[9px] font-bold leading-none px-1 py-0.5 rounded bg-peak-indicator/80 text-peak-indicator-foreground"
      title="Peak time"
    >
      P
    </span>
  );
}