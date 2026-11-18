import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;
const money = (n: number) => `R${n.toFixed(2).replace(".", ",")}`;
const OPEN = ["open", "closing"];

/**
 * Items still unpaid on the member's open bar tab. They are not transactions
 * yet, so they sit under the statement and never change the balance. Card /
 * cash purchases are shown inside the statement itself (same lines as the
 * member's My Account page).
 */
export function MemberBarPurchases({ clubId, memberId }: { clubId: string; memberId: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["member-bar-open-tab-items", clubId, memberId],
    enabled: !!clubId && !!memberId,
    queryFn: async () => {
      const { data: tabs, error: tErr } = await db
        .from("bar_guest_tabs").select("id").eq("club_id", clubId).eq("club_member_id", memberId).in("status", OPEN);
      if (tErr) throw tErr;
      const ids = (tabs || []).map((t: any) => t.id);
      if (!ids.length) return [];
      const { data: rows, error } = await db
        .from("bar_visitor_sales")
        .select("id, created_at, quantity, total, bar_items(name)")
        .eq("club_id", clubId)
        .in("guest_tab_id", ids)
        .in("payment_status", ["on_tab", "pending"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (rows || []) as any[];
    },
  });

  if (isLoading || data.length === 0) return null;
  const total = data.reduce((s: number, r: any) => s + Number(r.total || 0), 0);

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold">Unpaid items on open bar tab</p>
        <p className="text-[11px] text-muted-foreground tabular-nums">{money(total)}</p>
      </div>
      <div className="border rounded-lg divide-y">
        {data.map((r: any) => (
          <div key={r.id} className="grid grid-cols-[100px_1fr_80px] gap-1 px-3 py-1.5 text-xs items-center">
            <span className="text-[10px] text-muted-foreground tabular-nums">{format(new Date(r.created_at), "dd MMM yy HH:mm")}</span>
            <span className="truncate">{r.quantity}× {r.bar_items?.name || "Bar item"}</span>
            <span className="text-right tabular-nums text-destructive">{money(Number(r.total || 0))}</span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">Still to be settled, so not part of the account balance above.</p>
    </div>
  );
}
