/**
 * Opponent contact sharing — client side of ONE national, person-level, opt-in preference.
 * All reads/writes go through SECURITY DEFINER RPCs (`get_contact_sharing`, `set_contact_sharing`,
 * `get_fixture_opponent_contacts`); the preference table itself is not readable by the app.
 * Numbers are only ever returned per fixture, to an authenticated participant, while the game is
 * still open, and only for opponents who opted in (under-18s: confirmed guardian contact only).
 */
import { supabase } from "@/integrations/supabase/client";

export const CONTACT_CONSENT_LABEL =
  "Allow my mobile number to be shared with my actual scheduled opponents for arranging matches in SquashHub tournaments, leagues and ladder challenges";
export const CONTACT_CONSENT_HELP =
  "Only players drawn against you in a game that hasn't been played yet can see it, only inside SquashHub and in their personal fixture messages. It is never shown on public pages, results or member lists. You can withdraw at any time in Settings. Saying no doesn't affect your account or your entries.";

export type ContactPref = {
  available: boolean; name?: string; share?: boolean; adult_confirmed?: boolean; minor?: boolean; age_known?: boolean;
  guardian_name?: string | null; guardian_phone?: string | null; guardian_confirmed?: boolean; updated_at?: string | null;
};
export type OpponentContact = { member_id: string; name: string | null; phone: string | null; is_guardian: boolean; guardian_name: string | null };
export type FixtureKind = "champ" | "challenge";

export async function getContactPref(memberId: string): Promise<ContactPref> {
  const { data, error } = await (supabase as any).rpc("get_contact_sharing", { p_member_id: memberId });
  if (error) throw error;
  return data as ContactPref;
}

export async function setContactPref(memberId: string, input: {
  share: boolean; source: "activation" | "settings" | "registration"; adultConfirmed?: boolean;
  guardianName?: string; guardianPhone?: string; guardianConfirm?: boolean;
}): Promise<ContactPref> {
  const { data, error } = await (supabase as any).rpc("set_contact_sharing", {
    p_member_id: memberId, p_share: input.share, p_source: input.source, p_adult_confirmed: !!input.adultConfirmed,
    p_guardian_name: input.guardianName ?? null, p_guardian_phone: input.guardianPhone ?? null, p_guardian_confirm: !!input.guardianConfirm,
  });
  if (error) throw error;
  return data as ContactPref;
}

export async function getOpponentContacts(kind: FixtureKind, fixtureId: string): Promise<OpponentContact[]> {
  const { data, error } = await (supabase as any).rpc("get_fixture_opponent_contacts", { p_kind: kind, p_fixture_id: fixtureId });
  if (error) throw error;
  return (data ?? []) as OpponentContact[];
}

/** tel: / wa.me links from a SA-style number; never logged. */
export function phoneLinks(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const intl = digits.startsWith("0") ? `27${digits.slice(1)}` : digits;
  return { tel: `tel:${phone.replace(/[^\d+]/g, "")}`, whatsapp: `https://wa.me/${intl}` };
}

/** Activation consent is kept across a Google redirect for THIS token only, never pre-ticked. */
const k = (token: string) => `sh.activate.contact.${token.slice(0, 16)}`;
export const rememberActivationConsent = (token: string, v: { share: boolean; adult: boolean }) => { try { sessionStorage.setItem(k(token), JSON.stringify(v)); } catch { /* ignore */ } };
export const readActivationConsent = (token: string): { share: boolean; adult: boolean } | null => { try { const r = sessionStorage.getItem(k(token)); return r ? JSON.parse(r) : null; } catch { return null; } };
export const clearActivationConsent = (token: string) => { try { sessionStorage.removeItem(k(token)); } catch { /* ignore */ } };
