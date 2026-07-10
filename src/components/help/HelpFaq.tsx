import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { HelpCircle, Search } from "lucide-react";

type Faq = {
  q: string;
  a: string;
  role: "member" | "captain" | "admin";
  category: string;
};

export const FAQS: Faq[] = [
  // ── Members ──────────────────────────────────────────────
  {
    role: "member",
    category: "Getting Started",
    q: "How do I join my club on SquashHub?",
    a: "Open your club's page (usually yourclub.squashhub.co.za), tap Sign Up, and enter the details your club has on file — typically your SA ID or member number and cell. If your club has already imported you, your profile links automatically.",
  },
  {
    role: "member",
    category: "Bookings",
    q: "How far in advance can I book a court?",
    a: "That's set by your club admin. Open Court Bookings and the grid will only show slots you're allowed to book — anything greyed out is either taken, blocked, or outside your booking window.",
  },
  {
    role: "member",
    category: "Bookings",
    q: "Can I invite a guest or someone from another club?",
    a: "Yes. When you create a booking, tap Invite and share the WhatsApp / email link. Visitors don't need an account — they confirm from the link and are auto-tracked for visitor fees if your club charges them.",
  },
  {
    role: "member",
    category: "Bookings",
    q: "The court lights didn't come on. What now?",
    a: "Lights trigger a few minutes before your slot. If they don't, tap the light icon on your booking to retry, or ask an admin — they can see the trigger log under Courts & Lights.",
  },
  {
    role: "member",
    category: "Ladder & Challenges",
    q: "How does the ladder work?",
    a: "You can challenge anyone within the range your club allows (typically a few positions above you). Winner takes the higher position. Ladder position is the single source of truth — your rank only moves when a result is confirmed.",
  },
  {
    role: "member",
    category: "Ladder & Challenges",
    q: "My opponent hasn't confirmed my match result.",
    a: "Results auto-confirm after the window your club sets (usually 48 hours). If it's disputed, an admin can step in from the Matches panel.",
  },
  {
    role: "member",
    category: "Billing",
    q: "Where do I see and pay my fees?",
    a: "My Account → Fees shows every open invoice — subs, league entries, national body levies, and bar tab. Pay in full or partially using your club's active payment gateway.",
  },
  {
    role: "member",
    category: "Billing",
    q: "Can I pay for my kid / partner from my account?",
    a: "Yes — use Account Delegation. Add them by member number and cell; once they accept, you'll see their fees alongside yours and can pay in one go. Up to 5 delegates.",
  },
  {
    role: "member",
    category: "Honesty Bar",
    q: "How does the honesty bar work?",
    a: "Tap what you took, confirm the total, and it lands on your bar tab. Pay it off any time from My Account — no queue, no barman.",
  },
  {
    role: "member",
    category: "Leagues",
    q: "How do I sign up for the league?",
    a: "If your club is affiliated, open /league or the League tile on your dashboard, pick your season, and confirm your details. Your captain will see you appear in their team pool.",
  },

  // ── Captains ─────────────────────────────────────────────
  {
    role: "captain",
    category: "Leagues",
    q: "How do I set my team for the week?",
    a: "Open League Games → this week's fixture. Drag players into slots 1–5 (or your league size). The app blocks illegal moves (movement caps, sub direction) based on your league's rules.",
  },
  {
    role: "captain",
    category: "Leagues",
    q: "Can I pull in a reserve from a lower team?",
    a: "Reserves can sub up (into a higher-ranked team) but never down. Available reserves appear in the sub picker — anyone greyed out is ineligible for that specific slot.",
  },
  {
    role: "captain",
    category: "Leagues",
    q: "How do I post results to the national body?",
    a: "After all matches are scored, open the fixture and tap Submit to NSA. Your captain credentials (stored encrypted) push the scorecard directly to the association's admin site.",
  },

  // ── Admins ───────────────────────────────────────────────
  {
    role: "admin",
    category: "Club Setup",
    q: "What's the fastest way to onboard my whole club?",
    a: "Club Admin → Members → Import. Paste a CSV (or use the NSA sync if you're affiliated). Members get a first-login link; their profile links to the imported record automatically when they sign up.",
  },
  {
    role: "admin",
    category: "Courts & Lights",
    q: "How do I connect court lights?",
    a: "Courts → Lights. Add each court's Shelly relay (BLE pairing or IP). Set the pre-warm and shutoff windows; the app then triggers them off every confirmed booking. Manual override is always available.",
  },
  {
    role: "admin",
    category: "Courts & Lights",
    q: "Can I charge for lights per hour?",
    a: "Yes — set an hourly light fee under Court Settings. It bills the booking owner automatically once the session ends.",
  },
  {
    role: "admin",
    category: "Members & Billing",
    q: "How do club fees actually flow?",
    a: "Members pay the club. The club settles national body levies (SSA, regional league) in one batch — you don't chase every player. The pass-through ledger under Finance shows exactly what's owed to whom.",
  },
  {
    role: "admin",
    category: "Members & Billing",
    q: "A member says their subs are wrong.",
    a: "Open the member → Fees tab. Every line shows category, period, and status. Adjust the category, waive, or add credit — every change writes to the audit log.",
  },
  {
    role: "admin",
    category: "Leagues",
    q: "How do I set up a new season?",
    a: "Club Admin → Leagues → New Season. Pick your association, set weeks and grids (Men / Ladies / Mixed), then allocate players. Fixtures generate from the association's schedule.",
  },
  {
    role: "admin",
    category: "Tournaments",
    q: "What tournament formats are supported?",
    a: "Round-robin groups with knockouts (standard), Swiss, handicap, and Bells doubles (time-capped, ranked by points scored). Groups are seeded via snake draft; the schedule builds itself.",
  },
  {
    role: "admin",
    category: "Honesty Bar",
    q: "How do I restock the bar?",
    a: "Honesty Bar → Purchases. Log the case, the app updates unit cost and stock on hand. Sales are cash-basis, so margin and stock value are always current.",
  },
  {
    role: "admin",
    category: "Communications",
    q: "How do I email the whole club?",
    a: "Club Admin → Communications → New Campaign. Pick a template or write your own, target by role / league / status, preview, and send. Delivery and open state show under Send Log.",
  },
  {
    role: "admin",
    category: "Payments",
    q: "Which payment gateways can I use?",
    a: "Stitch (EFT / debit-order), Yoco (card), or PayFast. Turn on whichever your members prefer under Payments — you can run more than one at a time.",
  },
  {
    role: "admin",
    category: "Access & Security",
    q: "Can SquashHub open the club gate or door?",
    a: "Yes — via Shelly relay, ZKTeco (ZKBio / Push), or Hikvision face-rec. Access is granted per booking and revoked automatically at slot end. Every open/close is logged.",
  },
  {
    role: "admin",
    category: "Support",
    q: "Something's broken. How do I get help?",
    a: "Tap the feedback button (bottom-right) or open Support. Your message routes straight to the SquashHub team — usually answered same-day.",
  },
];

const roleLabel: Record<string, string> = {
  member: "Member",
  captain: "Captain",
  admin: "Admin",
};

const roleColor: Record<string, string> = {
  member: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  captain: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-500/30",
  admin: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
};

export function HelpFaq({ roleFilter }: { roleFilter: string }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return FAQS.filter((f) => {
      if (roleFilter !== "all" && f.role !== roleFilter) return false;
      if (!needle) return true;
      return (
        f.q.toLowerCase().includes(needle) ||
        f.a.toLowerCase().includes(needle) ||
        f.category.toLowerCase().includes(needle)
      );
    });
  }, [q, roleFilter]);

  const grouped = useMemo(() => {
    const g: Record<string, Faq[]> = {};
    for (const f of filtered) (g[f.category] ||= []).push(f);
    return g;
  }, [filtered]);

  const categories = Object.keys(grouped);

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-primary" />
          Frequently asked questions
        </h2>
      </div>

      <div className="relative mb-4 max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search questions…"
          className="pl-9 h-9"
        />
      </div>

      {categories.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No questions match that search.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {categories.map((cat) => (
            <div key={cat}>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {cat}
              </h3>
              <Card>
                <CardContent className="p-2">
                  <Accordion type="multiple" className="w-full">
                    {grouped[cat].map((f, i) => (
                      <AccordionItem
                        key={`${cat}-${i}`}
                        value={`${cat}-${i}`}
                        className="border-b last:border-b-0"
                      >
                        <AccordionTrigger className="text-left text-sm font-medium hover:no-underline py-3 px-2">
                          <div className="flex items-start gap-2 pr-3">
                            <Badge
                              variant="outline"
                              className={`text-[10px] shrink-0 mt-0.5 ${roleColor[f.role] || ""}`}
                            >
                              {roleLabel[f.role]}
                            </Badge>
                            <span className="flex-1">{f.q}</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="text-sm text-muted-foreground leading-relaxed px-2 pb-3">
                          {f.a}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
