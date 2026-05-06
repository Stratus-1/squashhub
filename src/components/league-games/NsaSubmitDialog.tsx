import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Shield, AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface NsaSubmitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clubMemberId: string;
  defaultFixtureId?: number | null;  // Optional pre-filled NSA fixture ID
  matches: Array<{
    home_nsf: string;
    away_nsf: string;
    games: Array<[number | null, number | null]>;
    home_player_name?: string;
    away_player_name?: string;
  }>;
}

type CredMeta = {
  has_credentials: boolean;
  nsa_username: string | null;
  last_verified_at: string | null;
  last_verification_status: string | null;
};

export function NsaSubmitDialog({ open, onOpenChange, clubMemberId, fixtureId, matches }: NsaSubmitDialogProps) {
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState<"check" | "commit" | null>(null);
  const [result, setResult] = useState<{ ok: boolean; errors: string[]; notes: string[]; mode: string; title?: string | null } | null>(null);

  const metaQ = useQuery({
    queryKey: ["nsa-cred-meta", clubMemberId],
    enabled: open && !!clubMemberId,
    queryFn: async (): Promise<CredMeta> => {
      const { data, error } = await supabase.functions.invoke("nsa-submit-result", {
        body: { action: "get_credentials_meta", club_member_id: clubMemberId },
      });
      if (error) throw error;
      return data as CredMeta;
    },
  });

  const meta = metaQ.data;

  const handleSaveCreds = async () => {
    if (!/^NSF\d+$/i.test(username.trim())) { toast.error("Username must look like NSF1234"); return; }
    if (!password) { toast.error("Password required"); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("nsa-submit-result", {
        body: { action: "save_credentials", club_member_id: clubMemberId, nsa_username: username.trim(), nsa_password: password },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("NSA login verified and saved");
      setPassword("");
      qc.invalidateQueries({ queryKey: ["nsa-cred-meta", clubMemberId] });
    } catch (e: any) {
      toast.error(e.message || "Could not verify NSA login");
    } finally { setSaving(false); }
  };

  const handleDeleteCreds = async () => {
    if (!confirm("Remove your saved NSA login from SquashHub?")) return;
    const { error } = await supabase.functions.invoke("nsa-submit-result", {
      body: { action: "delete_credentials", club_member_id: clubMemberId },
    });
    if (error) { toast.error(error.message); return; }
    toast.success("NSA login removed");
    qc.invalidateQueries({ queryKey: ["nsa-cred-meta", clubMemberId] });
  };

  const handleSubmit = async (mode: "check" | "commit") => {
    if (!fixtureId) { toast.error("This fixture has no NSA fixture ID linked"); return; }
    const missingNsf = matches.some((m, i) => (i === 0 || m.home_nsf || m.away_nsf) && (!m.home_nsf || !m.away_nsf));
    if (missingNsf) { toast.error("All players must have an NSF number to submit to NSA"); return; }
    setSubmitting(mode); setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("nsa-submit-result", {
        body: { action: "submit_result", club_member_id: clubMemberId, fixture_id: fixtureId, mode, matches },
      });
      if (error) throw error;
      const r = data as any;
      setResult({ ok: !!r.ok, errors: r.errors || [], notes: r.notes || [], mode, title: r.title });
      if (r.ok) toast.success(mode === "commit" ? "Submitted to NSA ✓" : "Validated by NSA ✓");
      else toast.error(`NSA returned ${r.errors?.length || 0} issue(s)`);
    } catch (e: any) {
      toast.error(e.message || "Submission failed");
    } finally { setSubmitting(null); }
  };

  const noCreds = meta && !meta.has_credentials;
  const hasCreds = meta && meta.has_credentials;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Shield className="w-4 h-4" /> Submit Result to NSA
          </DialogTitle>
          <DialogDescription className="text-xs">
            Posts this scorecard directly to <code className="text-[10px]">admin.northerns.co.za</code> using your captain login.
          </DialogDescription>
        </DialogHeader>

        {metaQ.isLoading && <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin" /></div>}

        {/* No creds yet — show opt-in form */}
        {noCreds && (
          <div className="space-y-3">
            <Alert>
              <AlertTriangle className="w-4 h-4" />
              <AlertDescription className="text-xs">
                Your NSA captain login is encrypted and stored only for you. Club admins cannot see it. You can remove it any time.
              </AlertDescription>
            </Alert>
            <div className="space-y-1">
              <Label htmlFor="nsa-user" className="text-xs">NSA Username (e.g. NSF6916)</Label>
              <Input id="nsa-user" value={username} onChange={(e) => setUsername(e.target.value.toUpperCase())} placeholder="NSF1234" autoComplete="off" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="nsa-pass" className="text-xs">NSA Password</Label>
              <Input id="nsa-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            </div>
            <Button className="w-full" size="sm" onClick={handleSaveCreds} disabled={saving}>
              {saving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Shield className="w-3 h-3 mr-1" />}
              Verify &amp; Save NSA Login
            </Button>
          </div>
        )}

        {/* Has creds — show submit controls */}
        {hasCreds && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs bg-muted/50 rounded p-2">
              <div>
                <div className="font-medium">{meta!.nsa_username}</div>
                <div className="text-[10px] text-muted-foreground">
                  {meta!.last_verification_status === "ok" ? "✓ Verified" : "Not verified"}
                  {meta!.last_verified_at ? ` · ${new Date(meta!.last_verified_at).toLocaleString()}` : ""}
                </div>
              </div>
              <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={handleDeleteCreds}>Remove</Button>
            </div>

            <div className="border rounded p-2 text-xs space-y-1">
              <div className="font-medium text-[11px]">Scorecard preview (NSA fixture #{fixtureId ?? "—"})</div>
              {matches.map((m, i) => (
                <div key={i} className="flex justify-between gap-2 font-mono text-[10px]">
                  <span className="truncate">{i + 1}. {m.home_player_name || m.home_nsf || "—"} vs {m.away_player_name || m.away_nsf || "—"}</span>
                  <span className="text-muted-foreground">{m.games.filter(g => g[0] != null).map(g => `${g[0]}-${g[1]}`).join(", ") || "—"}</span>
                </div>
              ))}
            </div>

            {result && (
              <Alert variant={result.ok ? "default" : "destructive"}>
                {result.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                <AlertDescription className="text-xs space-y-1">
                  <div className="font-medium">{result.mode === "commit" ? "Commit" : "Check Only"} response</div>
                  {result.notes.map((n, i) => <div key={`n${i}`}>✓ {n}</div>)}
                  {result.errors.map((e, i) => <div key={`e${i}`}>✗ {e}</div>)}
                  {result.title && <div className="text-[10px] text-muted-foreground">{result.title}</div>}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => handleSubmit("check")} disabled={!!submitting || !fixtureId}>
                {submitting === "check" ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                Validate (dry run)
              </Button>
              <Button size="sm" className="flex-1" onClick={() => handleSubmit("commit")} disabled={!!submitting || !fixtureId}>
                {submitting === "commit" ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                Submit to NSA
              </Button>
            </div>
            {!fixtureId && (
              <p className="text-[10px] text-amber-600">No NSA fixture ID linked to this match. Save it on the fixture first.</p>
            )}
          </div>
        )}

        <DialogFooter className="text-[10px] text-muted-foreground flex-col items-start">
          <a href="https://admin.northerns.co.za/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
            Open NSA admin <ExternalLink className="w-3 h-3" />
          </a>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
