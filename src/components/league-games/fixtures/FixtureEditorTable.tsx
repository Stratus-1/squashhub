import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2 } from "lucide-react";

export type EditableFixture = {
  id?: string;
  home_team_code: string;
  away_team_code: string;
  court_id: number | null;
  start_time: string | null; // HH:mm
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
};

export function FixtureEditorTable({ fixtures, teams, courts, onChange, defaultDate, minDate, maxDate }: Props) {
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
        start_time: "18:00",
        fixture_date: defaultDate ?? null,
      },
    ]);
  };

  return (
    <div className="rounded-md border overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-muted/50">
          <tr className="text-left">
            <th className="p-2">Date</th>
            <th className="p-2">Home</th>
            <th className="p-2">Away</th>
            <th className="p-2">Court</th>
            <th className="p-2">Time</th>
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
                  <td className="p-1 text-xs font-medium text-amber-700 dark:text-amber-400" colSpan={3}>
                    BYE — no match this round
                  </td>
                  <td className="p-1 text-right">
                    <Button size="icon" variant="ghost" onClick={() => remove(i)}>
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
                <td className="p-1 text-right">
                  <Button size="icon" variant="ghost" onClick={() => remove(i)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            );
          })}
          {!fixtures.length && (
            <tr>
              <td colSpan={6} className="p-3 text-center text-muted-foreground">
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
  );
}
