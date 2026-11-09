import { preferredSwissTemplate } from "./swiss-no-repeat";

/**
 * Template used by the positional preview. It must show exactly the pairings the
 * writer will create, so it follows the frozen chart (docs/SWISS_24_PLAYER_TEMPLATE.md,
 * 25 Oct 2026) for every field size. The superseded 20 Oct 24-player draft
 * (R4 1v4/2v3, R5 3v4/9v10) made the preview disagree with saved games.
 */
export function swissPreviewFinalsTemplate(n: number, round: number) {
  return preferredSwissTemplate(n, round);
}
