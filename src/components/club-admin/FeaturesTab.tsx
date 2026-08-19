import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import {
  CAPABILITY_LIST,
  CAPABILITY_META,
  GROUP_LABELS,
  type Capability,
  type CapabilityGroup,
  type ModuleState,
  dependentsOf,
  withDependencies,
} from "@/lib/capabilities";
import { useCapabilities, useSetCapability } from "@/hooks/use-club-capabilities";
import { useSetupStatus } from "@/hooks/use-setup-status";
import { Sparkles } from "lucide-react";
import { QuickSetupWizard } from "@/components/club-admin/setup/QuickSetupWizard";

const STATE_STYLES: Record<ModuleState, string> = {
  off: "border-border text-muted-foreground",
  needs_setup: "border-amber-500/40 text-amber-700 dark:text-amber-400",
  ready: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
};
const STATE_LABEL: Record<ModuleState, string> = {
  off: "Off",
  needs_setup: "On — needs setup",
  ready: "On — ready",
};

interface Props {
  clubId: string;
  club?: any;
}

export function FeaturesTab({ clubId, club }: Props) {
  const { enabled } = useCapabilities(clubId);
  const setupStatus = useSetupStatus(clubId, club) as any;
  const setCap = useSetCapability(clubId);
  const [confirmOff, setConfirmOff] = useState<Capability | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const grouped = useMemo(() => {
    const g: Record<CapabilityGroup, typeof CAPABILITY_LIST> = {
      facilities: [],
      money: [],
      competition: [],
      community: [],
    };
    CAPABILITY_LIST.forEach((c) => g[c.group].push(c));
    return g;
  }, []);

  const toggle = async (slug: Capability, next: boolean) => {
    if (!next) {
      const breaks = dependentsOf(slug, enabled);
      if (breaks.length > 0) {
        setConfirmOff(slug);
        return;
      }
    }
    await apply(slug, next);
  };

  const apply = async (slug: Capability, next: boolean) => {
    try {
      const changed = await setCap.mutateAsync({ slug, enabled: next });
      const extra = changed.filter((c) => c !== slug);
      toast({
        title: `${CAPABILITY_META[slug].label} ${next ? "enabled" : "turned off"}`,
        description: extra.length
          ? `Also ${next ? "enabled" : "turned off"}: ${extra
              .map((c) => CAPABILITY_META[c].label)
              .join(", ")}`
          : next
          ? "Its setup pages are now available."
          : "Existing data and settings are kept — nothing was deleted.",
      });
    } catch (e: any) {
      toast({ title: "Could not update feature", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4 mt-3">
      <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-sm">Manage Features</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            Switch on only what your club actually does. Anything switched off is hidden from the
            admin, the app menus and members — settings and history are always kept.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setWizardOpen(true)}>
          <Sparkles className="w-3.5 h-3.5 mr-1" /> Quick Setup
        </Button>
      </Card>

      {(Object.keys(grouped) as CapabilityGroup[]).map((group) => (
        <Card key={group} className="p-4 space-y-3">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {GROUP_LABELS[group]}
          </h4>
          <div className="space-y-2.5">
            {grouped[group].map((meta) => {
              const state = moduleState(meta.slug, enabled, setupStatus);
              const needs = meta.requires.filter((r) => !enabled.has(r));
              return (
                <div
                  key={meta.slug}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border p-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{meta.label}</span>
                      <Badge variant="outline" className={`h-5 text-[10px] ${STATE_STYLES[state]}`}>
                        {STATE_LABEL[state]}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{meta.description}</p>
                    {needs.length > 0 && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Turning this on also enables:{" "}
                        {needs.map((r) => CAPABILITY_META[r].label).join(", ")}
                      </p>
                    )}
                  </div>
                  <Switch
                    checked={enabled.has(meta.slug)}
                    disabled={setCap.isPending}
                    onCheckedChange={(v) => toggle(meta.slug, v)}
                  />
                </div>
              );
            })}
          </div>
        </Card>
      ))}

      <AlertDialog open={!!confirmOff} onOpenChange={(o) => !o && setConfirmOff(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Turn off {confirmOff ? CAPABILITY_META[confirmOff].label : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              These features depend on it and will also be switched off:{" "}
              {confirmOff
                ? dependentsOf(confirmOff, enabled)
                    .map((c) => CAPABILITY_META[c].label)
                    .join(", ")
                : ""}
              . Nothing is deleted — all settings, records and history stay in place and can be
              switched back on at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmOff) apply(confirmOff, false);
                setConfirmOff(null);
              }}
            >
              Turn off
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <QuickSetupWizard clubId={clubId} open={wizardOpen} onOpenChange={setWizardOpen} />
    </div>
  );
}

export { withDependencies };
