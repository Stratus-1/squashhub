import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Clock, FileText, Paperclip, Plus, Printer, Search, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  approverOptions, isWaitingForMe, officeLabel, STATUS_LABEL,
  type ApprovalRequest, type EligibleMember, type RequestStatus,
} from "@/lib/approvals";
import { SignaturePad, dataUrlToBlob, type SignatureValue } from "./SignaturePad";

const BUCKET = "club-approvals";
const rpc = (fn: string, args: Record<string, unknown>) => (supabase as any).rpc(fn, args);

function statusClass(s: RequestStatus) {
  if (s === "approved") return "bg-success/15 text-success border-success/30";
  if (s === "declined") return "bg-destructive/15 text-destructive border-destructive/30";
  if (s === "withdrawn") return "bg-muted text-muted-foreground";
  return "bg-warning/15 text-warning-foreground border-warning/30";
}
const money = (n: number | null) => n == null ? null : `R ${Number(n).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function useSignedUrl(path?: string | null) {
  return useQuery({
    queryKey: ["approval-signed", path], enabled: !!path, staleTime: 50 * 60_000,
    queryFn: async () => (await supabase.storage.from(BUCKET).createSignedUrl(path!, 3600)).data?.signedUrl ?? null,
  });
}
function SignedImg({ path, alt }: { path?: string | null; alt: string }) {
  const { data } = useSignedUrl(path);
  if (!data) return null;
  return <img src={data} alt={alt} className="h-14 max-w-[200px] object-contain rounded border" style={{ backgroundColor: "#ffffff" }} />;
}

export function ApprovalsTab({ clubId }: { clubId: string }) {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<"mine_to_sign" | "my_requests" | "open" | "approved" | "declined">("mine_to_sign");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const selectedId = params.get("request");
  const setSelected = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("request", id); else next.delete("request");
    setParams(next, { replace: true });
  };

  const list = useQuery({
    queryKey: ["approvals", clubId],
    queryFn: async () => {
      const { data, error } = await rpc("approval_list", { p_club: clubId });
      if (error) throw error;
      return data as { my_member_ids: string[]; requests: ApprovalRequest[] };
    },
  });
  const mine = list.data?.my_member_ids ?? [];
  const requests = list.data?.requests ?? [];

  const savedSig = useQuery({
    queryKey: ["my-signature", clubId],
    queryFn: async () => {
      const { data } = await supabase.from("member_signatures" as any).select("club_member_id,path").eq("club_id", clubId).maybeSingle();
      return (data as any) as { club_member_id: string; path: string } | null;
    },
  });
  const savedUrl = useSignedUrl(savedSig.data?.path).data ?? null;

  const counts = useMemo(() => ({
    mine_to_sign: requests.filter((r) => isWaitingForMe(r, mine)).length,
    my_requests: requests.filter((r) => mine.includes(r.requester_member_id)).length,
    open: requests.filter((r) => r.status === "open").length,
    approved: requests.filter((r) => r.status === "approved").length,
    declined: requests.filter((r) => r.status === "declined" || r.status === "withdrawn").length,
  }), [requests, mine]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return requests.filter((r) => {
      if (tab === "mine_to_sign" && !isWaitingForMe(r, mine)) return false;
      if (tab === "my_requests" && !mine.includes(r.requester_member_id)) return false;
      if (tab === "open" && r.status !== "open") return false;
      if (tab === "approved" && r.status !== "approved") return false;
      if (tab === "declined" && !(r.status === "declined" || r.status === "withdrawn")) return false;
      return !q || `${r.topic} ${r.description} ${r.requester_name}`.toLowerCase().includes(q);
    });
  }, [requests, tab, query, mine]);

  const selected = requests.find((r) => r.id === selectedId) ?? null;
  useEffect(() => { if (selected) rpc("approval_log_view", { p_request: selected.id }); }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => { qc.invalidateQueries({ queryKey: ["approvals", clubId] }); qc.invalidateQueries({ queryKey: ["my-signature", clubId] }); };

  /** Stores a signature snapshot inside the request folder; optionally saves it for reuse. */
  const storeSignature = async (requestId: string, sig: SignatureValue): Promise<string> => {
    if (!sig) throw new Error("Please sign first");
    const memberId = mine[0];
    let blob: Blob;
    if (sig.kind === "saved") {
      if (!savedSig.data?.path) throw new Error("No saved signature");
      const { data, error } = await supabase.storage.from(BUCKET).download(savedSig.data.path);
      if (error || !data) throw new Error("Could not read your saved signature");
      blob = data;
    } else {
      blob = await dataUrlToBlob(sig.dataUrl);
      if (sig.save) {
        const owner = savedSig.data?.club_member_id ?? memberId;
        const savedPath = `${clubId}/saved/${owner}-${Date.now()}.png`;
        const up = await supabase.storage.from(BUCKET).upload(savedPath, blob, { contentType: "image/png" });
        if (!up.error) {
          const { data: u } = await supabase.auth.getUser();
          await supabase.from("member_signatures" as any).upsert({ club_member_id: owner, club_id: clubId, user_id: u.user?.id, path: savedPath, updated_at: new Date().toISOString() });
        }
      }
    }
    const path = `${clubId}/${requestId}/sig-${memberId}-${Date.now()}.png`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || "image/png" });
    if (error) throw new Error("Could not save signature");
    return path;
  };

  if (list.isError) {
    return <Card className="mt-4"><CardContent className="p-6 text-sm text-muted-foreground">Approvals are for the club's office bearers and admins.</CardContent></Card>;
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Committee approvals</h2>
          <p className="text-xs text-muted-foreground">Ask committee members to sign off on a transaction or decision. Approved requests stay here as a permanent record.</p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}><Plus className="w-4 h-4 mr-1" /> New request</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-3">
        <Card className={cn(selected && "hidden lg:block")}>
          <CardContent className="p-2 space-y-2">
            <div className="flex flex-wrap gap-1 p-1">
              {([["mine_to_sign", "Waiting for me"], ["my_requests", "My requests"], ["open", "Open"], ["approved", "Approved"], ["declined", "Declined"]] as const).map(([k, l]) => (
                <Button key={k} size="sm" variant={tab === k ? "default" : "outline"} className="h-8 text-xs" onClick={() => setTab(k)}>
                  {l} <span className="ml-1 tabular-nums opacity-70">{counts[k]}</span>
                </Button>
              ))}
            </div>
            <div className="relative px-1">
              <Search className="w-4 h-4 text-muted-foreground absolute left-4 top-1/2 -translate-y-1/2" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search topic, description, name…" className="pl-9 h-9" />
            </div>
            {list.isLoading ? <p className="p-3 text-sm text-muted-foreground">Loading…</p>
              : filtered.length === 0 ? <p className="p-3 text-sm text-muted-foreground">No requests here.</p>
              : <div className="space-y-1 max-h-[70vh] overflow-auto">
                {filtered.map((r) => {
                  const done = r.approvers.filter((a) => a.status === "approved").length;
                  return (
                    <button key={r.id} onClick={() => setSelected(r.id)}
                      className={cn("w-full text-left rounded-lg border px-3 py-2", r.id === selectedId ? "border-primary/40 bg-primary/5" : "border-border/50 hover:bg-muted/30")}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold truncate">{r.topic}</p>
                        <Badge variant="secondary" className={cn("text-[10px] shrink-0 border", statusClass(r.status))}>{STATUS_LABEL[r.status]}</Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {r.requester_name} · {format(new Date(r.created_at), "d MMM yyyy")}{r.amount != null ? ` · ${money(r.amount)}` : ""} · {done}/{r.approvers.length} signed
                      </p>
                    </button>
                  );
                })}
              </div>}
          </CardContent>
        </Card>

        <Card className={cn(!selected && "hidden lg:block")}>
          <CardContent className="p-3">
            {!selected ? (
              <div className="p-8 text-center text-sm text-muted-foreground"><FileText className="w-6 h-6 mx-auto mb-2 opacity-60" />Select a request to view it.</div>
            ) : (
              <RequestDetail key={selected.id} r={selected} mine={mine} savedUrl={savedUrl}
                onBack={() => setSelected(null)} storeSignature={storeSignature} onChanged={refresh} />
            )}
          </CardContent>
        </Card>
      </div>

      {creating && (
        <NewRequestDialog clubId={clubId} mine={mine} savedUrl={savedUrl} storeSignature={storeSignature}
          onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); refresh(); setTab("my_requests"); setSelected(id); }} />
      )}
    </div>
  );
}

function RequestDetail({ r, mine, savedUrl, onBack, storeSignature, onChanged }: {
  r: ApprovalRequest; mine: string[]; savedUrl: string | null; onBack: () => void;
  storeSignature: (id: string, s: SignatureValue) => Promise<string>; onChanged: () => void;
}) {
  const [sig, setSig] = useState<SignatureValue>(null);
  const [signing, setSigning] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const myPending = r.status === "open" && r.approvers.some((a) => a.status === "pending" && mine.includes(a.member_id));
  const iAmRequester = mine.includes(r.requester_member_id);

  const act = useMutation({
    mutationFn: async (kind: "sign" | "decline" | "withdraw" | "comment") => {
      if (kind === "sign") {
        const path = await storeSignature(r.id, sig);
        const { error } = await rpc("approval_sign", { p_request: r.id, p_signature_path: path }); if (error) throw error;
      } else if (kind === "decline") {
        const { error } = await rpc("approval_decline", { p_request: r.id, p_reason: reason }); if (error) throw error;
      } else if (kind === "withdraw") {
        const { error } = await rpc("approval_withdraw", { p_request: r.id }); if (error) throw error;
      } else {
        const { error } = await rpc("approval_comment", { p_request: r.id, p_note: comment }); if (error) throw error;
      }
      return kind;
    },
    onSuccess: (k) => {
      toast.success(k === "sign" ? "Approved and signed" : k === "decline" ? "Request declined" : k === "withdraw" ? "Request withdrawn" : "Comment added");
      setSigning(false); setDeclining(false); setComment(""); onChanged();
    },
    onError: (e: any) => toast.error(e?.message || "Something went wrong"),
  });

  const openFile = async (path: string) => {
    const { data } = await supabase.storage.from("club-approvals").createSignedUrl(path, 600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  };

  const comments = r.events.filter((e) => e.kind === "comment");
  const log = r.events.filter((e) => e.kind !== "comment");

  return (
    <div className="space-y-4" id="approval-print">
      <Button variant="ghost" size="sm" className="lg:hidden -ml-1 h-8 px-2 print:hidden" onClick={onBack}><ArrowLeft className="w-4 h-4 mr-1" /> Back to requests</Button>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">{r.topic}</h3>
          <p className="text-xs text-muted-foreground">Requested by {r.requester_name} · {format(new Date(r.created_at), "d MMM yyyy, HH:mm")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className={cn("border", statusClass(r.status))}>{STATUS_LABEL[r.status]}</Badge>
          <Button variant="outline" size="sm" className="h-8 print:hidden" onClick={() => window.print()}><Printer className="w-4 h-4 mr-1" /> PDF</Button>
        </div>
      </div>

      {r.amount != null && <p className="text-sm"><span className="text-muted-foreground">Amount:</span> <span className="font-semibold">{money(r.amount)}</span></p>}
      {r.description && <p className="text-sm whitespace-pre-wrap">{r.description}</p>}

      {r.attachments.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground">Documents</p>
          {r.attachments.map((f) => (
            <button key={f.id} onClick={() => openFile(f.path)} className="flex items-center gap-2 text-sm text-primary underline-offset-2 hover:underline">
              <Paperclip className="w-3.5 h-3.5" /> {f.file_name}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-lg border p-3 space-y-1">
        <p className="text-xs font-semibold text-muted-foreground">Requester signature</p>
        <div className="flex items-center gap-3"><SignedImg path={r.requester_signature_path} alt={`${r.requester_name} signature`} /><span className="text-xs">{r.requester_name}</span></div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">Approvers</p>
        {r.approvers.map((a) => (
          <div key={a.id} className="rounded-lg border p-3 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">{a.name}{a.office ? <span className="text-muted-foreground font-normal"> · {officeLabel(a.office)}</span> : null}</p>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                {a.status === "approved" ? <><CheckCircle2 className="w-3.5 h-3.5 text-success" /> Approved {a.signed_at && format(new Date(a.signed_at), "d MMM yyyy, HH:mm")}{a.signed_via === "email link" ? " (via email)" : ""}</>
                  : a.status === "declined" ? <><XCircle className="w-3.5 h-3.5 text-destructive" /> Declined: {a.decline_reason}</>
                  : <><Clock className="w-3.5 h-3.5" /> Waiting</>}
              </p>
            </div>
            {a.signature_path && <SignedImg path={a.signature_path} alt={`${a.name} signature`} />}
          </div>
        ))}
      </div>

      {myPending && !signing && !declining && (
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button onClick={() => setSigning(true)}><CheckCircle2 className="w-4 h-4 mr-1" /> Approve and sign</Button>
          <Button variant="outline" onClick={() => setDeclining(true)}><XCircle className="w-4 h-4 mr-1" /> Decline</Button>
        </div>
      )}
      {signing && (
        <div className="rounded-lg border p-3 space-y-3 print:hidden">
          <p className="text-sm font-medium">Your signature</p>
          <SignaturePad savedUrl={savedUrl} onChange={setSig} />
          <div className="flex gap-2">
            <Button disabled={!sig || act.isPending} onClick={() => act.mutate("sign")}>{act.isPending ? "Saving…" : "Approve"}</Button>
            <Button variant="ghost" onClick={() => setSigning(false)}>Cancel</Button>
          </div>
        </div>
      )}
      {declining && (
        <div className="rounded-lg border p-3 space-y-2 print:hidden">
          <Label>Reason for declining</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} />
          <div className="flex gap-2">
            <Button variant="destructive" disabled={!reason.trim() || act.isPending} onClick={() => act.mutate("decline")}>Decline request</Button>
            <Button variant="ghost" onClick={() => setDeclining(false)}>Cancel</Button>
          </div>
        </div>
      )}
      {iAmRequester && r.status === "open" && (
        <Button variant="outline" size="sm" className="print:hidden" disabled={act.isPending}
          onClick={() => { if (confirm("Withdraw this request?")) act.mutate("withdraw"); }}>Withdraw request</Button>
      )}

      <div className="space-y-2 print:hidden">
        <p className="text-xs font-semibold text-muted-foreground">Comments</p>
        {comments.length === 0 && <p className="text-xs text-muted-foreground">No comments yet.</p>}
        {comments.map((c, i) => (
          <div key={i} className="rounded-md bg-muted/40 px-3 py-2 text-sm">
            <p className="text-[11px] text-muted-foreground">{c.actor_name} · {format(new Date(c.created_at), "d MMM, HH:mm")}</p>
            <p className="whitespace-pre-wrap">{c.note}</p>
          </div>
        ))}
        <div className="flex gap-2">
          <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Ask a question or add a note…" maxLength={2000} />
          <Button size="sm" disabled={!comment.trim() || act.isPending} onClick={() => act.mutate("comment")}>Add</Button>
        </div>
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">Activity log</summary>
        <ul className="mt-2 space-y-1">
          {log.map((e, i) => (
            <li key={i}>{format(new Date(e.created_at), "d MMM yyyy, HH:mm")} — {e.actor_name ?? "System"}: {
              ({ created: "created the request", viewed: "opened the request", approved: "approved", declined: "declined", withdrawn: "withdrew the request", approved_all: "Request fully approved" } as Record<string, string>)[e.kind] ?? e.kind
            }{e.note && e.kind !== "declined" ? ` (${e.note})` : ""}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function NewRequestDialog({ clubId, mine, savedUrl, storeSignature, onClose, onCreated }: {
  clubId: string; mine: string[]; savedUrl: string | null;
  storeSignature: (id: string, s: SignatureValue) => Promise<string>; onClose: () => void; onCreated: (id: string) => void;
}) {
  const [topic, setTopic] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [approvers, setApprovers] = useState<string[]>([]);
  const [sig, setSig] = useState<SignatureValue>(null);

  const eligible = useQuery({
    queryKey: ["approval-eligible", clubId],
    queryFn: async () => {
      const { data, error } = await rpc("approval_eligible_members", { p_club: clubId });
      if (error) throw error; return data as EligibleMember[];
    },
  });
  const options = approverOptions(eligible.data ?? [], mine);

  const create = useMutation({
    mutationFn: async () => {
      const id = crypto.randomUUID();
      const attachments = [];
      for (const f of files) {
        const safe = f.name.replace(/[^\w.\-]+/g, "_").slice(-120);
        const path = `${clubId}/${id}/files/${Date.now()}-${safe}`;
        const { error } = await supabase.storage.from("club-approvals").upload(path, f, { contentType: f.type || undefined });
        if (error) throw new Error(`Could not upload ${f.name}`);
        attachments.push({ path, file_name: f.name, mime_type: f.type || null, size_bytes: f.size });
      }
      const sigPath = await storeSignature(id, sig);
      const amt = amount.trim() ? Number(amount.replace(",", ".")) : null;
      const { error } = await rpc("approval_create", {
        p_id: id, p_club: clubId, p_topic: topic, p_description: description, p_amount: amt,
        p_approvers: approvers, p_signature_path: sigPath, p_attachments: attachments,
      });
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => { toast.success("Request sent to the selected committee members"); onCreated(id); },
    onError: (e: any) => toast.error(e?.message || "Could not create the request"),
  });

  const amountOk = !amount.trim() || (!Number.isNaN(Number(amount.replace(",", "."))) && Number(amount.replace(",", ".")) >= 0);
  const ready = topic.trim() && approvers.length > 0 && sig && amountOk && !create.isPending;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New approval request</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Topic</Label><Input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={200} placeholder="e.g. Pay court resurfacing deposit" /></div>
          <div className="space-y-1"><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} rows={4} /></div>
          <div className="space-y-1"><Label>Amount (R, optional)</Label><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></div>
          <div className="space-y-1">
            <Label>Documents (optional)</Label>
            <input type="file" multiple accept=".pdf,image/*,.doc,.docx,.xls,.xlsx,.csv" className="text-xs block"
              onChange={(e) => setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])].filter((f) => f.size <= 20_000_000))} />
            {files.map((f, i) => (
              <div key={i} className="flex items-center justify-between text-xs"><span className="truncate">{f.name}</span>
                <button type="button" className="underline text-muted-foreground" onClick={() => setFiles(files.filter((_, j) => j !== i))}>Remove</button></div>
            ))}
          </div>
          <div className="space-y-1">
            <Label>Committee members who must approve</Label>
            {eligible.isLoading ? <p className="text-xs text-muted-foreground">Loading…</p> : options.length === 0
              ? <p className="text-xs text-muted-foreground">No other office bearers found for this club.</p>
              : <div className="rounded-md border divide-y max-h-48 overflow-auto">
                {options.map((m) => (
                  <label key={m.member_id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer">
                    <Checkbox checked={approvers.includes(m.member_id)}
                      onCheckedChange={(v) => setApprovers((p) => v ? [...p, m.member_id] : p.filter((x) => x !== m.member_id))} />
                    <span className="flex-1">{m.name}<span className="text-muted-foreground"> · {officeLabel(m.office) || (m.is_admin ? "Club admin" : "")}</span></span>
                    {!m.has_email && <span className="text-[10px] text-muted-foreground">in-app only</span>}
                  </label>
                ))}
              </div>}
            <p className="text-[11px] text-muted-foreground">Everyone you pick must approve. They get an in-app notice and an email with a private link.</p>
          </div>
          <div className="space-y-1"><Label>Your signature</Label><SignaturePad savedUrl={savedUrl} onChange={setSig} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!ready} onClick={() => create.mutate()}>{create.isPending ? "Sending…" : "Sign and send"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
