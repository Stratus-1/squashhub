import AppVersionBadge from "@/components/AppVersionBadge";
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useMyClub, useIsClubAdmin } from "@/hooks/use-club";
import { PageHeader } from "@/components/PageHeader";
import { BackToDashboard } from "@/components/BackToDashboard";
import { useAuth } from "@/contexts/AuthContext";
import { useClubContext } from "@/contexts/ClubContext";

import { Navigate } from "react-router-dom";
import { Building2, Users, Trophy, DollarSign, Settings, ListOrdered, Medal, Landmark, LayoutGrid, Banknote, Beer, UserCheck, Globe, ShieldCheck, Mail, Sparkles, CreditCard, MessageCircle, Router, ScrollText, HeartHandshake, Zap, ChevronsUpDown } from "lucide-react";
import { useSetupStatus, type SetupStatusMap } from "@/hooks/use-setup-status";
import { RankingPointsTab } from "@/components/club-admin/RankingPointsTab";
import { RulesTab } from "@/components/club-admin/RulesTab";
import { SkillsDirectoryTab } from "@/components/club-admin/SkillsDirectoryTab";

import { ClubInfoTab } from "@/components/club-admin/ClubInfoTab";
import { FinanceTab } from "@/components/club-admin/FinanceTab";
import { BankingTab } from "@/components/club-admin/BankingTab";
import { CourtsTab } from "@/components/club-admin/CourtsTab";
import { MembersTab } from "@/components/club-admin/MembersTab";
import { LadderTab } from "@/components/club-admin/LadderTab";
import { LeaguesTab } from "@/components/club-admin/LeaguesTab";
import { FeesTab } from "@/components/club-admin/FeesTab";
import { TournamentPlanner } from "@/components/tournaments/TournamentPlanner";
import { SettingsTab } from "@/components/club-admin/SettingsTab";
import { HonestyBarTab } from "@/components/club-admin/HonestyBarTab";
import { AccessControlTab } from "@/components/club-admin/AccessControlTab";
import { DevicesTab } from "@/components/club-admin/DevicesTab";
import { UsersTab } from "@/components/club-admin/UsersTab";
import { VisitorsTab } from "@/components/club-admin/VisitorsTab";
import { PermissionsTab } from "@/components/club-admin/PermissionsTab";
import { CommunicationsTab } from "@/components/club-admin/CommunicationsTab";
import { SubscriptionTab } from "@/components/club-admin/SubscriptionTab";
import { WhatsAppBillingCard } from "@/components/club-admin/WhatsAppBillingCard";
import { RouterTab } from "@/components/club-admin/RouterTab";
import { LeagueAwardsTab } from "@/components/club-admin/LeagueAwardsTab";
import { AiAssistantTab } from "@/components/club-admin/AiAssistantTab";
import { EmailLogTab } from "@/components/club-admin/EmailLogTab";
import { useMyPermissionsStatus, type PermissionSlug } from "@/hooks/use-club-permissions";
import { cn } from "@/lib/utils";
import { fromExt } from "@/lib/supabase-ext";
import { useQuery } from "@tanstack/react-query";
import { CORE_SETUP_KEYS, isTabVisible, type Capability } from "@/lib/capabilities";
import { useClubCapabilityRows, useCapabilities } from "@/hooks/use-club-capabilities";
import { FeaturesTab } from "@/components/club-admin/FeaturesTab";
import { QuickSetupWizard } from "@/components/club-admin/setup/QuickSetupWizard";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";


type AdminTab = { value: string; label: string; icon: any; permission?: PermissionSlug; color: string; noStatus?: boolean; capability?: Capability; startHere?: boolean };

const SETUP_TABS: AdminTab[] = [
  // Features first: a new club picks what it does before anything else.
  { value: "features", label: "Features", icon: Sparkles, color: "violet", noStatus: true, startHere: true },
  { value: "club", label: "Club", icon: Building2, permission: "club", color: "blue" },
  { value: "settings", label: "Settings", icon: Settings, permission: "settings", color: "slate" },
  { value: "rules", label: "Rules & Constitution", icon: ScrollText, permission: "club", color: "amber", noStatus: true },
  // Courts is core: admins must always be able to add courts, otherwise a club
  // with Court Bookings off could never set them up (circular dependency).
  { value: "courts", label: "Courts & Bookings", icon: LayoutGrid, permission: "courts", color: "cyan" },
  { value: "fees", label: "Fees", icon: DollarSign, permission: "fees", color: "emerald", capability: "membership_fees" },
  { value: "banking", label: "Banking & Payments", icon: Banknote, permission: "banking", color: "green", capability: "payments" },
  { value: "devices", label: "IoT / Shelly", icon: Zap, permission: "devices", color: "sky", noStatus: true, capability: "gadgets" },
  { value: "ladder", label: "Ladder & Ranking", icon: ListOrdered, permission: "ladder", color: "orange", noStatus: true, capability: "ladder" },
  { value: "ranking-points", label: "Ranking Points", icon: Sparkles, permission: "ladder", color: "yellow", noStatus: true, capability: "ranking_points" },

  { value: "bar", label: "Bar / POS", icon: Beer, permission: "bar", color: "rose", noStatus: true, capability: "bar" },
  { value: "permissions", label: "Permissions", icon: ShieldCheck, color: "red", noStatus: true },
  { value: "subscription", label: "Subscription", icon: CreditCard, color: "emerald", noStatus: true },
  { value: "whatsapp", label: "WhatsApp", icon: MessageCircle, color: "green", noStatus: true, capability: "whatsapp" },
  { value: "router", label: "Member Wi-Fi", icon: Router, color: "cyan", noStatus: true, capability: "wifi" },
];

const OPERATIONS_TABS: AdminTab[] = [
  { value: "members", label: "Members", icon: Users, permission: "members", color: "indigo" },
  { value: "users", label: "Users", icon: UserCheck, permission: "users", color: "violet" },
  { value: "skills", label: "Skills Directory", icon: HeartHandshake, permission: "members", color: "rose", noStatus: true, capability: "skills" },
  { value: "visitors", label: "Visitors", icon: Globe, permission: "visitors", color: "sky", capability: "visitors" },
  { value: "finance", label: "Club Books", icon: Landmark, permission: "finance", color: "teal", capability: "finance" },
  { value: "champs", label: "Tournaments", icon: Medal, permission: "champs", color: "yellow", capability: "tournaments" },
  { value: "leagues", label: "Leagues", icon: Trophy, permission: "leagues", color: "amber", noStatus: true, capability: "leagues" },
  { value: "awards", label: "League Awards", icon: Trophy, permission: "leagues", color: "amber", noStatus: true, capability: "leagues" },
  { value: "comms", label: "Comms", icon: Mail, permission: "communications", color: "blue" },
  { value: "emails", label: "Email Log", icon: Mail, permission: "communications", color: "sky", noStatus: true },
  // AI Assistant tab hidden while the feature is being reworked.
];

export default function ClubAdmin() {
  const { user } = useAuth();
  const { data, isLoading } = useMyClub();
  const { subdomain, club: contextClub, isLoading: clubContextLoading } = useClubContext();
  const isAdmin = useIsClubAdmin();
  const { permissions: myPermissions, isLoading: permissionsLoading } = useMyPermissionsStatus();
  // On a club subdomain wait only for the tenant club itself to resolve. Never
  // wait on the membership query — a super-admin with no member row there would
  // otherwise hang on a spinner forever.
  const tenantResolving = !!subdomain && clubContextLoading && !contextClub;


  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => searchParams.get("tab") || "features");
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t) setActiveTab(t);
  }, [searchParams]);

  const baseClub = data?.club;
  const { data: adminClub } = useQuery({
    queryKey: ["admin-club", baseClub?.id],
    queryFn: async () => {
      const { data: row, error } = await fromExt("clubs")
        .select("*")
        .eq("id", baseClub!.id)
        .maybeSingle();
      if (error) throw error;
      return row;
    },
    enabled: !!user && !!baseClub?.id,
    staleTime: 30_000,
  });
  const club = (adminClub || baseClub || contextClub) as typeof baseClub;
  // Hooks must run on every render — call before any early returns.
  const setupStatus = useSetupStatus(club?.id ?? "", club as any);
  const { enabled: enabledCaps, hasRows: hasCapRows, isLoading: capsLoading } = useCapabilities(club?.id);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const capsReady = !capsLoading && !!club?.id;

  // First-run: open Quick Setup once for a genuinely new club. New clubs get
  // seeded capability rows by a DB trigger, so "no rows" is never true — the
  // real signal is that no admin has ever touched the capabilities
  // (enabled_by is null on every row) and core setup is still incomplete.
  const { data: capRows } = useClubCapabilityRows(club?.id);
  const untouchedCaps = !!capRows?.length && capRows.every((r) => !r.enabled_by);
  const coreIncomplete =
    setupStatus.club !== "complete" || setupStatus.courts !== "complete";
  useEffect(() => {
    if (!capsReady || !club?.id) return;
    if (!(untouchedCaps || !hasCapRows)) return;
    if (!coreIncomplete) return;
    const key = `sh.quicksetup.seen.${club.id}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch { /* ignore */ }
    setWizardOpen(true);
  }, [capsReady, hasCapRows, untouchedCaps, coreIncomplete, club?.id]);

  // The public tenant record is enough to render. Do not block on membership or
  // the richer club query: platform admins often have no membership at the
  // tenant they are managing, and a slow secondary query must not blank the UI.
  const clubResolving = !contextClub && (isLoading || tenantResolving);
  if (clubResolving || permissionsLoading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  // Fall back to the tenant club so admins/super-admins on a club subdomain are
  // never sent to club registration just because they hold no member row there.
  if (!club && !contextClub) return <Navigate to="/register-club" replace />;

  if (!isAdmin && myPermissions.size === 0) return <Navigate to="/dashboard" replace />;

  // Associations have a unified dashboard at "/" — there's no separate admin page.
  if ((club as any).tenant_type === "association") {
    return <Navigate to="/" replace />;
  }

  // Filter tabs by permission — full admins (club captain/admin or platform super-admin) see everything
  const permFilter = (tab: AdminTab) => {
    if (isAdmin) return true;
    if (!tab.permission) return false; // permissions tab only for full admins
    return myPermissions.has(tab.permission);
  };
  // Capability filter — core tabs (no capability) are always visible.
  const capFilter = (tab: AdminTab) => {
    if (tab.value === "devices" && (isAdmin || myPermissions.has("devices"))) return true;
    return isTabVisible(tab, enabledCaps, hasCapRows);
  };
  const visibleSetup = SETUP_TABS.filter(permFilter).filter(capFilter);
  const visibleOps = OPERATIONS_TABS.filter(permFilter).filter(capFilter);
  const visibleTabs = [...visibleSetup, ...visibleOps];

  // If active tab isn't visible, switch to first visible (safe: setState in render triggers rerender, doesn't change hook order)
  if (visibleTabs.length > 0 && !visibleTabs.find(t => t.value === activeTab)) {
    setActiveTab(visibleTabs[0].value);
  }


  const renderContent = () => {
    switch (activeTab) {
      case "club": return <ClubInfoTab club={club} clubId={club.id} />;
      case "settings": return <SettingsTab club={club} clubId={club.id} />;
      case "fees": return <FeesTab clubId={club.id} />;
      case "courts": return <CourtsTab club={club} clubId={club.id} />;
      case "banking": return <BankingTab club={club} clubId={club.id} />;
      case "finance": return <FinanceTab club={club} clubId={club.id} />;
      case "members": return <MembersTab clubId={club.id} />;
      case "users": return <UsersTab clubId={club.id} />;
      case "visitors": return <VisitorsTab clubId={club.id} />;
      case "ladder": return <LadderTab clubId={club.id} />;
      case "ranking-points": return <RankingPointsTab clubId={club.id} />;
      case "leagues": return <LeaguesTab clubId={club.id} />;
      case "champs": return <TournamentPlanner mode="club" clubId={club.id} />;
      case "bar": return <HonestyBarTab club={club} clubId={club.id} />;
      case "access": return <AccessControlTab club={club} clubId={club.id} />;
      // IoT owns device registration; door access policy (system type, geofence)
      // lives in the same tab so it stays reachable without a second tile.
      case "devices": return (
        <div className="space-y-6">
          <DevicesTab clubId={club.id} />
          <AccessControlTab club={club} clubId={club.id} />
        </div>
      );
      case "awards": return <LeagueAwardsTab clubId={club.id} />;
      case "comms": return <CommunicationsTab clubId={club.id} />;
      case "ai": return <AiAssistantTab clubId={club.id} />;
      case "emails": return <EmailLogTab clubId={club.id} />;
      case "subscription": return <SubscriptionTab clubId={club.id} />;
      case "whatsapp": return <div className="mt-4"><WhatsAppBillingCard clubId={club.id} /></div>;
      case "router": return <RouterTab clubId={club.id} club={club} />;
      case "permissions": return <PermissionsTab clubId={club.id} />;
      case "rules": return <RulesTab clubId={club.id} club={club} />;
      case "skills": return <SkillsDirectoryTab clubId={club.id} />;
      case "features": return <FeaturesTab clubId={club.id} club={club} />;
      default: return null;
    }
  };

  const activeTabMeta = visibleTabs.find(t => t.value === activeTab);

  // Explicit core progress — optional modules are reported per tile instead.
  const coreKeys = CORE_SETUP_KEYS.filter(k => visibleSetup.concat(visibleOps).some(t => t.value === k));
  const coreDone = coreKeys.filter(k => setupStatus[k as keyof SetupStatusMap] === "complete").length;

  const renderTabRow = (tab: AdminTab, showStatus = false, closeMobileNav = false) => {
    const Icon = tab.icon;
    const status = showStatus ? setupStatus[tab.value as keyof SetupStatusMap] : undefined;
    const isComplete = status === "complete";
    return (
      <button
        key={tab.value}
        type="button"
        onClick={() => {
          setActiveTab(tab.value);
          if (closeMobileNav) setMobileNavOpen(false);
        }}
        className={cn(
          "group flex min-h-14 w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-left transition-colors hover:border-border hover:bg-muted/60",
          activeTab === tab.value && "border-border bg-muted shadow-xs",
        )}
      >
        <span className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors",
          activeTab === tab.value && "bg-primary text-primary-foreground",
        )}>
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{tab.label}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {showStatus ? (isComplete ? "Ready to use" : "Needs setup") : "Open workspace"}
          </span>
        </span>
        {showStatus && (
          <span className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-medium",
            isComplete ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
          )}>
            {isComplete ? "Complete" : "Setup"}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="min-h-screen pb-20 text-[13px]">
      <PageHeader title={club.name} subtitle="Club Administration" />
      <main className="mx-auto w-full max-w-7xl space-y-3 px-3 py-3 md:space-y-6 md:px-4 md:py-6 lg:px-6">
        <section className="hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Core setup", value: `${coreDone}/${coreKeys.length}`, detail: "required areas complete" },
            { label: "Setup modules", value: visibleSetup.length, detail: "available to configure" },
            { label: "Operations", value: visibleOps.length, detail: "available to manage" },
            { label: "Current workspace", value: activeTabMeta?.label || "Dashboard", detail: "selected section" },
          ].map((metric) => (
            <div key={metric.label} className="rounded-xl border bg-card p-5 shadow-xs">
              <p className="text-sm text-muted-foreground">{metric.label}</p>
              <p className="mt-2 truncate text-2xl font-semibold tracking-tight">{metric.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{metric.detail}</p>
            </div>
          ))}
        </section>

        {activeTabMeta && (
          <section className="sticky top-2 z-20 md:hidden">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="flex min-h-14 w-full items-center gap-3 rounded-xl border bg-card/95 px-3 py-2 text-left shadow-sm backdrop-blur"
              aria-label="Choose admin workspace"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <activeTabMeta.icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Current workspace</span>
                <span className="block truncate text-sm font-semibold">{activeTabMeta.label}</span>
              </span>
              <ChevronsUpDown className="size-4 text-muted-foreground" />
            </button>
          </section>
        )}

        <section className="hidden gap-6 md:grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {visibleSetup.length > 0 && (
            <div className="rounded-xl border bg-card shadow-xs">
              <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
                <div><h2 className="font-semibold tracking-tight">Setup &amp; configuration</h2><p className="mt-1 text-sm text-muted-foreground">Core club settings and connected services.</p></div>
                <span className="shrink-0 rounded-full border px-2.5 py-1 text-xs text-muted-foreground">{coreDone}/{coreKeys.length} complete</span>
              </div>
              <div className="grid gap-1 p-3 sm:grid-cols-2">{visibleSetup.map((tab) => renderTabRow(tab, !tab.noStatus))}</div>
            </div>
          )}
          {visibleOps.length > 0 && (
            <div className="rounded-xl border bg-card shadow-xs">
              <div className="border-b px-5 py-4"><h2 className="font-semibold tracking-tight">Operations &amp; finance</h2><p className="mt-1 text-sm text-muted-foreground">Day-to-day club management tools.</p></div>
              <div className="grid gap-1 p-3 sm:grid-cols-2">{visibleOps.map((tab) => renderTabRow(tab))}</div>
            </div>
          )}
        </section>

        {activeTabMeta && (
          <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
            <div className="hidden flex-wrap items-center justify-between gap-3 border-b px-5 py-4 md:flex">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><activeTabMeta.icon className="size-4" /></span>
                <div className="min-w-0"><h2 className="truncate font-semibold tracking-tight">{activeTabMeta.label}</h2><p className="text-sm text-muted-foreground">Manage this area of your club.</p></div>
              </div>
              <span className="rounded-full border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">Workspace</span>
            </div>
            <div className="p-2.5 md:p-6 [&_.space-y-6]:space-y-4 [&_.space-y-4]:space-y-3 [&_.space-y-3]:space-y-2 [&_h3]:text-sm [&_h3]:font-semibold md:[&_.p-4]:p-3 md:[&_.p-3]:p-2.5 md:[&_.gap-4]:gap-3 md:[&_.gap-3]:gap-2">
              {renderContent()}
            </div>
          </section>
        )}
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent side="bottom" className="h-[85dvh] rounded-t-2xl p-0 md:hidden">
            <SheetHeader className="border-b px-5 py-4 text-left">
              <SheetTitle>Club administration</SheetTitle>
              <SheetDescription>Choose the area you want to manage.</SheetDescription>
            </SheetHeader>
            <ScrollArea className="h-[calc(85dvh-85px)]">
              <div className="space-y-5 p-3 pb-8">
                {visibleSetup.length > 0 && (
                  <section>
                    <div className="flex items-center justify-between px-2 pb-2">
                      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Setup &amp; configuration</h2>
                      <span className="text-[11px] text-muted-foreground">{coreDone}/{coreKeys.length}</span>
                    </div>
                    <div className="divide-y rounded-xl border bg-card">
                      {visibleSetup.map((tab) => renderTabRow(tab, !tab.noStatus, true))}
                    </div>
                  </section>
                )}
                {visibleOps.length > 0 && (
                  <section>
                    <h2 className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Operations &amp; finance</h2>
                    <div className="divide-y rounded-xl border bg-card">
                      {visibleOps.map((tab) => renderTabRow(tab, false, true))}
                    </div>
                  </section>
                )}
              </div>
            </ScrollArea>
          </SheetContent>
        </Sheet>
        <QuickSetupWizard clubId={club.id} open={wizardOpen} onOpenChange={setWizardOpen} />
        <div className="flex justify-end border-t border-border/50 pt-3">
          <AppVersionBadge />
        </div>
      </main>
      <BackToDashboard />
    </div>
  );
}
