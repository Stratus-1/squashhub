import { useState } from "react";
import { MailCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/** Key used to keep the "check your email" state across reloads / Back. */
export const PENDING_VERIFY_KEY = "sh.pending_email_verification";

export type PendingVerify = { email: string; redirect: string; savedAt: number };

export function savePendingVerify(email: string, redirect: string) {
  try {
    sessionStorage.setItem(PENDING_VERIFY_KEY, JSON.stringify({ email, redirect, savedAt: Date.now() }));
  } catch { /* ignore */ }
}

export function readPendingVerify(): PendingVerify | null {
  try {
    const raw = sessionStorage.getItem(PENDING_VERIFY_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as PendingVerify;
    if (!p?.email || Date.now() - (p.savedAt || 0) > 24 * 60 * 60 * 1000) return null;
    return p;
  } catch { return null; }
}

export function clearPendingVerify() {
  try { sessionStorage.removeItem(PENDING_VERIFY_KEY); } catch { /* ignore */ }
}

interface Props {
  email: string;
  redirect: string;
  onSignIn: () => void;
  /** Wrong-email path. When omitted the club-admin guidance is shown instead. */
  onChangeEmail?: () => void;
  changeEmailHint?: string;
}

/**
 * Shown after an email + password sign-up that needs email confirmation.
 * Never routes the member back into the registration form.
 */
export function CheckEmailPanel({ email, redirect, onSignIn, onChangeEmail, changeEmailHint }: Props) {
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(false);

  const resend = async () => {
    setBusy(true);
    const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: redirect } });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Activation email sent again to ${email}`);
    setCooldown(true);
    setTimeout(() => setCooldown(false), 60_000);
  };

  return (
    <div className="space-y-4 text-center">
      <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
        <MailCheck className="w-7 h-7 text-primary" />
      </div>
      <h2 className="text-lg font-bold font-heading">Check your email to activate your account</h2>
      <p className="text-sm text-muted-foreground">
        We've sent an activation email to <strong className="text-foreground">{email}</strong>. Please open that email and
        click the activation link to confirm your account. Once confirmed, you can sign in to SquashHub.
      </p>
      <p className="text-xs text-muted-foreground">Can't see it? Check your Spam, Promotions or Updates folders.</p>
      <div className="grid gap-2">
        <Button variant="outline" onClick={resend} disabled={busy || cooldown}>
          {busy ? "Sending…" : cooldown ? "Sent — try again in a minute" : "Resend activation email"}
        </Button>
        {onChangeEmail ? (
          <Button variant="ghost" onClick={onChangeEmail}>Wrong email? Use a different address</Button>
        ) : null}
        <Button variant="link" onClick={onSignIn}>I've confirmed — sign in</Button>
      </div>
      {changeEmailHint && <p className="text-[11px] text-muted-foreground">{changeEmailHint}</p>}
    </div>
  );
}
