import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";

/** Bar Setup: "Use order process" — off by default; can't be switched off while orders are open. */
export function OrderProcessSwitch({ clubId }: { clubId: string }) {
  const qc = useQueryClient();
  const { data: enabled = false, isLoading } = useQuery({
    queryKey: ["bar-order-process", clubId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("bar_order_process_status", { _club_id: clubId });
      if (error) throw error;
      return data === true;
    },
  });

  const change = async (v: boolean) => {
    const { error } = await (supabase as any).rpc("bar_set_order_process", { _club_id: clubId, _enabled: v });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["bar-order-process", clubId] });
    toast.success(v ? "Order process switched on — reprint your bar poster" : "Order process switched off — reprint your bar poster");
  };

  return (
    <div className="mt-3 flex items-start justify-between gap-2 rounded-md border p-2">
      <div className="min-w-0">
        <p className="text-xs font-medium leading-tight">Use order process</p>
        <p className="text-[11px] text-muted-foreground leading-tight">
          Customers place orders from their phone (collect or delivered to a court/table). Counter staff see them under
          Orders and tick off each item as it is delivered.
        </p>
      </div>
      <Switch disabled={isLoading} checked={enabled} onCheckedChange={change} aria-label="Use order process" />
    </div>
  );
}
