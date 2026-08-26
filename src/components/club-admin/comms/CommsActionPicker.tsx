import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COMMS_ACTIONS, COMMS_ACTION_MAP, resolveAction, type CommsAction } from "@/lib/comms/actions";

/**
 * Templates/campaigns store a logical ACTION KEY, never a raw URL. The picker
 * shows admins what the member will land on, per channel.
 */
export function CommsActionPicker({
  value,
  onChange,
  clubSubdomain,
}: {
  value: CommsAction;
  onChange: (a: CommsAction) => void;
  clubSubdomain?: string | null;
}) {
  const def = COMMS_ACTION_MAP[value?.key || "none"];
  const resolved = resolveAction(value, { clubSubdomain });
  const groups = Array.from(new Set(COMMS_ACTIONS.map((a) => a.group)));

  return (
    <div className="space-y-2">
      <div>
        <Label className="text-xs">Call to action</Label>
        <Select
          value={value?.key || "none"}
          onValueChange={(key) => onChange({ key, label: "", params: {} })}
        >
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {groups.map((g) => (
              <SelectGroup key={g}>
                <SelectLabel className="text-[11px]">{g}</SelectLabel>
                {COMMS_ACTIONS.filter((a) => a.group === g).map((a) => (
                  <SelectItem key={a.key} value={a.key}>{a.label}</SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      {def?.requiredParams?.map((p) => (
        <div key={p}>
          <Label className="text-xs capitalize">{p.replace(/_/g, " ")}</Label>
          <Input
            className="h-9"
            value={value?.params?.[p] ?? ""}
            onChange={(e) => onChange({ ...value, params: { ...(value.params ?? {}), [p]: e.target.value } })}
            placeholder={p === "url" ? "https://…" : "Paste the id"}
          />
        </div>
      ))}

      {value?.key && value.key !== "none" && (
        <>
          <div>
            <Label className="text-xs">Button wording (optional)</Label>
            <Input
              className="h-9"
              value={value.label ?? ""}
              onChange={(e) => onChange({ ...value, label: e.target.value })}
              placeholder={def?.defaultLabel}
            />
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            In-app opens <code className="text-foreground">{resolved.appPath || "—"}</code>; email and WhatsApp use{" "}
            <code className="text-foreground break-all">{resolved.webUrl || "—"}</code>. Routes are resolved by the
            action registry, so templates keep working if a route changes.
          </p>
        </>
      )}
    </div>
  );
}
