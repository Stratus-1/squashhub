/**
 * Local, deterministic help search + contextual prompts.
 *
 * Pure functions only — no React, no network. This is the seam where an AI
 * backend can be plugged in later: buildHelpContext() returns exactly the
 * capability/role-filtered topics that a model should be grounded on.
 */

import { ALL_HELP_TOPICS, type HelpTopic } from "./knowledge";

const STOP_WORDS = new Set([
  "how", "do", "i", "a", "an", "the", "to", "in", "on", "at", "of", "for", "my",
  "is", "are", "can", "you", "we", "it", "and", "with", "what", "where", "when",
  "please", "app", "does", "up", "me", "get", "there", "this", "that",
]);

export function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

export interface HelpFilter {
  /** Enabled capability slugs for the active club */
  enabled: Set<string>;
  isAdmin: boolean;
}

/** Topics this user is allowed to see, given role + club capabilities. */
export function visibleTopics(filter: HelpFilter, topics: HelpTopic[] = ALL_HELP_TOPICS): HelpTopic[] {
  return topics.filter((t) => {
    if (t.audience === "admin" && !filter.isAdmin) return false;
    if (t.capability && !filter.enabled.has(t.capability)) return false;
    return true;
  });
}

export interface HelpMatch {
  topic: HelpTopic;
  score: number;
}

/** Rank visible topics against a free-text question. */
export function searchHelp(query: string, filter: HelpFilter, limit = 4): HelpMatch[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const pool = visibleTopics(filter);

  const matches: HelpMatch[] = [];
  for (const topic of pool) {
    const title = topic.title.toLowerCase();
    const summary = topic.summary.toLowerCase();
    const keywords = topic.keywords.map((k) => k.toLowerCase());
    const category = topic.category.toLowerCase();

    let score = 0;
    for (const t of tokens) {
      if (keywords.some((k) => k === t)) score += 6;
      else if (keywords.some((k) => k.includes(t) || t.includes(k))) score += 4;
      if (title.includes(t)) score += 5;
      if (category.includes(t)) score += 2;
      if (summary.includes(t)) score += 1;
    }
    // whole-phrase bonus
    const phrase = query.trim().toLowerCase();
    if (phrase.length > 6 && title.includes(phrase)) score += 8;
    // curated topics beat raw FAQ rows on ties
    if (score > 0 && !topic.id.startsWith("faq-")) score += 1;

    if (score > 0) matches.push({ topic, score });
  }

  return matches.sort((a, b) => b.score - a.score || a.topic.title.localeCompare(b.topic.title)).slice(0, limit);
}

export interface QuickPrompt {
  label: string;
  query: string;
}

const BASE_PROMPTS: Array<QuickPrompt & { capability?: string; admin?: boolean }> = [
  { label: "How do I book a court?", query: "How do I book a court?", capability: "bookings" },
  { label: "How do I enter a tournament?", query: "How do I enter a tournament?", capability: "tournaments" },
  { label: "How do I score a match?", query: "How do I score a match?" },
  { label: "How do I pay?", query: "How do I pay my fees?", capability: "membership_fees" },
];

const ADMIN_PROMPTS: Array<QuickPrompt & { capability?: string }> = [
  { label: "Turn features on/off", query: "How do I turn features on and off?" },
  { label: "Import members", query: "How do I import members?" },
  { label: "Create a tournament", query: "How do I create a tournament?", capability: "tournaments" },
  { label: "Set membership fees", query: "How do I set membership fees?", capability: "membership_fees" },
  { label: "Message the club", query: "How do I message the whole club?" },
];

const PAGE_PROMPTS: Array<{ match: RegExp; prompts: QuickPrompt[] }> = [
  { match: /^\/bookings/, prompts: [{ label: "Cancel a booking", query: "How do I cancel a booking?" }, { label: "Invite a guest", query: "How do I invite a guest?" }] },
  { match: /^\/tournaments|^\/club-champs/, prompts: [{ label: "Enter a tournament", query: "How do I enter a tournament?" }] },
  { match: /^\/match-marker/, prompts: [{ label: "Score a match", query: "How do I score a match?" }] },
  { match: /^\/ladder|^\/challenges/, prompts: [{ label: "Challenge a player", query: "How do I challenge someone on the ladder?" }] },
  { match: /^\/honesty-bar|^\/scan-pay/, prompts: [{ label: "Buy at the bar", query: "How do I buy something at the bar?" }] },
  { match: /^\/my-account/, prompts: [{ label: "Pay my fees", query: "How do I pay my fees?" }, { label: "Pay for family", query: "Can I pay for my child?" }] },
  { match: /^\/league/, prompts: [{ label: "Sign up for league", query: "How do I sign up for the league?" }] },
];

/** Contextual quick prompts for the current page, role and enabled modules. */
export function quickPrompts(path: string, filter: HelpFilter, limit = 5): QuickPrompt[] {
  const out: QuickPrompt[] = [];
  const seen = new Set<string>();
  const push = (p: QuickPrompt) => {
    if (seen.has(p.query)) return;
    seen.add(p.query);
    out.push(p);
  };

  for (const group of PAGE_PROMPTS) {
    if (group.match.test(path)) group.prompts.forEach(push);
  }

  if (filter.isAdmin && path.startsWith("/club-admin")) {
    ADMIN_PROMPTS.filter((p) => !p.capability || filter.enabled.has(p.capability)).forEach(({ label, query }) =>
      push({ label, query })
    );
  }

  BASE_PROMPTS.filter((p) => !p.capability || filter.enabled.has(p.capability)).forEach(({ label, query }) =>
    push({ label, query })
  );

  if (filter.isAdmin) {
    ADMIN_PROMPTS.filter((p) => !p.capability || filter.enabled.has(p.capability)).forEach(({ label, query }) =>
      push({ label, query })
    );
  }

  return out.slice(0, limit);
}

/**
 * Grounding context for a future AI backend: the exact topics this user is
 * allowed to be answered from, best matches first.
 */
export function buildHelpContext(query: string, filter: HelpFilter, limit = 8): HelpTopic[] {
  const ranked = searchHelp(query, filter, limit).map((m) => m.topic);
  if (ranked.length >= limit) return ranked;
  const rest = visibleTopics(filter).filter((t) => !ranked.includes(t));
  return [...ranked, ...rest.slice(0, limit - ranked.length)];
}
