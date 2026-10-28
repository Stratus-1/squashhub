import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;
const money = (n: number) => `R${n.toFixed(2).replace(".", ",")}`;

/**
 * Bar purchases a member paid at the time (card, cash…). These never touch the
 * member's account, so they are listed separately and do not change the balance.
 */
export function MemberBarPurchases({ clubId, memberId }: { clubId: string; memberId: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["member-bar-paid-purchases", clubId, memberId],
    enabled: !!clubId && !!memberId,
    queryFn: async () => {
      const { data: tabs, error: tErr } = await db
        .from("bar_guest_tabs").select("id").eq("club_id", clubId).eq("club_member_id", memberId);
      if (tErr) throw tErr;
      const ids = (tabs || []).map((t: any) => t.id);
      if (!ids.length) return [];
      const rows: any[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        for (let from = 0; ; from += 1000) {
          const { data: page, error } = await db
            .from("bar_visitor_sales")
            .select("id, created_at, quantity, total, payment_method, payment_status, bar_items(name)")
            .eq("club_id", clubId)
            .in("guest_tab_id", ids.slice(i, i + 200))
            .eq("payment_status", "paid")
            .order("created_at", { ascending: false })
            .order("id")
            .range(from, from + 999);
          if (error) throw error;
          rows.push(...(page || []));
          if (!page || page.length < 1000) break;
        }
      }
      return rows.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    },
  });

  const total = data.reduce((s: number, r: any) => s + Number(r.total || 0), 0);

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold">Bar purchases paid at the time</p>
        {data.length > 0 && <p className="text-[11px] text-muted-foreground tabular-nums">{data.length} items · {money(total)}</p>}
      </div>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading bar purchases…</p>
      ) : data.length === 0 ? (
        <p className="text-xs text-muted-foreground">No card or cash bar purchases.</p>
      ) : (
        <div className="border rounded-lg divide-y">
          {data.map((r: any) => (
            <div key={r.id} className="grid grid-cols-[80px_1fr_70px_80px] gap-1 px-3 py-1.5 text-xs items-center">
              <span className="text-[10px] text-muted-foreground tabular-nums">{format(new Date(r.created_at), "dd MMM yy")}</span>
              <span className="truncate">{r.quantity}× {r.bar_items?.name || "Bar item"}</span>
              <span className="text-[10px] text-muted-foreground capitalize">{r.payment_method}</span>
              <span className="text-right tabular-nums">{money(Number(r.total || 0))}</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-muted-foreground">Paid in full when bought — not charged to the member account and not part of the balance above.</p>
    </div>
  );
}
