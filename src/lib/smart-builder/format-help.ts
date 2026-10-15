/** Plain-language help for base competition formats (Tournament Structure pilot). */
export type BaseFormat = "swiss" | "round_robin" | "knockout" | "monrad";

export interface FormatHelp { title: string; definition: string; idealFor: string; tradeoffs: string; learnMore: string }

export const FORMAT_HELP: Record<BaseFormat, FormatHelp> = {
  round_robin: {
    title: "Round robin",
    definition: "Everyone plays everyone in their pool — or players in selected other pools (Within / Between / Custom).",
    idealFor: "Small groups and leagues where a fair full ranking matters.",
    tradeoffs: "Predictable match count, but it grows fast with group size and can be court-intensive. Add a Knockout playoff stage for pools + playoffs.",
    learnMore: "https://en.wikipedia.org/wiki/Round-robin_tournament",
  },
  swiss: {
    title: "Swiss",
    definition: "A fixed number of rounds; after the first, players meet opponents on similar results. Nobody is eliminated.",
    idealFor: "Large fields with limited rounds where everyone should keep playing.",
    tradeoffs: "Fewer matches than round robin; small fields repeat pairings quickly; ranking is less exact than a full round robin.",
    learnMore: "https://en.wikipedia.org/wiki/Swiss-system_tournament",
  },
  knockout: {
    title: "Knockout",
    definition: "Single-elimination bracket: lose once and you are out of the title draw.",
    idealFor: "Finding a champion quickly, or as a playoff stage (QF / SF / Final) after pools or Swiss.",
    tradeoffs: "Only n−1 matches, but half the field plays once and it does not rank everyone.",
    learnMore: "https://en.wikipedia.org/wiki/Single-elimination_tournament",
  },
  monrad: {
    title: "Monrad (positional draw)",
    definition: "A knockout-like bracket where losers continue in positional brackets, so everyone plays every round and every final place is decided.",
    idealFor: "Club champs and squash events that want full placings, e.g. Swiss → Monrad.",
    tradeoffs: "Everyone plays log2(draw) matches, so it needs more courts/matches than a knockout. Non-power-of-two fields get byes for the top seeds.",
    learnMore: "https://en.wikipedia.org/wiki/Monrad_system",
  },
};

export const baseFormatOf = (kind?: string | null): BaseFormat | null =>
  kind === "pools" || kind === "round_robin" ? "round_robin" : kind === "swiss" || kind === "knockout" || kind === "monrad" ? kind : null;

const KEY = "sh.formatHelp.hidden";
export const formatHelpHidden = (): boolean => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };
export const hideFormatHelp = () => { try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ } };
