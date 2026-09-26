import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

/**
 * Platform-wide duplicate-registration safeguard. Every self-registration path
 * calls `guard()` BEFORE a person/member is created. Existing emails are only
 * revealed after the cell number is verified by a one-time code.
 */
export type MatchLevel = "exact" | "phone" | "name" | "none";
type Account = { email: string; name: string | null; clubs: string[]; has_login: boolean };
type Step = "prompt" | "code" | "accounts";

const SUPPORT = "support@squashhub.co.za";

export function useDuplicateGuard(opts: {
  onUseEmail?: (email: string) => void;
  onExistingMember?: () => void;
  resetPassword?: (email: string) => Promise<{ error: Error | null }>;
} = {}) {
  const [state, setState] = useState<{ level: MatchLevel; hasLogin: boolean; phone: string } | null>(null);
  const [step, setStep] = useState<Step>("prompt");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const resolver = useRef<((proceed: boolean) => void) | null>(null);

  const finish = (proceed: boolean) => {
    setState(null); setStep("prompt"); setCode(""); setAccounts([]);
    resolver.current?.(proceed); resolver.current = null;
  };

  /** Resolves true when registration may continue. Fails open on network errors. */
  const guard = async (input: { name?: string; phone?: string; claimedOnly?: boolean }): Promise<boolean> => {
    if (!input.phone?.trim() && !input.name?.trim()) return true;
    try {
      const { data, error } = await supabase.functions.invoke("account-recovery", {
        body: { action: "check", name: input.name ?? "", phone: input.phone ?? "", claimed_only: !!input.claimedOnly },
      });
      if (error || !data || data.level === "none") return true;
      return await new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setState({ level: data.level, hasLogin: !!data.has_login, phone: input.phone ?? "" });
      });
    } catch {
      return true;
    }
  };

  const sendCode = async () => {
    if (!state) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("account-recovery", { body: { action: "send_code", phone: state.phone } });
    setBusy(false);
    if (error || data?.error) { toast.error(data?.error || "Couldn't send a code"); return; }
    setSentTo(data.sent_to); setStep("code");
  };

  const verify = async () => {
    if (!state) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("account-recovery", { body: { action: "verify_code", phone: state.phone, code } });
    setBusy(false);
    if (error || data?.error) { toast.error(data?.error || "Verification failed"); return; }
    setAccounts(data.accounts ?? []); setStep("accounts");
  };

  const strong = state?.level === "exact" || state?.level === "phone";

  const dialog = (
    <AlertDialog open={!!state} onOpenChange={(o) => { if (!o) finish(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>We may already have an account for you</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              {state && !strong && (
                <>
                  <p>Someone with the same name already plays on SquashHub. If that's you, please sign in instead so your history stays on one account.</p>
                  <div className="flex flex-col gap-2">
                    <Button variant="outline" onClick={() => finish(false)}>That's me — I'll sign in</Button>
                    <Button onClick={() => finish(true)}>I'm a different person — continue</Button>
                  </div>
                </>
              )}
              {state && strong && step === "prompt" && (
                <>
                  <p>This cell number is already on SquashHub. To keep your rankings, matches and membership together, let's recover your existing account instead of creating a second one.</p>
                  {state.hasLogin ? (
                    <Button className="w-full" disabled={busy} onClick={sendCode}>Text me a code to verify this number</Button>
                  ) : (
                    <Button className="w-full" onClick={() => { finish(false); opts.onExistingMember?.(); }}>
                      Claim my existing record ("Existing member" sign-up)
                    </Button>
                  )}
                  {state.level === "phone" && (
                    <Button variant="outline" className="w-full" onClick={() => finish(true)}>
                      We're different people sharing this number (e.g. family) — continue
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Not your number, or no longer have it? Email <a className="underline" href={`mailto:${SUPPORT}`}>{SUPPORT}</a> or contact your club — we won't create or merge anything automatically.
                  </p>
                  <Button variant="ghost" className="w-full" onClick={() => finish(false)}>Cancel</Button>
                </>
              )}
              {state && step === "code" && (
                <>
                  <p>We sent a 6-digit code to {sentTo}.</p>
                  <Input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" />
                  <Button className="w-full" disabled={busy || code.length !== 6} onClick={verify}>Verify</Button>
                  <Button variant="ghost" className="w-full" onClick={() => finish(false)}>Cancel</Button>
                </>
              )}
              {state && step === "accounts" && (
                <>
                  {accounts.length === 0 ? (
                    <p>Your number is verified, but we couldn't find an email login on it. Please email <a className="underline" href={`mailto:${SUPPORT}`}>{SUPPORT}</a> or contact your club to recover your account.</p>
                  ) : (
                    <>
                      <p>Your number is verified. These accounts use it:</p>
                      {accounts.map((a) => (
                        <div key={a.email} className="rounded border p-2 space-y-2">
                          <div className="font-medium break-all">{a.email}</div>
                          <div className="text-xs text-muted-foreground">{a.name}{a.clubs.length ? ` · ${a.clubs.join(", ")}` : ""}</div>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => { finish(false); opts.onUseEmail?.(a.email); }}>Log in</Button>
                            {opts.resetPassword && (
                              <Button size="sm" variant="outline" onClick={async () => {
                                const { error } = await opts.resetPassword!(a.email);
                                if (error) toast.error(error.message); else toast.success("Password reset link sent to " + a.email);
                              }}>Reset password</Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                  <Button variant="ghost" className="w-full" onClick={() => finish(false)}>Close</Button>
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { guard, dialog };
}
