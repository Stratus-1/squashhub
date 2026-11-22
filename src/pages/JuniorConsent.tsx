/**
 * /junior-consent/:token — private one-use link emailed to a junior's parent or guardian.
 * The parent reads who registered and gives or declines consent without logging in.
 * Database RPCs `junior_consent_view` / `junior_consent_decide` are the authority.
 */
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SEO } from "@/components/SEO";

const db = supabase as any;
type View = {
  found: boolean; junior_name?: string; club_name?: string; org_name?: string; parent_name?: string;
  consent_status?: "awaiting" | "given" | "declined" | "not_needed"; expired?: boolean; registration_declined?: boolean;
};

export default function JuniorConsent() {
  const { token = "" } = useParams<{ token: string }>();
  const valid = /^[0-9a-f]{48}$/.test(token);
  const [name, setName] = useState("");
  const [done, setDone] = useState<"given" | "declined" | null>(null);

  const view = useQuery({
    queryKey: ["junior-consent", token], enabled: valid, retry: false,
    queryFn: async () => {
      const { data, error } = await db.rpc("junior_consent_view", { p_token: token });
      if (error) throw error;
      return (data ?? { found: false }) as View;
    },
  });
  const act = useMutation({
    mutationFn: async (approve: boolean) => {
      const { error } = await db.rpc("junior_consent_decide", { p_token: token, p_approve: approve, p_name: name.trim() });
      if (error) throw error;
      return approve;
    },
    onSuccess: (approve) => setDone(approve ? "given" : "declined"),
  });

  const d = view.data;
  const nameOk = name.trim().replace(/\s+/g, " ").includes(" ") && name.trim().length >= 3;
  const body = (() => {
    if (!valid || view.isError || (d && !d.found)) return <p>This link is not valid or has already been used. Please ask the junior association for a new one.</p>;
    if (view.isLoading || !d) return <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</p>;
    if (done) return (
      <p className="flex items-start gap-2">
        {done === "given" ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" /> : <XCircle className="mt-0.5 h-4 w-4 text-destructive" />}
        {done === "given" ? `Thank you. ${d.junior_name || "The player"} is now registered with your consent.` : "Thank you. Your answer was saved and the registration was not confirmed."}
      </p>
    );
    if (d.consent_status !== "awaiting") return <p>This consent request has already been answered.</p>;
    if (d.expired) return <p>This link has expired. Please ask the junior association to send a new one.</p>;
    if (d.registration_declined) return <p>This registration was already removed.</p>;
    return (
      <div className="space-y-4">
        <p>
          <span className="font-medium">{d.junior_name}</span> registered as a junior squash player at <span className="font-medium">{d.club_name}</span> through {d.org_name}, and gave {d.parent_name ? <span className="font-medium">{d.parent_name}</span> : "you"} as parent or guardian.
        </p>
        <p className="text-xs text-muted-foreground">
          If you agree, {d.org_name} and the club may keep the player's details (including the private date of birth) to register and organise junior squash. Only the age group is shown to others.
        </p>
        <div className="space-y-1.5">
          <Label className="text-xs">Your first name and surname</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button disabled={!nameOk || act.isPending} onClick={() => act.mutate(true)}>
            {act.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}I give consent
          </Button>
          <Button variant="outline" disabled={!nameOk || act.isPending} onClick={() => act.mutate(false)}>I do not give consent</Button>
        </div>
        {act.isError && <p className="rounded border border-destructive/50 bg-destructive/10 p-2 text-xs">{(act.error as any)?.message || "Something went wrong. Please try again."}</p>}
      </div>
    );
  })();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <SEO title="Parent consent" description="Give or decline consent for a junior squash registration." path="/junior-consent" noIndex />
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-primary" />Parent or guardian consent</CardTitle>
          <p className="text-xs text-muted-foreground">SquashHub · Junior squash registration</p>
        </CardHeader>
        <CardContent className="text-sm">{body}</CardContent>
      </Card>
    </div>
  );
}
