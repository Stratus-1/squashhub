import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Shield, CheckCircle2, Trash2, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Extract a useful error message from a supabase.functions.invoke failure.
// On non-2xx, supabase-js sets `error` (FunctionsHttpError) and leaves `data`
// null — the response body has to be read off `error.context`.
async function extractInvokeError(
  data: unknown,
  error: unknown,
): Promise<string | null> {
  if ((data as { error?: string } | null)?.error) {
    return (data as { error: string }).error;
  }
  if (!error) return null;
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.text === "function") {
    try {
      const txt = await ctx.clone().text();
      try {
        const parsed = JSON.parse(txt);
        if (parsed?.error) return String(parsed.error);
      } catch { /* not JSON */ }
      if (txt) return txt.slice(0, 300);
    } catch { /* ignore */ }
  }
  return (error as Error).message || "Request failed";
}

type CredMeta = {
  has_credentials: boolean;
  gobook_username: string | null;
  last_verified_at: string | null;
  last_verification_status: string | null;
  has_pin?: boolean;
  has_membership_number?: boolean;
  court_manager_membership_number?: string | null;
};


interface Props {
  clubMemberId: string;
}

/**
 * Member-facing card to save / verify / delete the personal GoBook login
 * used by SquashHub to push court bookings to GoBook (CSIR Squash Club).
 */
export function GoBookCredentialsCard({ clubMemberId }: Props) {
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [membershipNumber, setMembershipNumber] = useState("");

  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { data: meta, isLoading } = useQuery<CredMeta>({
    queryKey: ["gobook-cred-meta", clubMemberId],
    enabled: !!clubMemberId,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("gobook-book", {
        body: { action: "get_credentials_meta", club_member_id: clubMemberId },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) {
        throw new Error((data as { error: string }).error);
      }
      return data as CredMeta;
    },
  });

  const save = async () => {
    if (!username.trim() || !password) {
      toast.error("Enter your GoBook email and password");
      return;
    }
    const trimmedPin = pin.trim();
    if (trimmedPin && !/^\d{4,8}$/.test(trimmedPin)) {
      toast.error("PIN must be 4-8 digits");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("gobook-book", {
        body: {
          action: "save_credentials",
          club_member_id: clubMemberId,
          gobook_username: username.trim(),
          gobook_password: password,
          gobook_pin: trimmedPin,
        },
      });
      const msg = await extractInvokeError(data, error);
      if (msg) throw new Error(msg);
      toast.success("GoBook login saved and verified");
      setPassword("");
      setUsername("");
      setPin("");
      qc.invalidateQueries({ queryKey: ["gobook-cred-meta", clubMemberId] });
    } catch (e) {
      toast.error((e as Error).message || "Failed to save GoBook login");
    } finally {
      setSaving(false);
    }
  };

  const verify = async () => {
    setVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("gobook-book", {
        body: { action: "verify_credentials", club_member_id: clubMemberId },
      });
      const msg = await extractInvokeError(data, error);
      if (msg) throw new Error(msg);
      toast.success("GoBook login is working");
      qc.invalidateQueries({ queryKey: ["gobook-cred-meta", clubMemberId] });
    } catch (e) {
      toast.error((e as Error).message || "GoBook login is no longer valid");
      qc.invalidateQueries({ queryKey: ["gobook-cred-meta", clubMemberId] });
    } finally {
      setVerifying(false);
    }
  };

  const remove = async () => {
    if (!confirm("Remove your saved GoBook login?")) return;
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("gobook-book", {
        body: { action: "delete_credentials", club_member_id: clubMemberId },
      });
      const msg = await extractInvokeError(data, error);
      if (msg) throw new Error(msg);
      toast.success("GoBook login removed");
      qc.invalidateQueries({ queryKey: ["gobook-cred-meta", clubMemberId] });
    } catch (e) {
      toast.error((e as Error).message || "Failed to remove GoBook login");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Shield className="h-4 w-4 mt-0.5 text-primary" />
        <div className="flex-1">
          <div className="font-medium text-sm">GoBook Login (CSIR)</div>
          <div className="text-xs text-muted-foreground">
            Save your personal{" "}
            <a
              href="https://www.gobook.co.za"
              target="_blank"
              rel="noreferrer"
              className="underline inline-flex items-center gap-0.5"
            >
              gobook.co.za <ExternalLink className="h-3 w-3" />
            </a>{" "}
            login so SquashHub can push your CSIR court bookings to GoBook
            automatically. Your password is encrypted and only used by the
            booking service.
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading…
        </div>
      ) : meta?.has_credentials ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <div>
              <div className="font-medium">{meta.gobook_username}</div>
              <div className="text-xs text-muted-foreground">
                Last verified:{" "}
                {meta.last_verified_at
                  ? new Date(meta.last_verified_at).toLocaleString()
                  : "never"}{" "}
                {meta.last_verification_status === "ok" ? (
                  <CheckCircle2 className="inline h-3 w-3 text-emerald-500" />
                ) : meta.last_verification_status === "invalid" ? (
                  <span className="text-destructive">(invalid)</span>
                ) : null}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={verifying}
                onClick={verify}
              >
                {verifying ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  "Verify"
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={deleting}
                onClick={remove}
                className="text-destructive hover:text-destructive"
              >
                {deleting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
              </Button>
            </div>
          </div>
          {meta.last_verification_status === "invalid" && (
            <Alert variant="destructive">
              <AlertDescription className="text-xs">
                The saved GoBook password is no longer valid. Update it below.
              </AlertDescription>
            </Alert>
          )}
          {!meta.has_pin && (
            <Alert variant="destructive">
              <AlertDescription className="text-xs">
                GoBook also needs the booking PIN you set on your gobook.co.za
                profile. Without it, GoBook will reject pushed bookings as
                "Incorrect PIN". Add your PIN below and save.
              </AlertDescription>
            </Alert>
          )}
        </div>
      ) : null}

      {/* Save / replace form */}
      <div className="space-y-2 pt-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <Label htmlFor="gobook-user" className="text-xs">
              GoBook email
            </Label>
            <Input
              id="gobook-user"
              type="email"
              autoComplete="off"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div>
            <Label htmlFor="gobook-pw" className="text-xs">
              GoBook password
            </Label>
            <Input
              id="gobook-pw"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="gobook-pin" className="text-xs">
              GoBook booking PIN {meta?.has_pin ? "(saved — leave blank to keep)" : "(required to confirm bookings)"}
            </Label>
            <Input
              id="gobook-pin"
              type="text"
              inputMode="numeric"
              pattern="\d*"
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
              placeholder={meta?.has_pin ? "••••" : "e.g. 1234"}
            />
            <div className="text-[11px] text-muted-foreground mt-1">
              The same PIN you set on your gobook.co.za profile — GoBook uses it
              to confirm bookings made on your behalf.
            </div>
          </div>
        </div>
        <Button size="sm" disabled={saving} onClick={save}>
          {saving ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin mr-1" /> Verifying with
              GoBook…
            </>
          ) : meta?.has_credentials ? (
            "Replace saved login"
          ) : (
            "Save GoBook login"
          )}
        </Button>
      </div>
    </Card>
  );
}
