import { FixtureCalendar } from "./FixtureCalendar";
import { categoryCalendar, type CategoryCalendarFixture } from "@/lib/tournaments/category-calendar";
import { cn } from "@/lib/utils";

export function CategoryFixtureCalendar({ fixtures, group, category }: { fixtures: CategoryCalendarFixture[]; group: number; category: string }) {
  const { events, unscheduled } = categoryCalendar(fixtures, group);
  return <div className="space-y-2 text-xs" data-testid="category-fixture-calendar">
    <div className="flex flex-wrap gap-3 text-muted-foreground">
      <span className="font-semibold text-foreground">All tournament fixtures</span>
      <span className="flex items-center gap-1"><span className="h-3 w-4 rounded-sm border border-success bg-success/20" />{category}</span>
      <span>Other categories</span>
    </div>
    <FixtureCalendar events={events} />
    {unscheduled.length > 0 && <section className="space-y-1">
      <h4 className="font-semibold">Not scheduled · {unscheduled.length}</h4>
      <ul className="divide-y divide-border">{unscheduled.map((f) => <li key={f.id} className={cn("flex flex-wrap gap-x-3 gap-y-1 px-2 py-1.5", f.group === group && "border-l-2 border-success bg-success/15")}>
        <span className="font-medium">{f.title}</span><span className="text-muted-foreground">{f.subtitle}</span>
      </li>)}</ul>
    </section>}
  </div>;
}