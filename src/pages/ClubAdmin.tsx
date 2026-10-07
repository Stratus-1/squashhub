import AppVersionBadge from "@/components/AppVersionBadge";
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useMyClub, useIsClubAdmin } from "@/hooks/use-club";
import { PageHeader } from "@/components/PageHeader";
import { BackToDashboard } from "@/components/BackToDashboard";
import { useAuth } from "@/contexts/AuthContext";
import { useClubContext } from "@/contexts/ClubContext";

import { Navigate } from "react-router-dom";
import { Building2, Users, Trophy, DollarSign, Settings, ListOrdered, Medal, Landmark, LayoutGrid, Banknote, Beer, UserCheck, Globe, ShieldCheck, Mail, Sparkles, CreditCard, MessageCircle, Router, ScrollText, HeartHandshake, Zap, ChevronsUpDown, Info, Megaphone } from "lucide-react";
import { ClubTournamentBeta } from "@/components/smart-builder/ClubTournamentBeta";
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
import { PlatformUpdatesInbox } from "@/components/club-admin/PlatformUpdatesInbox";
import { SubscriptionTab } from "@/components/club-admin/SubscriptionTab";
import { MessagingCard } from "@/components/club-admin/MessagingCard";
import { WhatsAppBillingCard } from "@/components/club-admin/WhatsAppBillingCard";
import { SmsMessagingCard } from "@/components/club-admin/SmsMessagingCard";
import { RouterTab } from "@/components/club-admin/RouterTab";
import { LeagueAwardsTab } from "@/components/club-admin/LeagueAwardsTab";
import { AiAssistantTab } from "@/components/club-admin/AiAssistantTab";
import { MessageLogTab } from "@/components/club-admin/MessageLogTab";
import { useMyPermissionsStatus, type PermissionSlug } from "@/hooks/use-club-permissions";
import { cn } from "@/lib/utils";
import { fromExt } from "@/lib/supabase-ext";
import { useQuery } from "@tanstack/react-query";
import { isTabVisible, type Capability } from "@/lib/capabilities";
import { useClubCapabilityRows, useCapabilities } from "@/hooks/use-club-capabilities";
import { FeaturesTab } from "@/components/club-admin/FeaturesTab";
import { QuickSetupWizard } from "@/components/club-admin/setup/QuickSetupWizard";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ClubAdminNavigation, type AdminNavigationItem } from "@/components/club-admin/ClubAdminNavigation";
import { ClubAdminSetupPresentation } from "@/components/club-admin/setup/SetupSteps";


type AdminTab = { value: string; label: string; icon: any; permission?: PermissionSlug; color: string; noStatus?: boolean; capability?: Capability; startHere?: boolean };

// Static class map so Tailwind can see every utility. Keyed by AdminTab.color.
const ICON_COLORS: Record<string, string> = {
  violet: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  blue: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  slate: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  cyan: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  emerald: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  green: "bg-green-500/15 text-green-600 dark:text-green-400",
  sky: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  orange: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  yellow: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
  rose: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  red: "bg-red-500/15 text-red-600 dark:text-red-400",
  indigo: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
  teal: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
};

// Order follows the pilot's Setup / Operations grouping. Ids, permissions and
// capability gates are unchanged — only presentation order and copy.
const SETUP_TABS: AdminTab[] = [
  { value: "club", label: "Club", icon: Building2, permission: "club", color: "blue" },
  { value: "settings", label: "Settings", icon: Settings, permission: "settings", color: "slate" },
  { value: "features", label: "Features", icon: Sparkles, color: "violet", noStatus: true, startHere: true },
  { value: "rules", label: "Rules & Constitution", icon: ScrollText, permission: "club", color: "amber", noStatus: true },
  // Courts is core: admins must always be able to add courts.
  { value: "courts", label: "Courts & Bookings", icon: LayoutGrid, permission: "courts", color: "cyan" },
  { value: "fees", label: "Fees", icon: DollarSign, permission: "fees", color: "emerald", capability: "membership_fees" },
  { value: "banking", label: "Banking & Payments", icon: Banknote, permission: "banking", color: "green", capability: "payments" },
  { value: "permissions", label: "Permissions", icon: ShieldCheck, color: "red", noStatus: true },
  { value: "whatsapp", label: "Messaging", icon: MessageCircle, color: "green", noStatus: true, capability: "whatsapp" },
  { value: "subscription", label: "Subscription", icon: CreditCard, color: "emerald", noStatus: true },
  { value: "devices", label: "IoT / Shelly", icon: Zap, permission: "devices", color: "sky", noStatus: true, capability: "gadgets" },
  { value: "ladder", label: "Ladder & Ranking", icon: ListOrdered, permission: "ladder", color: "orange", noStatus: true, capability: "ladder" },
  { value: "ranking-points", label: "Player Ratings", icon: Sparkles, permission: "ladder", color: "yellow", noStatus: true, capability: "ranking_points" },
  { value: "router", label: "Member Wi-Fi", icon: Router, color: "cyan", noStatus: true, capability: "wifi" },
];

const OPERATIONS_TABS: AdminTab[] = [
  { value: "members", label: "Members", icon: Users, permission: "members", color: "indigo" },
  { value: "users", label: "Users", icon: UserCheck, permission: "users", color: "violet" },
  { value: "visitors", label: "Visitors", icon: Globe, permission: "visitors", color: "sky", capability: "visitors" },
  { value: "skills", label: "Skills Directory", icon: HeartHandshake, permission: "members", color: "rose", noStatus: true, capability: "skills" },
  { value: "finance", label: "Club Books", icon: Landmark, permission: "finance", color: "teal", capability: "finance" },
  { value: "champs", label: "Tournaments", icon: Medal, permission: "champs", color: "yellow", capability: "tournaments" },
  { value: "leagues", label: "Leagues", icon: Trophy, permission: "leagues", color: "amber", noStatus: true, capability: "leagues" },
  { value: "awards", label: "League Awards", icon: Trophy, permission: "leagues", color: "amber", noStatus: true, capability: "leagues" },
  { value: "comms", label: "Member Communications", icon: Mail, permission: "communications", color: "blue" },
  { value: "emails", label: "Message Log", icon: Mail, permission: "communications", color: "sky", noStatus: true },
  { value: "updates", label: "Updates from SquashHub", icon: Megaphone, permission: "communications", color: "rose", noStatus: true },
  { value: "bar", label: "Bar / POS", icon: Beer, permission: "bar", color: "rose", noStatus: true, capability: "bar" },
  // AI Assistant tab hidden while the feature is being reworked.
];

const TAB_DESCRIPTIONS: Record<string, string> = {
  club: "Name, contact details and branding",
  settings: "Booking, ladder and general preferences",
  features: "Switch optional modules on or off",
  rules: "Club rules and constitution documents",
  courts: "Courts, slots and booking rules",
  fees: "Membership categories and fees",
  banking: "Bank details and payment gateways",
  permissions: "Who can manage which areas",
  whatsapp: "Member messaging channels and costs",
  subscription: "Your SquashHub plan and billing",
  devices: "Lights, doors and connected gadgets",
  ladder: "Ladder order and ranking moves",
  "ranking-points": "Player rating points",
  router: "Member Wi-Fi access",
  members: "Member roster and details",
  users: "App logins linked to members",
  visitors: "Visitor registrations",
  skills: "Members' professional skills",
  finance: "Ledger, accounts and reports",
  champs: "Club tournaments and draws",
  leagues: "Teams, fixtures and results",
  awards: "League prizes and awards",
  comms: "Templates, campaigns and sends",
  updates: "News from the SquashHub team",
  emails: "Delivery history of messages",
  bar: "Honesty bar stock and sales",
};

export default function ClubAdmin() {
  const { user } = useAuth();
  const { data, isLoading } = useMyClub();
  const { subdomain, club: contextClub, isLoading: clubContextLoading } = useClubContext();
  const isClubAdmin = useIsClubAdmin();
  const { permissions: myPermissions, isLoading: permissionsLoading, isFullAdmin } = useMyPermissionsStatus();
  // Members holding a "Full Admin" permission role see every tile, like role=admin.
  const isAdmin = isClubAdmin || !!isFullAdmin;
  // On a club subdomain wait only for the tenant club itself to resolve. Never
  // wait on the membership query — a super-admin with no member row there would
  // otherwise hang on a spinner forever.
  const tenantResolving = !!subdomain && clubContextLoading && !contextClub;


  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => searchParams.get("tab") || "features");
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t) setActiveTab(t === "champs_beta" ? "champs" : t);
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
  const [compactNav, setCompactNav] = useState(false);
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
  const capFilter = (tab: AdminTab) => isTabVisible(tab, enabledCaps, hasCapRows);
  const visibleSetup = SETUP_TABS.filter(permFilter).filter(capFilter);
  // The Step-by-Step builder now lives on the single Tournaments page; no separate Beta tile.
  const opsTabs = OPERATIONS_TABS;
  const visibleOps = opsTabs.filter(permFilter).filter(capFilter);
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
      case "champs":
      case "champs_beta":
        return <ClubTournamentBeta clubId={club.id} clubName={(club as any)?.name}
          renderList={(manage) => <TournamentPlanner mode="club" clubId={club.id} hideCreateButton onManageBeta={manage} />} />;
      case "bar": return <HonestyBarTab club={club} clubId={club.id} />;
      case "access": return <AccessControlTab club={club} clubId={club.id} />;
      // IoT owns device registration end to end: each door/gate/gadget keeps
      // its own Shelly details, dashboard visibility and door location in its
      // device card. The Access Control tile only holds non-device access
      // policy (access method, face-recognition providers).
      case "devices": return <DevicesTab clubId={club.id} />;
      case "awards": return <LeagueAwardsTab clubId={club.id} />;
      case "comms": return <CommunicationsTab clubId={club.id} />;
      case "updates": return <PlatformUpdatesInbox clubId={club.id} />;
      case "ai": return <AiAssistantTab clubId={club.id} />;
      case "emails": return <MessageLogTab clubId={club.id} />;
      case "subscription": return <SubscriptionTab clubId={club.id} />;
      case "whatsapp": return (
        <div className="mt-4 space-y-4">
          <Alert className="bg-blue-500/5 border-blue-500/20">
            <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <AlertTitle className="text-sm">One switch — SquashHub picks the channel</AlertTitle>
            <AlertDescription className="text-xs text-muted-foreground">
              Member messaging is simply on or off. A WhatsApp goes out when a reply is expected
              (tournament launches, invites, RSVPs) and an SMS when it is a one-way notice (next
              round starting, make your booking, well done on your win). The sections below only
              hold sender details and what each channel costs.
            </AlertDescription>
          </Alert>
          <MessagingCard clubId={club.id} />
          <WhatsAppBillingCard clubId={club.id} hideToggle />
          <SmsMessagingCard clubId={club.id} hideToggle />
        </div>
      );

      case "router": return <RouterTab clubId={club.id} club={club} />;
      case "permissions": return <PermissionsTab clubId={club.id} />;
      case "rules": return <RulesTab clubId={club.id} club={club} />;
      case "skills": return <SkillsDirectoryTab clubId={club.id} />;
      case "features": return <FeaturesTab clubId={club.id} club={club} />;
      default: return null;
    }
  };

  const activeTabMeta = visibleTabs.find(t => t.value === activeTab);

  const navigationItems = (tabs: AdminTab[], withStatus = false): AdminNavigationItem[] => tabs.map(tab => ({
    value: tab.value,
    label: tab.label,
    icon: tab.icon,
    iconClassName: ICON_COLORS[tab.color] ?? "text-muted-foreground",
    description: TAB_DESCRIPTIONS[tab.value] ?? "",
    needsSetup: withStatus && !tab.noStatus && setupStatus[tab.value as keyof SetupStatusMap] !== "complete",
  }));

  return (
    <div className="min-h-screen pb-20 text-[13px]">
      <PageHeader title={club.name} subtitle="Club Administration" />
      <main className="w-full space-y-3 px-3 py-3 md:space-y-5 md:px-4 md:py-5 lg:px-5">
        {activeTabMeta && (
          <section className="sticky top-2 z-20 md:hidden">
            <Button variant="ghost"
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="flex h-auto min-h-14 w-full items-center gap-3 rounded-md border bg-card/95 px-3 py-2 text-left shadow-sm backdrop-blur"
              aria-label="Choose admin workspace"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <activeTabMeta.icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Current workspace</span>
                <span className="block truncate text-sm font-semibold">{activeTabMeta.label}</span>
              </span>
              <ChevronsUpDown className="size-4 text-muted-foreground" />
            </Button>
          </section>
        )}

        <div className={cn("md:grid md:items-start md:gap-4 lg:gap-5", compactNav ? "md:grid-cols-[56px_minmax(0,1fr)]" : "md:grid-cols-[220px_minmax(0,1fr)] lg:grid-cols-[248px_minmax(0,1fr)]")}>
          <nav aria-label="Club administration" className="hidden md:sticky md:top-4 md:block md:max-h-[calc(100dvh-2rem)] md:overflow-y-auto md:pr-1">
            <ClubAdminNavigation operations={navigationItems(visibleOps)} setup={navigationItems(visibleSetup, true)} activeTab={activeTab}
              onSelect={setActiveTab} compact={compactNav} onCompactChange={() => setCompactNav(value => !value)} />
          </nav>

          {activeTabMeta && (
            <section className="admin-pilot min-w-0">
              <header className="hidden items-center justify-between gap-3 border-b pb-4 md:flex">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold">{activeTabMeta.label}</h2>
                  <p className="text-sm text-muted-foreground">{TAB_DESCRIPTIONS[activeTabMeta.value] ?? "Manage this area of your club."}</p>
                </div>
              </header>
              <div className="admin-workspace pt-1 md:pt-4 [&_.space-y-6]:space-y-4 [&_.space-y-4]:space-y-3 [&_h3]:text-sm [&_h3]:font-semibold">
                <ClubAdminSetupPresentation.Provider value={true}>
                  {renderContent()}
                </ClubAdminSetupPresentation.Provider>
              </div>
            </section>
          )}
        </div>
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent side="bottom" className="h-[85dvh] rounded-t-2xl p-0 md:hidden">
            <SheetHeader className="border-b px-5 py-4 text-left">
              <SheetTitle>Club administration</SheetTitle>
              <SheetDescription>Choose the area you want to manage.</SheetDescription>
            </SheetHeader>
            <ScrollArea className="h-[calc(85dvh-85px)]">
              <div className="space-y-5 p-3 pb-8">
                <ClubAdminNavigation operations={navigationItems(visibleOps)} setup={navigationItems(visibleSetup, true)} activeTab={activeTab}
                  onSelect={value => { setActiveTab(value); setMobileNavOpen(false); }} />
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
