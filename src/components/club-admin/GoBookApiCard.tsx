import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, PlugZap, ShieldCheck, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClubSecrets, useUpdateClubSecrets } from "@/hooks/use-club-secrets";

type TestResult = {
  provider: {
    providerId: number;
    providerName: string;
    hasOwnBackEndSystem: boolean;
    maxBookingsPerClientPerDay: number | null;
    maxBookingsPerClientPerWeek: number | null;
    courtTerm: string | null;
  };
  courts: Array<{ id: number; name: string; mapping: string | null }>;
  services: Array<{ providerServiceId: number; description: string | null; bookable: boolean }>;
};

/**
 * Club-level GoBook API credentials.
 *
 * GoBook now puts a reCAPTCHA on its website login, so SquashHub can no longer
 * sign members in with their own GoBook username/password. The official GoBook
 * API uses ONE API account per club instead — members never enter GoBook
 * credentials again.
 */
export function GoBookApiCard({ clubId, club }: { clubId: string; club: any }) {
  const { data: secrets } = useClubSecrets(clubId);
  const updateSecrets = useUpdateClubSecrets();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  useEffect(() => {
    setUsername((secrets as any)?.gobook_api_username ?? "");
    setPassword((secrets as any)?.gobook_api_password ?? "");
  }, [(secrets as any)?.gobook_api_username, (secrets as any)?.gobook_api_password]);

  const call = async (action: "test_connection" | "sync_settings") => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("gobook-api", {
        body: { action, club_id: clubId, username: username.trim(), password },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setResult(data as TestResult);
      toast.success(
        action === "sync_settings"
          ? `Connected to ${(data as TestResult).provider.providerName} — API booking enabled`
          : `Connection OK — ${(data as TestResult).provider.providerName}`,
      );
    } catch (e: any) {
      toast.error(e?.message || "Could not reach the GoBook API");
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    if (!username.trim() || !password) {
      toast.error("Enter the API username and password GoBook issued to your club");
      return;
    }
    try {
      await updateSecrets.mutateAsync({
        club_id: clubId,
        gobook_api_username: username.trim(),
        gobook_api_password: password,
      } as any);
      toast.success("GoBook API credentials saved");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save credentials");
    }
  };

  const apiEnabled = !!club?.gobook_api_enabled;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <PlugZap className="w-4 h-4 text-primary" />
            GoBook API connection
          </h3>
          <p className="text-xs text-muted-foreground">
            One API account for the whole club. Members no longer need to store their own
            GoBook login (which stopped working when GoBook added its captcha).
          </p>
        </div>
        {apiEnabled ? (
          <Badge className="shrink-0">API active</Badge>
        ) : (
          <Badge variant="outline" className="shrink-0">Not connected</Badge>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">API username</Label>
          <Input
            className="h-8 text-xs"
            value={username}
            autoComplete="off"
            onChange={(e) => setUsername(e.target.value)}
            placeholder="API_073003"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">API password</Label>
          <Input
            className="h-8 text-xs"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Issued by GoBook"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={save} disabled={updateSecrets.isPending}>
          {updateSecrets.isPending ? "Saving..." : "Save credentials"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => call("test_connection")} disabled={testing}>
          {testing && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
          Test connection
        </Button>
        <Button size="sm" variant="secondary" onClick={() => call("sync_settings")} disabled={testing}>
          <ShieldCheck className="w-3.5 h-3.5 mr-1" />
          Enable API booking
        </Button>
      </div>

      {result && (
        <div className="rounded-lg border p-3 space-y-2 text-[11px]">
          <p className="font-medium text-xs">
            {result.provider.providerName} (provider #{result.provider.providerId})
          </p>
          <p className="text-muted-foreground">
            {result.provider.hasOwnBackEndSystem
              ? "Bookings push through to the club's Court Manager back-end."
              : "Standalone GoBook provider (no back-end system)."}{" "}
            Limits: {result.provider.maxBookingsPerClientPerDay ?? "–"}/day,{" "}
            {result.provider.maxBookingsPerClientPerWeek ?? "–"}/week.
          </p>
          <div className="flex flex-wrap gap-1">
            {result.courts.map((c) => (
              <Badge key={c.id} variant="outline" className="text-[10px]">
                {c.name}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {apiEnabled && (
        <div className="rounded-lg border p-3">
          <GoBookMemberLinkPanel clubId={clubId} />
        </div>
      )}

      <div className="rounded-lg border border-primary/30 bg-primary/5 p-2 flex gap-2">
        <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground">
          Request API credentials from GoBook (support@gobook.co.za). Court list, available
          dates, live slot grids, client lookup and booking all run through the official API —
          members no longer need their own GoBook login. Cancellations must still be done on
          gobook.co.za: the API has no cancel endpoint yet.
        </p>
      </div>
    </Card>
  );
}

