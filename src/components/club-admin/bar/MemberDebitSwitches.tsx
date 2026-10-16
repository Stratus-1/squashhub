import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
  const { data: creditDefault } = useQuery({
    queryKey: ["club-credit-default", clubId],
    queryFn: async () => {
      const { data } = await db.from("club_member_credit_defaults").select("amount").eq("club_id", clubId).maybeSingle();
      return Number(data?.amount ?? 0);
    },
  });
  const { data: clubName } = useQuery({
    queryKey: ["member-debit-club-name", clubId],
    queryFn: async () => {
      const { data } = await db.from("clubs").select("name").eq("id", clubId).maybeSingle();
      return data?.name as string | undefined;
    },
  });
  const amount = creditDefault ?? 0;
  const tip = creditDefault === undefined
    ? "Shows this club's default Credit allowed (member billing settings)."
    : amount > 0
      ? `Default Credit allowed for ${clubName ?? "your"} members is R${amount.toFixed(0)} (set under member billing settings). With this switch off, members may still go up to R${amount.toFixed(0)} into debit; an individual member's own Credit allowed takes priority.`
      : `Default Credit allowed for ${clubName ?? "your"} members is R0 (set under member billing settings), so with this switch off no credit is allowed unless a member has an individual Credit allowed set.`;
  return (
    <div className="mt-2 rounded-md border p-2 space-y-2">
      <div>
        <p className="text-xs font-medium">Member account limits</p>
        <p className="text-[11px] text-muted-foreground leading-tight">
          Switch off to only allow member-account purchases the account can cover: prepaid credit, plus any fees covered by an
          active monthly debit order, plus the member's Credit allowed (same rule as court bookings). Members then see a warning and can pay by card or top up.
        </p>
        {creditDefault !== undefined && (
          <p className="text-[11px] leading-tight mt-1 text-foreground">
            Club default Credit allowed for {clubName ?? "your"} members: <strong>R{amount.toFixed(0)}</strong>{" "}
            <span className="text-muted-foreground">(set under member billing settings; a member's own amount takes priority).</span>
          </p>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {(["bar", "shop"] as const).map((k) => {
          const col = k === "bar" ? "bar_allow_member_debit" : "shop_allow_member_debit";
          const name = k === "bar" ? "Bar" : "Shop";
          const label = `${name}: allow account to go into debit`;
          return (
            <div key={k} className="flex items-center justify-between gap-2 rounded-md border p-2">
              <span className="text-xs flex items-center gap-1">
                {label}
                <TooltipProvider delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" aria-label="Credit allowed info" className="text-muted-foreground hover:text-foreground">
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs">{tip}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </span>
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
