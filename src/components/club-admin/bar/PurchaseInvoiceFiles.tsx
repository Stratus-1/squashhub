import { useRef } from "react";
import { Camera, Upload, X, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { validateInvoiceFile } from "@/lib/bar-invoice-files";

export function PurchaseInvoiceFiles({ files, onChange, disabled }: { files: File[]; onChange: (files: File[]) => void; disabled: boolean }) {
  const upload = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const choose = (input: HTMLInputElement) => {
    const added = Array.from(input.files ?? []);
    try { added.forEach(validateInvoiceFile); onChange([...files, ...added]); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Cannot attach invoice"); }
    input.value = "";
  };
  return <div className="space-y-2">
    <Label>Invoice attachment</Label>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => upload.current?.click()}><Upload className="mr-1.5 h-4 w-4" />Upload invoice</Button>
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => camera.current?.click()}><Camera className="mr-1.5 h-4 w-4" />Take photo</Button>
    </div>
    <input ref={upload} type="file" className="hidden" aria-label="Upload invoice files" accept="image/*,application/pdf" multiple onChange={e => choose(e.currentTarget)} />
    <input ref={camera} type="file" className="hidden" aria-label="Take invoice photo" accept="image/*" capture="environment" onChange={e => choose(e.currentTarget)} />
    {files.map((file, index) => <div key={`${file.name}-${index}`} className="flex min-w-0 items-center gap-2 text-sm">
      <FileText className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1 truncate">{file.name}</span>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label={`Remove ${file.name}`} disabled={disabled} onClick={() => onChange(files.filter((_, i) => i !== index))}><X className="h-4 w-4" /></Button>
    </div>)}
  </div>;
}