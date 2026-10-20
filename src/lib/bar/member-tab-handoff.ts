import { supabase } from "@/integrations/supabase/client";

const draftKey = (code: string, tabId: string) => `sh.bar.member-draft.${code}.${tabId}`;

export async function placeMemberCounterOrder(clubId: string, memberId: string, cart: Record<string, number>, requestId: string) {
  // Read the club's current mode before opening anything. Self-service clubs
  // continue through the existing tab checkout, not the staffed order queue.
  const { data: orderProcess, error: modeError } = await supabase.rpc("bar_order_process_status", { _club_id: clubId });
  if (modeError) throw modeError;
  if (orderProcess === false) return openMemberCounterTab(clubId, memberId, cart);
  if (orderProcess !== true) throw new Error("Could not check the bar's order settings. Please try again.");
  const { data, error } = await supabase.rpc("open_my_bar_tab", { _club_id: clubId, _club_member_id: memberId });
  if (error) throw error;
  const tab = data as { tab_id?: string; token?: string; code?: string } | null;
  if (!tab?.tab_id || !tab.token || !tab.code) throw new Error("Could not open your tab");
  const { error: orderError } = await supabase.rpc("bar_submit_guest_order", {
    _tab_id: tab.tab_id,
    _token: tab.token,
    _lines: Object.entries(cart).filter(([, quantity]) => quantity > 0).map(([bar_item_id, quantity]) => ({ bar_item_id, quantity })),
    _fulfilment: "collect", _location: "", _note: "", _idempotency_key: requestId,
  });
  if (orderError) throw orderError;
  localStorage.setItem(`sh.scanpay.tab.${tab.code}`, JSON.stringify({ tab_id: tab.tab_id, token: tab.token }));
  return `/s/${encodeURIComponent(tab.code)}?member_tab=${encodeURIComponent(tab.tab_id)}`;
}

export async function openMemberCounterTab(clubId: string, memberId: string, cart: Record<string, number>) {
  const { data, error } = await supabase.rpc("open_my_bar_tab", { _club_id: clubId, _club_member_id: memberId });
  if (error) throw error;
  const tab = data as { tab_id?: string; token?: string; code?: string } | null;
  if (!tab?.tab_id || !tab.token || !tab.code) throw new Error("Could not open your tab");
  sessionStorage.setItem(draftKey(tab.code, tab.tab_id), JSON.stringify(cart));
  // Keep tab credentials out of URLs and router history.
  localStorage.setItem(`sh.scanpay.tab.${tab.code}`, JSON.stringify({ tab_id: tab.tab_id, token: tab.token }));
  return `/s/${encodeURIComponent(tab.code)}?member_tab=${encodeURIComponent(tab.tab_id)}`;
}

export function takeMemberTabDraft(code: string, tabId: string | null): Record<string, number> {
  if (!tabId) return {};
  const key = draftKey(code, tabId);
  const raw = sessionStorage.getItem(key);
  if (!raw) return {};
  sessionStorage.removeItem(key);
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const cart: Record<string, number> = {};
    for (const [id, qty] of Object.entries(parsed)) {
      if (typeof qty === "number" && Number.isInteger(qty) && qty > 0 && qty <= 50) cart[id] = qty;
    }
    return cart;
  } catch { return {}; }
}