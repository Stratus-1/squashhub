import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { CheckCircle2, Clock, Paperclip, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { SEO } from "@/components/SEO";
import { SignaturePad, type SignatureValue } from "@/components/club-admin/approvals/SignaturePad";

// Private email link for one approver: read the request, open its documents, approve with a signature or decline.
export default function ApprovalLink() {
  const { token = "" } = useParams();
  const [sig, setSig] = useState<SignatureValue>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const valid = /^[0-9a-f]{48}$/.test(token);

  const view = useQuery({
    queryKey: ["approval-link", token, done], enabled: valid, retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("approval-link", { body: { action: "view", token } });
      if (error || data?.error) throw new Error(data?.error || "This link is not valid");
      return data as any;
    },
  });

  const act = useMutation({
    mutationFn: async (kind: "sign" | "decline") => {
      const body = kind === "decline" ? { action: "decline", token, reason }
        : sig?.kind === "saved" ? { action: "sign", token, use_saved: true }
        : { action: "sign", token, signature: sig?.kind === "image" ? sig.dataUrl : "" };
      const { data, error } = await supabase.functions.invoke("approval-link", { body });
      if (error || data?.error) throw new Error(data?.error || "Something went wrong");
      return kind;
    },
    onSuccess: (k) => setDone(k === "sign" ? "Thank you — your approval and signature were saved." : "Your decision to decline was saved."),
  });

  const d = view.data;
  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <SEO title="Approval request" description="Committee approval request" path="/approve" noIndex />
      <div className="max-w-xl mx-auto space-y-3">
        <p className="text-xs text-muted-foreground">SquashHub · Committee approval</p>
        {!valid || view.isError ? (
          <Card><CardContent className="p-6 text-sm">This link is not valid. Please open the request from SquashHub.</CardContent></Card>
        ) : view.isLoading ? (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent></Card>
        ) : (
          <Card>
            <CardContent className="p-4 space-y-4">
              <div>
                <p className="text-xs text-muted-foreground">{d.club_name}</p>
                <h1 className="text-lg font-semibold">{d.topic}</h1>
                <p className="text-xs text-muted-foreground">Requested by {d.requester_name} · {format(new Date(d.created_at), "d MMM yyyy, HH:mm")}</p>
              </div>
              {d.amount != null && <p className="text-sm">Amount: <b>R {Number(d.amount).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</b></p>}
              {d.description && <p className="text-sm whitespace-pre-wrap">{d.description}</p>}
              {d.attachments?.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground">Documents</p>
                  {d.attachments.map((f: any, i: number) => f.url && (
                    <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
                      <Paperclip className="w-3.5 h-3.5" /> {f.file_name}
                    </a>
                  ))}
                </div>
              )}
              {d.requester_signature_url && (
                <div><p className="text-xs font-semibold text-muted-foreground mb-1">Signed by {d.requester_name}</p>
                  <img src={d.requester_signature_url} alt="Requester signature" className="h-14 object-contain rounded border" style={{ backgroundColor: "#ffffff" }} /></div>
              )}
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">Approvers</p>
                {d.approvers.map((a: any, i: number) => (
                  <div key={i} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                    <span className="flex items-center gap-1">
                      {a.status === "approved" ? <CheckCircle2 className="w-4 h-4 text-success" /> : a.status === "declined" ? <XCircle className="w-4 h-4 text-destructive" /> : <Clock className="w-4 h-4 text-muted-foreground" />}
                      {a.name}
                    </span>
                    {a.signature_url && <img src={a.signature_url} alt="" className="h-10 object-contain rounded" style={{ backgroundColor: "#ffffff" }} />}
                  </div>
                ))}
              </div>

              {done ? <p className="text-sm font-medium text-success">{done}</p>
                : d.status !== "open" ? <p className="text-sm text-muted-foreground">This request is {d.status}. Nothing more is needed from you.</p>
                : d.me.status !== "pending" ? <p className="text-sm text-muted-foreground">You have already answered this request.</p>
                : declining ? (
                  <div className="space-y-2">
                    <Label>Reason for declining</Label>
                    <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} />
                    <div className="flex gap-2">
                      <Button variant="destructive" disabled={!reason.trim() || act.isPending} onClick={() => act.mutate("decline")}>Decline request</Button>
                      <Button variant="ghost" onClick={() => setDeclining(false)}>Back</Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm font-medium">{d.me.name}, sign below to approve</p>
                    <SignaturePad savedUrl={d.saved_signature_url} onChange={setSig} allowSave={false} />
                    <div className="flex flex-wrap gap-2">
                      <Button disabled={!sig || act.isPending} onClick={() => act.mutate("sign")}><CheckCircle2 className="w-4 h-4 mr-1" /> {act.isPending ? "Saving…" : "Approve and sign"}</Button>
                      <Button variant="outline" onClick={() => setDeclining(true)}><XCircle className="w-4 h-4 mr-1" /> Decline</Button>
                    </div>
                  </div>
                )}
              {act.isError && <p className="text-sm text-destructive">{(act.error as Error).message}</p>}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
