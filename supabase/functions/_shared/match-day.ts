// Match Day Access helpers for emails. Reuses the competition's persistent
// token (never mints one per email). Returns null when access is not enabled.
const ROOT = "squashhub.co.za";

export interface MatchDayLinks { url: string; qrUrl: string }

export async function matchDayLinks(
  admin: any,
  opts: { kind: "tournament" | "league_season"; competitionId: string; subdomain?: string | null; court?: number | null; matchId?: string | null },
): Promise<MatchDayLinks | null> {
  const { data } = await admin.from("match_day_access").select("token")
    .eq("competition_kind", opts.kind).eq("competition_id", opts.competitionId).eq("status", "active").maybeSingle();
  if (!data?.token) return null;
  const base = opts.subdomain ? `https://${opts.subdomain}.${ROOT}` : `https://${ROOT}`;
  let path = `/md/${data.token}`;
  if (opts.court != null && Number.isFinite(opts.court)) path += `/court/${opts.court}`;
  if (opts.matchId && /^[0-9a-f-]{36}$/i.test(opts.matchId)) path += `?match=${opts.matchId}`;
  const url = `${base}${path}`;
  const qrUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/match-day-qr?u=${encodeURIComponent(url)}`;
  return { url, qrUrl };
}

export function matchDayEmailBlock(l: MatchDayLinks): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;border:1px solid #e2e8f0;border-radius:10px;width:100%"><tr><td style="padding:14px;font-family:Arial,sans-serif">
<p style="margin:0 0 8px;font-weight:bold;color:#1E3A5F">Match day: scoring, live games &amp; standings</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#1E3A5F;border-radius:8px"><a href="${l.url}" style="display:inline-block;padding:10px 18px;color:#ffffff !important;font-weight:bold;text-decoration:none">Open scoring</a></td></tr></table>
<p style="margin:10px 0 4px;font-size:12px;color:#64748b">Or scan at the club:</p>
<img src="${l.qrUrl}" width="140" height="140" alt="Match day QR code" style="display:block"/>
</td></tr></table>`;
}
