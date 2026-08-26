/**
 * Guided workflows — the assistant is a doer, not just Q&A.
 *
 * A workflow is an ordered list of plain-language steps, each optionally
 * pointing at an action KEY from the AI action registry (never a URL). The
 * assistant walks the user through them one at a time and always knows what
 * the next step is.
 *
 * Adding a workflow for a new module is a data change here — no engine change.
 */
import type { CommsActionParams } from "@/lib/comms/actions";

export type WorkflowStep = {
  title: string;
  /** What the user should do, said the way a helpful club-mate would say it. */
  detail: string;
  action?: { key: string; params?: CommsActionParams; label?: string };
};

export type WorkflowDef = {
  key: string;
  title: string;
  /** One-liner shown on the suggestion chip. */
  summary: string;
  /** Who may run it. */
  audience: "member" | "captain" | "admin";
  capability?: string;
  /** Phrases that should start this workflow (matched loosely). */
  triggers: string[];
  steps: WorkflowStep[];
};

export const WORKFLOWS: WorkflowDef[] = [
  {
    key: "league_team_night",
    title: "Set up tonight's team",
    summary: "Pick your side, fill gaps with reserves and let everyone know.",
    audience: "captain",
    capability: "leagues",
    triggers: [
      "set up tonight's team",
      "setup my team",
      "team for tonight",
      "league line-up",
      "lineup for tonight",
      "pick my team",
    ],
    steps: [
      {
        title: "Open tonight's fixture",
        detail: "Find this week's fixture for your team — that's where the line-up lives.",
        action: { key: "league_games", label: "Open my fixtures" },
      },
      {
        title: "Check who is available",
        detail:
          "Players who marked themselves unavailable are flagged. Anyone who hasn't answered still counts as unknown, so check with them.",
        action: { key: "availability", label: "See availability" },
      },
      {
        title: "Fill the positions",
        detail:
          "Drag players into positions 1 to 5. The order must follow your club ladder — the app blocks a swap that breaks the league's movement rule.",
      },
      {
        title: "Add reserves where you're short",
        detail:
          "Use the reserves picker for empty slots. A reserve may only move UP into a stronger league, never down, and the substitution rules for your association are applied automatically.",
      },
      {
        title: "Confirm the line-up",
        detail:
          "Confirm to lock it in. Confirming stamps who set it and when, so a later change is never silently overwritten.",
      },
      {
        title: "Tell the team",
        detail:
          "Send the line-up out. Pick the channels you want for this send — the same message goes as email, WhatsApp or an in-app notification.",
        action: { key: "admin_comms", label: "Send the line-up" },
      },
    ],
  },
  {
    key: "create_tournament",
    title: "Create a tournament",
    summary: "From dates and courts through divisions to the first draw.",
    audience: "admin",
    capability: "tournaments",
    triggers: ["create a tournament", "new tournament", "set up a tournament", "run club champs"],
    steps: [
      {
        title: "Start the tournament",
        detail: "Give it a name, say whether it's a club, association or federation event, and who may enter.",
        action: { key: "admin_tournaments", label: "Open tournament setup" },
      },
      {
        title: "Add your divisions",
        detail:
          "Each division has its own format, pools and winner — for example Men's A, Ladies and a Doubles division.",
      },
      {
        title: "Dates, times and courts",
        detail:
          "Set the dates and tick the courts you'll use. The capacity check runs here and tells you whether the schedule actually fits.",
      },
      {
        title: "Invite players",
        detail: "Invite the whole club, a selected group, or open entries to your association.",
      },
      {
        title: "Seed and confirm the draw",
        detail:
          "Use the visual draw board — drag players into the shape you want, then confirm. Confirming creates the fixtures and notifies everyone in the round.",
      },
    ],
  },
  {
    key: "send_invoices",
    title: "Send member invoices",
    summary: "Preview the run, check the numbers, then issue and email.",
    audience: "admin",
    capability: "membership_fees",
    triggers: ["send invoices", "bill members", "run billing", "invoice the members"],
    steps: [
      {
        title: "Open fees & invoices",
        detail: "Everything for a billing run lives on the Fees tab.",
        action: { key: "admin_fees", label: "Open fees & invoices" },
      },
      {
        title: "Preview the run",
        detail:
          "Do a dry run first. It shows exactly who will be billed, for how much, and flags anything unusual before a cent moves.",
      },
      {
        title: "Check the dates",
        detail: "Invoices issue on your fixed issue day and fall due on the due day you set — confirm both look right.",
      },
      {
        title: "Issue and send",
        detail: "Issue the run, then send the invoices out. Delivery is logged so you can see who received theirs.",
      },
    ],
  },
  {
    key: "register_club_champs",
    title: "Enter the club championship",
    summary: "Pick your division, choose a partner for doubles, and pay.",
    audience: "member",
    capability: "tournaments",
    triggers: ["enter club champs", "register for club champs", "sign up for the tournament"],
    steps: [
      {
        title: "Open the championship",
        detail: "Find the event you were invited to.",
        action: { key: "tournaments", label: "View tournaments" },
      },
      {
        title: "Choose your divisions",
        detail: "You may enter more than one division — for example singles and doubles.",
      },
      {
        title: "Pick a partner (doubles)",
        detail:
          "For a doubles division, choose your partner and say whether you're paying for them. The pair only locks once every required payment has gone through.",
      },
      {
        title: "Pay your entry",
        detail: "Pay by card or upload your EFT proof of payment. Your entry confirms as soon as payment settles.",
      },
    ],
  },
  {
    key: "book_court",
    title: "Book a court",
    summary: "Find a slot, invite an opponent and get the lights on.",
    audience: "member",
    capability: "bookings",
    triggers: ["book a court", "make a booking", "court booking"],
    steps: [
      {
        title: "Open the booking grid",
        detail: "Pick your day and tap a free slot.",
        action: { key: "bookings", label: "Book a court" },
      },
      {
        title: "Add who you're playing",
        detail: "Add a member or a visitor. Visitors are billed to the person who booked.",
      },
      {
        title: "Share the booking",
        detail: "Send the invite so your opponent can confirm.",
      },
    ],
  },
  {
    key: "update_profile_skills",
    title: "Add my skills to the club directory",
    summary: "Tell the club what you do and whether you'd volunteer.",
    audience: "member",
    triggers: ["add my skills", "update my profile", "volunteer"],
    steps: [
      {
        title: "Open Skills & Expertise",
        detail: "It's on your profile, under your personal details.",
        action: { key: "profile_skills", label: "Update my skills" },
      },
      {
        title: "Add your occupation and skills",
        detail: "Tick what applies and add anything else in your own words.",
      },
      {
        title: "Say if you'd help out",
        detail: "Tick 'willing to volunteer' so the committee knows who to ask.",
      },
    ],
  },
];

export const WORKFLOW_MAP: Record<string, WorkflowDef> = Object.fromEntries(
  WORKFLOWS.map((w) => [w.key, w]),
);

export type WorkflowAudienceCtx = {
  isAdmin?: boolean;
  isCaptain?: boolean;
  capabilities?: Set<string> | string[];
};

function caps(ctx: WorkflowAudienceCtx): Set<string> | null {
  if (!ctx.capabilities) return null;
  return ctx.capabilities instanceof Set ? ctx.capabilities : new Set(ctx.capabilities);
}

/** Workflows this person may actually run, given role + club capabilities. */
export function availableWorkflows(ctx: WorkflowAudienceCtx): WorkflowDef[] {
  const enabled = caps(ctx);
  return WORKFLOWS.filter((w) => {
    if (w.capability && enabled && !enabled.has(w.capability)) return false;
    if (w.audience === "admin" && !ctx.isAdmin) return false;
    if (w.audience === "captain" && !ctx.isAdmin && !ctx.isCaptain) return false;
    return true;
  });
}

function normalise(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** Best matching workflow for a free-text/spoken request, or null. */
export function matchWorkflow(text: string, ctx: WorkflowAudienceCtx = {}): WorkflowDef | null {
  const q = normalise(text);
  if (!q) return null;
  const pool = availableWorkflows(ctx);
  let best: { w: WorkflowDef; score: number } | null = null;

  for (const w of pool) {
    for (const trigger of w.triggers) {
      const t = normalise(trigger);
      let score = 0;
      if (q.includes(t)) score = 100 + t.length;
      else {
        const words = t.split(" ").filter((x) => x.length > 2);
        const hits = words.filter((word) => q.includes(word)).length;
        if (words.length && hits / words.length >= 0.75) score = 40 + hits;
      }
      if (score && (!best || score > best.score)) best = { w, score };
    }
  }
  return best?.w ?? null;
}

/** The next step to present (0-based index), clamped to the workflow length. */
export function stepAt(workflow: WorkflowDef, index: number): WorkflowStep | null {
  if (index < 0 || index >= workflow.steps.length) return null;
  return workflow.steps[index];
}
