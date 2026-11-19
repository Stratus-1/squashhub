import { useState, useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/SEO";
import { AssociationWelcomeBanner } from "@/components/AssociationWelcomeBanner";
import { ProfileCompletionMeter } from "@/components/ProfileCompletionMeter";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ClubAdminNavigation, type AdminNavigationItem } from "@/components/club-admin/ClubAdminNavigation";
import {
  Building2, Network, Trophy, Medal, Users, UserCheck, Settings, Banknote, Landmark,
  ShieldCheck, MessageCircle, BarChart3, Wallet, LifeBuoy, Receipt, Mail, SlidersHorizontal, ChevronsUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation, useNavigate } from "react-router-dom";
import { useProfile, useMyRoles } from "@/hooks/use-data";
import { useMyClub, useIsClubAdmin } from "@/hooks/use-club";
import { useMyPermissions, type PermissionSlug } from "@/hooks/use-club-permissions";
import { useMemberContext } from "@/contexts/MemberContext";
import { useIsAssociationAdmin } from "@/hooks/use-association-admin";

import { AssociationInfoTab } from "@/components/association-admin/AssociationInfoTab";
import { AffiliatedClubsTab } from "@/components/association-admin/AffiliatedClubsTab";
import { SettingsTab } from "@/components/club-admin/SettingsTab";
import { BankingTab } from "@/components/club-admin/BankingTab";
import { FinanceTab } from "@/components/club-admin/FinanceTab";
import { FeesTab } from "@/components/club-admin/FeesTab";
import { MembersTab } from "@/components/club-admin/MembersTab";
import { AssociationMembersTab } from "@/components/association-admin/AssociationMembersTab";
import { AssociationFeesTab } from "@/components/association-admin/AssociationFeesTab";
import { AssociationSetupTab } from "@/components/association-admin/AssociationSetupTab";
import { UsersTab } from "@/components/club-admin/UsersTab";
import { AssociationLeaguesTab } from "@/components/association-admin/AssociationLeaguesTab";
import { TournamentPlanner } from "@/components/tournaments/TournamentPlanner";
import { PermissionsTab } from "@/components/club-admin/PermissionsTab";
import { CommunicationsTab } from "@/components/club-admin/CommunicationsTab";
import { MessageLogTab } from "@/components/club-admin/MessageLogTab";
import { AssociationRankingsTab } from "@/components/association-admin/AssociationRankingsTab";

type NavGroup = "operations" | "setup";

interface TabDef {
  value: string;
  label: string;
  description: string;
  icon: any;
  color: string;
  group: NavGroup;
  permission?: PermissionSlug;
  adminOnly?: boolean;
}

// Static class map so Tailwind can see every utility (same palette as Club Admin).
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
  rose: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  red: "bg-red-500/15 text-red-600 dark:text-red-400",
  indigo: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
  teal: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
  lime: "bg-lime-500/15 text-lime-600 dark:text-lime-400",
  pink: "bg-pink-500/15 text-pink-600 dark:text-pink-400",
  purple: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
};

// Section ids and permissions are unchanged — only presentation (left menu) changed.
const ADMIN_TABS: TabDef[] = [
  { value: "affiliated", label: "Affiliated Clubs", description: "Clubs in this association", icon: Network, color: "sky", group: "operations", permission: "club" },
  { value: "leagues", label: "Leagues", description: "Seasons, teams & fixtures", icon: Trophy, color: "amber", group: "operations", permission: "leagues" },
  { value: "champs", label: "Tournaments", description: "Draws, entries & results", icon: Medal, color: "purple", group: "operations", permission: "champs" },
  { value: "rankings", label: "Rankings", description: "Player rankings & data sync", icon: BarChart3, color: "violet", group: "operations", permission: "leagues" },
  { value: "members", label: "Members", description: "League members across clubs", icon: Users, color: "emerald", group: "operations", permission: "members" },
  { value: "users", label: "Users", description: "Logins & access", icon: UserCheck, color: "cyan", group: "operations", permission: "users" },
  { value: "fees", label: "Fees", description: "League & affiliation fees", icon: Receipt, color: "lime", group: "operations", permission: "fees" },
  { value: "finance", label: "Finance", description: "Ledger & club billing", icon: Landmark, color: "teal", group: "operations", permission: "finance" },
  { value: "banking", label: "Banking", description: "Bank account & statements", icon: Banknote, color: "green", group: "operations", permission: "banking" },
  { value: "comms", label: "Comms", description: "Templates & campaigns", icon: MessageCircle, color: "rose", group: "operations", permission: "communications" },
  { value: "emails", label: "Message Log", description: "Sent emails & messages", icon: Mail, color: "pink", group: "operations", permission: "communications" },
  { value: "association", label: "Association", description: "Name, contacts & details", icon: Building2, color: "blue", group: "setup", permission: "club" },
  { value: "setup", label: "Setup", description: "Association setup & configuration", icon: Settings, color: "slate", group: "setup", permission: "settings" },
  { value: "settings", label: "Preferences", description: "Display & notification preferences", icon: SlidersHorizontal, color: "slate", group: "setup", permission: "settings" },
  { value: "permissions", label: "Permissions", description: "Who can manage what", icon: ShieldCheck, color: "red", group: "setup", adminOnly: true },
];

const PERSONAL_LINKS: (AdminNavigationItem & { to: string })[] = [
  { value: "link:/my-account", to: "/my-account", label: "My Account", description: "Profile, fees & preferences", icon: Wallet, iconClassName: ICON_COLORS.indigo },
  { value: "link:/support", to: "/support", label: "Support", description: "Get help", icon: LifeBuoy, iconClassName: ICON_COLORS.orange },
];

const isPhone = () => typeof window !== "undefined" && !!window.matchMedia?.("(max-width: 767px)").matches;

export default function AssociationDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: profile } = useProfile();
  const { data: myRoles = [] } = useMyRoles();
  const { data: clubData } = useMyClub();
  const association = clubData?.club;
  const { activeMember } = useMemberContext();
  const isClubAdmin = useIsClubAdmin();
  const isAssociationAdmin = useIsAssociationAdmin(association?.id);
  const isPlatformAdmin = myRoles.includes("admin");
  const myPermissions = useMyPermissions();
  const firstName = (activeMember?.name || profile?.name)?.split(" ")[0] || "Member";
  const openProfile = (to: string = "/profile") => navigate(to, { state: { backgroundLocation: location } });

  const visibleAdminTabs = ADMIN_TABS.filter(tab => {
    if (isPlatformAdmin) return true;
    if (tab.adminOnly) return isClubAdmin || isAssociationAdmin;
    if (!tab.permission) return isClubAdmin || isAssociationAdmin;
    return isClubAdmin || isAssociationAdmin || myPermissions.has(tab.permission);
  });

  // Phones without an explicit ?tab= open on the menu; desktop opens the first section.
  const [adminTab, setAdminTab] = useState<string>(() => new URLSearchParams(location.search).get("tab") || (isPhone() ? "" : "affiliated"));
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [compactNav, setCompactNav] = useState(false);

  // Fall back to the first permitted section once permissions resolve (desktop only).
  if (adminTab && visibleAdminTabs.length > 0 && !visibleAdminTabs.find(t => t.value === adminTab)) {
    setAdminTab(isPhone() ? "" : visibleAdminTabs[0].value);
  }

  // Deep-link via ?tab=members etc.
  useEffect(() => {
    const tab = new URLSearchParams(location.search).get("tab");
    if (tab && visibleAdminTabs.some(t => t.value === tab)) setAdminTab(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, visibleAdminTabs.length]);

  const renderAdminTab = () => {
    if (!association) return null;
    switch (adminTab) {
      case "association": return <AssociationInfoTab club={association as any} clubId={association.id} />;
      case "setup": return <AssociationSetupTab clubId={association.id} />;
      case "affiliated": return <AffiliatedClubsTab clubId={association.id} />;
      case "leagues": return <AssociationLeaguesTab clubId={association.id} />;
      case "champs": return <TournamentPlanner mode="club" clubId={association.id} />;
      case "rankings": return <AssociationRankingsTab clubId={association.id} />;
      case "members": return <AssociationMembersTab clubId={association.id} />;
      case "users": return <UsersTab clubId={association.id} />;
      case "fees": return <AssociationFeesTab clubId={association.id} />;
      case "banking": return <BankingTab club={association as any} clubId={association.id} />;
      case "finance": return <FinanceTab club={association as any} clubId={association.id} party="club" />;
      case "comms": return <CommunicationsTab clubId={association.id} />;
      case "emails": return <MessageLogTab clubId={association.id} mode="association" />;
      case "settings": return <SettingsTab club={association as any} clubId={association.id} />;
      case "permissions": return <PermissionsTab clubId={association.id} />;
      default: return null;
    }
  };

  const activeTabMeta = visibleAdminTabs.find(t => t.value === adminTab);
  const toItems = (group: NavGroup): AdminNavigationItem[] => visibleAdminTabs
    .filter(t => t.group === group)
    .map(t => ({ value: t.value, label: t.label, description: t.description, icon: t.icon, iconClassName: ICON_COLORS[t.color] }));
  const operations = toItems("operations");
  const setup = toItems("setup");
  const select = (value: string) => {
    const link = PERSONAL_LINKS.find(l => l.value === value);
    if (link) navigate(link.to);
    else setAdminTab(value);
  };
  const nav = (props: { onSelect: (value: string) => void; compact?: boolean; onCompactChange?: () => void }) => (
    <ClubAdminNavigation operations={operations} setup={setup} activeTab={adminTab}
      operationsTitle="Association operations" setupTitle="Setup & configuration"
      setupDefaultOpen={activeTabMeta?.group === "setup"}
      extra={{ title: "Personal", items: PERSONAL_LINKS }} {...props} />
  );

  return (
    <div className="bottom-nav-safe relative text-[13px]">
      <SEO title="Association Dashboard" description="Your association hub." path="/" noIndex />

      <PageHeader
        title={association?.name || "Association"}
        subtitle={`Welcome back, ${firstName}`}
        showNotifications
        showProfile
        showChallengesInbox={false}
      />

      <main className="w-full space-y-3 px-3 py-3 md:space-y-4 md:px-4 md:py-4 lg:px-5">
        <AssociationWelcomeBanner onOpenAffiliated={() => select("affiliated")} />
        <ProfileCompletionMeter
          profile={profile}
          onAction={(action) => {
            if (action === "edit") openProfile("/profile?edit=1");
            if (action === "edit-then-account") openProfile("/profile?edit=1&next=account");
          }}
        />

        {activeTabMeta && (
          <section className="sticky top-2 z-20 md:hidden">
            <Button variant="ghost" type="button" onClick={() => setMobileNavOpen(true)}
              className="flex h-auto min-h-14 w-full items-center gap-3 rounded-md border bg-card/95 px-3 py-2 text-left shadow-sm backdrop-blur"
              aria-label="Choose association workspace">
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

        {!activeTabMeta && <section className="md:hidden">{nav({ onSelect: select })}</section>}

        <div className={cn("md:grid md:items-start md:gap-4 lg:gap-5", compactNav ? "md:grid-cols-[56px_minmax(0,1fr)]" : "md:grid-cols-[220px_minmax(0,1fr)] lg:grid-cols-[248px_minmax(0,1fr)]")}>
          <nav aria-label="Association administration" className="hidden md:sticky md:top-4 md:block md:max-h-[calc(100dvh-2rem)] md:overflow-y-auto md:pr-1">
            {nav({ onSelect: select, compact: compactNav, onCompactChange: () => setCompactNav(v => !v) })}
          </nav>

          {activeTabMeta && (
            <section className="min-w-0">
              <header className="hidden items-center justify-between gap-3 border-b pb-3 md:flex">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold">{activeTabMeta.label}</h2>
                  <p className="text-sm text-muted-foreground">{activeTabMeta.description}</p>
                </div>
              </header>
              <div className="pt-1 md:pt-4 [&_.space-y-6]:space-y-4 [&_.space-y-4]:space-y-3 [&_.space-y-3]:space-y-2 [&_h3]:text-sm [&_h3]:font-semibold [&_.p-4]:p-3 [&_.p-3]:p-2.5 [&_.gap-4]:gap-3 [&_.gap-3]:gap-2">
                {renderAdminTab()}
              </div>
            </section>
          )}
        </div>

        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent side="bottom" className="h-[85dvh] rounded-t-2xl p-0 md:hidden">
            <SheetHeader className="border-b px-5 py-4 text-left">
              <SheetTitle>Association administration</SheetTitle>
              <SheetDescription>Choose the area you want to manage.</SheetDescription>
            </SheetHeader>
            <ScrollArea className="h-[calc(85dvh-85px)]">
              <div className="space-y-5 p-3 pb-8">
                {nav({ onSelect: value => { select(value); setMobileNavOpen(false); } })}
              </div>
            </ScrollArea>
          </SheetContent>
        </Sheet>
      </main>
    </div>
  );
}
