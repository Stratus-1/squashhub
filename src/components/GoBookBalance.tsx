import { useQuery } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { Loader2, RefreshCw, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useClubCurrency } from "@/hooks/use-currency";

type Balance = { state: "available" | "not_linked" | "unavailable"; accounts?: { balance: number; asAt: string | null; accountName: string }[] };

export function GoBookBalance({ clubId, memberId }: { clubId?: string | null; memberId?: string | null }) {
  const { format } = useClubCurrency();
  const settings = useQuery({
    queryKey: ["gobook-balance-settings", clubId],
    enabled: !!clubId && !!memberId,
    staleTime: 60_000,
    queryFn: async () => {
      if (!clubId) return null;
      const { data, error } = await supabase.from("clubs").select("uses_gobook, gobook_api_enabled").eq("id", clubId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const enabled = !!settings.data?.uses_gobook && !!settings.data?.gobook_api_enabled;
  const query = useQuery({
    queryKey: ["gobook-member-balance", clubId, memberId],
    enabled: enabled && !!clubId && !!memberId,
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<Balance> => {
      const { data, error } = await supabase.functions.invoke("gobook-api", {
        body: { action: "my_balance", club_id: clubId, club_member_id: memberId },
      });
      if (error) {
        if (error instanceof FunctionsHttpError) {
          const details = await error.context.json().catch(() => null);
          throw new Error(details?.error || "GoBook balance is unavailable");
        }
        throw error;
      }
      if (data?.error) throw new Error(data.error);
      return data as Balance;
    },
  });
  if (!enabled || !memberId) return null;
  return (
    <section aria-label="GoBook Court Manager balance" className="mx-4 mt-3 flex flex-wrap items-center justify-between gap-3 border-y border-border py-3 text-[13px]">
      <div className="flex items-center gap-3 min-w-0">
        <Wallet className="h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="font-semibold">GoBook / Court Manager balance</p>
          <div aria-live="polite">
            {query.isPending ? <span className="text-muted-foreground">Loading balance…</span> :
              query.isError ? <span className="text-destructive">{query.error.message}</span> :
              query.data?.state === "not_linked" ? <span className="text-muted-foreground">GoBook member account not linked</span> :
              query.data?.state !== "available" ? <span className="text-muted-foreground">Balance unavailable from GoBook</span> :
              <div className="flex flex-wrap gap-x-6 gap-y-2">{query.data.accounts?.map((account, index) => <div key={`${account.accountName}-${index}`}>
                <p className="text-xs text-muted-foreground">{account.accountName}</p>
                <p className="text-lg font-semibold tabular-nums">{format(account.balance, 2)}</p>
                <p className="text-xs text-muted-foreground">{account.asAt ? `Last updated ${new Date(account.asAt).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}` : "Last updated: not supplied by GoBook"}</p>
              </div>)}</div>}
          </div>
        </div>
      </div>
      <Button variant="ghost" size="icon" disabled={query.isFetching} onClick={() => void query.refetch()} aria-label="Refresh GoBook balance" title="Refresh GoBook balance">
        {query.isFetching ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <RefreshCw className="h-4 w-4" />}
      </Button>
    </section>
  );
}