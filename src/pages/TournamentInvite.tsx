import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SEO } from "@/components/SEO";
import { toast } from "sonner";
import { CalendarDays, CheckCircle2, Clock, CreditCard, Loader2, LogIn, Trophy, XCircle } from "lucide-react";
import {
  afterAcceptPath,
  inviteFeeCents,
  inviteLoginPath,
  inviteState,
  type InvitePayload,
} from "@/lib/tournaments/invite-link";

function money(cents: number) {
  return `R${(cents / 100).toFixed(2)}`;
}

function formatDate(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function TournamentInvite() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [done, setDone] = useState<"accepted" | "declined" | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["tournament-invite", token, user?.id ?? "anon"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_tournament_invite", { p_token: token });
      if (error) throw error;
      return (data || { found: false }) as InvitePayload;
    },
    enabled: !!token && !authLoading,
  });

  const state = inviteState(data);
  const feeCents = inviteFeeCents(data);

  const respond = useMutation({
    mutationFn: async (accept: boolean) => {
      const { data: res, error } = await (supabase as any).rpc("respond_tournament_invite", {
        p_token: token,
        p_accept: accept,
      });
      if (error) throw error;
      return { accept, res } as { accept: boolean; res: any };
    },
    onSuccess: async ({ accept, res }) => {
      await refetch();
      if (!accept) {
        setDone("declined");
        toast.success("Thanks — the organiser has been updated.");
        return;
      }
      setDone("accepted");
      const champId = res?.champ_id || data?.champ_id;
      const path = afterAcceptPath(String(champId || ""), res?.status);
      if (path.includes("pay=1")) {
        toast.success("Entry confirmed — entry fee still to pay.");
      } else {
        toast.success("You're entered. See you on court!");
      }
      if (champId) navigate(path);
    },
    onError: (e: any) => toast.error(e?.message || "Could not update your invitation"),
  });

  // Land straight back here after signing in.
  useEffect(() => {
    if (done) return;
  }, [done]);

  const details = useMemo(() => {
    if (!data?.found) return [] as { icon: any; label: string }[];
    const rows: { icon: any; label: string }[] = [];
    const start = formatDate(data.start_date);
    const end = formatDate(data.end_date);
    if (start) rows.push({ icon: CalendarDays, label: end && end !== start ? `${start} – ${end}` : start });
    const closes = formatDate(data.registration_closes_at);
    if (closes) rows.push({ icon: Clock, label: `Entries close ${closes}` });
    if (data.division_label) rows.push({ icon: Trophy, label: data.division_label });
    rows.push({ icon: CreditCard, label: feeCents > 0 ? `${money(feeCents)} entry fee` : "No entry fee" });
    return rows;
  }, [data, feeCents]);

  if (isLoading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-background flex items-start sm:items-center justify-center p-4">
      <SEO title="Tournament invitation | SquashHub" description="Respond to your SquashHub tournament invitation." />
      <Card className="w-full max-w-md p-5 space-y-4">{children}</Card>
    </div>
  );

  if (state === "not_found" || state === "revoked") {
    return shell(
      <div className="text-center space-y-2 py-4">
        <XCircle className="w-8 h-8 text-muted-foreground mx-auto" />
        <h1 className="text-base font-semibold">Invitation unavailable</h1>
        <p className="text-sm text-muted-foreground">
          {state === "revoked"
            ? "This invitation has been withdrawn by the organiser."
            : "This invitation link is not valid or has expired."}
        </p>
      </div>,
    );
  }

  const header = (
    <div className="space-y-1">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{data?.club_name} invites you</p>
      <h1 className="text-lg font-bold leading-tight">{data?.tournament_name}</h1>
      {data?.invitee_name && <p className="text-xs text-muted-foreground">Invitation for {data.invitee_name}</p>}
    </div>
  );

  const detailList = (
    <div className="space-y-1.5">
      {details.map((d, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <d.icon className="w-3.5 h-3.5 text-primary shrink-0" />
          <span>{d.label}</span>
        </div>
      ))}
    </div>
  );

  if (state === "registered" || done === "accepted") {
    return shell(
      <>
        {header}
        {detailList}
        <Badge className="bg-emerald-600 hover:bg-emerald-600">
          <CheckCircle2 className="w-3 h-3 mr-1" /> You're entered
        </Badge>
        {data?.champ_id && (
          <Button className="w-full" onClick={() => navigate(`/club-champs/${data.champ_id}`)}>
            View tournament
          </Button>
        )}
      </>,
    );
  }

  if (state === "payment_pending") {
    return shell(
      <>
        {header}
        {detailList}
        <Badge variant="secondary">Accepted — entry fee outstanding</Badge>
        <Button
          className="w-full"
          onClick={() => data?.champ_id && navigate(afterAcceptPath(data.champ_id, "pending_payment"))}
        >
          <CreditCard className="w-4 h-4 mr-2" /> Pay {money(feeCents)} entry fee
        </Button>
      </>,
    );
  }

  if (state === "declined" || done === "declined") {
    return shell(
      <>
        {header}
        <p className="text-sm text-muted-foreground">You declined this invitation. Contact the organiser if that was a mistake.</p>
      </>,
    );
  }

  if (state === "closed") {
    return shell(
      <>
        {header}
        {detailList}
        <p className="text-sm text-muted-foreground">Entries for this tournament have closed.</p>
      </>,
    );
  }

  if (state === "needs_login") {
    return shell(
      <>
        {header}
        {detailList}
        <p className="text-sm text-muted-foreground">
          Sign in to your SquashHub account to confirm this entry. We'll bring you straight back here.
        </p>
        <Button className="w-full" onClick={() => navigate(inviteLoginPath(token))}>
          <LogIn className="w-4 h-4 mr-2" /> Sign in to respond
        </Button>
      </>,
    );
  }

  const busy = respond.isPending;
  return shell(
    <>
      {header}
      {detailList}
      {feeCents > 0 && (
        <p className="text-xs text-muted-foreground">
          Accepting reserves your place — you'll go straight to the entry fee payment page.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <Button variant="outline" disabled={busy} onClick={() => respond.mutate(false)}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Decline"}
        </Button>
        <Button disabled={busy} onClick={() => respond.mutate(true)}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : feeCents > 0 ? "Accept & pay" : "Accept"}
        </Button>
      </div>
    </>,
  );
}
