import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, Landmark, Loader2, CheckCircle2, Upload } from "lucide-react";
import { toast } from "sonner";

export interface EftInvoiceLike {
  id: string;
  invoice_number: string;
  total: number;
  currency: string;
  due_date?: string | null;
  eft_proof_path?: string | null;
  eft_proof_uploaded_at?: string | null;
}

const SYMBOL: Record<string, string> = { ZAR: "R", USD: "$", EUR: "€", GBP: "£" };

const fmtMoney = (v: number, cur = "ZAR") =>
  `${SYMBOL[(cur || "ZAR").toUpperCase()] || ""}${Number(v || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function Row({
  label,
  value,
  onCopy,
  mono,
}: {
  label: string;
  value?: string | null;
  onCopy: (v: string, label: string) => void;
  mono?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`text-sm truncate ${mono ? "font-mono" : ""}`}>{value}</div>
      </div>
      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => onCopy(value, label)}>
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/**
 * Single shared destination for EFT payment of a platform subscription invoice.
 * Both the dashboard "Pay by EFT now" prompt and the invoice list route here so
 * the bank details, reference and proof-of-payment upload live in one place.
 */
export function PlatformInvoiceEftDialog({
  open,
  onOpenChange,
  invoice,
  clubId,
  bank,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invoice: EftInvoiceLike | null;
  clubId?: string | null;
  bank?: Record<string, string> | null;
}) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const copy = (text: string, label = "Copied") =>
    navigator.clipboard.writeText(text).then(
      () => toast.success(`${label} copied`),
      () => toast.error("Copy failed")
    );

  const handleUpload = async () => {
    if (!invoice || !file || !clubId) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
      const path = `${clubId}/platform-invoices/${invoice.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("payment-proofs")
        .upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (upErr) throw upErr;
      const { error: rpcErr } = await supabase.rpc("submit_platform_invoice_eft_proof", {
        _invoice_id: invoice.id,
        _path: path,
      });
      if (rpcErr) throw rpcErr;
      toast.success("Proof of payment uploaded — we'll verify and mark the invoice paid.");
      setFile(null);
      qc.invalidateQueries({ queryKey: ["club-platform-invoices", clubId] });
      qc.invalidateQueries({ queryKey: ["club-unpaid-sub-invoices", clubId] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const hasBank = !!bank?.bank_account_number;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Landmark className="h-4 w-4 text-primary" /> Pay by EFT
          </DialogTitle>
          <DialogDescription className="text-xs">
            Transfer the amount below, then upload your proof of payment here.
          </DialogDescription>
        </DialogHeader>

        {invoice && (
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/40 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Amount due</span>
                <span className="text-lg font-semibold">{fmtMoney(Number(invoice.total), invoice.currency)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Reference <span className="font-mono text-foreground">{invoice.invoice_number}</span>
                </span>
                {invoice.due_date && <span>due {new Date(invoice.due_date).toLocaleDateString()}</span>}
              </div>
            </div>

            {hasBank ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Row label="Bank" value={bank?.bank_name} onCopy={copy} />
                <Row label="Account name" value={bank?.bank_account_name} onCopy={copy} />
                <Row label="Account #" value={bank?.bank_account_number} onCopy={copy} mono />
                <Row label="Branch code" value={bank?.bank_branch_code} onCopy={copy} mono />
                <Row label="SWIFT" value={bank?.bank_swift} onCopy={copy} mono />
                <Row label="Reference" value={invoice.invoice_number} onCopy={copy} mono />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Bank details have not been published yet. Please contact the platform administrator.
              </p>
            )}

            {invoice.eft_proof_uploaded_at && (
              <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-xs">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                Proof already uploaded on {new Date(invoice.eft_proof_uploaded_at).toLocaleString()} — awaiting
                verification. You can upload a replacement below.
              </div>
            )}

            <div className="space-y-2 border-t pt-3">
              <Label className="text-xs">Proof of payment (PDF or image)</Label>
              <Input
                type="file"
                accept="application/pdf,image/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <Button className="w-full" disabled={!file || uploading} onClick={handleUpload}>
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading…
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" /> Upload proof of payment
                  </>
                )}
              </Button>
              <p className="text-[11px] text-muted-foreground">
                Use invoice number <strong>{invoice.invoice_number}</strong> as your payment reference so we can
                allocate it correctly.
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
