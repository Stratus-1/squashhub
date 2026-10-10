/**
 * Estimate-vs-actual recommendations: prominent while planning, a collapsed reference link once
 * ANY draw (saved fixture) exists, hidden when nothing differs. Never applies anything itself.
 */
export function fieldReviewMode(drawSaved: boolean, pendingReviews: number): "none" | "prominent" | "collapsed" {
  if (pendingReviews <= 0) return "none";
  return drawSaved ? "collapsed" : "prominent";
}
