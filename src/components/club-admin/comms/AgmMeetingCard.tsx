import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { FileText, Trash2, Upload, CalendarDays } from "lucide-react";
import type { AgmDocument } from "@/lib/agm/ballot";

const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Meeting invitation details + documents. Editable before and after voting opens. */
export function AgmMeetingCard({ clubId, ballot }: { clubId: string; ballot: any }) {
  const qc = useQueryClient();
  const [meetingAt, setMeetingAt] = useState(toLocalInput(ballot.meeting_at));
  const [venue, setVenue] = useState(ballot.meeting_venue ?? "");
  const [details, setDetails] = useState(ballot.meeting_details ?? "");
  const [docs, setDocs] = useState<AgmDocument[]>(ballot.documents ?? []);
  const [busy, setBusy] = useState(false);

  const persist = async (nextDocs: AgmDocument[]) => {
    const { error } = await supabase.rpc("agm_update_meeting" as any, {
      p_ballot_id: ballot.id, p_meeting_at: meetingAt ? new Date(meetingAt).toISOString() : null,
      p_venue: venue, p_details: details, p_documents: nextDocs,
    });
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["agm-ballots", clubId] });
  };

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try { await fn(); toast({ title: ok }); }
    catch (e: any) { toast({ title: "Could not save", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };

  const upload = (files: FileList | null) => run(async () => {
    const added: AgmDocument[] = [];
    for (const f of Array.from(files ?? [])) {
      const path = `${clubId}/${ballot.id}/${crypto.randomUUID()}-${f.name.replace(/[^\w.\-]+/g, "_")}`;
      const { error } = await supabase.storage.from("agm-documents").upload(path, f);
      if (error) throw error;
      added.push({ name: f.name, path });
    }
    const next = [...docs, ...added];
    await persist(next);
    setDocs(next);
  }, "Document attached");

  const remove = (d: AgmDocument) => run(async () => {
    const next = docs.filter((x) => x.path !== d.path);
    await persist(next);
    setDocs(next);
    await supabase.storage.from("agm-documents").remove([d.path]);
  }, "Document removed");

  const { data: invitees = [] } = useQuery({
    queryKey: ["agm-invitees", ballot.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("agm_invitees")
        .select("club_member_id,rsvp,rsvp_at,club_members(name)").eq("ballot_id", ballot.id);
      if (error) throw error;
      return data as any[];
    },
    enabled: ballot.status !== "draft",
    refetchInterval: 30_000,
  });
  const attending = invitees.filter((i) => i.rsvp === "attending");
  const apologies = invitees.filter((i) => i.rsvp === "apologies");

  return (
    <Card className="p-3 space-y-3">
      <p className="text-sm font-semibold flex items-center gap-1.5"><CalendarDays className="w-4 h-4 text-primary" />Meeting invitation</p>
      <div className="grid sm:grid-cols-2 gap-2">
        <label className="text-xs space-y-1"><span className="text-muted-foreground">Meeting date & time (your local time)</span>
          <Input type="datetime-local" value={meetingAt} onChange={(e) => setMeetingAt(e.target.value)} /></label>
        <label className="text-xs space-y-1"><span className="text-muted-foreground">Venue</span>
          <Input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="e.g. Clubhouse" /></label>
      </div>
      <label className="text-xs space-y-1 block"><span className="text-muted-foreground">Invitation message (optional)</span>
        <Textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} /></label>

      <div className="space-y-1">
        <p className="text-xs font-semibold">Documents (agenda, minutes, financials…)</p>
        {docs.map((d) => (
          <div key={d.path} className="flex items-center gap-2 text-xs border border-border rounded px-2 py-1">
            <FileText className="w-3.5 h-3.5 text-primary" /><span className="flex-1 truncate">{d.name}</span>
            <Button size="sm" variant="ghost" className="h-6 px-1" disabled={busy} onClick={() => remove(d)} aria-label={`Remove ${d.name}`}><Trash2 className="w-3.5 h-3.5" /></Button>
          </div>
        ))}
        <label className="inline-flex items-center gap-1 text-xs cursor-pointer text-primary">
          <Upload className="w-3.5 h-3.5" />Attach documents
          <input type="file" multiple className="hidden" disabled={busy} onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
        </label>
      </div>

      <div className="flex justify-end">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => persist(docs), "Meeting details saved")}>Save meeting details</Button>
      </div>

      {ballot.status !== "draft" && (
        <details className="text-xs">
          <summary className="cursor-pointer">
            Attendance: <strong>{attending.length}</strong> attending · {apologies.length} apologies · {invitees.length - attending.length - apologies.length} no reply ({invitees.length} invited)
          </summary>
          <div className="mt-2 max-h-64 overflow-auto divide-y divide-border border border-border rounded">
            {[...invitees].sort((a, b) => (a.club_members?.name ?? "").localeCompare(b.club_members?.name ?? "")).map((i) => (
              <div key={i.club_member_id} className="flex items-center gap-2 px-2 py-1">
                <span className="flex-1">{i.club_members?.name}</span>
                <Badge variant={i.rsvp === "attending" ? "default" : "secondary"} className="text-[10px]">
                  {i.rsvp === "attending" ? "attending" : i.rsvp === "apologies" ? "apologies" : "no reply"}
                </Badge>
              </div>
            ))}
          </div>
        </details>
      )}
    </Card>
  );
}
