import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import {
  CAPABILITY_LIST,
  CAPABILITY_META,
  DEFAULT_CAPABILITIES,
  GROUP_LABELS,
  type Capability,
  type CapabilityGroup,
  withDependencies,
} from "@/lib/capabilities";
import { useApplyQuickSetup, useCapabilities } from "@/hooks/use-club-capabilities";

interface Props {
  clubId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const GROUP_ORDER: CapabilityGroup[] = ["facilities", "money", "competition", "community"];

/**
 * First-run wizard: plain club-admin questions, one screen per group.
 * Dependencies are resolved automatically when the answers are applied.
 */
export function QuickSetupWizard({ clubId, open, onOpenChange }: Props) {
  const { enabled } = useCapabilities(clubId);
  const apply = useApplyQuickSetup(clubId);
  const [step, setStep] = useState(0);
  const [chosen, setChosen] = useState<Set<Capability>>(new Set());

  useEffect(() => {
    if (!open) return;
    setStep(0);
    const seed = new Set<Capability>(
      CAPABILITY_LIST.filter((c) => enabled.has(c.slug)).map((c) => c.slug)
    );
    setChosen(seed.size ? seed : new Set(DEFAULT_CAPABILITIES));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const group = GROUP_ORDER[step];
  const items = CAPABILITY_LIST.filter((c) => c.group === group);
  const isLast = step === GROUP_ORDER.length - 1;

  const toggle = (slug: Capability, on: boolean) => {
    setChosen((prev) => {
      const next = new Set(prev);
      if (on) next.add(slug);
      else {
        next.delete(slug);
        // drop anything that requires it
        CAPABILITY_LIST.forEach((m) => {
          if (m.requires.includes(slug)) next.delete(m.slug);
        });
      }
      return next;
    });
  };

  const finish = async () => {
    try {
      const applied = await apply.mutateAsync([...chosen]);
      toast({
        title: "Setup saved",
        description: `${applied.length} features switched on. You can change these any time under Features.`,
      });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Could not save setup", description: e.message, variant: "destructive" });
    }
  };

  // Preview of what will actually be turned on (chosen + dependencies)
  const resolved = new Set<Capability>();
  chosen.forEach((c) => withDependencies(c, resolved));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Quick Setup — {GROUP_LABELS[group]}</DialogTitle>
          <DialogDescription>
            Answer yes only for what your club does today. Everything else stays hidden and can be
            added later under Features.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1">
          {items.map((meta) => {
            const auto = !chosen.has(meta.slug) && resolved.has(meta.slug);
            return (
              <div
                key={meta.slug}
                className="flex items-start justify-between gap-3 rounded-lg border border-border p-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{meta.question}</span>
                    {auto && (
                      <Badge variant="outline" className="h-5 text-[10px]">
                        Needed by another choice
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{meta.description}</p>
                </div>
                <Switch
                  checked={chosen.has(meta.slug) || auto}
                  onCheckedChange={(v) => toggle(meta.slug, v)}
                />
              </div>
            );
          })}
        </div>

        <p className="text-[11px] text-muted-foreground">
          Will be switched on:{" "}
          {[...resolved].map((c) => CAPABILITY_META[c].label).join(", ") || "nothing yet"}
        </p>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={apply.isPending}>
            Skip for now
          </Button>
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={apply.isPending}>
              Back
            </Button>
          )}
          {isLast ? (
            <Button onClick={finish} disabled={apply.isPending}>
              {apply.isPending ? "Saving..." : "Finish"}
            </Button>
          ) : (
            <Button onClick={() => setStep((s) => s + 1)}>Next</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
