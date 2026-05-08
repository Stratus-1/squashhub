import { useAssociationPenalties } from "@/hooks/use-association-rules";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, AlertTriangle } from "lucide-react";
import { format, parseISO } from "date-fns";

interface Props {
  associationId: string;
}

export default function AssociationPenaltiesTab({ associationId }: Props) {
  const { data, isLoading } = useAssociationPenalties(associationId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading penalties…
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-40" />
        No penalties recorded yet for this league. Penalties are synced from the league's official site after each round.
      </Card>
    );
  }

  return (
    <div className="rounded-md border overflow-auto max-h-[600px]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date scraped</TableHead>
            <TableHead>Fixture</TableHead>
            <TableHead>Team</TableHead>
            <TableHead className="text-right">Points</TableHead>
            <TableHead>Reasons</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((p: any) => (
            <TableRow key={p.id}>
              <TableCell className="text-xs text-muted-foreground">
                {p.scraped_at ? format(parseISO(p.scraped_at), "dd MMM yyyy HH:mm") : "—"}
              </TableCell>
              <TableCell className="font-mono text-xs">{p.fixture_id}</TableCell>
              <TableCell className="font-medium">
                {p.team_name || "—"} <span className="text-xs text-muted-foreground">({p.team_side})</span>
              </TableCell>
              <TableCell className="text-right">
                <Badge variant="destructive" className="font-mono">{p.penalty_points}</Badge>
              </TableCell>
              <TableCell className="text-xs">
                {(p.reasons ?? []).map((r: any, i: number) => (
                  <div key={i} className="text-muted-foreground">
                    • {r.label ?? r.reason ?? JSON.stringify(r)}
                    {r.points !== undefined ? ` (${r.points})` : ""}
                  </div>
                ))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
