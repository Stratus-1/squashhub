import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isAcceptableJuniorBirthDate } from "@/lib/juniors/birth-date";

type Status = "loading" | "ok" | "done" | "expired" | "invalid" | "saved";

/**
 * Public page opened from the junior birth-date reminder (email / WhatsApp /
 * in-app). The single-use token in the path is checked server-side; the page
 * only ever learns the junior's first name and club.
 */
export default function JuniorBirthDate() {
  const { token = "" } = useParams();
  const [status, setStatus] = useState<Status>("loading");
  const [firstName, setFirstName] = useState("");
  const [clubName, setClubName] = useState("");
  const [dob, setDob] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase.rpc("junior_dob_link_info", { _token: token });
      if (!alive) return;
      const row = Array.isArray(data) ? data[0] : null;
      if (error || !row) { setStatus("invalid"); return; }
      setFirstName(row.first_name ?? "");
      setClubName(row.club_name ?? "");
      setStatus((row.status as Status) ?? "invalid");
    })();
    return () => { alive = false; };
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!isAcceptableJuniorBirthDate(dob)) { setError("Please check the date — it doesn't look like a junior's birth date."); return; }
    setSaving(true);
    const { data, error } = await supabase.rpc("junior_dob_submit", { _token: token, _dob: dob });
    setSaving(false);
    if (error) { setError("Something went wrong. Please try again."); return; }
    if (data === "saved" || data === "done") setStatus("saved");
    else if (data === "expired") setStatus("expired");
    else if (data === "bad_date") setError("Please check the date — it doesn't look like a junior's birth date.");
    else setStatus("invalid");
  };

  const who = firstName || "your junior";

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-lg">
            {status === "saved" || status === "done" ? "Thank you!" : status === "ok" || status === "loading" ? `${who}'s date of birth` : "Date of birth link"}
          </CardTitle>
          {clubName && <p className="text-sm text-muted-foreground">{clubName}</p>}
        </CardHeader>
        <CardContent className="space-y-4">
          {status === "loading" && <p className="text-sm text-muted-foreground">Loading…</p>}
          {status === "invalid" && <p className="text-sm">This link isn't valid. Please ask your club for help.</p>}
          {status === "expired" && <p className="text-sm">This link has expired. A new reminder will follow, or ask your club for help.</p>}
          {(status === "saved" || status === "done") && (
            <p className="text-sm">{`${who}'s date of birth is saved. ${who} will be placed in the right junior squash age group. You can close this page.`}</p>
          )}
          {status === "ok" && (
            <form onSubmit={submit} className="space-y-4">
              <p className="text-sm">
                {`We need ${who}'s date of birth to place them in the right junior squash age group (U11–U19). It is kept private — only the age group is shown.`}
              </p>
              <div className="space-y-2">
                <Label htmlFor="dob">Date of birth</Label>
                <Input id="dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} required />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={saving || !dob}>
                {saving ? "Saving…" : "Save date of birth"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
