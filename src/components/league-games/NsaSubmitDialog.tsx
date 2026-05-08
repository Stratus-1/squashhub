import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Shield, AlertTriangle, CheckCircle2, ExternalLink, Search } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNsaFixtures, NSA_CURRENT_SEASON } from "@/hooks/use-nsa";

interface NsaSubmitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clubMemberId: string;
  /** Local SquashHub fixture row id (UUID in platform_league_fixtures). Required to persist the receipt. */
  fixtureRowId?: string | null;
  /** Auto-resolution context (preferred) */
  homeTeamCode?: string | null;
  awayTeamCode?: string | null;
  fixtureDate?: string | null; // YYYY-MM-DD
  /** Optional explicit override */
  defaultFixtureId?: number | null;
  matches: Array<{
    home_nsf: string;
    away_nsf: string;
    games: Array<[number | null, number | null]>;
    home_player_name?: string;
    away_player_name?: string;
    is_forfeit?: boolean;
    forfeit_side?: "home" | "away" | null;
    marker_nsf?: string | null;
  }>;
}

type CredMeta = {
  has_credentials: boolean;
  nsa_username: string | null;
  last_verified_at: string | null;
  last_verification_status: string | null;
};

type ReceiptRow = {
  nsa_fixture_id: number | null;
  nsa_submitted_at: string | null;
  nsa_submitted_by: string | null;
  nsa_submission_notes: string | null;
  submitted_by_name?: string | null;
};

export function NsaSubmitDialog({ open, onOpenChange, clubMemberId, fixtureRowId, homeTeamCode, awayTeamCode, fixtureDate, defaultFixtureId, matches }: NsaSubmitDialogProps) {
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fixtureIdInput, setFixtureIdInput] = useState<string>(defaultFixtureId ? String(defaultFixtureId) : "");
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState<"check" | "commit" | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; errors: string[]; notes: string[]; mode: string; title?: string | null } | null>(null);
  const [checkPassedAt, setCheckPassedAt] = useState<number | null>(null);
  const [verification, setVerification] = useState<{ ok: boolean; message: string } | null>(null);
  const [overrideExisting, setOverrideExisting] = useState(false);

  // Auto-resolve NSA fixture id by querying the public fixtures feed and matching
  // on team codes (case-insensitive) + date.
  const canAutoResolve = !!(open && homeTeamCode && awayTeamCode && fixtureDate);
  const { data: nsaFixtures, isFetching: resolvingFixture } = useNsaFixtures({
    league: NSA_CURRENT_SEASON,
    status: "completed",
    enabled: canAutoResolve,
  });

  const resolvedFixtureId = useMemo<number | null>(() => {
    if (!canAutoResolve || !nsaFixtures) return null;
    const h = (homeTeamCode || "").toUpperCase();
    const a = (awayTeamCode || "").toUpperCase();
    const match = nsaFixtures.find((f) => {
      const c1 = (f.team1?.code || "").toUpperCase();
      const c2 = (f.team2?.code || "").toUpperCase();
      const dateMatches = !fixtureDate || f.date === fixtureDate;
      return dateMatches && ((c1 === h && c2 === a) || (c1 === a && c2 === h));
    });
    return match ? Number(match.id) : null;
  }, [nsaFixtures, canAutoResolve, homeTeamCode, awayTeamCode, fixtureDate]);

  useEffect(() => {
    if (resolvedFixtureId && !fixtureIdInput) setFixtureIdInput(String(resolvedFixtureId));
  }, [resolvedFixtureId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fixtureId = fixtureIdInput.trim() ? Number(fixtureIdInput.trim()) : null;

  // Reset transient state when dialog opens
  useEffect(() => {
    if (open) {
      setResult(null);
      setCheckPassedAt(null);
      setVerification(null);
      setOverrideExisting(false);
    }
  }, [open]);

  // ---- Cred meta ----
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

  // ---- Existing receipt (already posted?) ----
  const receiptQ = useQuery({
    queryKey: ["nsa-receipt", fixtureRowId],
    enabled: open && !!fixtureRowId,
    queryFn: async (): Promise<ReceiptRow | null> => {
      const { data, error } = await supabase
        .from("platform_league_fixtures")
        .select("nsa_fixture_id, nsa_submitted_at, nsa_submitted_by, nsa_submission_notes")
        .eq("id", fixtureRowId!)
        .maybeSingle();
      if (error) throw error;
      if (!data || !data.nsa_submitted_at) return data as any;
      // Look up captain name
      let submittedByName: string | null = null;
      if (data.nsa_submitted_by) {
        const { data: cm } = await supabase
          .from("club_members")
          .select("name")
          .eq("id", data.nsa_submitted_by)
          .maybeSingle();
        if (cm) submittedByName = (cm.name ?? "").trim() || null;
      }
      return { ...(data as any), submitted_by_name: submittedByName };
    },
  });
  const receipt = receiptQ.data;
  const alreadyPosted = !!(receipt?.nsa_submitted_at && receipt?.nsa_fixture_id);

  // ---- Save / delete creds ----
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

  // ---- Submit ----
  const handleSubmit = async (mode: "check" | "commit") => {
    if (!fixtureId) { toast.error("This fixture has no NSA fixture ID linked"); return; }
    const missingNsf = matches.some((m, i) => (i === 0 || m.home_nsf || m.away_nsf) && (!m.home_nsf || !m.away_nsf));
    if (missingNsf) { toast.error("All players must have an NSF number to submit to NSA"); return; }

    // Gate: Commit requires a fresh successful Check
    if (mode === "commit") {
      if (!checkPassedAt) { toast.error("Run Validate first — Commit is locked until NSA accepts a dry run."); return; }
      if (alreadyPosted && !overrideExisting) {
        toast.error("This fixture is already posted to NSA — tick 'Re-submit' to overwrite.");
        return;
      }
    }

    setSubmitting(mode);
    setResult(null);
    setVerification(null);
    try {
      const { data, error } = await supabase.functions.invoke("nsa-submit-result", {
        body: { action: "submit_result", club_member_id: clubMemberId, fixture_id: fixtureId, mode, matches },
      });
      if (error) throw error;
      const r = data as any;
      const okFlag = !!r.ok;
      setResult({ ok: okFlag, errors: r.errors || [], notes: r.notes || [], mode, title: r.title });

      if (mode === "check") {
        if (okFlag) {
          setCheckPassedAt(Date.now());
          toast.success("Validated by NSA ✓ — you can now Commit");
        } else {
          setCheckPassedAt(null);
          toast.error(`NSA returned ${r.errors?.length || 0} issue(s) — fix and re-validate`);
        }
        return;
      }

      // mode === "commit"
      if (!okFlag) {
        toast.error(`Commit rejected by NSA (${r.errors?.length || 0} issue(s))`);
        return;
      }
      toast.success("Submitted to NSA ✓ — verifying…");

      // Step 2: re-fetch fixture from NSA public feed to confirm it shows as completed.
      setVerifying(true);
      try {
        const { data: vData } = await supabase.functions.invoke("nsa-submit-result", {
          body: { action: "verify_committed", fixture_id: fixtureId, league: NSA_CURRENT_SEASON },
        });
        const v = vData as any;
        const verifiedOk = !!v?.ok;
        setVerification({
          ok: verifiedOk,
          message: verifiedOk
            ? `Confirmed on NSA (status: ${v.status})`
            : v?.found
              ? `NSA still shows status "${v.status}" — refresh in a moment`
              : (v?.message || "NSA hasn't published the result yet"),
        });

        // Step 3: persist receipt locally regardless — NSA accepted the commit.
        if (fixtureRowId) {
          const { error: upErr } = await supabase
            .from("platform_league_fixtures")
            .update({
              nsa_fixture_id: fixtureId,
              nsa_submitted_at: new Date().toISOString(),
              nsa_submitted_by: clubMemberId,
              nsa_submission_notes: [r.title, ...(r.notes || [])].filter(Boolean).join(" · ").slice(0, 500) || null,
            })
            .eq("id", fixtureRowId);
          if (upErr) {
            toast.error("Posted to NSA but couldn't save local receipt: " + upErr.message);
          } else {
            qc.invalidateQueries({ queryKey: ["nsa-receipt", fixtureRowId] });
          }
        }

        if (verifiedOk) toast.success("Confirmed saved on NSA ✓");
        else toast.message("Committed — NSA verification pending", { description: "The result was accepted; the public feed may take a moment to refresh." });
      } finally {
        setVerifying(false);
      }
    } catch (e: any) {
      toast.error(e.message || "Submission failed");
    } finally {
      setSubmitting(null);
    }
  };

  const noCreds = meta && !meta.has_credentials;
  const hasCreds = meta && meta.has_credentials;

  // Commit button is locked unless a check just passed AND (not already posted OR override checked)
  const commitDisabled =
    !!submitting ||
    !fixtureId ||
    !checkPassedAt ||
    (alreadyPosted && !overrideExisting);

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

            {/* Already-posted banner */}
            {alreadyPosted && (
              <Alert>
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <AlertDescription className="text-xs space-y-2">
                  <div>
                    <span className="font-medium">Already posted to NSA</span>
                    {receipt?.submitted_by_name ? <> by <b>{receipt.submitted_by_name}</b></> : null}
                    {receipt?.nsa_submitted_at ? ` · ${new Date(receipt.nsa_submitted_at).toLocaleString()}` : ""}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    NSA fixture #{receipt?.nsa_fixture_id}
                    {receipt?.nsa_submission_notes ? ` · ${receipt.nsa_submission_notes}` : ""}
                  </div>
                  <label className="flex items-center gap-2 text-[11px] cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={overrideExisting}
                      onChange={(e) => setOverrideExisting(e.target.checked)}
                    />
                    Re-submit (overwrite NSA result)
                  </label>
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="nsa-fix" className="text-xs">NSA Fixture ID</Label>
                {canAutoResolve && (
                  <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                    {resolvingFixture ? (
                      <><Loader2 className="w-3 h-3 animate-spin" /> Looking up…</>
                    ) : resolvedFixtureId ? (
                      <><CheckCircle2 className="w-3 h-3 text-green-600" /> Auto-detected from {homeTeamCode} vs {awayTeamCode}</>
                    ) : (
                      <><Search className="w-3 h-3 text-amber-600" /> No NSA match for {homeTeamCode} vs {awayTeamCode} on {fixtureDate}</>
                    )}
                  </span>
                )}
              </div>
              <Input
                id="nsa-fix"
                inputMode="numeric"
                placeholder="e.g. 294400"
                value={fixtureIdInput}
                onChange={(e) => { setFixtureIdInput(e.target.value.replace(/\D/g, "")); setCheckPassedAt(null); }}
              />
              <p className="text-[10px] text-muted-foreground">
                {resolvedFixtureId
                  ? "Override only if NSA assigned a different fixture ID."
                  : <>Find it on NSA admin → Fixtures: <code>fixtureinput.php?fixture=<b>NNNNNN</b></code></>}
              </p>
            </div>

            <div className="border rounded p-2 text-xs space-y-1">
              <div className="font-medium text-[11px]">Scorecard preview</div>
              {matches.map((m, i) => (
                <div key={i} className="flex justify-between gap-2 font-mono text-[10px]">
                  <span className="truncate">{i + 1}. {m.home_player_name || m.home_nsf || "—"} vs {m.away_player_name || m.away_nsf || "—"}</span>
                  <span className="text-muted-foreground">{m.games.filter(g => g[0] != null).map(g => `${g[0]}-${g[1]}`).join(", ") || "—"}</span>
                </div>
              ))}
            </div>

            {/* Pre-submit warnings */}
            <PreSubmitWarnings matches={matches} />

            {/* Validate / Commit step indicator */}
            <div className="flex items-center gap-2 text-[10px]">
              <span className={`px-1.5 py-0.5 rounded ${checkPassedAt ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" : "bg-muted text-muted-foreground"}`}>
                1. Validate {checkPassedAt ? "✓" : ""}
              </span>
              <span className="text-muted-foreground">→</span>
              <span className={`px-1.5 py-0.5 rounded ${verification?.ok ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" : "bg-muted text-muted-foreground"}`}>
                2. Commit {verification?.ok ? "✓" : ""}
              </span>
              <span className="text-muted-foreground">→</span>
              <span className={`px-1.5 py-0.5 rounded ${verification?.ok ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" : "bg-muted text-muted-foreground"}`}>
                3. Confirmed {verification?.ok ? "✓" : ""}
              </span>
            </div>

            {result && (
              <Alert variant={result.ok ? "default" : "destructive"}>
                {result.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                <AlertDescription className="text-xs space-y-1">
                  <div className="font-medium">{result.mode === "commit" ? "Commit" : "Validate"} response</div>
                  {result.notes.map((n, i) => <div key={`n${i}`}>✓ {n}</div>)}
                  {result.errors.map((e, i) => <div key={`e${i}`}>✗ {e}</div>)}
                  {result.title && <div className="text-[10px] text-muted-foreground">{result.title}</div>}
                </AlertDescription>
              </Alert>
            )}

            {verification && (
              <Alert variant={verification.ok ? "default" : "destructive"}>
                {verification.ok ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <AlertTriangle className="w-4 h-4" />}
                <AlertDescription className="text-xs">
                  {verifying ? "Verifying with NSA…" : verification.message}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => handleSubmit("check")}
                disabled={!!submitting || !fixtureId}
              >
                {submitting === "check" ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                1. Validate (dry run)
              </Button>
              <Button
                size="sm"
                className="flex-1"
                onClick={() => handleSubmit("commit")}
                disabled={commitDisabled}
              >
                {submitting === "commit" || verifying ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                2. Commit to NSA
              </Button>
            </div>

            {!fixtureId && (
              <p className="text-[10px] text-amber-600">No NSA fixture ID linked to this match.</p>
            )}
            {!checkPassedAt && fixtureId && (
              <p className="text-[10px] text-muted-foreground">Commit is locked until Validate succeeds.</p>
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
