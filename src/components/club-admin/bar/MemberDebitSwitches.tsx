import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

const db = supabase as any;

/** Bar / Shop: allow member-account purchases to take the account into debit (default on). */
export function MemberDebitSwitches({ clubId }: { clubId: string }) {
  const qc = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ["bar-costing-settings", clubId],
    queryFn: async () => {
      const { data } = await db.from("club_bar_settings").select("*").eq("club_id", clubId).maybeSingle();
      return data;
    },
  });
  return (
    <div className="mt-2 rounded-md border p-2 space-y-2">
      <div>
        <p className="text-xs font-medium">Member account limits</p>
        <p className="text-[11px] text-muted-foreground leading-tight">
          Switch off to only allow member-account purchases the account can cover: prepaid credit, plus any fees covered by an
          active monthly debit order (same rule as court bookings). Members then see a warning and can pay by card or top up.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {(["bar", "shop"] as const).map((k) => {
          const col = k === "bar" ? "bar_allow_member_debit" : "shop_allow_member_debit";
          const name = k === "bar" ? "Bar" : "Shop";
          const label = `${name}: allow account to go into debit`;
          return (
            <div key={k} className="flex items-center justify-between gap-2 rounded-md border p-2">
              <span className="text-xs">{label}</span>
              <Switch
                checked={settings?.[col] ?? true}
                aria-label={label}
                onCheckedChange={async (on) => {
                  const { error } = await db.from("club_bar_settings").upsert({ club_id: clubId, [col]: on }, { onConflict: "club_id" });
                  if (error) return toast.error(error.message);
                  toast.success(on ? `${name} accounts may go into debit` : `${name}: members can only spend what their account covers`);
                  qc.invalidateQueries({ queryKey: ["bar-costing-settings", clubId] });
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
