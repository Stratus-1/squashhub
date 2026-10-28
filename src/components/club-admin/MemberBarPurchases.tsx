import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;
const money = (n: number) => `R${n.toFixed(2).replace(".", ",")}`;
const OPEN = new Set(["open", "closing"]);

/**
 * Bar purchases outside the member account: paid at the time (card, cash…) and
 * still-unpaid items on an open bar tab. Neither changes the account balance.
 */
export function MemberBarPurchases({ clubId, memberId }: { clubId: string; memberId: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["member-bar-paid-purchases", clubId, memberId],
    enabled: !!clubId && !!memberId,
    queryFn: async () => {
      const { data: tabs, error: tErr } = await db
        .from("bar_guest_tabs").select("id, status").eq("club_id", clubId).eq("club_member_id", memberId);
      if (tErr) throw tErr;
      const tabStatus = new Map<string, string>((tabs || []).map((t: any) => [t.id, t.status]));
      const ids = [...tabStatus.keys()];
      if (!ids.length) return [];
      const rows: any[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        for (let from = 0; ; from += 1000) {
          const { data: page, error } = await db
            .from("bar_visitor_sales")
            .select("id, created_at, quantity, total, payment_method, payment_status, guest_tab_id, bar_items(name)")
            .eq("club_id", clubId)
            .in("guest_tab_id", ids.slice(i, i + 200))
            .in("payment_status", ["paid", "on_tab", "pending"])
            .order("created_at", { ascending: false })
            .order("id")
            .range(from, from + 999);
          if (error) throw error;
          rows.push(...(page || []));
          if (!page || page.length < 1000) break;
        }
      }
      return rows
        .filter((r) => r.payment_status === "paid" || OPEN.has(tabStatus.get(r.guest_tab_id) || ""))
        .map((r) => ({ ...r, unpaid: r.payment_status !== "paid" }))
        .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    },
  });

  const paid = data.filter((r: any) => !r.unpaid);
  const unpaid = data.filter((r: any) => r.unpaid);
  const paidTotal = paid.reduce((s: number, r: any) => s + Number(r.total || 0), 0);
  const unpaidTotal = unpaid.reduce((s: number, r: any) => s + Number(r.total || 0), 0);
  // Each checkout batch (same tab + same order time) was settled by one payment.
  const batches = new Map<string, { key: string; created_at: string; method: string; total: number; count: number }>();
  for (const r of paid as any[]) {
    const key = `${r.guest_tab_id}|${r.created_at}|${r.payment_method}`;
    const b = batches.get(key) || { key, created_at: r.created_at, method: r.payment_method, total: 0, count: 0 };
    b.total += Number(r.total || 0); b.count += Number(r.quantity || 1);
    batches.set(key, b);
  }
  const rows: any[] = unpaid.map((r: any) => ({ id: r.id, created_at: r.created_at, label: `${r.quantity}× ${r.bar_items?.name || "Bar item"} — unpaid, open tab`, debit: Number(r.total || 0) }));
  for (const b of [...batches.values()].sort((a, c) => +new Date(c.created_at) - +new Date(a.created_at))) {
    rows.push({ id: `pay-${b.key}`, created_at: b.created_at, label: `${b.method === "cash" ? "Cash" : "Card"} payment (${b.count} item${b.count === 1 ? "" : "s"})`, credit: b.total });
    for (const r of paid as any[]) if (`${r.guest_tab_id}|${r.created_at}|${r.payment_method}` === b.key)
      rows.push({ id: r.id, created_at: r.created_at, label: `${r.quantity}× ${r.bar_items?.name || "Bar item"}`, debit: Number(r.total || 0) });
  }

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold">Bar purchases &amp; card/cash payments</p>
        {data.length > 0 && <p className="text-[11px] text-muted-foreground tabular-nums">{money(paidTotal + unpaidTotal)} bought · {money(paidTotal)} paid{unpaidTotal > 0 ? ` · ${money(unpaidTotal)} unpaid on open tab` : ""}</p>}
      </div>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading bar purchases…</p>
      ) : data.length === 0 ? (
        <p className="text-xs text-muted-foreground">No card, cash or open-tab bar purchases.</p>
      ) : (
        <div className="border rounded-lg divide-y">
          <div className="grid grid-cols-[80px_1fr_80px_80px] gap-1 px-3 py-1.5 bg-muted/60 text-[10px] font-semibold uppercase text-muted-foreground">
            <span>Date</span><span>Description</span><span className="text-right">Debit</span><span className="text-right">Credit</span>
          </div>
          {rows.map((r) => (
            <div key={r.id} className={"grid grid-cols-[80px_1fr_80px_80px] gap-1 px-3 py-1.5 text-xs items-center" + (r.credit ? " font-medium" : "")}>
              <span className="text-[10px] text-muted-foreground tabular-nums">{format(new Date(r.created_at), "dd MMM yy HH:mm")}</span>
              <span className="truncate">{r.label}</span>
              <span className="text-right tabular-nums text-destructive">{r.debit ? money(r.debit) : ""}</span>
              <span className="text-right tabular-nums text-green-600">{r.credit ? money(r.credit) : ""}</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-muted-foreground">Card/cash items were paid when bought; open-tab items are still to be settled. Neither is part of the account balance above.</p>
    </div>
  );
}
