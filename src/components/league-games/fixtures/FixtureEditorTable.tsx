import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";

export type EditableFixture = {
  id?: string;
  home_team_code: string;
  away_team_code: string;
  court_id: number | null;
  start_time: string | null; // HH:mm
  end_time?: string | null;  // HH:mm
  fixture_date?: string | null; // yyyy-MM-dd
};

type Props = {
  fixtures: EditableFixture[];
  teams: { code: string; name: string }[];
  courts: { id: number; name: string }[];
  onChange: (next: EditableFixture[]) => void;
  defaultDate?: string;
  minDate?: string;
  maxDate?: string;
  defaultStart?: string | null;
  defaultEnd?: string | null;
};

export function FixtureEditorTable({ fixtures, teams, courts, onChange, defaultDate, minDate, maxDate, defaultStart, defaultEnd }: Props) {
  // Derive sensible defaults from existing fixtures (most common time), then fall back to round/league defaults.
  const derived = (() => {
    const pick = (vals: (string | null | undefined)[]) => {
      const counts = new Map<string, number>();
      for (const v of vals) {
        if (!v) continue;
        const k = String(v).slice(0, 5);
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      let best: string | null = null;
      let bestN = 0;
      for (const [k, n] of counts) if (n > bestN) { best = k; bestN = n; }
      return best;
    };
    const playable = fixtures.filter((f) => f.away_team_code !== "__BYE__");
    const fallbackStart = defaultStart ? String(defaultStart).slice(0, 5) : null;
    const fallbackEnd = defaultEnd ? String(defaultEnd).slice(0, 5) : null;
    return {
      start: pick(playable.map((f) => f.start_time)) ?? fallbackStart ?? "18:00",
      end: pick(playable.map((f) => f.end_time)) ?? fallbackEnd ?? "20:00",
    };
  })();

  const update = (idx: number, patch: Partial<EditableFixture>) => {
    const next = [...fixtures];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };
  const remove = (idx: number) => {
    const next = [...fixtures];
    next.splice(idx, 1);
    onChange(next);
  };
  const add = () => {
    onChange([
      ...fixtures,
      {
        home_team_code: teams[0]?.code ?? "",
        away_team_code: teams[1]?.code ?? teams[0]?.code ?? "",
        court_id: courts[0]?.id ?? null,
        start_time: derived.start,
        end_time: derived.end,
        fixture_date: defaultDate ?? null,
      },
    ]);
  };

  const [bulkStart, setBulkStart] = useState(derived.start);
  const [bulkEnd, setBulkEnd] = useState(derived.end);
  const [bulkMode, setBulkMode] = useState<"empty" | "all">("empty");
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const pendingFixture = pendingDelete !== null ? fixtures[pendingDelete] : null;
  const teamName = (code: string) => teams.find((t) => t.code === code)?.name ?? code;

  const applyBulkTimes = () => {
    const next = fixtures.map((f) => {
      if (f.away_team_code === "__BYE__") return f;
      const patch: Partial<EditableFixture> = {};
      if (bulkMode === "all" || !f.start_time) patch.start_time = bulkStart || null;
      if (bulkMode === "all" || !f.end_time) patch.end_time = bulkEnd || null;
      return { ...f, ...patch };
    });
    onChange(next);
  };

  const playableCount = fixtures.filter((f) => f.away_team_code !== "__BYE__").length;

  return (
    <div className="space-y-2">
      {playableCount > 0 && (
        <div className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/20 p-2">
          <div>
            <Label className="text-[11px] text-muted-foreground">Default start</Label>
            <Input
              type="time"
              className="h-8 w-28"
              value={bulkStart}
              onChange={(e) => setBulkStart(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">Default end</Label>
            <Input
              type="time"
              className="h-8 w-28"
              value={bulkEnd}
              onChange={(e) => setBulkEnd(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">Apply to</Label>
            <Select value={bulkMode} onValueChange={(v) => setBulkMode(v as "empty" | "all")}>
              <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="empty">Empty times only</SelectItem>
                <SelectItem value="all">All fixtures (overwrite)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" variant="secondary" onClick={applyBulkTimes}>
            Apply to {bulkMode === "all" ? "all" : "empty"}
          </Button>
          <span className="text-[11px] text-muted-foreground ml-auto self-center">
            Set defaults here, then tweak individual rows below.
          </span>
        </div>
      )}
      <div className="rounded-md border overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-muted/50">
          <tr className="text-left">
            <th className="p-2">Date</th>
            <th className="p-2">Home</th>
            <th className="p-2">Away</th>
            <th className="p-2">Court</th>
            <th className="p-2">Start</th>
            <th className="p-2">End</th>
            <th className="p-2 w-10"></th>
          </tr>
        </thead>
        <tbody>
          {fixtures.map((f, i) => {
            const isBye = f.away_team_code === "__BYE__";
            if (isBye) {
              return (
                <tr key={i} className="border-t bg-amber-500/5">
                  <td className="p-1">
                    <Input
                      type="date"
                      className="h-8"
                      min={minDate}
                      max={maxDate}
                      value={f.fixture_date ?? defaultDate ?? ""}
                      onChange={(e) => update(i, { fixture_date: e.target.value || null })}
                    />
                  </td>
                  <td className="p-1">
                    <Select value={f.home_team_code} onValueChange={(v) => update(i, { home_team_code: v })}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {teams.map((t) => (
                          <SelectItem key={t.code} value={t.code}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-1 text-xs font-medium text-amber-700 dark:text-amber-400" colSpan={4}>
                    BYE — no match this round
                  </td>
                  <td className="p-1 text-right">
                    <Button size="icon" variant="ghost" onClick={() => setPendingDelete(i)}>

                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              );
            }
            return (
              <tr key={i} className="border-t">
                <td className="p-1">
                  <Input
                    type="date"
                    className="h-8"
                    min={minDate}
                    max={maxDate}
                    value={f.fixture_date ?? defaultDate ?? ""}
                    onChange={(e) => update(i, { fixture_date: e.target.value || null })}
                  />
                </td>
                <td className="p-1">
                  <Select value={f.home_team_code} onValueChange={(v) => update(i, { home_team_code: v })}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {teams.map((t) => (
                        <SelectItem key={t.code} value={t.code}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="p-1">
                  <Select value={f.away_team_code} onValueChange={(v) => update(i, { away_team_code: v })}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {teams.map((t) => (
                        <SelectItem key={t.code} value={t.code}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="p-1">
                  <Select
                    value={f.court_id ? String(f.court_id) : ""}
                    onValueChange={(v) => update(i, { court_id: v ? Number(v) : null })}
                  >
                    <SelectTrigger className="h-8"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {courts.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="p-1">
                  <Input
                    type="time"
                    className="h-8"
                    value={f.start_time ?? ""}
                    onChange={(e) => update(i, { start_time: e.target.value || null })}
                  />
                </td>
                <td className="p-1">
                  <Input
                    type="time"
                    className="h-8"
                    value={f.end_time ?? ""}
                    onChange={(e) => update(i, { end_time: e.target.value || null })}
                  />
                </td>
                <td className="p-1 text-right">
                  <Button size="icon" variant="ghost" onClick={() => setPendingDelete(i)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            );
          })}
          {!fixtures.length && (
            <tr>
              <td colSpan={7} className="p-3 text-center text-muted-foreground">
                No fixtures yet — add manually or auto-distribute.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="p-2 border-t bg-muted/30">
        <Button size="sm" variant="outline" onClick={add}>+ Add fixture</Button>
      </div>
      </div>
      <ConfirmDeleteDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => { if (!o) setPendingDelete(null); }}
        title="Delete fixture?"
        description={
          pendingFixture ? (
            <span>
              This will remove the fixture{" "}
              <strong>
                {teamName(pendingFixture.home_team_code)}
                {pendingFixture.away_team_code === "__BYE__"
                  ? " (BYE)"
                  : ` vs ${teamName(pendingFixture.away_team_code)}`}
              </strong>
              {pendingFixture.fixture_date ? ` on ${pendingFixture.fixture_date}` : ""}.
              Changes apply when you save the round.
            </span>
          ) : null
        }
        onConfirm={() => {
          if (pendingDelete !== null) remove(pendingDelete);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
