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
import { CalendarDays, CheckCircle2, Clock, CreditCard, Loader2, LogIn, Trophy, UserPlus, XCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  afterAcceptPath,
  defaultDivisionSelection,
  inviteDivisions,
  inviteFeeCents,
  inviteLoginPath,
  inviteSignupPath,
  inviteState,
  inviteVerificationKind,
  inviteVerificationLabel,
  isInviteVerificationComplete,
  requiresDivisionChoice,
  allowsMultipleDivisions,
  type InvitePayload,
} from "@/lib/tournaments/invite-link";
import { doublesDivisions } from "@/lib/tournaments/doubles";
import { DoublesPartnerPicker } from "@/components/tournaments/DoublesPartnerPicker";



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
  const { token = "", champId = "" } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [done, setDone] = useState<"accepted" | "declined" | null>(null);
  const [verify, setVerify] = useState("");
  const [verifyError, setVerifyError] = useState("");
  /** Organiser preview: /i/test/:champId. Nothing on this page may mutate. */
  const isTest = !!champId;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["tournament-invite", isTest ? `test:${champId}` : token, user?.id ?? "anon"],
    queryFn: async () => {
      if (isTest) {
        const { data, error } = await (supabase as any).rpc("get_tournament_invite_preview", { p_champ_id: champId });
        if (error) throw error;
        return (data || { found: false }) as InvitePayload;
      }
      const { data, error } = await (supabase as any).rpc("get_tournament_invite", { p_token: token });
      if (error) throw error;
      return (data || { found: false }) as InvitePayload;
    },
    enabled: (!!token || !!champId) && !authLoading,
  });

  const state = inviteState(data);
  const feeCents = inviteFeeCents(data);
  const verificationKind = inviteVerificationKind(data);
  const divisions = useMemo(() => inviteDivisions(data), [data]);
  const mustChooseDivision = requiresDivisionChoice(data);
  // Bells runs every league at the same time, so only one entry is possible.
  const multiDivisionAllowed = allowsMultipleDivisions(data);
  const [chosenDivisions, setChosenDivisions] = useState<number[]>([]);
  const [divisionError, setDivisionError] = useState("");

  // Pre-tick what the invitee already chose (or the only division on offer).
  useEffect(() => {
    if (!data?.found) return;
    setChosenDivisions(defaultDivisionSelection(data));
  }, [data]);

  const toggleDivision = (gn: number) => {
    setDivisionError("");
    if (!multiDivisionAllowed) {
      setChosenDivisions([gn]);
      return;
    }
    setChosenDivisions((prev) => (prev.includes(gn) ? prev.filter((n) => n !== gn) : [...prev, gn].sort((a, b) => a - b)));
  };

  const respond = useMutation({
    mutationFn: async (accept: boolean) => {
      const { data: res, error } = await (supabase as any).rpc("respond_tournament_invite_public", {
        p_token: token,
        p_accept: accept,
        p_verify: verify.trim() || null,
        p_divisions: accept && chosenDivisions.length > 0 ? chosenDivisions : null,
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
      // Doubles entrants stay here so they can pick a partner right away.
      if (champId && !hasDoublesChoice) navigate(path);

    },
    onError: (e: any) => {
      const msg = e?.message || "Could not update your invitation";
      if (/verify/i.test(msg)) setVerifyError(msg);
      toast.error(msg);
    },
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

  // Doubles divisions this player has entered — they may pick a partner there.
  const enteredDivisions = useMemo(() => {
    const chosen = chosenDivisions.length > 0 ? chosenDivisions : (data?.selected_divisions || []).map(Number);
    return doublesDivisions(divisions, chosen);
  }, [divisions, chosenDivisions, data]);
  const hasDoublesChoice = enteredDivisions.length > 0;

  const partnerSection =
    !isTest && data?.champ_id && hasDoublesChoice ? (
      <div className="space-y-2 pt-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Doubles partner
        </p>
        <DoublesPartnerPicker
          champId={String(data.champ_id)}
          divisions={enteredDivisions}
          token={token || null}
          verify={verify.trim() || null}
          onPay={() => navigate(`/club-champs/${String(data.champ_id)}?pay=1`)}
        />

      </div>
    ) : null;


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
      <Card className="w-full max-w-md p-5 space-y-4">
        {isTest ? (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-600">Test invitation</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              This is a preview for organisers. No registration will be changed and no payment will be created.
            </p>
          </div>
        ) : null}
        {children}
      </Card>
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
        {partnerSection}
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
        {partnerSection}
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
    const closedOn = formatDate(data?.registration_closes_at);
    return shell(
      <>
        {header}
        {detailList}
        <p className="text-sm text-muted-foreground">
          {closedOn
            ? `Entries closed on ${closedOn}, so this invitation can no longer be answered.`
            : "Entries for this tournament have closed."}{" "}
          Contact the organiser if you still want to play — they can reopen entries.
        </p>
      </>,
    );
  }


  if (state === "needs_signup") {
    return shell(
      <>
        {header}
        {detailList}
        <p className="text-sm text-muted-foreground">
          You don't have a SquashHub login yet. Create one with this invitation — we'll link it to your club
          membership automatically and bring you straight back here to confirm your entry.
        </p>
        <Button className="w-full" onClick={() => navigate(inviteSignupPath(token))}>
          <UserPlus className="w-4 h-4 mr-2" /> Create your account
        </Button>
        <Button variant="outline" className="w-full" onClick={() => navigate(inviteLoginPath(token))}>
          <LogIn className="w-4 h-4 mr-2" /> I already have an account
        </Button>
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
  const verifyLabel = inviteVerificationLabel(verificationKind);
  const verifyReady = isInviteVerificationComplete(verificationKind, verify);

  function act(accept: boolean) {
    if (isTest) {
      toast.info(
        accept
          ? feeCents > 0
            ? "Test only — a real invitee would now go to the entry fee payment page."
            : "Test only — a real invitee would be entered immediately."
          : "Test only — a real invitee would be marked as declined.",
      );
      return;
    }
    if (accept && mustChooseDivision && chosenDivisions.length === 0) {
      setDivisionError(multiDivisionAllowed ? "Please tick at least one division you want to play in." : "Please choose the league you want to play in.");
      return;
    }
    if (!verifyReady) {
      setVerifyError(`Please enter ${verifyLabel.toLowerCase()} to confirm this invitation is yours.`);
      return;
    }
    setVerifyError("");
    respond.mutate(accept);
  }

  return shell(
    <>
      {header}
      {detailList}
      {divisions.length > 1 && (
        <div className="space-y-1.5">
          <Label className="text-xs">Which do you want to play in?</Label>
          <p className="text-[11px] text-muted-foreground">
            {multiDivisionAllowed
              ? "You may enter more than one — tick every division you want to play."
              : "All leagues play at the same time until the bell — choose one."}
          </p>
          <div className="space-y-1">
            {divisions.map((d) => (
              <label
                key={d.group_number}
                className="flex items-center gap-2 rounded-md border p-2 text-sm cursor-pointer"
              >
                <Checkbox
                  checked={chosenDivisions.includes(d.group_number)}
                  className={multiDivisionAllowed ? undefined : "rounded-full"}
                  onCheckedChange={() => toggleDivision(d.group_number)}
                />
                <span className="flex-1">{d.label}</span>
                {d.match_type === "doubles" && (
                  <Badge variant="outline" className="text-[9px] h-4 px-1">Doubles</Badge>
                )}
              </label>
            ))}
          </div>
          {divisionError && <p className="text-[11px] text-destructive">{divisionError}</p>}
        </div>
      )}
      {feeCents > 0 && (
        <p className="text-xs text-muted-foreground">
          Accepting reserves your place — you'll go straight to the entry fee payment page.
        </p>
      )}

      {!isTest && verificationKind !== "none" && (
        <div className="space-y-1.5">
          <Label htmlFor="invite-verify" className="text-xs">
            {verifyLabel}
          </Label>
          <Input
            id="invite-verify"
            inputMode={verificationKind === "phone_last4" ? "numeric" : "text"}
            autoComplete="off"
            value={verify}
            onChange={(e) => {
              setVerify(e.target.value);
              setVerifyError("");
            }}
            placeholder={verificationKind === "phone_last4" ? "e.g. 4821" : "e.g. Pretorius"}
          />
          <p className="text-[11px] text-muted-foreground">
            {verifyError || "A quick check that this invitation is yours — no SquashHub login needed."}
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <Button variant="outline" disabled={busy} onClick={() => act(false)}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Decline"}
        </Button>
        <Button disabled={busy} onClick={() => act(true)}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : feeCents > 0 ? "Accept & pay" : "Accept"}
        </Button>
      </div>
      {!isTest && (
        <button
          type="button"
          className="text-[11px] text-muted-foreground underline w-full text-center"
          onClick={() => navigate(inviteLoginPath(token))}
        >
          Prefer to sign in to your SquashHub account instead?
        </button>
      )}
    </>,
  );
}
