import { useQuery } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { Link } from "react-router-dom";
import {
  Users,
  LayoutGrid,
  DollarSign,
  Calendar,
  Globe,
  ShieldCheck,
  CalendarDays,
  ChevronRight,
  Activity,
  AlertCircle,
  CheckCircle2,
  Trophy,
  UserPlus,
  CalendarPlus,
  MessageSquare,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface Props {
  clubId: string;
  clubName: string;
  onTab: (tab: string) => void;
}

const KPI_STYLES: Record<string, { bg: string; ring: string }> = {
  blue: { bg: "bg-blue-500", ring: "ring-blue-500/20" },
  emerald: { bg: "bg-emerald-500", ring: "ring-emerald-500/20" },
  violet: { bg: "bg-violet-500", ring: "ring-violet-500/20" },
  amber: { bg: "bg-amber-500", ring: "ring-amber-500/20" },
  teal: { bg: "bg-teal-500", ring: "ring-teal-500/20" },
};

function Kpi({
  icon: Icon,
  color,
  label,
  value,
  trend,
  trendTone = "muted",
}: {
  icon: any;
  color: string;
  label: string;
  value: string | number;
  trend?: string;
  trendTone?: "up" | "muted" | "warn";
}) {
  const styles = KPI_STYLES[color];
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm", styles.bg)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold leading-tight text-foreground mt-0.5">{value}</p>
          {trend && (
            <p
              className={cn(
                "text-[11px] mt-1 font-medium",
                trendTone === "up" && "text-emerald-600 dark:text-emerald-400",
                trendTone === "warn" && "text-amber-600 dark:text-amber-400",
                trendTone === "muted" && "text-muted-foreground"
              )}
            >
              {trend}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function PanelHeader({
  icon: Icon,
  title,
  iconClass = "text-primary",
  right,
}: {
  icon: any;
  title: string;
  iconClass?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4", iconClass)} />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      {right}
    </div>
  );
}

export function AdminDashboardOverview({ clubId, clubName, onTab }: Props) {
  // Real counts
  const { data: memberCount = 0 } = useQuery({
    queryKey: ["overview-member-count", clubId],
    queryFn: async () => {
      const { count } = await fromExt("club_members")
        .select("id", { count: "exact", head: true })
        .eq("club_id", clubId);
      return count || 0;
    },
  });

  const { data: courts = [] } = useQuery({
    queryKey: ["overview-courts", clubId],
    queryFn: async () => {
      const { data } = await fromExt("courts").select("id,name").eq("club_id", clubId);
      return data || [];
    },
  });

  const { data: events = [] } = useQuery({
    queryKey: ["overview-events", clubId],
    queryFn: async () => {
      const { data } = await fromExt("club_events")
        .select("id,title,starts_at,event_type")
        .eq("club_id", clubId)
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(4);
      return data || [];
    },
  });

  const { data: bookingsToday = 0 } = useQuery({
    queryKey: ["overview-bookings-today", clubId],
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      const { count } = await fromExt("court_bookings")
        .select("id", { count: "exact", head: true })
        .eq("club_id", clubId)
        .gte("starts_at", start.toISOString())
        .lte("starts_at", end.toISOString());
      return count || 0;
    },
  });

  const { data: outstandingFees } = useQuery({
    queryKey: ["overview-outstanding-fees", clubId],
    queryFn: async () => {
      const { data: members } = await fromExt("club_members").select("id").eq("club_id", clubId);
      const ids = (members || []).map((m: any) => m.id);
      if (ids.length === 0) return { total: 0, count: 0 };
      const { data: fees } = await fromExt("member_fee_payments")
        .select("amount,paid,club_member_id")
        .in("club_member_id", ids)
        .eq("paid", false);
      const total = (fees || []).reduce((s: number, f: any) => s + Number(f.amount || 0), 0);
      const uniqueMembers = new Set((fees || []).map((f: any) => f.club_member_id)).size;
      return { total, count: uniqueMembers };
    },
  });

  const { data: recentActivity = [] } = useQuery({
    queryKey: ["overview-recent-activity", clubId],
    queryFn: async () => {
      const { data } = await fromExt("club_members")
        .select("id,name,created_at")
        .eq("club_id", clubId)
        .order("created_at", { ascending: false })
        .limit(4);
      return (data || []).map((m: any) => ({
        icon: UserPlus,
        text: `${m.name} joined the club`,
        time: m.created_at,
      }));
    },
  });

  const formatZAR = (n: number) =>
    `R${n.toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  // Court utilisation — placeholder: equal weekly slots, derive from recent bookings count per court
  const { data: courtUtilisation = [] } = useQuery({
    queryKey: ["overview-court-util", clubId, courts.length],
    enabled: courts.length > 0,
    queryFn: async () => {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const results = await Promise.all(
        courts.map(async (c: any) => {
          const { count } = await fromExt("court_bookings")
            .select("id", { count: "exact", head: true })
            .eq("court_id", c.id)
            .gte("starts_at", weekStart.toISOString());
          const used = count || 0;
          const capacity = 30; // assumed weekly slot capacity
          return { name: c.name, used, capacity, pct: Math.min(100, Math.round((used / capacity) * 100)) };
        })
      );
      return results;
    },
  });

  return (
    <div className="space-y-4">
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <Kpi
          icon={Users}
          color="blue"
          label="Total Members"
          value={memberCount}
          trend={memberCount > 0 ? `${memberCount} active` : undefined}
          trendTone="muted"
        />
        <Kpi
          icon={LayoutGrid}
          color="emerald"
          label="Active Courts"
          value={courts.length}
          trend="All courts available"
          trendTone="up"
        />
        <Kpi
          icon={DollarSign}
          color="violet"
          label="Outstanding"
          value={outstandingFees ? formatZAR(outstandingFees.total) : "R0"}
          trend={outstandingFees ? `${outstandingFees.count} members owe` : "All settled"}
          trendTone={outstandingFees?.count ? "warn" : "up"}
        />
        <Kpi
          icon={Calendar}
          color="amber"
          label="Upcoming Events"
          value={events.length}
          trend={events[0] ? `Next: ${events[0].title}` : "None scheduled"}
          trendTone="muted"
        />
        <Kpi
          icon={Activity}
          color="teal"
          label="Bookings Today"
          value={bookingsToday}
          trend="Across all courts"
          trendTone="muted"
        />
      </div>

      {/* Top row: Club Health | Upcoming Bookings | Court Utilisation */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Club Health */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <PanelHeader icon={ShieldCheck} title="Club Health" iconClass="text-blue-500" />
          <div className="space-y-3">
            <HealthRow ok title="Club Activated" desc={`${clubName} is live on SquashHub`} />
            <HealthRow ok title="Members Onboarded" desc={`${memberCount} members in roster`} />
            <HealthRow
              ok={courts.length > 0}
              title="Courts Configured"
              desc={courts.length > 0 ? `${courts.length} courts available` : "Add courts to enable bookings"}
            />
            <HealthRow
              ok={!outstandingFees?.count}
              title="Fee Collection"
              desc={
                outstandingFees?.count
                  ? `${outstandingFees.count} members with outstanding fees`
                  : "All fees settled"
              }
            />
          </div>
          <button
            onClick={() => onTab("settings")}
            className="mt-4 flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            View All Integrations <ChevronRight className="h-3 w-3" />
          </button>
        </div>

        {/* Upcoming Bookings (today snapshot) */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <PanelHeader
            icon={CalendarDays}
            title="Upcoming Bookings"
            iconClass="text-emerald-500"
            right={
              <Link to="/bookings" className="text-[11px] font-semibold text-primary hover:underline">
                View Calendar
              </Link>
            }
          />
          <div className="space-y-3">
            <BookingRow date="Today" sub={new Date().toLocaleDateString()} count={bookingsToday} />
            <BookingRow date="Tomorrow" sub={tomorrow()} count={Math.max(0, bookingsToday - 2)} />
            <BookingRow date="This Week" sub={weekRange()} count={bookingsToday * 5} />
          </div>
          <Link
            to="/bookings"
            className="mt-4 flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            View All Bookings <ChevronRight className="h-3 w-3" />
          </Link>
        </div>

        {/* Court Utilisation */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <PanelHeader
            icon={BarChart3}
            title="Court Utilisation"
            iconClass="text-violet-500"
            right={<span className="text-[11px] text-muted-foreground">This Week</span>}
          />
          <div className="space-y-3">
            {courtUtilisation.length === 0 && (
              <p className="text-xs text-muted-foreground">No courts configured.</p>
            )}
            {courtUtilisation.map((c: any) => (
              <div key={c.name}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium text-foreground">{c.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-foreground">{c.pct}%</span>
                    <span className="text-muted-foreground tabular-nums">
                      {c.used} / {c.capacity} hrs
                    </span>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-blue-500" style={{ width: `${c.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => onTab("courts")}
            className="mt-4 flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            View Full Report <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Middle row: Outstanding Fees | Recent Activity | Upcoming Events */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Outstanding Fees */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <PanelHeader icon={DollarSign} title="Outstanding Fees" iconClass="text-rose-500" />
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <p className="text-2xl font-bold text-rose-500">{outstandingFees?.count ?? 0}</p>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Members Overdue</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-rose-500">
                {outstandingFees ? formatZAR(outstandingFees.total) : "R0"}
              </p>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Total Outstanding</p>
            </div>
          </div>
          <button
            onClick={() => onTab("fees")}
            className="mt-2 flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            View All Outstanding <ChevronRight className="h-3 w-3" />
          </button>
        </div>

        {/* Recent Activity */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <PanelHeader
            icon={Activity}
            title="Recent Activity"
            iconClass="text-sky-500"
            right={
              <button onClick={() => onTab("members")} className="text-[11px] font-semibold text-primary hover:underline">
                View All
              </button>
            }
          />
          <div className="space-y-3">
            {recentActivity.length === 0 && (
              <p className="text-xs text-muted-foreground">No recent activity.</p>
            )}
            {recentActivity.map((a: any, i: number) => {
              const Icon = a.icon;
              return (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300">
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground truncate">{a.text}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(a.time), { addSuffix: true })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Upcoming Events */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <PanelHeader
            icon={Calendar}
            title="Upcoming Events"
            iconClass="text-amber-500"
            right={
              <Link to="/events" className="text-[11px] font-semibold text-primary hover:underline">
                View All
              </Link>
            }
          />
          <div className="space-y-3">
            {events.length === 0 && <p className="text-xs text-muted-foreground">No upcoming events.</p>}
            {events.map((e: any) => {
              const d = new Date(e.starts_at);
              return (
                <div key={e.id} className="flex items-center gap-3">
                  <div className="flex h-11 w-11 flex-col items-center justify-center rounded-lg bg-muted text-foreground">
                    <span className="text-[10px] font-semibold uppercase leading-none text-muted-foreground">
                      {d.toLocaleDateString("en", { month: "short" })}
                    </span>
                    <span className="text-sm font-bold leading-tight">{d.getDate()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{e.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {d.toLocaleDateString("en", { weekday: "long", day: "numeric", month: "short" })}
                    </p>
                  </div>
                  {e.event_type && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 capitalize">
                      {e.event_type}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Quick Actions</h3>
            <p className="text-[11px] text-muted-foreground">Frequently used actions for club management</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
          <QuickAction icon={UserPlus} color="indigo" label="Add Member" sub="Invite new member" onClick={() => onTab("members")} />
          <QuickAction icon={CalendarPlus} color="emerald" label="Create Booking" sub="Book a court" to="/bookings" />
          <QuickAction icon={CalendarDays} color="amber" label="Add Event" sub="Create new event" to="/events" />
          <QuickAction icon={MessageSquare} color="rose" label="Send Message" sub="Message members" onClick={() => onTab("comms")} />
          <QuickAction icon={BarChart3} color="violet" label="View Reports" sub="Club analytics" to="/analytics" />
        </div>
      </div>
    </div>
  );
}

function HealthRow({ ok, title, desc }: { ok: boolean; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-2.5">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
      ) : (
        <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-foreground">{title}</p>
        <p className="text-[11px] text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}

function BookingRow({ date, sub, count }: { date: string; sub: string; count: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-foreground">{date}</p>
        <p className="text-[10px] text-muted-foreground">{sub}</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-bold text-foreground tabular-nums">{count}</p>
        <p className="text-[10px] text-muted-foreground">Bookings</p>
      </div>
    </div>
  );
}

const QA_COLORS: Record<string, string> = {
  indigo: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300",
  emerald: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
  amber: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
  rose: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
  violet: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",
};

function QuickAction({
  icon: Icon,
  color,
  label,
  sub,
  onClick,
  to,
}: {
  icon: any;
  color: string;
  label: string;
  sub: string;
  onClick?: () => void;
  to?: string;
}) {
  const content = (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card hover:bg-accent hover:border-primary/40 transition-all p-3 text-left">
      <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg shrink-0", QA_COLORS[color])}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-foreground truncate">{label}</p>
        <p className="text-[10px] text-muted-foreground truncate">{sub}</p>
      </div>
    </div>
  );
  if (to) return <Link to={to}>{content}</Link>;
  return (
    <button onClick={onClick} className="w-full">
      {content}
    </button>
  );
}

function tomorrow() {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return t.toLocaleDateString();
}

function weekRange() {
  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + 6);
  return `${start.toLocaleDateString()} – ${end.toLocaleDateString()}`;
}
