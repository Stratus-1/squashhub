/**
 * In-app help knowledge base for the Help Assistant.
 *
 * This is the grounding corpus for the assistant's answers. Everything here is
 * local, deterministic content — no external AI call. Each topic can be gated by
 * club capability (so we never explain a switched-off module) and by audience
 * (so members never see admin-only instructions).
 *
 * When an AI backend is added later it should be given the SAME filtered subset
 * of topics as context (see buildHelpContext in ./search).
 */

import type { Capability } from "@/lib/capabilities";
import { FAQS } from "@/components/help/HelpFaq";

export type HelpAudience = "member" | "admin";

export interface HelpTopic {
  id: string;
  title: string;
  /** Short plain-language answer shown first */
  summary: string;
  /** Optional numbered steps */
  steps?: string[];
  keywords: string[];
  /** Deep link to the page/action that resolves the question */
  route?: string;
  routeLabel?: string;
  /** Hide the topic when the club has this capability switched off */
  capability?: Capability;
  /** "admin" topics are only ever shown to club admins */
  audience: HelpAudience;
  category: string;
}

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: "book-court",
    title: "How do I book a court?",
    summary:
      "Open Court Bookings, pick the day, then tap an open slot in the grid. Confirm the court, time and who you're playing with.",
    steps: [
      "Open Court Bookings from your dashboard.",
      "Choose the date at the top of the grid.",
      "Tap a free slot — greyed slots are taken, blocked, or outside your booking window.",
      "Add your opponent or a guest, then confirm.",
    ],
    keywords: ["book", "booking", "court", "reserve", "slot", "grid", "time"],
    route: "/bookings",
    routeLabel: "Open Court Bookings",
    capability: "bookings",
    audience: "member",
    category: "Bookings",
  },
  {
    id: "cancel-booking",
    title: "How do I cancel or change a booking?",
    summary:
      "Open Court Bookings, tap your existing booking in the grid and choose Cancel. The slot is freed immediately for other members.",
    keywords: ["cancel", "change", "move", "booking", "reschedule", "delete"],
    route: "/bookings",
    routeLabel: "Open Court Bookings",
    capability: "bookings",
    audience: "member",
    category: "Bookings",
  },
  {
    id: "invite-guest",
    title: "How do I invite a guest or a player from another club?",
    summary:
      "Create the booking, then tap Invite and share the WhatsApp or email link. Visitors don't need an account — they confirm from the link.",
    keywords: ["guest", "visitor", "invite", "whatsapp", "share", "friend"],
    route: "/bookings",
    routeLabel: "Open Court Bookings",
    capability: "bookings",
    audience: "member",
    category: "Bookings",
  },
  {
    id: "score-match",
    title: "How do I score a match?",
    summary:
      "Use Score a Match on your dashboard. Pick the match source (booking, league fixture or tournament match — or just a casual game), then tap the winner of each rally.",
    steps: [
      "Tap Score a Match on the dashboard.",
      "Choose the source: casual game, court booking, league fixture or tournament match.",
      "Confirm the players and starting server.",
      "Score point by point; the result is submitted when the match ends.",
    ],
    keywords: ["score", "scoring", "mark", "marker", "referee", "match", "game", "result", "live"],
    route: "/match-marker",
    routeLabel: "Open the match marker",
    audience: "member",
    category: "Matches",
  },
  {
    id: "record-result",
    title: "How do I record a result I already played?",
    summary:
      "Use Record a result. Enter the opponent (member or visitor) and the game scores; your opponent confirms, or it auto-confirms after your club's window.",
    keywords: ["record", "result", "past", "history", "confirm", "opponent", "log"],
    route: "/add-result",
    routeLabel: "Record a result",
    audience: "member",
    category: "Matches",
  },
  {
    id: "challenge",
    title: "How do I challenge someone on the ladder?",
    summary:
      "Open the Ladder, tap a player within your allowed range and send a challenge with a proposed time. They can accept or counter-propose.",
    keywords: ["challenge", "ladder", "rank", "position", "climb", "opponent"],
    route: "/ladder",
    routeLabel: "Open the Ladder",
    capability: "ladder",
    audience: "member",
    category: "Ladder",
  },
  {
    id: "enter-tournament",
    title: "How do I enter a tournament?",
    summary:
      "Open Tournaments, choose an upcoming event and tap Enter. Pick your category (and partner for doubles) — a doubles entry only stands once both players are paid.",
    steps: [
      "Open Tournaments.",
      "Pick an event from the Current / Upcoming list.",
      "Tap Enter and choose your category.",
      "For doubles, select your partner.",
      "Pay the entry fee (or upload proof of payment if your club uses EFT).",
    ],
    keywords: ["tournament", "enter", "entry", "register", "championship", "event", "draw", "doubles", "partner"],
    route: "/tournaments",
    routeLabel: "Open Tournaments",
    capability: "tournaments",
    audience: "member",
    category: "Tournaments",
  },
  {
    id: "pay-fees",
    title: "How do I pay?",
    summary:
      "My Account → Fees lists every open item: subs, league entries, national levies, tournament entries and your bar tab. Pay in full or partially with your club's payment option.",
    steps: [
      "Open My Account.",
      "Go to the Fees tab.",
      "Select the items you want to settle.",
      "Tap Pay and follow your club's gateway.",
    ],
    keywords: ["pay", "payment", "fees", "subs", "invoice", "owe", "balance", "outstanding", "money", "card", "eft"],
    route: "/my-account",
    routeLabel: "Open My Account",
    capability: "membership_fees",
    audience: "member",
    category: "Billing",
  },
  {
    id: "pay-for-family",
    title: "Can I pay for my partner or child?",
    summary:
      "Yes — use Account Delegation in My Account. Add them by member number and cell; once they accept you'll see their fees next to yours (up to 5 people).",
    keywords: ["family", "child", "kid", "partner", "delegate", "delegation", "someone else", "spouse"],
    route: "/my-account",
    routeLabel: "Open My Account",
    capability: "membership_fees",
    audience: "member",
    category: "Billing",
  },
  {
    id: "bar-pos",
    title: "How do I buy something at the bar?",
    summary:
      "Open Bar / POS, tap what you took and confirm. You can pay by card there and then, or charge it to your member account and settle it later from My Account.",
    keywords: ["bar", "pos", "drink", "beer", "tab", "honesty", "buy", "snack", "scan", "qr"],
    route: "/honesty-bar",
    routeLabel: "Open Bar / POS",
    capability: "bar",
    audience: "member",
    category: "Bar / POS",
  },
  {
    id: "league-signup",
    title: "How do I sign up for the league?",
    summary:
      "Open the League page, pick the season and confirm your details. Your captain then sees you in the team pool for allocation.",
    keywords: ["league", "season", "sign up", "signup", "team", "register", "nsa", "association"],
    route: "/league-games",
    routeLabel: "Open League Games",
    capability: "leagues",
    audience: "member",
    category: "Leagues",
  },
  {
    id: "events-rsvp",
    title: "How do I RSVP to a club event?",
    summary: "Open Events, tap the event and choose Going / Not going. Your club sees the numbers immediately.",
    keywords: ["event", "rsvp", "social", "attend", "going", "club night"],
    route: "/events",
    routeLabel: "Open Events",
    capability: "events",
    audience: "member",
    category: "Events",
  },
  {
    id: "profile-avatar",
    title: "How do I change my profile or photo?",
    summary:
      "My Account → Profile. On a shared family login, switch to the right person first — each member keeps their own avatar and stats.",
    keywords: ["profile", "photo", "avatar", "details", "email", "cell", "phone", "switch", "family", "account"],
    route: "/my-account",
    routeLabel: "Open My Account",
    audience: "member",
    category: "Account",
  },
  {
    id: "tutorials",
    title: "Where are the video tutorials?",
    summary: "Help & Tutorials has short how-to videos plus the full FAQ, filtered by member, captain or admin.",
    keywords: ["video", "tutorial", "guide", "how to", "training", "faq", "learn", "help"],
    route: "/help",
    routeLabel: "Open Help & Tutorials",
    audience: "member",
    category: "Help",
  },
  {
    id: "contact-support",
    title: "How do I contact support?",
    summary:
      "Open Support to chat directly with the SquashHub team, or use Report an issue in this panel to send a bug with your page details attached.",
    keywords: ["support", "help", "contact", "bug", "broken", "issue", "problem", "report"],
    route: "/support",
    routeLabel: "Open Support",
    audience: "member",
    category: "Help",
  },

  // ── Admin-only ────────────────────────────────────────────
  {
    id: "admin-quick-setup",
    title: "How do I set up the club / turn features on and off?",
    summary:
      "Club Admin → Features. Quick Setup asks a few plain questions and switches on only what your club does. Turning a module off never deletes data.",
    keywords: ["setup", "features", "modules", "enable", "disable", "turn on", "quick setup", "capability", "configure"],
    route: "/club-admin?tab=features",
    routeLabel: "Open Features",
    audience: "admin",
    category: "Club Setup",
  },
  {
    id: "admin-add-members",
    title: "How do I add or import members?",
    summary:
      "Club Admin → Members. Add one at a time, or use Import to paste a CSV. Imported members link automatically when they sign up.",
    keywords: ["member", "members", "import", "csv", "add", "roster", "onboard", "invite"],
    route: "/club-admin?tab=members",
    routeLabel: "Open Members",
    audience: "admin",
    category: "Members",
  },
  {
    id: "admin-courts",
    title: "How do I add courts and booking rules?",
    summary:
      "Club Admin → Courts. Add each court, set slot length, peak hours, daily limits and how far ahead members may book.",
    keywords: ["court", "courts", "slot", "peak", "rules", "booking window", "limit"],
    route: "/club-admin?tab=courts",
    routeLabel: "Open Courts",
    capability: "bookings",
    audience: "admin",
    category: "Courts",
  },
  {
    id: "admin-lights",
    title: "How do I connect court lights?",
    summary:
      "Club Admin → Court Lights. Add each court's relay, set pre-warm and shut-off windows; lights then follow confirmed bookings. Manual override stays available.",
    keywords: ["lights", "shelly", "relay", "switch", "power", "lighting"],
    route: "/club-admin?tab=lights",
    routeLabel: "Open Court Lights",
    capability: "lights",
    audience: "admin",
    category: "Courts",
  },
  {
    id: "admin-fees",
    title: "How do I set membership fees?",
    summary:
      "Club Admin → Membership & Fees. Create fee categories and periods, assign members, and the app raises their subs automatically.",
    keywords: ["fees", "subs", "category", "billing", "levy", "dues", "invoice", "charge"],
    route: "/club-admin?tab=fees",
    routeLabel: "Open Membership & Fees",
    capability: "membership_fees",
    audience: "admin",
    category: "Money",
  },
  {
    id: "admin-payments",
    title: "How do I accept payments?",
    summary:
      "Club Admin → Banking & Payments. Switch on the gateway your members use; you can run more than one at a time.",
    keywords: ["gateway", "stitch", "yoco", "payfast", "payments", "banking", "card", "debit order"],
    route: "/club-admin?tab=payments",
    routeLabel: "Open Banking & Payments",
    capability: "payments",
    audience: "admin",
    category: "Money",
  },
  {
    id: "admin-tournament",
    title: "How do I create a tournament?",
    summary:
      "Club Admin → Tournaments. Set the structure (groups, Swiss, knockout or Bells doubles), then the dates, daily time windows and courts — the capacity check confirms it fits before you publish.",
    keywords: ["tournament", "create", "champs", "draw", "groups", "knockout", "schedule", "capacity", "bells"],
    route: "/club-admin?tab=tournaments",
    routeLabel: "Open Tournaments admin",
    capability: "tournaments",
    audience: "admin",
    category: "Tournaments",
  },
  {
    id: "admin-leagues",
    title: "How do I run a league season?",
    summary:
      "Club Admin → Leagues. Create the season, add grids (Men / Ladies / Mixed), allocate players, then captains fill teams each week.",
    keywords: ["league", "season", "grid", "allocate", "teams", "captain", "fixtures"],
    route: "/club-admin?tab=leagues",
    routeLabel: "Open Leagues admin",
    capability: "leagues",
    audience: "admin",
    category: "Leagues",
  },
  {
    id: "admin-bar",
    title: "How do I manage the bar / POS?",
    summary:
      "Club Admin → Bar / POS. Manage products and prices, log purchases to restock, and print QR labels for self-service card payment or account charges.",
    keywords: ["bar", "pos", "stock", "restock", "product", "price", "qr", "inventory", "margin"],
    route: "/club-admin?tab=bar",
    routeLabel: "Open Bar / POS admin",
    capability: "bar",
    audience: "admin",
    category: "Bar / POS",
  },
  {
    id: "admin-comms",
    title: "How do I message the whole club?",
    summary:
      "Club Admin → Communications. Pick a template, target by role / league / status, preview and send. Delivery shows in the send log.",
    keywords: ["email", "campaign", "message", "communication", "notify", "bulk", "whatsapp", "sms", "announce"],
    route: "/club-admin?tab=communications",
    routeLabel: "Open Communications",
    audience: "admin",
    category: "Communications",
  },
  {
    id: "admin-finance",
    title: "Where do I see the club's books?",
    summary:
      "Club Admin → Club Books. Cash-basis ledger, income and expenses, outstanding member balances and the pass-through owed to national bodies.",
    keywords: ["finance", "books", "ledger", "accounting", "report", "income", "expense", "statement", "reconcile"],
    route: "/club-admin?tab=finance",
    routeLabel: "Open Club Books",
    capability: "finance",
    audience: "admin",
    category: "Money",
  },
  {
    id: "admin-permissions",
    title: "How do I give someone admin access?",
    summary:
      "Club Admin → Permissions. Grant a role or tick individual permissions per member. Captain access is league-scoped only — it never grants full club admin.",
    keywords: ["permission", "role", "admin", "access", "captain", "rights", "grant"],
    route: "/club-admin?tab=permissions",
    routeLabel: "Open Permissions",
    audience: "admin",
    category: "Club Setup",
  },
];

/** FAQ entries reused as searchable topics (captain content is treated as member-level). */
export const FAQ_TOPICS: HelpTopic[] = FAQS.map((f, i) => ({
  id: `faq-${i}`,
  title: f.q,
  summary: f.a,
  keywords: [],
  audience: f.role === "admin" ? "admin" : "member",
  category: f.category,
  route: "/help",
  routeLabel: "Open Help & Tutorials",
}));

export const ALL_HELP_TOPICS: HelpTopic[] = [...HELP_TOPICS, ...FAQ_TOPICS];
