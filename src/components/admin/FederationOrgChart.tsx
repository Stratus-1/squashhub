import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Building2, ChevronDown, ChevronRight, Flag, Plus, Trophy } from "lucide-react";
import type { OrgNode } from "@/hooks/use-federation";

const UNAFFILIATED = "Unaffiliated Clubs";

function isRealAssociation(n: OrgNode) {
  return n.kind === "association" && !n.is_internal_league && n.name !== UNAFFILIATED;
}

/** Flatten every club sitting anywhere below a node. */
function clubsUnder(n: OrgNode): OrgNode[] {
  const out: OrgNode[] = [];
  const walk = (x: OrgNode) => {
    x.children.forEach((c) => {
      if (c.kind === "club") out.push(c);
      walk(c);
    });
  };
  walk(n);
  return out;
}

function ClubChip({
  club,
  dragId,
  setDragId,
}: {
  club: OrgNode;
  dragId: string | null;
  setDragId: (id: string | null) => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.stopPropagation();
        setDragId(club.id);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", club.id);
      }}
      onDragEnd={() => setDragId(null)}
      className={`flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.05] px-2 py-1 text-[11px] text-white/80 cursor-grab active:cursor-grabbing hover:bg-white/[0.09] ${
        dragId === club.id ? "opacity-40" : ""
      }`}
      title={club.name}
    >
      <Building2 className="w-3 h-3 text-white/35 shrink-0" />
      <span className="truncate max-w-[150px]">{club.name}</span>
    </div>
  );
}

function AssociationCard({
  node,
  dragId,
  setDragId,
  onDrop,
}: {
  node: OrgNode;
  dragId: string | null;
  setDragId: (id: string | null) => void;
  onDrop: (childId: string, parentId: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [over, setOver] = useState(false);
  const clubs = useMemo(() => clubsUnder(node), [node]);
  const leagues = node.children.filter((c) => c.kind !== "club");
  const canAccept = !!dragId && dragId !== node.id;

  return (
    <div className="flex flex-col items-center">
      {/* stem up to the horizontal bus */}
      <div className="w-px h-4 bg-white/15" />
      <div
        onDragOver={(e) => {
          if (!canAccept) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (!over) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          if (!canAccept) return;
          e.preventDefault();
          const childId = e.dataTransfer.getData("text/plain") || dragId!;
          setOver(false);
          setDragId(null);
          setOpen(true);
          onDrop(childId, node.id);
        }}
        className={`w-[210px] rounded-lg border px-2.5 py-2 transition-colors ${
          over ? "border-primary/70 bg-primary/20" : "border-white/12 bg-white/[0.06]"
        }`}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-1.5 text-left"
        >
          {open ? (
            <ChevronDown className="w-3.5 h-3.5 text-white/45 shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-white/45 shrink-0" />
          )}
          <span className="text-xs font-medium text-white/90 truncate">{node.name}</span>
          {node.abbreviation && (
            <span className="text-[10px] text-white/40">({node.abbreviation})</span>
          )}
          <Badge
            variant="outline"
            className="ml-auto text-[9px] border-white/20 text-white/55 px-1 py-0"
          >
            {clubs.length}
          </Badge>
        </button>

        {open && (
          <div className="mt-2 flex flex-col gap-1">
            {clubs.length === 0 && leagues.length === 0 ? (
              <p className="text-[10px] text-white/35 py-1">Drop a club here to affiliate it.</p>
            ) : null}
            {clubs.map((c) => (
              <ClubChip key={c.id} club={c} dragId={dragId} setDragId={setDragId} />
            ))}
            {leagues.map((l) => (
              <div
                key={l.id}
                className="flex items-center gap-1.5 rounded-md border border-white/8 bg-white/[0.03] px-2 py-1 text-[11px] text-white/55"
              >
                <Trophy className="w-3 h-3 text-white/30 shrink-0" />
                <span className="truncate max-w-[150px]">{l.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function FederationOrgChart({
  roots,
  onDrop,
  onCreateAssociation,
  creating,
}: {
  roots: OrgNode[];
  onDrop: (childId: string, parentId: string) => void;
  onCreateAssociation: (input: { name: string; abbreviation: string; parentId: string }) => void;
  creating?: boolean;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [abbr, setAbbr] = useState("");
  const [trayOver, setTrayOver] = useState(false);

  const federation = roots.find((r) => r.kind === "national") || null;
  const associations = (federation?.children || []).filter(isRealAssociation);

  const unaffiliatedHolder =
    federation?.children.find((c) => c.name === UNAFFILIATED) ||
    roots.find((r) => r.name === UNAFFILIATED) ||
    null;

  const unaffiliatedClubs = useMemo(() => {
    const list: OrgNode[] = [];
    if (unaffiliatedHolder) list.push(...clubsUnder(unaffiliatedHolder));
    roots.forEach((r) => {
      if (r.kind === "club") list.push(r);
    });
    (federation?.children || []).forEach((c) => {
      if (c.kind === "club") list.push(c);
    });
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [roots, federation, unaffiliatedHolder]);

  if (!federation) {
    return <p className="text-xs text-white/50 py-6">No federation organisation found.</p>;
  }

  const unaffiliateTarget = unaffiliatedHolder?.id || federation.id;

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto pb-2">
        <div className="min-w-max flex flex-col items-center px-2">
          {/* Federation */}
          <div
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => {
              if (!dragId) return;
              e.preventDefault();
              const childId = e.dataTransfer.getData("text/plain") || dragId;
              setDragId(null);
              onDrop(childId, federation.id);
            }}
            className="rounded-xl border border-primary/40 bg-primary/15 px-4 py-2.5 text-center"
          >
            <div className="flex items-center gap-2 justify-center">
              <Flag className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-white">{federation.name}</span>
              {federation.abbreviation && (
                <span className="text-[11px] text-white/50">({federation.abbreviation})</span>
              )}
            </div>
            <div className="text-[10px] text-white/50 mt-0.5">
              {associations.length} associations · {associations.reduce((s, a) => s + clubsUnder(a).length, 0)} affiliated clubs
            </div>
          </div>

          {/* trunk + bus */}
          <div className="w-px h-4 bg-white/15" />
          {associations.length > 0 && (
            <div className="h-px bg-white/15" style={{ width: `${Math.max(1, associations.length) * 226 - 16}px` }} />
          )}

          <div className="flex items-start justify-center gap-4">
            {associations.map((a) => (
              <AssociationCard
                key={a.id}
                node={a}
                dragId={dragId}
                setDragId={setDragId}
                onDrop={onDrop}
              />
            ))}
            <div className="flex flex-col items-center">
              <div className="w-px h-4 bg-transparent" />
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDialogOpen(true)}
                className="h-8 border-dashed border-white/25 bg-transparent text-white/70 hover:text-white text-xs"
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> New association
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Unaffiliated tray */}
      <div
        onDragOver={(e) => {
          if (!dragId) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (!trayOver) setTrayOver(true);
        }}
        onDragLeave={() => setTrayOver(false)}
        onDrop={(e) => {
          if (!dragId) return;
          e.preventDefault();
          const childId = e.dataTransfer.getData("text/plain") || dragId;
          setTrayOver(false);
          setDragId(null);
          onDrop(childId, unaffiliateTarget);
        }}
        className={`rounded-lg border border-dashed p-3 transition-colors ${
          trayOver ? "border-primary/70 bg-primary/15" : "border-white/15 bg-white/[0.03]"
        }`}
      >
        <div className="flex items-center gap-2 mb-2">
          <Building2 className="w-3.5 h-3.5 text-white/45" />
          <span className="text-xs font-medium text-white/80">Unaffiliated clubs</span>
          <Badge variant="outline" className="text-[10px] border-white/20 text-white/55">
            {unaffiliatedClubs.length}
          </Badge>
          <span className="text-[10px] text-white/35 ml-auto">
            Drag a club onto an association above to affiliate it — drop it back here to unaffiliate.
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {unaffiliatedClubs.length === 0 ? (
            <p className="text-[11px] text-white/35">Every club is affiliated.</p>
          ) : (
            unaffiliatedClubs.map((c) => (
              <ClubChip key={c.id} club={c} dragId={dragId} setDragId={setDragId} />
            ))
          )}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New association</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Association name (e.g. Western Province Squash)"
            />
            <Input
              value={abbr}
              onChange={(e) => setAbbr(e.target.value)}
              placeholder="Abbreviation (optional, e.g. WPS)"
            />
            <p className="text-[11px] text-muted-foreground">
              Created directly under {federation.name}. Drag clubs into it afterwards.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!name.trim() || creating}
              onClick={() => {
                onCreateAssociation({ name, abbreviation: abbr, parentId: federation.id });
                setName("");
                setAbbr("");
                setDialogOpen(false);
              }}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
