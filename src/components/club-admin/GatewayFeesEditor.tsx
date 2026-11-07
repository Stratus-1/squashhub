import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { EditLock, useEditLock } from "./setup/EditLock";

type DefaultFee = { provider: string; method: string; label: string; fee_pct: number; fee_fixed: number; add_vat: boolean; sort_order: number };
type FeeVal = { pct: string; fixed: string; vat: boolean };
export const describeFeeRule = (pct: number, fixed: number, vat: boolean) =>
  `${Number(pct).toFixed(2)}%${Number(fixed) > 0 ? ` + R${Number(fixed).toFixed(2)}` : ""}${vat ? " + VAT" : " incl. VAT"}`;
const PROVIDER_NAMES: Record<string, string> = { payfast: "PayFast", stitch: "Stitch", yoco: "Yoco" };
const key = (p: string, m: string) => `${p}:${m}`;

export function GatewayFeesEditor({ clubId, onlineProvider, barCardProvider, canEdit }: {
  clubId: string; onlineProvider?: string | null; barCardProvider?: string | null; canEdit: boolean;
}) {
  const qc = useQueryClient();
  const db = supabase as any;
  const { data: defaults = [] } = useQuery({
    queryKey: ["gateway-fee-defaults"],
    queryFn: async () => {
      const { data, error } = await db.from("payment_gateway_fee_defaults").select("*").order("provider").order("sort_order");
      if (error) throw error;
      return data as DefaultFee[];
    },
  });
  const { data: overrides = [] } = useQuery({
    queryKey: ["club-gateway-fees", clubId],
    queryFn: async () => {
      const { data, error } = await db.from("club_payment_gateway_fees").select("provider,method,fee_pct,fee_fixed,add_vat").eq("club_id", clubId);
      if (error) throw error;
      return data as { provider: string; method: string; fee_pct: number; fee_fixed: number; add_vat: boolean }[];
    },
  });
  const { data: payouts = [] } = useQuery({
    queryKey: ["club-gateway-payouts", clubId],
    queryFn: async () => {
      const { data, error } = await db.from("club_gateway_payout_settings").select("provider,payouts_per_month,fee_per_payout").eq("club_id", clubId);
      if (error) throw error;
      return data as { provider: string; payouts_per_month: number; fee_per_payout: number }[];
    },
  });
  const [payoutVals, setPayoutVals] = useState<Record<string, { freq: string; fee: string }>>({});
  const [values, setValues] = useState<Record<string, FeeVal>>({});
  const fromOverrides = () => Object.fromEntries(overrides.map(o => [key(o.provider, o.method), { pct: String(o.fee_pct), fixed: String(o.fee_fixed ?? 0), vat: !!o.add_vat }]));
  const [barMachine, setBarMachine] = useState<string>(barCardProvider || "__online__");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValues(fromOverrides());
  }, [overrides]);
  const resetPayouts = () => setPayoutVals(Object.fromEntries(payouts.map(p => [p.provider, { freq: String(p.payouts_per_month), fee: String(p.fee_per_payout) }])));
  useEffect(resetPayouts, [payouts]);
  const lock = useEditLock(() => {
    setValues(fromOverrides());
    setBarMachine(barCardProvider || "__online__");
    resetPayouts();
  });
  useEffect(() => setBarMachine(barCardProvider || "__online__"), [barCardProvider]);

  const providers = Array.from(new Set(defaults.map(d => d.provider)));

  const save = async () => {
    setSaving(true);
    try {
      const upserts: any[] = [];
      const removes: DefaultFee[] = [];
      for (const d of defaults) {
        const v = values[key(d.provider, d.method)];
        const rawPct = (v?.pct ?? "").trim();
        if (!v || rawPct === "") { removes.push(d); continue; }
        const n = Number(rawPct);
        const fixed = Number((v.fixed ?? "").trim() || 0);
        if (!Number.isFinite(n) || n < 0 || n > 20) throw new Error(`Invalid fee for ${PROVIDER_NAMES[d.provider]} ${d.label}`);
        if (!Number.isFinite(fixed) || fixed < 0 || fixed > 100) throw new Error(`Invalid fixed fee for ${PROVIDER_NAMES[d.provider]} ${d.label}`);
        if (n === Number(d.fee_pct) && fixed === Number(d.fee_fixed || 0) && v.vat === !!d.add_vat) removes.push(d);
        else upserts.push({ club_id: clubId, provider: d.provider, method: d.method, fee_pct: n, fee_fixed: fixed, add_vat: v.vat, updated_at: new Date().toISOString() });
      }
      if (upserts.length) {
        const { error } = await db.from("club_payment_gateway_fees").upsert(upserts);
        if (error) throw error;
      }
      for (const r of removes) {
        if (!overrides.some(o => o.provider === r.provider && o.method === r.method)) continue;
        const { error } = await db.from("club_payment_gateway_fees").delete().eq("club_id", clubId).eq("provider", r.provider).eq("method", r.method);
        if (error) throw error;
      }
      const nextBar = barMachine === "__online__" ? null : barMachine;
      if (nextBar !== (barCardProvider || null)) {
        const { error } = await db.from("clubs").update({ bar_card_provider: nextBar }).eq("id", clubId);
        if (error) throw error;
      }
      for (const p of providers) {
        const v = payoutVals[p];
        const existing = payouts.find(x => x.provider === p);
        const freq = Number(v?.freq ?? 0);
        const fee = Number((v?.fee ?? "").trim() || 0);
        if (!Number.isFinite(fee) || fee < 0 || fee > 1000) throw new Error(`Invalid payout fee for ${PROVIDER_NAMES[p] ?? p}`);
        if (!existing && (freq === 0 || fee === 0)) continue;
        if (existing && existing.payouts_per_month === freq && Number(existing.fee_per_payout) === fee) continue;
        const { error } = await db.from("club_gateway_payout_settings").upsert({ club_id: clubId, provider: p, payouts_per_month: freq, fee_per_payout: fee, updated_at: new Date().toISOString() });
        if (error) throw error;
      }
      toast.success("Card fees saved");
      qc.invalidateQueries({ queryKey: ["club-gateway-payouts", clubId] });
      lock.done();
      qc.invalidateQueries({ queryKey: ["club-gateway-fees", clubId] });
      qc.invalidateQueries({ queryKey: ["club"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to save card fees");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Card fees</h3>
        <p className="text-xs text-muted-foreground">
          Standard rates are filled in: a percentage, an optional fixed amount per payment, and whether VAT is added on top. Change a rate only if your club pays something different;
          leave it blank to use the standard rate. The fee is booked automatically on every card payment; for PayFast online payments the exact fee PayFast reports replaces this estimate.
        </p>
      </div>
      <EditLock editing={lock.editing} onEdit={lock.edit} onCancel={lock.cancel} onSave={save} saving={saving}
        locked={!canEdit} lockedHint="You need Banking permission to change card fees." title="card fees">
      <div className="grid gap-3 sm:grid-cols-3">
        {providers.map(p => (
          <div key={p} className="rounded-md border border-border p-3 space-y-2">
            <div className="text-xs font-semibold">
              {PROVIDER_NAMES[p] ?? p}
              {onlineProvider === p && <span className="ml-2 text-[10px] text-primary">online payments</span>}
              {(barCardProvider || onlineProvider) === p && <span className="ml-2 text-[10px] text-accent-foreground bg-accent rounded px-1">bar</span>}
            </div>
            {defaults.filter(d => d.provider === p).map(d => {
              const k = key(p, d.method);
              const v = values[k];
              const set = (patch: Partial<FeeVal>) => setValues(prev => ({
                ...prev,
                [k]: { pct: prev[k]?.pct ?? String(d.fee_pct), fixed: prev[k]?.fixed ?? String(d.fee_fixed ?? 0), vat: prev[k]?.vat ?? !!d.add_vat, ...patch },
              }));
              return (
                <div key={d.method} className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">{d.label} (standard {describeFeeRule(d.fee_pct, d.fee_fixed ?? 0, !!d.add_vat)})</Label>
                  <div className="flex items-center gap-1.5">
                    <Input type="number" step="0.01" min="0" max="20" className="h-8 text-xs" aria-label={`${PROVIDER_NAMES[p] ?? p} ${d.label} percentage`}
                      value={v?.pct ?? ""} placeholder={`${Number(d.fee_pct).toFixed(2)}%`}
                      onChange={e => set({ pct: e.target.value })} />
                    <span className="text-[10px] text-muted-foreground">% +R</span>
                    <Input type="number" step="0.01" min="0" max="100" className="h-8 text-xs w-16" aria-label={`${PROVIDER_NAMES[p] ?? p} ${d.label} fixed fee`}
                      value={v?.fixed ?? ""} placeholder={Number(d.fee_fixed ?? 0).toFixed(2)}
                      onChange={e => set({ fixed: e.target.value })} />
                  </div>
                  <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Checkbox checked={v ? v.vat : !!d.add_vat} onCheckedChange={c => set({ vat: c === true })} />
                    Add VAT on top
                  </label>
                </div>
              );
            })}
            <div className="space-y-1 border-t border-border pt-2">
              <Label className="text-[10px] text-muted-foreground">Payouts to bank</Label>
              <div className="flex gap-2">
                <Select value={payoutVals[p]?.freq ?? "0"} onValueChange={freq => setPayoutVals(v => ({ ...v, [p]: { fee: v[p]?.fee ?? "", freq } }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">No payout fee</SelectItem>
                    <SelectItem value="1">Once a month</SelectItem>
                    <SelectItem value="2">Twice a month</SelectItem>
                    <SelectItem value="4">Four times a month</SelectItem>
                  </SelectContent>
                </Select>
                <Input type="number" step="0.01" min="0" className="h-8 text-xs w-28" placeholder="R per payout"
                  value={payoutVals[p]?.fee ?? ""} onChange={e => setPayoutVals(v => ({ ...v, [p]: { freq: v[p]?.freq ?? "0", fee: e.target.value } }))} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-1 max-w-xs">
        <Label className="text-xs">Card machine used to swipe at the bar</Label>
        <Select value={barMachine} onValueChange={setBarMachine}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__online__">Same as online gateway</SelectItem>
            {providers.map(p => <SelectItem key={p} value={p}>{PROVIDER_NAMES[p] ?? p}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-[10px] text-muted-foreground">Its card rate is deducted from bar card sales.</p>
      </div>
      <p className="text-[10px] text-muted-foreground">Payout fees are booked as payment gateway fees on the 1st (once), 1st & 15th (twice) or 1st, 8th, 15th & 22nd (four times) of each month.</p>
      </EditLock>
    </Card>
  );
}
