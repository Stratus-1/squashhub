import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Save, Layers, Plus, Trash2, Calculator } from "lucide-react";
import {
  DEFAULT_TIERS,
  DEFAULT_MIN_CHARGE,
  computeTieredCharge,
  parseTiers,
  tierSettingKey,
  TIERS_ENABLED_KEY,
  type SaasCurrency,
  type SaasCycle,
  type SaasTier,
} from "@/lib/saas-tiers";

const CURRENCIES: { code: SaasCurrency; symbol: string; label: string }[] = [
  { code: "ZAR", symbol: "R", label: "ZAR (base)" },
  { code: "USD", symbol: "$", label: "USD clubs" },
  { code: "EUR", symbol: "€", label: "EUR clubs" },
];

type TierState = Record<string, SaasTier[]>;
type MinState = Record<string, string>;

const stateKey = (c: SaasCurrency, cycle: SaasCycle) => `${c}_${cycle}`;
const minKey = (c: SaasCurrency, cycle: SaasCycle) =>
  `saas_tier_min_${c.toLowerCase()}_${cycle}`;

function buildDefaults(): { tiers: TierState; mins: MinState } {
  const tiers: TierState = {};
  const mins: MinState = {};
  for (const { code } of CURRENCIES) {
    for (const cycle of ["monthly", "annual"] as SaasCycle[]) {
      tiers[stateKey(code, cycle)] = DEFAULT_TIERS[code][cycle].map((t) => ({ ...t }));
      mins[minKey(code, cycle)] = String(DEFAULT_MIN_CHARGE[code][cycle]);
    }
  }
  return { tiers, mins };
}

export function SaasTierPricingCard() {
  const qc = useQueryClient();
  const seed = buildDefaults();
  const [tiers, setTiers] = useState<TierState>(seed.tiers);
  const [mins, setMins] = useState<MinState>(seed.mins);
  const [dirty, setDirty] = useState(false);
  const [cycle, setCycle] = useState<SaasCycle>("monthly");
  const [calcMembers, setCalcMembers] = useState("197");

  useQuery({
    queryKey: ["sa-saas-tiers"],
    queryFn: async () => {
      const keys = [TIERS_ENABLED_KEY];
      for (const { code } of CURRENCIES) {
        for (const cy of ["monthly", "annual"] as SaasCycle[]) {
          keys.push(tierSettingKey(code, cy), minKey(code, cy));
        }
      }
      const { data, error } = await supabase.from("app_settings").select("key, value").in("key", keys);
      if (error) throw error;
      const map = new Map<string, string>((data || []).map((r: any) => [r.key, r.value]));
      const next = buildDefaults();
      for (const { code } of CURRENCIES) {
        for (const cy of ["monthly", "annual"] as SaasCycle[]) {
          const parsed = parseTiers(map.get(tierSettingKey(code, cy)));
          if (parsed?.length) next.tiers[stateKey(code, cy)] = parsed;
          const m = map.get(minKey(code, cy));
          if (m != null) next.mins[minKey(code, cy)] = m;
        }
      }
      setEnabled(map.get(TIERS_ENABLED_KEY) === "true");
      setTiers(next.tiers);
      setMins(next.mins);
      setDirty(false);
      return true;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const rows: { key: string; value: string }[] = [
        { key: TIERS_ENABLED_KEY, value: "true" },
      ];
      for (const { code } of CURRENCIES) {
        for (const cy of ["monthly", "annual"] as SaasCycle[]) {
          rows.push({
            key: tierSettingKey(code, cy),
            value: JSON.stringify(tiers[stateKey(code, cy)] || []),
          });
          rows.push({ key: minKey(code, cy), value: String(Number(mins[minKey(code, cy)]) || 0) });
        }
      }
      const { error } = await supabase.from("app_settings").upsert(rows, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sliding scale saved — applies from the next billing run");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["sa-saas-tiers"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateTier = (c: SaasCurrency, idx: number, field: "upTo" | "rate", value: string) => {
    setTiers((prev) => {
      const k = stateKey(c, cycle);
      const list = (prev[k] || []).map((t, i) =>
        i === idx
          ? { ...t, [field]: field === "upTo" ? (value === "" ? null : Number(value)) : Number(value) }
          : t,
      );
      return { ...prev, [k]: list };
    });
    setDirty(true);
  };

  const addTier = (c: SaasCurrency) => {
    setTiers((prev) => {
      const k = stateKey(c, cycle);
      const list = [...(prev[k] || [])];
      const last = list[list.length - 1];
      list.splice(Math.max(0, list.length - 1), 0, {
        upTo: (last?.upTo ?? 0) || 500,
        rate: last?.rate ?? 1,
      });
      return { ...prev, [k]: list };
    });
    setDirty(true);
  };

  const removeTier = (c: SaasCurrency, idx: number) => {
    setTiers((prev) => {
      const k = stateKey(c, cycle);
      return { ...prev, [k]: (prev[k] || []).filter((_, i) => i !== idx) };
    });
    setDirty(true);
  };

  const resetToDefaults = () => {
    const d = buildDefaults();
    setTiers(d.tiers);
    setMins(d.mins);
    setDirty(true);
  };

  const members = Math.max(0, Number(calcMembers) || 0);

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Layers className="w-4 h-4" /> Sliding Scale (Graduated Bands)
            <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">Active</Badge>
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5 max-w-2xl">
            Bands work like tax brackets: the first block of members is charged at band 1, the next block at band 2, and so on.
            USD and EUR bands are seeded proportionally to the ZAR structure. Every club is billed on this scale — there is no
            flat per-member rate.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={resetToDefaults}>Reset defaults</Button>
          <Button size="sm" className="h-7 text-xs" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
            <Save className="w-3.5 h-3.5 mr-1" />{save.isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {(["monthly", "annual"] as SaasCycle[]).map((cy) => (
          <Button
            key={cy}
            size="sm"
            variant={cycle === cy ? "default" : "outline"}
            className="h-7 text-xs capitalize"
            onClick={() => setCycle(cy)}
          >
            {cy}
          </Button>
        ))}
        <span className="text-[10px] text-muted-foreground ml-2">Rates are per member per month.</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {CURRENCIES.map(({ code, symbol, label }) => {
          const list = tiers[stateKey(code, cycle)] || [];
          return (
            <div key={code} className="space-y-2 rounded-md border border-border p-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px]" onClick={() => addTier(code)}>
                  <Plus className="w-3 h-3 mr-0.5" />Band
                </Button>
              </div>
              <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                <span>Up to (members)</span><span>Rate ({symbol})</span><span />
              </div>
              {list.map((t, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-center">
                  <Input
                    className="h-7 text-xs"
                    type="number"
                    min={1}
                    value={t.upTo ?? ""}
                    placeholder="∞"
                    onChange={(e) => updateTier(code, i, "upTo", e.target.value)}
                  />
                  <Input
                    className="h-7 text-xs"
                    type="number"
                    step="0.01"
                    value={t.rate}
                    onChange={(e) => updateTier(code, i, "rate", e.target.value)}
                  />
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => removeTier(code, i)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
              <div className="pt-1">
                <Label className="text-[11px]">Minimum charge ({symbol})</Label>
                <Input
                  className="h-7 text-xs"
                  type="number"
                  step="0.01"
                  value={mins[minKey(code, cycle)] ?? "0"}
                  onChange={(e) => { setMins((p) => ({ ...p, [minKey(code, cycle)]: e.target.value })); setDirty(true); }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Calculator */}
      <div className="rounded-md border border-border p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Calculator className="w-3.5 h-3.5 text-muted-foreground" />
          <Label className="text-xs">What would a club pay?</Label>
          <Input
            className="h-7 text-xs w-28"
            type="number"
            min={0}
            value={calcMembers}
            onChange={(e) => setCalcMembers(e.target.value)}
          />
          <span className="text-[11px] text-muted-foreground">members · {cycle}</span>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {CURRENCIES.map(({ code, symbol }) => {
            const res = computeTieredCharge(
              members,
              tiers[stateKey(code, cycle)] || [],
              Number(mins[minKey(code, cycle)]) || 0,
            );
            return (
              <div key={code} className="rounded-md bg-muted/40 p-2 text-xs space-y-1">
                <div className="flex items-center justify-between font-semibold">
                  <span>{code}</span>
                  <span className="font-mono text-primary">
                    {symbol}{res.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                {res.rows.map((r) => (
                  <div key={r.from} className="flex justify-between text-[11px] text-muted-foreground">
                    <span>{r.from}–{r.to} @ {symbol}{r.rate}</span>
                    <span className="font-mono">{symbol}{r.amount.toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-[11px] border-t pt-1">
                  <span>{res.minApplied ? "Minimum charge applied" : "Effective per member"}</span>
                  <span className="font-mono">{symbol}{res.effectiveRate.toFixed(2)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
