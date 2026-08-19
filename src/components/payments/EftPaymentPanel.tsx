import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Copy, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type ClubBankDetails = {
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_branch_code: string | null;
  bank_reference: string | null;
};

interface Props {
  clubId: string;
  /** Club member paying — used for the storage path and its RLS check. */
  clubMemberId: string;
  amountLabel: string;
  reference: string;
  /** Already-uploaded proof (storage path); hides the picker and shows a confirmation. */
  proofPath?: string | null;
  /** Called with the storage path after a successful upload. */
  onProofUploaded?: (path: string) => Promise<void> | void;
  /** Set false to hide the upload control entirely (e.g. no fee due). */
  allowProofUpload?: boolean;
  className?: string;
}

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";

/**
 * Bank details + proof-of-payment upload for EFT payers. Shared by the
 * tournament page and the dashboard invite flow so both show identical
 * instructions.
 */
export function EftPaymentPanel({
  clubId, clubMemberId, amountLabel, reference, proofPath, onProofUploaded,
  allowProofUpload = true, className,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: bank } = useQuery({
    queryKey: ["club-bank-details", clubId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_club_bank_details", { _club_id: clubId });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row || null) as ClubBankDetails | null;
    },
    enabled: !!clubId,
  });

  const copy = () => {
    if (!bank) return;
    const parts = [
      bank.bank_name && `Bank: ${bank.bank_name}`,
      bank.bank_account_name && `Account: ${bank.bank_account_name}`,
      bank.bank_account_number && `Number: ${bank.bank_account_number}`,
      bank.bank_branch_code && `Branch: ${bank.bank_branch_code}`,
      `Reference: ${reference}`,
      `Amount: ${amountLabel}`,
    ].filter(Boolean);
    navigator.clipboard.writeText(parts.join("\n"));
    toast.success("Bank details copied");
  };

  const handleFile = async (file: File | undefined | null) => {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error("That file is larger than 10MB — please upload a smaller photo or PDF.");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${clubId}/${clubMemberId}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("payment-proofs").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || undefined,
      });
      if (error) throw error;
      await onProofUploaded?.(path);
      toast.success("Proof of payment uploaded — the club will confirm it.");
    } catch (e: any) {
      toast.error(e.message || "Could not upload the proof of payment");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Card className={cn("p-3 bg-muted/50 space-y-1", className)}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Bank Details</p>
        {bank && (
          <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1" onClick={copy}>
            <Copy className="w-3 h-3" /> Copy
          </Button>
        )}
      </div>

      {!bank ? (
        <p className="text-xs text-muted-foreground">
          Bank details not yet captured by the club. Please contact your club admin to arrange EFT — they will mark you paid once received.
        </p>
      ) : (
        <>
          {bank.bank_name && <p className="text-xs"><span className="text-muted-foreground">Bank:</span> {bank.bank_name}</p>}
          {bank.bank_account_name && <p className="text-xs"><span className="text-muted-foreground">Account:</span> {bank.bank_account_name}</p>}
          {bank.bank_account_number && <p className="text-xs"><span className="text-muted-foreground">Number:</span> {bank.bank_account_number}</p>}
          {bank.bank_branch_code && <p className="text-xs"><span className="text-muted-foreground">Branch:</span> {bank.bank_branch_code}</p>}
          <p className="text-xs font-semibold"><span className="text-muted-foreground">Reference:</span> {reference}</p>
          <p className="text-xs font-semibold"><span className="text-muted-foreground">Amount:</span> {amountLabel}</p>
        </>
      )}

      {allowProofUpload && (
        proofPath ? (
          <p className="text-[11px] text-primary flex items-center gap-1 pt-1">
            <Check className="w-3 h-3" /> Proof uploaded — awaiting club confirmation.
          </p>
        ) : (
          <div className="pt-2">
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs w-full"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Upload className="w-3 h-3 mr-1" />}
              Upload proof of payment
            </Button>
            <p className="text-[11px] text-muted-foreground mt-1">
              Photo or PDF of your EFT confirmation (max 10MB). The club admin marks your entry paid once received.
            </p>
          </div>
        )
      )}
    </Card>
  );
}
