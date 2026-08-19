/**
 * QR label printing for the honesty bar / shop.
 *
 * Generates (once) a club-specific short code per item plus one venue poster
 * code, then renders a printable A4 sheet of stickers. The QR never contains
 * the product's own barcode — it points at `/s/<code>`, which is unique to this
 * club + item.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Printer, QrCode, RefreshCw, Loader2 } from "lucide-react";
import { fromExt } from "@/lib/supabase-ext";
import { buildScanUrl, generateShortCode } from "@/lib/qr-shortcodes";
import { useClubCurrency } from "@/hooks/use-currency";

interface Item { id: string; name: string; price: number; active: boolean }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clubId: string;
  clubName: string;
  subdomain?: string | null;
  items: Item[];
  focusItemId?: string | null;
}

interface CodeRow { id: string; code: string; bar_item_id: string | null; kind: string; active: boolean }

export function BarQrLabelsDialog({ open, onOpenChange, clubId, clubName, subdomain, items, focusItemId }: Props) {
  const qc = useQueryClient();
  const { format: money } = useClubCurrency();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [copies, setCopies] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  const { data: codes = [], isLoading } = useQuery({
    queryKey: ["qr-short-codes", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("qr_short_codes")
        .select("id, code, bar_item_id, kind, active")
        .eq("club_id", clubId);
      if (error) throw error;
      return data as CodeRow[];
    },
    enabled: open && !!clubId,
  });

  const codeByItem = useMemo(() => {
    const map: Record<string, CodeRow> = {};
    codes.filter(c => c.active && c.bar_item_id).forEach(c => { map[c.bar_item_id!] = c; });
    return map;
  }, [codes]);

  const venueCode = codes.find(c => c.active && c.kind === "venue") || null;

  const chosen = items.filter(i => selected[i.id]);

  useEffect(() => {
    if (open && focusItemId) setSelected({ [focusItemId]: true });
  }, [focusItemId, open]);

  const ensureCodes = async () => {
    setBusy(true);
    try {
      const rows: any[] = [];
      items.forEach(i => {
        if (!codeByItem[i.id]) {
          rows.push({ club_id: clubId, bar_item_id: i.id, kind: "item", code: generateShortCode() });
        }
      });
      if (!venueCode) rows.push({ club_id: clubId, bar_item_id: null, kind: "venue", code: generateShortCode() });
      if (rows.length) {
        const { error } = await fromExt("qr_short_codes").insert(rows);
        if (error) throw error;
        toast.success(`${rows.length} QR code${rows.length > 1 ? "s" : ""} created`);
      } else {
        toast.info("All items already have a QR code");
      }
      qc.invalidateQueries({ queryKey: ["qr-short-codes", clubId] });
    } catch (err: any) {
      toast.error(err.message || "Could not create QR codes");
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async (row: CodeRow) => {
    setBusy(true);
    try {
      const { error } = await fromExt("qr_short_codes")
        .update({ code: generateShortCode(), active: true })
        .eq("id", row.id);
      if (error) throw error;
      toast.success("New code issued — reprint that label");
      qc.invalidateQueries({ queryKey: ["qr-short-codes", clubId] });
    } catch (err: any) {
      toast.error(err.message || "Could not regenerate");
    } finally {
      setBusy(false);
    }
  };

  const labels = chosen.flatMap(i => {
    const row = codeByItem[i.id];
    if (!row) return [];
    const n = Math.max(1, Math.min(24, copies[i.id] || 1));
    return Array.from({ length: n }, (_, k) => ({ key: `${i.id}-${k}`, name: i.name, price: i.price, url: buildScanUrl(row.code, subdomain) }));
  });

  const print = () => window.print();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto print:max-w-none print:max-h-none print:overflow-visible print:shadow-none print:border-0">
        <DialogHeader className="print:hidden">
          <DialogTitle className="flex items-center gap-2"><QrCode className="w-4 h-4" /> Product QR labels</DialogTitle>
          <DialogDescription>
            Print club-specific stickers — one per product. Each QR opens {clubName}&apos;s scan-to-pay page for
            that exact item, so a customer buys it in a tap: visitors pay by card, members can charge it to their
            member account. The venue poster below is the Menu QR: it opens the whole bar menu instead.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 print:hidden">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={ensureCodes} disabled={busy}>
              {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <QrCode className="w-3.5 h-3.5 mr-1" />}
              Create missing codes
            </Button>
            <Button size="sm" variant="outline" onClick={() => {
              const all: Record<string, boolean> = {};
               items.forEach(i => { if (codeByItem[i.id]) all[i.id] = true; });
              setSelected(all);
            }}>Select all</Button>
            <Button size="sm" variant="outline" onClick={() => setSelected({})}>Clear</Button>
            <Button size="sm" variant="secondary" className="gap-1" onClick={print} disabled={labels.length === 0 && !venueCode}>
              <Printer className="w-3.5 h-3.5" /> Print
            </Button>
          </div>

          {venueCode && (
            <Card className="p-3 flex items-center gap-3">
              <QRCodeSVG value={buildScanUrl(venueCode.code, subdomain)} size={64} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Menu QR — venue poster for the whole bar menu</p>
                <p className="text-[11px] text-muted-foreground break-all">{buildScanUrl(venueCode.code, subdomain)}</p>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" title="Issue a new code" onClick={() => regenerate(venueCode)}>
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </Card>
          )}

          <div className="space-y-1.5">
            {isLoading && <p className="text-sm text-muted-foreground">Loading codes…</p>}
            {items.map(i => {
              const row = codeByItem[i.id];
              return (
                <div key={i.id} className="flex items-center gap-2 rounded border p-2">
                  {row && (
                    <QRCodeSVG
                      value={buildScanUrl(row.code, subdomain)}
                      size={52}
                      className="shrink-0"
                      aria-label={`${i.name} QR code`}
                    />
                  )}
                  <Checkbox
                    checked={!!selected[i.id]}
                    disabled={!row}
                    onCheckedChange={(v) => setSelected(s => ({ ...s, [i.id]: !!v }))}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{i.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {row ? buildScanUrl(row.code, subdomain) : "No code yet — tap “Create missing codes”"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Label htmlFor={`copies-${i.id}`} className="text-[11px] text-muted-foreground">Copies</Label>
                    <Input
                      id={`copies-${i.id}`}
                      type="number" min={1} max={24}
                      value={copies[i.id] ?? 1}
                      onChange={(e) => setCopies(c => ({ ...c, [i.id]: parseInt(e.target.value) || 1 }))}
                      className="h-7 w-14 text-xs"
                    />
                    {row && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Issue a new code" onClick={() => regenerate(row)}>
                        <RefreshCw className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Printable sheet */}
        <div className="hidden print:block">
          <div className="grid grid-cols-3 gap-3">
            {labels.map(l => (
              <div key={l.key} className="border rounded p-2 flex flex-col items-center text-center break-inside-avoid">
                <p className="text-[11px] font-semibold leading-tight">{clubName}</p>
                <QRCodeSVG value={l.url} size={96} />
                <p className="text-[11px] font-medium leading-tight mt-1 break-words">{l.name}</p>
                <p className="text-[11px]">{money(Number(l.price))}</p>
                <p className="text-[8px] text-muted-foreground">Scan to pay</p>
              </div>
            ))}
          </div>
          {venueCode && (
            <div className="mt-6 border rounded p-6 flex flex-col items-center text-center break-before-page">
              <p className="text-xl font-bold">{clubName}</p>
              <p className="text-sm mb-3">Scan to browse the bar menu and pay</p>
              <QRCodeSVG value={buildScanUrl(venueCode.code, subdomain)} size={260} />
              <p className="text-xs mt-3">Visitors: pick your items and pay by card. Members: log in to charge your account.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
