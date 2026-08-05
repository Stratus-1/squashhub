import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, ShieldCheck, CheckCircle2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

async function extractInvokeError(data: unknown, error: unknown): Promise<string | null> {
  if ((data as { error?: string } | null)?.error) return (data as { error: string }).error;
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
  nsa_username: string | null;
  last_verified_at: string | null;
  last_verification_status: string | null;
};

interface Props {
  clubMemberId: string;
  /** The member's NSA/NSF number, used to pre-fill the username */
  nsaNumber?: string | null;
}

/**
 * Member-facing card to save / verify / remove the personal NSA (Northern Squash
 * Association) admin login used to post league results online.
 * Any NSA-affiliated member who later becomes a captain can add their login here.
 */
export function NsaCredentialsCard({ clubMemberId, nsaNumber }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState((nsaNumber || "").toUpperCase());
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { data: meta, isLoading } = useQuery<CredMeta>({
    queryKey: ["nsa-cred-meta", clubMemberId],
    enabled: !!clubMemberId,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("nsa-submit-result", {
        body: { action: "get_credentials_meta", club_member_id: clubMemberId },
      });
      const msg = await extractInvokeError(data, error);
      if (msg) throw new Error(msg);
      return data as CredMeta;
    },
  });

  const save = async () => {
    const user = username.trim().toUpperCase();
    if (!/^NSF\d+$/.test(user)) {
      toast.error("Your NSA username looks like NSF1234");
      return;
    }
    if (!password) {
      toast.error("Enter your NSA password");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("nsa-submit-result", {
        body: {
          action: "save_credentials",
          club_member_id: clubMemberId,
          nsa_username: user,
          nsa_password: password,
        },
      });
      const msg = await extractInvokeError(data, error);
      if (msg) throw new Error(msg);
      toast.success("NSA login saved and verified");
      setPassword("");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["nsa-cred-meta", clubMemberId] });
    } catch (e) {
      toast.error((e as Error).message || "Could not verify that NSA login");
    } finally {
      setSaving(false);
    }
  };

  const verify = async () => {
    setVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("nsa-submit-result", {
        body: { action: "verify_credentials", club_member_id: clubMemberId },
      });
      const msg = await extractInvokeError(data, error);
      if (msg) throw new Error(msg);
      toast.success("NSA login is working");
    } catch (e) {
      toast.error((e as Error).message || "NSA login is no longer valid");
    } finally {
      setVerifying(false);
      qc.invalidateQueries({ queryKey: ["nsa-cred-meta", clubMemberId] });
    }
  };

  const remove = async () => {
    if (!confirm("Remove your saved NSA login?")) return;
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("nsa-submit-result", {
        body: { action: "delete_credentials", club_member_id: clubMemberId },
      });
      const msg = await extractInvokeError(data, error);
      if (msg) throw new Error(msg);
      toast.success("NSA login removed");
      qc.invalidateQueries({ queryKey: ["nsa-cred-meta", clubMemberId] });
    } catch (e) {
      toast.error((e as Error).message || "Failed to remove NSA login");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start gap-2">
        <ShieldCheck className="h-4 w-4 mt-0.5 text-primary" />
        <div className="flex-1">
          <div className="font-medium text-sm">NSA Login (post results online)</div>
          <div className="text-xs text-muted-foreground">
            Do you have an NSA admin login to post league results online? If you're a
            captain (or became one later), save your NSA login here and you'll be able
            to post scorecards straight to NSA from SquashHub. Your password is
            encrypted and only used for posting results.
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
              <div className="font-medium font-mono">{meta.nsa_username}</div>
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
              <Button size="sm" variant="outline" disabled={verifying} onClick={verify}>
                {verifying ? <Loader2 className="h-3 w-3 animate-spin" /> : "Verify"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={deleting}
                onClick={remove}
                className="text-destructive hover:text-destructive"
              >
                {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              </Button>
            </div>
          </div>
          {meta.last_verification_status === "invalid" && (
            <Alert variant="destructive">
              <AlertDescription className="text-xs">
                Your saved NSA password is no longer valid — update it below.
              </AlertDescription>
            </Alert>
          )}
        </div>
      ) : null}

      {!open ? (
        <Button size="sm" variant={meta?.has_credentials ? "outline" : "default"} onClick={() => setOpen(true)}>
          {meta?.has_credentials ? "Update NSA login" : "Yes — enter my NSA login"}
        </Button>
      ) : (
        <div className="space-y-2 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <Label htmlFor="nsa-user" className="text-xs">NSA username</Label>
              <Input
                id="nsa-user"
                name="nsa-login-user-xx"
                type="text"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                data-lpignore="true"
                data-1p-ignore="true"
                value={username}
                onChange={(e) => setUsername(e.target.value.toUpperCase().replace(/\s+/g, ""))}
                placeholder="NSF1234"
              />
              <div className="text-[11px] text-muted-foreground mt-1">
                This is your NSF number used to sign in on the NSA admin site.
              </div>
            </div>
            <div>
              <Label htmlFor="nsa-pw" className="text-xs">NSA password</Label>
              <Input
                id="nsa-pw"
                name="nsa-login-pw-xx"
                type="password"
                autoComplete="new-password"
                data-lpignore="true"
                data-1p-ignore="true"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={saving} onClick={save}>
              {saving ? (
                <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Verifying with NSA…</>
              ) : (
                "Save NSA login"
              )}
            </Button>
            <Button size="sm" variant="ghost" disabled={saving} onClick={() => { setOpen(false); setPassword(""); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

export default NsaCredentialsCard;
